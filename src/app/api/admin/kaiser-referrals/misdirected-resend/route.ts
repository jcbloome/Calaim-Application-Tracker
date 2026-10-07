import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin, { adminStorage } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { addAndMirror } from '@/lib/global-change-log-server';
import { mapEmailLog } from '@/lib/global-change-log-mappers';
import { getKaiserProviderPortal } from '@/lib/kaiser-region';
import { getKaiserStatusByName, normalizeKaiserStatusName } from '@/lib/kaiser-status-progression';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Kaiser South referrals sent Jul 8 – Oct 6, 2026 went to the misspelled RegCareCoorCaseMgmt@kp.org
 * (commit 596bb825, fixed in 494dbc27). GET lists them; POST re-emails the stored original PDF to the
 * correct intake address without touching application submission/status fields.
 */

const MISSPELLED_SOUTH_EMAIL = 'regcarecoorcasemgmt@kp.org';
const CORRECT_SOUTH_EMAIL = 'RegCareCoordCaseMgmt@kp.org';
const JASON_COPY_EMAIL = 'jason@carehomefinders.com';
const DEYDRY_COPY_EMAIL = 'deydry@carehomefinders.com';
const FROM = 'Connections CalAIM <noreply@carehomefinders.com>';
const SOURCE = '/api/admin/kaiser-referrals/misdirected-resend';
const COVER_SHEET_WINDOW_START_MS = Date.parse('2026-09-18T00:00:00-04:00');
const COVER_SHEET_WINDOW_END_MS = Date.parse('2026-10-07T00:00:00-04:00');
const T2038_REQUESTED_SORT_ORDER = 2;
const MAX_POST_IDS = 100;

const clean = (value: unknown) => String(value ?? '').trim();

function toMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function uniqueEmails(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = clean(value);
    if (!trimmed.includes('@')) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

const lowerList = (values: unknown) =>
  (Array.isArray(values) ? values : [values]).map((v) => clean(v).toLowerCase()).filter(Boolean);

function parseMemberFromSubject(subject: string) {
  const match = clean(subject).match(/Member Name:\s*(.+?)\s+and\s+MRN:\s*(.+)$/i);
  return { memberName: clean(match?.[1]), memberMrn: clean(match?.[2]) };
}

function isUsableMrn(value: string) {
  const v = value.toLowerCase();
  return Boolean(v) && v !== 'n/a' && !v.startsWith('unknown');
}

type LogRow = { id: string; data: Record<string, any> };

function describeLog(row: LogRow) {
  const meta = (row.data.metadata || {}) as Record<string, any>;
  const fromSubject = parseMemberFromSubject(clean(row.data.subject));
  const memberName = clean(meta.memberName).replace(/^Unknown member$/i, '') || fromSubject.memberName;
  const mrnRaw = clean(meta.memberMrn) || fromSubject.memberMrn;
  const memberMrn = isUsableMrn(mrnRaw) ? mrnRaw : '';
  const clientId2 = clean(meta.memberClientId).replace(/^N\/A$/i, '');
  const memberKey = memberMrn
    ? `mrn:${memberMrn.toLowerCase()}`
    : clientId2
      ? `cid:${clientId2}`
      : `name:${memberName.toLowerCase()}`;
  return {
    memberName,
    memberMrn,
    clientId2,
    memberKey,
    sentAtMs: toMs(row.data.createdAt),
    submitterName: clean(meta.submitterName),
    submitterEmail: clean(meta.submitterEmail),
    pdfStoragePath: clean(meta.pdfStoragePath),
    fileName: clean(meta.fileName) || 'kaiser_referral.pdf',
    subject: clean(row.data.subject),
    applicationId: clean(meta.applicationId),
    userId: clean(meta.userId),
  };
}

const isTestSend = (row: LogRow) => Boolean(row.data?.metadata?.testSend);
const isSuccess = (row: LogRow) => clean(row.data.status).toLowerCase() === 'success';
const wentToMisspelled = (row: LogRow) => lowerList(row.data.to).includes(MISSPELLED_SOUTH_EMAIL);
const wentToCorrectSouth = (row: LogRow) => lowerList(row.data.to).includes(CORRECT_SOUTH_EMAIL.toLowerCase());

/** Preselect for resend only when Kaiser is still waiting on the referral (T2038 Requested or earlier) or status unknown. */
function shouldPreselect(kaiserStatus: string): { preselect: boolean; reason: string } {
  const normalized = normalizeKaiserStatusName(kaiserStatus);
  if (!normalized) return { preselect: true, reason: 'Kaiser status unknown' };
  const match = getKaiserStatusByName(normalized);
  if (!match) return { preselect: true, reason: `Status "${normalized}" not in the Kaiser progression` };
  if (match.category === 'inactive') return { preselect: false, reason: `Member is ${match.status}` };
  if (match.sortOrder <= T2038_REQUESTED_SORT_ORDER) return { preselect: true, reason: `Still ${match.status}` };
  return { preselect: false, reason: `Already past T2038 Requested (${match.status})` };
}

async function loadKaiserReferralLogs(adminDb: any): Promise<LogRow[]> {
  const snap = await adminDb.collection('emailLogs').where('template', '==', 'kaiser-referral-intake').get();
  return snap.docs.map((d: any) => ({ id: d.id, data: (d.data() || {}) as Record<string, any> }));
}

async function loadKaiserStatuses(adminDb: any, clientIds: string[], mrns: string[]) {
  const byClientId = new Map<string, string>();
  const byMrn = new Map<string, string>();
  for (let i = 0; i < clientIds.length; i += 300) {
    const refs = clientIds.slice(i, i + 300).map((id) => adminDb.collection('caspio_members_cache').doc(id));
    const snaps = refs.length ? await adminDb.getAll(...refs) : [];
    for (const snap of snaps) {
      if (!snap?.exists) continue;
      const data = snap.data() || {};
      byClientId.set(String(snap.id), clean(data.Kaiser_Status || data.kaiserStatus));
    }
  }
  for (let i = 0; i < mrns.length; i += 30) {
    const chunk = mrns.slice(i, i + 30);
    if (!chunk.length) continue;
    const snap = await adminDb.collection('caspio_members_cache').where('MCP_CIN', 'in', chunk).get().catch(() => null);
    snap?.docs.forEach((d: any) => {
      const data = d.data() || {};
      const mrn = clean(data.MCP_CIN).toLowerCase();
      if (mrn) byMrn.set(mrn, clean(data.Kaiser_Status || data.kaiserStatus));
      if (!data.Client_ID2) return;
      byClientId.set(clean(data.Client_ID2), clean(data.Kaiser_Status || data.kaiserStatus));
    });
  }
  return { byClientId, byMrn };
}

async function buildCandidates(adminDb: any) {
  const logs = (await loadKaiserReferralLogs(adminDb)).filter((row) => isSuccess(row) && !isTestSend(row));

  const latestCorrectSendByMember = new Map<string, number>();
  for (const row of logs) {
    if (!wentToCorrectSouth(row)) continue;
    const info = describeLog(row);
    latestCorrectSendByMember.set(info.memberKey, Math.max(latestCorrectSendByMember.get(info.memberKey) || 0, info.sentAtMs));
  }

  const misdirected = logs.filter(wentToMisspelled).map((row) => ({ row, info: describeLog(row) }));
  const byMember = new Map<string, { row: LogRow; info: ReturnType<typeof describeLog>; sendCount: number }>();
  for (const entry of misdirected) {
    const existing = byMember.get(entry.info.memberKey);
    if (!existing) {
      byMember.set(entry.info.memberKey, { ...entry, sendCount: 1 });
      continue;
    }
    existing.sendCount += 1;
    if (entry.info.sentAtMs > existing.info.sentAtMs) {
      existing.row = entry.row;
      existing.info = entry.info;
    }
  }

  const groups = Array.from(byMember.values());
  const statuses = await loadKaiserStatuses(
    adminDb,
    Array.from(new Set(groups.map((g) => g.info.clientId2).filter(Boolean))),
    Array.from(new Set(groups.map((g) => g.info.memberMrn).filter(Boolean)))
  );

  return groups
    .map(({ row, info, sendCount }) => {
      const kaiserStatus =
        (info.clientId2 && statuses.byClientId.get(info.clientId2)) ||
        (info.memberMrn && statuses.byMrn.get(info.memberMrn.toLowerCase())) ||
        '';
      const resentAtMs = toMs(row.data.misdirectedResentAt);
      const correctSendAfterMs = latestCorrectSendByMember.get(info.memberKey) || 0;
      const alreadyResent = resentAtMs > 0 || correctSendAfterMs > info.sentAtMs;
      const selection = shouldPreselect(kaiserStatus);
      return {
        logId: row.id,
        memberName: info.memberName || 'Unknown member',
        memberMrn: info.memberMrn,
        clientId2: info.clientId2,
        applicationId: info.applicationId,
        originalSentAtIso: info.sentAtMs ? new Date(info.sentAtMs).toISOString() : null,
        originalSubject: info.subject,
        submitterName: info.submitterName,
        submitterEmail: info.submitterEmail,
        sendCount,
        hasStoredPdf: Boolean(info.pdfStoragePath),
        kaiserStatus,
        alreadyResent,
        resentAtIso: resentAtMs
          ? new Date(resentAtMs).toISOString()
          : correctSendAfterMs > info.sentAtMs
            ? new Date(correctSendAfterMs).toISOString()
            : null,
        resentBy: clean(row.data.misdirectedResentBy),
        preselect: !alreadyResent && Boolean(info.pdfStoragePath) && selection.preselect,
        preselectReason: alreadyResent
          ? 'Already resent to the correct address'
          : !info.pdfStoragePath
            ? 'No stored PDF — reopen the generator and resend manually'
            : selection.reason,
      };
    })
    .sort((a, b) => toMs(b.originalSentAtIso) - toMs(a.originalSentAtIso));
}

async function listCoverSheetsToReview() {
  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles({ prefix: 'kaiser-cover-sheets/' });
    const inWindow = files.filter((file: any) => {
      const created = toMs(file?.metadata?.timeCreated);
      return created >= COVER_SHEET_WINDOW_START_MS && created < COVER_SHEET_WINDOW_END_MS;
    });
    return await Promise.all(
      inWindow.map(async (file: any) => {
        const parts = String(file.name).split('/');
        const [url] = await file
          .getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 })
          .catch(() => ['']);
        return {
          path: String(file.name),
          clientIdOrApp: parts[1] || '',
          memberName: (parts[2] || '').replace(/-/g, ' '),
          fileName: parts.slice(3).join('/').replace(/^\d+-/, ''),
          createdAtIso: clean(file?.metadata?.timeCreated) || null,
          url: clean(url),
        };
      })
    );
  } catch (error: any) {
    console.warn('[misdirected-resend] cover sheet listing failed', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false, requireSuperAdmin: true });
  if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

  try {
    const [candidates, coverSheets] = await Promise.all([buildCandidates(authz.adminDb), listCoverSheetsToReview()]);
    return NextResponse.json({
      success: true,
      misspelledAddress: 'RegCareCoorCaseMgmt@kp.org',
      correctAddress: CORRECT_SOUTH_EMAIL,
      candidates,
      coverSheets: coverSheets.sort((a, b) => toMs(b.createdAtIso) - toMs(a.createdAtIso)),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load misdirected referrals.') },
      { status: 500 }
    );
  }
}

