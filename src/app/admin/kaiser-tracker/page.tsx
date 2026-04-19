'use client';

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getNextKaiserStatus, getKaiserStatusesInOrder, KAISER_STATUS_PROGRESSION, getKaiserStatusById, normalizeKaiserStatusName } from '@/lib/kaiser-status-progression';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBirthDate, getEffectiveKaiserStatus, getMemberKey, getStatusColor } from './components/shared';
import type { KaiserMember } from './components/shared';
import { KaiserSummaryCards } from './components/KaiserSummaryCards';
import { KaiserStaffAssignments } from './components/KaiserStaffAssignments';
import type { NoActionStaffSummary } from './components/KaiserStaffAssignments';
import { MemberListModal } from './components/MemberListModal';
import { MemberNotesModal } from './components/MemberNotesModal';
import { StaffMemberManagementModal } from './components/StaffMemberManagementModal';
import { MemberSearchCard } from './components/MemberSearchCard';
import { 
  User, 
  Filter, 
  Download, 
  RefreshCw, 
  Search, 
  Calendar, 
  MapPin,
  Phone, 
  Mail, 
  FileText, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Pause,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Edit,
  Save,
  Plus,
  Target,
} from 'lucide-react';
import { format } from 'date-fns';

// Types
interface StatusSummaryItem {
  status: string;
  count: number;
}

const getStatusIcon = (status: string) => {
  const normalized = normalizeKaiserStatusName(status);
  const iconMap: Record<string, React.ReactNode> = {
    'Complete': <CheckCircle className="h-3 w-3" />,
    'Active': <CheckCircle className="h-3 w-3" />,
    'Pending': <Clock className="h-3 w-3" />,
    'On-Hold': <Pause className="h-3 w-3" />,
    'Non-active': <XCircle className="h-3 w-3" />,
    'Case Closed': <XCircle className="h-3 w-3" />,
    'Denied': <XCircle className="h-3 w-3" />,
    'Expired': <AlertTriangle className="h-3 w-3" />,
    'T2038 Requested': <FileText className="h-3 w-3" />,
    'RN Visit Complete': <CheckCircle className="h-3 w-3" />,
    'Tier Level Requested': <FileText className="h-3 w-3" />,
    'Tier Level Received': <CheckCircle className="h-3 w-3" />,
    'RN/MSW Scheduled': <Calendar className="h-3 w-3" />,
    'R&B Requested': <FileText className="h-3 w-3" />,
    'R&B Signed': <CheckCircle className="h-3 w-3" />,
    'RN Visit Complete, Pending Signatures': <Clock className="h-3 w-3" />,
    'T2038 received, doc collection': <FileText className="h-3 w-3" />,
    'T2038 received, Need First Contact': <Phone className="h-3 w-3" />,
    'Tier Level Appeal': <AlertTriangle className="h-3 w-3" />,
    'Tier Level Request Needed': <FileText className="h-3 w-3" />,
    'T2038_Auth_Email_Kaiser': <Mail className="h-3 w-3" />,
    'T2038 Auth Only Email': <Mail className="h-3 w-3" />,
    'T2038 Request Ready': <CheckCircle className="h-3 w-3" />,
    'T2038, Not Requested, Doc Collection': <FileText className="h-3 w-3" />,
    'RCFE Needed': <MapPin className="h-3 w-3" />,
    'ILS Sent for Contract': <FileText className="h-3 w-3" />,
    'R&B Needed': <FileText className="h-3 w-3" />,
    'RN Visit Needed': <Calendar className="h-3 w-3" />,
    'RCFE_Located': <MapPin className="h-3 w-3" />,
    'ILS Contract Email Needed': <Mail className="h-3 w-3" />,
    'ILS/RCFE_Member_At_RCFE_Need_Conf': <AlertTriangle className="h-3 w-3" />,
    'ILS/RCFE_Member_At_RCFE_Confirmed': <CheckCircle className="h-3 w-3" />,
    'Final- Member at RCFE': <CheckCircle className="h-3 w-3" />
  };
  
  return iconMap[normalized] || iconMap[status] || <Clock className="h-3 w-3" />;
};

// Helper function to format dates
const formatDate = (dateString: string): string => {
  if (!dateString) return 'Not set';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'Invalid date';
  }
};

// Helper functions moved inside component to avoid module-level const declarations

// Kaiser workflow configuration
const kaiserWorkflow = {
  'Pre-T2038, Compiling Docs': { next: 'T2038 Requested', recommendedDays: 7 },
  'T2038 Requested': { next: 'T2038 Received', recommendedDays: 14 },
  'T2038 Received': { next: 'T2038 received, Need First Contact', recommendedDays: 3 },
  'T2038 received, Need First Contact': { next: 'T2038 received, doc collection', recommendedDays: 7 },
  'T2038 received, doc collection': { next: 'RN Visit Needed', recommendedDays: 14 },
  'RN Visit Needed': { next: 'RN/MSW Scheduled', recommendedDays: 7 },
  'RN/MSW Scheduled': { next: 'RN Visit Complete', recommendedDays: 14 },
  'RN Visit Complete': { next: 'RN Visit Complete, Pending Signatures', recommendedDays: 2 },
  'RN Visit Complete, Pending Signatures': { next: 'Tier Level Request Needed', recommendedDays: 3 },
  'Tier Level Request Needed': { next: 'Tier Level Requested', recommendedDays: 7 },
  'Tier Level Requested': { next: 'Tier Level Received', recommendedDays: 21 },
  'Tier Level Received': { next: 'RCFE Needed', recommendedDays: 3 },
  'RCFE Needed': { next: 'RCFE_Located', recommendedDays: 14 },
  'RCFE_Located': { next: 'R&B Requested', recommendedDays: 7 },
  'R&B Requested': { next: 'R&B Signed', recommendedDays: 14 },
  'R&B Signed': { next: 'ILS/RCFE Contract Email Needed', recommendedDays: 7 },
  'ILS/RCFE Contract Email Needed': { next: 'ILS/RCFE Contract Email Sent', recommendedDays: 7 },
  'ILS/RCFE Contract Email Sent': { next: 'ILS/RCFE_Member_At_RCFE_Need_Conf', recommendedDays: 7 },
  'ILS/RCFE_Member_At_RCFE_Need_Conf': { next: 'ILS/RCFE_Member_At_RCFE_Confirmed', recommendedDays: 7 }
};

