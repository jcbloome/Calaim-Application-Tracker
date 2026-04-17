'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';
import { PdfPreviewLayout } from '@/components/pdf/PdfPreviewLayout';

type QueueRow = {
  id: string;
  memberName: string;
  memberMrn: string;
  birthDate?: string;
  ilsConnected?: boolean;
  rcfeName?: string;
  rcfeAdminName?: string;
  rcfeAdminEmail?: string;
  requestedDate: string;
};

type ReportPayload = {
  reportDate: string;
  comments: string;
  totalMembers: number;
  includeT2038: boolean;
  reportTitle: string;
  generatedAtIso?: string;
  queues: {
    t2038Requested: QueueRow[];
    t2038ReceivedUnreachable: QueueRow[];
    tierRequested: QueueRow[];
    tierAppeals: QueueRow[];
    rbPendingIlsContract: QueueRow[];
    t2038AuthOnly: QueueRow[];
  };
  h2022AuthDates?: {
    withDates: QueueRow[];
    withoutDates: QueueRow[];
    finalRcfeMissingDates?: QueueRow[];
    finalAtRcfeWithDates?: QueueRow[];
    finalAtRcfeWithoutDates?: QueueRow[];
  };
};

type WorkingMember = {
  id: string;
  memberName: string;
  memberMrn: string;
  birthDate?: string;
  client_ID2: string;
  Kaiser_Status: string;
  Kaiser_T2038_Requested_Date?: string;
  Kaiser_T2038_Requested?: string;
  Kaiser_T2038_Received_Date?: string;
  Kaiser_Tier_Level_Requested?: string;
  Kaiser_Tier_Level_Requested_Date?: string;
  Kaiser_Tier_Level_Received_Date?: string;
  Kaiser_H2022_Requested?: string;
  Kaiser_H2022_Received?: string;
  RCFE_Name?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Email?: string;
  ILS_Connected?: string;
  Authorization_Start_Date_H2022?: string;
  Authorization_End_Date_H2022?: string;
  T2038_Auth_Email_Kaiser?: string;
};

const hasMeaningfulValue = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['null', 'undefined', 'n/a'].includes(normalized);
};

const toYmd = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, '0');
    const dd = String(us[2]).padStart(2, '0');
    const yyyy = String(us[3]);
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const formatYmd = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  try {
    return format(new Date(`${raw}T00:00:00`), 'MM/dd/yyyy');
  } catch {
    return raw;
  }
};

const formatDateTime = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  try {
    return format(new Date(raw), 'MMMM dd, yyyy HH:mm');
  } catch {
    return raw;
  }
};

const ymdSortKey = (value?: string) => toYmd(value) || '9999-12-31';

const normalizeStatus = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isIlsConnected = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1';
};

const isFinalMemberAtRcfe = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'final member at rcfe' || normalized === 'final at rcfe';
};

const isRbPendingOrFinalAtRcfeStatus = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return (
    normalized === 'r b sent pending ils contract' ||
    normalized === 'r b pending ils contract' ||
    normalized === 'final member at rcfe' ||
    normalized === 'final at rcfe'
  );
};

const getEffectiveKaiserStatus = (member: any): string => {
  const hasAuthEmail = hasMeaningfulValue(member?.T2038_Auth_Email_Kaiser);
  const hasOfficialAuth =
    hasMeaningfulValue(member?.Kaiser_T2038_Received_Date) ||
    hasMeaningfulValue(member?.Kaiser_T038_Received) ||
    hasMeaningfulValue(member?.Kaiser_T2038_Received);
  if (hasAuthEmail && !hasOfficialAuth) return 'T2038_Auth_Email_Kaiser';
  return String(member?.Kaiser_Status || '');
};

