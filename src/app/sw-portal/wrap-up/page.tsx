'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileSignature,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type ClaimDoc = {
  id: string;
  socialWorkerEmail?: string;
  status?: string;
  claimMonth?: string;
  claimDay?: string;
  rcfeId?: string;
  rcfeName?: string;
  totalAmount?: number;
  visitIds?: string[];
  signoffById?: Record<string, any>;
  hasFlaggedVisits?: boolean;
};

type MonthExportRow = {
  memberId: string;
  memberName: string;
  rcfeName: string;
  visitId: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const currentMonth = () => new Date().toISOString().slice(0, 7);

const claimAllVisitsSigned = (claim: ClaimDoc): boolean => {
  const visitIds = Array.isArray(claim.visitIds)
    ? claim.visitIds.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  if (visitIds.length === 0) return false;
  const signoffs = claim.signoffById && typeof claim.signoffById === 'object'
    ? Object.values(claim.signoffById)
    : [];
  const signedSet = new Set<string>();
  signoffs.forEach((s: any) => {
    (Array.isArray(s?.visitIds) ? s.visitIds : []).forEach((id: any) => {
      const t = String(id || '').trim();
      if (t) signedSet.add(t);
    });
  });
  return visitIds.every((id) => signedSet.has(id));
};

const money = (v: any) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '$0';
};

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBadge({ step, done }: { step: number; done: boolean }) {
  return done ? (
    <CheckCircle2 className="h-6 w-6 shrink-0 text-green-500" />
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
      {step}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WrapUpPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isSocialWorker, canSubmitClaims, isLoading: swLoading } = useSocialWorker();

  const swEmail = useMemo(
    () => String((user as any)?.email || '').trim().toLowerCase(),
    [user]
  );
  const month = useMemo(() => currentMonth(), []);

  // ── State ────────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [monthRows, setMonthRows] = useState<MonthExportRow[]>([]);
  const [claims, setClaims] = useState<ClaimDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!swEmail || !auth?.currentUser || !firestore) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();

      // Monthly visit statuses + Firestore claims in parallel
      const [statusRes, claimsSnap] = await Promise.all([
        fetch('/api/sw-visits/monthly-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ month, dedupeByMemberMonth: true }),
        }),
        getDocs(query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', swEmail))),
      ]);

      // Visit statuses
      if (statusRes.ok) {
        const d = await statusRes.json().catch(() => ({} as any));
        setMonthRows(Array.isArray(d?.rows) ? d.rows : []);
      }

      // Claims
      const nextClaims: ClaimDoc[] = claimsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const thisMonthClaims = nextClaims.filter(
        (c) => String(c.claimMonth || '').slice(0, 7) === month
      );
      setClaims(thisMonthClaims);

      setHasLoadedOnce(true);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load wrap-up data.';
      setError(msg);
      toast({ title: 'Load failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [auth, firestore, month, swEmail, toast]);

  useEffect(() => {
    if (swLoading || !isSocialWorker || hasLoadedOnce) return;
    void loadAll();
  }, [hasLoadedOnce, isSocialWorker, loadAll, swLoading]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const completedVisits = useMemo(() => monthRows.filter((r) => Boolean(r.visitId)).length, [monthRows]);
  const pendingVisits = useMemo(
    () => monthRows.filter((r) => Boolean(r.visitId) && !r.signedOff).length,
    [monthRows]
  );

  const draftClaims = useMemo(
    () => claims.filter((c) => String(c.status || 'draft').toLowerCase() === 'draft'),
    [claims]
  );

  const readyToSubmit = useMemo(() => draftClaims.filter(claimAllVisitsSigned), [draftClaims]);
  const notYetSigned = useMemo(
    () => draftClaims.filter((c) => !claimAllVisitsSigned(c)),
    [draftClaims]
  );

  const allSignedOff = notYetSigned.length === 0;
  const canSubmit = Boolean(canSubmitClaims) && readyToSubmit.length > 0;

  // ── Submit claims ─────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!auth?.currentUser || !canSubmit) return;
    setSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const results = await Promise.allSettled(
        readyToSubmit.map((claim) =>
          fetch('/api/sw-visits/rcfe-signoff-submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ claimId: claim.id }),
          })
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      toast({
        title: succeeded > 0 ? 'Claims submitted' : 'Submission failed',
        description:
          failed > 0
            ? `${succeeded} submitted, ${failed} failed. Retry failed ones from Claims.`
            : `${succeeded} claim(s) submitted successfully.`,
        variant: failed > 0 && succeeded === 0 ? 'destructive' : 'default',
      });
      if (succeeded > 0) await loadAll();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Submission failed.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [auth, canSubmit, loadAll, readyToSubmit, toast]);

  // ── Auth guard ────────────────────────────────────────────────────────────────

  if (swLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const submittedClaims = claims.filter((c) =>
    ['submitted', 'approved', 'paid'].includes(String(c.status || '').toLowerCase())
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Wrap Up Day</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Review, sign off, and submit your claims for {month}.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadAll} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !hasLoadedOnce && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {hasLoadedOnce && (
        <>
          {/* ── Step 1: Visit summary ── */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <StepBadge step={1} done={pendingVisits === 0 && completedVisits > 0} />
              <div className="flex-1">
                <h2 className="font-semibold">Review today's visits</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {completedVisits} visit{completedVisits !== 1 ? 's' : ''} recorded this month
                  {pendingVisits > 0 ? `, ${pendingVisits} still need sign-off.` : '.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingVisits > 0 && (
                    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
                      <Circle className="h-3 w-3" />
                      {pendingVisits} awaiting sign-off
                    </Badge>
                  )}
                  {completedVisits - pendingVisits > 0 && (
                    <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50">
                      <CheckCircle2 className="h-3 w-3" />
                      {completedVisits - pendingVisits} signed off
                    </Badge>
                  )}
                </div>
                {pendingVisits > 0 && (
                  <Button asChild variant="link" size="sm" className="mt-2 h-auto p-0 text-xs">
                    <Link href="/sw-portal/sign-off">
                      Go to Sign-Off <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* ── Step 2: Submit claims ── */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <StepBadge step={2} done={submittedClaims.length > 0 && draftClaims.length === 0} />
              <div className="flex-1">
                <h2 className="font-semibold">Submit claims</h2>

                {draftClaims.length === 0 && submittedClaims.length === 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">No draft claims found for {month}.</p>
                )}

                {submittedClaims.length > 0 && (
                  <p className="mt-1 text-sm text-green-700">
                    <CheckCircle2 className="mr-1 inline h-4 w-4" />
                    {submittedClaims.length} claim(s) already submitted this month.
                  </p>
                )}

                {draftClaims.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {readyToSubmit.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-sm font-medium">
                          Ready to submit ({readyToSubmit.length}):
                        </p>
                        {readyToSubmit.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                            <span className="truncate">{c.rcfeName || c.rcfeId || 'RCFE'}</span>
                            <span className="text-muted-foreground">{money(c.totalAmount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {notYetSigned.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                          Still needs sign-off ({notYetSigned.length}):
                        </p>
                        {notYetSigned.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Circle className="h-4 w-4 shrink-0" />
                            <span className="truncate">{c.rcfeName || c.rcfeId || 'RCFE'}</span>
                          </div>
                        ))}
                        <Button asChild variant="link" size="sm" className="mt-1.5 h-auto p-0 text-xs">
                          <Link href="/sw-portal/sign-off">
                            Go to Sign-Off <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {!canSubmitClaims && (
                  <Alert className="mt-3" variant="destructive">
                    <AlertDescription className="text-sm">
                      Your account does not have permission to submit claims. Contact your administrator.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Submit button */}
                {readyToSubmit.length > 0 && (
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                    className="mt-4 w-full gap-2 sm:w-auto"
                    size="lg"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {submitting ? 'Submitting…' : `Submit ${readyToSubmit.length} Claim(s)`}
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* ── Quick links ── */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <Link href="/sw-portal/home">
                <ClipboardList className="h-3.5 w-3.5" /> Back to Today's List
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <Link href="/sw-portal/claims">
                <FileSignature className="h-3.5 w-3.5" /> All Claims
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <Link href="/sw-portal/history">
                View History
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
