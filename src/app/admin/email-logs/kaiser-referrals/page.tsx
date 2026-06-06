'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';

type EmailLogEntry = {
  id: string;
  createdAt?: any;
  authReceived?: boolean;
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

type SortKey = 'submittedAt' | 'submittedBy' | 'memberLastName';

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

function toDateOnlyLabel(value: any): string {
  if (!value) return 'Unknown';
  const date =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
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

function resolveAuthorizationFileUrl(row: EmailLogEntry): string {
  return String((row.metadata?.pdfStorageSignedUrl as string) || '').trim();
}

function resolveReopenGeneratorUrl(row: EmailLogEntry): string {
  const snapshotRaw = row.metadata?.formSnapshot;
  const snapshot =
    snapshotRaw && typeof snapshotRaw === 'object' && !Array.isArray(snapshotRaw)
      ? (snapshotRaw as Record<string, unknown>)
      : null;

  const params = new URLSearchParams();
  const setIfValue = (key: string, value: unknown) => {
    const text = String(value ?? '').trim();
    if (text) params.set(key, text);
  };

  if (snapshot) {
    setIfValue('applicationId', snapshot.applicationId);
    setIfValue('userId', snapshot.userId);
    setIfValue('taskId', snapshot.taskId);
    setIfValue('memberClientId', snapshot.memberClientId);
    setIfValue('referralContext', snapshot.referralContext || 'email_log_reopen');
    setIfValue('memberName', snapshot.memberName);
    setIfValue('memberDob', snapshot.memberDob);
    setIfValue('memberPhone', snapshot.memberPhone);
    setIfValue('memberEmail', snapshot.memberEmail);
    setIfValue('memberAddress', snapshot.memberAddress);
    setIfValue('memberMrn', snapshot.memberMrn);
    setIfValue('memberMediCal', snapshot.memberMediCal);
    setIfValue('caregiverName', snapshot.caregiverName);
    setIfValue('caregiverContact', snapshot.caregiverContact);
    setIfValue('referralDate', snapshot.referralDate);
    setIfValue('referrerName', snapshot.referrerName);
    setIfValue('referrerOrganization', snapshot.referrerOrganization);
    setIfValue('referrerNpi', snapshot.referrerNpi);
    setIfValue('referrerAddress', snapshot.referrerAddress);
    setIfValue('referrerEmail', snapshot.referrerEmail);
    setIfValue('referrerPhone', snapshot.referrerPhone);
    setIfValue('referrerRelationship', snapshot.referrerRelationship);
    setIfValue('currentLocationName', snapshot.currentLocationName);
    setIfValue('currentLocationAddress', snapshot.currentLocationAddress);
    setIfValue('healthPlan', snapshot.healthPlan);
    setIfValue('memberCounty', snapshot.memberCounty);
    setIfValue('kaiserAuthAlreadyReceived', snapshot.kaiserAuthAlreadyReceived);
    setIfValue('alft22Choice', snapshot.alft22Choice);
    setIfValue('section1AlfUsage', snapshot.section1AlfUsage);
  } else {
    setIfValue('applicationId', row.metadata?.applicationId);
    setIfValue('userId', row.metadata?.userId);
    setIfValue('memberClientId', row.metadata?.memberClientId);
    setIfValue('referralContext', 'email_log_reopen');
    setIfValue('memberName', resolveMemberName(row));
    setIfValue('memberMrn', resolveMemberMrn(row));
    setIfValue('memberCounty', row.metadata?.memberCounty);
    setIfValue('referrerName', row.metadata?.referrerName);
    setIfValue('referrerEmail', row.metadata?.referrerEmail);
    setIfValue('referrerRelationship', 'Community Support (CalAIM)');
  }
  setIfValue('returnTo', '/admin/email-logs/kaiser-referrals');
  return `/forms/kaiser-referral/printable?${params.toString()}`;
}

function resolveMemberName(row: EmailLogEntry): string {
  const inferredFromSubject = parseMemberFromSubject(String(row.subject || ''));
  return String((row.metadata?.memberName as string) || '').trim() || inferredFromSubject.memberName || 'Unknown (legacy log)';
}

function resolveMemberMrn(row: EmailLogEntry): string {
  const inferredFromSubject = parseMemberFromSubject(String(row.subject || ''));
  return String((row.metadata?.memberMrn as string) || '').trim() || inferredFromSubject.memberMrn || 'Unknown (legacy log)';
}

function resolveMemberLastName(row: EmailLogEntry): string {
  return extractMemberLastName(resolveMemberName(row));
}

function resolveSubmittedByName(row: EmailLogEntry): string {
  const submittedByNameRaw =
    String((row.metadata?.submitterName as string) || (row.metadata?.referrerName as string) || '').trim();
  return submittedByNameRaw && !looksLikeEmail(submittedByNameRaw) ? submittedByNameRaw : 'Unknown staff name';
}

function isAuthReceived(row: EmailLogEntry): boolean {
  const metadataValue = row.metadata?.authReceived;
  if (typeof metadataValue === 'boolean') return metadataValue;
  return Boolean(row.authReceived);
}

function KaiserReferralEmailLogsPageContent() {
  const { isAdmin, isUserLoading } = useAdmin();
  const firestore = useFirestore();
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingLogId, setDeletingLogId] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [authUpdatingById, setAuthUpdatingById] = useState<Record<string, boolean>>({});
  const [selectedLogIds, setSelectedLogIds] = useState<Record<string, boolean>>({});
  const [openDetailsById, setOpenDetailsById] = useState<Record<string, boolean>>({});

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
        if (!needle) return true;
        const memberName = resolveMemberName(row);
        const memberMrn = resolveMemberMrn(row);
        const memberLastName = resolveMemberLastName(row);
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
      if (sortKey === 'submittedAt') {
        const aMs = toTimestampMs(a.createdAt);
        const bMs = toTimestampMs(b.createdAt);
        return sortDirection === 'desc' ? bMs - aMs : aMs - bMs;
      }

      const aMemberMrn = resolveMemberMrn(a);
      const bMemberMrn = resolveMemberMrn(b);
      const aSubmittedBy = resolveSubmittedByName(a);
      const bSubmittedBy = resolveSubmittedByName(b);
      const aMemberLastName = resolveMemberLastName(a);
      const bMemberLastName = resolveMemberLastName(b);

      const aSortValue =
        sortKey === 'submittedBy'
          ? aSubmittedBy.toLowerCase()
          : aMemberLastName.toLowerCase();
      const bSortValue =
        sortKey === 'submittedBy'
          ? bSubmittedBy.toLowerCase()
          : bMemberLastName.toLowerCase();
      const compared = aSortValue.localeCompare(bSortValue);
      return sortDirection === 'asc' ? compared : -compared;
    });
    return base;
  }, [logs, search, sortDirection, sortKey, statusFilter]);

  if (isUserLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="p-6 text-sm text-destructive">Access denied.</div>;
  }

  const requestDeleteVerification = (count: number): boolean => {
    const targetLabel = count === 1 ? 'this log entry' : `${count} log entries`;
    const confirmed = window.confirm(`Delete ${targetLabel}? This cannot be undone.`);
    return confirmed;
  };

  const handleDeleteLog = async (logId: string) => {
    if (!firestore || !logId) return;
    if (!requestDeleteVerification(1)) return;
    setDeletingLogId(logId);
    try {
      await deleteDoc(doc(firestore, 'emailLogs', logId));
      setSelectedLogIds((prev) => {
        if (!prev[logId]) return prev;
        const next = { ...prev };
        delete next[logId];
        return next;
      });
    } catch (error) {
      console.error('Failed to delete Kaiser referral log:', error);
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      window.alert(`Failed to delete log. ${message}`);
    } finally {
      setDeletingLogId('');
    }
  };

  const handleDeleteSelectedLogs = async () => {
    if (!firestore) return;
    const selectedIds = Object.entries(selectedLogIds)
      .filter(([, isSelected]) => isSelected)
      .map(([logId]) => logId);
    if (selectedIds.length === 0) {
      window.alert('Select at least one log before deleting.');
      return;
    }
    const existingIdSet = new Set(logs.map((row) => row.id));
    const existingSelectedIds = selectedIds.filter((logId) => existingIdSet.has(logId));
    if (existingSelectedIds.length === 0) {
      window.alert('No selected logs are currently available to delete. Please reselect and try again.');
      return;
    }
    if (!requestDeleteVerification(existingSelectedIds.length)) {
      return;
    }
    setIsBulkDeleting(true);
    const failedIds: string[] = [];
    const deletedIds: string[] = [];
    let firstFailureMessage = '';
    for (const logId of existingSelectedIds) {
      try {
        await deleteDoc(doc(firestore, 'emailLogs', logId));
        deletedIds.push(logId);
      } catch (error) {
        failedIds.push(logId);
        const message = error instanceof Error ? error.message : String(error || 'Unknown error');
        if (!firstFailureMessage) firstFailureMessage = message;
        console.error(`Failed to delete Kaiser referral log ${logId}:`, error);
      }
    }

    setSelectedLogIds((prev) => {
      const next = { ...prev };
      for (const logId of deletedIds) {
        delete next[logId];
      }
      return next;
    });

    if (failedIds.length === 0) {
      window.alert(`Deleted ${deletedIds.length} selected log(s).`);
    } else {
      const summaryMessage = `Deleted ${deletedIds.length} log(s). ${failedIds.length} failed.${firstFailureMessage ? ` First error: ${firstFailureMessage}` : ''}`;
      window.alert(
        `${summaryMessage} Failed logs remain selected.`
      );
    }
    setIsBulkDeleting(false);
  };

  const toggleAuthReceived = async (row: EmailLogEntry) => {
    if (!firestore) return;
    const nextValue = !isAuthReceived(row);
    setAuthUpdatingById((prev) => ({ ...prev, [row.id]: true }));
    try {
      await updateDoc(doc(firestore, 'emailLogs', row.id), {
        authReceived: nextValue,
        'metadata.authReceived': nextValue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      window.alert(`Failed to update Auth Received: ${message}`);
    } finally {
      setAuthUpdatingById((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  };

  const toggleDetails = (logId: string) => {
    setOpenDetailsById((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  const toggleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === 'submittedAt' ? 'desc' : 'asc');
  };

  const setSortFromMobile = (nextSortKey: SortKey) => {
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === 'submittedAt' ? 'desc' : 'asc');
  };

  const resetToNativeView = () => {
    setSortKey('submittedAt');
    setSortDirection('desc');
  };

  const selectedVisibleCount = filtered.reduce((count, row) => count + (selectedLogIds[row.id] ? 1 : 0), 0);
  const selectedTotalCount = Object.values(selectedLogIds).reduce((count, isSelected) => count + (isSelected ? 1 : 0), 0);
  const isAllVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;
  const canDeleteSelected = selectedTotalCount > 0 && !isBulkDeleting && !deletingLogId;
  const isNativeSort = sortKey === 'submittedAt' && sortDirection === 'desc';

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
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>
              All
            </Button>
            <Button variant={statusFilter === 'success' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('success')}>
              Success
            </Button>
            <Button variant={statusFilter === 'failure' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('failure')}>
              Failure
            </Button>
            <div className="flex items-center gap-2 sm:hidden">
              <Select value={sortKey} onValueChange={(value) => setSortFromMobile(value as SortKey)}>
                <SelectTrigger className="h-9 w-[168px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submittedAt">Submitted Date</SelectItem>
                  <SelectItem value="submittedBy">Submitted By</SelectItem>
                  <SelectItem value="memberLastName">Member Last Name</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDirection === 'asc' ? 'Asc' : 'Desc'}
              </Button>
            </div>
            <Button className="hidden sm:inline-flex" variant="outline" size="sm" onClick={() => toggleSort('submittedAt')}>
              Sort: Date {sortKey === 'submittedAt' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
            </Button>
            <Button className="hidden sm:inline-flex" variant="outline" size="sm" onClick={() => toggleSort('submittedBy')}>
              Sort: Submitted By {sortKey === 'submittedBy' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
            </Button>
            <Button className="hidden sm:inline-flex" variant="outline" size="sm" onClick={() => toggleSort('memberLastName')}>
              Sort: Last Name {sortKey === 'memberLastName' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
            </Button>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by last name, MRN, staff submitter, recipient, or error..."
              className="w-full min-w-[220px] sm:min-w-[260px] sm:max-w-md"
            />
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading Kaiser referral email logs...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No Kaiser referral email logs found.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <Button variant="secondary" size="sm" onClick={resetToNativeView} disabled={isNativeSort}>
                  Reset View
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDeleteSelectedLogs()}
                  disabled={!canDeleteSelected}
                >
                  {isBulkDeleting ? 'Deleting selected...' : `Delete Selected (${selectedTotalCount})`}
                </Button>
                <span className="font-medium text-muted-foreground">Status legend:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-base font-semibold text-green-600">✓</span>
                  <span>Success</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-base font-semibold text-red-600">✕</span>
                  <span>Failure</span>
                </span>
              </div>

              <div className="hidden rounded-md border bg-muted/30 px-3 py-2 text-sm md:block">
                <div className="grid w-full gap-x-4 gap-y-1 md:grid-cols-[minmax(180px,1fr)_130px_56px_98px_180px_140px_44px_112px]">
                  <Button type="button" variant="ghost" size="sm" className="h-auto justify-start px-0" onClick={() => toggleSort('memberLastName')}>
                    Member {sortKey === 'memberLastName' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-auto justify-start px-0" onClick={() => toggleSort('submittedAt')}>
                    Submitted Date {sortKey === 'submittedAt' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </Button>
                  <span className="flex w-full items-center justify-center px-1 text-sm font-semibold text-foreground">Status</span>
                  <span className="px-0 text-sm font-medium text-foreground">Auth Received</span>
                  <Button type="button" variant="ghost" size="sm" className="h-auto justify-start px-0" onClick={() => toggleSort('submittedBy')}>
                    Submitted By {sortKey === 'submittedBy' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </Button>
                  <span className="px-0 text-sm font-medium text-foreground">MRN</span>
                  <div className="flex items-center justify-end">
                    <Checkbox
                      checked={isAllVisibleSelected}
                      onCheckedChange={(checked) => {
                        const nextValue = checked === true;
                        setSelectedLogIds((prev) => {
                          const next = { ...prev };
                          for (const row of filtered) {
                            if (nextValue) next[row.id] = true;
                            else delete next[row.id];
                          }
                          return next;
                        });
                      }}
                      aria-label="Select all visible logs"
                    />
                  </div>
                  <span className="flex items-center justify-end px-1 text-xs text-muted-foreground">Details</span>
                </div>
              </div>

              {filtered.map((row) => {
                const submittedByEmail =
                  String((row.metadata?.submitterEmail as string) || (row.metadata?.referrerEmail as string) || '').trim();
                const memberName = resolveMemberName(row);
                const memberMrn = resolveMemberMrn(row);
                const submittedByName = resolveSubmittedByName(row);
                const status = String(row.status || 'unknown').toLowerCase();
                const kaiserRegion = resolveKaiserRegion(row);
                const authorizationFileUrl = resolveAuthorizationFileUrl(row);
                const reopenGeneratorUrl = resolveReopenGeneratorUrl(row);
                const isDetailsOpen = Boolean(openDetailsById[row.id]);
                const isSuccess = status === 'success';
                const authReceived = isAuthReceived(row);
                const isAuthUpdating = Boolean(authUpdatingById[row.id]);
                return (
                  <div key={row.id} className="rounded-md border p-3">
                    <div className="grid w-full gap-2 text-sm md:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{memberName}</div>
                        <Checkbox
                          checked={Boolean(selectedLogIds[row.id])}
                          onCheckedChange={(checked) => {
                            const nextValue = checked === true;
                            setSelectedLogIds((prev) => {
                              if (nextValue) return { ...prev, [row.id]: true };
                              const next = { ...prev };
                              delete next[row.id];
                              return next;
                            });
                          }}
                          aria-label={`Select log ${row.id}`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{toDateOnlyLabel(row.createdAt)}</span>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-label={isSuccess ? 'Success' : 'Failure'}
                            title={isSuccess ? 'Success' : 'Failure'}
                            className={isSuccess ? 'text-lg font-semibold text-green-600' : 'text-lg font-semibold text-red-600'}
                          >
                            {isSuccess ? '✓' : '✕'}
                          </span>
                          <Button
                            type="button"
                            variant={authReceived ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => void toggleAuthReceived(row)}
                            disabled={isAuthUpdating}
                          >
                            {isAuthUpdating ? '...' : authReceived ? 'Auth ✓' : 'Auth'}
                          </Button>
                        </span>
                      </div>
                      <div className="truncate">
                        <span className="font-medium">Submitted By:</span> {submittedByName}
                      </div>
                      <div className="truncate">
                        <span className="font-medium">MRN:</span> {memberMrn}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleDetails(row.id)}
                        >
                          {isDetailsOpen ? 'Close details' : 'Open details'}
                        </Button>
                      </div>
                    </div>

                    <div className="hidden w-full gap-x-4 gap-y-2 text-sm md:grid md:grid-cols-[minmax(180px,1fr)_130px_56px_98px_180px_140px_44px_112px]">
                      <div className="truncate">{memberName}</div>
                      <div className="truncate">{toDateOnlyLabel(row.createdAt)}</div>
                      <div className="flex w-full items-center justify-center">
                        <span
                          aria-label={isSuccess ? 'Success' : 'Failure'}
                          title={isSuccess ? 'Success' : 'Failure'}
                          className={isSuccess ? 'text-lg font-semibold text-green-600' : 'text-lg font-semibold text-red-600'}
                        >
                          {isSuccess ? '✓' : '✕'}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <Button
                          type="button"
                          variant={authReceived ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => void toggleAuthReceived(row)}
                          disabled={isAuthUpdating}
                        >
                          {isAuthUpdating ? '...' : authReceived ? '✓' : 'Mark'}
                        </Button>
                      </div>
                      <div className="truncate">{submittedByName}</div>
                      <div className="truncate">{memberMrn}</div>
                      <div className="flex md:justify-end">
                        <Checkbox
                          checked={Boolean(selectedLogIds[row.id])}
                          onCheckedChange={(checked) => {
                            const nextValue = checked === true;
                            setSelectedLogIds((prev) => {
                              if (nextValue) return { ...prev, [row.id]: true };
                              const next = { ...prev };
                              delete next[row.id];
                              return next;
                            });
                          }}
                          aria-label={`Select log ${row.id}`}
                        />
                      </div>
                      <div className="flex md:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleDetails(row.id)}
                        >
                          {isDetailsOpen ? 'Close details' : 'Open details'}
                        </Button>
                      </div>
                    </div>

                    {isDetailsOpen ? (
                      <>
                        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                          <div><span className="font-medium">Submitted:</span> {toDateLabel(row.createdAt)}</div>
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

                        <div className="mt-2 text-sm">
                          <span className="font-medium">Authorization request file:</span>{' '}
                          {authorizationFileUrl ? (
                            <a
                              href={authorizationFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 underline underline-offset-2"
                            >
                              View PDF
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Not available for this log</span>
                          )}
                        </div>

                        <div className="mt-2 text-sm">
                          <span className="font-medium">Reopen form:</span>{' '}
                          <a
                            href={reopenGeneratorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 underline underline-offset-2"
                          >
                            Open in Generator
                          </a>
                        </div>

                        {row.errorMessage ? (
                          <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700">
                            <span className="font-medium">Error:</span> {String(row.errorMessage)}
                          </div>
                        ) : null}
                      </>
                    ) : null}
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