const queueIncludes = (
  member: WorkingMember,
  key:
    | 't2038_auth_only_email'
    | 't2038_requested'
    | 't2038_received_unreachable'
    | 'tier_level_requested'
    | 'tier_level_appeals'
    | 'rb_sent_pending_ils_contract'
) => {
  const status = normalizeStatus(member.Kaiser_Status);
  if (key === 't2038_auth_only_email') {
    const hasAuthEmail = hasMeaningfulValue((member as any)?.T2038_Auth_Email_Kaiser);
    const hasOfficialAuth =
      hasMeaningfulValue((member as any)?.Kaiser_T2038_Received_Date) ||
      hasMeaningfulValue((member as any)?.Kaiser_T038_Received) ||
      hasMeaningfulValue((member as any)?.Kaiser_T2038_Received);
    return hasAuthEmail && !hasOfficialAuth;
  }
  if (key === 't2038_requested') {
    const requested = Boolean(toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date));
    const received = Boolean(
      toYmd(
        (member as any).Kaiser_T2038_Received_Date ||
          (member as any).Kaiser_T2038_Received ||
          (member as any).Kaiser_T038_Received
      )
    );
    return requested && !received;
  }
  if (key === 't2038_received_unreachable') {
    const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
    return compactStatus === 't2038 received unreachable';
  }
  if (key === 'tier_level_requested') {
    const requested = Boolean(toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date));
    const received = Boolean(
      toYmd(
        (member as any).Kaiser_Tier_Level_Received_Date ||
          (member as any).Kaiser_Tier_Level_Received ||
          (member as any).Tier_Level_Received_Date ||
          (member as any).Tier_Received_Date
      )
    );
    return requested && !received;
  }
  if (key === 'tier_level_appeals') {
    const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
    return compactStatus === 'tier level appeals' || compactStatus === 'tier level appeal';
  }
  const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
  const rbPendingByStatus =
    status === 'r&b sent pending ils contract' ||
    status === 'r & b sent pending ils contract' ||
    compactStatus === 'final member at rcfe' ||
    compactStatus === 'final at rcfe';
  const rbRequested = Boolean(toYmd(member.Kaiser_H2022_Requested));
  const rbReceived = hasMeaningfulValue(member.Kaiser_H2022_Received) || Boolean(toYmd(member.Kaiser_H2022_Received));
  return (rbPendingByStatus || rbRequested) && !rbReceived;
};

const queueRequestedDate = (
  member: WorkingMember,
  key:
    | 't2038_auth_only_email'
    | 't2038_requested'
    | 't2038_received_unreachable'
    | 'tier_level_requested'
    | 'tier_level_appeals'
    | 'rb_sent_pending_ils_contract'
) => {
  if (key === 't2038_requested') return toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date);
  if (key === 't2038_received_unreachable')
    return toYmd(
      (member as any).Kaiser_T2038_Received_Date ||
        (member as any).Kaiser_T2038_Received ||
        (member as any).Kaiser_T038_Received
    );
  if (key === 'tier_level_requested') return toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date);
  if (key === 'tier_level_appeals') return toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date);
  if (key === 't2038_auth_only_email') return toYmd(member.Kaiser_T2038_Requested_Date);
  return toYmd(member.Kaiser_H2022_Requested);
};

const toQueueRow = (member: WorkingMember, requestedDate: string): QueueRow => ({
  id: String(member.id || ''),
  memberName: String(member.memberName || '').trim(),
  memberMrn: String(member.memberMrn || '').trim(),
  birthDate: toYmd(member.birthDate),
  ilsConnected: isIlsConnected((member as any).ILS_Connected),
  rcfeName: String(member.RCFE_Name || '').trim(),
  rcfeAdminName: String(member.RCFE_Admin_Name || '').trim(),
  rcfeAdminEmail: String(member.RCFE_Admin_Email || '').trim(),
  requestedDate,
});

