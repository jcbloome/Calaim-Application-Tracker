'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

// ── Types ──────────────────────────────────────────────────────────────────────

type KaiserMember = {
  id: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  birthDate: string;
  kaiserStatus: string;
  alftAssigned: string;
  ispCurrentLocation: string;
  ispContactPhone: string;
  ispContactEmail: string;
  ispContactConfirmDate: string;
  socialWorkerAssigned: string;
};

type SocialWorker = {
  uid: string;
  email: string;
  displayName: string;
  isActive: boolean;
};

type AlftAssignment = {
  memberId: string;
  memberName: string;
  assignedSwEmail: string;
  assignedSwName: string;
  status:
    | 'assigned'
    | 'in_progress'
    | 'submitted'
    | 'completed'
    | 'sw_form_in_progress'
    | 'awaiting_manager_review'
    | 'returned_to_sw_for_changes'
    | 'awaiting_rn_final_review'
    | 'rn_finalized_ready_for_ils';
  assignedAt: any;
  assignedByEmail: string;
  assignedByName: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  return Math.floor((a - b) / 86400000) <= days;
};

const formatDobLabel = (value: string): string => {
  const dt = parseFlexibleDate(value);
  if (!dt) return '';
  try {
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

const normalizePersonName = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s,]/g, ' ')
    .replace(/\s+/g, ' ');

