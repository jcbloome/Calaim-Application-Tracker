'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw } from 'lucide-react';
import { arrayUnion, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

type LegacyDocType = '602' | 'med_list' | 'snf_facesheet';

type KaiserAlftMember = {
  id: string;
  memberName: string;
  memberMrn: string;
  kaiserStatus: string;
  alftAssigned: string;
  ispCurrentLocation: string;
  ispContactPhone: string;
  ispContactEmail: string;
  ispContactConfirmDate: string;
};

type TrackerRecord = {
  memberId: string;
  docs?: Partial<
    Record<
      LegacyDocType,
      {
        fileName: string;
        downloadURL: string;
      }
    >
  >;
  docUploads?: Array<{
    fileName: string;
    downloadURL: string;
    docType?: LegacyDocType | 'other';
  }>;
};

const LEGACY_DOC_OPTIONS: Array<{ key: LegacyDocType; label: string }> = [
  { key: '602', label: '602' },
  { key: 'med_list', label: 'Med list' },
  { key: 'snf_facesheet', label: 'SNF facesheet' },
];

const sanitizePathSegment = (value: string) =>
  String(value || '')
    .trim()
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 160);

const inferLegacyDocType = (fileName: string): LegacyDocType | 'other' => {
  const n = String(fileName || '').toLowerCase();
  if (n.includes('602')) return '602';
  if (n.includes('med') && n.includes('list')) return 'med_list';
  if (n.includes('snf') && (n.includes('face') || n.includes('sheet'))) return 'snf_facesheet';
  return 'other';
};

