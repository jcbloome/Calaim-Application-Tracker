'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, UploadCloud, ExternalLink, RefreshCw, UserCheck, CheckCircle2, Send, Download } from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  arrayUnion,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

type StandaloneUpload = {
  id: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
  toolCode?: string;
  documentType: string;
  files: Array<{ fileName: string; downloadURL: string; storagePath?: string }>;
  uploaderName?: string;
  uploaderEmail?: string;
  memberName: string;
  healthPlan?: string;
  medicalRecordNumber?: string | null;
  alftUploadDate?: string | null;
  alftForm?: {
    formVersion?: string;
    facilityName?: string | null;
    priorityLevel?: string | null;
    transitionSummary?: string | null;
    barriersAndRisks?: string | null;
    requestedActions?: string | null;
    additionalNotes?: string | null;
  } | null;

  // Workflow / tracking fields (stored on the intake doc).
  alftRnUid?: string | null;
  alftRnName?: string | null;
  alftRnEmail?: string | null;
  alftRnAssignedAt?: any;
  alftRnDownloadedAt?: any;
  alftRnRevisionUploadedAt?: any;

  alftStaffUid?: string | null;
  alftStaffName?: string | null;
  alftStaffEmail?: string | null;
  alftStaffAssignedAt?: any;
  alftStaffReviewedAt?: any;

  alftSignature?: {
    requestId?: string;
    status?: string;
    requestedAt?: any;
    reviewedAt?: any;
    rnSignedAt?: any;
    mswSignedAt?: any;
    completedAt?: any;
    signaturePagePdfStoragePath?: string | null;
    packetPdfStoragePath?: string | null;
  } | null;

  alftRevisions?: Array<{
    fileName: string;
    downloadURL: string;
    storagePath?: string;
    uploadedByName?: string | null;
    uploadedByEmail?: string | null;
    uploadedAt?: any;
    note?: string | null;
  }>;
};

type StaffOption = { uid: string; label: string; email: string; role: 'Admin' | 'Super Admin' | 'Staff' };

const toLabel = (value: any) => String(value ?? '').trim();

const isAlft = (row: Partial<StandaloneUpload>) => {
  const toolCode = toLabel((row as any)?.toolCode).toUpperCase();
  const dtLower = toLabel((row as any)?.documentType).toLowerCase();
  return toolCode === 'ALFT' || dtLower.includes('alft');
};

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

const fmtTimeline = (ms: number) => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

type TimelineItem = { key: string; label: string; ms: number; by?: string };

const timelineFor = (r: StandaloneUpload): TimelineItem[] => {
  const items: TimelineItem[] = [];
  const receivedMs = toMs(r.createdAt) || 0;
  if (receivedMs) items.push({ key: 'received', label: 'Received', ms: receivedMs });

  const rnAssignedMs = toMs(r.alftRnAssignedAt);
  if (rnAssignedMs) items.push({ key: 'rnAssigned', label: 'RN assigned', ms: rnAssignedMs, by: r.alftRnName || r.alftRnEmail || '' });

  const rnDownloadedMs = toMs(r.alftRnDownloadedAt);
  if (rnDownloadedMs) items.push({ key: 'rnDownloaded', label: 'RN downloaded', ms: rnDownloadedMs, by: r.alftRnName || r.alftRnEmail || '' });

  const rnReuploadedMs = toMs(r.alftRnRevisionUploadedAt);
  if (rnReuploadedMs) {
    const latestRevision = (r.alftRevisions || []).slice(-1)[0] as any;
    const by = String(latestRevision?.uploadedByName || latestRevision?.uploadedByEmail || r.alftRnName || r.alftRnEmail || '').trim();
    items.push({ key: 'rnReuploaded', label: 'RN re-uploaded', ms: rnReuploadedMs, by });
  }

  const staffAssignedMs = toMs(r.alftStaffAssignedAt);
  if (staffAssignedMs) items.push({ key: 'staffAssigned', label: 'Staff assigned', ms: staffAssignedMs, by: r.alftStaffName || r.alftStaffEmail || '' });

  const sigRequestedMs = toMs((r as any)?.alftSignature?.requestedAt);
  if (sigRequestedMs) items.push({ key: 'sigRequested', label: 'Signatures requested', ms: sigRequestedMs });

  const rnSignedMs = toMs((r as any)?.alftSignature?.rnSignedAt);
  if (rnSignedMs) items.push({ key: 'rnSigned', label: 'RN signed', ms: rnSignedMs, by: r.alftRnName || r.alftRnEmail || '' });

  const mswSignedMs = toMs((r as any)?.alftSignature?.mswSignedAt);
  if (mswSignedMs) items.push({ key: 'mswSigned', label: 'MSW signed', ms: mswSignedMs, by: r.uploaderName || r.uploaderEmail || '' });

  const packetReady = Boolean((r as any)?.alftSignature?.packetPdfStoragePath);
  const completedMs = toMs((r as any)?.alftSignature?.completedAt);
  if (packetReady && completedMs) items.push({ key: 'packetReady', label: 'Packet ready', ms: completedMs });

  return items
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.ms - b.ms);
};

