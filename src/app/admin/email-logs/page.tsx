'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

type EmailLogEntry = {
  id: string;
  createdAt?: any;
  status?: 'success' | 'failure' | string;
  from?: string;
  template?: string;
  source?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  provider?: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

function toDateLabel(value: any): string {
  if (!value) return 'Unknown';
  const date =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function toDateValue(value: any): Date | null {
  if (!value) return null;
  const date =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function AdminEmailLogsPageContent() {
  const { isAdmin, isUserLoading } = useAdmin();
  const firestore = useFirestore();
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [openDetailsById, setOpenDetailsById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!firestore || !isAdmin) {
      setIsLoading(false);
      return;
    }

    const q = query(collection(firestore, 'emailLogs'), orderBy('createdAt', 'desc'), limit(500));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EmailLogEntry[];
        setLogs(next);
        setIsLoading(false);
      },
      () => {
        setLogs([]);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((row) => {
      const status = String(row.status || '').toLowerCase();
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      if (dateFrom || dateTo) {
        const createdAt = toDateValue(row.createdAt);
        if (!createdAt) return false;
        const createdMs = createdAt.getTime();
        if (dateFrom) {
          const fromMs = new Date(`${dateFrom}T00:00:00`).getTime();
          if (!Number.isNaN(fromMs) && createdMs < fromMs) return false;
        }
        if (dateTo) {
          const toMs = new Date(`${dateTo}T23:59:59.999`).getTime();
          if (!Number.isNaN(toMs) && createdMs > toMs) return false;
        }
      }

      if (!needle) return true;
      const hay = [
        String(row.from || ''),
        String(row.subject || ''),
        String(row.template || ''),
        String(row.source || ''),
        String(row.provider || ''),
        String(row.errorMessage || ''),
        String((row.metadata?.applicationId as string) || ''),
        String((row.metadata?.memberName as string) || ''),
        String((row.metadata?.sentByName as string) || ''),
        String((row.metadata?.senderEmail as string) || ''),
        ...(Array.isArray(row.to) ? row.to : []),
        ...(Array.isArray(row.cc) ? row.cc : []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [dateFrom, dateTo, logs, search, statusFilter]);

  if (isUserLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="p-6 text-sm text-destructive">Access denied.</div>;
  }

  const toggleDetails = (id: string) => {
    setOpenDetailsById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Email Logs</h1>
          <p className="text-sm text-muted-foreground">Track all outbound emails with success/failure status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/email-logs/introductory-emails">
            <Button variant="outline" size="sm">Introductory Email Logs</Button>
          </Link>
          <Link href="/admin/email-logs/kaiser-referrals">
            <Button variant="outline" size="sm">Kaiser Referral Logs</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery History</CardTitle>
          <CardDescription>Most recent 500 records from the email log.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>
              All
            </Button>
            <Button variant={statusFilter === 'success' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('success')}>
              Success
            </Button>
            <Button variant={statusFilter === 'failure' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('failure')}>
              Failure
            </Button>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient, subject, template, error..."
              className="min-w-[260px] max-w-md"
            />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[160px]"
              aria-label="Start date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[160px]"
              aria-label="End date"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              disabled={!dateFrom && !dateTo}
            >
              Clear Dates
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading email logs...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No email logs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Member</th>
                    <th className="py-2 pr-3">To</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const rowId = row.id;
                    const isOpen = Boolean(openDetailsById[rowId]);
                    return (
                      <Fragment key={rowId}>
                        <tr className="border-b align-top">
                          <td className="py-2 pr-3 whitespace-nowrap">{toDateLabel(row.createdAt)}</td>
                          <td className="py-2 pr-3">
                            <Badge
                              variant="outline"
                              className={
                                String(row.status || '').toLowerCase() === 'success'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }
                            >
                              {String(row.status || 'unknown')}
                            </Badge>
                          </td>
                          <td className="max-w-[180px] truncate py-2 pr-3">{String((row.metadata?.memberName as string) || 'N/A')}</td>
                          <td className="max-w-[220px] truncate py-2 pr-3">
                            {Array.isArray(row.to) && row.to.length > 0 ? row.to.join(', ') : 'N/A'}
                          </td>
                          <td className="max-w-[320px] truncate py-2 pr-3">{String(row.subject || 'N/A')}</td>
                          <td className="py-2 pr-3 text-right">
                            <Button type="button" variant="outline" size="sm" onClick={() => toggleDetails(rowId)}>
                              {isOpen ? 'Close details' : 'Open details'}
                            </Button>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="grid gap-2 text-sm md:grid-cols-2">
                                <div><span className="font-medium">Sender:</span> {String(row.from || 'N/A')}</div>
                                <div><span className="font-medium">Sent By:</span> {String((row.metadata?.sentByName as string) || 'N/A')}</div>
                                <div><span className="font-medium">Sender Email:</span> {String((row.metadata?.senderEmail as string) || 'N/A')}</div>
                                <div><span className="font-medium">Application:</span> {String((row.metadata?.applicationId as string) || 'N/A')}</div>
                                <div className="md:col-span-2">
                                  <span className="font-medium">To:</span>{' '}
                                  {Array.isArray(row.to) && row.to.length > 0 ? row.to.join(', ') : 'N/A'}
                                </div>
                                <div className="md:col-span-2">
                                  <span className="font-medium">CC:</span>{' '}
                                  {Array.isArray(row.cc) && row.cc.length > 0 ? row.cc.join(', ') : 'N/A'}
                                </div>
                                <div className="md:col-span-2">
                                  <span className="font-medium">BCC:</span>{' '}
                                  {Array.isArray(row.bcc) && row.bcc.length > 0 ? row.bcc.join(', ') : 'N/A'}
                                </div>
                                <div><span className="font-medium">Template:</span> {String(row.template || 'N/A')}</div>
                                <div><span className="font-medium">Source:</span> {String(row.source || 'N/A')}</div>
                                <div><span className="font-medium">Provider:</span> {String(row.provider || 'N/A')}</div>
                                <div><span className="font-medium">Provider ID:</span> {String(row.providerMessageId || 'N/A')}</div>
                                <div className="md:col-span-2">
                                  <span className="font-medium">Error:</span>{' '}
                                  {row.errorMessage ? (
                                    <span className="text-red-700">{String(row.errorMessage)}</span>
                                  ) : (
                                    'None'
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminEmailLogsPage() {
  return (
    <FirebaseClientProvider>
      <AdminEmailLogsPageContent />
    </FirebaseClientProvider>
  );
}

