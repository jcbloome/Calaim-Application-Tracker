'use client';

import { useEffect, useMemo, useState } from 'react';
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
  subject?: string;
  errorMessage?: string | null;
  providerMessageId?: string | null;
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

function IntroductoryEmailLogsPageContent() {
  const { isAdmin, isUserLoading } = useAdmin();
  const firestore = useFirestore();
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !isAdmin) {
      setIsLoading(false);
      return;
    }

    const q = query(collection(firestore, 'emailLogs'), orderBy('createdAt', 'desc'), limit(1000));
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
    return logs
      .filter((row) => {
        const template = String(row.template || '').toLowerCase();
        const source = String(row.source || '').toLowerCase();
        return (
          template === 'introductory_application_invite' ||
          source.includes('/admin/send-introductory-email')
        );
      })
      .filter((row) => {
        const status = String(row.status || '').toLowerCase();
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (!needle) return true;
        const hay = [
          String(row.from || ''),
          String(row.subject || ''),
          String(row.errorMessage || ''),
          String(row.providerMessageId || ''),
          String((row.metadata?.applicationId as string) || ''),
          String((row.metadata?.memberName as string) || ''),
          String((row.metadata?.sentByName as string) || ''),
          String((row.metadata?.senderEmail as string) || ''),
          String((row.metadata?.senderWarning as string) || ''),
          ...(Array.isArray(row.to) ? row.to : []),
          ...(Array.isArray(row.cc) ? row.cc : []),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      });
  }, [logs, search, statusFilter]);

  if (isUserLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="p-6 text-sm text-destructive">Access denied.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Introductory Email Logs</h1>
          <p className="text-sm text-muted-foreground">
            Audit introductory family invite email delivery attempts and outcomes.
          </p>
        </div>
        <Link href="/admin/email-logs">
          <Button variant="outline" size="sm">Back to All Email Logs</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Introductory Delivery History</CardTitle>
          <CardDescription>
            Includes sent time, sender, recipients, application id, status, provider id, and failure details.
          </CardDescription>
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
              placeholder="Search by application id, member, recipient, sender, or error..."
              className="min-w-[260px] max-w-md"
            />
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading introductory email logs...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No introductory email logs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Sender</th>
                    <th className="py-2 pr-3">Sent By</th>
                    <th className="py-2 pr-3">Sender Email</th>
                    <th className="py-2 pr-3">To</th>
                    <th className="py-2 pr-3">Application ID</th>
                    <th className="py-2 pr-3">Member</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Provider Message ID</th>
                    <th className="py-2 pr-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b align-top">
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
                      <td className="py-2 pr-3">{String(row.from || 'N/A')}</td>
                      <td className="py-2 pr-3">{String((row.metadata?.sentByName as string) || 'N/A')}</td>
                      <td className="py-2 pr-3">{String((row.metadata?.senderEmail as string) || 'N/A')}</td>
                      <td className="py-2 pr-3">{Array.isArray(row.to) && row.to.length > 0 ? row.to.join(', ') : 'N/A'}</td>
                      <td className="py-2 pr-3">{String((row.metadata?.applicationId as string) || 'N/A')}</td>
                      <td className="py-2 pr-3">{String((row.metadata?.memberName as string) || 'N/A')}</td>
                      <td className="py-2 pr-3">{String(row.subject || 'N/A')}</td>
                      <td className="py-2 pr-3">{String(row.providerMessageId || 'N/A')}</td>
                      <td className="py-2 pr-3 text-red-700">{row.errorMessage ? String(row.errorMessage) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function IntroductoryEmailLogsPage() {
  return (
    <FirebaseClientProvider>
      <IntroductoryEmailLogsPageContent />
    </FirebaseClientProvider>
  );
}
