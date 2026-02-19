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
  address: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
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
        description: `Loaded ${Array.isArray(data.records) ? data.records.length : 0} row(s) from Caspio.`,
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
      const matchSw = bySwId.get(String(r.swId || '').trim()) || [];
      const matchText = `${matchSw.map((m) => `${m.name || ''} ${m.email || ''}`).join(' ')}`.toLowerCase();
      return swId.includes(q) || addr.includes(q) || matchText.includes(q);
    });
  }, [eftRecords, search, bySwId]);

  const matchedCount = useMemo(() => {
    let count = 0;
    for (const r of eftRecords) {
      const key = String(r.swId || '').trim();
      if (!key) continue;
      if ((bySwId.get(key) || []).length > 0) count += 1;
    }
    return count;
  }, [eftRecords, bySwId]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <MapPinned className="h-8 w-8 text-blue-600" />
            SW proximity prep
          </h1>
          <p className="text-muted-foreground mt-2">
            Pull `Cal_AIM_EFT_Setup` from Caspio, normalize SW address, and match by `SW_ID`.
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
            <CardTitle className="text-sm font-medium">EFT rows</CardTitle>
            <CardDescription>From `Cal_AIM_EFT_Setup`</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eftRecords.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Matched SW_IDs</CardTitle>
            <CardDescription>Matched against `syncedSocialWorkers`</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matchedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unmatched</CardTitle>
            <CardDescription>Missing SW record or SW_ID</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.max(0, eftRecords.length - matchedCount)}</div>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, idx) => {
                    const key = String(r.swId || '').trim();
                    const matches = key ? bySwId.get(key) || [] : [];
                    const isMatched = matches.length > 0;
                    return (
                      <TableRow key={`${key || 'row'}-${idx}`}>
                        <TableCell className="font-mono">{key || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          {matches.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
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
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.address || <span className="text-muted-foreground">—</span>}</div>
                        </TableCell>
                        <TableCell>
                          {isMatched ? <Badge className="bg-green-600">Matched</Badge> : <Badge variant="destructive">Unmatched</Badge>}
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
    </div>
  );
}