const buildPayload = (members: WorkingMember[], reportDate: string, reportTitle: string): ReportPayload => {
  const makeRows = (
    key:
      | 't2038_auth_only_email'
      | 't2038_requested'
      | 't2038_received_unreachable'
      | 'tier_level_requested'
      | 'tier_level_appeals'
      | 'rb_sent_pending_ils_contract'
  ) =>
    members
      .filter((m) => queueIncludes(m, key))
      .map((m) => toQueueRow(m, queueRequestedDate(m, key)))
      .sort((a, b) => {
        const ad = ymdSortKey(a.requestedDate);
        const bd = ymdSortKey(b.requestedDate);
        if (ad !== bd) return ad.localeCompare(bd);
        return a.memberName.localeCompare(b.memberName);
      });

  const queues = {
    t2038Requested: makeRows('t2038_requested'),
    t2038ReceivedUnreachable: makeRows('t2038_received_unreachable'),
    tierRequested: makeRows('tier_level_requested'),
    tierAppeals: makeRows('tier_level_appeals'),
    rbPendingIlsContract: makeRows('rb_sent_pending_ils_contract'),
    t2038AuthOnly: makeRows('t2038_auth_only_email'),
  };

  const h2022AuthEligible = members.filter((m) =>
    isRbPendingOrFinalAtRcfeStatus(getEffectiveKaiserStatus(m) || m.Kaiser_Status)
  );
  const withDates = h2022AuthEligible
    .filter(
      (m) =>
        Boolean(toYmd((m as any).Authorization_Start_Date_H2022)) &&
        Boolean(toYmd((m as any).Authorization_End_Date_H2022))
    )
    .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)));
  const withoutDates = h2022AuthEligible
    .filter(
      (m) =>
        !toYmd((m as any).Authorization_Start_Date_H2022) ||
        !toYmd((m as any).Authorization_End_Date_H2022)
    )
    .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)));
  const finalAtRcfeWithDates = h2022AuthEligible
    .filter(
      (m) =>
        isFinalMemberAtRcfe(getEffectiveKaiserStatus(m) || m.Kaiser_Status) &&
        Boolean(toYmd((m as any).Authorization_Start_Date_H2022)) &&
        Boolean(toYmd((m as any).Authorization_End_Date_H2022))
    )
    .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)));
  const finalAtRcfeWithoutDates = h2022AuthEligible
    .filter(
      (m) =>
        isFinalMemberAtRcfe(getEffectiveKaiserStatus(m) || m.Kaiser_Status) &&
        (!toYmd((m as any).Authorization_Start_Date_H2022) || !toYmd((m as any).Authorization_End_Date_H2022))
    )
    .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)));
  const finalRcfeMissingDates = finalAtRcfeWithoutDates;

  const totalMembers = new Set<string>([
    ...queues.t2038Requested.map((r) => r.id).filter(Boolean),
    ...queues.t2038ReceivedUnreachable.map((r) => r.id).filter(Boolean),
    ...queues.tierRequested.map((r) => r.id).filter(Boolean),
    ...queues.tierAppeals.map((r) => r.id).filter(Boolean),
    ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
    ...queues.t2038AuthOnly.map((r) => r.id).filter(Boolean),
    ...withDates.map((r) => r.id).filter(Boolean),
    ...withoutDates.map((r) => r.id).filter(Boolean),
  ]).size;

  return {
    reportDate,
    comments: '',
    totalMembers,
    includeT2038: false,
    reportTitle,
    generatedAtIso: new Date().toISOString(),
    queues,
    h2022AuthDates: {
      withDates: withDates.sort((a, b) => a.memberName.localeCompare(b.memberName)),
      withoutDates: withoutDates.sort((a, b) => a.memberName.localeCompare(b.memberName)),
      finalRcfeMissingDates: finalRcfeMissingDates.sort((a, b) => a.memberName.localeCompare(b.memberName)),
      finalAtRcfeWithDates: finalAtRcfeWithDates.sort((a, b) => a.memberName.localeCompare(b.memberName)),
      finalAtRcfeWithoutDates: finalAtRcfeWithoutDates.sort((a, b) => a.memberName.localeCompare(b.memberName)),
    },
  };
};

