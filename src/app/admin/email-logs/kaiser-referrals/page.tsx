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
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

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

function parseMemberFromSubject(subject: string): { memberName: string; memberMrn: string } {
  const raw = String(subject || '').trim();
  if (!raw) return { memberName: '', memberMrn: '' };
  const match = raw.match(/for\s+(.+?)\s+and\s+MRN:\s*(.+)$/i);
  if (!match) return { memberName: '', memberMrn: '' };
  return {
    memberName: String(match[1] || '').trim(),
    memberMrn: String(match[2] || '').trim(),
  };
}

function looksLikeEmail(value: string): boolean {
  return value.includes('@') && value.includes('.');
}

function extractMemberLastName(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes(',')) {
    return String(raw.split(',')[0] || '').trim();
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? String(parts[parts.length - 1] || '').trim() : '';
}

function resolveKaiserRegion(row: EmailLogEntry): string {
  const metadataRegion = String((row.metadata?.region as string) || '').trim();
  if (metadataRegion) return metadataRegion;
  const recipient = (Array.isArray(row.to) ? row.to : [])
    .map((v) => String(v || '').trim().toLowerCase())
    .find(Boolean);
  if (recipient === 'regmcdurns-kpnc@kp.org') return 'Kaiser North';
  if (recipient === 'regcarecoordcasemgmt@kp.org') return 'Kaiser South';
  return 'Unknown';
}

function toTimestampMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    try {
      const date = value.toDate();
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    } catch {
      return 0;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function KaiserReferralEmailLogsPageContent() {
  const { isAdmin, isUserLoading } = useAdmin();
  const firestore = useFirestore();
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [sendTypeFilter, setSendTypeFilter] = useState<'all' | 'final' | 'test'>('final');
  const [dateSort, setDateSort] = useState<'newest' | 'oldest'>('newest');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingLogId, setDeletingLogId] = useState('');

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
    const base = logs
      .filter((row) => {
        const template = String(row.template || '').toLowerCase();
        const source = String(row.source || '').toLowerCase();
        return template === 'kaiser-referral-intake' || source.includes('/kaiser-referral/send-intake');
      })
      .filter((row) => {
        const status = String(row.status || '').toLowerCase();
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        const isTestSend = Boolean(row.metadata?.testSend);
        if (sendTypeFilter === 'final' && isTestSend) return false;
        if (sendTypeFilter === 'test' && !isTestSend) return false;
        if (!needle) return true;
        const inferredFromSubject = parseMemberFromSubject(String(row.subject || ''));
        const memberName = String((row.metadata?.memberName as string) || '').trim() || inferredFromSubject.memberName;
        const memberMrn = String((row.metadata?.memberMrn as string) || '').trim() || inferredFromSubject.memberMrn;
        const memberLastName = extractMemberLastName(memberName);
        const hay = [
          String(row.from || ''),
          String((row.metadata?.submitterName as string) || ''),
          String((row.metadata?.submitterEmail as string) || ''),
          String((row.metadata?.referrerName as string) || ''),
          String((row.metadata?.referrerEmail as string) || ''),
          memberName,
          memberLastName,
          memberMrn,
          resolveKaiserRegion(row),
          String(row.subject || ''),
          String(row.errorMessage || ''),
          ...(Array.isArray(row.to) ? row.to : []),
          ...(Array.isArray(row.cc) ? row.cc : []),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      });
    base.sort((a, b) => {
      const aMs = toTimestampMs(a.createdAt);
      const bMs = toTimestampMs(b.createdAt);
      return dateSort === 'newest' ? bMs - aMs : aMs - bMs;
    });
    return base;
  }, [dateSort, logs, search, sendTypeFilter, statusFilter]);

  if (isUserLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="p-6 text-sm text-destructive">Access denied.</div>;
  }

  const handleDeleteLog = async (logId: string) => {
    if (!firestore || !logId) return;
    const confirmed = window.confirm('Delete this log entry? This cannot be undone.');
    if (!confirmed) return;
    const verification = window.prompt('Type DELETE to confirm log deletion.');
    if (String(verification || '').trim().toUpperCase() !== 'DELETE') {
      window.alert('Deletion cancelled. Verification text did not match.');
      return;
    }
    setDeletingLogId(logId);
    try {
      await deleteDoc(doc(firestore, 'emailLogs', logId));
    } catch (error) {
      console.error('Failed to delete Kaiser referral log:', error);
      window.alert('Failed to delete log. Please try again.');
    } finally {
      setDeletingLogId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kaiser Referral DataPage</h1>
          <p className="text-sm text-muted-foreground">
            Track generated/sent Kaiser referral forms, staff submitter, and timestamps.
          </p>
        </div>
        <Link href="/admin/email-logs">
          <Button variant="outline" size="sm">Back to All Email Logs</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kaiser Referral Submission History</CardTitle>
          <CardDescription>
            Includes submitted time, submitted by staff, member, recipients, and delivery status.
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
            <Button variant={sendTypeFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSendTypeFilter('all')}>
              All Sends
            </Button>
            <Button variant={sendTypeFilter === 'final' ? 'default' : 'outline'} size="sm" onClick={() => setSendTypeFilter('final')}>
              Final Sends
            </Button>
            <Button variant={sendTypeFilter === 'test' ? 'default' : 'outline'} size="sm" onClick={() => setSendTypeFilter('test')}>
              Test Sends
            </Button>
            <Button variant={dateSort === 'newest' ? 'default' : 'outline'} size="sm" onClick={() => setDateSort('newest')}>
              Date: Newest
            </Button>
            <Button variant={dateSort === 'oldest' ? 'default' : 'outline'} size="sm" onClick={() => setDateSort('oldest')}>
              Date: Oldest
            </Button>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by last name, MRN, staff submitter, recipient, or error..."
              className="min-w-[260px] max-w-md"
            />
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading Kaiser referral email logs...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No Kaiser referral email logs found.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => {
                const submittedByNameRaw =
                  String((row.metadata?.submitterName as string) || (row.metadata?.referrerName as string) || '').trim();
                const submittedByEmail =
                  String((row.metadata?.submitterEmail as string) || (row.metadata?.referrerEmail as string) || '').trim();
                const inferredFromSubject = parseMemberFromSubject(String(row.subject || ''));
                const memberName =
                  String((row.metadata?.memberName as string) || '').trim() ||
                  inferredFromSubject.memberName ||
                  'Unknown (legacy log)';
                const memberMrn =
                  String((row.metadata?.memberMrn as string) || '').trim() ||
                  inferredFromSubject.memberMrn ||
                  'Unknown (legacy log)';
                const submittedByName = submittedByNameRaw && !looksLikeEmail(submittedByNameRaw)
                  ? submittedByNameRaw
                  : 'Unknown staff name';
                const isTestSend = Boolean(row.metadata?.testSend);
                const status = String(row.status || 'unknown').toLowerCase();
                const kaiserRegion = resolveKaiserRegion(row);
                return (
                  <div key={row.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={isTestSend ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                        {isTestSend ? 'Test Send' : 'Final Send'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          status === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }
                      >
                        {status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Submitted {toDateLabel(row.createdAt)}</span>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <div><span className="font-medium">Submitted by:</span> {submittedByName}</div>
                      <div><span className="font-medium">Staff email:</span> {submittedByEmail || 'N/A'}</div>
                      <div><span className="font-medium">Member:</span> {memberName}</div>
                      <div><span className="font-medium">MRN:</span> {memberMrn}</div>
                      <div><span className="font-medium">Region sent:</span> {kaiserRegion}</div>
                      <div><span className="font-medium">To:</span> {Array.isArray(row.to) && row.to.length > 0 ? row.to.join(', ') : 'N/A'}</div>
                    </div>

                    <div className="mt-2 text-sm">
                      <span className="font-medium">CC:</span>{' '}
                      {Array.isArray(row.cc) && row.cc.length > 0 ? row.cc.join(', ') : 'N/A'}
                    </div>

                    <div className="mt-2 text-sm">
                      <span className="font-medium">Subject:</span> {String(row.subject || 'N/A')}
                    </div>

                    {row.errorMessage ? (
                      <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700">
                        <span className="font-medium">Error:</span> {String(row.errorMessage)}
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDeleteLog(row.id)}
                        disabled={deletingLogId === row.id}
                      >
                        {deletingLogId === row.id ? 'Deleting...' : 'Delete Log'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function KaiserReferralEmailLogsPage() {
  return (
    <FirebaseClientProvider>
      <KaiserReferralEmailLogsPageContent />
    </FirebaseClientProvider>
  );
}
