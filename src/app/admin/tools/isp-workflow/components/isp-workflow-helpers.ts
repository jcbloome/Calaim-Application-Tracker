import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { getIspLocationSnapshot, getRcfeLocationSnapshot } from '@/lib/isp-visit-location';
import {
  buildDisplaySwAssignmentHistory,
  resolveLastInvitedSwEmail,
  type SwAssignmentHistoryEntry,
} from '@/lib/sw-assignment-history';

const toIso = (value: unknown): string => {
  if (!value) return '';
  if (typeof (value as any)?.toDate === 'function') {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return '';
    }
  }
  if (typeof (value as any)?.toMillis === 'function') {
    try {
      return new Date((value as any).toMillis()).toISOString();
    } catch {
      return '';
    }
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

export const formatWhen = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export const isUsableSwEmail = (raw: unknown) => {
  const email = clean(raw).toLowerCase();
  if (!email || !email.includes('@')) return false;
  if (email.endsWith('@example.com') || email.endsWith('@example.org') || email.endsWith('@test.com')) {
    return false;
  }
  return true;
};

export const formatSwEmailBodyPreviewHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');

export const swFirstNameOf = (name: string) => {
  const raw = clean(name) || 'Social Worker';
  const part = raw.includes(',') ? raw.split(',', 2)[1] : raw.split(/\s+/, 2)[0];
  return clean(part).split(/\s+/, 2)[0] || 'Social Worker';
};

type AnswerValue = string | string[];
export type AnswerMap = Record<string, AnswerValue>;

export type KaiserMember = {
  id?: string;
  Client_ID2?: string;
  client_ID2?: string;
  memberName?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberCounty?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
  [key: string]: unknown;
};

export type StaffOption = {
  uid: string;
  email: string;
  label: string;
  role: string;
  isRn?: boolean;
  isAlftIspReviewer?: boolean;
};

export type CaspioAssessorRoleInfo = {
  name: string;
  email: string;
  inMswTable: boolean;
  inRnTable: boolean;
  caspioRole: 'msw' | 'rn' | 'both' | 'unknown';
  caspioRoleLabel: string;
  caspioTableLabel: string;
};

export type ActiveIntake = {
  id: string;
  memberName?: string;
  medicalRecordNumber?: string;
  workflowStatus?: string;
  workflowStage?: string;
  source?: string;
  sourceLabel?: string;
  formerSwImportMode?: boolean;
  departedSwCompletedIsp?: boolean;
  uploaderName?: string;
  uploaderEmail?: string;
  alftStaffName?: string;
  alftStaffEmail?: string;
  alftRnName?: string;
  alftRnEmail?: string;
  alftForm?: {
    exactPacketAnswers?: Record<string, AnswerValue>;
    swSignature?: string | null;
    swSignedAt?: string | null;
  };
  alftSignature?: Record<string, any>;
};

export type DownloadLog = {
  id: string;
  downloadName: string;
  memberName: string;
  createdAt: string;
  staffName: string;
  versionNumber?: number;
};

export type SwPortalSupportFile = {
  id: string;
  label: string;
  fileName: string;
  downloadURL: string;
  storagePath: string;
  uploadedAtLabel: string;
  /** Full Firestore entry so we can rewrite the array after delete. */
  raw: Record<string, unknown>;
};

export type ApplicationClinicalFile = {
  id: string;
  formName: string;
  label: string;
  fileName: string;
  downloadURL: string;
  filePath: string;
  applicationId: string;
  alreadyPulled: boolean;
};

const APPLICATION_CLINICAL_FORM_MATCHERS: Array<{
  label: string;
  match: (formName: string) => boolean;
}> = [
  {
    label: '602',
    match: (name) => {
      const n = name.toLowerCase();
      return n.includes('602') || n.includes('lic 602');
    },
  },
  {
    label: 'Medicine List',
    match: (name) => {
      const n = name.toLowerCase();
      return (
        n.includes('medicine list') ||
        n.includes('medication list') ||
        n === 'med list' ||
        n.includes('med list')
      );
    },
  },
];

const clinicalLabelForApplicationForm = (formName: string): string | null => {
  const cleaned = clean(formName);
  if (!cleaned) return null;
  for (const entry of APPLICATION_CLINICAL_FORM_MATCHERS) {
    if (entry.match(cleaned)) return entry.label;
  }
  return null;
};

export const extractApplicationClinicalFiles = (
  applicationId: string,
  forms: unknown,
  existingSupportFiles: SwPortalSupportFile[] = []
): ApplicationClinicalFile[] => {
  if (!Array.isArray(forms)) return [];
  const existingKeys = new Set(
    existingSupportFiles.flatMap((f) =>
      [clean(f.fileName).toLowerCase(), clean(f.label).toLowerCase(), clean(f.downloadURL)].filter(Boolean)
    )
  );
  const out: ApplicationClinicalFile[] = [];

  forms.forEach((form: any, formIdx: number) => {
    const formName = clean(form?.name);
    const label = clinicalLabelForApplicationForm(formName);
    if (!label) return;
    const status = clean(form?.status).toLowerCase();
    const hasFile =
      Boolean(clean(form?.filePath) || clean(form?.downloadURL) || clean(form?.fileName)) ||
      (Array.isArray(form?.uploadedFiles) && form.uploadedFiles.length > 0);
    if (!hasFile && status !== 'completed') return;

    const uploadedFiles = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
    const entries =
      uploadedFiles.length > 0
        ? uploadedFiles
        : [
            {
              fileName: form?.fileName,
              downloadURL: form?.downloadURL || form?.uploadUrl || form?.url,
              filePath: form?.filePath || form?.storagePath || form?.path,
            },
          ];

    entries.forEach((item: any, fileIdx: number) => {
      const fileName =
        clean(item?.fileName) || clean(form?.fileName) || `${label}${entries.length > 1 ? ` ${fileIdx + 1}` : ''}`;
      const downloadURL = clean(item?.downloadURL || item?.url || item?.uploadUrl);
      const filePath = clean(item?.filePath || item?.storagePath || item?.path);
      if (!downloadURL && !filePath) return;
      const alreadyPulled =
        existingKeys.has(fileName.toLowerCase()) ||
        (downloadURL ? existingKeys.has(downloadURL) : false) ||
        existingSupportFiles.some(
          (f) =>
            clean(f.label).toLowerCase() === label.toLowerCase() &&
            clean(f.fileName).toLowerCase() === fileName.toLowerCase()
        );
      out.push({
        id: `${applicationId}:${formIdx}:${fileIdx}:${fileName}`,
        formName,
        label,
        fileName,
        downloadURL,
        filePath,
        applicationId,
        alreadyPulled,
      });
    });
  });

  return out;
};

export const AGENCY_NAME = 'Connections Care Home Consultants';
export const DEFAULT_RN_EMAIL = 'leslie@carehomefinders.com';

export const REQUIRED_CASPIO_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'p1_member_name', label: 'Member Name' },
  { id: 'p1_mrn', label: 'MRN (MCP_CIN)' },
  { id: 'p1_dob', label: 'Date of Birth' },
  { id: 'p1_assessor_name', label: 'Social Worker / Assessor' },
  { id: 'isp_facility', label: 'Facility / ISP Location' },
  { id: 'isp_address', label: 'ISP Address' },
  { id: 'isp_city', label: 'ISP City' },
  { id: 'isp_contact_name', label: 'ISP Contact Name' },
  { id: 'isp_contact_phone', label: 'ISP Contact Phone (Caspio ISP_Contact_Phone)' },
];

