'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Printer, Search, Building2, MapPin, Users, Sparkles, RefreshCw, Download } from 'lucide-react';

type RosterMember = {
  id: string;
  name: string;
  isNewAssignment?: boolean;
};

type RosterFacility = {
  id: string;
  name: string;
  address: string;
  city?: string;
  zip?: string;
  county?: string;
  members: RosterMember[];
};

export default function SWRosterPage() {
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [facilities, setFacilities] = useState<RosterFacility[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const refreshRoster = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    setError(null);
    try {
      // Use the SW assignments endpoint that resolves SW_ID/name from cache.
      // This is more reliable than exact-email matching in Caspio fields.
      const res = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(user.email)}`);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load roster (HTTP ${res.status})`);
      }

      const nextFacilities = Array.isArray(data?.rcfeList) ? (data.rcfeList as RosterFacility[]) : [];
      setFacilities(nextFacilities);
      setHasLoadedOnce(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to load roster.');
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;

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
    if (!isSocialWorker) return;

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isSocialWorker, user]);

  const filteredFacilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return facilities;

    return facilities
      .map((f) => {
        const members = Array.isArray(f.members) ? f.members : [];
        const matchedMembers = members.filter((m) => String(m?.name || '').toLowerCase().includes(q));
        const facilityHit =
          String(f.name || '').toLowerCase().includes(q) ||
          String(f.address || '').toLowerCase().includes(q) ||
          String(f.city || '').toLowerCase().includes(q) ||
          String(f.zip || '').toLowerCase().includes(q) ||
          String(f.county || '').toLowerCase().includes(q);
        if (facilityHit) return f;
        if (matchedMembers.length === 0) return null;
        return { ...f, members: matchedMembers };
      })
      .filter(Boolean) as RosterFacility[];
  }, [facilities, query]);

  const totals = useMemo(() => {
    const facilityCount = facilities.length;
    const memberCount = facilities.reduce((sum, f) => sum + (Array.isArray(f.members) ? f.members.length : 0), 0);
    return { facilityCount, memberCount };
  }, [facilities]);

  const downloadCsv = useCallback(() => {
    const rows: Array<Record<string, string>> = [];

    facilities.forEach((f) => {
      const members = Array.isArray(f.members) ? f.members : [];
      if (members.length === 0) {
        rows.push({
          rcfeName: String(f.name || ''),
          rcfeAddress: String(f.address || ''),
          rcfeCity: String(f.city || ''),
          rcfeZip: String(f.zip || ''),
          memberName: '',
        });
        return;
      }
      members.forEach((m) => {
        rows.push({
          rcfeName: String(f.name || ''),
          rcfeAddress: String(f.address || ''),
          rcfeCity: String(f.city || ''),
          rcfeZip: String(f.zip || ''),
          memberName: String(m?.name || ''),
        });
      });
    });

    const headers = ['rcfeName', 'rcfeAddress', 'rcfeCity', 'rcfeZip', 'memberName'] as const;
    const escape = (value: string) => {
      const raw = String(value ?? '');
      if (raw.includes('"')) return `"${raw.replace(/"/g, '""')}"`;
      if (raw.includes(',') || raw.includes('\n') || raw.includes('\r')) return `"${raw}"`;
      return raw;
    };

    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(String(r[h] ?? ''))).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const day = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `weekly_roster_${day}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [facilities]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading roster…</p>
        </div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
            <CardDescription>Sign in as a social worker to view your weekly roster.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Weekly Roster</h1>
          <p className="text-muted-foreground">
            Members assigned to each home (RCFE) with addresses. Designed for quick reference and printing.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {totals.facilityCount} RCFE{totals.facilityCount === 1 ? '' : 's'}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              {totals.memberCount} member{totals.memberCount === 1 ? '' : 's'}
            </Badge>
            {lastSync ? (
              <span>Cache last updated: {lastSync}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void refreshRoster()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {loading ? 'Refreshing…' : 'Refresh list'}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={downloadCsv}
            disabled={loading || facilities.length === 0}
            title={facilities.length === 0 ? 'Load the roster first' : 'Download CSV'}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
          <CardDescription>Filter by home name, address, or member name.</CardDescription>
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

      <div className="space-y-4">
        {!hasLoadedOnce && !loading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Load your roster</CardTitle>
              <CardDescription>
                Tap <span className="font-semibold">Refresh list</span> to load your assigned members from the weekly cache.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {hasLoadedOnce && filteredFacilities.length === 0 && !loading && !error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No assignments found</CardTitle>
              <CardDescription>
                If this seems wrong, your assignments may not be set yet or the weekly cache hasn’t refreshed.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {filteredFacilities.map((f) => (
          <Card key={f.id} className="break-inside-avoid">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{f.name}</CardTitle>
                  <CardDescription className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5" />
                    <span>
                      {f.address}
                      {f.city || f.zip ? (
                        <span className="text-muted-foreground">
                          {' '}
                          • {[String(f.city || '').trim(), String(f.zip || '').trim()].filter(Boolean).join(' ')}
                        </span>
                      ) : null}
                    </span>
                  </CardDescription>
                </div>
                <Badge variant="secondary">{(f.members || []).length} member(s)</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(f.members || []).map((m) => (
                  <div key={m.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.name}</span>
                      {m.isNewAssignment ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          <Sparkles className="h-3.5 w-3.5" />
                          NEW
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

