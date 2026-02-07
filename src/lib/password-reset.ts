import { NextRequest } from 'next/server';
import { Resend } from 'resend';
import { renderAsync } from '@react-email/render';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import admin, { adminDb } from '@/firebase-admin';

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

  let baseUrl = requestOrigin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
  let resolvedRole: 'sw' | 'user' = role === 'sw' ? 'sw' : 'user';
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

const buildResetUrl = async (baseUrl: string, email: string) => {
  const serverKey = process.env.FIREBASE_API_KEY;
  const publicKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const firebaseApiKey = serverKey || publicKey;
  const keySource = serverKey ? 'FIREBASE_API_KEY' : publicKey ? 'NEXT_PUBLIC_FIREBASE_API_KEY' : 'missing';
  const keySuffix = firebaseApiKey ? firebaseApiKey.slice(-6) : 'none';

  if (!firebaseApiKey) {
    throw new Error('Missing Firebase API key for password reset.');
  }

  try {
    const oobResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email,
          returnOobLink: true
        })
      }
    );

    const oobData = await oobResponse.json();
    if (!oobResponse.ok) {
      const baseMessage = oobData?.error?.message || 'Failed to request Firebase reset code';
      if (process.env.NODE_ENV === 'development') {
        throw new Error(`${baseMessage} (key: ${keySource}, …${keySuffix})`);
      }
      throw new Error(baseMessage);
    }

    const oobLink = oobData?.oobLink as string | undefined;
    const oobCode =
      oobData?.oobCode ||
      (oobLink ? new URL(oobLink).searchParams.get('oobCode') : null);

    if (!oobCode) {
      throw new Error('Missing oobCode in Firebase response');
    }

    const resetPath = '/reset-password';
    return `${baseUrl}${resetPath}?oobCode=${encodeURIComponent(oobCode)}`;
  } catch (error: any) {
    // Fallback to Admin SDK if Identity Toolkit fails
    try {
      const adminLink = await admin.auth().generatePasswordResetLink(email, {
        url: `${baseUrl}/reset-password`,
        handleCodeInApp: true,
      });
      const adminCode = new URL(adminLink).searchParams.get('oobCode');
      if (adminCode) {
        return `${baseUrl}/reset-password?oobCode=${encodeURIComponent(adminCode)}`;
      }
      return adminLink;
    } catch (adminError: any) {
      const baseMessage = error?.message || 'Failed to request Firebase reset code';
      if (process.env.NODE_ENV === 'development') {
        const adminMessage = adminError?.message || 'Admin SDK reset link failed';
        throw new Error(`${baseMessage} | ${adminMessage} (key: ${keySource}, …${keySuffix})`);
      }
      throw error;
    }
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
  const resetUrl = await buildResetUrl(baseUrl, normalizedEmail);

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
