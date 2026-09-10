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
  ALFT_TIER_REVIEW_WORKFLOW_SUMMARY,
  getAlftTierDefinition,
  isAlftTierOption,
  type AlftInternalTierRecommendation,
} from '@/lib/alft-tier-recommendation';
import { TierLevelDefinitionsLink } from '@/components/alft/TierLevelDefinitionsLink';
import { AlftSelectedTierDefinitionPanel } from '@/components/alft/AlftSelectedTierDefinitionPanel';
import { stripAlftCommentaryMarkup } from '@/lib/alft-commentary-format';
import { normalizeAlftAnswersCapitalization } from '@/lib/alft-proper-case';
import { applyAlftCognitiveFollowupGate } from '@/lib/alft-form-rules';
import { createTypedSignaturePngDataUrl } from '@/lib/typed-signature-png';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, Download, PenTool, ShieldAlert, BookUser, Save } from 'lucide-react';
import {
  DEFAULT_ALFT_RN_LICENSE_NUMBER,
  isDefaultAlftRnName,
  resolveAlftRnLicenseNumber,
} from '@/lib/alft-rn-defaults';

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
  const [swTierRecommendation, setSwTierRecommendation] = useState<AlftInternalTierRecommendation | null>(null);

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

  useEffect(() => {
    if (data?.signerRole !== 'rn') return;
    if (!isDefaultAlftRnName(signedName)) return;
    if (licenseNumber.trim() === DEFAULT_ALFT_RN_LICENSE_NUMBER) return;
    setLicenseNumber(DEFAULT_ALFT_RN_LICENSE_NUMBER);
  }, [data?.signerRole, signedName, licenseNumber]);

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
  const needsRnTier = data?.signerRole === 'rn' && !data?.rn?.signedAtMs;
  const signerLabel = data?.signerRole === 'rn' ? 'RN' : data?.signerRole === 'msw' ? 'MSW' : 'Signer';
  const submitActionLabel =
    data?.signerRole === 'rn'
      ? needsRnTier
        ? 'Submit with suggested tier & return to admin'
        : 'Sign & return to admin'
      : 'Sign now';
  const signatureSubmitGaps = useMemo(() => {
    const gaps: string[] = [];
    if (!canSign) {
      if (data?.signerRole === 'rn' && !data?.msw?.signedAtMs) {
        gaps.push('waiting for Social Worker signature first');
      } else if (data?.signerRole === 'rn' && data?.rn?.signedAtMs) {
        gaps.push('already signed — nothing left to submit');
      } else if (data?.signerRole === 'msw' && data?.msw?.signedAtMs) {
        gaps.push('already signed — nothing left to submit');
      } else {
        gaps.push('signature not available yet for this link');
      }
      return gaps;
    }
    if (canEditForm && !confirmEdits) gaps.push('confirm edits checkbox');
    if (needsRnTier && !isAlftTierOption(rnRecommendedTier)) gaps.push('suggested tier (1–5)');
    if (!signedName.trim()) gaps.push('printed full name (electronic signature)');
    if (!licenseNumber.trim()) gaps.push('license number');
    if (!consent) gaps.push('signature attestation checkbox');
    return gaps;
  }, [
    canEditForm,
    canSign,
    confirmEdits,
    consent,
    data?.msw?.signedAtMs,
    data?.rn?.signedAtMs,
    data?.signerRole,
    licenseNumber,
    needsRnTier,
    rnRecommendedTier,
    signedName,
  ]);

  const loadSigningProfile = async (uid: string) => {
    if (!firestore || !uid) return;
    try {
      const snap = await getDoc(doc(firestore, 'users', uid));
      const profile = snap.exists() ? ((snap.data() as any)?.alftSigningProfile || {}) : {};
      const name = String(profile?.signedName || '').trim();
      const license = resolveAlftRnLicenseNumber(name, profile?.licenseNumber);
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
      setFormAnswers(
        applyAlftCognitiveFollowupGate(
          normalizeAlftAnswersCapitalization({
            ...createInitialExactAlftAnswers(),
            ...exact,
            p1_agency: AGENCY_NAME,
          })
        ) as Record<string, string | string[]>
      );
      setMedListAttachment(parseMedListAttachment(form?.medListAttachment));
      setFormMemberId(String(json?.intake?.memberId || '').trim());
      const existingTier = (json?.intake as any)?.alftRnTierRecommendation;
      const existingRnTier = String(existingTier?.tier || '').trim();
      const rawSwTier = (json?.intake as any)?.alftSwTierRecommendation;
      const swTierValue = String(rawSwTier?.tier || '').trim();
      if (isAlftTierOption(swTierValue)) {
        const def = getAlftTierDefinition(swTierValue);
        setSwTierRecommendation({
          tier: swTierValue,
          levelLabel: String(rawSwTier?.levelLabel || def?.levelLabel || '').trim() || null,
          definitionSnapshot:
            String(rawSwTier?.definitionSnapshot || def?.definition || '').trim() || null,
          recommendedByName: String(rawSwTier?.recommendedByName || '').trim() || null,
          recommendedByEmail: String(rawSwTier?.recommendedByEmail || '').trim() || null,
          recommendedAtIso: String(rawSwTier?.recommendedAtIso || '').trim() || null,
        });
      } else {
        setSwTierRecommendation(null);
      }
      // Prefer existing RN pick; otherwise default to MSW estimate so RN can agree in one step.
      if (isAlftTierOption(existingRnTier)) {
        setRnRecommendedTier(existingRnTier);
      } else if (isAlftTierOption(swTierValue)) {
        setRnRecommendedTier(swTierValue);
      }
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
    if (needsRnTier) {
      if (!isAlftTierOption(rnRecommendedTier)) {
        toast({
          title: 'Recommended tier required',
          description: 'Select the tier level you recommend next to Submit before returning this to admin.',
          variant: 'destructive',
        });
        return;
      }
    }

    const sigUrl = createTypedSignaturePngDataUrl(name);
    if (!sigUrl) {
      toast({
        title: 'Signature required',
        description: 'Enter your printed name for the electronic signature.',
        variant: 'destructive',
      });
      return;
    }

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
          ...(needsRnTier
            ? {
                rnTierRecommendation: {
                  tier: rnRecommendedTier,
                  justification: '',
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
        description: needsRnTier
          ? `Recommended Tier ${rnRecommendedTier} was sent with your signature for admin review.`
          : 'Your signature was recorded. Name and license number have been saved for next time.',
      });
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
                ? 'Review the MSW estimated tier, agree or suggest another tier from the definitions, then type your name to electronically sign and return this ALFT to admin for final review.'
                : 'Type your full name as your electronic signature, then submit.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm text-violet-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Need the official tier wording?</span>
              <TierLevelDefinitionsLink audience="auto" className="text-xs font-semibold" />
            </div>
            <div className="mt-1 text-xs text-violet-900/90">
              Open Tier Level Definitions before submitting — plain-text definitions for Tiers 1–5.
            </div>
          </div>

          {profileSaved ? (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <BookUser className="h-4 w-4 shrink-0 text-green-600" />
              <span>
                Your name and license number were remembered from your last signing. Confirm them below, then attest to submit.
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
                  const nextName = e.target.value;
                  setSignedName(nextName);
                  setProfileSaved(false);
                  if (data?.signerRole === 'rn' && isDefaultAlftRnName(nextName)) {
                    setLicenseNumber(DEFAULT_ALFT_RN_LICENSE_NUMBER);
                  }
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
                value={
                  data?.signerRole === 'rn' && isDefaultAlftRnName(signedName)
                    ? DEFAULT_ALFT_RN_LICENSE_NUMBER
                    : licenseNumber
                }
                onChange={(e) => {
                  setLicenseNumber(e.target.value);
                  setProfileSaved(false);
                }}
                placeholder={data?.signerRole === 'rn' ? 'e.g. RN-123456' : 'e.g. MSW-789012'}
                disabled={
                  !canSign ||
                  submitting ||
                  (data?.signerRole === 'rn' && isDefaultAlftRnName(signedName))
                }
                title={
                  data?.signerRole === 'rn' && isDefaultAlftRnName(signedName)
                    ? 'Leslie Lopez license is fixed as 95357474'
                    : undefined
                }
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
            <Label>Electronic signature</Label>
            <div className={`min-h-[100px] rounded-md border bg-white px-4 py-4 ${!canSign ? 'opacity-60' : ''}`}>
              {signedName.trim() ? (
                <>
                  <div className="font-serif text-2xl italic text-gray-900">{signedName.trim()}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Electronically signed — typed name from printed name above
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Type your printed full name above to create your electronic signature.
                </div>
              )}
            </div>
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

          {swTierRecommendation?.tier ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              <div className="font-semibold">
                MSW estimated tier:{' '}
                <span className="text-base">
                  Tier {swTierRecommendation.tier}
                  {swTierRecommendation.levelLabel ? ` — ${swTierRecommendation.levelLabel}` : ''}
                </span>
              </div>
              {swTierRecommendation.recommendedByName || swTierRecommendation.recommendedByEmail ? (
                <div className="mt-0.5 text-xs text-sky-800">
                  By{' '}
                  {swTierRecommendation.recommendedByName ||
                    swTierRecommendation.recommendedByEmail}
                </div>
              ) : null}
              <div className="mt-1 text-[11px] text-sky-800">
                {ALFT_TIER_REVIEW_WORKFLOW_SUMMARY}. Agree with this estimate or choose a different tier below.
                The highlighted definition updates for your selection so you can check commentary wording.
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
              {needsRnTier ? (
                <div className="w-full space-y-1 sm:w-[180px]">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="rn-recommended-tier-submit" className="text-sm font-semibold">
                      RN agree / suggest tier <span className="text-red-500">*</span>
                    </Label>
                    <TierLevelDefinitionsLink
                      audience="admin"
                      label="Definitions"
                      className="text-[11px] font-medium"
                    />
                  </div>
                  <Select
                    value={rnRecommendedTier || undefined}
                    onValueChange={setRnRecommendedTier}
                    disabled={!canSign || submitting}
                  >
                    <SelectTrigger
                      id="rn-recommended-tier-submit"
                      className={
                        !isAlftTierOption(rnRecommendedTier)
                          ? 'border-amber-400 bg-white'
                          : 'bg-white'
                      }
                    >
                      <SelectValue placeholder="Tier 1–5" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALFT_TIER_OPTIONS.map((tier) => (
                        <SelectItem key={tier} value={tier}>
                          Tier {tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAlftTierOption(rnRecommendedTier) ? (
                    <div className="text-[11px] text-amber-700">Required to submit</div>
                  ) : null}
                </div>
              ) : null}
              <Button
                className="w-full sm:w-auto"
                onClick={() => void submit()}
                disabled={submitting || signatureSubmitGaps.length > 0}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {submitActionLabel}
              </Button>
            </div>

            {isAlftTierOption(rnRecommendedTier) ? (
              <AlftSelectedTierDefinitionPanel
                className="w-full"
                tier={rnRecommendedTier}
                commentary={stripAlftCommentaryMarkup(
                  (formAnswers as any)?.p13_commentary_section
                )}
                titlePrefix={
                  swTierRecommendation?.tier &&
                  String(swTierRecommendation.tier) === String(rnRecommendedTier)
                    ? 'Agreeing with MSW — official tier description'
                    : 'RN selected tier — official description'
                }
              />
            ) : null}

            {signatureSubmitGaps.length > 0 ? (
              <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <div className="font-semibold">
                  Still needed before <span className="underline">{submitActionLabel}</span>:
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {signatureSubmitGaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : canSign ? (
              <div className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                Ready to submit — all required signature items are complete.
              </div>
            ) : null}

            {data?.signerRole === 'rn' ? null : (
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
