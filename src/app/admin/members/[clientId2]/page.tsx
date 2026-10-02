'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { adminFetch } from '@/lib/admin-fetch';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format-date';
import { GLOBAL_CHANGE_CATEGORY_LABELS, type GlobalChangeEvent } from '@/lib/global-change-log';
import { ExternalLink, FileText, History, Loader2, MessageSquare, RefreshCw, User as UserIcon } from 'lucide-react';

type Member360 = {
  clientId2: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  mrn: string;
  mediCalNumber: string;
  healthPlan: string;
  calaimStatus: string;
  kaiserStatus: string;
  kaiserIdStatus: string;
  pathway: string;
  county: string;
  phone: string;
  staffAssigned: string;
  socialWorker: string;
  rcfeName: string;
  t2038AuthNumber: string;
  t2038AuthEnd: string;
};

type MemberApplication = {
  id: string;
  path: string;
  userId: string | null;
  memberName: string;
  status: string;
  healthPlan: string;
  pathway: string;
  kaiserStatus: string;
  calaimStatus: string;
  formsCompleted: number;
  formsTotal: number;
  updatedAtIso: string;
};

type MemberNote = {
  id: string;
  comments: string;
  author: string;
  timeStamp: string;
  followUpDate?: string;
  followUpStatus?: string;
  followUpAssignment?: string;
};

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm text-slate-900">{value || '—'}</div>
    </div>
  );
}

