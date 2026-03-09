'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { SWTopNav } from '@/components/sw/SWTopNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';

const CCLD_ELDERLY_ASSISTED_LIVING_URL = 'https://www.ccld.dss.ca.gov/carefacilitysearch/';

type ClaimDoc = {
  id: string;
  socialWorkerEmail?: string;
  status?: string;
  claimMonth?: string;
  rcfeId?: string;
  rcfeName?: string;
};

type DueItem = {
  key: string; // rcfeId_month
  rcfeId: string;
  rcfeName: string;
  month: string; // YYYY-MM
  draftClaims: string[];
  checkExists: boolean;
};

export default function CclChecksPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isSocialWorker, isLoading: swLoading } = useSocialWorker();
  const searchParams = useSearchParams();

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DueItem[]>([]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<DueItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [form, setForm] = useState({
    latestReportDate: '',
    typeAViolations: 0,
    typeBViolations: 0,
    seriousViolationComments: '',
  });

  const loadDue = useCallback(async () => {
    if (!firestore || !swEmail) return;
    if (!auth?.currentUser) return;
    setLoading(true);
    setError(null);
    try {
      // Avoid composite indexes: query by SW email only; filter locally.
      const q1 = query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', swEmail));
      const snap = await getDocs(q1);
      const claims: ClaimDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const drafts = claims.filter((c) => String(c.status || 'draft').toLowerCase() === 'draft');

      const grouped = new Map<string, { rcfeId: string; rcfeName: string; month: string; ids: string[] }>();
      drafts.forEach((c) => {
        const rcfeId = String(c.rcfeId || '').trim();
        const month = String(c.claimMonth || '').trim();
        const rcfeName = String(c.rcfeName || '').trim();
        if (!rcfeId || !month) return;
        const key = `${rcfeId}_${month}`;
        const existing = grouped.get(key);
        if (existing) existing.ids.push(String(c.id));
        else grouped.set(key, { rcfeId, rcfeName, month, ids: [String(c.id)] });
      });

      const idToken = await auth.currentUser.getIdToken();
      const checks = await Promise.all(
        Array.from(grouped.values()).map(async (g) => {
          const qs = new URLSearchParams({ rcfeId: g.rcfeId, month: g.month });
          const res = await fetch(`/api/sw-visits/rcfe-ccl-check?${qs.toString()}`, {
            headers: { authorization: `Bearer ${idToken}` },
          });
          const data = await res.json().catch(() => ({} as any));
          const checkExists = Boolean(res.ok && data?.success && data?.check);
          const item: DueItem = {
            key: `${g.rcfeId}_${g.month}`,
            rcfeId: g.rcfeId,
            rcfeName: g.rcfeName || g.rcfeId,
            month: g.month,
            draftClaims: g.ids,
            checkExists,
          };
          return item;
        })
      );

      // Missing checks first, then newest month.
      const sorted = checks.sort((a, b) => {
        if (a.checkExists !== b.checkExists) return a.checkExists ? 1 : -1;
        return String(b.month).localeCompare(String(a.month));
      });
      setItems(sorted);
    } catch (e: any) {
      setItems([]);
      setError(e?.message || 'Failed to load CCL checks.');
    } finally {
      setLoading(false);
    }
  }, [auth?.currentUser, firestore, swEmail]);

  useEffect(() => {
    if (swLoading) return;
    if (!isSocialWorker) return;
    void loadDue();
  }, [isSocialWorker, loadDue, swLoading]);

  const missingCount = useMemo(() => items.filter((i) => !i.checkExists).length, [items]);

  const prefillExisting = useCallback(
    async (item: DueItem) => {
      if (!auth?.currentUser) return;
      setPrefillLoading(true);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const qs = new URLSearchParams({ rcfeId: item.rcfeId, month: item.month });
        const res = await fetch(`/api/sw-visits/rcfe-ccl-check?${qs.toString()}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) return;
        const check = data?.check;
        if (!check) return;
        setForm({
          latestReportDate: String(check?.latestReportDate || '').slice(0, 10),
          typeAViolations: Number(check?.typeAViolations ?? 0) || 0,
          typeBViolations: Number(check?.typeBViolations ?? 0) || 0,
          seriousViolationComments: String(check?.seriousViolationComments || ''),
        });
        setAcknowledged(Boolean(check?.acknowledged));
      } finally {
        setPrefillLoading(false);
      }
    },
    [auth?.currentUser]
  );

  const openDialog = (item: DueItem) => {
    setActive(item);
    setAcknowledged(false);
    setForm({
      latestReportDate: '',
      typeAViolations: 0,
      typeBViolations: 0,
      seriousViolationComments: '',
    });
    setOpen(true);
    void prefillExisting(item);
  };

  // Deep-link support: /sw-portal/ccl-checks?rcfeId=...&month=YYYY-MM
  useEffect(() => {
    if (!isSocialWorker) return;
    if (open) return;
    const rcfeId = String(searchParams?.get('rcfeId') || '').trim();
    const month = String(searchParams?.get('month') || '').trim();
    if (!rcfeId || !month) return;
    const match = items.find((i) => String(i.rcfeId).trim() === rcfeId && String(i.month).trim() === month);
    if (match) openDialog(match);
  }, [isSocialWorker, items, open, searchParams]);

  const save = async () => {
    if (!auth?.currentUser || !active) return;
    if (saving) return;
    setSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/sw-visits/rcfe-ccl-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          rcfeId: active.rcfeId,
          rcfeName: active.rcfeName,
          month: active.month,
          latestReportDate: form.latestReportDate,
          typeAViolations: Number(form.typeAViolations || 0),
          typeBViolations: Number(form.typeBViolations || 0),
          seriousViolationComments: form.seriousViolationComments,
          acknowledged: Boolean(acknowledged),
          checkedByName: String((user as any)?.displayName || swEmail || 'Social Worker').trim(),
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to save check (HTTP ${res.status})`);
      toast({
        title: 'CCL check saved',
        description: `Auto-submitted ${Number(data?.autoSubmittedClaims || 0)} claim(s).`,
      });
      setOpen(false);
      setActive(null);
      await loadDue();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Could not save check.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
            <CardTitle>CCL Checks</CardTitle>
            <CardDescription>Please sign in as a Social Worker to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <SWTopNav />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            CCL Checks
          </h1>
          <p className="text-muted-foreground">
            Monthly Community Care Licensing check per RCFE. Complete this after sign-off; it will auto-submit pending claims.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={missingCount ? 'destructive' : 'secondary'}>{missingCount} required</Badge>
          <Button variant="outline" onClick={() => void loadDue()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Link className="text-sm underline underline-offset-2 text-blue-700" href={CCLD_ELDERLY_ASSISTED_LIVING_URL} target="_blank" rel="noreferrer">
            Open CCLD site <ExternalLink className="inline-block h-4 w-4 ml-1" />
          </Link>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">RCFEs needing checks</CardTitle>
          <CardDescription>Missing checks are shown first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No pending draft claims found.</div>
          ) : (
            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.key} className="rounded-lg border bg-white p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.rcfeName}</div>
                    <div className="text-xs text-muted-foreground">
                      Month: <span className="font-mono">{i.month}</span> • Draft claims: {i.draftClaims.length}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Badge variant={i.checkExists ? 'secondary' : 'destructive'}>{i.checkExists ? 'Complete' : 'Required'}</Badge>
                    <Button type="button" onClick={() => openDialog(i)} disabled={saving}>
                      {i.checkExists ? 'View / re-check' : 'Complete check'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete monthly CCL check</DialogTitle>
            <DialogDescription>
              {active ? (
                <>
                  {active.rcfeName} • <span className="font-mono">{active.month}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {prefillLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading existing check…
              </div>
            ) : null}
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Latest violation report date</div>
              <Input type="date" value={form.latestReportDate} onChange={(e) => setForm((p) => ({ ...p, latestReportDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Type A violations</div>
                <div className="text-xs text-muted-foreground leading-snug">
                  Enter the total count. Use comments only to summarize serious items (e.g., wandered from facility, elder abuse).
                </div>
                <Input
                  type="number"
                  min={0}
                  value={String(form.typeAViolations)}
                  onChange={(e) => setForm((p) => ({ ...p, typeAViolations: Math.max(0, Number(e.target.value || 0)) }))}
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Type B violations</div>
                <div className="text-xs text-muted-foreground leading-snug">
                  Enter the total count. Only note serious violations in comments if they may relate to our member.
                </div>
                <Input
                  type="number"
                  min={0}
                  value={String(form.typeBViolations)}
                  onChange={(e) => setForm((p) => ({ ...p, typeBViolations: Math.max(0, Number(e.target.value || 0)) }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Serious violations / comments</div>
              <Textarea
                placeholder='Only summarize serious violations (ex: "wandered from facility", "elder abuse"). Do not flag unless you believe it pertains to our member.'
                value={form.seriousViolationComments}
                onChange={(e) => setForm((p) => ({ ...p, seriousViolationComments: e.target.value }))}
              />
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ccl-ack"
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(Boolean(v))}
                />
                <label htmlFor="ccl-ack" className="text-sm leading-snug">
                  I confirm I checked the Community Care Licensing site for this RCFE for{' '}
                  <span className="font-mono">{active?.month || ''}</span>. This acknowledgement is required even if Type
                  A and Type B violations are 0.
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={saving || prefillLoading || !form.latestReportDate || !acknowledged}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save & auto-submit'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

