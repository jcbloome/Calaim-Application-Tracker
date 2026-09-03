'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import { SwIspToolsLinksPanel } from '@/components/alft/SwIspToolsLinksPanel';
import { parseMedListAttachment, type AlftMedListAttachment } from '@/components/alft/AlftMedListUpload';
import {
  ALFT_TIER_OPTIONS,
  ALFT_TIER_RATE_WORDING,
  hasExtensiveTierJustification,
  isAlftTierOption,
} from '@/lib/alft-tier-recommendation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, Download, PenTool, ShieldAlert, BookUser, Save } from 'lucide-react';

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

const AGENCY_NAME = 'Connections Care Home Consultants';

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
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string>('');

  const [signedName, setSignedName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirmEdits, setConfirmEdits] = useState(false);
  const [rnRecommendedTier, setRnRecommendedTier] = useState('');
  const [rnTierJustification, setRnTierJustification] = useState('');

  const [formAnswers, setFormAnswers] = useState<Record<string, string | string[]>>(() => createInitialExactAlftAnswers());
  const [medListAttachment, setMedListAttachment] = useState<AlftMedListAttachment | null>(null);
  const [formMemberId, setFormMemberId] = useState('');
  const [formMeta, setFormMeta] = useState({
    transitionSummary: '',
    requestedActions: '',
    barriersAndRisks: '',
    additionalNotes: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formLoaded, setFormLoaded] = useState(false);
  const [formAutosaveAt, setFormAutosaveAt] = useState<string | null>(null);
  const formAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFormAutosaveRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const canSign = useMemo(() => {
    const role = data?.signerRole;
    if (!role) return false;
    if (role === 'msw') return !data?.msw?.signedAtMs;
    if (role === 'rn') {
      if (!data?.msw?.signedAtMs) return false;
      return !data?.rn?.signedAtMs;
    }
    return false;
  }, [data]);

  const canEditForm = Boolean(data?.intakeId) && data?.signerRole === 'rn' && !data?.rn?.signedAtMs;
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

  const setupCanvasEvents = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      if (!canSign) return;
      drawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current || !canSign) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInkRef.current = true;
      setHasInk(true);
    };
    const onUp = (e: PointerEvent) => {
      drawingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
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

  const loadSigningProfile = async (uid: string) => {
    if (!firestore || !uid) return;
    try {
      const snap = await getDoc(doc(firestore, 'users', uid));
      const profile = snap.exists() ? ((snap.data() as any)?.alftSigningProfile || {}) : {};
      const name = String(profile?.signedName || '').trim();
      const license = String(profile?.licenseNumber || '').trim();
      if (name) setSignedName(name);
      if (license) setLicenseNumber(license);
      if (name || license) setProfileSaved(true);
    } catch {
      // ignore
    }
  };

  const saveSigningProfile = async (uid: string, name: string, license: string) => {
    if (!firestore || !uid) return;
    try {
      await setDoc(
        doc(firestore, 'users', uid),
        {
          alftSigningProfile: {
            signedName: name,
            licenseNumber: license,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
    } catch {
      // ignore
    }
  };

  const loadForm = async (intakeId: string) => {
    if (!auth?.currentUser || !intakeId) return;
    setFormLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.success) throw new Error(String(json?.error || 'Could not load ALFT form'));
      const form = (json?.intake?.alftForm || {}) as any;
      const exact = (form?.exactPacketAnswers || {}) as Record<string, string | string[]>;
      setFormAnswers({ ...createInitialExactAlftAnswers(), ...exact, p1_agency: AGENCY_NAME });
      setMedListAttachment(parseMedListAttachment(form?.medListAttachment));
      setFormMemberId(String(json?.intake?.memberId || '').trim());
      const existingTier = (json?.intake as any)?.alftRnTierRecommendation;
      if (existingTier?.tier) setRnRecommendedTier(String(existingTier.tier || '').trim());
      if (existingTier?.justification) setRnTierJustification(String(existingTier.justification || '').trim());
      setFormMeta({
        transitionSummary: String(form?.transitionSummary || ''),
        requestedActions: String(form?.requestedActions || ''),
        barriersAndRisks: String(form?.barriersAndRisks || ''),
        additionalNotes: String(form?.additionalNotes || ''),
      });
      skipFormAutosaveRef.current = true;
      setFormAutosaveAt(null);
      setFormLoaded(true);
    } catch (e: any) {
      toast({
        title: 'Could not load ALFT form',
        description: e?.message || 'Form edit may be unavailable; you can still sign.',
        variant: 'destructive',
      });
      setFormLoaded(false);
    } finally {
      setFormLoading(false);
    }
  };

  const saveForm = async (opts?: { silent?: boolean }) => {
    if (!auth?.currentUser || !data?.intakeId || formSaving) return false;
    setFormSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const summary =
        String(formMeta.transitionSummary || '').trim() ||
        String((formAnswers as any)?.p13_commentary_section || '').trim() ||
        'ALFT form updated by RN before signature.';
      const actions =
        String(formMeta.requestedActions || '').trim() || 'RN reviewed and updated ALFT; signature follows.';
      const res = await fetch('/api/alft/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: data.intakeId,
          exactPacketAnswers: { ...formAnswers, p1_agency: AGENCY_NAME },
          transitionSummary: summary,
          requestedActions: actions,
          barriersAndRisks: String(formMeta.barriersAndRisks || '').trim() || null,
          additionalNotes: String(formMeta.additionalNotes || '').trim() || null,
          medListAttachment: medListAttachment || null,
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.success) throw new Error(String(json?.error || 'Save failed'));
      setFormAutosaveAt(new Date().toISOString());
      if (!opts?.silent) {
        toast({
          title: 'ALFT saved',
          description: 'Your edits were saved. You can sign below when ready.',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
      return true;
    } catch (e: any) {
      if (!opts?.silent) {
        toast({ title: 'Save failed', description: e?.message || 'Could not save ALFT edits.', variant: 'destructive' });
      }
      return false;
    } finally {
      setFormSaving(false);
    }
  };

  useEffect(() => {
    if (!canEditForm || !formLoaded || !data?.intakeId) return;
    if (skipFormAutosaveRef.current) {
      skipFormAutosaveRef.current = false;
      return;
    }
    if (formAutosaveTimerRef.current) clearTimeout(formAutosaveTimerRef.current);
    formAutosaveTimerRef.current = setTimeout(() => {
      void saveForm({ silent: true });
    }, 3500);
    return () => {
      if (formAutosaveTimerRef.current) clearTimeout(formAutosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditForm, formLoaded, data?.intakeId, formAnswers, medListAttachment, formMeta]);

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
      if (json.signerRole === 'rn' && json.intakeId) {
        void loadForm(String(json.intakeId));
      }
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
    void loadSigningProfile(user.uid);
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
    const license = licenseNumber.trim();
    if (!name) {
      toast({
        title: 'Enter your printed name',
        description: 'Please type your full name exactly as you want it recorded.',
        variant: 'destructive',
      });
      return;
    }
    if (!license) {
      toast({
        title: 'License number required',
        description: 'Please enter your professional license number.',
        variant: 'destructive',
      });
      return;
    }
    if (!consent) {
      toast({ title: 'Consent required', description: 'Please check the attestation box to sign.', variant: 'destructive' });
      return;
    }
    if (canEditForm && !confirmEdits) {
      toast({
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits” before signing and returning to the next step.',
        variant: 'destructive',
      });
      return;
    }
    if (canEditForm) {
      if (!isAlftTierOption(rnRecommendedTier)) {
        toast({
          title: 'Recommended tier required',
          description: 'Select the tier rate you recommend based on care needs before signing.',
          variant: 'destructive',
        });
        return;
      }
      if (!hasExtensiveTierJustification(rnTierJustification)) {
        toast({
          title: 'Tier justification required',
          description:
            'Explain the care needs that justify this tier using the tier-rate wording (supervision, ADLs, overnight needs, etc.).',
          variant: 'destructive',
        });
        return;
      }
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
      if (canEditForm && formLoaded) {
        const saved = await saveForm();
        if (!saved) return;
      }
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/signatures/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          token,
          signedName: name,
          licenseNumber: license,
          signaturePngDataUrl: sigUrl,
          consent: true,
          ...(canEditForm
            ? {
                rnTierRecommendation: {
                  tier: rnRecommendedTier,
                  justification: rnTierJustification.trim(),
                },
              }
            : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.success) throw new Error(String(json?.error || `Sign failed (HTTP ${res.status})`));
      if (auth.currentUser?.uid) {
        void saveSigningProfile(auth.currentUser.uid, name, license);
        setProfileSaved(true);
      }
      toast({
        title: 'Signed and returned to admin',
        description: canEditForm
          ? `Recommended Tier ${rnRecommendedTier} was sent with your signature for admin review.`
          : 'Your signature was recorded. Name and license number have been saved for next time.',
      });
      clearCanvas();
      setConsent(false);
      setConfirmEdits(false);
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
      const res = await fetch(
        `/api/alft/signatures/download?requestId=${encodeURIComponent(data.requestId)}&kind=${encodeURIComponent(kind)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        throw new Error(String(json?.error || `Download failed (HTTP ${res.status})`));
      }
      const blob = await res.blob();
      const safe = String(data?.memberName || 'Member')
        .replace(/[^\w.\- ]+/g, '_')
        .replace(/\s+/g, '_');
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
    <div className="max-w-5xl mx-auto space-y-4 p-3 sm:p-6 pb-28 sm:pb-6">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <PenTool className="h-5 w-5" />
                {data?.signerRole === 'rn' ? 'ALFT review & signature' : 'ALFT Signature'}
              </CardTitle>
              <CardDescription>
                {data?.signerRole === 'rn'
                  ? 'Review and edit the full ALFT below, then sign to return it for admin final check.'
                  : 'Secure signature capture with an audit trail.'}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
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
                <div className="font-medium">
                  {data.reviewedAtMs ? new Date(data.reviewedAtMs).toLocaleDateString() : '—'}
                </div>
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

      {canEditForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">View / edit ALFT</CardTitle>
            <CardDescription>
              Make any needed corrections, save, then sign below to send back for admin final check.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {formLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading ALFT form…
              </div>
            ) : formLoaded ? (
              <>
                <SwIspToolsLinksPanel
                  preferFirestore={false}
                  showManageLink={false}
                  title="SW portal tools & uploads"
                  description="Reference the same Tier Tool, ISP Description, and ALFT guidance files social workers use."
                />
                <SwStyleAlftEditor
                  answers={formAnswers}
                  onChange={(id, value) => setFormAnswers((prev) => ({ ...prev, [id]: value }))}
                  memberName={data?.memberName || ''}
                  memberMrn={data?.mrn || ''}
                  memberId={formMemberId || String(data?.intakeId || '').trim() || undefined}
                  medListAttachment={medListAttachment}
                  onMedListAttachmentChange={setMedListAttachment}
                />
                <div className="sticky bottom-0 z-20 flex gap-2 border-t bg-background/95 p-2 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                  <Button className="flex-1 sm:flex-none" onClick={() => void saveForm()} disabled={formSaving || submitting}>
                    {formSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save ALFT edits
                  </Button>
                  {formAutosaveAt ? (
                    <span className="text-xs text-muted-foreground self-center">
                      Autosaved{' '}
                      {new Date(formAutosaveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">ALFT form could not be loaded for editing.</div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your signature</CardTitle>
          <CardDescription>
            {data?.signerRole === 'rn' && !data?.msw?.signedAtMs
              ? 'Waiting for Social Worker signature first. You can sign after the SW signature is complete.'
              : data?.signerRole === 'rn'
                ? 'Recommend the tier below, then sign to return this ALFT to admin.'
                : 'Draw your signature below, then confirm your name and submit.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEditForm ? (
            <div className="rounded-md border border-violet-300 bg-violet-50/70 p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold text-violet-950">
                  Recommended tier level (required before submit)
                </div>
                <div className="text-xs text-violet-900/90 mt-0.5">
                  Select the tier you recommend and explain care needs. Admin will see this recommendation when you
                  return the ALFT.
                </div>
              </div>
              <div className="rounded-md border border-violet-200 bg-white p-3 text-xs text-violet-950 space-y-2">
                <div className="font-semibold">Tier-rate wording (use when justifying)</div>
                <ul className="list-disc space-y-1.5 pl-4">
                  {ALFT_TIER_RATE_WORDING.map((row) => (
                    <li key={row.tier}>
                      <span className="font-medium">{row.label}:</span> {row.wording}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rn-recommended-tier">
                  Recommended tier <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={rnRecommendedTier || undefined}
                  onValueChange={setRnRecommendedTier}
                  disabled={!canSign || submitting}
                >
                  <SelectTrigger id="rn-recommended-tier">
                    <SelectValue placeholder="Select Tier 1–5" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALFT_TIER_OPTIONS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        Tier {tier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rn-tier-justification">
                  Care-need justification for this tier <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="rn-tier-justification"
                  value={rnTierJustification}
                  onChange={(e) => setRnTierJustification(e.target.value)}
                  disabled={!canSign || submitting}
                  rows={5}
                  placeholder="Describe the care needs that justify this tier (ADLs, supervision, overnight staff, dementia/redirecting, safety risks, etc.). Align with the tier-rate wording above."
                  className="min-h-[120px]"
                />
                {!hasExtensiveTierJustification(rnTierJustification) ? (
                  <div className="text-xs text-amber-800">
                    Add enough care-need detail for admin to use this when submitting the tier-level request.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {profileSaved ? (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <BookUser className="h-4 w-4 shrink-0 text-green-600" />
              <span>
                Your name and license number were remembered from your last signing. Just draw your signature below.
              </span>
              <button
                className="ml-auto shrink-0 text-xs underline text-green-700 hover:text-green-900"
                onClick={() => setProfileSaved(false)}
                type="button"
              >
                Edit
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="signed-name">
                Printed full name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="signed-name"
                value={signedName}
                onChange={(e) => {
                  setSignedName(e.target.value);
                  setProfileSaved(false);
                }}
                placeholder="Full legal name"
                disabled={!canSign || submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="license-number">
                License number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="license-number"
                value={licenseNumber}
                onChange={(e) => {
                  setLicenseNumber(e.target.value);
                  setProfileSaved(false);
                }}
                placeholder={data?.signerRole === 'rn' ? 'e.g. RN-123456' : 'e.g. MSW-789012'}
                disabled={!canSign || submitting}
              />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Date of submission: </span>
            <span className="font-medium">
              {new Date().toLocaleString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            <span className="text-xs text-muted-foreground ml-2">(auto-recorded at time of signing)</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Signature (draw)</Label>
              <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!canSign || submitting}>
                Clear
              </Button>
            </div>
            <div className={`rounded-md border bg-white ${!canSign ? 'opacity-60' : ''}`}>
              <canvas ref={canvasRef} className="h-[160px] w-full touch-none" />
            </div>
            <div className="text-xs text-muted-foreground">{hasInk ? 'Signature captured.' : 'Draw inside the box.'}</div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(Boolean(v))}
              disabled={!canSign || submitting}
            />
            <Label htmlFor="consent" className="text-sm leading-relaxed">
              I attest that I am the intended signer ({signerLabel}) and that this signature is legally binding for
              internal workflow purposes.
            </Label>
          </div>

          {canEditForm ? (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
              <Checkbox
                id="rn-sign-confirm-edits"
                checked={confirmEdits}
                onCheckedChange={(v) => setConfirmEdits(Boolean(v))}
                disabled={!canSign || submitting}
              />
              <Label htmlFor="rn-sign-confirm-edits" className="text-sm leading-relaxed">
                I confirm these edits are complete and accurate before signing and returning to admin with my
                recommended tier.
              </Label>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Button
              className="w-full sm:w-auto"
              onClick={() => void submit()}
              disabled={
                !canSign ||
                submitting ||
                (canEditForm && !confirmEdits) ||
                (canEditForm && !isAlftTierOption(rnRecommendedTier)) ||
                (canEditForm && !hasExtensiveTierJustification(rnTierJustification)) ||
                !consent
              }
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              {data?.signerRole === 'rn' ? 'Sign & return to admin' : 'Sign now'}
            </Button>

            <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
              <Button
                variant="outline"
                onClick={() => void download('signature')}
                disabled={!data?.outputs?.signaturePageReady}
              >
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