const FALLBACK_KAISER_STATUS_ORDER = getKaiserStatusesInOrder().map((status) => status.status);
const PINNED_TOP_STATUSES = [
  'RN Visit Needed',
  'RCFE Needed',
  'T2038 received, Need First Contact',
];
const PINNED_TOP_STATUS_ALIASES: Record<string, string[]> = {
  'T2038 received, Need First Contact': ['T2038 received, Needs First Contact'],
};
const normalizeStatusText = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const NO_ACTION_SCOPED_STATUSES = [
  'T2038 received, Need First Contact',
  'T2038 received, doc collection',
  'RCFE Needed',
  'R&B Needed',
];
const isCaseClosedStatus = (value: string) => {
  const normalized = normalizeStatusText(normalizeKaiserStatusName(value));
  return normalized === 'case closed' || normalized === 'case close';
};
const ensureCaseClosedStatusOption = (statuses: string[]): string[] => {
  const hasCaseClosed = statuses.some((status) => isCaseClosedStatus(status));
  if (hasCaseClosed) return statuses;
  return [...statuses, 'Case Closed'];
};

const CALAIM_STATUS_OPTIONS = [
  'Authorized',
  'Pending',
  'Non_Active',
  'Member Died',
  'Authorized on hold',
  'H2022',
  'Authorization Ended',
  'Denied',
  'Not interested',
  'Pending to switch'
];
const CALAIM_STATUSES = CALAIM_STATUS_OPTIONS;

const normalizeCalaimStatus = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const CALAIM_STATUS_ALIASES: Record<string, string> = {
  authorized: 'Authorized',
  pending: 'Pending',
  'non active': 'Non_Active',
  'member died': 'Member Died',
  died: 'Member Died',
  'authorized on hold': 'Authorized on hold',
  h2022: 'H2022',
  'authorization ended': 'Authorization Ended',
  denied: 'Denied',
  'not interested': 'Not interested',
  'pending to switch': 'Pending to switch',
};

const CALAIM_STATUS_MAP = CALAIM_STATUS_OPTIONS.reduce((acc, status) => {
  acc[normalizeCalaimStatus(status)] = status;
  return acc;
}, {} as Record<string, string>);

const toCanonicalCalaimStatus = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'No Status';
  return CALAIM_STATUS_ALIASES[normalizeCalaimStatus(raw)] || raw;
};
const isAuthorizedOrPendingCalaim = (value: unknown) => {
  const canonical = toCanonicalCalaimStatus(value);
  return canonical === 'Authorized' || canonical === 'Pending';
};

const toDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isOverdue = (dateString: any): boolean => {
  const dueDate = toDateValue(dateString);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
};

const getDaysUntilDue = (dateString: any): number => {
  const dueDate = toDateValue(dateString);
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const COUNTIES = [
  'Los Angeles',
  'San Diego',
  'Orange',
  'Riverside',
  'San Bernardino',
  'Ventura',
  'Santa Barbara',
  'Kern',
  'Fresno',
  'Imperial'
];

const sortKaiserMembersAlphabetically = (input: KaiserMember[]): KaiserMember[] => {
  return [...input].sort((a, b) => {
    const aLast = String(a?.memberLastName || '').trim().toLowerCase();
    const bLast = String(b?.memberLastName || '').trim().toLowerCase();
    if (aLast !== bLast) return aLast.localeCompare(bLast);

    const aFirst = String(a?.memberFirstName || '').trim().toLowerCase();
    const bFirst = String(b?.memberFirstName || '').trim().toLowerCase();
    if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);

    const aId = String(a?.client_ID2 || '').trim();
    const bId = String(b?.client_ID2 || '').trim();
    return aId.localeCompare(bId);
  });
};

