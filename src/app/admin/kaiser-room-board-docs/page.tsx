'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { collection, collectionGroup, getDocs, limit, query } from 'firebase/firestore';
import { Download, ExternalLink, RefreshCw, Search } from 'lucide-react';

type RoomBoardDocRow = {
  key: string;
  applicationId: string;
  applicationUserId: string | null;
  memberName: string;
  memberMrn: string;
  healthPlan: string;
  formName: string;
  fileName: string;
  downloadURL: string;
  completedMs: number;
};

const clean = (value: unknown) => String(value ?? '').trim();

const toMs = (value: unknown): number => {
  if (!value) return 0;
  try {
    if (typeof (value as any)?.toMillis === 'function') return (value as any).toMillis();
    if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime();
    const parsed = new Date(String(value)).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
};

const isKaiserPlan = (plan: unknown) => clean(plan).toLowerCase().includes('kaiser');

const isRoomBoardForm = (name: unknown) => {
  const n = clean(name).toLowerCase();
  return n.includes('room and board') || n.includes('room & board') || n.includes('r&b');
};

export default function KaiserRoomBoardDocsPage() {
  const { isAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();

  const [rows, setRows] = useState<RoomBoardDocRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<number>(0);

  const loadRows = useCallback(async () => {
    if (!firestore) return;
    setLoadingRows(true);
    setLoadError('');
    try {
      const [userAppsSnap, adminAppsSnap] = await Promise.all([
        getDocs(query(collectionGroup(firestore, 'applications'), limit(5000))),
        getDocs(query(collection(firestore, 'applications'), limit(5000))),
      ]);

      const nextRows: RoomBoardDocRow[] = [];

      userAppsSnap.forEach((docSnap) => {
        const app = docSnap.data() as any;
        if (!isKaiserPlan(app?.healthPlan)) return;
        const ownerUid = clean(docSnap.ref?.parent?.parent?.id) || null;
        const forms = Array.isArray(app?.forms) ? app.forms : [];
        forms.forEach((form: any) => {
          const isCompleted = clean(form?.status).toLowerCase() === 'completed';
          if (!isCompleted || !isRoomBoardForm(form?.name)) return;
          const downloadURL = clean(form?.downloadURL);
          const fileName = clean(form?.fileName);
          if (!downloadURL || !fileName) return;
          nextRows.push({
            key: `user:${ownerUid || 'unknown'}:${docSnap.id}:${fileName}`,
            applicationId: clean(docSnap.id),
            applicationUserId: ownerUid,
            memberName: `${clean(app?.memberFirstName)} ${clean(app?.memberLastName)}`.trim() || 'Unknown Member',
            memberMrn: clean(app?.memberMrn),
            healthPlan: clean(app?.healthPlan) || 'Kaiser',
            formName: clean(form?.name) || 'Room and Board Commitment',
            fileName,
            downloadURL,
            completedMs: toMs(form?.dateCompleted || app?.lastUpdated || app?.createdAt),
          });
        });
      });

      adminAppsSnap.forEach((docSnap) => {
        const app = docSnap.data() as any;
        if (!isKaiserPlan(app?.healthPlan)) return;
        const forms = Array.isArray(app?.forms) ? app.forms : [];
        forms.forEach((form: any) => {
          const isCompleted = clean(form?.status).toLowerCase() === 'completed';
          if (!isCompleted || !isRoomBoardForm(form?.name)) return;
          const downloadURL = clean(form?.downloadURL);
          const fileName = clean(form?.fileName);
          if (!downloadURL || !fileName) return;
          nextRows.push({
            key: `admin:${docSnap.id}:${fileName}`,
            applicationId: clean(docSnap.id),
            applicationUserId: null,
            memberName: `${clean(app?.memberFirstName)} ${clean(app?.memberLastName)}`.trim() || 'Unknown Member',
            memberMrn: clean(app?.memberMrn),
            healthPlan: clean(app?.healthPlan) || 'Kaiser',
            formName: clean(form?.name) || 'Room and Board Commitment',
            fileName,
            downloadURL,
            completedMs: toMs(form?.dateCompleted || app?.lastUpdated || app?.createdAt),
          });
        });
      });

      nextRows.sort((a, b) => b.completedMs - a.completedMs);
      setRows(nextRows);
      setLastLoadedAt(Date.now());
    } catch (error: any) {
      setRows([]);
      setLoadError(error?.message || 'Failed to load Kaiser Room & Board documents.');
    } finally {
      setLoadingRows(false);
    }
  }, [firestore]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    void loadRows();
  }, [firestore, isAdmin, loadRows]);

  const filteredRows = useMemo(() => {
    const needle = clean(search).toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = [
        row.memberName,
        row.memberMrn,
        row.fileName,
        row.formName,
        row.applicationId,
        row.healthPlan,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, search]);

  const uniqueMembersCount = useMemo(() => {
    const members = new Set(filteredRows.map((r) => `${r.memberName.toLowerCase()}|${r.memberMrn.toLowerCase()}`));
    return members.size;
  }, [filteredRows]);

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
            <CardDescription>You need admin permissions to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kaiser Room &amp; Board Signed Docs</CardTitle>
          <CardDescription>
            Search all completed Kaiser Room &amp; Board uploads for easy lookup, download, and quick jump to the member application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Search member, MRN, file name, app ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center text-sm text-muted-foreground">
              <Search className="h-4 w-4 mr-2" />
              {filteredRows.length} document{filteredRows.length === 1 ? '' : 's'} • {uniqueMembersCount} member
              {uniqueMembersCount === 1 ? '' : 's'}
            </div>
            <div className="flex md:justify-end">
              <Button variant="outline" onClick={() => void loadRows()} disabled={loadingRows} className="w-full md:w-auto">
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingRows ? 'animate-spin' : ''}`} />
                {loadingRows ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Last refreshed:{' '}
            {lastLoadedAt
              ? new Date(lastLoadedAt).toLocaleString()
              : '—'}
          </div>

          {loadError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
          ) : null}

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>MRN</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      {loadingRows ? 'Loading documents…' : 'No Kaiser Room & Board signed uploads found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const appHref = row.applicationUserId
                      ? `/admin/applications/${encodeURIComponent(row.applicationId)}?userId=${encodeURIComponent(row.applicationUserId)}`
                      : `/admin/applications/${encodeURIComponent(row.applicationId)}`;
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{row.memberName}</span>
                            <Badge variant="secondary">Kaiser</Badge>
                          </div>
                        </TableCell>
                        <TableCell>{row.memberMrn || '—'}</TableCell>
                        <TableCell className="max-w-[280px] truncate" title={row.fileName}>
                          {row.fileName}
                        </TableCell>
                        <TableCell>{row.completedMs ? new Date(row.completedMs).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono">{row.applicationId}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button asChild size="sm" variant="outline">
                              <a href={row.downloadURL} target="_blank" rel="noreferrer">
                                <Download className="h-4 w-4 mr-1" />
                                Download
                              </a>
                            </Button>
                            <Button asChild size="sm">
                              <Link href={appHref}>
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Open Application
                              </Link>
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
    </div>
  );
}
