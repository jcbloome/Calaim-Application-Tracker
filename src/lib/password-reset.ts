import { NextRequest } from 'next/server';
import { Resend } from 'resend';
import { renderAsync } from '@react-email/render';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import admin, { adminDb } from '@/firebase-admin';
import crypto from 'crypto';
import { resetTokenStore } from '@/lib/reset-tokens';

const resend = new Resend(process.env.RESEND_API_KEY);

const getBaseUrl = (request: NextRequest) => {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const requestHost = request.headers.get('host');
  const requestOrigin = forwardedHost
    ? `${forwardedProto || 'https'}://${forwardedHost}`
    : requestHost
      ? `${forwardedProto || 'https'}://${requestHost}`
      : '';

  // In production, prefer the canonical app URL over request headers.
  // Proxies / preview domains can produce a host that isn't authorized in Firebase Auth action links.
  const canonical = process.env.NEXT_PUBLIC_APP_URL;
  let baseUrl =
    process.env.NODE_ENV !== 'development' && canonical
      ? canonical
      : requestOrigin || canonical || 'http://localhost:3000';
  if (baseUrl.includes(',')) {
    baseUrl = baseUrl.split(',')[0].trim();
  }
  baseUrl = baseUrl.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'development') {
    baseUrl = 'http://localhost:3000';
  }
  return baseUrl;
};

const resolveRole = async (email: string, role?: string) => {
  // If the caller provides an explicit role, treat it as authoritative.
  if (role === 'sw') return 'sw';
  if (role === 'user') return 'user';

  let resolvedRole: 'sw' | 'user' = 'user';
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

const buildResetUrl = async (baseUrl: string, email: string, role: 'sw' | 'user') => {
  try {
    // Use our custom token flow (Resend email + /reset-password?token=...).
    // This avoids Firebase Auth "email action link" generation (IdentityToolkit/serviceusage),
    // which can fail in production depending on runtime IAM.
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour

    resetTokenStore.set(token, { email, expires });

    if (process.env.NODE_ENV !== 'development') {
      try {
        await adminDb.collection('passwordResetTokens').doc(token).set(
          {
            email,
            expires,
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

    const resetPath = '/reset-password';
    return `${baseUrl}${resetPath}?token=${encodeURIComponent(token)}&role=${encodeURIComponent(role)}`;
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

  if (!process.env.RESEND_API_KEY) {
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

  await resend.emails.send({
    from: 'Connections CalAIM Application Portal <noreply@carehomefinders.com>',
    to: normalizedEmail,
    subject: 'Reset Your Connections CalAIM Application Portal Password',
    html: emailHtml,
  });

  return {
    status: 200,
    body: {
      message: 'Password reset email sent! Check your inbox for the reset link.',
      role: resolvedRole
    }
  };
};