const parseFlexibleDate = (value: string): Date | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) return new Date(Number(isoLike[1]), Number(isoLike[2]) - 1, Number(isoLike[3]));
  const usLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usLike) return new Date(Number(usLike[3]), Number(usLike[1]) - 1, Number(usLike[2]));
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const isWithinPastDays = (value: string, days: number): boolean => {
  const dt = parseFlexibleDate(value);
  if (!dt) return false;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.floor((a - b) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= days;
};

export default function AdminAlftAssignmentPage() {
  const { isAdmin, isLoading, user } = useAdmin();
  const { toast } = useToast();
  const auth = useAuth();
  const storage = useStorage();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [members, setMembers] = useState<KaiserAlftMember[]>([]);
  const [search, setSearch] = useState('');
  const [trackerRecords, setTrackerRecords] = useState<Record<string, TrackerRecord>>({});
  const [uploadingKey, setUploadingKey] = useState('');
  const [pendingSingle, setPendingSingle] = useState<Record<string, File | null>>({});
  const [pendingMulti, setPendingMulti] = useState<Record<string, File[]>>({});

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kaiser-members');
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Load failed (HTTP ${res.status})`));
      const next = (Array.isArray(data?.members) ? data.members : [])
        .filter((m: any) => String(m?.Kaiser_Status || '').trim().toLowerCase() === 'rn visit needed')
        .map((m: any) => ({
          id: String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim(),
          memberName: String(m?.memberName || '').trim() || 'Member',
          memberMrn: String(m?.memberMrn || m?.MCP_CIN || '').trim(),
          kaiserStatus: String(m?.Kaiser_Status || '').trim(),
          alftAssigned: String(m?.ALFT_Assigned || '').trim(),
          ispCurrentLocation: String(m?.ISP_Current_Location || '').trim(),
          ispContactPhone: String(m?.ISP_Contact_Phone || '').trim(),
          ispContactEmail: String(m?.ISP_Contact_Email || '').trim(),
          ispContactConfirmDate: String(m?.ISP_Contact_Confirm_Field || '').trim(),
        }))
        .filter((m: KaiserAlftMember) => Boolean(m.id))
        .sort((a: KaiserAlftMember, b: KaiserAlftMember) => a.memberName.localeCompare(b.memberName));
      setMembers(next);
    } catch (e: any) {
      setMembers([]);
      toast({ title: 'Could not load members', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadMembers();
  }, [isAdmin, loadMembers]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const unsub = onSnapshot(collection(firestore, 'alft_member_tracker'), (snap) => {
      const next: Record<string, TrackerRecord> = {};
      snap.docs.forEach((d) => {
        const row = (d.data() || {}) as any;
        const memberId = String(row?.memberId || d.id || '').trim();
        if (!memberId) return;
        next[memberId] = { memberId, ...(row as any) };
      });
      setTrackerRecords(next);
    });
    return () => unsub();
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    return members.filter((m) => !q || m.memberName.toLowerCase().includes(q) || m.memberMrn.toLowerCase().includes(q) || m.alftAssigned.toLowerCase().includes(q));
  }, [members, search]);

  const syncFromCaspio = useCallback(async () => {
    if (!auth?.currentUser) return;
    setSyncing(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'full' }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Sync failed (HTTP ${res.status})`));
      await loadMembers();
      toast({ title: 'Sync complete', description: 'ALFT assignment members refreshed from Caspio.' });
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message || 'Could not sync from Caspio.', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [auth, loadMembers, toast]);

  const uploadOne = useCallback(
    async (member: KaiserAlftMember, docType: LegacyDocType) => {
      if (!firestore || !storage || !user?.uid) return;
      const key = `${member.id}:${docType}`;
      const file = pendingSingle[key];
      if (!file) return;
      setUploadingKey(key);
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const path = `admin_uploads/alft-legacy/${member.id}/${docType}_${ts}_${sanitizePathSegment(file.name)}`;
        const task = uploadBytesResumable(ref(storage, path), file);
        const downloadURL = await new Promise<string>((resolve, reject) => {
          task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
        });
        await setDoc(
          doc(firestore, 'alft_member_tracker', member.id),
          {
            memberId: member.id,
            memberName: member.memberName,
            memberMrn: member.memberMrn || null,
            docs: {
              [docType]: {
                fileName: file.name,
                downloadURL,
                storagePath: path,
                uploadedAtIso: new Date().toISOString(),
                uploadedByName: String((user as any)?.displayName || '').trim() || null,
                uploadedByEmail: String((user as any)?.email || '').trim() || null,
              },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setPendingSingle((prev) => ({ ...prev, [key]: null }));
      } finally {
        setUploadingKey('');
      }
    },
    [firestore, pendingSingle, storage, user?.uid]
  );

  const uploadBatch = useCallback(
    async (member: KaiserAlftMember) => {
      if (!firestore || !storage || !user?.uid) return;
      const files = pendingMulti[member.id] || [];
      if (files.length === 0) return;
      const key = `${member.id}:multi`;
      setUploadingKey(key);
      try {
        const rows: any[] = [];
        const docsPatch: Record<string, any> = {};
        for (const file of files.slice(0, 15)) {
          const docType = inferLegacyDocType(file.name);
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const path = `admin_uploads/alft-legacy/${member.id}/${docType}_${ts}_${sanitizePathSegment(file.name)}`;
          const task = uploadBytesResumable(ref(storage, path), file);
          const downloadURL = await new Promise<string>((resolve, reject) => {
            task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
          });
          const row = {
            fileName: file.name,
            downloadURL,
            storagePath: path,
            uploadedAtIso: new Date().toISOString(),
            uploadedByName: String((user as any)?.displayName || '').trim() || null,
            uploadedByEmail: String((user as any)?.email || '').trim() || null,
            docType,
          };
          rows.push(row);
          if (docType !== 'other') docsPatch[docType] = row;
        }
        await setDoc(
          doc(firestore, 'alft_member_tracker', member.id),
          {
            memberId: member.id,
            memberName: member.memberName,
            memberMrn: member.memberMrn || null,
            docUploads: arrayUnion(...rows),
            docs: docsPatch,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setPendingMulti((prev) => ({ ...prev, [member.id]: [] }));
      } finally {
        setUploadingKey('');
      }
    },
    [firestore, pendingMulti, storage, user?.uid]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>ALFT Assignment Queue</CardTitle>
              <CardDescription>
                Use this page for Kaiser `RN Visit Needed` assignment, ISP contact freshness checks, and legacy ALFT document collection.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/admin/alft-tracker">Open ALFT Workflow Intake</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-auto">
          <div className="flex gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member / MRN / assigned..." />
            <Button variant="outline" onClick={() => void syncFromCaspio()} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync from Caspio
            </Button>
            <Badge variant="secondary">{filtered.length} member(s)</Badge>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading members...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>ALFT assigned</TableHead>
                  <TableHead>ISP contact details</TableHead>
                  <TableHead>Legacy docs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const tracker = trackerRecords[m.id];
                  const fresh = isWithinPastDays(m.ispContactConfirmDate, 3);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{m.memberName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{m.memberMrn || 'No MRN'}</div>
                      </TableCell>
                      <TableCell>{m.alftAssigned || 'Unassigned'}</TableCell>
                      <TableCell className="min-w-[320px] space-y-1">
                        {m.ispContactConfirmDate ? (
                          <Badge className={fresh ? 'bg-green-600 text-white hover:bg-green-600' : 'bg-red-600 text-white hover:bg-red-600'}>
                            {fresh ? 'ISP contact confirm <= 3 days' : 'ISP contact confirm > 3 days'}
                          </Badge>
                        ) : (
                          <Badge variant="outline">ISP contact confirm missing</Badge>
                        )}
                        <div className="text-xs text-muted-foreground">Location: {m.ispCurrentLocation || '—'}</div>
                        <div className="text-xs text-muted-foreground">Phone: {m.ispContactPhone || '—'}</div>
                        <div className="text-xs text-muted-foreground">Email: {m.ispContactEmail || '—'}</div>
                        <div className="text-xs text-muted-foreground">Confirm date: {m.ispContactConfirmDate || '—'}</div>
                      </TableCell>
                      <TableCell className="min-w-[360px]">
                        <div className="space-y-3">
                          <div className="rounded border p-2 space-y-2 bg-muted/20">
                            <div className="text-xs font-semibold">Upload multiple docs (batch)</div>
                            <Input type="file" multiple onChange={(e) => setPendingMulti((p) => ({ ...p, [m.id]: Array.from(e.target.files || []) }))} />
                            <Button size="sm" variant="outline" onClick={() => void uploadBatch(m)} disabled={uploadingKey === `${m.id}:multi`}>
                              {uploadingKey === `${m.id}:multi` ? 'Uploading batch...' : `Upload ${pendingMulti[m.id]?.length || 0} selected`}
                            </Button>
                            {(tracker?.docUploads || []).slice(-5).reverse().map((f, idx) => (
                              <a key={`${f.downloadURL}-${idx}`} className="text-xs underline text-blue-700 block truncate" href={f.downloadURL} target="_blank" rel="noreferrer">
                                {f.fileName} {f.docType ? `(${f.docType})` : ''}
                              </a>
                            ))}
                          </div>
                          {LEGACY_DOC_OPTIONS.map((opt) => {
                            const key = `${m.id}:${opt.key}`;
                            const row = tracker?.docs?.[opt.key];
                            return (
                              <div key={opt.key} className="rounded border p-2 space-y-2">
                                <div className="text-xs font-semibold">{opt.label}</div>
                                {row?.downloadURL ? (
                                  <a className="text-xs underline text-blue-700 block truncate" href={row.downloadURL} target="_blank" rel="noreferrer">
                                    {row.fileName || `Open ${opt.label}`}
                                  </a>
                                ) : (
                                  <div className="text-xs text-muted-foreground">No file uploaded yet</div>
                                )}
                                <Input type="file" onChange={(e) => setPendingSingle((p) => ({ ...p, [key]: e.target.files?.[0] || null }))} />
                                <Button size="sm" onClick={() => void uploadOne(m, opt.key)} disabled={uploadingKey === key}>
                                  {uploadingKey === key ? 'Uploading...' : `Upload ${opt.label}`}
                                </Button>
                              </div>
                            );
                          })}
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
    </div>
  );
}

