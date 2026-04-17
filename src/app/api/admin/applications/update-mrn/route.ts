import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export async function POST(req: NextRequest) {
  try {
    if (isCaspioWriteReadOnly()) {
      // Still allow Firestore update; Caspio write will be skipped and reported.
    }

    const body = await req.json().catch(() => ({} as any));
    const applicationId = String(body?.applicationId || '').trim();
    const userId = String(body?.userId || '').trim();
    const clientId2 = String(body?.clientId2 || body?.Client_ID2 || body?.client_ID2 || '').trim();
    const nextMrn = String(body?.memberMrn ?? '').trim();
    const reason = String(body?.reason || '').trim();

    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'applicationId is required' }, { status: 400 });
    }
    if (!nextMrn) {
      return NextResponse.json({ success: false, error: 'memberMrn is required' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const admin = adminModule.default;
    const actorUid = adminCheck.uid;
    const actorEmail = adminCheck.email;
    const actorName = adminCheck.name;

    const isAdminStored = applicationId.startsWith('admin_app_') || !userId;
    const nowIso = new Date().toISOString();

    const patch = {
      memberMrn: nextMrn,
      memberMrnUpdatedAtIso: nowIso,
      memberMrnUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      memberMrnUpdatedByUid: actorUid,
      memberMrnUpdatedByEmail: actorEmail || null,
      memberMrnUpdatedByName: actorName || null,
      memberMrnUpdatedReason: reason || null,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    const updatedPaths: string[] = [];

    if (isAdminStored) {
      await adminDb.collection('applications').doc(applicationId).set(patch, { merge: true });
      updatedPaths.push(`applications/${applicationId}`);
    } else {
      const userPath = `users/${userId}/applications/${applicationId}`;
      await adminDb.doc(userPath).set(patch, { merge: true });
      updatedPaths.push(userPath);

      // Best-effort: keep root mirror (if it exists) in sync.
      try {
        const rootRef = adminDb.collection('applications').doc(applicationId);
        const rootSnap = await rootRef.get();
        if (rootSnap.exists) {
          await rootRef.set(patch, { merge: true });
          updatedPaths.push(`applications/${applicationId}`);
        }
      } catch {
        // ignore
      }
    }

    await adminDb.collection('application_mrn_change_events').add({
      applicationId,
      userId: userId || null,
      clientId2: clientId2 || null,
      memberMrn: nextMrn,
      reason: reason || null,
      actorUid,
      actorEmail: actorEmail || null,
      actorName: actorName || null,
      createdAtIso: nowIso,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedPaths,
    });

    let caspioUpdated = false;
    let caspioSkipped = false;
    let caspioError: string | null = null;
    if (!clientId2) {
      caspioSkipped = true;
      caspioError = 'clientId2 missing; Caspio not updated';
    } else if (isCaspioWriteReadOnly()) {
      caspioSkipped = true;
      caspioError = caspioWriteBlockedResponse().error;
    } else {
      try {
        const credentials = getCaspioCredentialsFromEnv();
        const token = await getCaspioToken(credentials);
        const escapedClientId2 = clientId2.replace(/'/g, "''");
        const whereClause = `Client_ID2='${escapedClientId2}'`;
        const apiUrl = `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(whereClause)}`;

        const fieldCandidates: Array<{ label: string; updates: Record<string, string> }> = [
          { label: 'Member_MRN', updates: { Member_MRN: nextMrn } },
          { label: 'memberMrn', updates: { memberMrn: nextMrn } },
          { label: 'MRN', updates: { MRN: nextMrn } },
        ];

        let lastErr = '';
        for (const candidate of fieldCandidates) {
          const caspioRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(candidate.updates),
          });
          if (caspioRes.ok) {
            caspioUpdated = true;
            lastErr = '';
            break;
          }
          const text = await caspioRes.text().catch(() => '');
          lastErr = `${candidate.label}: ${caspioRes.status} ${text}`.slice(0, 500);
        }
        if (!caspioUpdated) {
          throw new Error(lastErr || 'Caspio MRN update failed');
        }
      } catch (e: any) {
        caspioError = String(e?.message || 'Caspio MRN update failed');
      }
    }

    // Best-effort: append Caspio outcome to the event log.
    try {
      await adminDb.collection('application_mrn_change_events').add({
        applicationId,
        userId: userId || null,
        clientId2: clientId2 || null,
        memberMrn: nextMrn,
        reason: reason || null,
        actorUid,
        actorEmail: actorEmail || null,
        actorName: actorName || null,
        createdAtIso: new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedPaths,
        caspio: {
          updated: caspioUpdated,
          skipped: caspioSkipped,
          error: caspioError,
          table: 'CalAIM_tbl_Members',
          whereField: 'Client_ID2',
        },
        kind: 'caspio_update_result',
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      applicationId,
      memberMrn: nextMrn,
      updatedPaths,
      caspio: { updated: caspioUpdated, skipped: caspioSkipped, error: caspioError },
    });
  } catch (error: any) {
    console.error('❌ Error updating MRN:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update MRN' },
      { status: 500 }
    );
  }
}