const nameKeys = (raw: string): string[] => {
  const normalized = normalizePersonName(raw);
  if (!normalized) return [];
  const keys = new Set<string>([normalized]);
  const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    keys.add(`${parts[1]} ${parts[0]}`.trim());
  }
  const words = normalized.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const first = words[0];
    const last = words[words.length - 1];
    keys.add(`${first} ${last}`.trim());
    keys.add(`${last}, ${first}`.trim());
  }
  return Array.from(keys);
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  assigned: { label: 'Assigned', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  sw_form_in_progress: { label: 'SW filling ALFT form', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  awaiting_manager_review: { label: 'Awaiting ALFT manager review', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  returned_to_sw_for_changes: { label: 'Returned to SW for changes', color: 'bg-red-100 text-red-800 border-red-200' },
  awaiting_rn_final_review: { label: 'Awaiting RN final review/sign', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  rn_finalized_ready_for_ils: { label: 'RN finalized, ready for ILS', color: 'bg-green-100 text-green-800 border-green-200' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  submitted: { label: 'Submitted', color: 'bg-green-100 text-green-800 border-green-200' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-700 border-gray-200' },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminAlftAssignmentPage() {
  const { isAdmin, isLoading: adminLoading, user } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [socialWorkers, setSocialWorkers] = useState<SocialWorker[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AlftAssignment>>({});
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null); // memberId being saved
  const [pickedSw, setPickedSw] = useState<Record<string, string>>({}); // memberId → swEmail

  // ── Load Kaiser members (RN Visit Needed) ─────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kaiser-members', { cache: 'no-store' });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);

      const next: KaiserMember[] = (Array.isArray(data?.members) ? data.members : [])
        .filter((m: any) => String(m?.Kaiser_Status || '').trim().toLowerCase() === 'rn visit needed')
        .map((m: any) => ({
          id: String(m?.Client_ID2 || m?.id || '').trim(),
          memberName: String(m?.memberName || '').trim() || 'Member',
          memberFirstName: String(m?.memberFirstName || '').trim(),
          memberLastName: String(m?.memberLastName || '').trim(),
          memberMrn: String(m?.memberMrn || m?.MCP_CIN || '').trim(),
          birthDate: String(m?.Birth_Date || m?.birthDate || '').trim(),
          kaiserStatus: String(m?.Kaiser_Status || '').trim(),
          alftAssigned: String(m?.ALFT_Assigned || '').trim(),
          ispCurrentLocation: String(m?.ISP_Current_Location || '').trim(),
          ispContactPhone: String(m?.ISP_Contact_Phone || '').trim(),
          ispContactEmail: String(m?.ISP_Contact_Email || '').trim(),
          ispContactConfirmDate: String(m?.ISP_Contact_Confirm_Field || '').trim(),
          socialWorkerAssigned: String(m?.Social_Worker_Assigned || '').trim(),
        }))
        .filter((m: KaiserMember) => Boolean(m.id))
        .sort((a: KaiserMember, b: KaiserMember) => a.memberName.localeCompare(b.memberName));

      setMembers(next);
      setHasLoadedOnce(true);
    } catch (e: any) {
      toast({ title: 'Could not load members', description: e?.message || 'Retry.', variant: 'destructive' });
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ── Load social workers from Caspio ────────────────────────────────────────────

  const loadSocialWorkers = useCallback(async () => {
    try {
      const res = await fetch('/api/caspio-staff', { cache: 'no-store' });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      const list: SocialWorker[] = (Array.isArray(data?.staff) ? data.staff : [])
        .map((sw: any) => ({
          uid: String(sw?.sw_id || sw?.id || sw?.email || sw?.name || '').trim().toLowerCase(),
          email: String(sw?.email || '').trim().toLowerCase(),
          displayName: String(sw?.name || sw?.displayName || sw?.email || 'Social Worker').trim(),
          isActive: true,
        }))
        .filter((sw) => Boolean(sw.email))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      // Guard against duplicate emails to avoid duplicate Select keys/values.
      const dedupedByEmail = new Map<string, SocialWorker>();
      list.forEach((sw) => {
        const existing = dedupedByEmail.get(sw.email);
        if (!existing) {
          dedupedByEmail.set(sw.email, sw);
          return;
        }
        const existingLooksLikeEmail = existing.displayName.toLowerCase() === existing.email;
        const nextLooksLikeEmail = sw.displayName.toLowerCase() === sw.email;
        if (existingLooksLikeEmail && !nextLooksLikeEmail) {
          dedupedByEmail.set(sw.email, sw);
        }
      });
      setSocialWorkers(Array.from(dedupedByEmail.values()));
    } catch (e: any) {
      toast({
        title: 'Could not load Caspio social workers',
        description: e?.message || 'Try refreshing.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // ── Live-listen to alft_assignments ──────────────────────────────────────────

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const unsub = onSnapshot(collection(firestore, 'alft_assignments'), (snap) => {
      const next: Record<string, AlftAssignment> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as AlftAssignment;
        if (data.memberId) next[data.memberId] = data;
      });
      setAssignments(next);
    });
    return () => unsub();
  }, [firestore, isAdmin]);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      void loadSocialWorkers();
    }
  }, [adminLoading, isAdmin, loadSocialWorkers]);

  useEffect(() => {
    if (members.length === 0 || socialWorkers.length === 0) return;
    setPickedSw((prev) => {
      const next = { ...prev };
      let changed = false;
      members.forEach((member) => {
        if (next[member.id] || assignments[member.id]?.assignedSwEmail) return;
        const swRaw = String(member.socialWorkerAssigned || '').trim();
        if (!swRaw) return;
        const memberKeys = nameKeys(swRaw);
        if (memberKeys.length === 0) return;
        const match = socialWorkers.find((sw) => {
          const swKeys = nameKeys(sw.displayName);
          return swKeys.some((key) => memberKeys.includes(key));
        });
        if (match?.email) {
          next[member.id] = match.email;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [assignments, members, socialWorkers]);

  // ── Assign SW to member ───────────────────────────────────────────────────────

  const assignSw = useCallback(
    async (member: KaiserMember) => {
      const swEmail = pickedSw[member.id];
      if (!swEmail || !firestore || !auth?.currentUser) return;
      const sw = socialWorkers.find((s) => s.email === swEmail);
      if (!sw) return;

      setAssigning(member.id);
      try {
        const adminEmail = String((user as any)?.email || auth.currentUser.email || '').trim().toLowerCase();
        const adminName = String((user as any)?.displayName || adminEmail).trim();

        const assignment: AlftAssignment & Record<string, any> = {
          memberId: member.id,
          memberName: member.memberName,
          memberFirstName: member.memberFirstName,
          memberLastName: member.memberLastName,
          memberMrn: member.memberMrn,
          birthDate: member.birthDate,
          ispCurrentLocation: member.ispCurrentLocation,
          ispContactPhone: member.ispContactPhone,
          ispContactEmail: member.ispContactEmail,
          ispContactConfirmDate: member.ispContactConfirmDate,
          kaiserStatus: member.kaiserStatus,
          assignedSwEmail: sw.email,
          assignedSwName: sw.displayName,
          caspioSocialWorkerAssigned: member.socialWorkerAssigned,
          assignedByEmail: adminEmail,
          assignedByName: adminName,
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'sw_form_in_progress',
          workflowStage: 'sw_fill_form',
          workflowOrder: [
            'sw_fill_form',
            'manager_review',
            'sw_corrections_if_needed',
            'sw_signature',
            'rn_final_review_signature',
            'ready_for_ils',
          ],
        };

        await setDoc(doc(firestore, 'alft_assignments', member.id), assignment, { merge: true });

        toast({
          title: 'Assignment saved',
          description: `${member.memberName} assigned to ${sw.displayName}.`,
        });
      } catch (e: any) {
        toast({ title: 'Assignment failed', description: e?.message || 'Try again.', variant: 'destructive' });
      } finally {
        setAssigning(null);
      }
    },
    [auth, firestore, pickedSw, socialWorkers, toast, user]
  );

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (m) =>
        !q ||
        m.memberName.toLowerCase().includes(q) ||
        m.memberMrn.toLowerCase().includes(q) ||
        m.ispCurrentLocation.toLowerCase().includes(q) ||
        (assignments[m.id]?.assignedSwName || '').toLowerCase().includes(q)
    );
  }, [assignments, members, search]);

  const assignedCount = useMemo(() => members.filter((m) => Boolean(assignments[m.id])).length, [assignments, members]);
  const submittedCount = useMemo(
    () => members.filter((m) => ['submitted', 'completed'].includes(assignments[m.id]?.status || '')).length,
    [assignments, members]
  );

  // ── Auth guard ────────────────────────────────────────────────────────────────

  if (adminLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>You must be an admin to view this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                ALFT Assignment Queue
              </CardTitle>
              <CardDescription>
                Select Kaiser members from Caspio and start the ALFT workflow with their Caspio-assigned social worker.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/admin/alft-tracker">Open ALFT Workflow Intake →</Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, MRN, location, or SW…"
              className="w-60"
            />
            <Button variant="outline" size="sm" onClick={() => void loadMembers()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Load Caspio Members
            </Button>
            <div className="flex gap-2 ml-auto text-sm text-muted-foreground">
              <Badge variant="outline">{filtered.length} shown</Badge>
              <Badge variant="outline">{assignedCount} assigned</Badge>
              <Badge variant="outline" className="text-green-700 border-green-300">{submittedCount} submitted</Badge>
            </div>
          </div>

          {!hasLoadedOnce && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Click <strong>Load Caspio Members</strong> to view Kaiser members (RN Visit Needed) and their social worker assignment from Caspio.
              </AlertDescription>
            </Alert>
          )}

          {hasLoadedOnce && !loading && filtered.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No members found with Kaiser Status = "RN Visit Needed".
            </div>
          )}

          {hasLoadedOnce && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-52">Member</TableHead>
                    <TableHead>ISP Info</TableHead>
                    <TableHead className="w-56">Caspio SW → ALFT Assignment</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const assignment = assignments[m.id];
                    const fresh = isWithinPastDays(m.ispContactConfirmDate, 3);
                    const statusMeta = STATUS_LABELS[assignment?.status || ''] || null;
                    const currentSwEmail = assignment?.assignedSwEmail || '';
                    const dobLabel = formatDobLabel(m.birthDate);

                    return (
                      <TableRow key={m.id} className={assignment?.status === 'submitted' ? 'bg-green-50/50' : ''}>
                        {/* Member info */}
                        <TableCell>
                          <div className="font-medium text-sm">{m.memberName}</div>
                          {m.memberMrn && <div className="text-xs text-muted-foreground font-mono">MRN: {m.memberMrn}</div>}
                          {dobLabel && (
                            <div className="text-xs text-muted-foreground">
                              DOB: {dobLabel}
                            </div>
                          )}
                        </TableCell>

                        {/* ISP contact */}
                        <TableCell className="min-w-[260px]">
                          <div className="space-y-0.5 text-xs">
                            {m.ispCurrentLocation && (
                              <div className="font-medium text-sm truncate max-w-[240px]">{m.ispCurrentLocation}</div>
                            )}
                            {m.ispContactPhone && <div className="text-muted-foreground">📞 {m.ispContactPhone}</div>}
                            {m.ispContactEmail && <div className="text-muted-foreground truncate max-w-[240px]">✉ {m.ispContactEmail}</div>}
                            {m.ispContactConfirmDate ? (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  fresh
                                    ? 'text-green-700 border-green-300 bg-green-50'
                                    : 'text-red-700 border-red-300 bg-red-50'
                                }`}
                              >
                                Contact confirmed: {m.ispContactConfirmDate}
                                {fresh ? ' ✓' : ' — outdated'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">No contact confirm date</Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* SW assignment picker */}
                        <TableCell>
                          <div className="space-y-2">
                            <div className="text-[11px] text-muted-foreground">
                              Caspio SW: {m.socialWorkerAssigned || 'Not set'}
                            </div>
                            <Select
                              value={pickedSw[m.id] || currentSwEmail || ''}
                              onValueChange={(val) => setPickedSw((p) => ({ ...p, [m.id]: val }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select social worker…" />
                              </SelectTrigger>
                              <SelectContent>
                                {socialWorkers.map((sw) => (
                                  <SelectItem key={`${sw.uid}-${sw.email}`} value={sw.email} className="text-xs">
                                    {sw.displayName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant={currentSwEmail ? 'outline' : 'default'}
                              className="h-7 text-xs w-full"
                              disabled={
                                assigning === m.id ||
                                (!pickedSw[m.id] && !currentSwEmail) ||
                                (pickedSw[m.id] === currentSwEmail && Boolean(currentSwEmail))
                              }
                              onClick={() => void assignSw(m)}
                            >
                              {assigning === m.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <UserCheck className="h-3 w-3 mr-1" />
                              )}
                              {currentSwEmail ? 'Update assignment' : 'Start ALFT workflow'}
                            </Button>
                            {currentSwEmail && assignment?.assignedSwName && (
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                {assignment.assignedSwName}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {statusMeta ? (
                            <div className="space-y-1">
                              <Badge variant="outline" className={`text-[11px] ${statusMeta.color}`}>
                                {statusMeta.label}
                              </Badge>
                              {assignment?.assignedAt?.toDate && (
                                <div className="text-[10px] text-muted-foreground">
                                  {assignment.assignedAt.toDate().toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
