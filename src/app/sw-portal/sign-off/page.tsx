'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

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
  const router = useRouter();
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

  const selectedRcfe = useMemo(() => rcfes.find((r) => String(r.id || '').trim() === rcfeId) || null, [rcfeId, rcfes]);

  const [visits, setVisits] = useState<CandidateVisit[]>([]);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Record<string, boolean>>({});

  const [attestRcfeStaffOnly, setAttestRcfeStaffOnly] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffTitle, setStaffTitle] = useState('');
  const [signature, setSignature] = useState('');
  const [signedAt, setSignedAt] = useState<string>(() => new Date().toISOString());
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [geoAddress, setGeoAddress] = useState<string>('');
  const [loadingGeoAddress, setLoadingGeoAddress] = useState(false);
  const [geoPermission, setGeoPermission] = useState<'unknown' | 'granted' | 'prompt' | 'denied'>('unknown');
  const [geoErrorMessage, setGeoErrorMessage] = useState<string>('');
  const [geoOverrideEnabled, setGeoOverrideEnabled] = useState(false);
  const [geoOverrideReason, setGeoOverrideReason] = useState('');

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const swUid = String((user as any)?.uid || '').trim();
  const swName = String((socialWorkerData as any)?.displayName || (user as any)?.displayName || swEmail || 'Social Worker').trim();

  const selectedVisits = useMemo(() => visits.filter((v) => selectedVisitIds[String(v.visitId || '').trim()]), [selectedVisitIds, visits]);
  // Kept as derived data placeholder for future UI (e.g. flagged warnings).

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
        `/api/sw-visits/draft-candidates?rcfeId=${encodeURIComponent(rcfeId)}&claimDay=${encodeURIComponent(
          claimDay
        )}&rcfeName=${encodeURIComponent(String(selectedRcfe?.name || ''))}`,
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
  }, [auth?.currentUser, auth, claimDay, rcfeId, selectedRcfe?.name]);

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

  const refreshGeoPermission = async () => {
    try {
      const anyNav: any = navigator as any;
      const perms = anyNav?.permissions;
      if (!perms?.query) {
        setGeoPermission('unknown');
        return;
      }
      const status = await perms.query({ name: 'geolocation' });
      const state = String(status?.state || '').toLowerCase();
      if (state === 'granted' || state === 'prompt' || state === 'denied') {
        setGeoPermission(state as any);
      } else {
        setGeoPermission('unknown');
      }
    } catch {
      setGeoPermission('unknown');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    void refreshGeoPermission();
  }, []);

  const verifyLocation = async () => {
    if (!navigator?.geolocation) {
      toast({ title: 'Location not available', description: 'This device does not support location services.' });
      return;
    }
    try {
      setGeoErrorMessage('');
      await refreshGeoPermission();
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000 });
      });
      setGeolocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
      });
      // If override was enabled due to permission/signal trouble, turn geo-tagging back on once we capture a valid location.
      setGeoOverrideEnabled(false);
      setGeoOverrideReason('');
      toast({ title: 'Location captured', description: 'Location will be attached to the sign-off.' });
    } catch (err: any) {
      const code = Number(err?.code || 0);
      const isDenied = code === 1;
      const isUnavailable = code === 2;
      const isTimeout = code === 3;
      const message = isDenied
        ? 'Location permission was blocked. Please tap “Verify location” and allow permission, or enable Location in your phone/browser settings.'
        : isUnavailable
          ? 'Location couldn’t be determined (signal unavailable). Step outside for better signal and tap “Verify location” again.'
          : isTimeout
            ? 'Location request timed out. Step outside for better signal and tap “Verify location” again.'
            : 'Please allow location permissions to submit sign-off.';
      setGeoErrorMessage(message);
      toast({
        title: 'Location required',
        description: message,
        variant: 'destructive',
      });
      await refreshGeoPermission();
    }
  };

  useEffect(() => {
    if (!geolocation) {
      setGeoAddress('');
      setLoadingGeoAddress(false);
      return;
    }

    const ctrl = new AbortController();
    setLoadingGeoAddress(true);
    void (async () => {
      try {
        const qs = new URLSearchParams({
          lat: String(geolocation.latitude),
          lng: String(geolocation.longitude),
        });
        const res = await fetch(`/api/geo/reverse?${qs.toString()}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({} as any));
        if (!ctrl.signal.aborted && res.ok && data?.success && String(data?.address || '').trim()) {
          setGeoAddress(String(data.address).trim());
        } else if (!ctrl.signal.aborted) {
          setGeoAddress('');
        }
      } catch {
        if (!ctrl.signal.aborted) setGeoAddress('');
      } finally {
        if (!ctrl.signal.aborted) setLoadingGeoAddress(false);
      }
    })();

    return () => ctrl.abort();
  }, [geolocation?.latitude, geolocation?.longitude]);

  const canSubmit =
    selectedVisits.length > 0 &&
    attestRcfeStaffOnly &&
    staffName.trim() &&
    staffTitle.trim() &&
    signature.trim() &&
    (Boolean(geolocation) || geoOverrideEnabled) &&
    !submitting;

  const submitSignOff = async () => {
    if (!auth?.currentUser) {
      toast({ title: 'Please sign in again', description: 'No active session found.', variant: 'destructive' });
      return;
    }
    if (!canSubmit) return;
    if (!geolocation) {
      if (!geoOverrideEnabled) {
        toast({
          title: 'Location required',
          description: 'Please verify location before submitting, or use the override (reason required).',
          variant: 'destructive',
        });
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const payload = {
        rcfeId,
        rcfeName: String(selectedRcfe?.name || '').trim(),
        claimDay,
        selectedVisitIds: selectedVisits.map((v) => String(v.visitId || '').trim()).filter(Boolean),
        attestRcfeStaffOnly,
        staffName: staffName.trim(),
        staffTitle: staffTitle.trim(),
        signature: signature.trim(),
        signedAt,
        geolocation,
        geolocationOverride: !geolocation ? Boolean(geoOverrideEnabled) : false,
        geolocationOverrideReason: !geolocation
          ? (geoOverrideReason.trim() || 'Geolocation unavailable at sign-off time; proceeding with override.')
          : '',
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
        description: `Submitted ${selectedVisits.length} questionnaire(s). Next: complete the monthly CCL check to auto-submit the claim(s).`,
      });

      setStaffName('');
      setStaffTitle('');
      setSignature('');
      setAttestRcfeStaffOnly(false);
      setSignedAt(new Date().toISOString());
      setGeolocation(null);
      setGeoOverrideEnabled(false);
      setGeoOverrideReason('');
      await loadCandidates();

      // After a successful submission, the next action is usually to select another RCFE/member.
      // Route to CCL Checks (desktop-friendly last step).
      setTimeout(() => {
        router.push('/sw-portal/ccl-checks');
      }, 400);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit.');
      toast({ title: 'Submission failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const submitOverrideRequest = async () => {
    if (!auth?.currentUser) {
      toast({ title: 'Please sign in again', description: 'No active session found.', variant: 'destructive' });
      return;
    }
    const reason = overrideReason.trim();
    if (!reason) return;
    if (!rcfeId || !claimDay) return;
    if (selectedVisits.length === 0) return;
    if (overrideSubmitting) return;

    setOverrideSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/sw-claims/override-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          rcfeId,
          rcfeName: String(selectedRcfe?.name || '').trim(),
          rcfeAddress: String(selectedRcfe?.address || '').trim(),
          claimDay,
          visitIds: selectedVisits.map((v) => String(v.visitId || '').trim()).filter(Boolean),
          reason,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (HTTP ${res.status})`);
      }
      toast({
        title: 'Override requested',
        description: 'Admin has been notified. You can continue with other visits while they review.',
      });
      setOverrideOpen(false);
      setOverrideReason('');
    } catch (e: any) {
      toast({
        title: 'Request failed',
        description: e?.message || 'Could not send override request.',
        variant: 'destructive',
      });
    } finally {
      setOverrideSubmitting(false);
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
            After submission, a monthly visit list is sent to admins for confirmation.
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
            RCFE staff acknowledges the Social Worker is present at this facility on this date. This does not confirm individual member visits.
            The signed-off monthly visit list is shared with admins for confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-900">
            <span className="font-medium">Attestation:</span> I acknowledge that {swName} is present at this facility today.
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <label className="flex items-start gap-3">
              <Checkbox checked={attestRcfeStaffOnly} onCheckedChange={(v) => setAttestRcfeStaffOnly(Boolean(v))} />
              <div className="min-w-0">
                <div className="font-medium">RCFE staff only</div>
                <div className="text-xs text-muted-foreground">
                  This sign-off must be completed by RCFE staff/authorized representative (not by members/residents).
                </div>
              </div>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staffName">Staff name</Label>
              <Input id="staffName" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffTitle">Staff title</Label>
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
                  <div className="text-xs text-muted-foreground break-words whitespace-normal">
                    {geoAddress ? (
                      <>Address: {geoAddress}</>
                    ) : loadingGeoAddress ? (
                      <>Looking up address…</>
                    ) : (
                      <>
                        Geo-stamp: Lat {geolocation.latitude.toFixed(5)} • Lng {geolocation.longitude.toFixed(5)}
                      </>
                    )}
                    {typeof geolocation.accuracy === 'number' ? ` • ±${Math.round(geolocation.accuracy)}m` : ''}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-destructive font-medium">Location required to submit</div>
                  <div className="text-xs text-muted-foreground leading-snug">
                    You must allow geolocation permission on your phone. When you tap <span className="font-semibold">Verify location</span>, your browser should prompt you.
                    {geoPermission !== 'unknown' ? (
                      <>
                        {' '}
                        Current permission: <span className="font-semibold">{geoPermission}</span>.
                      </>
                    ) : null}
                  </div>
                  {geoErrorMessage ? <div className="text-xs text-destructive">{geoErrorMessage}</div> : null}
                  {geoPermission === 'denied' ? (
                    <div className="text-xs text-muted-foreground">
                      If you previously blocked location, you may need to enable it in your phone/browser settings, then come back and tap Verify again.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={verifyLocation}>
                <MapPin className="h-4 w-4 mr-2" />
                {geolocation ? 'Re-check location' : 'Verify location (required)'}
              </Button>
              {!geolocation ? (
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  variant={geoOverrideEnabled ? 'secondary' : 'outline'}
                  onClick={() => {
                    const next = !geoOverrideEnabled;
                    setGeoOverrideEnabled(next);
                    if (!next) setGeoOverrideReason('');
                  }}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {geoOverrideEnabled ? 'Override enabled' : 'Override (no geo)'}
                </Button>
              ) : null}
              <Button className="w-full sm:w-auto" type="button" onClick={() => void setSignedAt(new Date().toISOString())} variant="outline">
                Set time to now
              </Button>
            </div>
          </div>

          {!geolocation && geoOverrideEnabled ? (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <div className="font-medium text-slate-900">Override enabled (submit without geo-stamp)</div>
                <div className="text-xs text-muted-foreground">
                  Use this only if location can’t be captured due to signal/permission issues. If you step outside and get better signal, tap <span className="font-semibold">Verify location</span> again—location tagging will automatically re-enable.
                  If you leave the reason blank, a default reason is auto-added so you can keep moving to the next RCFE.
                </div>
                <div className="space-y-1">
                  <Label htmlFor="geoOverrideReason">Reason (optional)</Label>
                  <Textarea
                    id="geoOverrideReason"
                    value={geoOverrideReason}
                    onChange={(e) => setGeoOverrideReason(e.target.value)}
                    placeholder="Example: Poor signal indoors; stepped outside but still no GPS fix; browser permission prompt not appearing."
                    rows={3}
                  />
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={() => void submitSignOff()}>
            <Send className="h-4 w-4 mr-2" />
            {submitting ? 'Submitting…' : `Submit questionnaires & claim (${selectedVisits.length})`}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base">Can’t get RCFE sign-off?</CardTitle>
          <CardDescription>
            If staff cannot sign today, you can request an admin override to submit the claim on the backend. A reason is required.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-slate-900">RCFE:</span> {String(selectedRcfe?.name || '—')}
            </div>
            <div>
              <span className="font-medium text-slate-900">Date:</span> {claimDay || '—'} •{' '}
              <span className="font-medium text-slate-900">Draft visits:</span> {selectedVisits.length}
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => setOverrideOpen(true)}
            disabled={!rcfeId || !claimDay || selectedVisits.length === 0}
          >
            Request admin override
          </Button>
        </CardContent>
      </Card>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request admin override</DialogTitle>
            <DialogDescription>
              This will send an override request to Admin with your reason, RCFE, and visit date. Admin will decide to approve or reject.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border bg-white p-3 text-sm">
              <div>
                <span className="font-medium">RCFE:</span> {String(selectedRcfe?.name || '—')}
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium text-slate-900">Date:</span> {claimDay} •{' '}
                <span className="font-medium text-slate-900">Draft visits:</span> {selectedVisits.length}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="overrideReason">Reason (required)</Label>
              <Textarea
                id="overrideReason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Example: Staff unavailable; facility refused to sign; member visits completed but no authorized representative onsite."
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOverrideOpen(false)} disabled={overrideSubmitting}>
                Cancel
              </Button>
              <Button onClick={() => void submitOverrideRequest()} disabled={overrideSubmitting || !overrideReason.trim()}>
                {overrideSubmitting ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
