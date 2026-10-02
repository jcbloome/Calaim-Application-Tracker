'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  GLOBAL_CHANGE_CATEGORY_LABELS,
  type GlobalChangeCategory,
  type GlobalChangeEvent,
} from '@/lib/global-change-log';
import { ArrowLeft, ExternalLink, Filter, Loader2, RefreshCw, Search } from 'lucide-react';

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All categories' },
  ...Object.entries(GLOBAL_CHANGE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

function categoryBadgeClass(category: GlobalChangeCategory): string {
  switch (category) {
    case 'member_status':
      return 'bg-violet-100 text-violet-950 border-violet-200';
    case 'member_assignment':
      return 'bg-indigo-100 text-indigo-950 border-indigo-200';
    case 'pathway_review':
      return 'bg-amber-100 text-amber-950 border-amber-200';
    case 'cover_sheet':
      return 'bg-sky-100 text-sky-950 border-sky-200';
    case 'referral':
      return 'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-200';
    case 'mif_consolidator':
      return 'bg-emerald-100 text-emerald-950 border-emerald-200';
    case 'email':
      return 'bg-blue-100 text-blue-950 border-blue-200';
    case 'isp_alft':
      return 'bg-teal-100 text-teal-950 border-teal-200';
    case 'document':
    case 'application':
      return 'bg-slate-100 text-slate-900 border-slate-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export default function GlobalChangeLogPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [events, setEvents] = useState<GlobalChangeEvent[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [sources, setSources] = useState<Record<string, number>>({});
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [category, setCategory] = useState('all');
  const [staff, setStaff] = useState('all');
  const [member, setMember] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (!isSuperAdmin) router.push('/admin');
  }, [isLoading, isSuperAdmin, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (category && category !== 'all') params.set('category', category);
      if (staff && staff !== 'all') params.set('staff', staff);
      if (member.trim()) params.set('member', member.trim());
      if (search.trim()) params.set('search', search.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const response = await fetch(`/api/admin/global-change-log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({} as any));
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      setEvents(Array.isArray(body.events) ? body.events : []);
      setStaffOptions(Array.isArray(body.staffOptions) ? body.staffOptions : []);
      setSources(body.sources && typeof body.sources === 'object' ? body.sources : {});
      setScanned(Number(body.scanned) || 0);
    } catch (error: any) {
      const message = String(error?.message || 'Unknown error');
      setLoadError(message);
      toast({
        variant: 'destructive',
        title: 'Could not load global change log',
        description: message,
      });
    } finally {
      setLoading(false);
    }
  }, [user, category, staff, member, search, from, to, toast]);

  useEffect(() => {
    if (!isSuperAdmin || !user) return;
    void load();
  }, [isSuperAdmin, user, load]);

  const sourceSummary = useMemo(() => {
    const parts = Object.entries(sources).map(([key, count]) => `${key}: ${count}`);
    return parts.length ? parts.join(' · ') : 'Waiting for first load…';
  }, [sources]);

  if (isLoading || !isSuperAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button type="button" variant="ghost" size="sm" className="mb-1 -ml-2 h-8 px-2" asChild>
            <Link href="/admin/super-admin-tools">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Super Admin Tools
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Global Change Log</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Site-wide history of member status updates, pathway/file reviews, cover sheets, referral forms, MIF
            Caspio pushes, emails, and ISP/ALFT downloads. Filter by staff, member, category, or time.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>
            Showing {events.length} event{events.length === 1 ? '' : 's'}
            {scanned ? ` (scanned ${scanned} across sources)` : ''}. {sourceSummary}
            {loadError ? (
              <span className="mt-1 block text-red-700">Load error: {loadError}</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Staff</label>
            <Select value={staff} onValueChange={setStaff}>
              <SelectTrigger>
                <SelectValue placeholder="Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {staffOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Member</label>
            <Input
              value={member}
              onChange={(e) => setMember(e.target.value)}
              placeholder="Name, MRN, Client_ID2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Summary, action, source…"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !events.length ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading change history…
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No events match these filters yet.
              <div className="mt-2 text-xs">
                Kaiser referral <span className="font-medium">downloads / previews / sends</span> are logged going
                forward. Previously, only emailed referrals were stored in Email Logs — generate or download a
                referral again, then Refresh.
              </div>
            </div>
          ) : (
            <div className="overflow-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 whitespace-nowrap">When</th>
                    <th className="px-3 py-2 whitespace-nowrap">Category</th>
                    <th className="px-3 py-2 min-w-[16rem]">Summary</th>
                    <th className="px-3 py-2 whitespace-nowrap">Member</th>
                    <th className="px-3 py-2 whitespace-nowrap">Staff</th>
                    <th className="px-3 py-2 whitespace-nowrap">Source</th>
                    <th className="px-3 py-2 whitespace-nowrap">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const when = event.atIso ? new Date(event.atIso).toLocaleString() : '—';
                    const categoryLabel =
                      GLOBAL_CHANGE_CATEGORY_LABELS[event.category] || event.category;
                    return (
                      <tr key={event.id} className="border-t align-top hover:bg-slate-50/80">
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs tabular-nums text-slate-700">
                          {when}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge variant="outline" className={categoryBadgeClass(event.category)}>
                            {categoryLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{event.summary}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {event.action}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div>{event.memberName || '—'}</div>
                          {event.memberMrn || event.clientId2 ? (
                            <div className="text-[11px] text-muted-foreground">
                              {event.memberMrn ? `MRN ${event.memberMrn}` : ''}
                              {event.memberMrn && event.clientId2 ? ' · ' : ''}
                              {event.clientId2 ? `ID2 ${event.clientId2}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div>{event.staffName || '—'}</div>
                          {event.staffEmail && event.staffEmail !== event.staffName ? (
                            <div className="text-[11px] text-muted-foreground">{event.staffEmail}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                          {event.source}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {event.href ? (
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2" asChild>
                              <Link href={event.href}>
                                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                Open
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
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