export default function Member360Page() {
  const params = useParams<{ clientId2: string }>();
  const clientId2 = decodeURIComponent(String(params?.clientId2 || '')).trim();
  const { user } = useUser();

  const [member, setMember] = useState<Member360 | null>(null);
  const [applications, setApplications] = useState<MemberApplication[]>([]);
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [events, setEvents] = useState<GlobalChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventCategory, setEventCategory] = useState('all');

  const load = useCallback(async () => {
    if (!user || !clientId2) return;
    setLoading(true);
    setEventsLoading(true);
    setError('');
    const id = encodeURIComponent(clientId2);
    const memberRequest = adminFetch(`/api/admin/members/${id}`, { user })
      .then((body) => {
        setMember(body.member || null);
        setApplications(Array.isArray(body.applications) ? body.applications : []);
        setNotes(Array.isArray(body.notes) ? body.notes : []);
      })
      .catch((err: any) => setError(String(err?.message || 'Could not load member')))
      .finally(() => setLoading(false));
    const eventsRequest = adminFetch(`/api/admin/global-change-log?memberKey=${id}&limit=300`, { user })
      .then((body) => setEvents(Array.isArray(body.events) ? body.events : []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
    await Promise.all([memberRequest, eventsRequest]);
  }, [user, clientId2]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = useMemo(() => {
    const fromMember = [member?.firstName, member?.lastName].filter(Boolean).join(' ');
    return fromMember || applications[0]?.memberName || events.find((e) => e.memberName)?.memberName || 'Member';
  }, [member, applications, events]);

  const eventCategories = useMemo(
    () => Array.from(new Set(events.map((e) => e.category))).sort(),
    [events]
  );
  const visibleEvents = useMemo(
    () => (eventCategory === 'all' ? events : events.filter((e) => e.category === eventCategory)),
    [events, eventCategory]
  );

  const id = encodeURIComponent(clientId2);
  const quickLinks = [
    { label: 'Member notes', href: `/admin/member-notes?clientId2=${id}` },
    { label: 'Kaiser Tracker', href: `/admin/kaiser-tracker?clientId2=${id}` },
    { label: 'ISP Workflow', href: `/admin/tools/isp-workflow?memberId=${id}` },
    { label: 'ALFT Tracker', href: '/admin/alft-tracker' },
    { label: 'MIF Consolidator', href: '/admin/tools/ils-mif-consolidator' },
    { label: 'Applications', href: `/admin/applications?member=${encodeURIComponent(displayName)}` },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5" />
            Member 360
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{loading && !member ? 'Loading…' : displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Client_ID2 {clientId2}</span>
            {member?.mrn ? <span>· MRN {member.mrn}</span> : null}
            {member?.healthPlan ? <span>· {member.healthPlan}</span> : null}
          </div>
          {member ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {member.calaimStatus ? <StatusBadge status={member.calaimStatus} domain="calaim" /> : null}
              {member.kaiserStatus ? <StatusBadge status={member.kaiserStatus} domain="kaiser" /> : null}
            </div>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {quickLinks.map((link) => (
          <Button key={link.label} type="button" size="sm" variant="secondary" asChild>
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Caspio details</CardTitle>
            <CardDescription>From the synced Caspio members cache.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !member ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : !member ? (
              <div className="text-sm text-muted-foreground">
                This Client_ID2 is not in the Caspio members cache yet. Run a members sync, or check the ID.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
                <Field label="Date of birth" value={formatDate(member.birthDate) || member.birthDate} />
                <Field label="Medi-Cal #" value={member.mediCalNumber} />
                <Field label="Pathway" value={member.pathway} />
                <Field label="County" value={member.county} />
                <Field label="Phone" value={member.phone} />
                <Field label="Kaiser ID status" value={member.kaiserIdStatus} />
                <Field label="Staff assigned" value={member.staffAssigned} />
                <Field label="Social worker" value={member.socialWorker} />
                <Field label="RCFE" value={member.rcfeName} />
                <Field label="T2038 auth #" value={member.t2038AuthNumber} />
                <Field label="T2038 auth end" value={formatDate(member.t2038AuthEnd) || member.t2038AuthEnd} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Applications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && !applications.length ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : applications.length === 0 ? (
              <div className="text-sm text-muted-foreground">No linked applications found.</div>
            ) : (
              applications.map((app) => (
                <Link
                  key={app.path}
                  href={`/admin/applications/${app.id}${app.userId ? `?userId=${encodeURIComponent(app.userId)}` : ''}`}
                  className="block rounded-md border p-2 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{app.memberName || app.id}</span>
                    {app.status ? <StatusBadge status={app.status} domain="application" /> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[app.healthPlan, app.pathway].filter(Boolean).join(' · ')}
                    {app.formsTotal ? ` · ${app.formsCompleted}/${app.formsTotal} forms` : ''}
                    {app.updatedAtIso ? ` · updated ${formatRelative(app.updatedAtIso)}` : ''}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> Change history
              </CardTitle>
              <CardDescription>
                Status changes, assignments, MIF pushes, emails, cover sheets, referrals, and ISP/ALFT downloads for
                this member.
              </CardDescription>
            </div>
            <Select value={eventCategory} onValueChange={setEventCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {eventCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {GLOBAL_CHANGE_CATEGORY_LABELS[category] || category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {eventsLoading && !events.length ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading history…
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground">No logged changes for this member yet.</div>
            ) : (
              <ol className="space-y-3">
                {visibleEvents.map((event) => (
                  <li key={event.id} className="flex gap-3 border-l-2 border-slate-200 pl-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          {GLOBAL_CHANGE_CATEGORY_LABELS[event.category] || event.category}
                        </Badge>
                        <span className="text-sm font-medium text-slate-900">{event.summary}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        <span title={formatDateTime(event.atIso)}>{formatRelative(event.atIso, '—')}</span>
                        {event.staffName || event.staffEmail ? ` · ${event.staffName || event.staffEmail}` : ''}
                      </div>
                    </div>
                    {event.href ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" asChild>
                        <Link href={event.href}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" /> Recent notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && !notes.length ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No synced notes for this member.</div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-md border p-2">
                  <div className="whitespace-pre-line text-sm text-slate-900 line-clamp-4">{note.comments || '—'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {note.author || 'Staff'} · {formatDateTime(note.timeStamp, note.timeStamp)}
                    {note.followUpDate ? ` · follow-up ${formatDate(note.followUpDate, note.followUpDate)}` : ''}
                    {note.followUpStatus ? ` (${note.followUpStatus})` : ''}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
