import { NextRequest } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

type AdminApiAuthOptions = {
  requireSuperAdmin?: boolean;
  requireTwoFactor?: boolean;
};

type AdminApiAuthFailure = {
  ok: false;
  status: number;
  error: string;
};

type AdminApiAuthSuccess = {
  ok: true;
  adminAuth: any;
  adminDb: any;
  uid: string;
  email: string;
  name: string;
  decodedClaims: any;
  isSuperAdmin: boolean;
};

type AdminApiAuthResult = AdminApiAuthFailure | AdminApiAuthSuccess;

function extractBearerToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function hasActiveTwoFactorSession(adminDb: any, uid: string): Promise<boolean> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  if (!userData) return false;

  if (!Boolean(userData['2faVerified'])) return false;
  const expiryDate = toDate(userData['2faSessionExpiry']);
  if (!expiryDate) return false;

  return expiryDate.getTime() > Date.now();
}

async function requireAdminApiAuthFromToken(
  idToken: string,
  options?: AdminApiAuthOptions
): Promise<AdminApiAuthResult> {
  const requireSuperAdmin = Boolean(options?.requireSuperAdmin);
  const requireTwoFactor = options?.requireTwoFactor !== false;

  const token = String(idToken || '').trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization Bearer token' };
  }

  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired auth token' };
  }

  const uid = String(decoded?.uid || '').trim();
  const email = String(decoded?.email || '').trim().toLowerCase();
  const name = String(decoded?.name || '').trim();
  if (!uid) {
    return { ok: false, status: 401, error: 'Invalid token payload' };
  }

  const hasAdminClaim = Boolean(decoded?.admin) || Boolean(decoded?.superAdmin);
  let isAdmin = hasAdminClaim || isHardcodedAdminEmail(email);
  let isSuperAdmin = Boolean(decoded?.superAdmin) || isHardcodedAdminEmail(email);

  if (!isAdmin || (requireSuperAdmin && !isSuperAdmin)) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = isAdmin || adminRole.exists || superAdminRole.exists;
    isSuperAdmin = isSuperAdmin || superAdminRole.exists;

    if (email && (!isAdmin || (requireSuperAdmin && !isSuperAdmin))) {
      const [adminRoleByEmail, superAdminRoleByEmail] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = isAdmin || adminRoleByEmail.exists || superAdminRoleByEmail.exists;
      isSuperAdmin = isSuperAdmin || superAdminRoleByEmail.exists;
    }
  }

  if (!isAdmin) {
    return { ok: false, status: 403, error: 'Admin privileges required' };
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return { ok: false, status: 403, error: 'Super Admin privileges required' };
  }

  if (requireTwoFactor) {
    const has2FA = await hasActiveTwoFactorSession(adminDb, uid);
    if (!has2FA) {
      return { ok: false, status: 403, error: 'Active two-factor authentication is required' };
    }
  }

  return { ok: true, adminAuth, adminDb, uid, email, name, decodedClaims: decoded, isSuperAdmin };
}

export async function requireAdminApiAuth(
  request: NextRequest,
  options?: AdminApiAuthOptions
): Promise<AdminApiAuthResult> {
  const idToken = extractBearerToken(request);
  return requireAdminApiAuthFromToken(idToken, options);
}

export async function requireAdminApiAuthFromIdToken(
  idToken: string,
  options?: AdminApiAuthOptions
): Promise<AdminApiAuthResult> {
  return requireAdminApiAuthFromToken(idToken, options);
}
