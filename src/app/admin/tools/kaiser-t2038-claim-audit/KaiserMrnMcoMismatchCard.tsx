'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { KaiserMrnNonKaiserMcoRow } from '@/lib/kaiser-t2038-claim-audit';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

type Props = {
  /** When true, run the scan once after mount (admin already verified by parent). */
  enabled?: boolean;
};

export function KaiserMrnMcoMismatchCard({ enabled = true }: Props) {
  const auth = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<KaiserMrnNonKaiserMcoRow[]>([]);
  const [membersScanned, setMembersScanned] = useState(0);
  const [fetchedAt, setFetchedAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const [autoDone, setAutoDone] = useState(false);
  const [fromCaspio, setFromCaspio] = useState(false);

  const load = useCallback(
    async (opts?: { forceCaspio?: boolean }) => {
      const user = auth.currentUser;
      if (!user) {
        setError('Sign in required.');
        return;
      }
      const forceCaspio = Boolean(opts?.forceCaspio);
      setIsLoading(true);
      setError('');
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams({ mode: 'mco_mrn_mismatch' });
        if (forceCaspio) params.set('forceCaspio', 'true');
        const response = await fetch(`/api/admin/kaiser-t2038-claim-audit?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        const nextRows = Array.isArray(body.mismatches)
          ? (body.mismatches as KaiserMrnNonKaiserMcoRow[])
          : [];
        setRows(nextRows);
        setMembersScanned(Number(body.membersScanned || 0) || 0);
        setFetchedAt(String(body.fetchedAt || ''));
        setFromCaspio(Boolean(body.forceCaspio));
        if (forceCaspio) {
          toast({
            title: 'Refreshed from Caspio',
            description: `${nextRows.length} mismatch${nextRows.length === 1 ? '' : 'es'} (excludes Closed / Member Died / Non_Active)`,
          });
        }
      } catch (err: unknown) {
        const message = String((err as { message?: string })?.message || 'Could not scan MCO / MRN mismatches.');
        setError(message);
        toast({ title: 'MCO / MRN scan failed', description: message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    },
    [auth, toast]
  );

  useEffect(() => {
    if (!enabled || autoDone) return;
    setAutoDone(true);
    void load({ forceCaspio: false });
  }, [enabled, autoDone, load]);

  return (
    <Card className={rows.length ? 'border-orange-300' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className={`h-4 w-4 ${rows.length ? 'text-orange-600' : 'text-muted-foreground'}`} />
              Kaiser MRN · non-Kaiser MCO
              <Badge
                variant="outline"
                className={
                  rows.length
                    ? 'bg-orange-50 text-orange-950 border-orange-300'
                    : 'bg-slate-50 text-slate-700'
                }
              >
                {isLoading && !rows.length ? '…' : rows.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Separate check (not part of the T2038 claim gap list): members with{' '}
              <code className="text-[11px]">Kaiser_MRN</code> filled (or Member_MRN / MRN that looks Kaiser — usually
              starts with <span className="font-medium">0</span> or <span className="font-medium">1</span>) whose{' '}
              <code className="text-[11px]">CalAIM_MCO</code> is not Kaiser. Skips{' '}
              <span className="font-medium">Health Net</span>, <span className="font-medium">Closed</span>,{' '}
              <span className="font-medium">Member Died</span>, and <span className="font-medium">Non_Active</span>. Does
              not use <code className="text-[11px]">MCP_CIN</code> alone (Medi-Cal IDs often start with 0).
            </CardDescription>
            {fetchedAt ? (
              <p className="text-[11px] text-muted-foreground">
                Last scan: {new Date(fetchedAt).toLocaleString()}
                {fromCaspio ? ' · live Caspio' : ' · cached members'}
                {membersScanned ? ` · ${membersScanned} members checked` : ''}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
              {open ? <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> : <ChevronRight className="mr-1.5 h-3.5 w-3.5" />}
              {open ? 'Hide' : 'Show'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load({ forceCaspio: true })}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh from Caspio
            </Button>
          </div>
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-3 pt-0">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Scan failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {isLoading && rows.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning CalAIM members for Kaiser MRNs on non-Kaiser MCO…
            </div>
          ) : null}
          {!isLoading && !error && rows.length === 0 ? (
            <p className="rounded border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              No mismatches found — every Kaiser-looking MRN is on a Kaiser CalAIM_MCO (or no candidates matched).
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div className="max-h-72 overflow-y-auto rounded border">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Member</span>
                <span>CalAIM_MCO</span>
                <span>MRN</span>
                <span>Status</span>
              </div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-start gap-2 border-t px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.memberName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Client_ID2 {row.clientId2 || '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <Badge variant="outline" className="bg-orange-50 text-orange-950 border-orange-300 font-normal">
                      {row.calaimMco}
                    </Badge>
                  </div>
                  <div className="min-w-0 text-xs">
                    <div className="truncate font-mono">{row.mrn}</div>
                    <div className="truncate text-[11px] text-muted-foreground">via {row.mrnField}</div>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{row.calaimStatus || '—'}</div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
