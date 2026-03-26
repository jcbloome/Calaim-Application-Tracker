'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { collectionGroup, getDocs, limit, query, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Users } from 'lucide-react';

type AssignmentRow = {
  applicationId: string;
  ownerUid: string | null;
  memberName: string;
  memberIdentifier: string;
  healthPlan: string;
  assignedStaffName: string;
  assignedStaffId: string;
  assignedDateMs: number;
  assignedDateLabel: string;
  applicationStatus: string;
};

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Timestamp) return value.toMillis();
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

const toLabel = (ms: number) => {
  if (!ms) return 'Unknown';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Unknown';
  }
};

export default function AssignmentTrackerPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();
  const router = useRouter();

  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isLoading, isSuperAdmin, router]);

  const loadAssignments = async () => {
    if (!firestore) return;
    setLoadingRows(true);
    try {
      const snap = await getDocs(
        query(collectionGroup(firestore, 'applications'), limit(5000))
      );
      const next: AssignmentRow[] = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as any;
          const assignedStaffName = String(data?.assignedStaffName || '').trim();
          const assignedStaffId = String(data?.assignedStaffId || '').trim();
          if (!assignedStaffName && !assignedStaffId) return null;

          const assignedDateMs = toMs(data?.assignedDate || data?.assignmentDate || data?.lastUpdated);
          const memberFirst = String(data?.memberFirstName || '').trim();
          const memberLast = String(data?.memberLastName || '').trim();
          const memberName = `${memberFirst} ${memberLast}`.trim() || 'Unknown member';
          const memberIdentifier =
            String(data?.client_ID2 || data?.memberMrn || data?.memberMediCalNum || '').trim() || 'N/A';
          const healthPlan = String(data?.healthPlan || '').trim() || 'Unknown';
          const applicationStatus = String(data?.status || '').trim() || 'Unknown';
          const ownerUid = docSnap.ref?.parent?.parent?.id || null;

          return {
            applicationId: docSnap.id,
            ownerUid,
            memberName,
            memberIdentifier,
            healthPlan,
            assignedStaffName: assignedStaffName || assignedStaffId || 'Unassigned',
            assignedStaffId: assignedStaffId || '',
            assignedDateMs,
            assignedDateLabel: toLabel(assignedDateMs),
            applicationStatus,
          } as AssignmentRow;
        })
        .filter(Boolean) as AssignmentRow[];

      next.sort((a, b) => b.assignedDateMs - a.assignedDateMs);
      setRows(next);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (!firestore || !isSuperAdmin) return;
    void loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, isSuperAdmin]);

  const uniqueStaff = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.assignedStaffName))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (staffFilter !== 'all' && r.assignedStaffName !== staffFilter) return false;
      if (!q) return true;
      return (
        r.memberName.toLowerCase().includes(q) ||
        r.memberIdentifier.toLowerCase().includes(q) ||
        r.applicationId.toLowerCase().includes(q)
      );
    });
    out.sort((a, b) =>
      sortOrder === 'newest' ? b.assignedDateMs - a.assignedDateMs : a.assignedDateMs - b.assignedDateMs
    );
    return out;
  }, [rows, memberQuery, staffFilter, sortOrder]);

  const openApplication = (row: AssignmentRow) => {
    const href = row.ownerUid
      ? `/admin/applications/${row.applicationId}?userId=${encodeURIComponent(row.ownerUid)}`
      : `/admin/applications/${row.applicationId}`;
    router.push(href);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Assignment Tracker</h1>
          <p className="text-muted-foreground mt-2">
            All staff assignments generated through the application, with filters by staff/member and date sorting.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadAssignments()} disabled={loadingRows}>
          {loadingRows ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Assignments</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{rows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Staff Represented</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            {uniqueStaff.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filtered Results</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{filteredRows.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by assigned staff or search by member/application.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Search member name, member ID, or application ID..."
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
          />
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {uniqueStaff.map((staff) => (
                <SelectItem key={staff} value={staff}>
                  {staff}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v: 'newest' | 'oldest') => setSortOrder(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Assigned date: newest first</SelectItem>
              <SelectItem value="oldest">Assigned date: oldest first</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assigned Date</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No assignments found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={`${row.applicationId}-${row.ownerUid || 'admin'}`}>
                      <TableCell>{row.assignedDateLabel}</TableCell>
                      <TableCell>{row.assignedStaffName}</TableCell>
                      <TableCell className="font-medium">{row.memberName}</TableCell>
                      <TableCell>{row.memberIdentifier}</TableCell>
                      <TableCell>{row.healthPlan}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.applicationStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openApplication(row)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
