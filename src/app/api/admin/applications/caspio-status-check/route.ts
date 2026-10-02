import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import {
  buildApplicationStatusPatch,
  buildStatusChangeEvents,
  fetchCaspioMemberStatuses,
  getApplicationClientId2,
} from '@/lib/application-caspio-status-check';
import { writeChangeEvents } from '@/lib/global-change-log-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const APPLICATION_DOC_PATH = /^(users\/[^/]+\/)?applications\/[^/]+$/;

/** "Check Caspio now" for one application: live Caspio lookup, then update Kaiser/CalAIM status if different. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    const adminDb = authz.adminDb as any;

    const body = (await request.json().catch(() => ({}))) as { docPath?: string };
    const docPath = clean(body.docPath);
    if (!APPLICATION_DOC_PATH.test(docPath)) {
      return NextResponse.json({ success: false, error: 'A valid application path is required.' }, { status: 400 });
    }

    const ref = adminDb.doc(docPath);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }
    const app = (snap.data() || {}) as Record<string, any>;
    const clientId2 = getApplicationClientId2(app);
    if (!clientId2) {
      return NextResponse.json(
        { success: false, error: 'This application has no Client_ID2 yet — push it to Caspio first.' },
        { status: 400 }
      );
    }

    const config = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(config);
    const caspio = await fetchCaspioMemberStatuses({ baseUrl: config.restBaseUrl, token, clientId2 });
    if (!caspio.found) {
      return NextResponse.json(
        { success: false, error: `Client_ID2 ${clientId2} was not found in Caspio CalAIM_tbl_Members.` },
        { status: 404 }
      );
    }

    const statuses = { kaiserStatus: caspio.kaiserStatus, calaimStatus: caspio.calaimStatus };
    const result = buildApplicationStatusPatch({
      app,
      caspio: statuses,
      source: 'manual_caspio_status_check',
      respectManualLock: false,
    });
    const checkedAtIso = new Date().toISOString();
    await ref.set({ ...result.patch, caspioStatusCheckedAt: checkedAtIso }, { merge: true });

    // Keep the members cache current too, so the page's live cache listener doesn't flip it back.
    await adminDb
      .collection('caspio_members_cache')
      .doc(clientId2)
      .set(
        {
          ...(statuses.kaiserStatus ? { Kaiser_Status: statuses.kaiserStatus } : {}),
          ...(statuses.calaimStatus ? { CalAIM_Status: statuses.calaimStatus, caspioCalAIMStatus: statuses.calaimStatus } : {}),
        },
        { merge: true }
      )
      .catch(() => undefined);

    if (result.kaiser || result.calaim) {
      const parts = docPath.split('/');
      await writeChangeEvents(
        buildStatusChangeEvents(
          [
            {
              docPath,
              applicationId: parts[parts.length - 1],
              clientId2,
              memberName:
                `${clean(app.memberLastName)}, ${clean(app.memberFirstName)}`.replace(/^,\s*/, '').replace(/,\s*$/, ''),
              memberMrn: clean(app.memberMrn),
              kaiser: result.kaiser,
              calaim: result.calaim,
            },
          ],
          { source: 'manual_caspio_status_check', staffName: authz.name || authz.email, staffEmail: authz.email }
        ),
        { adminDb }
      );
    }

    return NextResponse.json({
      success: true,
      clientId2,
      caspio: statuses,
      kaiser: result.kaiser || null,
      calaim: result.calaim || null,
      patch: result.patch,
      checkedAtIso,
    });
  } catch (error: any) {
    console.error('Application Caspio status check failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Caspio status check failed') },
      { status: 500 }
    );
  }
}
