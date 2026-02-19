'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { MapPinned, RefreshCw, Search } from 'lucide-react';

type EftRecord = {
  swId: string;
  staffName?: string;
  email?: string;
  county?: string;
  address: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  hasEft?: boolean;
  raw?: any;
};

type SyncedSw = {
  id: string;
  sw_id: string;
  name?: string;
  email?: string;
};

export default function SwProximityToolsPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(false);
  const [eftRecords, setEftRecords] = useState<EftRecord[]>([]);
  const [sampleKeys, setSampleKeys] = useState<string[]>([]);
  const [syncedSw, setSyncedSw] = useState<SyncedSw[]>([]);
  const [search, setSearch] = useState('');
  const [closestLoading, setClosestLoading] = useState(false);
  const [closestForSwId, setClosestForSwId] = useState<string>('');
  const [closestResult, setClosestResult] = useState<any | null>(null);

  const loadSyncedSocialWorkers = useCallback(async () => {
    if (!firestore) return;
    const snap = await getDocs(collection(firestore, 'syncedSocialWorkers'));
    const rows: SyncedSw[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        sw_id: String(data?.sw_id || '').trim(),
        name: String(data?.name || '').trim() || undefined,
        email: String(data?.email || '').trim() || undefined,
      };
    });
    setSyncedSw(rows.filter((r) => !!r.sw_id));
  }, [firestore]);

  const loadEftSetup = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      const token = await auth?.currentUser?.getIdToken?.().catch(() => '');
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/caspio/eft-setup', { headers });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || `Failed to load EFT setup (HTTP ${res.status})`);
      }
      setEftRecords(Array.isArray(data.records) ? data.records : []);
      setSampleKeys(Array.isArray(data.sampleKeys) ? data.sampleKeys : []);
      toast({
        title: 'Loaded EFT setup',
        description: `Loaded ${Array.isArray(data.records) ? data.records.length : 0} social worker(s) from Caspio.`,
      });
    } catch (e: any) {
      toast({
        title: 'Load failed',
        description: e?.message || 'Failed to load EFT setup.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [auth?.currentUser, toast]);

  const bySwId = useMemo(() => {
    const map = new Map<string, SyncedSw[]>();
    for (const sw of syncedSw) {
      const key = String(sw.sw_id || '').trim();
      if (!key) continue;
      map.set(key, [...(map.get(key) || []), sw]);
    }
    return map;
  }, [syncedSw]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eftRecords;
    return eftRecords.filter((r) => {
      const swId = String(r.swId || '').toLowerCase();
      const addr = String(r.address || '').toLowerCase();
      const staffName = String(r.staffName || '').toLowerCase();
      const email = String(r.email || '').toLowerCase();
      const county = String(r.county || '').toLowerCase();
      const matchSw = bySwId.get(String(r.swId || '').trim()) || [];
      const matchText = `${matchSw.map((m) => `${m.name || ''} ${m.email || ''}`).join(' ')}`.toLowerCase();
      return swId.includes(q) || addr.includes(q) || staffName.includes(q) || email.includes(q) || county.includes(q) || matchText.includes(q);
    });
  }, [eftRecords, search, bySwId]);

  const hasEftCount = useMemo(() => {
    let count = 0;
    for (const r of eftRecords) {
      if (String(r.address || '').trim()) count += 1;
    }
    return count;
  }, [eftRecords]);

  const runClosest = useCallback(
    async (swId: string) => {
      const id = String(swId || '').trim();
      if (!id) return;
      setClosestLoading(true);
      setClosestForSwId(id);
      setClosestResult(null);
      try {
        const headers: Record<string, string> = {};
        const token = await auth?.currentUser?.getIdToken?.().catch(() => '');
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/tools/closest-members?swId=${encodeURIComponent(id)}&limit=15`, { headers });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to compute closest members (HTTP ${res.status})`);
        }
        setClosestResult(data);
      } catch (e: any) {
        toast({
          title: 'Closest members failed',
          description: e?.message || 'Failed to compute closest members.',
          variant: 'destructive',
        });
      } finally {
        setClosestLoading(false);
      }
    },
    [auth?.currentUser, toast]
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <MapPinned className="h-8 w-8 text-blue-600" />
            SW proximity prep
          </h1>
          <p className="text-muted-foreground mt-2">
            Pull the Social Worker roster from Caspio and join any `Cal_AIM_EFT_Setup` address by `SW_ID`.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await loadSyncedSocialWorkers();
              await loadEftSetup();
            }}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Social workers</CardTitle>
            <CardDescription>From the Caspio Social Worker table</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eftRecords.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Has EFT address</CardTitle>
            <CardDescription>Found in `Cal_AIM_EFT_Setup`</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasEftCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Missing EFT address</CardTitle>
            <CardDescription>No address row found yet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.max(0, eftRecords.length - hasEftCount)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Filter by SW_ID, address, name, or email.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. 1234, Baggins, Los Angeles" />
          </div>
          {sampleKeys.length > 0 ? (
            <div className="mt-3 text-xs text-muted-foreground">
              Sample Caspio fields detected: <span className="font-mono">{sampleKeys.slice(0, 16).join(', ')}</span>
              {sampleKeys.length > 16 ? '…' : ''}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EFT Setup mapping</CardTitle>
          <CardDescription>
            This is the normalized SW address mapping. Next step (future): geocode SW + members and compute distances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No rows loaded yet. Click Refresh.</div>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SW_ID</TableHead>
                    <TableHead>Matched staff</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, idx) => {
                    const key = String(r.swId || '').trim();
                    const matches = key ? bySwId.get(key) || [] : [];
                    const isMatched = matches.length > 0;
                    const hasEft = Boolean(String(r.address || '').trim());
                    return (
                      <TableRow key={`${key || 'row'}-${idx}`}>
                        <TableCell className="font-mono">{key || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          {matches.length === 0 ? (
                            <div className="space-y-0.5">
                              <div className="text-sm font-medium">
                                {r.staffName || <span className="text-muted-foreground">—</span>}
                                {r.county ? <span className="ml-2 text-xs text-muted-foreground">({r.county})</span> : null}
                              </div>
                              {r.email ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}
                              <div className="text-xs text-muted-foreground">No Firestore match</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {matches.slice(0, 2).map((m) => (
                                <div key={m.id} className="text-sm">
                                  <div className="font-medium">{m.name || 'Social Worker'}</div>
                                  {m.email ? <div className="text-xs text-muted-foreground">{m.email}</div> : null}
                                </div>
                              ))}
                              {matches.length > 2 ? (
                                <div className="text-xs text-muted-foreground">+{matches.length - 2} more</div>
                              ) : null}
                              {r.county ? (
                                <div className="text-xs text-muted-foreground">County: {r.county}</div>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.address || <span className="text-muted-foreground">—</span>}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {hasEft ? <Badge className="bg-green-600">EFT OK</Badge> : <Badge variant="destructive">No EFT</Badge>}
                            {isMatched ? <Badge variant="outline">Firestore match</Badge> : <Badge variant="outline">No Firestore match</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!key || closestLoading || !hasEft}
                            onClick={() => runClosest(key)}
                          >
                            {closestLoading && closestForSwId === key ? 'Computing…' : 'Closest'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {closestResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Closest authorized members</CardTitle>
            <CardDescription>
              SW_ID <span className="font-mono">{String(closestResult?.sw?.swId || '')}</span> — {String(closestResult?.sw?.address || '')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(closestResult?.closestRcfes || []).map((r: any) => (
                <div key={String(r.rcfeName)} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{String(r.rcfeName)}</div>
                      <div className="text-xs text-muted-foreground">{String(r.rcfeAddress)}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">{Number(r.distanceMiles || 0).toFixed(1)} mi</Badge>
                      <div className="text-xs text-muted-foreground mt-1">{Number(r.memberCount || 0)} members</div>
                    </div>
                  </div>
                  {Array.isArray(r.sampleMembers) && r.sampleMembers.length > 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Sample: {r.sampleMembers.map((m: any) => String(m?.name || m?.clientId2 || '')).filter(Boolean).slice(0, 6).join(', ')}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

