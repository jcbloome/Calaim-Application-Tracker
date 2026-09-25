import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';
import {
  COVER_SHEET_PACKAGE_MANAGER_EMAIL,
  COVER_SHEET_PACKAGE_MANAGER_NAME,
  coverSheetPackageAuthLabel,
  type CoverSheetPackageType,
} from '@/lib/alft-cover-sheet-package';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'alft_cover_sheet_packages';
const clean = (value: unknown, max = 400) => String(value ?? '').trim().slice(0, max);

const normalizePackageType = (value: unknown): CoverSheetPackageType =>
  String(value || '').trim().toLowerCase() === 'reassessment' ? 'reassessment' : 'initial';

function serializePackage(id: string, data: Record<string, any>) {
  const packageType = normalizePackageType(data.packageType);
  return {
    id,
    memberClientId: clean(data.memberClientId, 80),
    memberName: clean(data.memberName, 200),
    memberMrn: clean(data.memberMrn, 80),
    packageType,
    authLabel: coverSheetPackageAuthLabel(packageType),
    placementType: clean(data.placementType, 20) || 'rcfe',
    status: clean(data.status, 40),
    sentAt: clean(data.sentAtIso) || '',
    sentSubject: clean(data.sentSubject, 400),
    docs: data.docs || {},
    veronicaDecision: clean(data.veronicaDecision, 40) || 'pending',
    veronicaDecisionAt: clean(data.veronicaDecisionAtIso),
    veronicaDecisionNote: clean(data.veronicaDecisionNote, 2000),
    veronicaDecidedByEmail: clean(data.veronicaDecidedByEmail, 220).toLowerCase(),
    veronicaDecidedByName: clean(data.veronicaDecidedByName, 160),
  };
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, {
      requireTwoFactor: false,
      allowIlsPackagePortal: true,
    });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const packageId = clean(req.nextUrl.searchParams.get('packageId'), 120);
    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    if (packageId) {
      const snap = await adminDb.collection(COLLECTION).doc(packageId).get();
      if (!snap.exists) {
        return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, package: serializePackage(snap.id, snap.data() || {}) });
    }

    const snap = await adminDb
      .collection(COLLECTION)
      .where('status', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(limit)
      .get()
      .catch(async () =>
        adminDb.collection(COLLECTION).where('status', '==', 'sent').limit(limit).get()
      );

    const packages = snap.docs
      .map((doc) => serializePackage(doc.id, doc.data() || {}))
      .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));

    return NextResponse.json({ success: true, packages });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load packages') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, {
      requireTwoFactor: false,
      allowIlsPackagePortal: true,
    });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      packageId?: string;
      decision?: string;
      note?: string;
    };
    const packageId = clean(body.packageId, 120);
    const decisionRaw = clean(body.decision, 40).toLowerCase();
    const decision = decisionRaw === 'approved' || decisionRaw === 'approve' ? 'approved' : decisionRaw === 'rejected' || decisionRaw === 'reject' ? 'rejected' : '';
    const note = clean(body.note, 2000);

    if (!packageId) {
      return NextResponse.json({ success: false, error: 'packageId is required' }, { status: 400 });
    }
    if (!decision) {
      return NextResponse.json({ success: false, error: 'decision must be approve or reject' }, { status: 400 });
    }
    if (decision === 'rejected' && !note) {
      return NextResponse.json(
        { success: false, error: 'Please include an explanation when rejecting.' },
        { status: 400 }
      );
    }

    const pkgRef = adminDb.collection(COLLECTION).doc(packageId);
    const pkgSnap = await pkgRef.get();
    if (!pkgSnap.exists) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }
    const data = pkgSnap.data() || {};
    if (clean(data.status) !== 'sent') {
      return NextResponse.json({ success: false, error: 'Package has not been sent yet.' }, { status: 409 });
    }

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();
    const decidedByEmail = clean(authCheck.email, 220).toLowerCase();
    const decidedByName = clean(authCheck.name || authCheck.email, 160) || 'Veronica';

    await pkgRef.set(
      {
        veronicaDecision: decision,
        veronicaDecisionAt: serverTimestamp,
        veronicaDecisionAtIso: nowIso,
        veronicaDecisionNote: note || null,
        veronicaDecidedByEmail: decidedByEmail,
        veronicaDecidedByName: decidedByName,
        updatedAt: serverTimestamp,
        updatedAtIso: nowIso,
      },
      { merge: true }
    );

    // Notify John when Veronica decides (especially on reject).
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const memberName = clean(data.memberName, 200) || 'Member';
        const memberMrn = clean(data.memberMrn, 80) || 'N/A';
        const authLabel = coverSheetPackageAuthLabel(normalizePackageType(data.packageType));
        const subject =
          decision === 'approved'
            ? `ILS package approved: ${memberName} (${memberMrn})`
            : `ILS package rejected: ${memberName} (${memberMrn})`;
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
            <p>Hi ${COVER_SHEET_PACKAGE_MANAGER_NAME},</p>
            <p><strong>${decidedByName}</strong> ${decision} the ALFT cover sheet package for:</p>
            <p><strong>Member:</strong> ${memberName}<br/>
            <strong>MRN:</strong> ${memberMrn}<br/>
            <strong>Request:</strong> ${authLabel}</p>
            ${note ? `<p><strong>Explanation:</strong> ${note.replace(/</g, '&lt;')}</p>` : ''}
            <p>Thank you,<br/>${decidedByName || 'ILS Package Review'}</p>
          </div>
        `;
        await resend.emails.send({
          from: 'CalAIM Tracker <noreply@carehomefinders.com>',
          to: [COVER_SHEET_PACKAGE_MANAGER_EMAIL],
          subject,
          html,
        });
      } catch {
        // Decision is saved even if notify fails.
      }
    }

    const saved = await pkgRef.get();
    return NextResponse.json({
      success: true,
      package: serializePackage(pkgRef.id, saved.data() || {}),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to save decision') },
      { status: 500 }
    );
  }
}