/** Resolve required checklist values from ISP fields, with RCFE as fallback for location. */
export const resolveRequiredCaspioFieldValue = (
  fieldId: string,
  resolvedPreview: Record<string, string>,
  answers: AnswerMap,
  caspioSource: Record<string, unknown>,
  options?: {
    assessorType?: 'msw' | 'rn';
    socialWorkerName?: string;
    socialWorkerEmail?: string;
  }
): string => {
  const fromResolved = (...ids: string[]) => {
    for (const id of ids) {
      const v = clean(resolvedPreview[id] || answers[id]);
      if (v) return v;
    }
    return '';
  };
  const isp = getIspLocationSnapshot(caspioSource || {});
  const rcfe = getRcfeLocationSnapshot(caspioSource || {});
  const assessorType = options?.assessorType === 'rn' ? 'rn' : 'msw';
  const staffName = clean(options?.socialWorkerName);

  switch (fieldId) {
    case 'p1_member_name':
    case 'p1_mrn':
    case 'p1_dob':
      return fromResolved(fieldId);
    case 'p1_assessor_name': {
      // RN override: do not require Caspio Social_Worker_Assigned — use RN assessor / RN_Assigned.
      if (assessorType === 'rn') {
        return (
          staffName ||
          fromResolved('p1_assessor_name') ||
          clean(caspioSource?.RN_Assigned) ||
          clean(caspioSource?.RN_Name) ||
          clean(caspioSource?.assignedRnName) ||
          clean(caspioSource?.Registered_Nurse_Assigned) ||
          ''
        );
      }
      return (
        staffName ||
        fromResolved('p1_assessor_name') ||
        clean(caspioSource?.Social_Worker_Assigned) ||
        clean(caspioSource?.social_worker_assigned) ||
        clean(caspioSource?.assignedSwName) ||
        ''
      );
    }
    case 'isp_facility':
      return (
        fromResolved('p2_facility_name', 'p2_current_type_other') ||
        isp.name ||
        isp.type ||
        rcfe.name ||
        ''
      );
    case 'isp_address':
      return fromResolved('p2_current_street', 'isp_contact_street') || isp.street || rcfe.street || '';
    case 'isp_city':
      return fromResolved('p2_current_city', 'isp_contact_city') || isp.city || rcfe.city || '';
    case 'isp_contact_name': {
      const first = fromResolved('isp_contact_first');
      const last = fromResolved('isp_contact_last');
      const combined = `${first} ${last}`.trim();
      return (
        fromResolved('isp_contact_name', 'p1_other_responder_name') ||
        combined ||
        clean(caspioSource?.ISP_Contact_Name || caspioSource?.RCFE_Admin_Name) ||
        rcfe.name ||
        ''
      );
    }
    case 'isp_contact_phone':
      // Must be Caspio ISP_Contact_Phone (RCFE front-desk phone is OK once stored there).
      return fromResolved('isp_contact_phone') || clean(caspioSource?.ISP_Contact_Phone) || isp.phone || '';
    default:
      return fromResolved(fieldId);
  }
};

