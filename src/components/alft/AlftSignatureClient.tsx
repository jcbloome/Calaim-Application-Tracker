'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, Download, PenTool, ShieldAlert } from 'lucide-react';

type LookupResponse = {
  success: boolean;
  error?: string;
  requestId?: string;
  intakeId?: string;
  memberName?: string;
  mrn?: string | null;
  reviewedAtMs?: number | null;
  status?: string;
  signerRole?: 'rn' | 'msw' | '';
  rn?: { name?: string; email?: string | null; signedAtMs?: number | null };
  msw?: { name?: string; email?: string | null; signedAtMs?: number | null };
  outputs?: { signaturePageReady?: boolean; packetReady?: boolean };
};

function fmtDate(ms?: number | null) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

function openBlobDownload(bytes: Blob, filename: string) {
  const url = URL.createObjectURL(bytes);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AlftSignatureClient({ token }: { token: string }) {
  const { toast } = useToast();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string>('');

  const [signedName, setSignedName] = useState('');
  const [consent, setConsent] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const canSign = useMemo(() => {
    const role = data?.signerRole;
    if (!role) return false;
    if (role === 'rn') return !data?.rn?.signedAtMs;
    if (role === 'msw') {
      if (!data?.rn?.signedAtMs) return false; // enforce RN first
      return !data?.msw?.signedAtMs;
    }
    return false;
  }, [data]);

  const signerLabel = data?.signerRole === 'rn' ? 'RN' : data?.signerRole === 'msw' ? 'MSW' : 'Signer';

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

  const pointFromEvent = (e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const setupCanvasEvents = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const onDown = (e: PointerEvent) => {
      if (!canSign) return;
      drawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      const p = pointFromEvent(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const p = pointFromEvent(e);
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
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  };

  const load = async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/signatures/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, token }),
      });
      const json = (await res.json().catch(() => ({}))) as LookupResponse;
      if (!res.ok || !json?.success) throw new Error(String(json?.error || `Lookup failed (HTTP ${res.status})`));
      setData(json);
      const defaultName = String(auth.currentUser.displayName || auth.currentUser.email || '').trim();
      setSignedName((prev) => (prev ? prev : defaultName));
    } catch (e: any) {
      setError(e?.message || 'Failed to load signature request.');
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

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    const cleanup = setupCanvasEvents();
    return () => {
      window.removeEventListener('resize', onResize);
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSign]);

  const submit = async () => {
    if (!auth?.currentUser) return;
    if (!canSign) return;
    const name = signedName.trim();
    if (!name) {
      toast({ title: 'Enter your name', description: 'Please type your name exactly as you want it recorded.', variant: 'destructive' });
      return;
    }
    if (!consent) {
      toast({ title: 'Consent required', description: 'Please check the attestation box to sign.', variant: 'destructive' });
      return;
    }
    if (!hasInkRef.current) {
      toast({ title: 'Signature required', description: 'Please sign in the signature box.', variant: 'destructive' });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const sigUrl = canvas.toDataURL('image/png');

    setSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/signatures/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          token,
          signedName: name,
          signaturePngDataUrl: sigUrl,
          consent: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.success) throw new Error(String(json?.error || `Sign failed (HTTP ${res.status})`));
      toast({ title: 'Signed', description: 'Your signature was recorded successfully.' });
      clearCanvas();
      setConsent(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not sign', description: e?.message || 'Signing failed.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const download = async (kind: 'signature' | 'packet') => {
    if (!auth?.currentUser) return;
    if (!data?.requestId) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/alft/signatures/download?requestId=${encodeURIComponent(data.requestId)}&kind=${encodeURIComponent(kind)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        throw new Error(String(json?.error || `Download failed (HTTP ${res.status})`));
      }
      const blob = await res.blob();
      const safe = String(data?.memberName || 'Member').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_');
      openBlobDownload(blob, `ALFT_${safe}_${kind === 'signature' ? 'signature_page' : 'packet'}.pdf`);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message || 'Could not download file.', variant: 'destructive' });
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
            <CardDescription>Please sign in, then re-open your signature link.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5" />
                ALFT Signature
              </CardTitle>
              <CardDescription>Secure signature capture with an audit trail.</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
          ) : null}
          {loading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading signature request…
            </div>
          ) : null}
          {data?.memberName ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Member</div>
                <div className="font-semibold">{data.memberName}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">MRN</div>
                <div className="font-mono">{data.mrn || '—'}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Reviewed</div>
                <div className="font-medium">{data.reviewedAtMs ? new Date(data.reviewedAtMs).toLocaleDateString() : '—'}</div>
              </div>
            </div>
          ) : null}

          {data ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">RN: {data.rn?.signedAtMs ? `signed ${fmtDate(data.rn.signedAtMs)}` : 'pending'}</Badge>
              <Badge variant="secondary">MSW: {data.msw?.signedAtMs ? `signed ${fmtDate(data.msw.signedAtMs)}` : 'pending'}</Badge>
              <Badge variant="outline">You are signing as: {signerLabel}</Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your signature</CardTitle>
          <CardDescription>
            {data?.signerRole === 'msw' && !data?.rn?.signedAtMs
              ? 'Waiting for RN signature first. You will be able to sign once the RN has signed.'
              : 'Draw your signature below, then confirm your name and submit.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="signed-name">Printed name</Label>
            <Input id="signed-name" value={signedName} onChange={(e) => setSignedName(e.target.value)} disabled={!canSign || submitting} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Signature (draw)</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!canSign || submitting}>
                  Clear
                </Button>
              </div>
            </div>
            <div className={`rounded-md border bg-white ${!canSign ? 'opacity-60' : ''}`}>
              <canvas ref={canvasRef} className="h-[160px] w-full touch-none" />
            </div>
            <div className="text-xs text-muted-foreground">{hasInk ? 'Signature captured.' : 'Draw inside the box.'}</div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} disabled={!canSign || submitting} />
            <Label htmlFor="consent" className="text-sm leading-relaxed">
              I attest that I am the intended signer ({signerLabel}) and that this signature is legally binding for internal workflow purposes.
            </Label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Button onClick={() => void submit()} disabled={!canSign || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Sign now
            </Button>

            <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
              <Button variant="outline" onClick={() => void download('signature')} disabled={!data?.outputs?.signaturePageReady}>
                <Download className="h-4 w-4 mr-2" /> Signature page PDF
              </Button>
              <Button variant="outline" onClick={() => void download('packet')} disabled={!data?.outputs?.packetReady}>
                <Download className="h-4 w-4 mr-2" /> Full packet PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

