'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, PenTool, CheckCircle2, ShieldAlert } from 'lucide-react';

type LookupData = {
  success: boolean;
  error?: string;
  requestId?: string;
  status?: string;
  signerRole?: 'memberRep' | 'rcfe' | '';
  memberName?: string;
  mrn?: string | null;
  rcfeName?: string;
  mcoAndTier?: string;
  tierLevel?: string;
  assistedLivingDailyRate?: string;
  assistedLivingMonthlyRate?: string;
  agreedRoomBoardAmount?: string;
  signer?: {
    email?: string;
    name?: string;
    signedAtMs?: number | null;
    relationship?: string;
    phone?: string;
    title?: string;
    address?: string;
  };
  allSigners?: {
    memberRep?: { signedAtMs?: number | null };
    rcfe?: { signedAtMs?: number | null };
  };
};

function fmtDate(ms?: number | null) {
  if (!ms) return 'pending';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'signed';
  }
}

export function RoomBoardAgreementSignatureClient({ token }: { token: string }) {
  const { toast } = useToast();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<LookupData | null>(null);
  const [signedName, setSignedName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [rcfeName, setRcfeName] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  const canSign = useMemo(() => {
    if (!data?.signerRole) return false;
    return !data?.signer?.signedAtMs;
  }, [data]);

  const signerRoleLabel = data?.signerRole === 'rcfe' ? 'RCFE Signer' : 'Member/Authorized Representative';

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setHasInk(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      window.removeEventListener('resize', onResize);
      return;
    }

    const point = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      if (!canSign) return;
      drawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const p = point(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!hasInkRef.current) {
        hasInkRef.current = true;
        setHasInk(true);
      }
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      drawingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.preventDefault();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [canSign]);

  const load = async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/room-board-agreement/signatures/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, token }),
      });
      const json = (await res.json().catch(() => ({}))) as LookupData;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Lookup failed (${res.status})`);
      setData(json);
      const defaultName = String(auth.currentUser.displayName || auth.currentUser.email || '').trim();
      setSignedName((prev) => prev || json?.signer?.name || defaultName);
      setRelationship(json?.signer?.relationship || '');
      setPhone(json?.signer?.phone || '');
      setTitle(json?.signer?.title || '');
      setAddress(json?.signer?.address || '');
      setRcfeName(json?.rcfeName || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load agreement.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoading, user?.uid]);

  const submit = async () => {
    if (!auth?.currentUser) return;
    if (!canSign) return;
    if (!signedName.trim()) {
      toast({ title: 'Enter your name', description: 'Printed name is required.', variant: 'destructive' });
      return;
    }
    if (!consent) {
      toast({ title: 'Consent required', description: 'Please check the attestation box.', variant: 'destructive' });
      return;
    }
    if (!hasInkRef.current) {
      toast({ title: 'Signature required', description: 'Please sign in the box.', variant: 'destructive' });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/room-board-agreement/signatures/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          token,
          signedName: signedName.trim(),
          signaturePngDataUrl: canvas.toDataURL('image/png'),
          consent: true,
          relationship: data?.signerRole === 'memberRep' ? relationship : undefined,
          phone: phone || undefined,
          title: data?.signerRole === 'rcfe' ? title : undefined,
          address: data?.signerRole === 'rcfe' ? address : undefined,
          rcfeName: data?.signerRole === 'rcfe' ? rcfeName : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Sign failed (${res.status})`);
      toast({ title: 'Signature recorded', description: 'Thank you. Your portion is complete.' });
      clearCanvas();
      setConsent(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not sign', description: e?.message || 'Signing failed.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Sign in required
            </CardTitle>
            <CardDescription>Please sign in using the invited email, then open the signature link again.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5" />
                Room and Board/Tier Level Agreement
              </CardTitle>
              <CardDescription>Secure signature capture for your assigned portion.</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
          {data ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Member</div><div className="font-semibold">{data.memberName || '—'}</div></div>
                <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">MRN</div><div className="font-mono">{data.mrn || '—'}</div></div>
                <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">RCFE</div><div className="font-medium">{data.rcfeName || '—'}</div></div>
                <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">MCO and Tier</div><div className="font-medium">{data.mcoAndTier || '—'}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">You are signing as: {signerRoleLabel}</Badge>
                <Badge variant="secondary">Member/Rep: {fmtDate(data.allSigners?.memberRep?.signedAtMs)}</Badge>
                <Badge variant="secondary">RCFE: {fmtDate(data.allSigners?.rcfe?.signedAtMs)}</Badge>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your portion</CardTitle>
          <CardDescription>{canSign ? 'Complete your fields and sign below.' : 'This signature has already been completed.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="signed-name">Printed name</Label>
            <Input id="signed-name" value={signedName} onChange={(e) => setSignedName(e.target.value)} disabled={!canSign || submitting} />
          </div>

          {data?.signerRole === 'memberRep' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="relationship">Relationship to member</Label>
                <Input id="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} disabled={!canSign || submitting} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canSign || submitting} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="rcfe-name">RCFE Name</Label>
                <Input id="rcfe-name" value={rcfeName} onChange={(e) => setRcfeName(e.target.value)} disabled={!canSign || submitting} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canSign || submitting} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canSign || submitting} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canSign || submitting} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Signature (draw)</Label>
              <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!canSign || submitting}>Clear</Button>
            </div>
            <div className={`rounded-md border bg-white ${!canSign ? 'opacity-60' : ''}`}>
              <canvas ref={canvasRef} className="h-[160px] w-full touch-none" />
            </div>
            <div className="text-xs text-muted-foreground">{hasInk ? 'Signature captured.' : 'Draw inside the box.'}</div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} disabled={!canSign || submitting} />
            <Label htmlFor="consent" className="text-sm leading-relaxed">
              I attest this is my legal electronic signature for this Room and Board/Tier Level Agreement.
            </Label>
          </div>

          <Button onClick={() => void submit()} disabled={!canSign || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Sign now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