export const clean = (value: unknown) => String(value || '').trim();
export const clientIdOf = (member: KaiserMember) => clean(member.Client_ID2 || member.client_ID2);

/** Firestore members cache older than this is treated as stale and auto-synced from Caspio. */
const MEMBERS_CACHE_STALE_MS = 30 * 60 * 1000;

const parseSyncAtMs = (value: unknown): number => {
  const raw = clean(value);
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
};

const readMembersCacheLastSyncAt = async (): Promise<string> => {
  try {
    const response = await fetch(`/api/caspio/members-cache/status?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok || !data?.success) return '';
    return clean(
      data?.settings?.ilsKaiserLastManualSyncAt ||
        data?.settings?.ilsKaiserLastSyncAt ||
        data?.settings?.lastManualSyncAt ||
        data?.settings?.lastRunAt ||
        data?.settings?.lastSyncAt ||
        ''
    );
  } catch {
    return '';
  }
};

export const isMembersCacheStale = async (): Promise<{ stale: boolean; lastSyncAt: string }> => {
  const lastSyncAt = await readMembersCacheLastSyncAt();
  const syncMs = parseSyncAtMs(lastSyncAt);
  if (!syncMs) return { stale: true, lastSyncAt: '' };
  return { stale: Date.now() - syncMs > MEMBERS_CACHE_STALE_MS, lastSyncAt };
};
export const toName = (member: KaiserMember) => {
  const first = clean(member.memberFirstName);
  const last = clean(member.memberLastName);
  if (first || last) return `${first} ${last}`.trim();
  return clean(member.memberName) || 'Member';
};

export const lastNameOf = (member: KaiserMember) => {
  const last = clean(member.memberLastName);
  if (last) return last;
  const full = clean(member.memberName);
  if (!full) return '';
  // "Last, First" or "First Last"
  if (full.includes(',')) return clean(full.split(',')[0]);
  const parts = full.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
};

export const resolveKaiserStatusValue = (row: Record<string, unknown> | KaiserMember): string => {
  const direct = [
    row?.Kaiser_Status,
    (row as any)?.kaiserStatus,
    (row as any)?.Kaiser_ID_Status,
    (row as any)?.kaiser_id_status,
    (row as any)?.KaiserStatus,
  ]
    .map((v) => clean(v))
    .find(Boolean);
  if (direct) return direct;
  const keyMatch = Object.keys(row || {}).find(
    (k) => k.toLowerCase().includes('kaiser') && k.toLowerCase().includes('status')
  );
  if (keyMatch) return clean((row as any)?.[keyMatch]);
  return '';
};

/** Match Caspio Kaiser_Status for members that still need an RN visit. */
export const isRnVisitNeededStatus = (value: unknown): boolean => {
  const normalized = clean(value).toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return (
    normalized === 'rn visit needed' ||
    normalized.includes('rn visit needed') ||
    normalized.includes('rn visit req') ||
    (normalized.includes('rn needed') && !normalized.includes('complete'))
  );
};
/** Normalize DOB / dates to MM-DD-YYYY (handles ISO datetimes from member data). */
export const toMmDdYyyy = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}-${iso[1]}`;
  const us = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (us) return `${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}-${us[3]}`;
  return raw;
};
export const buildBlankAnswers = (): AnswerMap => {
  const next = createInitialExactAlftAnswers() as AnswerMap;
  next.p1_agency = AGENCY_NAME;
  // ISP defaults (editable): ALWP waitlist + previous unsuccessful placements start as No.
  next.p2_alwp_waitlist = 'no';
  next.p2_previous_unsuccessful_placements = 'no';
  return next;
};

/**
 * Caspio demographic / location fields safe to refresh onto an existing completed-PDF ISP
 * without wiping clinical answers parsed from the ALFT.
 */
export const CASPIO_REFRESHABLE_FIELD_IDS = new Set([
  'p1_member_name',
  'p1_first_name',
  'p1_last_name',
  'p1_phone',
  'p1_dob',
  'p1_sex',
  'p1_primary_language',
  'p1_mrn',
  'p1_plan_id',
  'p2_income_ssi',
  'p2_home_street',
  'p2_home_city',
  'p2_home_state',
  'p2_home_zip',
  'p2_mail_street',
  'p2_mail_city',
  'p2_mail_state',
  'p2_mail_zip',
  'p2_current_street',
  'p2_current_city',
  'p2_current_state',
  'p2_current_zip',
  'p2_current_type',
  'p2_current_type_other',
  'p2_facility_name',
  'p2_assessment_site',
  'isp_contact_first',
  'isp_contact_last',
  'isp_contact_relationship',
  'isp_contact_email',
  'isp_contact_phone',
  'isp_contact_confirm_date',
  'isp_contact_2_first',
  'isp_contact_2_last',
  'isp_contact_2_relationship',
  'isp_contact_2_email',
  'isp_contact_2_phone',
  'isp_location_type',
  'isp_location_name',
  'isp_location_address',
  'isp_location_city',
  'isp_location_state',
  'isp_location_zip',
  'isp_contact_street',
  'isp_contact_city',
  'isp_contact_state',
  'isp_contact_zip',
  'isp_contact_type',
  'isp_mcp_cin',
]);

let pdfJsLoaderPromise: Promise<any> | null = null;
const loadPdfJs = async () => {
  if (pdfJsLoaderPromise) return pdfJsLoaderPromise;
  pdfJsLoaderPromise = (async () => {
    let pdfjs: any = null;
    try {
      const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs = mod?.getDocument ? mod : mod?.default || mod;
    } catch (localError) {
      console.warn('Local pdfjs-dist load failed, trying CDN fallback:', localError);
      const pdfJsCdnUrl: string = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.min.mjs';
      const mod: any = await import(
        /* webpackIgnore: true */ pdfJsCdnUrl
      );
      pdfjs = mod?.getDocument ? mod : mod?.default || mod;
    }
    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.worker.min.mjs';
    }
    return pdfjs;
  })();
  return pdfJsLoaderPromise;
};

export const renderPdfPagesToBlobs = async (file: File, scale = 2.0): Promise<Blob[]> => {
  const pdfjs = await loadPdfJs();
  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true });
  const pdf = await loadingTask.promise;
  const blobs: Blob[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create canvas for PDF page render.');
    // White background helps scanned pages with transparent/odd PDF backgrounds.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Failed to render PDF page ${pageNum}`))), 'image/png');
    });
    blobs.push(blob);
  }
  return blobs;
};

