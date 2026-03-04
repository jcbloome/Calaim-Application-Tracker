'use client';

import { useMemo, useState } from 'react';
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
  const swDisplayName = String(
    (socialWorkerData as any)?.displayName || (user as any)?.displayName || swEmail || 'Social Worker'
  ).trim();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [files, setFiles] = useState<FileList | null>(null);

  const [memberName, setMemberName] = useState('');
  const [uploadDate, setUploadDate] = useState<string>(() => todayLocalKey()); // YYYY-MM-DD
  const [kaiserMrn, setKaiserMrn] = useState('');
  const [socialWorkerName, setSocialWorkerName] = useState(swDisplayName);

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
    const mName = memberName.trim();
    const upDate = uploadDate.trim();
    const mrn = kaiserMrn.trim();
    const swName = socialWorkerName.trim();
    if (!mName || !mrn || !swName || !upDate) {
      toast({
        title: 'Missing info',
        description: 'Member name, Kaiser MRN, social worker name, and upload date are required.',
        variant: 'destructive',
      });
      return;
    }
    if (!files || files.length === 0) {
      toast({ title: 'Select a file', description: 'Upload the completed ALFT Tool.', variant: 'destructive' });
      return;
    }
    if (isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeMember = sanitizePathSegment(mName);
      const uploadRoot = `user_uploads/${user.uid}/sw-portal/alft/${safeMember}_${timestamp}`;

      const uploadPromises = Array.from(files)
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
          member: { name: mName, healthPlan: 'Kaiser', kaiserMrn: mrn, medicalRecordNumber: mrn },
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
      setMemberName('');
      setUploadDate(todayLocalKey());
      setKaiserMrn('');
      setSocialWorkerName(swDisplayName);
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
            ALFT Tool Upload (Kaiser)
          </CardTitle>
          <CardDescription>
            Upload the completed Assisted Living Facility Transitions (ALFT) tool. This creates an intake item for staff.
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
            <div className="space-y-2">
              <Label htmlFor="memberName">Member name</Label>
              <Input id="memberName" value={memberName} onChange={(e) => setMemberName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="swName">Social worker name</Label>
              <Input id="swName" value={socialWorkerName} onChange={(e) => setSocialWorkerName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Label htmlFor="mrn">Kaiser MRN</Label>
                <Input id="mrn" value={kaiserMrn} onChange={(e) => setKaiserMrn(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">ALFT file (PDF or images)</Label>
              <Input
                id="file"
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files)}
                disabled={isUploading}
                required
              />
            </div>

            {isUploading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading… {uploadProgress}%
              </div>
            ) : null}

            <Button type="submit" disabled={isUploading} className="w-full">
              {isUploading ? 'Uploading…' : 'Upload ALFT'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

