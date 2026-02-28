'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type StandaloneUpload = {
  id: string;
  status: string;
  createdAt?: any;
  documentType: string;
  files: Array<{ fileName: string; downloadURL: string; storagePath?: string }>;
  uploaderName?: string;
  uploaderEmail?: string;
  memberName: string;
  memberBirthdate: string;
  healthPlan?: string;
  medicalRecordNumber?: string | null;
  mediCalNumber?: string | null;
  kaiserMrn?: string | null;
};

const toLabel = (value: any) => String(value ?? '').trim();

type MemberSearchResult = {
  clientId2: string;
  firstName: string;
  lastName: string;
  healthPlan: string;
  status: string;
};

type ApplicationCandidate = {
  applicationId: string;
  userId: string | null;
  memberName: string;
  memberMrn: string;
  healthPlan?: string;
  status?: string;
  lastUpdatedMs?: number;
  source: 'admin' | 'user';
};

export default function StandaloneUploadsPage() {
  const { isAdmin, isLoading, user } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [rows, setRows] = useState<StandaloneUpload[]>([]);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<'all' | 'kaiser' | 'health-net' | 'other'>('all');
  const [docType, setDocType] = useState<'all' | 'cs' | 'docs'>('all');
  const [processingId, setProcessingId] = useState<string>('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignRow, setAssignRow] = useState<StandaloneUpload | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberSearchResult[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [selectedMemberMrn, setSelectedMemberMrn] = useState<string>('');
  const [appsLoading, setAppsLoading] = useState(false);
  const [apps, setApps] = useState<ApplicationCandidate[]>([]);
  const [selectedAppKey, setSelectedAppKey] = useState<string>('');
  const [assignedOpenUrl, setAssignedOpenUrl] = useState<string>('');

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const qy = query(collection(firestore, 'standalone_upload_submissions'), where('status', '==', 'pending'));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
        setRows(
          next.map((r) => ({
            id: toLabel(r.id),
            status: toLabel(r.status || 'pending'),
            createdAt: r.createdAt,
            documentType: toLabel(r.documentType),
            files: Array.isArray(r.files) ? r.files : [],
            uploaderName: toLabel(r.uploaderName) || undefined,
            uploaderEmail: toLabel(r.uploaderEmail) || undefined,
            memberName: toLabel(r.memberName),
            memberBirthdate: toLabel(r.memberBirthdate),
            healthPlan: toLabel(r.healthPlan) || undefined,
            medicalRecordNumber: r.medicalRecordNumber ?? r.kaiserMrn ?? r.mediCalNumber ?? null,
            mediCalNumber: r.mediCalNumber ?? null,
            kaiserMrn: r.kaiserMrn ?? null,
          }))
        );
      },
      () => setRows([])
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const planLower = toLabel(r.healthPlan).toLowerCase();
      const matchesPlan =
        plan === 'all' ||
        (plan === 'kaiser' && planLower.includes('kaiser')) ||
        (plan === 'health-net' && planLower.includes('health net')) ||
        (plan === 'other' && !planLower.includes('kaiser') && !planLower.includes('health net'));

      const dtLower = toLabel(r.documentType).toLowerCase();
      const isCs = dtLower.includes('cs') && dtLower.includes('summary');
      const matchesDocType = docType === 'all' || (docType === 'cs' ? isCs : !isCs);

      const matchesSearch =
        !s ||
        toLabel(r.memberName).toLowerCase().includes(s) ||
        toLabel(r.documentType).toLowerCase().includes(s) ||
        toLabel(r.uploaderName).toLowerCase().includes(s) ||
        toLabel(r.uploaderEmail).toLowerCase().includes(s) ||
        toLabel(r.medicalRecordNumber).toLowerCase().includes(s) ||
        toLabel(r.mediCalNumber).toLowerCase().includes(s) ||
        toLabel(r.kaiserMrn).toLowerCase().includes(s);

      return matchesPlan && matchesDocType && matchesSearch;
    });
  }, [rows, search, plan, docType]);

  const markProcessed = async (id: string) => {
    if (!firestore) return;
    if (!id) return;
    if (processingId) return;
    setProcessingId(id);
    try {
      await updateDoc(doc(firestore, 'standalone_upload_submissions', id), {
        status: 'processed',
        processedAt: new Date(),
      });
      toast({ title: 'Marked processed', description: 'Removed from pending intake.' });
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e?.message || 'Could not mark processed', variant: 'destructive' });
    } finally {
      setProcessingId('');
    }
  };

  const openAssign = useCallback((row: StandaloneUpload) => {
    setAssignRow(row);
    setAssignOpen(true);
    setAssigning(false);
    setAssignedOpenUrl('');
    setMemberSearch(row?.memberName || '');
    setMemberResults([]);
    setSelectedMember(null);
    setSelectedMemberMrn('');
    setApps([]);
    setSelectedAppKey('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!assignOpen) return;
      const q = memberSearch.trim();
      if (!q) {
        setMemberResults([]);
        return;
      }
      // `/api/members` supports last-name prefix search.
      const lastNamePrefix = q.split(/\s+/).filter(Boolean).slice(-1)[0] || q;
      if (lastNamePrefix.length < 2) {
        setMemberResults([]);
        return;
      }

      setMemberLoading(true);
      try {
        const url = `/api/members?search=${encodeURIComponent(lastNamePrefix)}&limit=25&offset=0`;
        const res = await fetch(url, { method: 'GET' });
        const data = (await res.json().catch(() => ({}))) as any;
        const members = Array.isArray(data?.members) ? data.members : [];
        const results: MemberSearchResult[] = members
          .map((m: any) => ({
            clientId2: toLabel(m?.clientId2),
            firstName: toLabel(m?.firstName),
            lastName: toLabel(m?.lastName),
            healthPlan: toLabel(m?.healthPlan),
            status: toLabel(m?.status),
          }))
          .filter((m: any) => Boolean(m.clientId2 && (m.firstName || m.lastName)));

        if (!cancelled) setMemberResults(results);
      } catch {
        if (!cancelled) setMemberResults([]);
      } finally {
        if (!cancelled) setMemberLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [assignOpen, memberSearch]);

  const loadApplicationsForMember = useCallback(
    async (member: MemberSearchResult) => {
      if (!firestore) return;
      setApps([]);
      setSelectedAppKey('');
      setAssignedOpenUrl('');
      setSelectedMember(member);

      setAppsLoading(true);
      try {
        const memberSnap = await getDoc(doc(firestore, 'caspio_members_cache', member.clientId2));
        const cache = memberSnap.exists() ? (memberSnap.data() as any) : null;
        const mrn = toLabel(cache?.MRN || cache?.memberMrn || cache?.Member_MRN || '');
        setSelectedMemberMrn(mrn);

        if (!mrn) {
          setApps([]);
          return;
        }

        const normalizedMrn = mrn.trim();
        const [userAppsSnap, adminAppsSnap] = await Promise.all([
          getDocs(query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', normalizedMrn), limit(25))),
          getDocs(query(collection(firestore, 'applications'), where('memberMrn', '==', normalizedMrn), limit(25))),
        ]);

        const toCandidate = (d: any, source: 'user' | 'admin'): ApplicationCandidate => {
          const data = d.data() as any;
          const userId = source === 'user' ? (d.ref?.parent?.parent?.id ? String(d.ref.parent.parent.id) : null) : null;
          const memberName = `${toLabel(data?.memberFirstName)} ${toLabel(data?.memberLastName)}`.trim() || 'Unknown Member';
          const lastUpdatedMs =
            data?.lastUpdated?.toMillis?.() ||
            data?.lastUpdated?.toDate?.()?.getTime?.() ||
            data?.updatedAt?.toMillis?.() ||
            0;
          return {
            applicationId: String(d.id),
            userId,
            memberName,
            memberMrn: toLabel(data?.memberMrn),
            healthPlan: toLabel(data?.healthPlan) || undefined,
            status: toLabel(data?.status) || undefined,
            lastUpdatedMs: Number(lastUpdatedMs) || 0,
            source,
          };
        };

        const combined: ApplicationCandidate[] = [
          ...userAppsSnap.docs.map((d) => toCandidate(d, 'user')),
          ...adminAppsSnap.docs.map((d) => toCandidate(d, 'admin')),
        ];

        const dedup = new Map<string, ApplicationCandidate>();
        combined.forEach((a) => {
          const key = `${a.source}:${a.userId || 'admin'}:${a.applicationId}`;
          dedup.set(key, a);
        });
        const list = Array.from(dedup.values()).sort((a, b) => (b.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0));
        setApps(list);
      } catch {
        setApps([]);
      } finally {
        setAppsLoading(false);
      }
    },
    [firestore]
  );

  const assignToApplication = useCallback(
    async (mode: 'existing' | 'new') => {
      if (!assignRow) return;
      if (!user) {
        toast({ title: 'Not signed in', description: 'Please sign in again.', variant: 'destructive' });
        return;
      }
      if (assigning) return;

      const selectedApp =
        mode === 'existing' ? apps.find((a) => `${a.source}:${a.userId || 'admin'}:${a.applicationId}` === selectedAppKey) : null;

      if (mode === 'existing' && !selectedApp) {
        toast({ title: 'Select an application', description: 'Pick an existing application to assign into.', variant: 'destructive' });
        return;
      }

      setAssigning(true);
      setAssignedOpenUrl('');
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/admin/standalone-uploads/assign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            uploadId: assignRow.id,
            mode,
            target:
              mode === 'existing'
                ? {
                    applicationId: selectedApp?.applicationId,
                    userId: selectedApp?.userId,
                  }
                : {},
            member: selectedMember
              ? {
                  clientId2: selectedMember.clientId2,
                  mrn: selectedMemberMrn || undefined,
                  firstName: selectedMember.firstName,
                  lastName: selectedMember.lastName,
                  healthPlan: selectedMember.healthPlan,
                }
              : {},
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(toLabel(data?.error) || 'Failed to assign upload');
        }
        setAssignedOpenUrl(toLabel(data?.openUrl));
        toast({ title: 'Assigned', description: 'Upload was linked into the application and removed from pending intake.' });
      } catch (e: any) {
        toast({ title: 'Assignment failed', description: e?.message || 'Could not assign upload', variant: 'destructive' });
      } finally {
        setAssigning(false);
      }
    },
    [assignRow, user, assigning, apps, selectedAppKey, selectedMember, selectedMemberMrn, toast]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need admin permissions to view standalone uploads.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Standalone Upload Intake</CardTitle>
          <CardDescription>
            Documents uploaded outside a specific application (often CS Summary). Assign them into an existing or new CS Summary application so staff can process them in the portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Search member, uploader, medical record #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={plan} onValueChange={(v) => setPlan(v as any)}>
              <SelectTrigger><SelectValue placeholder="All plans" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="kaiser">Kaiser</SelectItem>
                <SelectItem value="health-net">Health Net</SelectItem>
                <SelectItem value="other">Other/Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={docType} onValueChange={(v) => setDocType(v as any)}>
              <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="cs">CS Summary</SelectItem>
                <SelectItem value="docs">Other docs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Medical record #</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Uploader</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No pending uploads.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered
                    .sort((a, b) => {
                      const am = a.createdAt?.toMillis?.() || a.createdAt?.toDate?.()?.getTime?.() || 0;
                      const bm = b.createdAt?.toMillis?.() || b.createdAt?.toDate?.()?.getTime?.() || 0;
                      return bm - am;
                    })
                    .map((r) => {
                      const dtLower = toLabel(r.documentType).toLowerCase();
                      const isCs = dtLower.includes('cs') && dtLower.includes('summary');
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{r.memberName}</span>
                              {isCs ? <Badge variant="secondary">CS</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{r.memberBirthdate}</TableCell>
                          <TableCell>{r.healthPlan || 'Other/Unknown'}</TableCell>
                          <TableCell className="text-xs">
                            <div>{r.medicalRecordNumber || '—'}</div>
                          </TableCell>
                          <TableCell>{r.documentType}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col gap-1">
                              {(r.files || []).slice(0, 5).map((f) => (
                                <a key={f.downloadURL} className="underline text-blue-600" href={f.downloadURL} target="_blank" rel="noreferrer">
                                  {f.fileName}
                                </a>
                              ))}
                              {(r.files || []).length > 5 ? (
                                <div className="text-muted-foreground">+{(r.files || []).length - 5} more</div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{r.uploaderName || 'User'}</div>
                            {r.uploaderEmail ? <div className="text-muted-foreground">{r.uploaderEmail}</div> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" disabled={processingId === r.id} onClick={() => openAssign(r)}>
                                Assign
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={processingId === r.id}
                                onClick={() => void markProcessed(r.id)}
                              >
                                {processingId === r.id ? 'Saving…' : 'Mark processed'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign upload to CS Summary application</DialogTitle>
            <DialogDescription>
              Link this standalone upload into an application so staff can work it from the portal instead of downloading from intake.
            </DialogDescription>
          </DialogHeader>

          {assignRow ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">{assignRow.memberName}</div>
                <div className="text-xs text-muted-foreground">
                  DOB: {assignRow.memberBirthdate || '—'} • Plan: {assignRow.healthPlan || 'Other/Unknown'} • Doc: {assignRow.documentType}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">1) Lookup member (last name prefix)</div>
                <Input
                  placeholder="Type last name (e.g., Garcia)"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />

                <div className="rounded-lg border max-h-48 overflow-auto">
                  {memberLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching…</div>
                  ) : memberResults.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No results.</div>
                  ) : (
                    <div className="divide-y">
                      {memberResults.map((m) => {
                        const isSelected = selectedMember?.clientId2 === m.clientId2;
                        return (
                          <button
                            key={m.clientId2}
                            type="button"
                            className={`w-full text-left p-3 hover:bg-muted ${isSelected ? 'bg-muted' : ''}`}
                            onClick={() => void loadApplicationsForMember(m)}
                          >
                            <div className="text-sm font-medium">
                              {m.firstName} {m.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ID: {m.clientId2} • {m.healthPlan || 'Unknown'} • {m.status || '—'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  MRN: <span className="font-medium text-foreground">{selectedMemberMrn || '—'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">2) Assign into an existing application (matched by MRN)</div>
                <div className="rounded-lg border max-h-48 overflow-auto">
                  {appsLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Loading applications…</div>
                  ) : apps.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No applications found for this MRN.</div>
                  ) : (
                    <div className="divide-y">
                      {apps.map((a) => {
                        const key = `${a.source}:${a.userId || 'admin'}:${a.applicationId}`;
                        const isSelected = selectedAppKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`w-full text-left p-3 hover:bg-muted ${isSelected ? 'bg-muted' : ''}`}
                            onClick={() => setSelectedAppKey(key)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium truncate">{a.memberName}</div>
                              <Badge variant="secondary">{a.source === 'admin' ? 'Admin' : 'User'}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              App: {a.applicationId} • {a.healthPlan || '—'} • {a.status || '—'}
                              {a.userId ? ` • userId: ${a.userId}` : ''}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {assignedOpenUrl ? (
                <div className="rounded-lg border p-3 bg-green-50 border-green-200">
                  <div className="text-sm font-medium text-green-900">Assigned successfully</div>
                  <div className="text-xs text-green-900/80">
                    Open the application:
                    {' '}
                    <a className="underline" href={assignedOpenUrl}>
                      {assignedOpenUrl}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assigning}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={() => void assignToApplication('new')}
              disabled={assigning}
              title="Creates an admin CS Summary application (if needed) and links this upload into it."
            >
              {assigning ? 'Assigning…' : 'Create new CS Summary app & assign'}
            </Button>
            <Button onClick={() => void assignToApplication('existing')} disabled={assigning || !selectedAppKey}>
              {assigning ? 'Assigning…' : 'Assign to selected app'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

