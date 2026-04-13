'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';

type ResultRow = {
  pass: boolean;
  claimRecordId: string;
  submittedAtIso: string | null;
  rcfeRegisteredId: string;
  rcfeName: string;
  claimAcceptance?: string;
  clientId2: string;
  clientFirst: string;
  clientLast: string;
  userFirst: string;
  userLast: string;
  emailSubmitter: string;
  resolutionStatus: 'pending-review' | 'notified' | 'corrected' | 'rechecked-pass';
  lastRejectionEmailAt: string | null;
  lastRejectionEmailTo: string | null;
  lastRejectionEmailSubject: string | null;
  rejectionEmailCount: number;
  windows: Array<{ from: string | null; to: string | null }>;
  overlaps: Array<{
    claimRecordId: string;
    submittedAtIso: string | null;
    windows: Array<{ from: string | null; to: string | null }>;
  }>;
};

type EmailHistoryRow = {
  id: string;
  createdAt?: string;
  to?: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  emailType?: 'test' | 'production' | string;
  sentByEmail?: string;
};

const formatDate = (value: string | null) => {
  if (!value) return 'N/A';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
};

const formatWindows = (windows: Array<{ from: string | null; to: string | null }>) => {
  if (!Array.isArray(windows) || windows.length === 0) return 'No service dates';
  return windows
    .map((w, idx) => {
      const from = w.from || 'N/A';
      const to = w.to || w.from || 'N/A';
      return `${idx + 1}) ${from} - ${to}`;
    })
    .join(' | ');
};

const statusBadgeClass = (status: ResultRow['resolutionStatus']) => {
  if (status === 'notified') return 'bg-blue-600';
  if (status === 'corrected') return 'bg-amber-600';
  if (status === 'rechecked-pass') return 'bg-emerald-600';
  return 'bg-slate-600';
};