type StageKey = 'received' | 'rn_assigned' | 'rn_downloaded' | 'rn_reuploaded' | 'staff_assigned' | 'sent_for_signature' | 'completed';

const computeStage = (r: StandaloneUpload): StageKey => {
  if (toLabel(r.status).toLowerCase() !== 'pending') return 'completed';
  if (toMs((r as any)?.alftSignature?.requestedAt) > 0) return 'sent_for_signature';
  if (toMs(r.alftStaffAssignedAt) > 0) return 'staff_assigned';
  if (toMs(r.alftRnRevisionUploadedAt) > 0) return 'rn_reuploaded';
  if (toMs(r.alftRnDownloadedAt) > 0) return 'rn_downloaded';
  if (toMs(r.alftRnAssignedAt) > 0) return 'rn_assigned';
  return 'received';
};

const stageBadge = (stage: StageKey) => {
  switch (stage) {
    case 'received':
      return <Badge variant="secondary">1) Received</Badge>;
    case 'rn_assigned':
      return <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">1) Assigned</Badge>;
    case 'rn_downloaded':
      return <Badge className="bg-blue-600 text-white hover:bg-blue-600">2) RN downloaded</Badge>;
    case 'rn_reuploaded':
      return <Badge className="bg-purple-700 text-white hover:bg-purple-700">2) RN re-uploaded</Badge>;
    case 'staff_assigned':
      return <Badge className="bg-amber-600 text-white hover:bg-amber-600">3) Staff review</Badge>;
    case 'sent_for_signature':
      return <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">3) Signatures requested</Badge>;
    case 'completed':
      return <Badge variant="outline">Complete</Badge>;
  }
};