function IlsReportPrintableDocument({ payload }: { payload: ReportPayload }) {
  const cards = useMemo(() => {
    return [
      { label: 'T2038 Auth Only Email (no received auth)', rows: payload.queues.t2038AuthOnly, key: 't2038' as const, showIlsConnected: false },
      { label: 'T2038 Requested', rows: payload.queues.t2038Requested, key: 't2038req' as const, showIlsConnected: false },
      { label: 'T2038 Received, Unreachable', rows: payload.queues.t2038ReceivedUnreachable || [], key: 't2038Unreachable' as const, showIlsConnected: false },
      { label: 'Tier Level Requested', rows: payload.queues.tierRequested, key: 'tier' as const, showIlsConnected: false },
      { label: 'Tier Level Appeals', rows: payload.queues.tierAppeals, key: 'tierAppeals' as const, showIlsConnected: false },
      { label: 'R & B Sent Pending ILS Contract', rows: payload.queues.rbPendingIlsContract, key: 'rb' as const, showIlsConnected: true },
      { label: 'Final- At RCFE With H2022 Dates', rows: payload.h2022AuthDates?.finalAtRcfeWithDates || [], key: 'finalRcfeWithDates' as const, showIlsConnected: true },
      { label: 'Final- At RCFE Without H2022 Dates', rows: payload.h2022AuthDates?.finalAtRcfeWithoutDates || [], key: 'finalRcfeWithoutDates' as const, showIlsConnected: true },
    ];
  }, [payload]);

  return (
    <div className="ils-print-root printable-package-section mx-auto max-w-[1100px] p-4 print:max-w-none print:p-0">
      <div className="border-b-2 border-blue-600 pb-3 text-center">
        <h1 className="text-2xl font-semibold">{payload.reportTitle || 'ILS Pending Tracker Report'}</h1>
        <div className="text-sm text-muted-foreground">Report Date: {formatYmd(payload.reportDate)}</div>
        <div className="text-sm text-muted-foreground">Kaiser bottleneck members</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border px-3 py-1 text-xs"><strong>Total members in queues:</strong> {payload.totalMembers}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>T2038 Auth Only Email (no received auth):</strong> {payload.queues.t2038AuthOnly.length}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>T2038 Requested:</strong> {payload.queues.t2038Requested.length}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>T2038 Received, Unreachable:</strong> {(payload.queues.t2038ReceivedUnreachable || []).length}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>Tier Level Requested:</strong> {payload.queues.tierRequested.length}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>Tier Level Appeals:</strong> {payload.queues.tierAppeals.length}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>R &amp; B Pending ILS Contract:</strong> {payload.queues.rbPendingIlsContract.length}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>H2022 Auth Dates (With):</strong> {Array.isArray(payload.h2022AuthDates?.withDates) ? payload.h2022AuthDates!.withDates.length : 0}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>H2022 Auth Dates (Without):</strong> {Array.isArray(payload.h2022AuthDates?.withoutDates) ? payload.h2022AuthDates!.withoutDates.length : 0}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>Final at RCFE Missing H2022 Dates:</strong> {Array.isArray(payload.h2022AuthDates?.finalRcfeMissingDates) ? payload.h2022AuthDates!.finalRcfeMissingDates!.length : 0}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>Final- At RCFE With H2022 Dates:</strong> {Array.isArray(payload.h2022AuthDates?.finalAtRcfeWithDates) ? payload.h2022AuthDates!.finalAtRcfeWithDates!.length : 0}</span>
        <span className="rounded-full border px-3 py-1 text-xs"><strong>Final- At RCFE Without H2022 Dates:</strong> {Array.isArray(payload.h2022AuthDates?.finalAtRcfeWithoutDates) ? payload.h2022AuthDates!.finalAtRcfeWithoutDates!.length : 0}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        {cards.map((card) => (
          <div key={card.key} className="rounded border p-3">
            <h2 className="mb-2 text-sm font-semibold">{card.label} ({card.rows.length})</h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border bg-slate-100 p-1 text-left">Member</th>
                  <th className="border bg-slate-100 p-1 text-left">MRN / Birth Date</th>
                  {card.showIlsConnected ? <th className="border bg-slate-100 p-1 text-left">ILS Connected</th> : null}
                  <th className="border bg-slate-100 p-1 text-left">Request Date</th>
                </tr>
              </thead>
              <tbody>
                {card.rows.length === 0 ? (
                  <tr><td colSpan={card.showIlsConnected ? 4 : 3} className="border p-2 text-muted-foreground">None</td></tr>
                ) : (
                  card.rows.map((row) => (
                    <tr key={`${card.key}-${row.id}`}>
                      <td className="border p-1 align-top">
                        <div className="font-semibold">{row.memberName || '-'}</div>
                        {card.key === 'rb' ? (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            <div>RCFE: {row.rcfeName || '-'}</div>
                            <div>RCFE Admin Name: {row.rcfeAdminName || '-'}</div>
                            <div>RCFE Admin Email: {row.rcfeAdminEmail || '-'}</div>
                          </div>
                        ) : null}
                      </td>
                      <td className="border p-1 align-top">
                        {row.memberMrn || '-'}
                        <div className="text-[10px] text-muted-foreground">Birth Date: {formatYmd(row.birthDate)}</div>
                      </td>
                      {card.showIlsConnected ? (
                        <td className="border p-1 align-top">
                          <span className={row.ilsConnected ? 'ils-conn-yes' : 'ils-conn-no'}>
                            {row.ilsConnected ? '● Yes' : '● No'}
                          </span>
                        </td>
                      ) : null}
                      <td className="border p-1 align-top">{formatYmd(row.requestedDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t pt-2 text-xs text-muted-foreground">
        <p><strong>Generated on:</strong> {formatDateTime(payload.generatedAtIso)} | CalAIM Tracker System</p>
        <p><strong>Total members in queues:</strong> {payload.totalMembers}</p>
        <p><strong>Report period:</strong> {formatYmd(payload.reportDate)}</p>
      </div>
    </div>
  );
}

export default function IlsReportPrintablePage() {
  const searchParams = useSearchParams();
  const reportDateParam = String(searchParams.get('reportDate') || '').trim();
  const titleParam = String(searchParams.get('title') || '').trim();
  const isPdfView = String(searchParams.get('view') || '').toLowerCase() === 'pdf';

  const captureRef = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch('/api/kaiser-members');
        const data = await response.json().catch(() => ({} as any));
        if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
          throw new Error(data?.error || `Failed to load report data (HTTP ${response.status})`);
        }

        const processedMembers: WorkingMember[] = data.members.map((member: any) => {
          const effectiveStatus = getEffectiveKaiserStatus(member) || member.Kaiser_Status;
          return {
            id: String(member.id || member.Client_ID2 || ''),
            memberName: `${String(member.memberFirstName || '').trim()} ${String(member.memberLastName || '').trim()}`.trim(),
            memberMrn: String(member.memberMrn || '').trim(),
            birthDate: toYmd(member.Birth_Date || member.birthDate),
            client_ID2: String(member.client_ID2 || member.Client_ID2 || ''),
            Kaiser_Status: String(effectiveStatus || ''),
            Kaiser_T2038_Requested: toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Requested_Date: toYmd(member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Received_Date: toYmd(member.Kaiser_T2038_Received_Date || member.Kaiser_T2038_Received || member.Kaiser_T038_Received),
            Kaiser_Tier_Level_Requested: toYmd(
              member.Kaiser_Tier_Level_Requested ||
                member.Kaiser_Tier_Level_Requested_Date ||
                member.Tier_Level_Request_Date ||
                member.Tier_Level_Requested_Date ||
                member.Tier_Request_Date
            ),
            Kaiser_Tier_Level_Requested_Date: toYmd(
              member.Kaiser_Tier_Level_Requested ||
                member.Kaiser_Tier_Level_Requested_Date ||
                member.Tier_Level_Request_Date ||
                member.Tier_Level_Requested_Date ||
                member.Tier_Request_Date
            ),
            Kaiser_Tier_Level_Received_Date: toYmd(
              member.Kaiser_Tier_Level_Received_Date ||
                member.Kaiser_Tier_Level_Received ||
                member.Tier_Level_Received_Date ||
                member.Tier_Received_Date
            ),
            Kaiser_H2022_Requested: toYmd(member.Kaiser_H2022_Requested),
            Kaiser_H2022_Received: toYmd(member.Kaiser_H2022_Received),
            RCFE_Name: String(member.RCFE_Name || '').trim(),
            RCFE_Admin_Name: String(member.RCFE_Admin_Name || member.RCFE_Administrator || '').trim(),
            RCFE_Admin_Email: String(member.RCFE_Admin_Email || member.RCFE_Administrator_Email || '').trim(),
            ILS_Connected: String(member.ILS_Connected || '').trim(),
            Authorization_Start_Date_H2022: toYmd(member.Authorization_Start_Date_H2022),
            Authorization_End_Date_H2022: toYmd(member.Authorization_End_Date_H2022),
            T2038_Auth_Email_Kaiser: String(member.T2038_Auth_Email_Kaiser || '').trim(),
          };
        });

        const filteredMembers = processedMembers.filter(
          (m) =>
            queueIncludes(m, 't2038_auth_only_email') ||
            queueIncludes(m, 't2038_requested') ||
            queueIncludes(m, 't2038_received_unreachable') ||
            queueIncludes(m, 'tier_level_requested') ||
            queueIncludes(m, 'tier_level_appeals') ||
            queueIncludes(m, 'rb_sent_pending_ils_contract') ||
            isRbPendingOrFinalAtRcfeStatus(getEffectiveKaiserStatus(m) || m.Kaiser_Status)
        );

        const reportDate = reportDateParam || format(new Date(), 'yyyy-MM-dd');
        const reportTitle = titleParam || 'ILS Pending Tracker Report';
        setPayload(buildPayload(filteredMembers, reportDate, reportTitle));
      } catch (e: any) {
        setError(e?.message || 'Failed to load report data');
      } finally {
        setIsLoading(false);
      }
    };
    load().catch(() => setIsLoading(false));
  }, [reportDateParam, titleParam]);

  const generatePreviewPdf = async () => {
    if (!captureRef.current) return;
    setPdfLoading(true);
    setPdfError('');
    try {
      const sections = Array.from(captureRef.current.querySelectorAll('.printable-package-section')) as HTMLElement[];
      const bytes = await generatePdfFromHtmlSections(sections, {
        stampPageNumbers: true,
        headerText: 'ILS Pending Tracker Report',
        options: { marginIn: 0.35, scale: 2, format: 'letter', orientation: 'portrait' },
      });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e: any) {
      setPdfError(String(e?.message || 'Could not generate PDF preview.'));
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (!isPdfView) return;
    if (!payload) return;
    void generatePreviewPdf();
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdfView, payload]);

  const viewerHref = useMemo(() => {
    const params = new URLSearchParams();
    if (reportDateParam) params.set('reportDate', reportDateParam);
    if (titleParam) params.set('title', titleParam);
    params.set('view', 'pdf');
    return `/admin/ils-report-editor/printable?${params.toString()}`;
  }, [reportDateParam, titleParam]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading report preview...
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-3 text-lg font-semibold">Report not available</div>
        <div className="text-sm text-muted-foreground">{error || 'Could not build printable report preview.'}</div>
        <div className="mt-4">
          <Button variant="outline" asChild>
            <Link href="/admin/ils-report-editor">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to ILS Pending Tracker
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PdfPreviewLayout
        isPdfView={isPdfView}
        viewPdfHref={viewerHref}
        backToEditorHref="/admin/ils-report-editor"
        backButtonLabel="Return to ILS Pending Tracker"
        showBackButtonInHtmlView
        printHref={viewerHref}
        captureRef={captureRef}
        captureContent={<IlsReportPrintableDocument payload={payload} />}
        htmlContent={<IlsReportPrintableDocument payload={payload} />}
        pdfUrl={pdfUrl}
        pdfLoading={pdfLoading}
        pdfError={pdfError}
        previewTitle="ILS pending report PDF preview"
        loadingText={pdfLoading ? 'Generating PDF preview…' : 'PDF preview not available yet.'}
        wrapperClassName="mx-auto w-full max-w-6xl space-y-3 p-4"
        htmlWrapperClassName="mx-auto w-full max-w-[1100px] space-y-4 p-4"
        captureWidthPx={1120}
      />
      <style jsx global>{`
        .ils-conn-yes {
          color: #15803d;
          font-weight: 600;
        }
        .ils-conn-no {
          color: #dc2626;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

