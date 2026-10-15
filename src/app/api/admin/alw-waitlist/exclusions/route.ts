import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import type { AlwWaitlistExclusionEntry } from '@/lib/alw-waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOC_PATH = 'admin-settings/alw-waitlist-exclusions';

function sanitizeEntries(raw: unknown): AlwWaitlistExclusionEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        mediCalNumber: String(row.mediCalNumber || '').trim(),
        clientId2: String(row.clientId2 || '').trim(),
        memberName: String(row.memberName || '').trim(),
        dateOfBirth: String(row.dateOfBirth || '').trim(),
        sourceLabel: String(row.sourceLabel || '').trim() || undefined,
      };
    })
    .filter((entry) => entry.mediCalNumber || entry.clientId2 || entry.memberName);
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const { adminDb } = await import('@/firebase-admin');
    const snap = await adminDb.doc(DOC_PATH).get();
    const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
    const entries = sanitizeEntries(data.entries);
    return NextResponse.json({
      success: true,
      entries,
      fileName: String(data.fileName || '').trim() || null,
      uploadedAtIso: String(data.uploadedAtIso || '').trim() || null,
      uploadedByEmail: String(data.uploadedByEmail || '').trim() || null,
      count: entries.length,
    });
  } catch (error: any) {
    console.error('[alw-waitlist/exclusions GET]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load exclusions.') },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || 'save').trim().toLowerCase();
    const { adminDb } = await import('@/firebase-admin');

    if (action === 'clear') {
      await adminDb.doc(DOC_PATH).set(
        {
          entries: [],
          fileName: null,
          uploadedAtIso: null,
          uploadedByEmail: authz.email || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, entries: [], count: 0 });
    }

    const entries = sanitizeEntries(body.entries);
    const fileName = String(body.fileName || '').trim() || null;
    const uploadedAtIso = new Date().toISOString();
    await adminDb.doc(DOC_PATH).set(
      {
        entries,
        fileName,
        uploadedAtIso,
        uploadedByEmail: authz.email || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      entries,
      fileName,
      uploadedAtIso,
      uploadedByEmail: authz.email || null,
      count: entries.length,
    });
  } catch (error: any) {
    console.error('[alw-waitlist/exclusions POST]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to save exclusions.') },
      { status: 500 }
    );
  }
}
