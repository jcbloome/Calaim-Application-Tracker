import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isCsSummaryFormName } from '@/lib/review-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

function markFormCleared(form: any, reviewerName: string, reviewerUid: string, reviewedAt: string) {
  return {
    ...form,
    acknowledged: true,
    acknowledgedBy: reviewerName,
    acknowledgedByUid: reviewerUid,
    acknowledgedDate: reviewedAt,
    reviewed: true,
    reviewedAt,
    reviewedByName: reviewerName,
    reviewedByEmail: reviewerName,
  };
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: false, requireTwoFactor: true });
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const applicationId = clean(body.applicationId);
    const appUserId = clean(body.appUserId);
    const appPath = clean(body.appPath);
    const formName = clean(body.formName);
    const formIndex = Number(body.formIndex);
    const kind = clean(body.kind).toLowerCase();
    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'Application ID is required.' }, { status: 400 });
    }

    const refs = new Map<string, any>();
    const addRef = (ref: any) => {
      if (ref?.path) refs.set(ref.path, ref);
    };
    if (appPath && !appPath.includes('..')) addRef(adminCheck.adminDb.doc(appPath));
    addRef(adminCheck.adminDb.collection('applications').doc(applicationId));
    if (appUserId) {
      addRef(adminCheck.adminDb.collection('users').doc(appUserId).collection('applications').doc(applicationId));
    }

    const reviewerName = clean(adminCheck.name || adminCheck.email) || 'Staff';
    const reviewedAt = new Date().toISOString();
    let updated = 0;

    for (const ref of refs.values()) {
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data() as any;
      const forms = Array.isArray(data?.forms) ? [...data.forms] : [];
      let index = Number.isInteger(formIndex) && formIndex >= 0 && formIndex < forms.length ? formIndex : -1;
      if (formName) {
        const byName = forms.findIndex((form: any) => clean(form?.name).toLowerCase() === formName.toLowerCase());
        if (byName >= 0) index = byName;
      }
      if (kind === 'cs' && index < 0) {
        index = forms.findIndex((form: any) => isCsSummaryFormName(form?.name));
      }
      if (index < 0) continue;
      forms[index] = markFormCleared(forms[index], reviewerName, adminCheck.uid, reviewedAt);
      const patch: Record<string, unknown> = { forms };
      if (kind === 'cs' || isCsSummaryFormName(forms[index]?.name)) {
        patch.applicationChecked = true;
        patch.applicationCheckedAt = reviewedAt;
        patch.applicationCheckedByName = reviewerName;
      }
      await ref.set(patch, { merge: true });
      updated += 1;
    }

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Could not find that review item to clear.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to clear review item.') },
      { status: 500 }
    );
  }
}
