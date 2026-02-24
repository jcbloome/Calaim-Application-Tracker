'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, onSnapshot, query, collection, where, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type StandaloneUpload = {
  id: string;
  status: string;
  createdAt?: any;
  documentType: string;
  files: Array<{ fileName: string; downloadURL: string }>;
  uploaderName?: string;
  uploaderEmail?: string;
  memberName: string;
  memberBirthdate: string;
  healthPlan?: string;
  mediCalNumber?: string | null;
  kaiserMrn?: string | null;
};

const toLabel = (value: any) => String(value ?? '').trim();

export default function StandaloneUploadsPage() {
  const { isAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [rows, setRows] = useState<StandaloneUpload[]>([]);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<'all' | 'kaiser' | 'health-net' | 'other'>('all');
  const [docType, setDocType] = useState<'all' | 'cs' | 'docs'>('all');
  const [processingId, setProcessingId] = useState<string>('');

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
            Documents uploaded outside a specific application (often CS Summary). Use this list to download and re-enter into a new application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Search member, uploader, MRN, Medi-Cal…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <TableHead>IDs</TableHead>
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
                            <div>Medi-Cal: {r.mediCalNumber || '—'}</div>
                            <div>MRN: {r.kaiserMrn || '—'}</div>
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
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={processingId === r.id}
                              onClick={() => void markProcessed(r.id)}
                            >
                              {processingId === r.id ? 'Saving…' : 'Mark processed'}
                            </Button>
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
    </div>
  );
}

