'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth, useStorage } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UploadCloud, Info } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

type UploadedFile = { fileName: string; downloadURL: string; storagePath: string };

const todayLocalKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const sanitizePathSegment = (value: string) =>
  String(value || '')
    .trim()
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 140);

export default function SwAlftUploadPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const storage = useStorage();
  const { user, socialWorkerData, isSocialWorker, isLoading } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim();
  const swProfileName = String((socialWorkerData as any)?.displayName || (user as any)?.displayName || '').trim();
  const swRealName = swProfileName && !swProfileName.includes('@') ? swProfileName : '';
  const swDisplayName = swRealName || swEmail || 'Social Worker';

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [files, setFiles] = useState<FileList | null>(null);

  const [memberFirstName, setMemberFirstName] = useState('');
  const [memberLastName, setMemberLastName] = useState('');
  const [uploadDate, setUploadDate] = useState<string>(() => todayLocalKey()); // YYYY-MM-DD
  const [kaiserMrn, setKaiserMrn] = useState('');
  const [socialWorkerName, setSocialWorkerName] = useState(swRealName);
  const [facilityName, setFacilityName] = useState('');
  const [priorityLevel, setPriorityLevel] = useState('Routine');
  const [transitionSummary, setTransitionSummary] = useState('');
  const [barriersAndRisks, setBarriersAndRisks] = useState('');
  const [requestedActions, setRequestedActions] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // If the SW profile name loads after first render, auto-populate the field.
  useEffect(() => {
    if (!swRealName) return;
    setSocialWorkerName((prev) => (prev && !prev.includes('@') ? prev : swRealName));
  }, [swRealName]);

  const uploaderParts = useMemo(() => {
    const cleaned = socialWorkerName.replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length <= 1) return { firstName: cleaned || 'Social', lastName: 'Worker' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }, [socialWorkerName]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSocialWorker) {
      toast({ title: 'Social worker access required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    if (!auth?.currentUser || !user?.uid) {
      toast({ title: 'Not signed in', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    const first = memberFirstName.trim();
    const last = memberLastName.trim();
    const memberName = `${first} ${last}`.replace(/\s+/g, ' ').trim();
    const upDate = uploadDate.trim();
    const mrn = kaiserMrn.trim();
    const swName = socialWorkerName.trim();
    if (!first || !last || !mrn || !swName || !upDate) {
      toast({
        title: 'Missing info',
        description: 'Member first/last name, Kaiser MRN, social worker name, and upload date are required.',
        variant: 'destructive',
      });
      return;
    }
    if (swName.includes('@')) {
      toast({
        title: 'Social worker name required',
        description: 'Please enter your real name (not an email address).',
        variant: 'destructive',
      });
      return;
    }
    if (isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeMember = sanitizePathSegment(memberName);
      const uploadRoot = `user_uploads/${user.uid}/sw-portal/alft/${safeMember}_${timestamp}`;

      const uploadPromises = Array.from(files || [])
        .slice(0, 5)
        .map((file, idx) => {
          const safeFile = sanitizePathSegment(file.name);
          const storagePath = `${uploadRoot}/${idx + 1}_${safeFile}`;
          const storageRef = ref(storage, storagePath);
          return new Promise<UploadedFile>((resolve, reject) => {
            const task = uploadBytesResumable(storageRef, file);
            task.on(
              'state_changed',
              (snap) => {
                const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
                setUploadProgress(Math.max(1, Math.min(99, Math.round(pct))));
              },
              (err) => reject(err),
              async () => {
                const downloadURL = await getDownloadURL(task.snapshot.ref);
                resolve({ fileName: file.name, downloadURL, storagePath: task.snapshot.ref.fullPath });
              }
            );
          });
        });

      const results = await Promise.all(uploadPromises);
      const idToken = await auth.currentUser.getIdToken();

      const res = await fetch('/api/alft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          uploader: { ...uploaderParts, email: swEmail, displayName: swName },
          uploadDate: upDate,
          member: { firstName: first, lastName: last, name: memberName, healthPlan: 'Kaiser', kaiserMrn: mrn, medicalRecordNumber: mrn },
          alftForm: {
            formVersion: 'placeholder-v1',
            facilityName: facilityName.trim(),
            priorityLevel: priorityLevel.trim() || 'Routine',
            transitionSummary: transitionSummary.trim(),
            barriersAndRisks: barriersAndRisks.trim(),
            requestedActions: requestedActions.trim(),
            additionalNotes: additionalNotes.trim(),
          },
          files: results.map((r) => ({ fileName: r.fileName, downloadURL: r.downloadURL, storagePath: r.storagePath })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Submit failed (HTTP ${res.status})`));
      }

      toast({
        title: 'ALFT uploaded',
        description: `Sent to intake. Email: ${data?.emailSent ? 'yes' : 'no'} • Electron: ${data?.electronNotified ? 'yes' : 'no'}`,
      });

      setFiles(null);
      setMemberFirstName('');
      setMemberLastName('');
      setUploadDate(todayLocalKey());
      setKaiserMrn('');
      setSocialWorkerName(swRealName);
      setFacilityName('');
      setPriorityLevel('Routine');
      setTransitionSummary('');
      setBarriersAndRisks('');
      setRequestedActions('');
      setAdditionalNotes('');
      setUploadProgress(0);
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Could not upload ALFT.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Social Worker Access Required</CardTitle>
          <CardDescription>Please sign in with your social worker account.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5" />
            ALFT Internal Form + Upload (Kaiser)
          </CardTitle>
          <CardDescription>
            Placeholder internal ALFT form for easy edits. This creates an intake workflow item for staff/RN/sign-off without Adobe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Signed in as <span className="font-semibold">{swDisplayName}</span>
              {swEmail ? <span className="text-muted-foreground"> • {swEmail}</span> : null}
            </AlertDescription>
          </Alert>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Member name</Label>
                <a
                  className="text-xs underline underline-offset-2 text-blue-700"
                  href="https://www.carehomefinders.com/alft"
                  target="_blank"
                  rel="noreferrer"
                >
                  ALFT tool link
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  id="memberFirstName"
                  value={memberFirstName}
                  onChange={(e) => setMemberFirstName(e.target.value)}
                  placeholder="First name"
                  required
                />
                <Input
                  id="memberLastName"
                  value={memberLastName}
                  onChange={(e) => setMemberLastName(e.target.value)}
                  placeholder="Last name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mrn">Kaiser MRN</Label>
              <Input id="mrn" value={kaiserMrn} onChange={(e) => setKaiserMrn(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="facilityName">Facility / RCFE name (optional)</Label>
              <Input
                id="facilityName"
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
                placeholder="Facility name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="swName">Social worker name</Label>
              <Input
                id="swName"
                value={socialWorkerName}
                onChange={(e) => setSocialWorkerName(e.target.value)}
                placeholder={swRealName ? '' : 'Type your full name (not email)'}
                required
                disabled={Boolean(swRealName)}
              />
              {!swRealName ? (
                <div className="text-xs text-muted-foreground">
                  This should auto-fill from your Social Worker profile. If it’s blank, ask admin to set your display name.
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="uploadDate">Upload date</Label>
              <Input
                id="uploadDate"
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priorityLevel">Priority</Label>
              <Input
                id="priorityLevel"
                value={priorityLevel}
                onChange={(e) => setPriorityLevel(e.target.value)}
                placeholder="Routine / Urgent / Priority"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transitionSummary">Transition summary</Label>
              <textarea
                id="transitionSummary"
                value={transitionSummary}
                onChange={(e) => setTransitionSummary(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Brief summary of current transition status and goals..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barriersAndRisks">Barriers / risks (optional)</Label>
              <textarea
                id="barriersAndRisks"
                value={barriersAndRisks}
                onChange={(e) => setBarriersAndRisks(e.target.value)}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Any barriers, concerns, or risks..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requestedActions">Requested actions</Label>
              <textarea
                id="requestedActions"
                value={requestedActions}
                onChange={(e) => setRequestedActions(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="What should staff/RN review or update?"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">Additional notes (optional)</Label>
              <textarea
                id="additionalNotes"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Anything else the team should know..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Attachments (PDF/images/docs)</Label>
              <Input
                id="file"
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files)}
                disabled={isUploading}
              />
              <div className="text-xs text-muted-foreground">
                Attach source PDF or supporting files if available. Up to 5 files.
              </div>
            </div>

            {isUploading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading… {uploadProgress}%
              </div>
            ) : null}

            <Button type="submit" disabled={isUploading} className="w-full">
              {isUploading ? 'Submitting…' : 'Submit ALFT form'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