type ResendResult = { logId: string; memberName: string; result: 'sent' | 'skipped' | 'failed'; reason?: string };

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false, requireSuperAdmin: true });
  if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

  const body = (await request.json().catch(() => ({}))) as { logIds?: unknown };
  const logIds = Array.from(new Set((Array.isArray(body.logIds) ? body.logIds : []).map(clean).filter(Boolean)));
  if (!logIds.length) {
    return NextResponse.json({ success: false, error: 'Select at least one referral to resend.' }, { status: 400 });
  }
  if (logIds.length > MAX_POST_IDS) {
    return NextResponse.json({ success: false, error: `Resend at most ${MAX_POST_IDS} at a time.` }, { status: 400 });
  }

  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) {
    return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
  }

  const adminDb = authz.adminDb;
  const resend = new Resend(resendKey);
  const bucket = adminStorage.bucket();
  const staffEmail = clean(authz.email).toLowerCase();
  const staffName = clean(authz.name) || staffEmail || 'Connections staff';
  const providerPortal = getKaiserProviderPortal('Kaiser South');
  const toRecipients = [CORRECT_SOUTH_EMAIL];
  const ccRecipients = uniqueEmails([JASON_COPY_EMAIL, DEYDRY_COPY_EMAIL, staffEmail]);
  const results: ResendResult[] = [];

  for (const logId of logIds) {
    const ref = adminDb.collection('emailLogs').doc(logId);
    const snap = await ref.get();
    if (!snap.exists) {
      results.push({ logId, memberName: '', result: 'skipped', reason: 'Log not found' });
      continue;
    }
    const row: LogRow = { id: logId, data: (snap.data() || {}) as Record<string, any> };
    const info = describeLog(row);
    const memberName = info.memberName || 'Member';

    if (!wentToMisspelled(row) || !isSuccess(row) || isTestSend(row)) {
      results.push({ logId, memberName, result: 'skipped', reason: 'Not a misdirected Kaiser South send' });
      continue;
    }
    if (toMs(row.data.misdirectedResentAt)) {
      results.push({ logId, memberName, result: 'skipped', reason: 'Already resent' });
      continue;
    }
    if (!info.pdfStoragePath) {
      results.push({ logId, memberName, result: 'skipped', reason: 'No stored PDF — resend manually from the generator' });
      continue;
    }

    const originalDate = info.sentAtMs
      ? new Date(info.sentAtMs).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })
      : 'an earlier date';
    const subject = `Resend - corrected address: ${info.subject || `CS Referral for Member Name: ${memberName} and MRN: ${info.memberMrn || 'N/A'}`}`;
    const attachmentName = info.fileName.toLowerCase().endsWith('.pdf') ? info.fileName : `${info.fileName}.pdf`;
    const logMetadata = {
      region: 'Kaiser South',
      selectedRegion: 'Kaiser South',
      testSend: false,
      memberName,
      memberMrn: info.memberMrn || 'Unknown MRN',
      memberClientId: info.clientId2 || null,
      applicationId: info.applicationId || null,
      userId: info.userId || null,
      submitterName: staffName,
      submitterEmail: staffEmail,
      fileName: attachmentName,
      pdfStoragePath: info.pdfStoragePath,
      misdirectedResendOf: logId,
      originalSentAtIso: info.sentAtMs ? new Date(info.sentAtMs).toISOString() : null,
      originalSubmitterName: info.submitterName || null,
      toRecipients,
      ccRecipients,
    };

    try {
      const [buffer] = await bucket.file(info.pdfStoragePath).download();
      if (!buffer?.length) throw new Error('Stored PDF is empty');

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827;">
          <p>Hello Kaiser South Intake,</p>
          <p>We are resending this Community Supports referral. The original was sent on ${originalDate} but went to a misspelled address and did not reach your inbox. The attached PDF is the original referral.</p>
          <p style="margin: 16px 0; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;">
            <strong>Kaiser region emailed:</strong> Kaiser South<br/>
            <strong>To:</strong> ${toRecipients.join(', ')}<br/>
            <strong>Kaiser provider portal:</strong> <a href="${providerPortal.url}">${providerPortal.label}</a><br/>
            <strong>CC:</strong> ${ccRecipients.join(', ') || 'None'}
          </p>
          <p>
            <strong>Member:</strong> ${memberName}<br/>
            <strong>MRN:</strong> ${info.memberMrn || 'N/A'}<br/>
            <strong>Originally sent:</strong> ${originalDate}${info.submitterName ? ` by ${info.submitterName}` : ''}<br/>
            <strong>Resent by:</strong> ${staffName}
          </p>
          <p>Thank you.</p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: FROM,
        to: toRecipients,
        cc: ccRecipients,
        subject,
        html,
        attachments: [{ filename: attachmentName, content: buffer.toString('base64') }],
      });
      if (error) throw new Error(String(error.message || 'Email send failed'));

      await addAndMirror(
        adminDb,
        'emailLogs',
        {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'success',
          template: 'kaiser-referral-intake',
          source: SOURCE,
          from: FROM,
          to: toRecipients,
          cc: ccRecipients,
          subject,
          provider: 'resend',
          providerMessageId: String(data?.id || ''),
          errorMessage: null,
          metadata: logMetadata,
        },
        mapEmailLog
      ).catch((logError: any) => console.warn('[misdirected-resend] email log failed', logError));

      await ref.set(
        {
          misdirectedResentAt: admin.firestore.FieldValue.serverTimestamp(),
          misdirectedResentBy: staffName,
          misdirectedResentProviderMessageId: String(data?.id || ''),
        },
        { merge: true }
      );

      if (info.clientId2) {
        try {
          const { appendCaspioClientNote } = await import('@/lib/caspio-client-notes');
          const stamp = new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          await appendCaspioClientNote({
            clientId2: info.clientId2,
            comments: [
              `Kaiser referral resent to the corrected Kaiser South intake address (${CORRECT_SOUTH_EMAIL}) on ${stamp}.`,
              `Original send on ${originalDate} went to the misspelled address RegCareCoorCaseMgmt@kp.org.`,
              `Resent by: ${staffName}.`,
            ].join(' '),
            assignedStaffName: staffName,
            sourceTag: 'kaiser-referral-misdirected-resend',
          });
        } catch (noteError) {
          console.warn('[misdirected-resend] Caspio note failed', noteError);
        }
      }

      results.push({ logId, memberName, result: 'sent' });
    } catch (error: any) {
      const reason = String(error?.message || 'Resend failed');
      await addAndMirror(
        adminDb,
        'emailLogs',
        {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failure',
          template: 'kaiser-referral-intake',
          source: SOURCE,
          from: FROM,
          to: toRecipients,
          cc: ccRecipients,
          subject,
          provider: 'resend',
          providerMessageId: null,
          errorMessage: reason,
          metadata: logMetadata,
        },
        mapEmailLog
      ).catch(() => undefined);
      results.push({ logId, memberName, result: 'failed', reason });
    }
  }

  return NextResponse.json({
    success: true,
    sent: results.filter((r) => r.result === 'sent').length,
    skipped: results.filter((r) => r.result === 'skipped').length,
    failed: results.filter((r) => r.result === 'failed').length,
    results,
  });
}