function KaiserTrackerPageContent() {
  const { isAdmin, isSuperAdmin, isKaiserManager, isLoading: isAdminLoading, user } = useAdmin();
  const { toast } = useToast();
  const auth = useAuth();
  const searchParams = useSearchParams();

  // State declarations
  const [isLoading, setIsLoading] = useState(false);
  const [statusListLoading, setStatusListLoading] = useState(false);
  const [kaiserStatusOptions, setKaiserStatusOptions] = useState<string[]>([...FALLBACK_KAISER_STATUS_ORDER]);
  const [kaiserStatusListUpdatedAtLabel, setKaiserStatusListUpdatedAtLabel] = useState<string>('');
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [membersCacheLastSyncAt, setMembersCacheLastSyncAt] = useState('');
  const [notesGlobalSyncing, setNotesGlobalSyncing] = useState(false);
  const [notesGlobalProgress, setNotesGlobalProgress] = useState<{
    total: number;
    complete: number;
    success: number;
    failed: number;
    existingNotes: number;
    newNotes: number;
    lastSyncAt: string;
    currentMember: string;
    scopeLabel: string;
    stopped: boolean;
    recentErrors: string[];
  } | null>(null);
  const [noActionByStaffMap, setNoActionByStaffMap] = useState<Record<string, NoActionStaffSummary>>({});

  const handleNoActionByStaffComputed = useCallback(
    (
      rows: Array<{
        staffName: string;
        totalMembers: KaiserMember[];
        criticalMembers: KaiserMember[];
        priorityMembers: KaiserMember[];
        todayNotedMembers: KaiserMember[];
        yesterdayNotedMembers: KaiserMember[];
        total: number;
        critical: number;
        priority: number;
        notesTodayTotal: number;
        notesYesterdayTotal: number;
        membersWithNotesToday: number;
        membersWithNotesYesterday: number;
      }>
    ) => {
      setNoActionByStaffMap((prev) => {
        const next = rows.reduce((acc, row) => {
          acc[row.staffName] = row as NoActionStaffSummary;
          return acc;
        }, {} as Record<string, NoActionStaffSummary>);

        const prevKeys = Object.keys(prev).sort();
        const nextKeys = Object.keys(next).sort();
        if (prevKeys.length !== nextKeys.length) return next;
        for (let i = 0; i < prevKeys.length; i += 1) {
          if (prevKeys[i] !== nextKeys[i]) return next;
        }
        for (const key of nextKeys) {
          const a = prev[key];
          const b = next[key];
          if (!a || !b) return next;
          if (
            a.total !== b.total ||
            a.critical !== b.critical ||
            a.priority !== b.priority ||
            a.notesTodayTotal !== b.notesTodayTotal ||
            a.notesYesterdayTotal !== b.notesYesterdayTotal ||
            a.membersWithNotesToday !== b.membersWithNotesToday ||
            a.membersWithNotesYesterday !== b.membersWithNotesYesterday
          ) {
            return next;
          }
        }
        return prev;
      });
    },
    []
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMembers, setModalMembers] = useState<KaiserMember[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDescription, setModalDescription] = useState('');
  const [modalFilterType, setModalFilterType] = useState<'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'staff_members'>('kaiser_status');
  const [modalFilterValue, setModalFilterValue] = useState('');
  const [staffMemberModal, setStaffMemberModal] = useState<{
    isOpen: boolean;
    staffName: string;
    members: KaiserMember[];
  }>({ isOpen: false, staffName: '', members: [] });
  const deepLinkHandledRef = useRef(false);
  const stopAllSyncRef = useRef(false);
  const notesFetchControllersRef = useRef<Set<AbortController>>(new Set());

  // Member notes modal state
  const [memberNotesModal, setMemberNotesModal] = useState<{
    isOpen: boolean;
    member: KaiserMember | null;
    notes: any[];
    isLoadingNotes: boolean;
    lastSyncAt: string;
    existingNotesCount: number;
    newNotesCount: number;
    didSync: boolean;
  }>({
    isOpen: false,
    member: null,
    notes: [],
    isLoadingNotes: false,
    lastSyncAt: '',
    existingNotesCount: 0,
    newNotesCount: 0,
    didSync: false,
  });
  const [filters, setFilters] = useState({
    kaiserStatus: 'all',
    calaimStatus: 'all',
    county: 'all',
    staffAssigned: 'all'
  });

  const bumpNotesMetaRefresh = () => {
    // Force child meta effects keyed by members arrays to run again after note syncs.
    setMembers((prev) => [...prev]);
    setModalMembers((prev) => [...prev]);
  };

  const etDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      }),
    []
  );
  const formatEtDateTime = useCallback(
    (value: string) => {
      if (!value) return 'Never';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return 'Never';
      return etDateTimeFormatter.format(parsed);
    },
    [etDateTimeFormatter]
  );

  const parseApiJson = async (response: Response) => {
    const raw = await response.text();
    try {
      return { ok: true as const, data: JSON.parse(raw) };
    } catch {
      const excerpt = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
      return {
        ok: false as const,
        error: `Invalid API response (${response.status}). ${excerpt || 'No response body.'}`,
      };
    }
  };
  // Calculate status summary using the defined Kaiser status order
  const statusSummary = useMemo(() => {
    const summary: Record<string, number> = {};

    members.forEach(member => {
      const status = getEffectiveKaiserStatus(member);
      if (!summary[status]) summary[status] = 0;
      summary[status] += 1;
    });

    return kaiserStatusOptions.map((status) => ({
      status,
      count: summary[status] || 0
    }));
  }, [members, kaiserStatusOptions]);


  // Treat numeric-only staff values (e.g. Caspio user IDs 107, 224, 33, 48) as unassigned
  const normalizeStaffForSummary = (value: any): string => {
    const s = value != null ? String(value).trim() : '';
    if (!s) return 'Unassigned';
    // If it's only digits, treat as unassigned (legacy ID, not a staff name)
    if (/^\d+$/.test(s)) return 'Unassigned';
    return s;
  };

  const getStaffAssignmentValue = (member: any): string =>
    String(
      member?.Staff_Assigned ||
        member?.Kaiser_User_Assignment ||
        member?.Staff_Assignment ||
        member?.Assigned_Staff ||
        member?.kaiser_user_assignment ||
        member?.SW_ID ||
        ''
    ).trim();

  // Calculate staff assignments dynamically from actual data
  const staffAssignments = useMemo(() => {
    const assignments: Record<string, { 
      count: number; 
      members: any[];
      statusBreakdown: Record<string, number>;
    }> = {};
    
    members.forEach(member => {
      // Staff cards only include members with CalAIM Authorized or Pending.
      if (!isAuthorizedOrPendingCalaim(member?.CalAIM_Status)) return;

      // Use normalized staff so numeric IDs (107, 224, 33, 48) count as Unassigned
      const staffName = normalizeStaffForSummary(getStaffAssignmentValue(member));
      
      // Initialize staff if not exists
      if (!assignments[staffName]) {
        assignments[staffName] = { 
          count: 0, 
          members: [], 
          statusBreakdown: {}
        };
      }
      
      assignments[staffName].count++;
      assignments[staffName].members.push(member);

      // Count status breakdown
      const status = getEffectiveKaiserStatus(member);
      assignments[staffName].statusBreakdown[status] = (assignments[staffName].statusBreakdown[status] || 0) + 1;

    });
    
    return assignments;
  }, [members]);

  // Get dynamic list of all staff (including unassigned)
  const allStaff = useMemo(() => {
    return Object.keys(staffAssignments).sort((a, b) => {
      // Sort: Unassigned last, then alphabetically
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [staffAssignments]);
  const authorizedCalaimCount = useMemo(
    () => members.filter((member) => toCanonicalCalaimStatus(member?.CalAIM_Status) === 'Authorized').length,
    [members]
  );
  // Helper function to open member list modal
  const openMemberModal = (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'staff_members',
    filterValue: string
  ) => {
    setModalMembers(sortKaiserMembersAlphabetically(memberList));
    setModalTitle(title);
    setModalDescription(description);
    setModalFilterType(filterType);
    setModalFilterValue(filterValue);
    setModalOpen(true);
  };

  // Helper function to open staff member management modal
  const openStaffMemberModal = (staffName: string, members: KaiserMember[]) => {
    setStaffMemberModal({
      isOpen: true,
      staffName,
      members: sortKaiserMembersAlphabetically(members)
    });
  };

  // Helper function to handle member click and load notes
  const handleMemberClick = async (member: KaiserMember) => {
    setMemberNotesModal({
      isOpen: true,
      member,
      notes: [],
      isLoadingNotes: true,
      lastSyncAt: '',
      existingNotesCount: 0,
      newNotesCount: 0,
      didSync: false,
    });

    try {
      // Open behavior: load existing saved notes only (no Caspio sync on modal open).
      const response = await fetch(`/api/member-notes?clientId2=${member.client_ID2}&skipSync=true`);
      const parsed = await parseApiJson(response);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const data = parsed.data;
      
      if (data.success) {
        setMemberNotesModal(prev => ({
          ...prev,
          notes: data.notes || [],
          isLoadingNotes: false,
          lastSyncAt: String(data?.syncLastAt || ''),
          existingNotesCount: Number(data?.existingNotesCount || data?.notes?.length || 0),
          newNotesCount: Number(data?.newNotesCount || 0),
          didSync: false,
        }));
        
        toast({
          title: 'Saved notes loaded',
          description: `${data.notes?.length || 0} notes loaded for ${member.memberFirstName} ${member.memberLastName}`,
        });
      } else {
        throw new Error(data.error || 'Failed to load notes');
      }
      
    } catch (error: any) {
      console.error('Error loading member notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load member notes",
        variant: "destructive"
      });
      
      setMemberNotesModal(prev => ({
        ...prev,
        notes: [],
        isLoadingNotes: false,
        lastSyncAt: '',
        existingNotesCount: 0,
        newNotesCount: 0,
        didSync: false,
      }));
    }
  };

  const syncMemberNotes = async () => {
    const member = memberNotesModal.member;
    if (!member) return;
    setMemberNotesModal((prev) => ({
      ...prev,
      isLoadingNotes: true,
    }));
    try {
      // Sync behavior: incremental by default, with one-time empty-store repair.
      const response = await fetch(
        `/api/member-notes?clientId2=${member.client_ID2}&forceSync=false&skipSync=false&repairIfEmpty=true`
      );
      const parsed = await parseApiJson(response);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const data = parsed.data;
      if (!data.success) {
        throw new Error(data.error || 'Failed to sync notes');
      }
      setMemberNotesModal((prev) => ({
        ...prev,
        notes: data.notes || [],
        isLoadingNotes: false,
        lastSyncAt: String(data?.syncLastAt || ''),
        existingNotesCount: Number(data?.existingNotesCount || 0),
        newNotesCount: Number(data?.newNotesCount || 0),
        didSync: true,
      }));
      bumpNotesMetaRefresh();
      toast({
        title: 'Notes sync complete',
        description: `${data?.existingNotesCount || 0} existing + ${data?.newNotesCount || 0} new notes for ${member.memberFirstName} ${member.memberLastName}`,
      });
    } catch (error: any) {
      console.error('Error syncing member notes:', error);
      setMemberNotesModal((prev) => ({
        ...prev,
        isLoadingNotes: false,
      }));
      toast({
        title: 'Sync failed',
        description: error?.message || 'Could not refresh member notes.',
        variant: 'destructive',
      });
    }
  };

  const syncNotesForModalCategory = async (categoryMembers: KaiserMember[]) => {
    if (notesGlobalSyncing) return;
    stopAllSyncRef.current = false;
    const scope = Array.isArray(categoryMembers)
      ? categoryMembers.filter((m) => String(m?.client_ID2 || '').trim())
      : [];
    if (scope.length === 0) {
      toast({
        title: 'No members in scope',
        description: 'No members are available in this category to sync.',
      });
      return;
    }
    try {
      await syncGlobalLatestNotes(scope, {
        quiet: true,
        scopeLabel: modalTitle || 'Kaiser status category',
        includeAllMembers: true,
      });
      if (stopAllSyncRef.current) {
        toast({
          title: 'Notes sync stopped',
          description: `Stopped sync for ${modalTitle || 'selected category'}.`,
        });
        return;
      }
      toast({
        title: 'Category notes synced',
        description: `Processed ${scope.length} member${scope.length === 1 ? '' : 's'} in ${modalTitle || 'selected category'}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Category notes sync failed',
        description: error?.message || 'Could not sync notes for this category.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (!members.length) return;
    const clientId2 = searchParams.get('clientId2');
    if (!clientId2) return;
    const target = members.find((member) => member.client_ID2 === clientId2);
    if (!target) return;
    deepLinkHandledRef.current = true;
    handleMemberClick(target);
  }, [members, searchParams]);

  // Helper functions
  const loadKaiserStatusOptions = async () => {
    setStatusListLoading(true);
    try {
      if (!auth?.currentUser) {
        setKaiserStatusOptions(ensureCaseClosedStatusOption([...FALLBACK_KAISER_STATUS_ORDER]));
        setKaiserStatusListUpdatedAtLabel('Using built-in status list (not signed in)');
        return;
      }

      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-statuses/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to load Kaiser status list');
      }

      const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
      const options = rows
        .map((r: any) => String(r?.status || '').trim())
        .filter(Boolean)
        .map((s: string) => normalizeKaiserStatusName(s));
      const unique = Array.from(new Set(options));
      const next = unique.length > 0 ? unique : [...FALLBACK_KAISER_STATUS_ORDER];
      setKaiserStatusOptions(ensureCaseClosedStatusOption(next));

      const updatedAt = String((data as any)?.updatedAt || '').trim();
      const byEmail = String((data as any)?.updatedByEmail || '').trim();
      setKaiserStatusListUpdatedAtLabel(
        updatedAt
          ? `Status list last updated: ${updatedAt}${byEmail ? ` by ${byEmail}` : ''}`
          : 'Status list not yet synced'
      );
    } catch (e: any) {
      console.error('Failed to load Kaiser status list:', e);
      setKaiserStatusOptions(ensureCaseClosedStatusOption([...FALLBACK_KAISER_STATUS_ORDER]));
      setKaiserStatusListUpdatedAtLabel('Using built-in status list (load failed)');
    } finally {
      setStatusListLoading(false);
    }
  };

  const transformKaiserMembers = (data: any[]): KaiserMember[] => {
    return data.map((member: any, index: number) => {
      const rawStaff =
        member?.Staff_Assigned ||
        member?.Staff_Assignment ||
        member?.Assigned_Staff ||
        member?.Kaiser_User_Assignment ||
        member?.kaiser_user_assignment ||
        member?.SW_ID ||
        '';
      const staffVal = rawStaff != null ? String(rawStaff).trim() : '';
      const staffAssigned = !staffVal || /^\d+$/.test(staffVal) ? '' : staffVal;
      return {
        ...member,
        id: member?.id || `frontend-member-${index}-${member?.Client_ID2 || Math.random().toString(36).substring(7)}`,
        memberFirstName: member?.memberFirstName || 'Unknown',
        memberLastName: member?.memberLastName || 'Member',
        memberMrn: member?.memberMrn || '',
        memberCounty: member?.memberCounty || 'Unknown',
        memberPhone: member?.memberPhone || '',
        memberEmail: member?.memberEmail || '',
        client_ID2: member?.Client_ID2 || 'N/A',
        pathway: member?.pathway || 'Unknown',
        Kaiser_Status: member?.Kaiser_Status || member?.Kaiser_ID_Status || '',
        CalAIM_Status: toCanonicalCalaimStatus(
          member?.CalAIM_Status ??
            member?.calaim_status ??
            member?.CALAIM_STATUS ??
            member?.CalAIMStatus ??
            ''
        ),
        Staff_Assigned: staffAssigned,
        RCFE_Name: member?.RCFE_Name || '',
        RCFE_Admin_Name: member?.RCFE_Admin_Name || member?.RCFE_Administrator || member?.RCFE_Admin || '',
        RCFE_Admin_Email: member?.RCFE_Admin_Email || member?.RCFE_Administrator_Email || '',
        Authorization_End_Date_T2038: member?.Authorization_End_Date_T2038 || member?.Authorization_End_T2038 || '',
        Next_Step_Due_Date: member?.Next_Step_Due_Date || '',
        workflow_step: member?.workflow_step || '',
        workflow_notes: member?.workflow_notes || '',
        last_updated: member?.lastUpdated || new Date().toISOString(),
        created_at: member?.created_at || new Date().toISOString()
      };
    });
  };

  const loadCachedMembers = async (opts?: { quiet?: boolean }) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/kaiser-members');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch Kaiser members');
      }

      const cleanMembers = transformKaiserMembers(responseData.members || []);
      setMembers(cleanMembers);

      if (!opts?.quiet) {
        toast({
          title: 'Members loaded',
          description: `Loaded ${cleanMembers.length} Kaiser members from cache.`,
        });
      }
      return cleanMembers as KaiserMember[];
    } catch (error) {
      console.error('Error loading cached Kaiser members:', error);
      if (!opts?.quiet) {
        toast({
          title: 'Load failed',
          description: 'Failed to load cached Kaiser members.',
          variant: 'destructive',
        });
      }
      return [] as KaiserMember[];
    } finally {
      setIsLoading(false);
    }
  };

  const refreshNoActionStatuses = async () => {
    if (notesGlobalSyncing) return;
    stopAllSyncRef.current = false;
    const scope = members;
    if (scope.length === 0) {
      toast({
        title: 'No members in scope',
        description: 'No members available to sync notes.',
      });
      return;
    }
    await syncGlobalLatestNotes(scope, {
      scopeLabel: 'No Action 7+ Days',
      includeAllMembers: true,
    });
  };

  const syncGlobalLatestNotes = async (
    scopeOverride?: KaiserMember[],
    opts?: { quiet?: boolean; scopeLabel?: string; includeAllMembers?: boolean }
  ) => {
    if (notesGlobalSyncing) return;

    const base = Array.isArray(scopeOverride) && scopeOverride.length > 0 ? scopeOverride : members;
    const scope = opts?.includeAllMembers
      ? base
      : base.filter((member) => isAuthorizedOrPendingCalaim(member?.CalAIM_Status));
    if (scope.length === 0) {
      if (!opts?.quiet) {
        toast({
          title: 'No members in scope',
          description: opts?.includeAllMembers
            ? 'No members available for notes sync.'
            : 'No Authorized/Pending Kaiser members available for global notes sync.',
        });
      }
      return;
    }

    setNotesGlobalSyncing(true);
    setNotesGlobalProgress({
      total: scope.length,
      complete: 0,
      success: 0,
      failed: 0,
      existingNotes: 0,
      newNotes: 0,
      lastSyncAt: '',
      currentMember: '',
      scopeLabel: String(opts?.scopeLabel || '').trim() || 'All scoped members',
      stopped: false,
      recentErrors: [],
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let aggExisting = 0;
    let aggNew = 0;
    let aggSuccess = 0;
    let aggFailed = 0;
    const addRecentError = (msg: string) =>
      setNotesGlobalProgress((prev) =>
        prev ? { ...prev, recentErrors: [msg, ...prev.recentErrors].slice(0, 5) } : prev
      );

    try {
      let cursor = 0;
      // Keep worker fan-out conservative to avoid Firestore write-rate spikes during bulk note sync.
      const workerCount = Math.min(3, Math.max(1, scope.length));
      const worker = async () => {
        while (true) {
          if (stopAllSyncRef.current) return;
          const idx = cursor;
          cursor += 1;
          if (idx >= scope.length) return;
          const member = scope[idx];
          if (stopAllSyncRef.current) return;
          setNotesGlobalProgress((prev) =>
            prev ? { ...prev, currentMember: `${member.memberLastName}, ${member.memberFirstName}` } : prev
          );

          let completed = false;
          let lastError: any = null;
          for (let attempt = 1; attempt <= 3 && !completed; attempt++) {
            if (stopAllSyncRef.current) return;
            const controller = new AbortController();
            notesFetchControllersRef.current.add(controller);
            try {
              const res = await fetch(
                `/api/member-notes?clientId2=${encodeURIComponent(
                  member.client_ID2
                )}&forceSync=false&skipSync=false&repairIfEmpty=true&summaryOnly=true`,
                { signal: controller.signal }
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data?.success) {
                throw new Error(data?.error || 'Failed to sync notes');
              }
              const existingCount = Number(data?.existingNotesCount || 0);
              const newCount = Number(data?.newNotesCount || 0);
              aggExisting += existingCount;
              aggNew += newCount;
              aggSuccess += 1;
              setNotesGlobalProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      complete: prev.complete + 1,
                      success: prev.success + 1,
                      existingNotes: prev.existingNotes + existingCount,
                      newNotes: prev.newNotes + newCount,
                    }
                  : prev
              );
              completed = true;
            } catch (error: any) {
              if (String(error?.name || '').toLowerCase() === 'aborterror') return;
              lastError = error;
              if (attempt < 3 && String(error?.message || '').toLowerCase().includes('429')) {
                const backoffMs = Math.min(10000, 2000 * Math.pow(2, attempt - 1));
                await delay(backoffMs);
              } else if (attempt < 3) {
                await delay(200);
              }
            } finally {
              notesFetchControllersRef.current.delete(controller);
            }
          }

          if (!completed && !stopAllSyncRef.current) {
            const label = `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2})`;
            addRecentError(`${label}: ${String(lastError?.message || 'Unknown sync error')}`);
            aggFailed += 1;
            setNotesGlobalProgress((prev) =>
              prev ? { ...prev, complete: prev.complete + 1, failed: prev.failed + 1 } : prev
            );
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const completedAt = new Date().toISOString();
      setNotesGlobalProgress((prev) =>
        prev
          ? {
              ...prev,
              currentMember: '',
              lastSyncAt: completedAt,
              stopped: stopAllSyncRef.current ? true : prev.stopped,
            }
          : prev
      );
      if (!opts?.quiet) {
        toast({
          title: stopAllSyncRef.current ? 'Notes sync stopped' : 'Notes sync complete',
          description: `Processed ${aggSuccess + aggFailed} of ${scope.length} members (${aggSuccess} success, ${aggFailed} failed). Historical loaded: ${aggExisting} • New added: ${aggNew}.`,
        });
      }
    } catch (error: any) {
      if (!opts?.quiet) {
        toast({
          title: 'Global notes sync failed',
          description: error?.message || 'Could not complete global notes sync.',
          variant: 'destructive',
        });
      }
    } finally {
      notesFetchControllersRef.current.clear();
      setNotesGlobalSyncing(false);
      bumpNotesMetaRefresh();
    }
  };

  // Filter and sort results
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      if (filters.kaiserStatus !== 'all' && getEffectiveKaiserStatus(member) !== filters.kaiserStatus) return false;
      if (filters.calaimStatus !== 'all') {
        const normalized = normalizeCalaimStatus(member.CalAIM_Status || '');
        if (CALAIM_STATUS_MAP[normalized] !== filters.calaimStatus) return false;
      }
      if (filters.county !== 'all' && member.memberCounty !== filters.county) return false;
      if (filters.staffAssigned !== 'all' && getStaffAssignmentValue(member) !== filters.staffAssigned) return false;
      return true;
    });
  }, [members, filters, normalizeCalaimStatus]);

  const sortedMembers = useMemo(
    () =>
      [...filteredMembers].sort((a, b) => {
        if (!sortField) return 0;
        
        let aValue: any = '';
        let bValue: any = '';
        
        switch (sortField) {
          case 'name':
            aValue = `${a.memberFirstName} ${a.memberLastName}`;
            bValue = `${b.memberFirstName} ${b.memberLastName}`;
            break;
          case 'county':
            aValue = a.memberCounty;
            bValue = b.memberCounty;
            break;
          case 'kaiser_status':
            aValue = getEffectiveKaiserStatus(a);
            bValue = getEffectiveKaiserStatus(b);
            break;
          case 'calaim_status':
            aValue = a.CalAIM_Status;
            bValue = b.CalAIM_Status;
            break;
          case 'staff':
            aValue = getStaffAssignmentValue(a);
            bValue = getStaffAssignmentValue(b);
            break;
          default:
            return 0;
        }
          
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }),
    [filteredMembers, sortField, sortDirection]
  );

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon
  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Handle filter changes
  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      kaiserStatus: 'all',
      calaimStatus: 'all',
      county: 'all',
      staffAssigned: 'all',
    });
  };

  // Get unique values for filter dropdowns
  const allKaiserStatuses = useMemo(() => {
    const known = kaiserStatusOptions;
    const dedupeByNormalized = (values: string[]) => {
      const seen = new Set<string>();
      const deduped: string[] = [];
      values.forEach((value) => {
        const normalized = normalizeStatusText(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        deduped.push(value);
      });
      return deduped;
    };
    const seen = new Set<string>();
    for (const m of members) {
      const s = getEffectiveKaiserStatus(m);
      if (s) seen.add(s);
    }
    const unknown = Array.from(seen)
      .filter((s) => !known.includes(s) && s !== 'Unknown')
      .sort();
    const withUnknown = known.includes('Unknown') ? known : [...known, 'Unknown'];
    const merged = dedupeByNormalized([...withUnknown, ...unknown]);
    const normalizeTargets = (target: string) => {
      const aliases = PINNED_TOP_STATUS_ALIASES[target] || [];
      return new Set([normalizeStatusText(target), ...aliases.map((a) => normalizeStatusText(a))]);
    };

    const orderedPinned: string[] = [];
    const used = new Set<string>();

    PINNED_TOP_STATUSES.forEach((target) => {
      const normalizedTargets = normalizeTargets(target);
      const match = merged.find((status) => normalizedTargets.has(normalizeStatusText(status)));
      if (!match) return;
      const normalizedMatch = normalizeStatusText(match);
      if (used.has(normalizedMatch)) return;
      used.add(normalizedMatch);
      orderedPinned.push(match);
    });

    const remaining = merged.filter((status) => !used.has(normalizeStatusText(status)));
    return [...orderedPinned, ...remaining];
  }, [kaiserStatusOptions, members]);
  const availableCounties = [...new Set(members.map(m => m.memberCounty).filter(Boolean))];
  const availableCalAIMStatuses = CALAIM_STATUS_OPTIONS;
  const staffMembers = [
    ...new Set(
      members
        .filter((m) => isAuthorizedOrPendingCalaim(m?.CalAIM_Status))
        .map((m) => getStaffAssignmentValue(m))
        .filter(Boolean)
        .map(String)
        .filter((name) => !isCaseClosedStatus(name))
    ),
  ];

  // Load data on component mount
  useEffect(() => {
    // Morning load path: read from Firestore cache without forcing a full Caspio sync.
    void loadCachedMembers({ quiet: true });
    void loadKaiserStatusOptions();
  }, []);

  if (isAdminLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kaiser Tracker Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Overview of {members.length} Kaiser members | Authorized CalAIM: {authorizedCalaimCount} | Members cache sync (ET):{' '}
            {formatEtDateTime(membersCacheLastSyncAt)}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Automatic updates are enabled: Caspio sync + cached member/status refresh run without manual pulls in normal operations.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {statusListLoading ? 'Loading Kaiser status list…' : (kaiserStatusListUpdatedAtLabel || ' ')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/admin/kaiser-tracker/rcfe-weekly-confirm">
              RCFE Biweekly Follow-Up (R&B/Final)
            </Link>
          </Button>
        </div>
      </div>

      {notesGlobalProgress ? (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Staff notes sync progress ({notesGlobalProgress.scopeLabel})</span>
              <span>
                {notesGlobalProgress.complete}/{notesGlobalProgress.total}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-200 overflow-hidden">
              <div
                className="h-2 bg-blue-600"
                style={{
                  width: `${notesGlobalProgress.total > 0 ? (notesGlobalProgress.complete / notesGlobalProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Success: {notesGlobalProgress.success} • Failed: {notesGlobalProgress.failed} • Historical loaded: {notesGlobalProgress.existingNotes} • New added: {notesGlobalProgress.newNotes}
              </span>
              <span>{notesGlobalProgress.stopped ? 'Stopped' : (notesGlobalProgress.currentMember || '')}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Last notes sync run (ET): {formatEtDateTime(notesGlobalProgress.lastSyncAt)}
            </div>
            {notesGlobalProgress.recentErrors.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="font-medium mb-1">Recent sync errors</div>
                <div className="space-y-1">
                  {notesGlobalProgress.recentErrors.map((err, idx) => (
                    <div key={`${err}-${idx}`} className="truncate" title={err}>
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Interactive Filtering Message */}
      {members.length > 0 && (
        <p className="text-sm text-gray-600 mb-4 text-center">
          Click on any status or staff member to view assigned members
        </p>
      )}

      {/* Member Search (moved to top of page content) */}
      <MemberSearchCard members={members} searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />

      {/* Summary Cards - Compact */}
      <KaiserSummaryCards
        members={members}
        allKaiserStatuses={allKaiserStatuses}
        counties={COUNTIES}
        calaimStatusOptions={CALAIM_STATUS_OPTIONS}
        calaimStatusMap={CALAIM_STATUS_MAP}
        normalizeCalaimStatus={normalizeCalaimStatus}
        openMemberModal={openMemberModal}
        onRefreshNoAction={() => void refreshNoActionStatuses()}
        isRefreshingNoAction={notesGlobalSyncing && notesGlobalProgress?.scopeLabel === 'No Action 7+ Days'}
        onNoActionByStaffComputed={handleNoActionByStaffComputed}
      />

      <KaiserStaffAssignments
        allStaff={allStaff}
        staffAssignments={staffAssignments as any}
        openStaffMemberModal={openStaffMemberModal}
        openMemberModal={openMemberModal}
        noActionByStaff={noActionByStaffMap}
        noActionScopedStatuses={NO_ACTION_SCOPED_STATUSES}
        onRefreshNoAction={
          isSuperAdmin || isKaiserManager ? () => void refreshNoActionStatuses() : undefined
        }
        isRefreshingNoAction={notesGlobalSyncing && notesGlobalProgress?.scopeLabel === 'No Action 7+ Days'}
        notesSyncLastAtLabel={formatEtDateTime(notesGlobalProgress?.lastSyncAt || '')}
      />

      {/* Member List Modal */}
      <MemberListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        members={modalMembers}
        title={modalTitle}
        description={modalDescription}
        onMemberClick={handleMemberClick}
        onSyncAllMemberNotes={(rows) => void syncNotesForModalCategory(rows)}
        isSyncingAllNotes={notesGlobalSyncing}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        allKaiserStatuses={allKaiserStatuses}
        availableCounties={availableCounties}
        availableCalAIMStatuses={availableCalAIMStatuses}
        staffMembers={staffMembers}
      />

      <StaffMemberManagementModal
        isOpen={staffMemberModal.isOpen}
        onClose={() => setStaffMemberModal({ isOpen: false, staffName: '', members: [] })}
        staffName={staffMemberModal.staffName}
        members={staffMemberModal.members}
        onMemberUpdate={() => {
          void loadCachedMembers({ quiet: true });
        }}
      />

      <MemberNotesModal
        isOpen={memberNotesModal.isOpen}
        onClose={() =>
          setMemberNotesModal({
            isOpen: false,
            member: null,
            notes: [],
            isLoadingNotes: false,
            lastSyncAt: '',
            existingNotesCount: 0,
            newNotesCount: 0,
            didSync: false,
          })
        }
        member={memberNotesModal.member}
        notes={memberNotesModal.notes}
        isLoadingNotes={memberNotesModal.isLoadingNotes}
        lastSyncAt={memberNotesModal.lastSyncAt}
        existingNotesCount={memberNotesModal.existingNotesCount}
        newNotesCount={memberNotesModal.newNotesCount}
        didSync={memberNotesModal.didSync}
        onSyncNotes={syncMemberNotes}
      />
            </div>
  );
}

export default function KaiserTrackerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Kaiser tracker...</div>}>
      <KaiserTrackerPageContent />
    </Suspense>
  );
}