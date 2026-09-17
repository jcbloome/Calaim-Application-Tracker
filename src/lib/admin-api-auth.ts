import { NextRequest } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

type AdminApiAuthOptions = {
  requireSuperAdmin?: boolean;
  requireTwoFactor?: boolean;
  /** Allow users flagged canAccessIlsPackagePortal (Veronica limited portal). */
  allowIlsPackagePortal?: boolean;
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

async function hasActiveTwoFactorSession(
  adminDb: any,
  uid: string,
  email?: string
): Promise<boolean> {
  const emailKey = String(email || '')
    .trim()
    .toLowerCase();
  const [userByUid, userByEmail] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    emailKey ? adminDb.collection('users').doc(emailKey).get() : Promise.resolve({ exists: false } as any),
  ]);
  const candidates = [userByUid, userByEmail].filter((snap) => snap?.exists);
  for (const snap of candidates) {
    const userData = snap.data() as Record<string, unknown> | null;
    if (!userData) continue;
    if (!Boolean(userData['2faVerified'])) continue;
    const expiryDate = toDate(userData['2faSessionExpiry']);
    if (!expiryDate) continue;
    if (expiryDate.getTime() > Date.now()) return true;
  }
  return false;
}

async function requireAdminApiAuthFromToken(
  idToken: string,
  options?: AdminApiAuthOptions
): Promise<AdminApiAuthResult> {
  const requireSuperAdmin = Boolean(options?.requireSuperAdmin);
  const requireTwoFactor = options?.requireTwoFactor !== false;
  const allowIlsPackagePortal = Boolean(options?.allowIlsPackagePortal);

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
    const [adminRole, superAdminRole, userByUid, userByEmail] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
      adminDb.collection('users').doc(uid).get(),
      email ? adminDb.collection('users').doc(email).get() : Promise.resolve({ exists: false } as any),
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

    // Staff flagged for Full Tools menu may call Tools APIs without roles_admin.
    if (!isAdmin && !requireSuperAdmin) {
      const userData = userByUid.exists
        ? (userByUid.data() as Record<string, unknown>)
        : userByEmail.exists
          ? (userByEmail.data() as Record<string, unknown>)
          : null;
      if (Boolean(userData?.canAccessAllTools)) {
        isAdmin = true;
      }
      if (allowIlsPackagePortal && Boolean(userData?.canAccessIlsPackagePortal || userData?.isIlsStaff)) {
        isAdmin = true;
      }
    }
  }

  if (!isAdmin) {
    return { ok: false, status: 403, error: 'Admin privileges required' };
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return { ok: false, status: 403, error: 'Super Admin privileges required' };
  }

  if (requireTwoFactor) {
    const has2FA = await hasActiveTwoFactorSession(adminDb, uid, email);
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
