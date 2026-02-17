'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Loader2, ClipboardList, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';

import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type GlobalFollowupNote = {
  source: 'caspio_client_notes_cache';
  noteId: string;
  clientId2: string;
  memberName: string;
  followUpAssignment: string;
  followUpStatus: string;
  followUpDate: string;
  dueDateIso: string;
  isOverdue: boolean;
  comments: string;
  timeStamp: string;
  actionUrl: string;
};

export default function GlobalTaskTrackerPage() {
  const { user, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const router = useRouter();
  const { toast } = useToast();

  const [notes, setNotes] = useState<GlobalFollowupNote[]>([]);
  const [assignments, setAssignments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<GlobalFollowupNote | null>(null);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyPriority, setNotifyPriority] = useState<'General' | 'Priority' | 'Urgent'>('General');
  const [isSending, setIsSending] = useState(false);

  const [limit, setLimit] = useState(5000);
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    if (!isAdminLoading && !isSuperAdmin) router.push('/admin');
  }, [isAdminLoading, isSuperAdmin, router]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (overdueOnly) params.set('overdue', 'true');
      if (assignmentFilter && assignmentFilter !== 'all') params.set('assignment', assignmentFilter);
      if (q.trim()) params.set('q', q.trim());

      const resp = await fetch(`/api/super-admin/global-followups?${params.toString()}`);
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load notes');
      }

      setNotes((data.notes || []) as GlobalFollowupNote[]);
      setAssignments((data.assignments || []) as string[]);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Failed to load global tasks',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminLoading || !isSuperAdmin) return;
    fetchNotes().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminLoading, isSuperAdmin]);

  const counts = useMemo(() => {
    const total = notes.length;
    const overdue = notes.filter((n) => n.isOverdue).length;
    return { total, overdue };
  }, [notes]);

  const closeNote = async (note: GlobalFollowupNote) => {
    if (!user?.email && !user?.displayName) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Please re-login and try again.' });
      return;
    }

    setClosingId(note.noteId);
    try {
      const resp = await fetch('/api/client-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: note.noteId,
          clientId2: note.clientId2,
          followUpStatus: 'Closed',
          actorName: user?.displayName || user?.email || 'Super Admin',
          actorEmail: user?.email || '',
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to close note');
      }

      setNotes((prev) => prev.filter((n) => n.noteId !== note.noteId));
      toast({
        title: 'Closed',
        description: `${note.memberName} · ${note.clientId2} closed.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Close failed', description: err?.message || 'Please try again.' });
    } finally {
      setClosingId(null);
    }
  };

  const openNotify = (note: GlobalFollowupNote) => {
    setNotifyTarget(note);
    const dueLabel = (() => {
      try {
        return format(new Date(note.dueDateIso), 'MMM d, yyyy');
      } catch {
        return note.followUpDate || '';
      }
    })();
    setNotifyPriority(note.isOverdue ? 'Urgent' : 'Priority');
    setNotifyMessage(
      `Reminder: follow-up for ${note.memberName}${note.clientId2 ? ` (${note.clientId2})` : ''} is still open.` +
        (dueLabel ? ` Due: ${dueLabel}.` : '') +
        ` Please review and close if no longer needed.`
    );
  };

  const sendNotify = async () => {
    if (!notifyTarget) return;
    if (!user) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Please re-login and try again.' });
      return;
    }
    if (!notifyMessage.trim()) {
      toast({ variant: 'destructive', title: 'Message required', description: 'Please enter a short message.' });
      return;
    }

    setIsSending(true);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/super-admin/followups/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          noteId: notifyTarget.noteId,
          clientId2: notifyTarget.clientId2,
          memberName: notifyTarget.memberName,
          followUpAssignment: notifyTarget.followUpAssignment,
          dueDateIso: notifyTarget.dueDateIso,
          message: notifyMessage.trim(),
          priority: notifyPriority,
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send reminder');
      }

      toast({
        title: 'Sent',
        description: `Reminder sent to ${notifyTarget.followUpAssignment}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setNotifyTarget(null);
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Send failed', description: err?.message || 'Please try again.' });
    } finally {
      setIsSending(false);
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7" />
            Global Task Tracker
          </h1>
          <p className="text-muted-foreground">
            Super Admin view of all <span className="font-medium">open</span> Caspio follow-up notes assigned to staff.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => fetchNotes()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
          <Link href="/admin/super">
            <Button variant="ghost">Back to Super Admin</Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="bg-slate-50">
          Open: <span className="ml-1 font-semibold">{counts.total}</span>
        </Badge>
        <Badge variant="outline" className={counts.overdue > 0 ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}>
          Overdue: <span className="ml-1 font-semibold">{counts.overdue}</span>
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Use filters to find old/unused follow-ups and close them.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Member, Client_ID2, assignment, text..." />
          </div>
          <div className="space-y-2">
            <Label>Assignment</Label>
            <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All assignments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {assignments.map((a) => (
                  <SelectItem key={`asg-${a}`} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Limit</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
                <SelectItem value="10000">10,000</SelectItem>
                <SelectItem value="20000">20,000</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Overdue only</Label>
            <Select value={overdueOnly ? 'yes' : 'no'} onValueChange={(v) => setOverdueOnly(v === 'yes')}>
              <SelectTrigger>
                <SelectValue placeholder="Overdue only" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4 flex items-center gap-2">
            <Button onClick={() => fetchNotes()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setQ('');
                setAssignmentFilter('all');
                setOverdueOnly(false);
                setLimit(5000);
              }}
            >
              Reset
            </Button>
            <div className="text-xs text-muted-foreground">
              Showing the oldest due items first for easier cleanup.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open follow-ups</CardTitle>
          <CardDescription>
            Close notes that no longer need follow-up. Closing updates Caspio (source of truth) and the Firestore cache.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No open assigned follow-ups found with current filters.</div>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => {
                const dueLabel = (() => {
                  try {
                    return format(new Date(n.dueDateIso), 'MMM d, yyyy');
                  } catch {
                    return n.followUpDate || '—';
                  }
                })();
                const isClosing = closingId === n.noteId;

                return (
                  <div key={`global-followup-${n.noteId}`} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{n.memberName}</div>
                          {n.clientId2 ? (
                            <Badge variant="outline" className="bg-slate-50">
                              {n.clientId2}
                            </Badge>
                          ) : null}
                          {n.isOverdue ? (
                            <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                              <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                              Overdue
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Open
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          <span>
                            <span className="font-medium">Due:</span> {dueLabel}
                          </span>
                          <span>
                            <span className="font-medium">Assigned:</span> {n.followUpAssignment || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={n.actionUrl}>
                          <Button variant="outline" size="sm">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={() => openNotify(n)}>
                          Send follow-up
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => closeNote(n)}
                          disabled={isClosing}
                        >
                          {isClosing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Close
                        </Button>
                      </div>
                    </div>
                    {n.comments ? (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {n.comments.length > 280 ? `${n.comments.slice(0, 280)}…` : n.comments}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No comments</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(notifyTarget)} onOpenChange={(open) => !open && setNotifyTarget(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Send follow-up reminder</DialogTitle>
            <DialogDescription>
              This sends an in-app reminder to the staff member assigned to this follow-up (shows in their Daily Task Tracker).
            </DialogDescription>
          </DialogHeader>

          {notifyTarget ? (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="text-xs text-muted-foreground">To</div>
                <div className="font-medium">{notifyTarget.followUpAssignment || '—'}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={notifyPriority} onValueChange={(v) => setNotifyPriority(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Priority">Priority</SelectItem>
                      <SelectItem value="Urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Member</Label>
                  <Input value={`${notifyTarget.memberName}${notifyTarget.clientId2 ? ` (${notifyTarget.clientId2})` : ''}`} readOnly />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} rows={5} />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyTarget(null)} disabled={isSending}>
              Cancel
            </Button>
            <Button onClick={() => sendNotify()} disabled={isSending}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

