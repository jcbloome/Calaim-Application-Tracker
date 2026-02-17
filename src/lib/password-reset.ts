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

const buildResetUrl = async (baseUrl: string, email: string, role: 'sw' | 'user') => {
  try {
    // Always use Admin SDK to generate a reset link.
    // This avoids API-key-based server calls (which often fail due to key restrictions).
    const adminLink = await admin.auth().generatePasswordResetLink(email, {
      url: `${baseUrl}/reset-password`,
    });
    const adminCode = new URL(adminLink).searchParams.get('oobCode');
    if (adminCode) {
      return `${baseUrl}/reset-password?oobCode=${encodeURIComponent(adminCode)}&role=${encodeURIComponent(role)}`;
    }
    return adminLink;
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
