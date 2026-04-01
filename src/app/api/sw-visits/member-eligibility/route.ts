import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayKey = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const toLocalDate = (day: string): Date | null => {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
};

type EligibilityRow = {
  memberId: string;
  eligible: boolean;
  blockedReason: 'within_30_days' | null;
  lastSubmittedDate: string | null;
  nextEligibleDate: string | null;
  daysRemaining: number;
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      memberIds?: string[];
      targetDate?: string;
    };
    const memberIds = Array.isArray(body?.memberIds)
      ? Array.from(new Set(body.memberIds.map((x) => String(x || '').trim()).filter(Boolean)))
      : [];
    if (memberIds.length === 0) {
      return NextResponse.json({ success: true, targetDate: null, byMemberId: {} as Record<string, EligibilityRow> });
    }

    const targetDate = toDayKey(body?.targetDate || new Date().toISOString().slice(0, 10));
    if (!targetDate) {
      return NextResponse.json({ success: false, error: 'targetDate must be YYYY-MM-DD' }, { status: 400 });
    }
    const targetLocal = toLocalDate(targetDate);
    if (!targetLocal) {
      return NextResponse.json({ success: false, error: 'targetDate must be YYYY-MM-DD' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;
    await adminAuth.verifyIdToken(idToken);

    const refs = memberIds
      .slice(0, 1000)
      .map((memberId) => adminDb.collection('sw_member_last_submitted_visit').doc(String(memberId)));
    const snaps = refs.length > 0 ? await adminDb.getAll(...refs) : [];

    const byMemberId: Record<string, EligibilityRow> = {};
    for (let i = 0; i < snaps.length; i += 1) {
      const snap = snaps[i];
      const memberId = memberIds[i];
      const row = snap?.exists ? ((snap.data() as any) || {}) : {};
      const lastSubmittedDate = toDayKey(row?.lastSubmittedDate || '');
      if (!lastSubmittedDate) {
        byMemberId[memberId] = {
          memberId,
          eligible: true,
          blockedReason: null,
          lastSubmittedDate: null,
          nextEligibleDate: null,
          daysRemaining: 0,
        };
        continue;
      }

      const lastLocal = toLocalDate(lastSubmittedDate);
      if (!lastLocal) {
        byMemberId[memberId] = {
          memberId,
          eligible: true,
          blockedReason: null,
          lastSubmittedDate: null,
          nextEligibleDate: null,
          daysRemaining: 0,
        };
        continue;
      }

      const daysApart = Math.floor((targetLocal.getTime() - lastLocal.getTime()) / DAY_MS);
      const blocked = Number.isFinite(daysApart) && daysApart >= 0 && daysApart < 30;
      const nextEligibleLocal = new Date(lastLocal.getTime() + 30 * DAY_MS);
      const nextEligibleDate = `${nextEligibleLocal.getFullYear()}-${String(nextEligibleLocal.getMonth() + 1).padStart(2, '0')}-${String(
        nextEligibleLocal.getDate()
      ).padStart(2, '0')}`;
      byMemberId[memberId] = {
        memberId,
        eligible: !blocked,
        blockedReason: blocked ? 'within_30_days' : null,
        lastSubmittedDate,
        nextEligibleDate: blocked ? nextEligibleDate : null,
        daysRemaining: blocked ? Math.max(0, 30 - Math.max(0, daysApart)) : 0,
      };
    }

    return NextResponse.json({ success: true, targetDate, byMemberId });
  } catch (error: any) {
    console.error('❌ Error checking SW member eligibility:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to check member eligibility' },
      { status: 500 }
    );
  }
}

