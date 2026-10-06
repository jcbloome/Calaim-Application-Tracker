import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isSocialWorkerPortalActive } from '@/lib/sw-auth-provision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 220) => String(v ?? '').trim().slice(0, max);

/** Admin: is this SW/RN email (or SW_ID) an active portal account? */
export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const email = clean(request.nextUrl.searchParams.get('email'), 220).toLowerCase();
  const swId = clean(request.nextUrl.searchParams.get('swId'), 80);
  if (!email && !swId) {
    return NextResponse.json({ success: false, error: 'email or swId is required' }, { status: 400 });
  }

  try {
    const result = await isSocialWorkerPortalActive({ email, swId });
    return NextResponse.json({
      success: true,
      active: result.active,
      email: result.matchedEmail || email,
      matchedBy: result.matchedBy || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Portal check failed') },
      { status: 500 }
    );
  }
}
