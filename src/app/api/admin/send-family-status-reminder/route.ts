import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

let adminDb: any;
try {
  if (!getApps().length) {
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
    });
    adminDb = getFirestore(app);
  } else {
    adminDb = getFirestore();
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const ms = value.toDate().getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const clean = (value: unknown): string => String(value || '').trim();
const hasValue = (value: unknown): boolean => clean(value).length > 0;

async function resolveClientNotesUserId(params: {
  baseUrl: string;
  token: string;
  clientId2: string;
  preferredUserId?: string;
}): Promise<number> {
  const preferredNumeric = Number.parseInt(clean(params.preferredUserId), 10);
  if (Number.isFinite(preferredNumeric) && preferredNumeric > 0) return preferredNumeric;

  try {
    const q = encodeURIComponent(`Client_ID2=${clean(params.clientId2)}`);
    const url = `${params.baseUrl}/tables/connect_tbl_clientnotes/records?q.where=${q}&q.orderBy=Time_Stamp DESC&q.limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
      cache: 'no-store',
    });
    if (response.ok) {
      const json = await response.json().catch(() => ({} as any));
      const row = Array.isArray(json?.Result) ? json.Result[0] : null;
      const parsed = Number.parseInt(clean(row?.User_ID), 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // fall through to default
  }

  return 1;
}

async function syncFamilyStatusNoteToCaspioClientNotes(params: {
  clientId2: string;
  comments: string;
  preferredUserId?: string;
  assignedStaffName?: string;
}): Promise<{ success: boolean; reason: 'inserted' | 'missing-client-id2' | 'insert-failed'; error?: string }> {
  const clientId2 = clean(params.clientId2);
  if (!clientId2) {
    return { success: false, reason: 'missing-client-id2' };
  }
  const comments = clean(params.comments);
  if (!comments) {
    return { success: true, reason: 'inserted' };
  }

  try {
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    const restBaseUrl = String(credentials.baseUrl || '')
      .replace(/\/rest\/v2\/?$/i, '')
      .replace(/\/integrations\/rest\/v3\/?$/i, '')
      .replace(/\/+$/g, '')
      .concat('/integrations/rest/v3');
    const resolvedUserId = await resolveClientNotesUserId({
      baseUrl: restBaseUrl,
      token,
      clientId2,
      preferredUserId: params.preferredUserId,
    });

    const basePayload: Record<string, any> = {
      Client_ID2: /^\d+$/.test(clientId2) ? Number(clientId2) : clientId2,
      User_ID: resolvedUserId,
      Comments: comments,
      Time_Stamp: new Date().toISOString(),
      Follow_Up_Status: '🟢Open',
    };
    if (hasValue(params.preferredUserId)) basePayload.Follow_Up_Assignment = clean(params.preferredUserId);
    if (hasValue(params.assignedStaffName)) {
      basePayload.Assigned_First = clean(params.assignedStaffName);
      basePayload.User_Full_Name = clean(params.assignedStaffName);
    }

    const insertUrl = `${restBaseUrl}/tables/connect_tbl_clientnotes/records`;
    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(basePayload),
    });
    if (insertResponse.ok) {
      return { success: true, reason: 'inserted' };
    }
    const errorText = await insertResponse.text().catch(() => '');
    return {
      success: false,
      reason: 'insert-failed',
      error: `Caspio note insert failed: ${insertResponse.status} ${errorText}`,
    };
  } catch (error: any) {
    return {
      success: false,
      reason: 'insert-failed',
      error: String(error?.message || 'unknown'),
    };
  }
}

const REQUIREMENT_TITLE_TO_ID: Record<string, string> = {
  'cs member summary': 'cs-summary',
  'cs summary': 'cs-summary',
  'waivers & authorizations': 'waivers',
  'proof of income': 'proof-of-income',
  "lic 602a - physician's report": 'lic-602a',
  'medicine list': 'medicine-list',
  'declaration of eligibility': 'declaration-of-eligibility',
  'snf facesheet': 'snf-facesheet',
};

const resolveFocusRequirementId = (forms: any[]): string => {
  for (const form of forms) {
    const name = String(form?.name || '').trim().toLowerCase();
    if (!name) continue;
    const status = String(form?.status || '').trim().toLowerCase();
    const revisionOpen = Boolean(form?.revisionRequestedAt) || Boolean(form?.revisionRequestedReason);
    if (status !== 'completed' || revisionOpen) {
      if (REQUIREMENT_TITLE_TO_ID[name]) return REQUIREMENT_TITLE_TO_ID[name];
    }
  }
  return '';
};

const buildPathwayLoginRedirect = (applicationId: string, focusRequirementId: string): string => {
  const base = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://connectcalaim.com').replace(/\/$/, '');
  const returnPath = `/pathway?applicationId=${encodeURIComponent(applicationId)}${
    focusRequirementId ? `&focus=${encodeURIComponent(focusRequirementId)}&mode=upload-missing` : ''
  }`;
  return `${base}/login?redirect=${encodeURIComponent(returnPath)}&forceLogin=1`;
};

const isAdminDevelopingAsUser = (appData: any): boolean => {
  if (!Boolean(appData?.createdByAdmin)) return false;
  return !Boolean(appData?.linkedToFamilyAt) && !Boolean(appData?.linkedToFamilyEmail);
};

export async function POST(request: NextRequest) {
  try {
    const {
      applicationId,
      userId,
      statusValue,
      deniedReason,
      trigger,
      sentByUid,
      sentByName,
      overrideEmail,
      previewOnly,
      testOnly,
    } = await request.json();

    if (!applicationId || !String(statusValue || '').trim()) {
      return NextResponse.json(
        { success: false, error: 'Application ID and status value are required' },
        { status: 400 }
      );
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const mode = String(trigger || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const statusText = String(statusValue || '').trim();
    const reason = String(deniedReason || '').trim();
    const deniedSelected = /authorization denied/i.test(statusText);
    if (deniedSelected && !reason) {
      return NextResponse.json(
        { success: false, error: 'Denied reason is required for Authorization Denied status' },
        { status: 400 }
      );
    }

    const isAdminApp = applicationId.startsWith('admin_app_') || !userId;
    const docRef = isAdminApp
      ? adminDb.collection('applications').doc(applicationId)
      : adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);

    const appSnap = await docRef.get();
    if (!appSnap.exists) {
      return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 });
    }
    const appData = appSnap.data() || {};
    if (isAdminDevelopingAsUser(appData) && !Boolean(previewOnly) && !Boolean(testOnly)) {
      return NextResponse.json({
        success: true,
        skippedAdminDevelopingAsUser: true,
      });
    }
    const forms = Array.isArray(appData?.forms) ? appData.forms : [];
    const statusRemindersEnabled = Boolean(appData?.statusRemindersEnabled);
    if (!statusRemindersEnabled && !Boolean(previewOnly) && !Boolean(testOnly)) {
      return NextResponse.json({ success: true, skippedDisabled: true });
    }

    const normalizedStatus = String(appData?.status || '').trim().toLowerCase();
    const normalizedIntakeType = String(appData?.intakeType || '').trim().toLowerCase();
    const isStaffDraftPathway = Boolean(appData?.createdByAdmin) && (
      normalizedStatus === 'draft' ||
      normalizedIntakeType === 'kaiser_auth_received_via_ils'
    );
    const recipientEmail = String(
      overrideEmail ||
      appData?.bestContactEmail ||
      appData?.secondaryContactEmail ||
      appData?.repEmail ||
      (isStaffDraftPathway ? '' : appData?.referrerEmail) ||
      ''
    ).trim();
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: 'Primary contact email is missing for this application' },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const cooldownMs = 10 * 60 * 1000;
    const lastEmail = appData?.familyStatusLastEmail || {};
    const lastStatus = String(lastEmail?.status || '').trim();
    const lastReason = String(lastEmail?.reason || '').trim();
    const lastSentMs = toMs(lastEmail?.sentAtMs || lastEmail?.sentAt || lastEmail?.sentAtIso);
    const samePayload = lastStatus === statusText && lastReason === reason;
    if (mode !== 'manual' && samePayload && lastSentMs > 0 && nowMs - lastSentMs < cooldownMs) {
      return NextResponse.json({
        success: true,
        skippedDueToDedupe: true,
        cooldownMs,
      });
    }

    const memberName = `${String(appData?.memberFirstName || '').trim()} ${String(appData?.memberLastName || '').trim()}`.trim() || 'CalAIM Member';
    const primaryContactName = String(
      `${appData?.bestContactFirstName || ''} ${appData?.bestContactLastName || ''}`
    ).trim();
    const referrerName = primaryContactName || String(appData?.referrerName || '').trim() || 'there';
    const senderName = String(sentByName || '').trim() || 'The Connections Team';
    const subject = `Application progress update for ${memberName}`;
    const processingSelected = /cs summary submitted - processing/i.test(statusText);
    const message = deniedSelected
      ? `Application progress update: ${statusText}. Reason: ${reason}`
      : processingSelected
        ? 'We received your CS Summary and are now processing your application. Our team will contact you if we need anything else.'
      : `Application progress update: ${statusText}.`;
    const focusRequirementId = resolveFocusRequirementId(forms);
    const portalDeepLink = buildPathwayLoginRedirect(applicationId, focusRequirementId);

    if (Boolean(previewOnly)) {
      return NextResponse.json({
        success: true,
        preview: true,
        recipientEmail,
        referrerName,
        memberName,
        subject,
        statusText,
        deniedReason: reason,
        message,
      });
    }

    await sendApplicationStatusEmail({
      to: recipientEmail,
      includeBcc: false,
      subject,
      memberName: referrerName,
      staffName: senderName,
      staffEmail: String(appData?.assignedStaffEmail || '').trim() || String(appData?.calaimCoordinatorEmail || '').trim() || undefined,
      message,
      status: 'In Progress',
      portalUrl: portalDeepLink,
      healthPlan: String(appData?.healthPlan || '').trim(),
    });

    if (Boolean(testOnly)) {
      return NextResponse.json({
        success: true,
        sent: true,
        testOnly: true,
        to: recipientEmail,
      });
    }

    const clientId2 = clean(appData?.clientId2 || appData?.client_ID2 || appData?.caspioClientId2 || appData?.memberClientId);
    const caspioNoteComments = [
      `Family status update emailed to primary contact (${recipientEmail}).`,
      `Status: ${statusText}${reason ? ` | Reason: ${reason}` : ''}`,
      `Sent by: ${senderName}`,
      `Application ID: ${applicationId}`,
    ].join(' ');
    const noteSync = await syncFamilyStatusNoteToCaspioClientNotes({
      clientId2,
      comments: caspioNoteComments,
      preferredUserId: String(appData?.assignedStaffId || '').trim(),
      assignedStaffName: String(appData?.assignedStaffName || senderName || '').trim(),
    });

    const historyEntry = {
      status: statusText,
      reason,
      to: recipientEmail,
      sentAtMs: nowMs,
      sentAtIso: new Date(nowMs).toISOString(),
      sentByUid: String(sentByUid || '').trim(),
      sentByName: senderName,
      trigger: mode,
    };
    const existingHistory = Array.isArray(appData?.familyStatusReminderHistory)
      ? appData.familyStatusReminderHistory
      : [];
    const nextHistory = [historyEntry, ...existingHistory].slice(0, 50);

    await docRef.set(
      {
        familyStatusProgress: statusText,
        familyStatusDeniedReason: deniedSelected ? reason : '',
        familyStatusLastEmail: historyEntry,
        familyStatusReminderHistory: nextHistory,
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sent: true,
      noteSync,
      lastEmail: historyEntry,
      history: nextHistory.slice(0, 5),
    });
  } catch (error: any) {
    console.error('❌ Error sending family status reminder:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to send family status reminder',
      },
      { status: 500 }
    );
  }
}
