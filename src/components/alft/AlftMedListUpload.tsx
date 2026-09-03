'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore, useStorage, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export type AlftMedListAttachment = {
  id?: string;
  fileName: string;
  downloadURL: string;
  storagePath?: string;
  contentType?: string;
  uploadedAtIso?: string;
  uploadedByName?: string | null;
  uploadedByEmail?: string | null;
};

export function parseMedListAttachment(raw: unknown): AlftMedListAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const downloadURL = String(obj.downloadURL || '').trim();
  const fileName = String(obj.fileName || '').trim();
  if (!downloadURL || !fileName) return null;
  return {
    id: String(obj.id || '').trim() || undefined,
    fileName,
    downloadURL,
    storagePath: String(obj.storagePath || '').trim() || undefined,
    contentType: String(obj.contentType || '').trim() || undefined,
    uploadedAtIso: String(obj.uploadedAtIso || '').trim() || undefined,
    uploadedByName: String(obj.uploadedByName || '').trim() || null,
    uploadedByEmail: String(obj.uploadedByEmail || '').trim() || null,
  };
}

type Props = {
  memberId?: string;
  attachment: AlftMedListAttachment | null;
  onChange: (next: AlftMedListAttachment | null) => void;
  readOnly?: boolean;
  className?: string;
  /** Persist to alft_assignments when memberId is set (SW/admin shared). */
  persistToAssignment?: boolean;
};

export function AlftMedListUpload({
  memberId,
  attachment,
  onChange,
  readOnly = false,
  className = '',
  persistToAssignment = true,
}: Props) {
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const persist = async (next: AlftMedListAttachment | null) => {
    if (!persistToAssignment || !firestore || !memberId) return;
    await setDoc(
      doc(firestore, 'alft_assignments', memberId),
      {
        memberId,
        medListAttachment: next,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => null);
  };

  const handleFile = async (file: File | null) => {
    if (!file || readOnly) return;
    if (!storage) {
      toast({ variant: 'destructive', title: 'Upload unavailable', description: 'Storage is not ready. Sign in and try again.' });
      return;
    }
    const okType =
      /^application\/pdf$/i.test(file.type) ||
      /^image\//i.test(file.type) ||
      /\.(pdf|png|jpe?g|webp|heic)$/i.test(file.name);
    if (!okType) {
      toast({
        variant: 'destructive',
        title: 'Unsupported file',
        description: 'Upload a PDF or image of the medication list.',
      });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Keep med list uploads under 20 MB.' });
      return;
    }

    setUploading(true);
    setProgress(1);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = file.name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 160);
      const folder = memberId || 'unassigned';
      const storagePath = `admin_uploads/alft-med-lists/${folder}/${ts}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      const contentType =
        String(file.type || '').trim() || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'application/octet-stream');

      const downloadURL = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, {
          contentType,
          customMetadata: {
            label: 'Medication list',
            originalFileName: file.name.slice(0, 180),
          },
        });
        task.on(
          'state_changed',
          (snap) => {
            const pct = snap.totalBytes > 0 ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
            setProgress(Math.max(1, Math.min(99, Math.round(pct))));
          },
          (err) => reject(err),
          async () => {
            resolve(await getDownloadURL(task.snapshot.ref));
          }
        );
      });

      const next: AlftMedListAttachment = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        downloadURL,
        storagePath,
        contentType,
        uploadedAtIso: new Date().toISOString(),
        uploadedByName: String(user?.displayName || '').trim() || null,
        uploadedByEmail: String(user?.email || '').trim() || null,
      };
      onChange(next);
      await persist(next);
      toast({
        title: 'Med list uploaded',
        description: 'Attached to the end of the ALFT. You can still type meds in the table if needed.',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: String(e?.message || 'Could not upload medication list.'),
      });
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAttachment = async () => {
    if (readOnly) return;
    onChange(null);
    await persist(null);
    toast({ title: 'Med list removed', description: 'Typed medication table can still be used.' });
  };

  return (
    <div className={`rounded-md border border-emerald-200 bg-emerald-50/60 p-3 print:border-zinc-300 print:bg-white ${className}`}>
      <div className="text-xs font-semibold text-emerald-950 print:text-zinc-900">
        Medication list — type in the form and/or attach a file
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-emerald-900/90 print:text-zinc-700">
        Type medications into the table above whenever possible. For long or extensive lists, SW / admin / RN can
        also upload a PDF or image — that file is attached at the end of the ALFT packet.
      </p>

      {attachment?.downloadURL ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-emerald-200 bg-white px-2.5 py-2 text-xs">
          <FileText className="h-4 w-4 shrink-0 text-emerald-700" />
          <a
            href={attachment.downloadURL}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate font-medium text-blue-700 hover:underline"
          >
            {attachment.fileName || 'Medication list'}
          </a>
          {!readOnly ? (
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => void removeAttachment()}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.heic"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {uploading ? `Uploading ${progress}%…` : attachment ? 'Replace med list file' : 'Upload med list'}
          </Button>
          <span className="text-[11px] text-muted-foreground">PDF or image · max 20 MB</span>
        </div>
      ) : null}
    </div>
  );
}