export const parseSwPortalSupportFiles = (raw: unknown): SwPortalSupportFile[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any, index: number) => {
      const uploadedAtIso = toIso(entry?.uploadedAt || entry?.uploadedAtIso || '');
      const downloadURL = clean(entry?.downloadURL);
      const storagePath = clean(entry?.storagePath || entry?.filePath || entry?.path);
      return {
        id: clean(entry?.id) || `support_${index}_${downloadURL.slice(-24)}`,
        label: clean(entry?.label),
        fileName: clean(entry?.fileName),
        downloadURL,
        storagePath,
        uploadedAtLabel: uploadedAtIso ? formatWhen(uploadedAtIso) : '',
        raw: entry && typeof entry === 'object' ? { ...(entry as Record<string, unknown>) } : {},
      };
    })
    .filter((entry) => Boolean(entry.downloadURL));
};

export type PriorSwInviteInfo = {
  memberId: string;
  memberName: string;
  invitedAt: string;
  invitedTo: string;
  statusLabel: string;
  hasSubmission: boolean;
};

const workflowStatusLabel = (ws: string, status: string) => {
  const raw = `${ws} ${status}`.toLowerCase();
  if (raw.includes('returned_to_sw')) return 'Returned to SW for resubmission';
  if (raw.includes('returned_to_staff') || raw.includes('returned_to_admin') || raw.includes('waiting_staff')) {
    return 'Returned to admin/staff for edits';
  }
  if (raw.includes('returned_to_rn') || raw.includes('waiting_rn_revision')) {
    return 'Returned to RN for edits';
  }
  if (raw.includes('completed') || raw.includes('manager_review_complete') || raw.includes('ready_to_send')) {
    return 'Completed / ready to send';
  }
  if (raw.includes('awaiting_rn')) return 'Awaiting RN';
  if (raw.includes('awaiting_kaiser_manager_final')) return 'Awaiting final review';
  if (raw.includes('awaiting_manager') || raw.includes('awaiting_sw_signature')) return 'In admin review';
  if (raw.includes('sw_form')) return 'SW form in progress';
  if (raw.includes('sw_invited')) return 'Invited — awaiting SW submit';
  return ws.replace(/_/g, ' ') || status.replace(/_/g, ' ') || 'Already in ISP workflow';
};

