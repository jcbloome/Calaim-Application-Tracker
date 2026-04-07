'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck, FileSignature, FlagTriangleRight } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';

type ClaimDoc = {
  id: string;
  socialWorkerEmail?: string;
  status?: string;
  claimMonth?: string;
  claimDay?: string;
  rcfeId?: string;
  rcfeName?: string;
  hasFlaggedVisits?: boolean;
  visitIds?: string[];
  signoffById?: Record<string, any>;
  memberVisits?: any[];
};

type CclGroup = {
  key: string; // rcfeId_month
  rcfeId: string;
  rcfeName: string;
  month: string; // YYYY-MM
  draftClaimIds: string[];
  checkExists: boolean;
};

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\\s+/g, ' ');

const claimReadyToSubmit = (c: ClaimDoc) => {
  const visitIds = Array.isArray(c.visitIds) ? c.visitIds.map((v) => String(v || '').trim()).filter(Boolean) : [];
  if (visitIds.length === 0) return false;
  const signoffs = c.signoffById && typeof c.signoffById === 'object' ? Object.values(c.signoffById) : [];
  const signedVisitIds = new Set<string>();
  signoffs.forEach((s: any) => {
    const vids = Array.isArray(s?.visitIds) ? s.visitIds : [];
    vids.forEach((id: any) => {
      const t = String(id || '').trim();
      if (t) signedVisitIds.add(t);
    });
  });
  return visitIds.every((id) => signedVisitIds.has(id));
};

