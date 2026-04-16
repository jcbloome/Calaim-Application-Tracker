'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { 
  FileText, 
  RefreshCw,
  Calendar,
  AlertTriangle,
  Clock,
  Loader2,
  Pencil,
  Printer,
  Database,
  CheckCircle2,
  Circle,
  Search
} from 'lucide-react';
import { format } from 'date-fns';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ILSReportMember {
  id: string;
  memberName: string;
  memberMrn: string;
  birthDate?: string;
  client_ID2: string;
  Kaiser_Status: string;
  Kaiser_T2038_Requested_Date?: string;
  Kaiser_T2038_Requested?: string;
  Kaiser_T2038_Received_Date?: string;
  Kaiser_Tier_Level?: string;
  Kaiser_Tier_Level_Requested?: string;
  Kaiser_Tier_Level_Requested_Date?: string;
  Kaiser_Tier_Level_Received_Date?: string;
  Kaiser_H2022_Requested?: string;
  Kaiser_H2022_Received?: string;
  memberCounty?: string;
  kaiser_user_assignment?: string;
  RCFE_Name?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Email?: string;
  ILS_Connected?: string;
  Need_More_Contact_Info_ILS?: string;
  CalAIM_Status?: string;
  Authorization_Start_Date_H2022?: string;
  Authorization_End_Date_H2022?: string;
  T2038_Auth_Email_Kaiser?: string;
}

type QueueRow = {
  id: string;
  memberName: string;
  memberMrn: string;
  birthDate?: string;
  ilsConnected?: boolean;
  rcfeName?: string;
  rcfeAdminName?: string;
  rcfeAdminEmail?: string;
  requestedDate: string;
};

const toQueueRow = (member: ILSReportMember, requestedDate: string): QueueRow => ({
  id: String(member.id || ''),
  memberName: String(member.memberName || '').trim(),
  memberMrn: String(member.memberMrn || '').trim(),
  birthDate: toYmd(member.birthDate),
  ilsConnected: isIlsConnected((member as any).ILS_Connected),
  rcfeName: String(member.RCFE_Name || '').trim(),
  rcfeAdminName: String(member.RCFE_Admin_Name || '').trim(),
  rcfeAdminEmail: String(member.RCFE_Admin_Email || '').trim(),
  requestedDate,
});

type MemberNote = {
  id: string;
  clientId2: string;
  noteText: string;
  createdAt: string;
  createdByName?: string;
  source?: string;
};

interface IlsQueueChangeLogRow {
  id: string;
  memberName: string;
  clientId2?: string;
  memberId?: string;
  queue: string;
  changes?: Record<string, any>;
  changedByEmail?: string;
  createdAtIso?: string;
  dateKey?: string;
  queueChangeFlag?: boolean;
  eventType?: string;
}

const ILS_STAFF_NOTE_EMAIL = 'jocelyn@ilshealth.com';
const NEW_ILS_NOTE_WINDOW_MS = 48 * 60 * 60 * 1000;

type QueueKey =
  | 't2038_auth_only_email'
  | 't2038_requested'
  | 't2038_received_unreachable'
  | 'tier_level_requested'
  | 'tier_level_appeals'
  | 'rb_sent_pending_ils_contract';

const hasMeaningfulValue = (value: any) => {
  const s = value != null ? String(value).trim() : '';
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower !== 'null' && lower !== 'undefined' && lower !== 'n/a';
};

const toYmd = (value: any): string => {
  const raw = value != null ? String(value).trim() : '';
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a') return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, '0');
    const dd = String(us[2]).padStart(2, '0');
    const yyyy = String(us[3]);
    return `${yyyy}-${mm}-${dd}`;
  }

  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const formatYmd = (value: any): string => {
  const ymd = toYmd(value);
  if (!ymd) return '';
  try {
    return format(new Date(`${ymd}T00:00:00`), 'MMM dd, yyyy');
  } catch {
    return ymd;
  }
};

const formatDateTimeSafe = (value: any): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unknown time';
  try {
    return format(new Date(raw), 'MM/dd/yyyy h:mm a');
  } catch {
    return raw;
  }
};

const ymdSortKey = (value: any): string => {
  const ymd = toYmd(value);
  return ymd || '9999-12-31';
};

const toDateFromYmd = (value: any): Date | null => {
  const ymd = toYmd(value);
  if (!ymd) return null;
  const parsed = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinNext30Days = (value: any): boolean => {
  const endDate = toDateFromYmd(value);
  if (!endDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const warningCutoff = new Date(today);
  warningCutoff.setDate(warningCutoff.getDate() + 30);
  return endDate >= today && endDate <= warningCutoff;
};

const normalizeStatus = (value: any) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isIlsConnected = (value: any): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1';
};

const isFinalMemberAtRcfe = (value: any): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'final member at rcfe' || normalized === 'final at rcfe';
};

const isRbPendingOrFinalAtRcfeStatus = (value: unknown): boolean => {
  const compact = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return (
    compact === 'r b sent pending ils contract' ||
    compact === 'r b pending ils contract' ||
    compact === 'final member at rcfe' ||
    compact === 'final at rcfe'
  );
};

const isH2022AuthTrackingEligible = (member: ILSReportMember): boolean => {
  return isRbPendingOrFinalAtRcfeStatus(getEffectiveKaiserStatus(member) || member.Kaiser_Status);
};

const isMissingRcfeName = (member: ILSReportMember): boolean => {
  return !hasMeaningfulValue((member as any).RCFE_Name);
};

const queueIncludes = (member: ILSReportMember, key: QueueKey): boolean => {
  const status = normalizeStatus(member.Kaiser_Status);
  if (key === 't2038_auth_only_email') {
    const hasAuthEmail = hasMeaningfulValue((member as any)?.T2038_Auth_Email_Kaiser);
    const hasOfficialAuth =
      hasMeaningfulValue((member as any)?.Kaiser_T2038_Received_Date) ||
      hasMeaningfulValue((member as any)?.Kaiser_T038_Received) ||
      hasMeaningfulValue((member as any)?.Kaiser_T2038_Received);
    return hasAuthEmail && !hasOfficialAuth;
  }
  if (key === 't2038_requested') {
    const requested = Boolean(toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date));
    const received =
      hasMeaningfulValue(
        (member as any).Kaiser_T2038_Received_Date ||
          (member as any).Kaiser_T2038_Received ||
          (member as any).Kaiser_T038_Received
      ) ||
      Boolean(
        toYmd(
          (member as any).Kaiser_T2038_Received_Date ||
            (member as any).Kaiser_T2038_Received ||
            (member as any).Kaiser_T038_Received
        )
      );
    return requested && !received;
  }
  if (key === 't2038_received_unreachable') {
    const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
    return compactStatus === 't2038 received unreachable';
  }
  if (key === 'tier_level_requested') {
    const requested = Boolean(toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date));
    const received =
      hasMeaningfulValue(
        (member as any).Kaiser_Tier_Level_Received_Date ||
          (member as any).Kaiser_Tier_Level_Received ||
          (member as any).Tier_Level_Received_Date ||
          (member as any).Tier_Received_Date
      ) ||
      Boolean(
        toYmd(
          (member as any).Kaiser_Tier_Level_Received_Date ||
            (member as any).Kaiser_Tier_Level_Received ||
            (member as any).Tier_Level_Received_Date ||
            (member as any).Tier_Received_Date
        )
      );
    // Show only members still pending with ILS (requested exists, received not set).
    return requested && !received;
  }
  if (key === 'tier_level_appeals') {
    const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
    return compactStatus === 'tier level appeals' || compactStatus === 'tier level appeal';
  }
  // R&B Sent Pending ILS Contract:
  // show only pending members (requested exists or status matches), but hide once H2022 received is set.
  const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
  const rbPendingByStatus =
    status === 'r&b sent pending ils contract' ||
    status === 'r & b sent pending ils contract' ||
    compactStatus === 'final member at rcfe' ||
    compactStatus === 'final at rcfe';
  const rbRequested = Boolean(toYmd(member.Kaiser_H2022_Requested));
  const rbReceived = hasMeaningfulValue(member.Kaiser_H2022_Received) || Boolean(toYmd(member.Kaiser_H2022_Received));
  return (rbPendingByStatus || rbRequested) && !rbReceived;
};

