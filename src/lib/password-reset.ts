import { NextRequest } from 'next/server';
import { Resend } from 'resend';
import { renderAsync } from '@react-email/render';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import admin, { adminAuth, adminDb } from '@/firebase-admin';
import crypto from 'crypto';
import { resetTokenStore } from '@/lib/reset-tokens';
import {
  ensureSocialWorkerAuthUser,
  findActiveSocialWorkerByEmail,
} from '@/lib/sw-auth-provision';
import { DEFAULT_APP_BASE_URL, resolveAppBaseUrl } from '@/lib/app-urls';

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

/**
 * Email links must never point at localhost — recipients open them on their own devices.
 * Prefer NEXT_PUBLIC_APP_URL / production default; strip any localhost host.
 */
const getBaseUrl = (request: NextRequest) => {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const requestHost = request.headers.get('host');
  const requestOrigin = forwardedHost
    ? `${forwardedProto || 'https'}://${forwardedHost}`
    : requestHost
      ? `${forwardedProto || (requestHost.includes('localhost') ? 'http' : 'https')}://${requestHost}`
      : '';

  const canonical = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  // Always resolve through resolveAppBaseUrl so localhost → production default.
  const resolved = resolveAppBaseUrl(canonical || requestOrigin || DEFAULT_APP_BASE_URL);
  return resolved.replace(/\/$/, '') || DEFAULT_APP_BASE_URL;
};

const isLocalBaseUrl = (baseUrl: string) => {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  } catch {
    return false;
  }
};

const resolveRole = async (email: string, role?: string) => {
  // If the caller provides an explicit role, treat it as authoritative.
  if (role === 'sw') return 'sw';
  if (role === 'user') return 'user';
  if (role === 'admin') return 'admin';

  let resolvedRole: 'sw' | 'user' | 'admin' = 'user';
  if (resolvedRole !== 'sw') {
    try {
      const swSnapshot = await adminDb
        .collection('socialWorkers')
        .where('email', '==', email)
        .limit(1)
        .get();
      if (!swSnapshot.empty) {
        resolvedRole = 'sw';
      }
    } catch (roleError) {
      console.warn('⚠️ Failed to determine user role from Firestore:', roleError);
    }
  }
  return resolvedRole;
};

const buildResetUrl = async (baseUrl: string, email: string, role: 'sw' | 'user' | 'admin') => {
  try {
    // Use our custom token flow (Resend email + /reset-password?token=...).
    // This avoids Firebase Auth "email action link" generation (IdentityToolkit/serviceusage),
    // which can fail in production depending on runtime IAM.
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour

    resetTokenStore.set(token, { email, expires });

    // Persist whenever the email link is not localhost so multi-instance / real devices can validate.
    if (!isLocalBaseUrl(baseUrl)) {
      try {
        await adminDb.collection('passwordResetTokens').doc(token).set(
          {
            email,
            expires,
            role,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        // If Firestore write fails, the in-memory token still works for single-instance runtimes,
        // but multi-instance production may fail to validate later. Surface a clear error.
        throw new Error('Password reset is temporarily unavailable (token storage failed). Please try again.');
      }
    }

    // SW / RN portal users land on the same reset form with role=sw (then /sw-login).
    const resetPath = '/reset-password';
    return `${baseUrl}${resetPath}?token=${encodeURIComponent(token)}&role=${encodeURIComponent(String(role))}`;
  } catch (error: any) {
    const message = error?.message || 'Failed to generate password reset link';
    throw new Error(message);
  }
};

export const sendPasswordResetEmail = async (request: NextRequest, email: string, role?: string) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: 400, body: { error: 'Email is required' } };
  }

  // Fail fast if there is no Firebase Auth account for this email.
  // Exception: active portal SWs may need first-time account creation before setup email.
  try {
    await adminAuth.getUserByEmail(normalizedEmail);
  } catch (error: any) {
    if (String(error?.code || '').trim() === 'auth/user-not-found') {
      const activeSw = await findActiveSocialWorkerByEmail(normalizedEmail);
      if (!activeSw) {
        return {
          status: 404,
          body: { error: 'No account found for this email. Ask an admin to turn on Portal access first.' },
        };
      }
      await ensureSocialWorkerAuthUser({
        email: normalizedEmail,
        displayName: String(activeSw.data.displayName || activeSw.data.name || '').trim(),
        swId: String(activeSw.data.sw_id || activeSw.data.SW_ID || '').trim(),
        county: String(activeSw.data.county || '').trim(),
        createdBy: 'password-reset-first-login',
        activatePortal: true,
      });
    } else {
      throw error;
    }
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      status: 500,
      body: { error: 'Email service not configured. Please check server configuration.' }
    };
  }

  const resolvedRole = await resolveRole(normalizedEmail, role);
  const baseUrl = getBaseUrl(request);
  const resetUrl = await buildResetUrl(baseUrl, normalizedEmail, resolvedRole);

  const emailHtml = await renderAsync(PasswordResetEmail({
    resetUrl,
    userEmail: normalizedEmail,
  }));

  const subject = 'Reset Your Connections CalAIM Application Portal Password';
  const from = 'Connections CalAIM Application Portal <noreply@carehomefinders.com>';
  const logBase = {
    template: 'password_reset',
    source: 'sendPasswordResetEmail',
    to: [normalizedEmail],
    subject,
    metadata: { role: resolvedRole },
  };

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: normalizedEmail,
      subject,
      html: emailHtml,
    });

    if (error) {
      const message = String((error as any)?.message || 'Unknown Resend error');
      try {
        await adminDb.collection('emailLogs').add({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failure',
          ...logBase,
          from,
          provider: 'resend',
          providerMessageId: null,
          errorMessage: message,
        });
      } catch {
        // ignore log failures
      }
      return { status: 500, body: { error: message } };
    }

    const providerMessageId = (data as any)?.id ? String((data as any).id) : null;
    try {
      await adminDb.collection('emailLogs').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'success',
        ...logBase,
        from,
        provider: 'resend',
        providerMessageId,
        errorMessage: null,
      });
    } catch {
      // ignore log failures
    }

    return {
      status: 200,
      body: {
        message: 'Password reset email sent! Check your inbox for the reset link.',
        role: resolvedRole,
        providerMessageId,
      },
    };
  } catch (sendError: any) {
    const message = String(sendError?.message || 'Failed to send password reset email');
    try {
      await adminDb.collection('emailLogs').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'failure',
        ...logBase,
        from,
        provider: 'resend',
        providerMessageId: null,
        errorMessage: message,
      });
    } catch {
      // ignore log failures
    }
    return { status: 500, body: { error: message } };
  }
};