export const detectPriorSwInvite = (data: Record<string, unknown> | null | undefined): Omit<
  PriorSwInviteInfo,
  'memberId' | 'memberName'
> | null => {
  if (!data) return null;
  const ws = clean(data.workflowStatus);
  const status = clean(data.status);
  const cancelled =
    Boolean((data as any)?.workflowInvites?.cancelledAt) ||
    Boolean((data as any)?.swInviteCancelledAtIso) ||
    status.toLowerCase().includes('sw_invite_cancelled') ||
    ws.toLowerCase().includes('sw_invite_cancelled');
  // Cancelled invites are not active SW requests (unless a newer invite was sent afterward).
  if (cancelled && !(data as any)?.workflowSteps?.swInviteSent) return null;

  const invitedAt =
    toIso((data as any)?.workflowInvites?.invitedAt) ||
    toIso((data as any)?.workflowStepsAt?.swInviteSentAt) ||
    '';
  const emailLog = Array.isArray((data as any)?.swEmailDeliveryLog)
    ? ((data as any).swEmailDeliveryLog as any[])
    : [];
  const sentLog = emailLog.find((entry) => clean(entry?.status).toLowerCase() === 'sent');
  const inviteSent =
    Boolean((data as any)?.workflowSteps?.swInviteSent) ||
    Boolean(invitedAt) ||
    Boolean(sentLog) ||
    ws.toLowerCase().includes('sw_invited') ||
    ws.toLowerCase().includes('sw_form') ||
    status.toLowerCase().includes('sw_invited');
  if (!inviteSent) return null;
  if (cancelled && !(data as any)?.workflowSteps?.swInviteSent) return null;
  const invitedTo =
    resolveLastInvitedSwEmail(data as any) ||
    clean(sentLog?.recipientEmail) ||
    clean((data as any)?.assignedSwEmail) ||
    '';
  const hasSubmission = Boolean(
    toIso((data as any)?.submittedAt) ||
      toIso((data as any)?.workflowStepsAt?.swSubmittedAt) ||
      toIso((data as any)?.workflowStepsAt?.swSubmittedSignedAt) ||
      Boolean((data as any)?.workflowSteps?.swSubmittedSigned)
  );
  return {
    invitedAt: invitedAt || clean(sentLog?.atIso) || '',
    invitedTo,
    statusLabel: workflowStatusLabel(ws, status),
    hasSubmission,
  };
};

export type AssignmentInviteActivity = {
  invitedAt?: string;
  lastInvitedAt?: string;
  inviteSendCount?: number;
  invitedTo?: string;
  viewedAt?: string;
  viewedBy?: string;
  submittedAt?: string;
  signedAt?: string;
  emailLog?: Array<{ status?: string; recipientEmail?: string; atIso?: string; isResend?: boolean }>;
  assignmentHistory?: SwAssignmentHistoryEntry[];
};

