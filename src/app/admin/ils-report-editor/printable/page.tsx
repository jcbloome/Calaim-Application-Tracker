'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';

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
    tierRequested: QueueRow[];
    tierAppeals: QueueRow[];
    rbPendingIlsContract: QueueRow[];
    t2038AuthOnly: QueueRow[];
    needMoreContactInfoIls: QueueRow[];
    finalRcfeMissingH2022Dates: QueueRow[];
  };
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

export default function IlsReportPrintablePage() {
  const searchParams = useSearchParams();
  const reportKey = String(searchParams.get('reportKey') || '');
  const autoPrint = String(searchParams.get('autoprint') || '') === '1';
  const [payload, setPayload] = useState<ReportPayload | null>(null);

  useEffect(() => {
    if (!reportKey) return;
    try {
      const raw = localStorage.getItem(reportKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReportPayload;
      setPayload(parsed);
      localStorage.removeItem(reportKey);
    } catch {
      setPayload(null);
    }
  }, [reportKey]);

  useEffect(() => {
    if (!payload || !autoPrint) return;
    const timer = setTimeout(() => window.print(), 120);
    return () => clearTimeout(timer);
  }, [payload, autoPrint]);

  const cards = useMemo(() => {
    if (!payload) return [];
    if (payload.includeT2038) {
      return [
        {
          label: 'T2038 Auth Only Email',
          rows: payload.queues.t2038AuthOnly,
          key: 't2038' as const,
          showIlsConnected: false,
        },
      ];
    }
    return [
      {
        label: 'T2038 Requested',
        rows: payload.queues.t2038Requested,
        key: 't2038req' as const,
        showIlsConnected: false,
      },
      {
        label: 'Tier Level Requested',
        rows: payload.queues.tierRequested,
        key: 'tier' as const,
        showIlsConnected: false,
      },
      {
        label: 'Tier Level Appeals',
        rows: payload.queues.tierAppeals,
        key: 'tierAppeals' as const,
        showIlsConnected: false,
      },
      {
        label: 'R & B Sent Pending ILS Contract',
        rows: payload.queues.rbPendingIlsContract,
        key: 'rb' as const,
        showIlsConnected: true,
      },
      {
        label: 'Need More Contact Info (ILS)',
        rows: payload.queues.needMoreContactInfoIls,
        key: 'needContactInfo' as const,
        showIlsConnected: false,
      },
      {
        label: 'Final at RCFE Missing H2022 Start/End',
        rows: payload.queues.finalRcfeMissingH2022Dates,
        key: 'missingH2022' as const,
        showIlsConnected: true,
      },
    ];
  }, [payload]);

  if (!payload) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-3 text-lg font-semibold">Report not found</div>
        <div className="text-sm text-muted-foreground">
          This printable report payload is missing or expired. Please go back and generate the report again.
        </div>
        <div className="mt-4">
          <Button variant="outline" asChild>
            <Link href="/admin/ils-report-editor">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to ILS Member Requests
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] p-4 print:max-w-none print:p-0 ils-print-root">
      <div className="mb-4 flex items-center justify-between rounded-md border bg-white p-3 print:hidden">
        <Button variant="outline" asChild>
          <Link href="/admin/ils-report-editor">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to ILS Member Requests
          </Link>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="border-b-2 border-blue-600 pb-3 text-center">
        <h1 className="text-2xl font-semibold">{payload.reportTitle || 'ILS Member Requests Report'}</h1>
        <div className="text-sm text-muted-foreground">Report Date: {formatYmd(payload.reportDate)}</div>
        <div className="text-sm text-muted-foreground">Kaiser bottleneck members</div>
      </div>

      {payload.comments ? (
        <div className="my-4 rounded border-l-4 border-blue-600 bg-slate-50 p-3">
          <div className="mb-1 text-sm font-semibold">Report Comments & Notes</div>
          <div className="whitespace-pre-wrap text-sm">{payload.comments}</div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border px-3 py-1 text-xs">
          <strong>Total members in queues:</strong> {payload.totalMembers}
        </span>
        {payload.includeT2038 ? (
          <span className="rounded-full border px-3 py-1 text-xs">
            <strong>T2038 Auth Only Email:</strong> {payload.queues.t2038AuthOnly.length}
          </span>
        ) : (
          <>
            <span className="rounded-full border px-3 py-1 text-xs">
              <strong>T2038 Requested:</strong> {payload.queues.t2038Requested.length}
            </span>
            <span className="rounded-full border px-3 py-1 text-xs">
              <strong>Tier Level Requested:</strong> {payload.queues.tierRequested.length}
            </span>
            <span className="rounded-full border px-3 py-1 text-xs">
              <strong>Tier Level Appeals:</strong> {payload.queues.tierAppeals.length}
            </span>
            <span className="rounded-full border px-3 py-1 text-xs">
              <strong>R &amp; B Pending ILS Contract:</strong> {payload.queues.rbPendingIlsContract.length}
            </span>
            <span className="rounded-full border px-3 py-1 text-xs">
              <strong>Need More Contact Info (ILS):</strong> {payload.queues.needMoreContactInfoIls.length}
            </span>
            <span className="rounded-full border px-3 py-1 text-xs">
              <strong>Final at RCFE Missing H2022:</strong> {payload.queues.finalRcfeMissingH2022Dates.length}
            </span>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <div key={card.key} className="rounded border p-3">
            <h2 className="mb-2 text-sm font-semibold">
              {card.label} ({card.rows.length})
            </h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border bg-slate-100 p-1 text-left">Member</th>
                  <th className="border bg-slate-100 p-1 text-left">MRN / Birth Date</th>
                  {card.showIlsConnected ? (
                    <th className="border bg-slate-100 p-1 text-left">ILS Connected</th>
                  ) : null}
                  <th className="border bg-slate-100 p-1 text-left">Request Date</th>
                </tr>
              </thead>
              <tbody>
                {card.rows.length === 0 ? (
                  <tr>
                    <td colSpan={card.showIlsConnected ? 4 : 3} className="border p-2 text-muted-foreground">
                      None
                    </td>
                  </tr>
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
        <p>
          <strong>Generated on:</strong> {formatDateTime(payload.generatedAtIso)} | CalAIM Tracker System
        </p>
        <p>
          <strong>Total members in queues:</strong> {payload.totalMembers}
        </p>
        <p>
          <strong>Report period:</strong> {formatYmd(payload.reportDate)}
        </p>
      </div>

      <style jsx global>{`
        .ils-conn-yes {
          color: #15803d;
          font-weight: 600;
        }
        .ils-conn-no {
          color: #dc2626;
          font-weight: 600;
        }
        @media print {
          @page {
            size: letter;
            margin: 0.35in;
          }
          body {
            background: #fff !important;
          }
          .ils-print-root {
            max-width: none !important;
            padding: 0 !important;
          }
          .ils-conn-yes,
          .ils-conn-no {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