export default function SwEndOfDayPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isSocialWorker, isLoading: swLoading } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimDoc[]>([]);
  const [cclExistsByKey, setCclExistsByKey] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    if (!firestore || !swEmail) return;
    setLoading(true);
    setError(null);
    try {
      const q1 = query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', swEmail));
      const snap = await getDocs(q1);
      const next: ClaimDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setClaims(next);
    } catch (e: any) {
      setClaims([]);
      setError(e?.message || 'Failed to load SW claims.');
    } finally {
      setLoading(false);
    }
  }, [firestore, swEmail]);

  useEffect(() => {
    if (swLoading) return;
    if (!isSocialWorker) return;
    void refresh();
  }, [isSocialWorker, refresh, swLoading]);

  const draftClaimsForMonth = useMemo(() => {
    const draft = claims.filter((c) => normalize(c.status) === 'draft');
    return draft.filter((c) => String(c.claimMonth || '').trim() === month);
  }, [claims, month]);

  const signoffsNeeded = useMemo(() => {
    return draftClaimsForMonth.filter((c) => !claimReadyToSubmit(c));
  }, [draftClaimsForMonth]);

  const flaggedDrafts = useMemo(() => {
    return draftClaimsForMonth.filter((c) => Boolean(c.hasFlaggedVisits));
  }, [draftClaimsForMonth]);

  const cclGroups = useMemo(() => {
    const grouped = new Map<string, { rcfeId: string; rcfeName: string; month: string; ids: string[] }>();
    draftClaimsForMonth.forEach((c) => {
      const rcfeId = String(c.rcfeId || '').trim();
      const m = String(c.claimMonth || '').trim();
      const rcfeName = String(c.rcfeName || '').trim() || rcfeId;
      if (!rcfeId || !m) return;
      const key = `${rcfeId}_${m}`;
      const ex = grouped.get(key);
      if (ex) ex.ids.push(String(c.id));
      else grouped.set(key, { rcfeId, rcfeName, month: m, ids: [String(c.id)] });
    });
    return Array.from(grouped.values()).map((g) => ({
      key: `${g.rcfeId}_${g.month}`,
      rcfeId: g.rcfeId,
      rcfeName: g.rcfeName,
      month: g.month,
      draftClaimIds: g.ids,
      checkExists: Boolean(cclExistsByKey[`${g.rcfeId}_${g.month}`]),
    })) as CclGroup[];
  }, [cclExistsByKey, draftClaimsForMonth]);

  const missingCclGroups = useMemo(() => cclGroups.filter((g) => !g.checkExists), [cclGroups]);

  const blockedReadyClaims = useMemo(() => {
    const missing = new Set(missingCclGroups.map((g) => g.key));
    return draftClaimsForMonth.filter((c) => {
      if (!claimReadyToSubmit(c)) return false;
      const rcfeId = String(c.rcfeId || '').trim();
      const m = String(c.claimMonth || '').trim();
      if (!rcfeId || !m) return false;
      return missing.has(`${rcfeId}_${m}`);
    });
  }, [draftClaimsForMonth, missingCclGroups]);

  const loadCclExistence = useCallback(async () => {
    if (!auth?.currentUser) return;
    const unique = Array.from(
      new Set(
        draftClaimsForMonth
          .map((c) => `${String(c.rcfeId || '').trim()}_${String(c.claimMonth || '').trim()}`)
          .filter((k) => k && !k.startsWith('_') && k.split('_').length === 2)
      )
    );
    if (unique.length === 0) {
      setCclExistsByKey({});
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      const results = await Promise.all(
        unique.map(async (key) => {
          const [rcfeId, m] = key.split('_');
          const qs = new URLSearchParams({ rcfeId, month: m });
          const res = await fetch(`/api/sw-visits/rcfe-ccl-check?${qs.toString()}`, {
            headers: { authorization: `Bearer ${idToken}` },
          });
          const data = await res.json().catch(() => ({} as any));
          const exists = Boolean(res.ok && data?.success && data?.check);
          return { key, exists };
        })
      );
      const map: Record<string, boolean> = {};
      results.forEach((r) => (map[r.key] = r.exists));
      setCclExistsByKey(map);
    } catch (e: any) {
      toast({ title: 'CCL check status unavailable', description: e?.message || 'Could not verify CCL checks.' });
    }
  }, [auth?.currentUser, draftClaimsForMonth, toast]);

  useEffect(() => {
    if (!isSocialWorker || swLoading) return;
    void loadCclExistence();
  }, [isSocialWorker, loadCclExistence, swLoading]);

  const openCclUrl = (g: CclGroup) =>
    `/sw-portal/ccl-checks?rcfeId=${encodeURIComponent(g.rcfeId)}&month=${encodeURIComponent(g.month)}`;

  if (swLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>End of day checklist</CardTitle>
            <CardDescription>Please sign in as a Social Worker to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">End of day checklist</h1>
          <p className="text-muted-foreground">A quick sweep to ensure your drafts can submit cleanly.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Month: {month}</Badge>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              Sign-offs needed
            </CardTitle>
            <CardDescription>Draft claims missing one or more facility signatures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={signoffsNeeded.length ? 'destructive' : 'secondary'}>{signoffsNeeded.length} open</Badge>
            {signoffsNeeded.length === 0 ? (
              <div className="text-sm text-muted-foreground pt-2">Nothing pending.</div>
            ) : (
              <div className="space-y-2 pt-2">
                {signoffsNeeded.slice(0, 6).map((c) => (
                  <div key={c.id} className="rounded-md border p-2">
                    <div className="text-sm font-medium truncate">{c.rcfeName || 'RCFE'}</div>
                    <div className="text-xs text-muted-foreground truncate">Claim: {c.claimDay || c.claimMonth || '—'}</div>
                  </div>
                ))}
                <Button asChild className="w-full" variant="outline">
                  <Link href="/sw-portal/sign-off">Go to Sign Off</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              CCL checks required
            </CardTitle>
            <CardDescription>One monthly check per RCFE covers all members at that home.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={missingCclGroups.length ? 'destructive' : 'secondary'}>{missingCclGroups.length} required</Badge>
            {missingCclGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground pt-2">All set for this month.</div>
            ) : (
              <div className="space-y-2 pt-2">
                {missingCclGroups.slice(0, 6).map((g) => (
                  <div key={g.key} className="rounded-md border p-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{g.rcfeName}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{g.month}</span> • Draft claims: {g.draftClaimIds.length}
                      </div>
                    </div>
                    <Button asChild size="sm">
                      <Link href={openCclUrl(g)}>Complete</Link>
                    </Button>
                  </div>
                ))}
                <Button asChild className="w-full" variant="outline">
                  <Link href="/sw-portal/ccl-checks">Open CCL Checks</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlagTriangleRight className="h-4 w-4" />
              Flagged items
            </CardTitle>
            <CardDescription>Draft claims containing flagged/critical visit notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={flaggedDrafts.length ? 'destructive' : 'secondary'}>{flaggedDrafts.length} flagged</Badge>
            {flaggedDrafts.length === 0 ? (
              <div className="text-sm text-muted-foreground pt-2">No flagged drafts detected.</div>
            ) : (
              <div className="space-y-2 pt-2">
                {flaggedDrafts.slice(0, 6).map((c) => (
                  <div key={c.id} className="rounded-md border p-2">
                    <div className="text-sm font-medium truncate">{c.rcfeName || 'RCFE'}</div>
                    <div className="text-xs text-muted-foreground truncate">Claim: {c.claimDay || c.claimMonth || '—'}</div>
                  </div>
                ))}
                <Button asChild className="w-full" variant="outline">
                  <Link href="/sw-portal/claims">Open Claims</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {blockedReadyClaims.length > 0 ? (
        <Alert>
          <AlertDescription>
            {blockedReadyClaims.length} draft claim(s) are ready but blocked until the monthly CCL check is completed for their RCFE.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