export const buildAssignmentInviteActivity = (assignment: Record<string, any> | null | undefined): AssignmentInviteActivity => {
  if (!assignment) return {};
  const emailLog = Array.isArray(assignment?.swEmailDeliveryLog)
    ? (assignment.swEmailDeliveryLog as any[])
        .map((entry) => ({
          status: clean(entry?.status),
          recipientEmail: clean(entry?.recipientEmail),
          atIso: clean(entry?.atIso) || toIso(entry?.at) || '',
          isResend: Boolean(entry?.isResend),
        }))
        .filter((entry) => entry.atIso || entry.status)
    : [];
  const sentEntries = emailLog
    .filter((entry) => clean(entry.status).toLowerCase() === 'sent')
    .slice()
    .sort((a, b) => Date.parse(a.atIso || '') - Date.parse(b.atIso || ''));
  const firstSentAt = sentEntries[0]?.atIso || '';
  const lastSentAt = sentEntries[sentEntries.length - 1]?.atIso || '';
  const status = clean(assignment?.status).toLowerCase();
  const workflowStatus = clean(assignment?.workflowStatus || assignment?.workflowStage).toLowerCase();
  const inviteCancelled =
    Boolean(assignment?.workflowInvites?.cancelledAt) ||
    Boolean(assignment?.swInviteCancelledAtIso) ||
    status.includes('sw_invite_cancelled') ||
    workflowStatus.includes('sw_invite_cancelled') ||
    assignment?.workflowSteps?.swInviteSent === false;

  // Active invite only — cancelled requests clear the "Sent to SW" badge so staff can send again.
  if (inviteCancelled && !assignment?.workflowSteps?.swInviteSent) {
    return {
      emailLog,
      viewedAt: toIso(assignment.swPortalLastViewedAt),
      viewedBy: clean(assignment.swPortalLastViewedByName) || clean(assignment.swPortalLastViewedByEmail),
      submittedAt: toIso(assignment.submittedAt) || toIso(assignment?.workflowStepsAt?.swSubmittedAt) || '',
      signedAt: toIso(assignment?.workflowStepsAt?.swSubmittedSignedAt) || toIso(assignment.swSignedAt) || '',
    };
  }

  const invitedAt =
    toIso(assignment?.workflowInvites?.firstInvitedAt) ||
    toIso(assignment?.workflowInvites?.invitedAt) ||
    firstSentAt ||
    toIso(assignment?.workflowStepsAt?.swInviteSentAt) ||
    '';
  const lastInvitedAt =
    toIso(assignment?.workflowInvites?.lastInvitedAt) ||
    lastSentAt ||
    toIso(assignment?.workflowStepsAt?.swInviteSentAt) ||
    invitedAt;
  const inviteSendCountRaw = Number(assignment?.workflowInvites?.inviteSendCount);
  const inviteSendCount =
    Number.isFinite(inviteSendCountRaw) && inviteSendCountRaw > 0
      ? inviteSendCountRaw
      : Math.max(sentEntries.length, invitedAt ? 1 : 0);
  return {
    invitedAt,
    lastInvitedAt: lastInvitedAt || invitedAt,
    inviteSendCount,
    invitedTo:
      resolveLastInvitedSwEmail(assignment) ||
      clean(sentEntries[sentEntries.length - 1]?.recipientEmail) ||
      clean(assignment.assignedSwEmail) ||
      clean(emailLog.find((e) => e.status === 'sent')?.recipientEmail),
    viewedAt: toIso(assignment.swPortalLastViewedAt),
    viewedBy: clean(assignment.swPortalLastViewedByName) || clean(assignment.swPortalLastViewedByEmail),
    submittedAt: toIso(assignment.submittedAt) || toIso(assignment?.workflowStepsAt?.swSubmittedAt) || '',
    signedAt: toIso(assignment?.workflowStepsAt?.swSubmittedSignedAt) || toIso(assignment.swSignedAt) || '',
    emailLog,
    assignmentHistory: buildDisplaySwAssignmentHistory(assignment),
  };
};

export const inferClinicalFileLabel = (fileName: string, explicitLabel?: string) => {
  const label = clean(explicitLabel);
  if (label) return label;
  const lower = clean(fileName).toLowerCase();
  if (/\b602\b/.test(lower)) return '602';
  if (lower.includes('medicine') || lower.includes('medication') || lower.includes('med list')) {
    return 'Medicine List';
  }
  if (lower.includes('facesheet') || lower.includes('face sheet') || lower.includes('face-sheet')) {
    return 'Facesheet';
  }
  if (lower.includes('h&p') || lower.includes('h and p') || lower.includes('history and physical')) {
    return 'H&P';
  }
  if (lower.includes('mar')) return 'MAR';
  return '';
};
