'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, MapPin, RefreshCw, Send } from 'lucide-react';

type RcfeOption = {
  id: string;
  name: string;
  address?: string;
  city?: string | null;
  zip?: string | null;
  members?: any[];
};

type CandidateVisit = {
  visitId: string;
  memberId?: string;
  memberName: string;
  memberRoomNumber?: string;
  flagged?: boolean;
};

const todayKeyUtc = () => new Date().toISOString().slice(0, 10);

export default function SWSignOffPage() {
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { toast } = useToast();
  const { user, socialWorkerData, isSocialWorker, isLoading: swLoading } = useSocialWorker();

  const [rcfes, setRcfes] = useState<RcfeOption[]>([]);
  const [loadingRcfes, setLoadingRcfes] = useState(false);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rcfeId, setRcfeId] = useState<string>(() => String(searchParams?.get('rcfeId') || '').trim());
  const [claimDay, setClaimDay] = useState<string>(() => {
    const fromQs = String(searchParams?.get('claimDay') || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(fromQs) ? fromQs : todayKeyUtc();
  });

  const [visits, setVisits] = useState<CandidateVisit[]>([]);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Record<string, boolean>>({});

  const [staffName, setStaffName] = useState('');
  const [staffTitle, setStaffTitle] = useState('');
  const [signature, setSignature] = useState('');
  const [signedAt, setSignedAt] = useState<string>(() => new Date().toISOString());
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const swUid = String((user as any)?.uid || '').trim();
  const swName = String((socialWorkerData as any)?.displayName || (user as any)?.displayName || swEmail || 'Social Worker').trim();

  const selectedVisits = useMemo(() => visits.filter((v) => selectedVisitIds[String(v.visitId || '').trim()]), [selectedVisitIds, visits]);
  const anyFlaggedSelected = useMemo(() => selectedVisits.some((v) => Boolean(v.flagged)), [selectedVisits]);

  const invoiceTotals = useMemo(() => {
    const visitFeeRate = 45;
    const gasAmount = 20;
    const count = selectedVisits.length;
    const visitTotal = count * visitFeeRate;
    const gas = count > 0 ? gasAmount : 0;
    return { count, visitFeeRate, gasAmount, visitTotal, gas, total: visitTotal + gas };
  }, [selectedVisits.length]);

  const loadRcfes = useCallback(async () => {
    if (!swEmail) return;
    setLoadingRcfes(true);
    setError(null);
    try {
      const res = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(swEmail)}`);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load RCFEs (HTTP ${res.status})`);
      const list: RcfeOption[] = Array.isArray(data?.rcfeList) ? data.rcfeList : [];
      setRcfes(list);
      if (!rcfeId && list.length === 1) setRcfeId(String(list[0].id || '').trim());
    } catch (e: any) {
      setError(e?.message || 'Failed to load RCFEs.');
    } finally {
      setLoadingRcfes(false);
    }
  }, [rcfeId, swEmail]);

  const loadCandidates = useCallback(async () => {
    if (!auth?.currentUser) return;
    if (!rcfeId) return;
    if (!claimDay) return;
    setLoadingVisits(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(
        `/api/sw-visits/draft-candidates?rcfeId=${encodeURIComponent(rcfeId)}&claimDay=${encodeURIComponent(claimDay)}`,
        { headers: { authorization: `Bearer ${idToken}` } }
      );
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load candidates (HTTP ${res.status})`);
      const next: CandidateVisit[] = Array.isArray(data?.visits) ? data.visits : [];
      setVisits(next);
      const nextSelected: Record<string, boolean> = {};
      next.forEach((v) => {
        const id = String(v?.visitId || '').trim();
        if (id) nextSelected[id] = true;
      });
      setSelectedVisitIds(nextSelected);
    } catch (e: any) {
      setError(e?.message || 'Failed to load sign-off candidates.');
      setVisits([]);
      setSelectedVisitIds({});
    } finally {
      setLoadingVisits(false);
    }
  }, [auth?.currentUser, auth, claimDay, rcfeId]);

  useEffect(() => {
    if (swLoading) return;
    if (!isSocialWorker) return;
    void loadRcfes();
  }, [isSocialWorker, loadRcfes, swLoading]);

  useEffect(() => {
    if (swLoading) return;
    if (!isSocialWorker) return;
    if (!rcfeId) return;
    void loadCandidates();
  }, [claimDay, isSocialWorker, loadCandidates, rcfeId, swLoading]);

  const selectedRcfe = useMemo(() => rcfes.find((r) => String(r.id || '').trim() === rcfeId) || null, [rcfeId, rcfes]);

  const verifyLocation = async () => {
    if (!navigator?.geolocation) {
      toast({ title: 'Location not available', description: 'This device does not support location services.' });
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000 });
      });
      setGeolocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
      });
      toast({ title: 'Location captured', description: 'Location will be attached to the sign-off.' });
    } catch {
      toast({ title: 'Location not captured', description: 'You can still sign off without location verification.' });
    }
  };

  const canSubmit = selectedVisits.length > 0 && staffName.trim() && signature.trim() && !submitting;

  const submitSignOff = async () => {
    if (!auth?.currentUser) {
      toast({ title: 'Please sign in again', description: 'No active session found.', variant: 'destructive' });
      return;
    }
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const payload = {
        rcfeId,
        claimDay,
        selectedVisitIds: selectedVisits.map((v) => String(v.visitId || '').trim()).filter(Boolean),
        staffName: staffName.trim(),
        staffTitle: staffTitle.trim(),
        signature: signature.trim(),
        signedAt,
        geolocation,
        socialWorkerName: swName,
      };

      const res = await fetch('/api/sw-visits/rcfe-signoff-submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to submit (HTTP ${res.status})`);

      toast({
        title: 'Submitted',
        description: `Submitted ${selectedVisits.length} questionnaire(s) and the claim.`,
      });

      setStaffName('');
      setStaffTitle('');
      setSignature('');
      setSignedAt(new Date().toISOString());
      setGeolocation(null);
      await loadCandidates();
    } catch (e: any) {
      setError(e?.message || 'Failed to submit.');
      toast({ title: 'Submission failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
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
            <CardTitle>Sign Off</CardTitle>
            <CardDescription>Please sign in as a Social Worker to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sign Off</h1>
          <p className="text-muted-foreground">
            RCFE staff acknowledges the Social Worker is present at the facility. This does not confirm each member was visited.
          </p>
        </div>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => void loadCandidates()} disabled={loadingVisits || !rcfeId}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select RCFE and date</CardTitle>
          <CardDescription>Choose the home, then sign off the member(s) visited that day.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rcfe">RCFE</Label>
            <select
              id="rcfe"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={rcfeId}
              onChange={(e) => setRcfeId(String(e.target.value || '').trim())}
              disabled={loadingRcfes}
            >
              <option value="">Select an RCFE…</option>
              {rcfes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {selectedRcfe?.address ? (
              <div className="text-xs text-muted-foreground">
                {selectedRcfe.address}
                {selectedRcfe.city ? `, ${selectedRcfe.city}` : ''}
                {selectedRcfe.zip ? ` ${selectedRcfe.zip}` : ''}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="day">Date</Label>
            <Input id="day" type="date" value={claimDay} onChange={(e) => setClaimDay(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members listed (today)</CardTitle>
          <CardDescription>
            Optional: staff can check members listed for the day. This is for reference only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingVisits ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : visits.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved drafts found for this RCFE on {claimDay}.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Selected: <span className="font-semibold text-foreground">{selectedVisits.length}</span> / {visits.length}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSelected = selectedVisits.length === visits.length;
                    if (allSelected) {
                      setSelectedVisitIds({});
                      return;
                    }
                    const next: Record<string, boolean> = {};
                    visits.forEach((v) => {
                      const id = String(v.visitId || '').trim();
                      if (id) next[id] = true;
                    });
                    setSelectedVisitIds(next);
                  }}
                >
                  {selectedVisits.length === visits.length ? 'Clear all' : 'Select all'}
                </Button>
              </div>

              <div className="rounded-lg border">
                {visits.map((v) => {
                  const id = String(v.visitId || '').trim();
                  const checked = Boolean(selectedVisitIds[id]);
                  return (
                    <label
                      key={id}
                      className="flex items-start gap-3 border-b px-3 py-3 last:border-b-0"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => setSelectedVisitIds((prev) => ({ ...prev, [id]: Boolean(next) }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{v.memberName || 'Member'}</div>
                          {v.memberRoomNumber ? (
                            <Badge variant="secondary">Room {String(v.memberRoomNumber).trim()}</Badge>
                          ) : null}
                          {v.flagged ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              flagged
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">Draft saved</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">RCFE staff signature</CardTitle>
          <CardDescription>
            Staff acknowledges the Social Worker is present at this facility on this date. This does not confirm individual member visits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-900">
            <span className="font-medium">Attestation:</span> I acknowledge that {swName} is present at this facility today.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staffName">Staff name</Label>
              <Input id="staffName" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffTitle">Staff title (optional)</Label>
              <Input id="staffTitle" value={staffTitle} onChange={(e) => setStaffTitle(e.target.value)} placeholder="Role / title" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="signature">Signature (type full name)</Label>
              <Input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Type full name as signature" />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {geolocation ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    Location captured
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Geo-stamp: Lat {geolocation.latitude.toFixed(5)} • Lng {geolocation.longitude.toFixed(5)}
                    {typeof geolocation.accuracy === 'number' ? ` • ±${Math.round(geolocation.accuracy)}m` : ''}
                  </div>
                </div>
              ) : (
                'Location not captured (optional)'
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={verifyLocation}>
                <MapPin className="h-4 w-4 mr-2" />
                Verify location (optional)
              </Button>
              <Button className="w-full sm:w-auto" type="button" onClick={() => void setSignedAt(new Date().toISOString())} variant="outline">
                Set time to now
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="font-semibold">Invoice preview</div>
            <div className="mt-1 text-muted-foreground">
              {invoiceTotals.count} × ${invoiceTotals.visitFeeRate} + ${invoiceTotals.gas} gas = <span className="font-semibold text-foreground">${invoiceTotals.total}</span>
              {anyFlaggedSelected ? ' (includes flagged member(s))' : ''}
            </div>
          </div>

          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={() => void submitSignOff()}>
            <Send className="h-4 w-4 mr-2" />
            {submitting ? 'Submitting…' : `Submit questionnaires & claim (${selectedVisits.length})`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