export default function AdminAlftTrackerPage() {
  const { isAdmin, isLoading, user } = useAdmin();
  const firestore = useFirestore();
  const storage = useStorage();
  const auth = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<StandaloneUpload[]>([]);
  const [search, setSearch] = useState('');
  const [focusId, setFocusId] = useState('');

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignKind, setAssignKind] = useState<'rn' | 'staff'>('rn');
  const [assignRow, setAssignRow] = useState<StandaloneUpload | null>(null);
  const [assignUid, setAssignUid] = useState<string>('');

  const [revOpen, setRevOpen] = useState(false);
  const [revRow, setRevRow] = useState<StandaloneUpload | null>(null);
  const [revFile, setRevFile] = useState<File | null>(null);
  const [revNote, setRevNote] = useState('');
  const [revUploading, setRevUploading] = useState(false);
  const [revProgress, setRevProgress] = useState(0);

  const [sigRequestingId, setSigRequestingId] = useState('');
  const [sendingCompletedId, setSendingCompletedId] = useState('');
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigDialog, setSigDialog] = useState<{
    intakeId: string;
    requestId: string;
    rnSignUrl: string;
    mswSignUrl: string;
    rnEmailSent: boolean;
    mswEmailSent: boolean;
  } | null>(null);

  useEffect(() => {
    const focus = String(searchParams?.get('focus') || '').trim();
    if (focus) setFocusId(focus);
  }, [searchParams]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const qy = query(collection(firestore, 'standalone_upload_submissions'), where('status', '==', 'pending'));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
        const mapped = next
          .map((r) => ({
            id: toLabel(r.id),
            status: toLabel(r.status || 'pending'),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            toolCode: toLabel(r.toolCode) || undefined,
            documentType: toLabel(r.documentType),
            files: Array.isArray(r.files) ? r.files : [],
            uploaderName: toLabel(r.uploaderName) || undefined,
            uploaderEmail: toLabel(r.uploaderEmail) || undefined,
            memberName: toLabel(r.memberName),
            healthPlan: toLabel(r.healthPlan) || undefined,
            medicalRecordNumber: r.medicalRecordNumber ?? r.kaiserMrn ?? r.mediCalNumber ?? null,
            alftUploadDate: toLabel(r.alftUploadDate) || null,
            alftForm: (r as any)?.alftForm || null,

            alftRnUid: toLabel(r.alftRnUid) || null,
            alftRnName: toLabel(r.alftRnName) || null,
            alftRnEmail: toLabel(r.alftRnEmail) || null,
            alftRnAssignedAt: r.alftRnAssignedAt,
            alftRnDownloadedAt: r.alftRnDownloadedAt,
            alftRnRevisionUploadedAt: r.alftRnRevisionUploadedAt,

            alftStaffUid: toLabel(r.alftStaffUid) || null,
            alftStaffName: toLabel(r.alftStaffName) || null,
            alftStaffEmail: toLabel(r.alftStaffEmail) || null,
            alftStaffAssignedAt: r.alftStaffAssignedAt,
            alftStaffReviewedAt: r.alftStaffReviewedAt,

            alftSignature: (r as any)?.alftSignature || null,

            alftRevisions: Array.isArray(r.alftRevisions) ? r.alftRevisions : [],
          }))
          .filter((r) => isAlft(r)) as StandaloneUpload[];
        setRows(mapped);
      },
      () => setRows([])
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!firestore || !isAdmin) return;
      setStaffLoading(true);
      try {
        const [adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')).catch(() => null),
          getDocs(collection(firestore, 'roles_super_admin')).catch(() => null),
          getDocs(collection(firestore, 'users')).catch(() => null),
        ]);
        const adminIds = new Set((adminRolesSnap?.docs || []).map((d) => d.id));
        const superAdminIds = new Set((superAdminRolesSnap?.docs || []).map((d) => d.id));
        const users = (usersSnap?.docs || []).map((d) => ({ uid: d.id, ...(d.data() as any) }));
        const options: StaffOption[] = users
          .map((u: any) => {
            const uid = toLabel(u.uid);
            const email = toLabel(u.email);
            const first = toLabel(u.firstName);
            const last = toLabel(u.lastName);
            const display = toLabel(u.displayName);
            const label = (first || last) ? `${first} ${last}`.trim() : (display || email || uid);
            const role: StaffOption['role'] = superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
            return { uid, email, label, role };
          })
          .filter((o) => Boolean(o.uid && o.email))
          .sort((a, b) => a.label.localeCompare(b.label));
        if (!cancelled) setStaffOptions(options);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!s) return true;
        return (
          toLabel(r.memberName).toLowerCase().includes(s) ||
          toLabel(r.medicalRecordNumber).toLowerCase().includes(s) ||
          toLabel(r.uploaderName).toLowerCase().includes(s) ||
          toLabel(r.uploaderEmail).toLowerCase().includes(s) ||
          toLabel(r.alftRnName).toLowerCase().includes(s) ||
          toLabel(r.alftStaffName).toLowerCase().includes(s)
        );
      })
      .sort((a, b) => {
        const aMs = Math.max(toMs(a.updatedAt), toMs(a.createdAt));
        const bMs = Math.max(toMs(b.updatedAt), toMs(b.createdAt));
        return bMs - aMs;
      });
  }, [rows, search]);

  const openAssign = useCallback((row: StandaloneUpload, kind: 'rn' | 'staff') => {
    setAssignRow(row);
    setAssignKind(kind);
    setAssignUid('');
    setAssignOpen(true);
  }, []);

  const sendAssignmentNotification = async (targetUid: string, payload: Record<string, any>) => {
    if (!firestore) return;
    const uid = String(targetUid || '').trim();
    if (!uid) return;
    try {
      await addDoc(collection(firestore, 'staff_notifications'), {
        userId: uid,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        timestamp: serverTimestamp(),
        actionUrl: payload.actionUrl,
        standaloneUploadId: payload.standaloneUploadId,
        memberName: payload.memberName,
        healthPlan: payload.healthPlan,
        memberClientId: payload.memberClientId,
        createdBy: user?.uid || null,
        createdByName: (user as any)?.displayName || (user as any)?.email || 'Staff',
        senderName: (user as any)?.displayName || (user as any)?.email || 'Staff',
        senderId: user?.uid || null,
      });
    } catch (e) {
      console.warn('Failed to send assignment notification:', e);
    }
  };

  const saveAssignment = async () => {
    if (!firestore || !assignRow) return;
    const selected = staffOptions.find((s) => s.uid === assignUid);
    if (!selected) {
      toast({ title: 'Select a staff member', description: 'Choose who to assign this ALFT to.', variant: 'destructive' });
      return;
    }
    try {
      const base = {
        updatedAt: serverTimestamp(),
      } as Record<string, any>;
      const patch =
        assignKind === 'rn'
          ? {
              ...base,
              alftRnUid: selected.uid,
              alftRnName: selected.label,
              alftRnEmail: selected.email,
              alftRnAssignedAt: serverTimestamp(),
            }
          : {
              ...base,
              alftStaffUid: selected.uid,
              alftStaffName: selected.label,
              alftStaffEmail: selected.email,
              alftStaffAssignedAt: serverTimestamp(),
            };
      await updateDoc(doc(firestore, 'standalone_upload_submissions', assignRow.id), patch);

      await sendAssignmentNotification(selected.uid, {
        title: assignKind === 'rn' ? 'ALFT assigned (RN)' : 'ALFT assigned (Staff review)',
        message: `${assignRow.memberName || 'Member'} • MRN ${assignRow.medicalRecordNumber || '—'}\nUploaded by: ${
          assignRow.uploaderName || assignRow.uploaderEmail || 'Social Worker'
        }`,
        type: 'alft_assigned',
        actionUrl: `/admin/alft-tracker?focus=${encodeURIComponent(assignRow.id)}`,
        standaloneUploadId: assignRow.id,
        memberName: assignRow.memberName,
        healthPlan: assignRow.healthPlan || '',
        memberClientId: assignRow.medicalRecordNumber || '',
      });

      toast({
        title: 'Assigned',
        description: `${assignKind === 'rn' ? 'RN' : 'Staff'} assigned and notified via Electron/My Notifications.`,
      });
      setAssignOpen(false);
      setAssignRow(null);
    } catch (e: any) {
      toast({ title: 'Assignment failed', description: e?.message || 'Could not save assignment.', variant: 'destructive' });
    }
  };

  const markRnDownloaded = async (row: StandaloneUpload) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'standalone_upload_submissions', row.id), {
        alftRnDownloadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
      toast({ title: 'Marked downloaded', description: 'Saved RN download timestamp.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Could not update.', variant: 'destructive' });
    }
  };

  const openRevision = (row: StandaloneUpload) => {
    setRevRow(row);
    setRevFile(null);
    setRevNote('');
    setRevProgress(0);
    setRevOpen(true);
  };

  const uploadRevision = async () => {
    if (!revRow || !firestore || !storage) return;
    if (!revFile) {
      toast({ title: 'Select a file', description: 'Choose the revised ALFT file to upload.', variant: 'destructive' });
      return;
    }
    if (revUploading) return;
    setRevUploading(true);
    setRevProgress(0);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = revFile.name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 160);
      const storagePath = `admin_uploads/alft-revisions/${revRow.id}/${ts}_${safeName}`;
      const storageRef = ref(storage, storagePath);

      const uploaded = await new Promise<{ downloadURL: string }>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, revFile);
        task.on(
          'state_changed',
          (snap) => {
            const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
            setRevProgress(Math.max(1, Math.min(99, Math.round(pct))));
          },
          (err) => reject(err),
          async () => {
            const downloadURL = await getDownloadURL(task.snapshot.ref);
            resolve({ downloadURL });
          }
        );
      });

      const revision = {
        fileName: revFile.name,
        downloadURL: uploaded.downloadURL,
        storagePath,
        uploadedByName: toLabel((user as any)?.displayName) || null,
        uploadedByEmail: toLabel((user as any)?.email) || null,
        uploadedAt: serverTimestamp(),
        note: toLabel(revNote) || null,
      };

      await updateDoc(doc(firestore, 'standalone_upload_submissions', revRow.id), {
        alftRevisions: arrayUnion(revision as any),
        alftRnRevisionUploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);

      toast({ title: 'Revision uploaded', description: 'Saved revised file and refreshed timestamps for notifications.' });
      setRevOpen(false);
      setRevRow(null);
    } catch (e: any) {
      console.error('ALFT revision upload failed:', e);
      toast({ title: 'Upload failed', description: e?.message || 'Could not upload revision.', variant: 'destructive' });
    } finally {
      setRevUploading(false);
      setRevProgress(0);
    }
  };

  const markSentForSignature = (row: StandaloneUpload) => {
    void requestSignatures(row);
  };

  const sendCompletedToJh = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || sendingCompletedId) return;
    setSendingCompletedId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/send-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: row.id }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Send failed (HTTP ${res.status})`));
      toast({ title: 'Completed ALFT emailed', description: `Sent to ${String(data?.to || 'JHernandez@ilshealth.com')}.` });
    } catch (e: any) {
      toast({ title: 'Could not send completed email', description: e?.message || 'Send failed.', variant: 'destructive' });
    } finally {
      setSendingCompletedId('');
    }
  };

  const requestSignatures = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) {
      toast({ title: 'Not signed in', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    if (!row?.id) return;
    if (!row.alftRnUid || !row.alftRnEmail) {
      toast({ title: 'Assign RN first', description: 'Please assign an RN before requesting signatures.', variant: 'destructive' });
      return;
    }
    if (!row.uploaderEmail) {
      toast({ title: 'Missing MSW email', description: 'This intake is missing the uploader email for MSW signature.', variant: 'destructive' });
      return;
    }
    if (sigRequestingId) return;
    setSigRequestingId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: row.id }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Request failed (HTTP ${res.status})`));
      }
      const requestId = String(data?.requestId || '').trim();
      const rnSignUrl = String(data?.rn?.signUrl || '').trim();
      const mswSignUrl = String(data?.msw?.signUrl || '').trim();
      setSigDialog({
        intakeId: row.id,
        requestId,
        rnSignUrl,
        mswSignUrl,
        rnEmailSent: Boolean(data?.rn?.emailSent),
        mswEmailSent: Boolean(data?.msw?.emailSent),
      });
      setSigDialogOpen(true);
      toast({
        title: 'Signature request sent',
        description: `SW signs first, RN signs final. RN email: ${data?.rn?.emailSent ? 'sent' : 'not sent'} • MSW email: ${data?.msw?.emailSent ? 'sent' : 'not sent'}`,
      });
    } catch (e: any) {
      toast({ title: 'Could not request signatures', description: e?.message || 'Request failed.', variant: 'destructive' });
    } finally {
      setSigRequestingId('');
    }
  };

  const downloadSignaturePdf = async (requestId: string, kind: 'signature' | 'packet') => {
    if (!auth?.currentUser) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(
        `/api/alft/signatures/download?requestId=${encodeURIComponent(requestId)}&kind=${encodeURIComponent(kind)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        throw new Error(String(json?.error || `Download failed (HTTP ${res.status})`));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ALFT_${kind}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message || 'Could not download.', variant: 'destructive' });
    }
  };

  const markCompleted = async (row: StandaloneUpload) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'standalone_upload_submissions', row.id), {
        status: 'processed',
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
      toast({ title: 'Completed', description: 'Removed from pending intake queue.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Could not update.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>Please sign in as an admin to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">ALFT Tracker</h1>
          <p className="text-muted-foreground">
            Internal workflow: SW form submitted to staff review, then RN review/revisions, then SW signature, then final RN sign-off, then send completed packet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={filtered.length > 0 ? 'secondary' : 'outline'}>{filtered.length} pending</Badge>
          <Button variant="outline" asChild>
            <Link href="/admin/alft-tracker/dummy-preview">
              View dummy ALFT (ILS PDF preview)
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setSearch('')} disabled={!search}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear search
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <Label htmlFor="alft-search" className="sr-only">
            Search
          </Label>
          <Input
            id="alft-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member / MRN / uploader / assignee…"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ALFT intake queue</CardTitle>
          <CardDescription>All items shown here are pending ALFT uploads (from `standalone_upload_submissions`).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No pending ALFT uploads found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>MRN</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>SW uploader</TableHead>
                  <TableHead>RN</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const focused = focusId && r.id === focusId;
                  const stage = computeStage(r);
                  const latestRevision = (r.alftRevisions || []).slice(-1)[0];
                  const sw = r.uploaderName || r.uploaderEmail || 'Social Worker';
                  return (
                    <TableRow key={r.id} className={focused ? 'bg-amber-50' : ''}>
                      <TableCell className="min-w-[220px]">
                        <div className="font-medium truncate">{r.memberName || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.healthPlan || '—'} • Uploaded {r.alftUploadDate || (toMs(r.createdAt) ? new Date(toMs(r.createdAt)).toLocaleDateString() : '—')}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{r.medicalRecordNumber || '—'}</TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-2">
                          <div>{stageBadge(stage)}</div>
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            {timelineFor(r)
                              .slice(-6)
                              .map((t) => (
                                <div key={t.key} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                                  <div className="min-w-0">
                                    <div className="truncate">
                                      <span className="font-medium text-foreground/80">{t.label}</span>
                                      {t.by ? <span className="text-muted-foreground"> — {t.by}</span> : null}
                                    </div>
                                    <div className="text-muted-foreground">{fmtTimeline(t.ms) || '—'}</div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="truncate">{sw}</div>
                        {r.uploaderEmail ? <div className="text-xs text-muted-foreground truncate">{r.uploaderEmail}</div> : null}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="truncate">{r.alftRnName || '—'}</div>
                        {r.alftRnEmail ? <div className="text-xs text-muted-foreground truncate">{r.alftRnEmail}</div> : null}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="truncate">{r.alftStaffName || '—'}</div>
                        {r.alftStaffEmail ? <div className="text-xs text-muted-foreground truncate">{r.alftStaffEmail}</div> : null}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="space-y-1">
                          {r.alftForm?.transitionSummary ? (
                            <div className="rounded border bg-muted/30 p-2 text-[11px]">
                              <div className="font-semibold">SW placeholder form</div>
                              <div className="truncate">
                                {r.alftForm?.facilityName ? `${r.alftForm.facilityName} • ` : ''}
                                {r.alftForm?.priorityLevel || 'Routine'}
                              </div>
                              <div className="line-clamp-2 text-muted-foreground">{r.alftForm.transitionSummary}</div>
                            </div>
                          ) : null}
                          {(r.files || []).slice(0, 2).map((f) => (
                            <a
                              key={f.downloadURL}
                              className="underline text-blue-600 block truncate"
                              href={f.downloadURL}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {f.fileName || 'Download'}
                            </a>
                          ))}
                          {(r.files || []).length > 2 ? (
                            <div className="text-xs text-muted-foreground">+{(r.files || []).length - 2} more</div>
                          ) : null}
                          {latestRevision?.downloadURL ? (
                            <div className="pt-1">
                              <div className="text-xs font-semibold">Latest revision</div>
                              <a
                                className="underline text-blue-700 block truncate"
                                href={latestRevision.downloadURL}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {latestRevision.fileName || 'Download revision'}
                              </a>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {toLabel(latestRevision.uploadedByName || latestRevision.uploadedByEmail) || '—'}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col gap-2 items-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openAssign(r, 'rn')} disabled={staffLoading}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Assign RN
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void markRnDownloaded(r)}
                              disabled={!r.alftRnUid}
                              title={!r.alftRnUid ? 'Assign RN first' : 'Mark RN downloaded'}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              RN downloaded
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openRevision(r)} disabled={!r.alftRnUid}>
                              <UploadCloud className="h-4 w-4 mr-2" />
                              RN re-upload
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openAssign(r, 'staff')} disabled={staffLoading}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Assign staff
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markSentForSignature(r)}
                              disabled={
                                !r.alftStaffUid ||
                                !r.alftRnUid ||
                                Boolean((r as any)?.alftSignature?.requestedAt) ||
                                Boolean(sigRequestingId && sigRequestingId === r.id)
                              }
                              title={
                                (r as any)?.alftSignature?.requestedAt
                                  ? 'Signatures already requested'
                                  : !r.alftRnUid
                                    ? 'Assign RN first'
                                    : !r.alftStaffUid
                                      ? 'Assign staff first'
                                      : 'Request signatures'
                              }
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {sigRequestingId === r.id ? 'Requesting…' : 'Request SW signature (RN final)'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void sendCompletedToJh(r)}
                              disabled={sendingCompletedId === r.id || !Boolean(r?.alftSignature?.packetPdfStoragePath || r?.alftSignature?.signaturePagePdfStoragePath)}
                              title={!Boolean(r?.alftSignature?.packetPdfStoragePath || r?.alftSignature?.signaturePagePdfStoragePath) ? 'Complete signatures first' : 'Send completed form + attachments via email'}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {sendingCompletedId === r.id ? 'Sending…' : 'Email completed to JHernandez'}
                            </Button>
                            <Button size="sm" onClick={() => void markCompleted(r)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Complete
                            </Button>
                          </div>
                          {r?.alftSignature?.requestId ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void downloadSignaturePdf(String(r.alftSignature?.requestId), 'signature')}
                                disabled={!r?.alftSignature?.signaturePagePdfStoragePath}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Signature page
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void downloadSignaturePdf(String(r.alftSignature?.requestId), 'packet')}
                                disabled={!r?.alftSignature?.packetPdfStoragePath}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Full packet
                              </Button>
                            </div>
                          ) : null}
                          <Button asChild size="sm" variant="secondary">
                            <Link href={`/admin/standalone-uploads?focus=${encodeURIComponent(r.id)}&filter=alft`}>
                              Open in intake <ExternalLink className="h-4 w-4 ml-2" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{assignKind === 'rn' ? 'Assign RN reviewer' : 'Assign staff reviewer'}</DialogTitle>
            <DialogDescription>
              This will save the assignment on the ALFT intake and notify the assigned person via Electron/My Notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Member</Label>
              <div className="text-sm">{assignRow?.memberName || '—'}</div>
              <div className="text-xs text-muted-foreground font-mono">{assignRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="space-y-1">
              <Label>Assignee</Label>
              <Select value={assignUid} onValueChange={setAssignUid}>
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? 'Loading staff…' : 'Select staff'} />
                </SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.uid} value={s.uid}>
                      {s.label} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveAssignment()} disabled={!assignUid}>
              Assign & notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>RN re-upload (revised ALFT)</DialogTitle>
            <DialogDescription>
              Upload the revised ALFT file. This records who uploaded it and refreshes timestamps for notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Member</Label>
              <div className="text-sm">{revRow?.memberName || '—'}</div>
              <div className="text-xs text-muted-foreground font-mono">{revRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="alft-rev-file">Revised file</Label>
              <Input
                id="alft-rev-file"
                type="file"
                onChange={(e) => setRevFile(e.target.files?.[0] || null)}
                disabled={revUploading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="alft-rev-note">Note (optional)</Label>
              <Input
                id="alft-rev-note"
                value={revNote}
                onChange={(e) => setRevNote(e.target.value)}
                placeholder="What changed / what to review…"
                disabled={revUploading}
              />
            </div>
            {revUploading ? <div className="text-xs text-muted-foreground">Uploading… {revProgress}%</div> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRevOpen(false)} disabled={revUploading}>
              Cancel
            </Button>
            <Button onClick={() => void uploadRevision()} disabled={revUploading || !revFile}>
              {revUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sigDialogOpen} onOpenChange={setSigDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Signature request sent</DialogTitle>
            <DialogDescription>
              Emails were sent to the RN and MSW uploader. Signing order is Social Worker first, then final RN sign-off.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="font-semibold">Status</div>
              <div className="text-muted-foreground">
                RN email: {sigDialog?.rnEmailSent ? 'sent' : 'not sent'} • MSW email: {sigDialog?.mswEmailSent ? 'sent' : 'not sent'}
              </div>
              {sigDialog?.requestId ? <div className="text-xs text-muted-foreground">Request ID: {sigDialog.requestId}</div> : null}
            </div>

            <div className="space-y-1">
              <Label>RN signing link (Admin)</Label>
              {sigDialog?.rnSignUrl ? (
                <a className="underline text-blue-700 break-all" href={sigDialog.rnSignUrl}>
                  {sigDialog.rnSignUrl}
                </a>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>

            <div className="space-y-1">
              <Label>MSW signing link (SW Portal)</Label>
              {sigDialog?.mswSignUrl ? (
                <a className="underline text-blue-700 break-all" href={sigDialog.mswSignUrl}>
                  {sigDialog.mswSignUrl}
                </a>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSigDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