const queueRequestedDate = (member: ILSReportMember, key: QueueKey): string => {
  if (key === 't2038_requested') return toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date);
  if (key === 't2038_received_unreachable')
    return toYmd(
      (member as any).Kaiser_T2038_Received_Date ||
        (member as any).Kaiser_T2038_Received ||
        (member as any).Kaiser_T038_Received
    );
  if (key === 'tier_level_requested')
    return toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date);
  if (key === 'tier_level_appeals')
    return toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date || (member as any).Kaiser_Next_Step_Date);
  if (key === 't2038_auth_only_email') return toYmd(member.Kaiser_T2038_Requested_Date);
  if (key === 'rb_sent_pending_ils_contract') return toYmd(member.Kaiser_H2022_Requested);
  return '';
};

const getEffectiveKaiserStatus = (member: any): string => {
  const hasAuthEmail = hasMeaningfulValue(member?.T2038_Auth_Email_Kaiser);
  const hasOfficialAuth =
    hasMeaningfulValue(member?.Kaiser_T2038_Received_Date) ||
    hasMeaningfulValue(member?.Kaiser_T038_Received) ||
    hasMeaningfulValue(member?.Kaiser_T2038_Received);

  if (hasAuthEmail && !hasOfficialAuth) return 'T2038_Auth_Email_Kaiser';
  return String(member?.Kaiser_Status || '');
};

