'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Printer, Search, Users, Building2, MapPin, Sparkles } from 'lucide-react';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';

type MemberRow = {
  Client_ID2?: string;
  client_ID2?: string;
  Senior_First?: string;
  Senior_Last?: string;
  Social_Worker_Assigned?: string;
  Kaiser_User_Assignment?: string;
  RCFE_Name?: string;
  RCFE_Address?: string;
  RCFE_City?: string;
  RCFE_State?: string;
  RCFE_Zip?: string;
  RCFE_County?: string;
  MemberCity?: string;
  Member_City?: string;
  Member_County?: string;
  assignmentChangedAt?: string;
  assignmentChangedTo?: string;
};

type RcfeGroup = {
  rcfeName: string;
  address: string;
  members: Array<{ name: string; isNew: boolean }>;
};

type SwGroup = {
  swKey: string;
  rcfes: RcfeGroup[];
  memberCount: number;
};

function buildRcfeAddress(m: MemberRow): string {
  const addressLine = String(m?.RCFE_Address || '').trim();
  const city = String(m?.RCFE_City || m?.MemberCity || (m as any)?.Member_City || '').trim();
  const state = String(m?.RCFE_State || '').trim();
  const zip = String(m?.RCFE_Zip || '').trim();
  return [addressLine, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim() || 'Address not available';
}

function memberDisplayName(m: MemberRow): string {
  const first = String(m?.Senior_First || '').trim();
  const last = String(m?.Senior_Last || '').trim();
  const name = `${first} ${last}`.trim();
  return name || 'Unknown member';
}

function isNewAssignmentForSw(m: MemberRow, swKey: string) {
  const to = String(m?.assignmentChangedTo || '').trim().toLowerCase();
  const sw = String(swKey || '').trim().toLowerCase();
  if (!to || !sw || to !== sw) return false;
  const raw = m?.assignmentChangedAt;
  if (!raw) return false;
  const dt = new Date(String(raw));
  if (Number.isNaN(dt.getTime())) return false;
  const ageMs = Date.now() - dt.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs <= sevenDaysMs;
}

export default function AdminSwRosterPage() {
  const { isAdmin, isLoading } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/all-members');
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to load members (HTTP ${res.status})`);
        }
        const rows = Array.isArray(data?.members) ? (data.members as MemberRow[]) : [];
        if (!cancelled) setMembers(rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load roster.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loadStatus = async () => {
      try {
        const res = await fetch('/api/caspio/members-cache/status');
        const data = await res.json().catch(() => ({} as any));
        const ts =
          data?.settings?.lastSuccessAt ||
          data?.settings?.lastRunAt ||
          data?.settings?.lastSyncAt ||
          null;
        if (!cancelled) setLastSync(ts ? String(ts) : null);
      } catch {
        // ignore
      }
    };

    if (isLoading) return;
    if (!isAdmin) return;

    void load();
    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isLoading]);

  const swGroups = useMemo(() => {
    const q = query.trim().toLowerCase();

    const rows = members
      .map((m) => {
        const rcfeName = normalizeRcfeNameForAssignment(m?.RCFE_Name);
        if (!rcfeName) return null;
        const sw = String(m?.Social_Worker_Assigned || m?.Kaiser_User_Assignment || '').trim();
        const swKey = sw || '(Unassigned)';
        const name = memberDisplayName(m);
        const address = buildRcfeAddress(m);

        const hay = `${swKey} ${rcfeName} ${address} ${name}`.toLowerCase();
        if (q && !hay.includes(q)) return null;

        return { swKey, rcfeName, address, name, raw: m };
      })
      .filter(Boolean) as Array<{ swKey: string; rcfeName: string; address: string; name: string; raw: MemberRow }>;

    const map = new Map<string, Map<string, RcfeGroup>>();
    rows.forEach((r) => {
      if (!map.has(r.swKey)) map.set(r.swKey, new Map());
      const rcfeMap = map.get(r.swKey)!;
      if (!rcfeMap.has(r.rcfeName)) {
        rcfeMap.set(r.rcfeName, { rcfeName: r.rcfeName, address: r.address, members: [] });
      }
      rcfeMap.get(r.rcfeName)!.members.push({ name: r.name, isNew: isNewAssignmentForSw(r.raw, r.swKey) });
    });

    const groups: SwGroup[] = Array.from(map.entries()).map(([swKey, rcfeMap]) => {
      const rcfes = Array.from(rcfeMap.values()).map((g) => ({
        ...g,
        members: g.members.sort((a, b) => a.name.localeCompare(b.name)),
      }));
      rcfes.sort((a, b) => a.rcfeName.localeCompare(b.rcfeName));
      const memberCount = rcfes.reduce((sum, g) => sum + g.members.length, 0);
      return { swKey, rcfes, memberCount };
    });

    // Assigned SWs first, then unassigned at bottom.
    groups.sort((a, b) => {
      if (a.swKey === '(Unassigned)') return 1;
      if (b.swKey === '(Unassigned)') return -1;
      return a.swKey.localeCompare(b.swKey);
    });

    return groups;
  }, [members, query]);

  const totals = useMemo(() => {
    const swCount = swGroups.filter((g) => g.swKey !== '(Unassigned)').length;
    const rcfeCount = swGroups.reduce((sum, g) => sum + g.rcfes.length, 0);
    const memberCount = swGroups.reduce((sum, g) => sum + g.memberCount, 0);
    return { swCount, rcfeCount, memberCount };
  }, [swGroups]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>SW Roster</CardTitle>
            <CardDescription>Admins only.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold">SW Weekly Roster (Admin)</h1>
          <p className="text-muted-foreground">
            Summary roster grouped by Social Worker → RCFE → assigned members. Built from the cached weekly sync.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              {totals.swCount} SW
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {totals.rcfeCount} RCFE
            </Badge>
            <Badge variant="secondary">{totals.memberCount} member(s)</Badge>
            {lastSync ? <span>Cache last updated: {lastSync}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
          <CardDescription>Filter by SW email/name, RCFE name/address, or member name.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to search…" />
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Could not load roster</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      <div className="space-y-6">
        {swGroups.map((g) => (
          <Card key={g.swKey} className="break-inside-avoid">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{g.swKey}</CardTitle>
                  <CardDescription>
                    {g.rcfes.length} RCFE • {g.memberCount} member(s)
                  </CardDescription>
                </div>
                <Badge variant="secondary">{g.memberCount} total</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {g.rcfes.map((r) => (
                <div key={r.rcfeName} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold">{r.rcfeName}</div>
                      <div className="text-sm text-muted-foreground flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5" />
                        <span>{r.address}</span>
                      </div>
                    </div>
                    <Badge variant="secondary">{r.members.length} member(s)</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {r.members.map((m, idx) => (
                      <div key={`${m.name}-${idx}`} className="rounded-md border border-border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{m.name}</span>
                          {m.isNew ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <Sparkles className="h-3.5 w-3.5" />
                              NEW
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