export default function H2022ClaimCheckerPage() {
  const auth = useAuth();
  const { isSuperAdmin, isClaimsStaff, isLoading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; passed: number; failed: number } | null>(null);
  const [lastPulledClaims, setLastPulledClaims] = useState<ResultRow[]>([]);
  const [syncMeta, setSyncMeta] = useState<{ total: number; syncedAt: string; syncMode: 'full' | 'incremental' } | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ResultRow | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [isTestSend, setIsTestSend] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [emailHistoryOpen, setEmailHistoryOpen] = useState(false);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(false);
  const [emailHistoryRows, setEmailHistoryRows] = useState<EmailHistoryRow[]>([]);
  const [emailHistoryClaimId, setEmailHistoryClaimId] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'rejected' | 'accepted'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'rcfe' | 'member'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const displayedRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (outcomeFilter === 'rejected') return !row.pass;
      if (outcomeFilter === 'accepted') return row.pass;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        const aMs = a.submittedAtIso ? Date.parse(a.submittedAtIso) : 0;
        const bMs = b.submittedAtIso ? Date.parse(b.submittedAtIso) : 0;
        return aMs - bMs;
      }
      if (sortBy === 'rcfe') {
        const aValue = `${a.rcfeName || ''} ${a.rcfeRegisteredId || ''}`.trim().toLowerCase();
        const bValue = `${b.rcfeName || ''} ${b.rcfeRegisteredId || ''}`.trim().toLowerCase();
        return aValue.localeCompare(bValue);
      }
      const aValue = `${a.clientLast || ''}, ${a.clientFirst || ''} ${a.clientId2 || ''}`.trim().toLowerCase();
      const bValue = `${b.clientLast || ''}, ${b.clientFirst || ''} ${b.clientId2 || ''}`.trim().toLowerCase();
      return aValue.localeCompare(bValue);
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [rows, outcomeFilter, sortBy, sortDirection]);

  if (adminLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Checking claims access...
        </div>
      </div>
    );
  }

  if (!isSuperAdmin && !isClaimsStaff) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              This tool is restricted to super admins and claims-access staff.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const runCheck = async (opts?: { claimsOverride?: ResultRow[]; sourceLabel?: string }) => {
    if (opts?.claimsOverride && opts.claimsOverride.length === 0) {
      toast({
        title: 'No claims to check',
        description: 'This pull has no claims to evaluate.',
      });
      return;
    }
    setLoading(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Please log in with an admin account before running checks.');
      }

      const payload: Record<string, unknown> = {
        action: 'check',
        mode: 'batch',
      };
      if (opts?.claimsOverride?.length) {
        payload.syncedClaims = opts.claimsOverride;
      }

      const res = await fetch('/api/admin/h2022-claim-checker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        summary?: { total: number; passed: number; failed: number };
        rows?: ResultRow[];
      };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Check failed (HTTP ${res.status})`);
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary(data?.summary || { total: 0, passed: 0, failed: 0 });
      toast({
        title: 'H2022 check complete',
        description: `Reviewed ${data?.summary?.total || 0} claim(s)${opts?.sourceLabel ? ` from ${opts.sourceLabel}` : ''}.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to run overlap check.';
      toast({
        title: 'Check failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const syncClaims = async (syncKind: 'full' | 'incremental', checkPulled: boolean) => {
    setSyncing(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Please log in with an admin account before running checks.');
      }

      const res = await fetch('/api/admin/h2022-claim-checker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'sync',
          forceFullSync: syncKind === 'full',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        syncedAt?: string;
        syncMode?: 'full' | 'incremental';
        error?: string;
        summary?: { total: number };
        rows?: ResultRow[];
      };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      }
      const synced = Array.isArray(data?.rows) ? data.rows : [];
      setLastPulledClaims(synced);
      setSyncMeta({
        total: Number(data?.summary?.total || 0),
        syncedAt: String(data?.syncedAt || new Date().toISOString()),
        syncMode: data?.syncMode === 'full' ? 'full' : 'incremental',
      });
      toast({
        title: 'Claims synced',
        description: `${data?.syncMode === 'full' ? 'Full sync' : 'Incremental sync'} pulled ${synced.length} claim(s) from Caspio.`,
      });
      if (checkPulled && synced.length > 0) {
        await runCheck({ claimsOverride: synced, sourceLabel: 'latest pull' });
      } else if (checkPulled && synced.length === 0) {
        toast({
          title: 'No new claims pulled',
          description: 'Nothing to check for overlap in this pull.',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to sync claims.';
      toast({
        title: 'Sync failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const openEmailPreview = async (row: ResultRow) => {
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Please log in with an admin account before previewing email.');
      const response = await fetch('/api/admin/h2022-claim-checker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'preview_rejection_email',
          claimRecordId: row.claimRecordId,
          memberName: `${row.clientFirst || ''} ${row.clientLast || ''}`.trim(),
          rcfeName: row.rcfeName,
          submitterName: `${row.userFirst || ''} ${row.userLast || ''}`.trim(),
          submittedAtIso: row.submittedAtIso,
          currentWindows: row.windows,
          overlaps: row.overlaps,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        template?: { subject?: string; bodyText?: string };
      };
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Preview failed (HTTP ${response.status})`);
      }
      setSelectedRow(row);
      setEmailTo(row.emailSubmitter || '');
      setEmailSubject(String(data?.template?.subject || 'H2022 claim overlap detected'));
      setEmailBody(String(data?.template?.bodyText || ''));
      setEmailCc('');
      setEmailBcc('');
      setTestEmail('');
      setIsTestSend(false);
      setDuplicateWarning(null);
      setEmailDialogOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to build email preview.';
      toast({
        title: 'Preview failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const parseEmailsCsv = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

  const updateClaimStatus = async (row: ResultRow, status: ResultRow['resolutionStatus']) => {
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Please log in with an admin account before updating status.');
      const response = await fetch('/api/admin/h2022-claim-checker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'update_claim_status',
          claimRecordId: row.claimRecordId,
          status,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Status update failed (HTTP ${response.status})`);
      }
      setRows((prev) =>
        prev.map((item) =>
          item.claimRecordId === row.claimRecordId
            ? {
                ...item,
                resolutionStatus: status,
              }
            : item
        )
      );
      toast({
        title: 'Claim status updated',
        description: `${row.claimRecordId} set to ${status}.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to update claim status.';
      toast({
        title: 'Status update failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const openEmailHistory = async (row: ResultRow) => {
    setEmailHistoryClaimId(row.claimRecordId);
    setEmailHistoryOpen(true);
    setEmailHistoryLoading(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Please log in with an admin account before loading email history.');
      const response = await fetch('/api/admin/h2022-claim-checker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'get_claim_email_history',
          claimRecordId: row.claimRecordId,
          limit: 50,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        rows?: EmailHistoryRow[];
      };
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `History load failed (HTTP ${response.status})`);
      }
      setEmailHistoryRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to load email history.';
      setEmailHistoryRows([]);
      toast({
        title: 'History load failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setEmailHistoryLoading(false);
    }
  };

  const sendRejectionEmail = async (forceSend = false) => {
    if (!selectedRow) return;
    const recipient = isTestSend ? testEmail.trim() : emailTo.trim();
    if (!recipient || !emailSubject.trim() || !emailBody.trim()) {
      toast({
        title: 'Missing email details',
        description: isTestSend
          ? 'Test recipient, subject, and message are required before sending.'
          : 'To, subject, and message are required before sending.',
        variant: 'destructive',
      });
      return;
    }

    setEmailSending(true);
    setDuplicateWarning(null);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Please log in with an admin account before sending email.');
      }

      const response = await fetch('/api/admin/h2022-claim-checker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'send_rejection_email',
          to: recipient,
          cc: parseEmailsCsv(emailCc),
          bcc: parseEmailsCsv(emailBcc),
          subject: emailSubject.trim(),
          bodyText: emailBody.trim(),
          claimRecordId: selectedRow.claimRecordId,
          memberName: `${selectedRow.clientFirst || ''} ${selectedRow.clientLast || ''}`.trim(),
          submitterName: `${selectedRow.userFirst || ''} ${selectedRow.userLast || ''}`.trim(),
          rcfeName: selectedRow.rcfeName,
          submittedAtIso: selectedRow.submittedAtIso,
          currentWindows: selectedRow.windows,
          overlaps: selectedRow.overlaps,
          isTest: isTestSend,
          forceSend,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        requiresConfirmation?: boolean;
      };
      if (response.status === 409 && data?.requiresConfirmation) {
        setDuplicateWarning(data.error || 'A prior rejection email already exists for this claim.');
        return;
      }
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Email send failed (HTTP ${response.status})`);
      }
      toast({
        title: isTestSend ? 'Test email sent' : 'Rejection email sent',
        description: `Email sent to ${recipient}.`,
      });
      setDuplicateWarning(null);
      if (!isTestSend) {
        setRows((prev) =>
          prev.map((item) =>
            item.claimRecordId === selectedRow.claimRecordId
              ? {
                  ...item,
                  resolutionStatus: 'notified',
                  lastRejectionEmailAt: new Date().toISOString(),
                  lastRejectionEmailTo: recipient,
                  lastRejectionEmailSubject: emailSubject.trim(),
                  rejectionEmailCount: Number(item.rejectionEmailCount || 0) + 1,
                }
              : item
          )
        );
      }
      setEmailDialogOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to send rejection email.';
      toast({
        title: 'Send failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">H2022 Claim Checker</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pull new submitted H2022 claims into Firestore, auto-check overlaps, and manage rejection notification workflow.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync and Check</CardTitle>
          <CardDescription>
            Incremental pulls reconcile new and changed claims. Full sync refreshes all submitted claims from Caspio.
            Failed rows support preview/test/send email and workflow status tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              disabled={syncing || loading}
              onClick={() => void syncClaims('incremental', true)}
            >
              {syncing || loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Pull New Claims + Check Overlaps
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={syncing || loading}
              onClick={() => void syncClaims('full', false)}
            >
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Full Caspio Re-Sync to Firestore
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={syncing || loading}
              onClick={() => void runCheck({ sourceLabel: 'full Firestore cache' })}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Check All Cached Claims
            </Button>
          </div>
          {syncMeta ? (
            <div className="text-xs text-muted-foreground">
              Last {syncMeta.syncMode} sync: {syncMeta.total} claim(s) at {new Date(syncMeta.syncedAt).toLocaleString()}.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              First sync performs a full Firestore seed. Later syncs reconcile updates and any new claims.
            </div>
          )}
          {lastPulledClaims.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              Last pull payload: {lastPulledClaims.length} claim(s) available for quick overlap check.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {summary ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className={`cursor-pointer transition-colors ${outcomeFilter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-muted/40'}`}
            onClick={() => setOutcomeFilter('all')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Claims checked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${outcomeFilter === 'accepted' ? 'ring-2 ring-emerald-500' : 'hover:bg-muted/40'}`}
            onClick={() => setOutcomeFilter('accepted')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Passed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{summary.passed}</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${outcomeFilter === 'rejected' ? 'ring-2 ring-red-500' : 'hover:bg-muted/40'}`}
            onClick={() => setOutcomeFilter('rejected')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Failed (overlap)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Results by Submitted Date</CardTitle>
          <CardDescription>
            Red means date overlap detected with a prior submitted claim for the same member at that RCFE.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Filter</div>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as 'all' | 'rejected' | 'accepted')}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All claims</option>
                <option value="rejected">Rejected claims (overlap fail)</option>
                <option value="accepted">Accepted claims (pass)</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Sort by</div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'rcfe' | 'member')}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="date">Submitted date</option>
                <option value="rcfe">RCFE</option>
                <option value="member">Member</option>
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            >
              {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
            <div className="text-xs text-muted-foreground pb-1">{displayedRows.length} shown</div>
          </div>
          {displayedRows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No matching claims for the selected filter. Run a check or adjust filters.
            </div>
          ) : (
            <div className="max-h-[640px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Claim ID</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>RCFE</TableHead>
                    <TableHead>Service Windows</TableHead>
                    <TableHead>Conflict Details</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map((row) => (
                    <TableRow key={`${row.claimRecordId}:${row.submittedAtIso || 'na'}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.pass ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <Badge className="bg-emerald-600">Pass</Badge>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-red-600" />
                              <Badge variant="destructive">Fail</Badge>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge className={statusBadgeClass(row.resolutionStatus)}>{row.resolutionStatus}</Badge>
                          {row.lastRejectionEmailAt ? (
                            <div className="text-[10px] text-muted-foreground">
                              Last email: {new Date(row.lastRejectionEmailAt).toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(row.submittedAtIso)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.claimRecordId}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {`${row.clientLast || ''}, ${row.clientFirst || ''}`.replace(/^,\s*/, '').trim() || 'Unknown'}
                        </div>
                        <div className="text-xs text-muted-foreground">ID2: {row.clientId2 || 'N/A'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{row.rcfeName || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">ID: {row.rcfeRegisteredId || 'N/A'}</div>
                      </TableCell>
                      <TableCell className="text-xs">{formatWindows(row.windows)}</TableCell>
                      <TableCell>
                        {row.pass ? (
                          <span className="text-xs text-emerald-700">No overlap with previous submitted claims</span>
                        ) : (
                          <div className="space-y-1 text-xs text-red-700">
                            {row.overlaps.slice(0, 3).map((conflict) => (
                              <div key={`${row.claimRecordId}-${conflict.claimRecordId}`}>
                                <ShieldAlert className="h-3 w-3 inline-block mr-1" />
                                Conflicts with {conflict.claimRecordId} ({formatDate(conflict.submittedAtIso)})
                              </div>
                            ))}
                            {row.overlaps.length > 3 ? (
                              <div className="text-muted-foreground">+{row.overlaps.length - 3} more overlap(s)</div>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.pass ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">No email needed</span>
                            {row.rejectionEmailCount > 0 ? (
                              <Button size="sm" variant="outline" onClick={() => void openEmailHistory(row)}>
                                Email History ({row.rejectionEmailCount})
                              </Button>
                            ) : null}
                            {row.resolutionStatus !== 'rechecked-pass' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void updateClaimStatus(row, 'rechecked-pass')}
                              >
                                Mark Rechecked Pass
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Button size="sm" variant="outline" onClick={() => void openEmailPreview(row)}>
                              Preview rejection email
                            </Button>
                            {row.rejectionEmailCount > 0 ? (
                              <Button size="sm" variant="outline" onClick={() => void openEmailHistory(row)}>
                                Email History ({row.rejectionEmailCount})
                              </Button>
                            ) : null}
                            {row.resolutionStatus !== 'corrected' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void updateClaimStatus(row, 'corrected')}
                              >
                                Mark Corrected
                              </Button>
                            ) : null}
                            {row.resolutionStatus !== 'pending-review' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void updateClaimStatus(row, 'pending-review')}
                              >
                                Mark Pending Review
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          setEmailDialogOpen(open);
          if (!open) setDuplicateWarning(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview Rejection Email</DialogTitle>
            <DialogDescription>Review and edit before sending this claim-specific rejection notice.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedRow ? (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Submitted claim number: <span className="font-semibold text-foreground">{selectedRow.claimRecordId}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={isTestSend ? 'default' : 'outline'}
                onClick={() => setIsTestSend(true)}
                disabled={emailSending}
              >
                Test Send Mode
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!isTestSend ? 'default' : 'outline'}
                onClick={() => setIsTestSend(false)}
                disabled={emailSending}
              >
                Production Send Mode
              </Button>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{isTestSend ? 'Send test to' : 'To'}</div>
              <Input
                value={isTestSend ? testEmail : emailTo}
                onChange={(e) => (isTestSend ? setTestEmail(e.target.value) : setEmailTo(e.target.value))}
                placeholder={isTestSend ? 'yourname@carehomefinders.com' : 'submitter@email.com'}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">CC (comma-separated)</div>
                <Input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="manager@carehomefinders.com" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">BCC (comma-separated)</div>
                <Input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder="audit@carehomefinders.com" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Subject</div>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Message</div>
              <Textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={14} />
            </div>
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs font-medium mb-1">Preview</div>
              <div className="text-sm whitespace-pre-wrap">{emailBody}</div>
            </div>
            {duplicateWarning ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {duplicateWarning}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={emailSending}>
              Cancel
            </Button>
            {duplicateWarning ? (
              <Button variant="outline" onClick={() => void sendRejectionEmail(true)} disabled={emailSending}>
                {emailSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send Anyway
              </Button>
            ) : null}
            <Button onClick={() => void sendRejectionEmail()} disabled={emailSending}>
              {emailSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isTestSend ? 'Send Test Email' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailHistoryOpen} onOpenChange={setEmailHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email History</DialogTitle>
            <DialogDescription>Recent rejection email sends for claim {emailHistoryClaimId}.</DialogDescription>
          </DialogHeader>
          {emailHistoryLoading ? (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading email history...
            </div>
          ) : emailHistoryRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No email history found for this claim.</div>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sent By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailHistoryRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}</TableCell>
                      <TableCell className="text-xs">{item.emailType || 'unknown'}</TableCell>
                      <TableCell className="text-xs">{item.to || 'N/A'}</TableCell>
                      <TableCell className="text-xs">{item.subject || 'N/A'}</TableCell>
                      <TableCell className="text-xs">{item.sentByEmail || 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