export default function ILSReportEditorPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const [members, setMembers] = useState<ILSReportMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingMembers, setIsSyncingMembers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cardEditOpen, setCardEditOpen] = useState(false);
  const [cardEditQueue, setCardEditQueue] = useState<'tier_level_requested' | 'rb_sent_pending_ils_contract' | null>(null);
  const [cardEditMemberId, setCardEditMemberId] = useState('');
  const [cardEditTierLevel, setCardEditTierLevel] = useState('');
  const [cardEditTierReceivedDate, setCardEditTierReceivedDate] = useState('');
  const [cardEditRbReceivedDate, setCardEditRbReceivedDate] = useState('');
  const [isLoadingIlsLog, setIsLoadingIlsLog] = useState(false);
  const [ilsLogRows, setIlsLogRows] = useState<IlsQueueChangeLogRow[]>([]);
  const [ilsLogSearch, setIlsLogSearch] = useState('');
  const [ilsStaffNoteText, setIlsStaffNoteText] = useState('');
  const [ilsStaffNoteMemberId, setIlsStaffNoteMemberId] = useState('');
  const [isSavingIlsStaffNote, setIsSavingIlsStaffNote] = useState(false);
  const [selectedMemberForNotes, setSelectedMemberForNotes] = useState('');
  const [selectedMemberNotes, setSelectedMemberNotes] = useState<MemberNote[]>([]);
  const [isLoadingMemberNotes, setIsLoadingMemberNotes] = useState(false);
  const [memberNotesMeta, setMemberNotesMeta] = useState<{ didSync: boolean; count: number }>({ didSync: false, count: 0 });
  const [accessLoading, setAccessLoading] = useState(true);
  const [canAccessIlsTools, setCanAccessIlsTools] = useState(false);
  const [summaryModal, setSummaryModal] = useState<{ title: string; rows: QueueRow[] } | null>(null);
  const didAutoLoadRef = useRef(false);
  const { toast } = useToast();
  const currentUserEmail = String(auth?.currentUser?.email || '').trim().toLowerCase();
  const canEditIlsStaffNotes = currentUserEmail === ILS_STAFF_NOTE_EMAIL || Boolean(isAdmin);

  const checkIlsToolsAccess = async () => {
    if (!auth?.currentUser) {
      setCanAccessIlsTools(false);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-member-access', {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      setCanAccessIlsTools(Boolean(res.ok && data?.success && data?.canAccessIlsMembersPage));
    } catch {
      setCanAccessIlsTools(false);
    } finally {
      setAccessLoading(false);
    }
  };

  // Load Kaiser members for ILS report (from cache by default; optional manual sync first).
  const loadMembers = async (opts?: { syncFirst?: boolean; silent?: boolean }) => {
    const syncFirst = Boolean(opts?.syncFirst);
    const silent = Boolean(opts?.silent);
    setIsLoading(true);
    setIsSyncingMembers(syncFirst);
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in to load members.');

      if (syncFirst) {
        const idToken = await auth.currentUser.getIdToken();
        // Optional manual full sync from Caspio → Firestore cache.
        const syncRes = await fetch('/api/caspio/members-cache/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, mode: 'full' }),
        });
        if (!syncRes.ok) {
          console.warn(`Skipping members-cache sync (HTTP ${syncRes.status}); reading existing cache.`);
        }
      }

      // Always read from the shared cache used by Kaiser Tracker / scheduled pulls.
      const response = await fetch('/api/kaiser-members');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.members) {
        const processedMembers = (Array.isArray(data.members) ? data.members : []).map((member: any) => {
          const effectiveStatus = getEffectiveKaiserStatus(member) || member.Kaiser_Status;
          
          return {
            id: member.id || member.Client_ID2,
            memberName: `${member.memberFirstName} ${member.memberLastName}`,
            memberMrn: member.memberMrn,
            birthDate: toYmd(member.Birth_Date || member.birthDate),
            client_ID2: member.client_ID2 || member.Client_ID2,
            Kaiser_Status: effectiveStatus,
            // Use the date fields directly from the API response
            Kaiser_T2038_Requested: toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Requested_Date: toYmd(member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Received_Date: toYmd(
              member.Kaiser_T2038_Received_Date ||
                member.Kaiser_T2038_Received ||
                member.Kaiser_T038_Received
            ),
            Kaiser_Tier_Level: String(member.Kaiser_Tier_Level || member.Tier_Level || '').trim(),
            Kaiser_Tier_Level_Requested: toYmd(
              member.Kaiser_Tier_Level_Requested ||
                member.Kaiser_Tier_Level_Requested_Date ||
                member.Tier_Level_Request_Date ||
                member.Tier_Level_Requested_Date ||
                member.Tier_Request_Date
            ),
            Kaiser_Tier_Level_Requested_Date: toYmd(
              member.Kaiser_Tier_Level_Requested ||
                member.Kaiser_Tier_Level_Requested_Date ||
                member.Tier_Level_Request_Date ||
                member.Tier_Level_Requested_Date ||
                member.Tier_Request_Date
            ),
            Kaiser_Tier_Level_Received_Date: toYmd(
              member.Kaiser_Tier_Level_Received_Date ||
                member.Kaiser_Tier_Level_Received ||
                member.Tier_Level_Received_Date ||
                member.Tier_Received_Date
            ),
            Kaiser_H2022_Requested: toYmd(member.Kaiser_H2022_Requested),
            Kaiser_H2022_Received: toYmd(member.Kaiser_H2022_Received),
            memberCounty: member.memberCounty,
            kaiser_user_assignment: member.kaiser_user_assignment,
            RCFE_Name: String(member.RCFE_Name || '').trim(),
            RCFE_Admin_Name: String(member.RCFE_Admin_Name || member.RCFE_Administrator || '').trim(),
            RCFE_Admin_Email: String(member.RCFE_Admin_Email || member.RCFE_Administrator_Email || '').trim(),
            ILS_Connected: String(member.ILS_Connected || '').trim(),
            Need_More_Contact_Info_ILS: String(member.Need_More_Contact_Info_ILS || '').trim(),
            CalAIM_Status: String(member.CalAIM_Status || '').trim(),
            Authorization_Start_Date_H2022: toYmd(member.Authorization_Start_Date_H2022),
            Authorization_End_Date_H2022: toYmd(member.Authorization_End_Date_H2022),
            T2038_Auth_Email_Kaiser: String(member.T2038_Auth_Email_Kaiser || '').trim(),
          };
        });

        const filtered = processedMembers
          .filter(Boolean)
          .filter(
            (m: ILSReportMember) =>
              queueIncludes(m, 't2038_auth_only_email') ||
              queueIncludes(m, 't2038_requested') ||
              queueIncludes(m, 't2038_received_unreachable') ||
              queueIncludes(m, 'tier_level_requested') ||
              queueIncludes(m, 'tier_level_appeals') ||
              queueIncludes(m, 'rb_sent_pending_ils_contract') ||
              isH2022AuthTrackingEligible(m)
          )
          .sort((a: ILSReportMember, b: ILSReportMember) => {
            const aDates = [
              ymdSortKey(queueRequestedDate(a, 't2038_auth_only_email')),
              ymdSortKey(queueRequestedDate(a, 't2038_requested')),
              ymdSortKey(queueRequestedDate(a, 't2038_received_unreachable')),
              ymdSortKey(queueRequestedDate(a, 'tier_level_requested')),
              ymdSortKey(queueRequestedDate(a, 'tier_level_appeals')),
              ymdSortKey(queueRequestedDate(a, 'rb_sent_pending_ils_contract')),
            ].sort();
            const bDates = [
              ymdSortKey(queueRequestedDate(b, 't2038_auth_only_email')),
              ymdSortKey(queueRequestedDate(b, 't2038_requested')),
              ymdSortKey(queueRequestedDate(b, 't2038_received_unreachable')),
              ymdSortKey(queueRequestedDate(b, 'tier_level_requested')),
              ymdSortKey(queueRequestedDate(b, 'tier_level_appeals')),
              ymdSortKey(queueRequestedDate(b, 'rb_sent_pending_ils_contract')),
            ].sort();
            const aFirst = aDates[0] || '9999-12-31';
            const bFirst = bDates[0] || '9999-12-31';
            if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
            return String(a.memberName || '').localeCompare(String(b.memberName || ''));
          });

        setMembers(filtered);
        setSelectedMemberForNotes('');
        setSelectedMemberNotes([]);
        setMemberNotesMeta({ didSync: false, count: 0 });

        if (!silent) {
          toast({
            title: syncFirst ? 'Manual Sync Complete' : 'Members Loaded',
            description: syncFirst
              ? `Synced and loaded ${filtered.length} member(s) from latest Kaiser cache`
              : `Loaded ${filtered.length} member(s) from Kaiser cache`,
            className: 'bg-green-100 text-green-900 border-green-200',
          });
        }
      }
    } catch (error: any) {
      console.error('Error loading members:', error);
      if (!silent) {
        toast({
          variant: 'destructive',
          title: 'Load Failed',
          description: 'Could not load Kaiser members for ILS report',
        });
      }
    } finally {
      setIsLoading(false);
      setIsSyncingMembers(false);
    }
  };

  const loadMemberNotes = async (opts?: { forceSync?: boolean }) => {
    const selectedMember = members.find((m) => String(m.id || '') === String(selectedMemberForNotes || ''));
    const clientId2 = String(selectedMember?.client_ID2 || '').trim();
    if (!clientId2) {
      toast({
        variant: 'destructive',
        title: 'Select a member',
        description: 'Choose a member first to view notes.',
      });
      return;
    }

    setIsLoadingMemberNotes(true);
    try {
      const query = new URLSearchParams({
        clientId2,
        forceSync: opts?.forceSync ? 'true' : 'false',
        skipSync: opts?.forceSync ? 'false' : 'true',
        repairIfEmpty: 'true',
      });
      const res = await fetch(`/api/member-notes?${query.toString()}`);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load notes (HTTP ${res.status})`);
      }

      const notes = Array.isArray(data?.notes) ? (data.notes as MemberNote[]) : [];
      notes.sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
      setSelectedMemberNotes(notes);
      setMemberNotesMeta({ didSync: Boolean(data?.didSync), count: notes.length });

      toast({
        title: opts?.forceSync ? 'Historical notes synced' : 'Notes loaded',
        description: `${notes.length} note(s) loaded for ${selectedMember?.memberName || 'member'}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Notes load failed',
        description: error?.message || 'Could not load member notes.',
      });
    } finally {
      setIsLoadingMemberNotes(false);
    }
  };

  // Save member date updates
  const saveMemberDates = async (memberId: string, updates: Partial<ILSReportMember>) => {
    setIsSaving(true);
    try {
      const functions = getFunctions();
      const updateMember = httpsCallable(functions, 'updateKaiserMemberDates');
      
      const result = await updateMember({
        memberId,
        updates
      });
      
      const data = result.data as any;
      
      if (data.success) {
        // Update local state
        setMembers(prev => prev.map(member => 
          member.id === memberId 
            ? { ...member, ...updates }
            : member
        ));
        
        toast({
          title: 'Dates Updated',
          description: 'Member dates saved successfully',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not save member dates',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const writeIlsChangeLog = async (payload: {
    memberId: string;
    clientId2: string;
    memberName: string;
    queue: string;
    changes: Record<string, any>;
  }) => {
    if (!auth?.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch('/api/admin/ils-change-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        action: 'create',
        eventType: 'queue_change',
        queueChangeFlag: true,
        ...payload,
      }),
    });
  };

  const submitIlsStaffNote = async () => {
    const noteText = String(ilsStaffNoteText || '').trim();
    if (!noteText) {
      toast({
        variant: 'destructive',
        title: 'Note required',
        description: 'Enter a note before saving.',
      });
      return;
    }
    if (!auth?.currentUser) return;

    const selectedMember = members.find((m) => String(m.id || '') === String(ilsStaffNoteMemberId || ''));
    const memberId = String(selectedMember?.id || '').trim();
    const clientId2 = String(selectedMember?.client_ID2 || '').trim();
    const memberName = String(selectedMember?.memberName || '').trim() || 'General ILS Note';

    setIsSavingIlsStaffNote(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-change-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'create',
          eventType: 'staff_note',
          queue: 'ils_staff_note',
          queueChangeFlag: false,
          memberId,
          clientId2,
          memberName,
          changes: {
            noteText,
            createdByIlsStaff: currentUserEmail || 'unknown',
          },
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to save note (HTTP ${res.status})`);
      }
      setIlsStaffNoteText('');
      await loadIlsChangeLog();
      toast({
        title: 'ILS note saved',
        description: memberId ? `Saved for ${memberName}.` : 'Saved as general ILS note.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error?.message || 'Could not save ILS note.',
      });
    } finally {
      setIsSavingIlsStaffNote(false);
    }
  };

  const loadIlsChangeLog = async () => {
    try {
      if (!auth?.currentUser) return;
      setIsLoadingIlsLog(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-change-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, action: 'list', limit: 300 }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load ILS queue change log');
      }
      setIlsLogRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Log Load Failed',
        description: error?.message || 'Could not load ILS queue change log.',
      });
    } finally {
      setIsLoadingIlsLog(false);
    }
  };

  const openCardEdit = (queue: 'tier_level_requested' | 'rb_sent_pending_ils_contract', memberId: string) => {
    const member = members.find((m) => String(m.id || '') === String(memberId || ''));
    if (!member) return;
    setCardEditQueue(queue);
    setCardEditMemberId(String(member.id || ''));
    setCardEditTierLevel(String(member.Kaiser_Tier_Level || '').trim());
    setCardEditTierReceivedDate(toYmd(member.Kaiser_Tier_Level_Received_Date));
    setCardEditRbReceivedDate(toYmd(member.Kaiser_H2022_Received));
    setCardEditOpen(true);
  };

  const handleSaveCardEdit = async () => {
    if (!cardEditQueue || !cardEditMemberId) return;
    const member = members.find((m) => String(m.id || '') === String(cardEditMemberId || ''));
    if (!member) return;
    const updates: Partial<ILSReportMember> = {};
    const changes: Record<string, any> = {};
    if (cardEditQueue === 'tier_level_requested') {
      updates.Kaiser_Tier_Level = String(cardEditTierLevel || '').trim();
      updates.Kaiser_Tier_Level_Received_Date = toYmd(cardEditTierReceivedDate);
      changes.Kaiser_Tier_Level = updates.Kaiser_Tier_Level || '';
      changes.Kaiser_Tier_Level_Received_Date = updates.Kaiser_Tier_Level_Received_Date || '';
    } else if (cardEditQueue === 'rb_sent_pending_ils_contract') {
      updates.Kaiser_H2022_Received = toYmd(cardEditRbReceivedDate);
      changes.Kaiser_H2022_Received = updates.Kaiser_H2022_Received || '';
    }
    await saveMemberDates(cardEditMemberId, updates);
    await writeIlsChangeLog({
      memberId: String(member.id || ''),
      clientId2: String(member.client_ID2 || ''),
      memberName: String(member.memberName || ''),
      queue: cardEditQueue,
      changes,
    });
    await loadIlsChangeLog();
    setCardEditOpen(false);
    setCardEditQueue(null);
    setCardEditMemberId('');
  };

  // Open printable report using route-based preview protocol.
  const openPrintableReport = (opts?: { title?: string }) => {
    const reportTitle = opts?.title || 'ILS Pending Tracker Report';

    const printableUrl = `/admin/ils-report-editor/printable?reportDate=${encodeURIComponent(reportDate)}&title=${encodeURIComponent(reportTitle)}&view=pdf`;
    const printableWindow = window.open(printableUrl, '_blank', 'noopener,noreferrer');
    if (!printableWindow) {
      window.location.href = printableUrl;
    }
  };

  const queues = useMemo(() => {
    const makeRows = (key: QueueKey) => {
      return members
        .filter((m) => queueIncludes(m, key))
        .map((m) => toQueueRow(m, queueRequestedDate(m, key)))
        .sort((a, b) => {
          const ad = ymdSortKey(a.requestedDate);
          const bd = ymdSortKey(b.requestedDate);
          if (ad !== bd) return ad.localeCompare(bd);
          return a.memberName.localeCompare(b.memberName);
        });
    };

    return {
      t2038Requested: makeRows('t2038_requested'),
      t2038ReceivedUnreachable: makeRows('t2038_received_unreachable'),
      tierRequested: makeRows('tier_level_requested'),
      tierAppeals: makeRows('tier_level_appeals'),
      rbPendingIlsContract: makeRows('rb_sent_pending_ils_contract'),
      t2038AuthOnly: makeRows('t2038_auth_only_email'),
    };
  }, [members]);

  const h2022AuthDateTracking = useMemo(() => {
    const eligibleMembers = members.filter((m) => isH2022AuthTrackingEligible(m));

    const withDates = eligibleMembers.filter(
      (m) =>
        Boolean(toYmd((m as any).Authorization_Start_Date_H2022)) &&
        Boolean(toYmd((m as any).Authorization_End_Date_H2022))
    );
    const withDateRows = withDates
      .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
    const withoutDates = eligibleMembers.filter(
      (m) =>
        !toYmd((m as any).Authorization_Start_Date_H2022) ||
        !toYmd((m as any).Authorization_End_Date_H2022)
    );
    const withoutDateRows = withoutDates
      .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));

    const finalRcfeMissingDates = eligibleMembers.filter((m) => {
      if (!isFinalMemberAtRcfe(getEffectiveKaiserStatus(m) || m.Kaiser_Status)) return false;
      return !toYmd((m as any).Authorization_Start_Date_H2022) || !toYmd((m as any).Authorization_End_Date_H2022);
    });
    const finalRcfeMissingRows = finalRcfeMissingDates
      .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
    const expiringSoonRows = eligibleMembers
      .filter((m) => isWithinNext30Days((m as any).Authorization_End_Date_H2022))
      .map((m) => toQueueRow(m, toYmd((m as any).Authorization_End_Date_H2022)))
      .sort((a, b) => ymdSortKey(a.requestedDate).localeCompare(ymdSortKey(b.requestedDate)));

    const missingRcfeNameRows = eligibleMembers
      .filter((m) => isMissingRcfeName(m))
      .map((m) => toQueueRow(m, toYmd((m as any).Kaiser_H2022_Requested)))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));

    return {
      eligibleMembers,
      withDates,
      withoutDates,
      finalRcfeMissingDates,
      withDateRows,
      withoutDateRows,
      finalRcfeMissingRows,
      expiringSoonRows,
      missingRcfeNameRows,
    };
  }, [members]);

  // Statistics for the requested queues
  const stats = useMemo(() => {
    const uniqueMemberIds = new Set<string>([
      ...queues.t2038Requested.map((r) => r.id).filter(Boolean),
      ...queues.t2038ReceivedUnreachable.map((r) => r.id).filter(Boolean),
      ...queues.tierRequested.map((r) => r.id).filter(Boolean),
      ...queues.tierAppeals.map((r) => r.id).filter(Boolean),
      ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
      ...h2022AuthDateTracking.withDateRows.map((r) => r.id).filter(Boolean),
      ...h2022AuthDateTracking.withoutDateRows.map((r) => r.id).filter(Boolean),
    ]);
    return {
      totalInQueues: uniqueMemberIds.size,
      t2038AuthOnly: queues.t2038AuthOnly.length,
      t2038Requested: queues.t2038Requested.length,
      t2038ReceivedUnreachable: queues.t2038ReceivedUnreachable.length,
      tierRequested: queues.tierRequested.length,
      tierAppeals: queues.tierAppeals.length,
      rbPendingIlsContract: queues.rbPendingIlsContract.length,
      h2022AuthDatesWith: h2022AuthDateTracking.withDates.length,
      h2022AuthDatesWithout: h2022AuthDateTracking.withoutDates.length,
      h2022FinalRcfeMissingDates: h2022AuthDateTracking.finalRcfeMissingDates.length,
      h2022ExpiringSoon: h2022AuthDateTracking.expiringSoonRows.length,
      missingRcfeName: h2022AuthDateTracking.missingRcfeNameRows.length,
    };
  }, [
    queues.rbPendingIlsContract,
    queues.t2038AuthOnly,
    queues.t2038Requested,
    queues.t2038ReceivedUnreachable,
    queues.tierRequested,
    queues.tierAppeals,
    h2022AuthDateTracking.withDateRows.length,
    h2022AuthDateTracking.withoutDateRows.length,
    h2022AuthDateTracking.finalRcfeMissingDates.length,
    h2022AuthDateTracking.expiringSoonRows.length,
    h2022AuthDateTracking.missingRcfeNameRows.length,
  ]);

  const totalQueueRows = useMemo(() => {
    const dedup = new Map<string, QueueRow>();
    const addRows = (rows: QueueRow[]) => {
      for (const row of rows) {
        const key = String(row.id || '').trim() || `${row.memberName}-${row.memberMrn}`;
        if (!dedup.has(key)) dedup.set(key, row);
      }
    };
    addRows(queues.t2038Requested);
    addRows(queues.t2038ReceivedUnreachable);
    addRows(queues.tierRequested);
    addRows(queues.tierAppeals);
    addRows(queues.rbPendingIlsContract);
    addRows(h2022AuthDateTracking.withDateRows);
    addRows(h2022AuthDateTracking.withoutDateRows);
    return Array.from(dedup.values()).sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [
    queues.t2038Requested,
    queues.t2038ReceivedUnreachable,
    queues.tierRequested,
    queues.tierAppeals,
    queues.rbPendingIlsContract,
    h2022AuthDateTracking.withDateRows,
    h2022AuthDateTracking.withoutDateRows,
  ]);

  const ilsLogFilteredRows = useMemo(() => {
    const q = ilsLogSearch.trim().toLowerCase();
    if (!q) return ilsLogRows;
    return ilsLogRows.filter((r) => {
      const memberName = String(r.memberName || '').toLowerCase();
      const clientId2 = String(r.clientId2 || '').toLowerCase();
      const queue = String(r.queue || '').toLowerCase();
      const changedBy = String(r.changedByEmail || '').toLowerCase();
      return memberName.includes(q) || clientId2.includes(q) || queue.includes(q) || changedBy.includes(q);
    });
  }, [ilsLogRows, ilsLogSearch]);

  const ilsStaffNotes = useMemo(() => {
    return ilsLogRows
      .filter((row) => row.queue === 'ils_staff_note' || row.eventType === 'staff_note')
      .map((row) => {
        const noteText = String(row?.changes?.noteText || '').trim();
        const memberId = String(row?.memberId || '').trim();
        const clientId2 = String(row?.clientId2 || '').trim();
        const authorEmail = String(row?.changedByEmail || '').trim().toLowerCase();
        const createdAtIso = String(row?.createdAtIso || '').trim();
        const createdMs = createdAtIso ? new Date(createdAtIso).getTime() : 0;
        const isRecent = createdMs > 0 && Date.now() - createdMs <= NEW_ILS_NOTE_WINDOW_MS;
        const isJocelynNote = authorEmail === ILS_STAFF_NOTE_EMAIL;
        return {
          ...row,
          noteText,
          memberId,
          clientId2,
          authorEmail,
          createdMs,
          isRecent,
          isJocelynNote,
          isNewForKaiserAdmin: isJocelynNote && isRecent,
        };
      })
      .filter((row) => row.noteText.length > 0);
  }, [ilsLogRows]);

  const latestIlsStaffNoteByMember = useMemo(() => {
    const map = new Map<string, (typeof ilsStaffNotes)[number]>();
    for (const note of ilsStaffNotes) {
      const key = String(note.memberId || note.clientId2 || '').trim();
      if (!key) continue;
      const prev = map.get(key);
      if (!prev || note.createdMs > prev.createdMs) {
        map.set(key, note);
      }
    }
    return map;
  }, [ilsStaffNotes]);

  const queueLabel = (value: string) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'tier_level_requested') return 'Tier Level Requested';
    if (v === 'tier_level_appeals') return 'Tier Level Appeals';
    if (v === 'rb_sent_pending_ils_contract') return 'R & B Sent Pending ILS Contract';
    if (v === 't2038_requested') return 'T2038 Requested';
    if (v === 't2038_received_unreachable') return 'T2038 Received, Unreachable';
    if (v === 't2038_auth_only_email') return 'T2038 Auth Only Email (no received auth)';
    if (v === 'ils_staff_note') return 'ILS Staff Note';
    return value || 'Unknown Queue';
  };

  useEffect(() => {
    loadIlsChangeLog().catch(() => {});
  }, [auth?.currentUser?.uid]);

  useEffect(() => {
    if (isAdminLoading) return;
    checkIlsToolsAccess().catch(() => {
      setCanAccessIlsTools(false);
      setAccessLoading(false);
    });
  }, [auth?.currentUser?.uid, isAdmin, isAdminLoading]);

  useEffect(() => {
    setSelectedMemberNotes([]);
    setMemberNotesMeta({ didSync: false, count: 0 });
  }, [selectedMemberForNotes]);

  // Auto-load cached Kaiser data when opening this page so users do not start at zero.
  useEffect(() => {
    if (isAdminLoading || accessLoading) return;
    if (!canAccessIlsTools) return;
    if (!auth?.currentUser) return;
    if (didAutoLoadRef.current) return;
    didAutoLoadRef.current = true;
    loadMembers({ syncFirst: false, silent: true });
  }, [isAdminLoading, accessLoading, canAccessIlsTools, auth?.currentUser]);

  if (isAdminLoading || accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!canAccessIlsTools) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need Kaiser-assigned staff access to use ILS Pending Tracker tools.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Pending Tracker</h1>
          <p className="text-muted-foreground">
            Review and update key Kaiser timeline dates (then generate a printable report if needed)
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Request Queues</span>
        </div>
      </div>

      {/* Report Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Report Configuration
          </CardTitle>
          <CardDescription>
            Set report date and generate report output
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-date">Report Date</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-40"
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => loadMembers({ syncFirst: false })}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full sm:w-auto justify-start bg-green-50 hover:bg-green-100 border-green-200"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  {members.length === 0 ? 'Load Cached Data' : 'Refresh Cached Data'}
                </Button>

                <Button
                  onClick={() => loadMembers({ syncFirst: true })}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full sm:w-auto justify-start"
                >
                  {isSyncingMembers ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Manual Sync Now
                </Button>
                
                <Button
                  onClick={() =>
                    openPrintableReport({
                      title: 'ILS Pending Tracker Report',
                    })
                  }
                  disabled={members.length === 0}
                  className="w-full sm:w-auto justify-start bg-blue-600 hover:bg-blue-700"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  ILS Pending Tracker Report
                </Button>

              </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-11 gap-4">
        {[
          {
            label: 'Total in queues',
            count: stats.totalInQueues,
            rows: totalQueueRows,
            numberClass: 'text-2xl font-bold text-slate-900',
            icon: <FileText className="h-4 w-4 text-muted-foreground" />,
          },
          {
            label: 'Tier Level Appeals',
            count: stats.tierAppeals,
            rows: queues.tierAppeals,
            numberClass: 'text-2xl font-bold text-amber-700',
            icon: <Clock className="h-4 w-4 text-amber-700" />,
          },
          {
            label: 'T2038 Requested',
            count: stats.t2038Requested,
            rows: queues.t2038Requested,
            numberClass: 'text-2xl font-bold text-yellow-700',
            icon: <Clock className="h-4 w-4 text-yellow-700" />,
          },
          {
            label: 'T2038 Received, Unreachable',
            count: stats.t2038ReceivedUnreachable,
            rows: queues.t2038ReceivedUnreachable,
            numberClass: 'text-2xl font-bold text-orange-700',
            icon: <Clock className="h-4 w-4 text-orange-700" />,
          },
          {
            label: 'Tier Level Requested',
            count: stats.tierRequested,
            rows: queues.tierRequested,
            numberClass: 'text-2xl font-bold text-blue-600',
            icon: <Clock className="h-4 w-4 text-blue-600" />,
          },
          {
            label: 'R & B Sent Pending ILS Contract',
            count: stats.rbPendingIlsContract,
            rows: queues.rbPendingIlsContract,
            numberClass: 'text-2xl font-bold text-indigo-700',
            icon: <Clock className="h-4 w-4 text-indigo-700" />,
          },
          {
            label: 'T2038 Auth Only Email (no received auth)',
            count: stats.t2038AuthOnly,
            rows: queues.t2038AuthOnly,
            numberClass: 'text-2xl font-bold text-emerald-700',
            icon: <Circle className="h-4 w-4 text-emerald-700" />,
          },
          {
            label: 'H2022 Auth Dates (With)',
            count: stats.h2022AuthDatesWith,
            rows: h2022AuthDateTracking.withDateRows,
            numberClass: 'text-2xl font-bold text-green-700',
            icon: <CheckCircle2 className="h-4 w-4 text-green-700" />,
          },
          {
            label: 'H2022 Auth Dates (Without)',
            count: stats.h2022AuthDatesWithout,
            rows: h2022AuthDateTracking.withoutDateRows,
            numberClass: 'text-2xl font-bold text-red-700',
            icon: <AlertTriangle className="h-4 w-4 text-red-700" />,
          },
          {
            label: 'H2022 Ending Within 1 Month',
            count: stats.h2022ExpiringSoon,
            rows: h2022AuthDateTracking.expiringSoonRows,
            numberClass: 'text-2xl font-bold text-rose-700',
            icon: <AlertTriangle className="h-4 w-4 text-rose-700" />,
          },
          {
            label: 'Missing RCFE Name',
            count: stats.missingRcfeName,
            rows: h2022AuthDateTracking.missingRcfeNameRows,
            numberClass: 'text-2xl font-bold text-fuchsia-700',
            icon: <AlertTriangle className="h-4 w-4 text-fuchsia-700" />,
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() => setSummaryModal({ title: card.label, rows: card.rows })}
                    disabled={card.rows.length === 0}
                    className={`${card.numberClass} hover:underline disabled:no-underline disabled:opacity-60`}
                  >
                    {card.count}
                  </button>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
                {card.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>H2022 Authorization Date Tracking</CardTitle>
          <CardDescription>
            Scope: Kaiser members with Kaiser Status Final- Member at RCFE or R & B Sent Pending ILS Contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">With Dates: {h2022AuthDateTracking.withDates.length}</Badge>
            <Badge variant="secondary">Without Dates: {h2022AuthDateTracking.withoutDates.length}</Badge>
            <Badge variant="secondary">Final at RCFE Missing Dates: {stats.h2022FinalRcfeMissingDates}</Badge>
            <button
              type="button"
              onClick={() =>
                setSummaryModal({
                  title: 'H2022 Ending Within 1 Month',
                  rows: h2022AuthDateTracking.expiringSoonRows,
                })
              }
              disabled={h2022AuthDateTracking.expiringSoonRows.length === 0}
              className="disabled:opacity-60"
            >
              <Badge variant="destructive" className="cursor-pointer">
                Warning: Ending Within 1 Month: {stats.h2022ExpiringSoon}
              </Badge>
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-green-700">With H2022 Auth Dates</div>
              <Badge variant="secondary">{h2022AuthDateTracking.withDates.length}</Badge>
            </div>
            <div className="space-y-1 text-sm max-h-52 overflow-y-auto">
              {h2022AuthDateTracking.withDates.length === 0 ? (
                <div className="text-muted-foreground">None</div>
              ) : (
                h2022AuthDateTracking.withDates.map((m) => (
                  <div key={`h2022-with-${m.id}`} className="flex items-center justify-between gap-2">
                    <span className="truncate flex items-center gap-1">
                      <span>{m.memberName || '—'}</span>
                      {isWithinNext30Days((m as any).Authorization_End_Date_H2022) ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" aria-label="Authorization expires within 1 month" />
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {toYmd((m as any).Authorization_Start_Date_H2022)} to {toYmd((m as any).Authorization_End_Date_H2022)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-red-700">Without H2022 Auth Dates</div>
              <Badge variant="secondary">{h2022AuthDateTracking.withoutDates.length}</Badge>
            </div>
            <div className="space-y-1 text-sm max-h-52 overflow-y-auto">
              {h2022AuthDateTracking.withoutDates.length === 0 ? (
                <div className="text-muted-foreground">None</div>
              ) : (
                h2022AuthDateTracking.withoutDates.map((m) => (
                  <div key={`h2022-without-${m.id}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.memberName || '—'}</span>
                    <span className="text-xs text-muted-foreground shrink-0">Missing Start and/or End date</span>
                  </div>
                ))
              )}
            </div>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Compact visual "graph" of requested queues */}
      <Card>
        <CardHeader>
          <CardTitle>Requested queues</CardTitle>
          <CardDescription>Member name • MRN • Birth Date • Request Date</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-sm text-muted-foreground">Load members to see the requested queues.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(
                [
                  {
                    key: 't2038Requested' as const,
                    queueKey: 't2038_requested' as const,
                    label: 'T2038 Requested',
                    rows: queues.t2038Requested,
                    editable: false,
                  },
                  {
                    key: 'tierRequested' as const,
                    queueKey: 'tier_level_requested' as const,
                    label: 'Tier Level Requested',
                    rows: queues.tierRequested,
                    editable: true,
                  },
                  {
                    key: 't2038ReceivedUnreachable' as const,
                    queueKey: 't2038_received_unreachable' as const,
                    label: 'T2038 Received, Unreachable',
                    rows: queues.t2038ReceivedUnreachable,
                    editable: false,
                    showIlsConnected: false,
                  },
                  {
                    key: 'tierAppeals' as const,
                    queueKey: 'tier_level_appeals' as const,
                    label: 'Tier Level Appeals',
                    rows: queues.tierAppeals,
                    editable: false,
                    showIlsConnected: false,
                  },
                  {
                    key: 'rbPendingIlsContract' as const,
                    queueKey: 'rb_sent_pending_ils_contract' as const,
                    label: 'R & B Sent Pending ILS Contract / Final at RCFE',
                    rows: queues.rbPendingIlsContract,
                    editable: true,
                    showIlsConnected: true,
                  },
                ] as const
              ).map((q) => {
                return (
                <div key={q.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{q.label}</div>
                    <Badge variant="secondary">{q.rows.length}</Badge>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Member / MRN / Birth Date</span>
                    <span className="hidden sm:inline font-medium">
                      {q.showIlsConnected ? 'ILS Connected • Request Date' : 'Request Date'}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {q.rows.length === 0 ? (
                      <div className="text-muted-foreground">None</div>
                    ) : (
                      q.rows.slice(0, 60).map((r) => {
                        const latestIlsNote = latestIlsStaffNoteByMember.get(String(r.id || '').trim());
                        return (
                        <div key={`${q.key}-${r.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate font-medium flex items-center gap-2">
                              <span className="truncate">{r.memberName || '—'}</span>
                              {q.showIlsConnected
                                ? r.ilsConnected ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="ILS connected: yes" />
                                  ) : (
                                    <Circle className="h-4 w-4 shrink-0 text-red-500 fill-red-500" aria-label="ILS connected: no" />
                                  )
                                : null}
                              {latestIlsNote?.isNewForKaiserAdmin ? (
                                <Badge className="bg-green-100 text-green-900 border-green-200">New ILS note</Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              MRN: <span className="font-mono">{r.memberMrn || '—'}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Birth Date:{' '}
                              <span className="font-mono">
                                {r.birthDate ? format(new Date(`${r.birthDate}T00:00:00`), 'MM/dd/yyyy') : '—'}
                              </span>
                            </div>
                            {q.queueKey === 'rb_sent_pending_ils_contract' ? (
                              <>
                                <div className="text-xs text-muted-foreground">
                                  RCFE: <span className="font-medium">{(r as any).rcfeName || '—'}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  RCFE Admin Name: <span className="font-medium">{(r as any).rcfeAdminName || '—'}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  RCFE Admin Email: <span className="font-mono">{(r as any).rcfeAdminEmail || '—'}</span>
                                </div>
                              </>
                            ) : null}
                            {latestIlsNote ? (
                              <div
                                className={`mt-1 rounded border px-2 py-1 text-[11px] ${
                                  latestIlsNote.isNewForKaiserAdmin
                                    ? 'bg-green-50 border-green-200 text-green-900'
                                    : 'bg-muted/40 text-muted-foreground'
                                }`}
                              >
                                ILS note ({latestIlsNote.authorEmail || 'staff'}): {latestIlsNote.noteText}
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div className="text-xs font-mono text-muted-foreground">
                              {r.requestedDate ? format(new Date(`${r.requestedDate}T00:00:00`), 'MM/dd/yyyy') : '—'}
                            </div>
                            {q.editable ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1 text-[11px] mt-1"
                                onClick={() => openCardEdit(q.queueKey, r.id)}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )})
                    )}
                    {q.rows.length > 60 ? (
                      <div className="text-xs text-muted-foreground pt-1">+ {q.rows.length - 60} more... (see generated report)</div>
                    ) : null}
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ILS Staff Notes</CardTitle>
          <CardDescription>
            Shared notes for Kaiser admins. New Jocelyn notes are highlighted in green for daily follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">Total notes: {ilsStaffNotes.length}</Badge>
            <Badge className="bg-green-100 text-green-900 border-green-200">
              New from Jocelyn: {ilsStaffNotes.filter((n) => n.isNewForKaiserAdmin).length}
            </Badge>
          </div>

          {canEditIlsStaffNotes ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Add ILS note</div>
              <Select
                value={ilsStaffNoteMemberId || 'none'}
                onValueChange={(value) => setIlsStaffNoteMemberId(value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Attach to a member (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General note (no specific member)</SelectItem>
                  {members
                    .slice()
                    .sort((a, b) => String(a.memberName || '').localeCompare(String(b.memberName || '')))
                    .map((member) => (
                      <SelectItem key={`ils-staff-note-member-${member.id}`} value={String(member.id || '')}>
                        {member.memberName || 'Unnamed member'} {member.memberMrn ? `- ${member.memberMrn}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Textarea
                value={ilsStaffNoteText}
                onChange={(e) => setIlsStaffNoteText(e.target.value)}
                placeholder="Enter update for Kaiser admin review..."
                rows={3}
              />
              <div className="flex justify-end">
                <Button type="button" onClick={submitIlsStaffNote} disabled={isSavingIlsStaffNote}>
                  {isSavingIlsStaffNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save ILS Note
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground rounded-md border p-3">
              Read-only view. ILS staff can add notes from the limited portal card.
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
            {ilsStaffNotes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No ILS staff notes yet.</div>
            ) : (
              ilsStaffNotes.slice(0, 200).map((note) => (
                <div
                  key={`ils-staff-note-${note.id}`}
                  className={`rounded-md border p-3 ${
                    note.isNewForKaiserAdmin
                      ? 'bg-green-50 border-green-200'
                      : 'bg-background'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {note.isNewForKaiserAdmin ? (
                      <Badge className="bg-green-100 text-green-900 border-green-200">New</Badge>
                    ) : null}
                    <Badge variant="outline">{note.memberName || 'General note'}</Badge>
                    <span className="text-muted-foreground">
                      {note.createdAtIso ? format(new Date(note.createdAtIso), 'MM/dd/yyyy h:mm a') : 'Unknown time'}
                    </span>
                    <span className="text-muted-foreground">By: {note.changedByEmail || 'Unknown'}</span>
                  </div>
                  <div className="mt-2 text-sm whitespace-pre-wrap">{note.noteText}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ILS Member Notes Lookup</CardTitle>
          <CardDescription>
            Select a member name to review notes (including historical Kaiser tracker notes).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Select value={selectedMemberForNotes} onValueChange={setSelectedMemberForNotes}>
              <SelectTrigger>
                <SelectValue placeholder="Select member name" />
              </SelectTrigger>
              <SelectContent>
                {members
                  .slice()
                  .sort((a, b) => String(a.memberName || '').localeCompare(String(b.memberName || '')))
                  .map((member) => (
                    <SelectItem key={`notes-member-${member.id}`} value={String(member.id || '')}>
                      {member.memberName || 'Unnamed member'} {member.memberMrn ? `- ${member.memberMrn}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMemberNotes({ forceSync: false })}
                disabled={!selectedMemberForNotes || isLoadingMemberNotes}
              >
                {isLoadingMemberNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                View Notes
              </Button>
              <Button
                type="button"
                onClick={() => loadMemberNotes({ forceSync: true })}
                disabled={!selectedMemberForNotes || isLoadingMemberNotes}
              >
                {isLoadingMemberNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Pull Historical Notes
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {selectedMemberForNotes
              ? `${memberNotesMeta.count} note(s) loaded${memberNotesMeta.didSync ? ' (latest sync included)' : ' (saved notes view)'}.`
              : 'Select a member to view notes.'}
          </div>

          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {!selectedMemberForNotes ? (
              <div className="text-sm text-muted-foreground">No member selected yet.</div>
            ) : selectedMemberNotes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No notes found for this member.</div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="border-b bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                  Notes
                </div>
                {selectedMemberNotes.slice(0, 250).map((note) => (
                  <div
                    key={`ils-note-${note.id}`}
                    className="border-b last:border-b-0 px-3 py-2 text-xs"
                  >
                    <div className="whitespace-pre-wrap break-words">{note.noteText || ''}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTimeSafe(note.createdAt)} • By: {note.createdByName || '-'} • {note.source || 'Note'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                ILS Queue Change Log
              </CardTitle>
              <CardDescription>
                Queue edits are flagged here immediately after save.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadIlsChangeLog} disabled={isLoadingIlsLog} className="w-full sm:w-auto">
              {isLoadingIlsLog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Log
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search by member, Client ID2, queue, or email"
              value={ilsLogSearch}
              onChange={(e) => setIlsLogSearch(e.target.value)}
              className="w-full sm:max-w-xl"
            />
            <Badge variant="secondary" className="self-start sm:self-auto">{ilsLogFilteredRows.length}</Badge>
          </div>
          <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
            {ilsLogFilteredRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No queue changes logged yet.</div>
            ) : (
              ilsLogFilteredRows.slice(0, 150).map((row) => {
                const changeEntries = Object.entries(row.changes || {});
                return (
                  <div key={`ils-log-${row.id}`} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-900 border-amber-200">Queue Change</Badge>
                      <Badge variant="outline">{queueLabel(row.queue)}</Badge>
                      <div className="text-xs text-muted-foreground">
                        {row.createdAtIso ? format(new Date(row.createdAtIso), 'MM/dd/yyyy h:mm a') : 'Time unavailable'}
                      </div>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="font-medium">{row.memberName || 'Member'}</span>
                      {row.clientId2 ? <span className="text-muted-foreground"> • Client ID2: {row.clientId2}</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Changed by: {row.changedByEmail || 'Unknown'}
                    </div>
                    {changeEntries.length > 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {changeEntries.map(([key, value]) => `${key}: ${String(value || '—')}`).join(' • ')}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(summaryModal)} onOpenChange={(open) => !open && setSummaryModal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{summaryModal?.title || 'Queue Members'}</DialogTitle>
            <DialogDescription>
              {(summaryModal?.rows?.length || 0)} member(s). Showing up to 300 rows.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1 text-sm">
            {!summaryModal || summaryModal.rows.length === 0 ? (
              <div className="text-muted-foreground">No members in this group.</div>
            ) : (
              summaryModal.rows.slice(0, 300).map((row) => (
                <div key={`summary-${summaryModal.title}-${row.id}-${row.memberMrn}`} className="rounded border p-2">
                  <div className="font-medium">{row.memberName || '—'}</div>
                  <div className="text-xs text-muted-foreground">
                    MRN: {row.memberMrn || '—'} • Birth: {formatYmd(row.birthDate) || '—'} • Request/End: {formatYmd(row.requestedDate) || '—'}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cardEditOpen}
        onOpenChange={(open) => {
          setCardEditOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cardEditQueue === 'tier_level_requested' ? 'Edit Tier Level Requested' : 'Edit R & B Sent Pending ILS Contract'}
            </DialogTitle>
            <DialogDescription>
              Update ILS fields directly from this queue row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {cardEditQueue === 'tier_level_requested' ? (
              <>
                <div className="space-y-2">
                  <Label>Tier Level</Label>
                  <Select value={cardEditTierLevel || 'none'} onValueChange={(v) => setCardEditTierLevel(v === 'none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tier level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tier Level Received Date</Label>
                  <Input
                    type="date"
                    value={cardEditTierReceivedDate}
                    onChange={(e) => setCardEditTierReceivedDate(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>R &amp; B Sent Pending ILS Contract Received Date</Label>
                <Input
                  type="date"
                  value={cardEditRbReceivedDate}
                  onChange={(e) => setCardEditRbReceivedDate(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCardEditOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveCardEdit} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}