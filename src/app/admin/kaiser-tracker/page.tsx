'use client';

import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
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
  MessageSquare
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
    'Denied': <XCircle className="h-3 w-3" />,
    'Expired': <AlertTriangle className="h-3 w-3" />,
    'T2038 Requested': <FileText className="h-3 w-3" />,
    'RN Visit Complete': <CheckCircle className="h-3 w-3" />,
    'Tier Level Requested': <FileText className="h-3 w-3" />,
    'Tier Level Received': <CheckCircle className="h-3 w-3" />,
    'RN/MSW Scheduled': <Calendar className="h-3 w-3" />,
    'R&B Requested': <FileText className="h-3 w-3" />,
    'R&B Signed': <CheckCircle className="h-3 w-3" />,
    'T2038 received, doc collection': <FileText className="h-3 w-3" />,
    'T2038 received, Need First Contact': <Phone className="h-3 w-3" />,
    'Tier Level Appeal': <AlertTriangle className="h-3 w-3" />,
    'Tier Level Request Needed': <FileText className="h-3 w-3" />,
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
    'ILS/RCFE_Member_At_RCFE_Confirmed': <CheckCircle className="h-3 w-3" />
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
  'RN Visit Complete': { next: 'Tier Level Request Needed', recommendedDays: 3 },
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
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const CALAIM_STATUS_MAP = CALAIM_STATUS_OPTIONS.reduce((acc, status) => {
  acc[normalizeCalaimStatus(status)] = status;
  return acc;
}, {} as Record<string, string>);

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

function KaiserTrackerPageContent() {
  const { isAdmin, isLoading: isAdminLoading, user } = useAdmin();
  const { toast } = useToast();
  const auth = useAuth();
  const searchParams = useSearchParams();

  // State declarations
  const [isLoading, setIsLoading] = useState(false);
  const [statusListLoading, setStatusListLoading] = useState(false);
  const [statusListSyncing, setStatusListSyncing] = useState(false);
  const [kaiserStatusOptions, setKaiserStatusOptions] = useState<string[]>([...FALLBACK_KAISER_STATUS_ORDER]);
  const [kaiserStatusListUpdatedAtLabel, setKaiserStatusListUpdatedAtLabel] = useState<string>('');
  const [members, setMembers] = useState<KaiserMember[]>([]);
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

  // Member notes modal state
  const [memberNotesModal, setMemberNotesModal] = useState<{
    isOpen: boolean;
    member: KaiserMember | null;
    notes: any[];
    isLoadingNotes: boolean;
  }>({ isOpen: false, member: null, notes: [], isLoadingNotes: false });

  const [newNote, setNewNote] = useState({
    noteText: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High' | 'Urgent',
    assignedTo: '',
    assignedToName: '',
    followUpDate: ''
  });
  const [filters, setFilters] = useState({
    kaiserStatus: 'all',
    calaimStatus: 'all',
    county: 'all',
    staffAssigned: 'all'
  });

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

  // Calculate staff assignments dynamically from actual data
  const staffAssignments = useMemo(() => {
    const assignments: Record<string, { 
      count: number; 
      members: any[];
      statusBreakdown: Record<string, number>;
    }> = {};
    
    // Count members assigned to each staff (including unassigned)
    const normalizeLabel = (value: any, fallback: string) =>
      value ? String(value) : fallback;

    members.forEach(member => {
      // Use normalized staff so numeric IDs (107, 224, 33, 48) count as Unassigned
      const staffName = normalizeStaffForSummary(String(member.Kaiser_User_Assignment || member.Staff_Assigned || '').trim());
      
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


  // Helper function to open member list modal
  const openMemberModal = (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'staff_members',
    filterValue: string
  ) => {
    setModalMembers(memberList);
    setModalTitle(title);
    setModalDescription(description);
    setModalFilterType(filterType);
    setModalFilterValue(filterValue);
    setModalOpen(true);
  };

  // Helper function to open staff member management modal
  const openStaffMemberModal = (staffName: string, members: KaiserMember[]) => {
    console.log('🔍 Opening staff member modal for:', staffName, 'with', members.length, 'members');
    setStaffMemberModal({
      isOpen: true,
      staffName,
      members
    });
  };

  // Helper function to handle member click and load notes
  const handleMemberClick = async (member: KaiserMember) => {
    setMemberNotesModal({
      isOpen: true,
      member,
      notes: [],
      isLoadingNotes: true
    });

    try {
      // Fetch member notes
      const response = await fetch(`/api/member-notes?clientId2=${member.client_ID2}`);
      const data = await response.json();
      
      if (data.success) {
        setMemberNotesModal(prev => ({
          ...prev,
          notes: data.notes || [],
          isLoadingNotes: false
        }));
        
        toast({
          title: data.fromCache ? "Notes Loaded from Cache" : "Notes Synced from Caspio",
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
        isLoadingNotes: false
      }));
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

  // Helper function to create a new note
  const handleCreateNote = async () => {
    if (!memberNotesModal.member || !newNote.noteText.trim()) {
      toast({
        title: "Error",
        description: "Please enter note content",
        variant: "destructive"
      });
      return;
    }

    try {
      const noteData = {
        clientId2: memberNotesModal.member.client_ID2,
        memberName: `${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}`,
        noteText: newNote.noteText,
        priority: newNote.priority,
        assignedTo: newNote.assignedTo || undefined,
        assignedToName: newNote.assignedToName || undefined,
        followUpDate: newNote.followUpDate || undefined,
        authorId: user?.uid || 'current-user',
        authorName: user?.displayName || user?.email || 'Current User'
      };

      const response = await fetch('/api/member-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      const data = await response.json();

      if (data.success) {
        // Update the member's notes
        setMemberNotesModal(prev => ({
          ...prev,
          notes: [data.note, ...prev.notes]
        }));

        // Reset form
        setNewNote({
          noteText: '',
          priority: 'Medium',
          assignedTo: '',
          assignedToName: '',
          followUpDate: ''
        });

        toast({
          title: "Note Created",
          description: `Note added for ${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}${newNote.assignedToName ? ` and assigned to ${newNote.assignedToName}` : ''}`,
        });

        // Show notification if assigned to staff
        if (newNote.assignedTo && newNote.assignedToName) {
          // Trigger staff notification
          await fetch('/api/staff/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'note_assignment',
              title: 'New Note Assigned',
              message: `You have been assigned a ${newNote.priority.toLowerCase()} priority note for ${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}`,
              noteId: data.note.id,
              clientId2: memberNotesModal.member.client_ID2,
              memberName: `${memberNotesModal.member.memberFirstName} ${memberNotesModal.member.memberLastName}`,
              priority: newNote.priority,
              assignedTo: newNote.assignedTo,
              createdBy: user?.uid || 'current-user',
              createdByName: user?.displayName || user?.email || 'Current User'
            })
          });

          toast({
            title: "Notification Sent",
            description: `${newNote.assignedToName} has been notified`,
          });
        }
      } else {
        throw new Error(data.error || 'Failed to create note');
      }

    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive"
      });
    }
  };

  // Helper functions
  const loadKaiserStatusOptions = async () => {
    setStatusListLoading(true);
    try {
      if (!auth?.currentUser) {
        setKaiserStatusOptions([...FALLBACK_KAISER_STATUS_ORDER]);
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
      setKaiserStatusOptions(unique.length > 0 ? unique : [...FALLBACK_KAISER_STATUS_ORDER]);

      const updatedAt = String((data as any)?.updatedAt || '').trim();
      const byEmail = String((data as any)?.updatedByEmail || '').trim();
      setKaiserStatusListUpdatedAtLabel(
        updatedAt
          ? `Status list last updated: ${updatedAt}${byEmail ? ` by ${byEmail}` : ''}`
          : 'Status list not yet synced'
      );
    } catch (e: any) {
      console.error('Failed to load Kaiser status list:', e);
      setKaiserStatusOptions([...FALLBACK_KAISER_STATUS_ORDER]);
      setKaiserStatusListUpdatedAtLabel('Using built-in status list (load failed)');
    } finally {
      setStatusListLoading(false);
    }
  };

  const syncKaiserStatusOptions = async (opts?: { quiet?: boolean }) => {
    setStatusListSyncing(true);
    try {
      if (!auth?.currentUser) {
        throw new Error('You must be signed in to sync.');
      }
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-statuses/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to sync Kaiser status list');
      }

      const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
      const options = rows
        .map((r: any) => String(r?.status || '').trim())
        .filter(Boolean)
        .map((s: string) => normalizeKaiserStatusName(s));
      const unique = Array.from(new Set(options));
      setKaiserStatusOptions(unique.length > 0 ? unique : [...FALLBACK_KAISER_STATUS_ORDER]);

      if (!opts?.quiet) {
        toast({
          title: 'Kaiser status list synced',
          description: `Loaded ${unique.length || rows.length || 0} statuses from Caspio`,
        });
      }

      await loadKaiserStatusOptions();
    } catch (e: any) {
      console.error('Failed to sync Kaiser statuses:', e);
      if (!opts?.quiet) {
        toast({
          title: 'Status sync failed',
          description: e?.message || 'Could not sync Kaiser statuses from Caspio',
          variant: 'destructive',
        });
      }
    } finally {
      setStatusListSyncing(false);
    }
  };

  // Fetch Kaiser members from Caspio
  const fetchCaspioData = async (opts?: { quiet?: boolean }) => {
    setIsLoading(true);
    try {
      if (!auth?.currentUser) {
        throw new Error('You must be signed in to sync.');
      }

      // On-demand incremental sync from Caspio → Firestore cache.
      const idToken = await auth.currentUser.getIdToken();
      const syncRes = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'incremental' }),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || !(syncData as any)?.success) {
        throw new Error((syncData as any)?.error || 'Failed to sync members cache');
      }

      const response = await fetch('/api/kaiser-members');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      
      // Check if the response has the expected structure
      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch Kaiser members');
      }
      
      // Extract the members array from the response
      const data = responseData.members || [];
      
      // Debug staff assignment fields specifically
      if (data.length > 0) {
        const firstMember = data[0];
        console.log('🔍 FRONTEND STAFF ASSIGNMENT DEBUG - Available fields in first member:', {
          Kaiser_User_Assignment: firstMember?.Kaiser_User_Assignment,
          kaiser_user_assignment: firstMember?.kaiser_user_assignment,
          SW_ID: firstMember?.SW_ID,
          Staff_Assignment: firstMember?.Staff_Assignment,
          Assigned_Staff: firstMember?.Assigned_Staff,
          Staff_Assigned: firstMember?.Staff_Assigned,
          allFieldsWithStaff: Object.keys(firstMember).filter(key => 
            key.toLowerCase().includes('staff') || 
            key.toLowerCase().includes('assign') ||
            key.toLowerCase().includes('user')
          )
        });
        
        // Show what Staff_Assigned is actually mapped to
        console.log('🎯 FINAL Staff_Assigned VALUE:', firstMember?.Staff_Assigned);
        
        // Show ALL field names in frontend data
        console.log('🔍 FRONTEND ALL FIELDS:', Object.keys(firstMember).sort());
      }
      
      // Clean and process the data (numeric-only staff IDs → treat as unassigned)
      const cleanMembers = data.map((member: any, index: number) => {
        const rawStaff = member?.Kaiser_User_Assignment || member?.kaiser_user_assignment || member?.SW_ID || '';
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
          CalAIM_Status: member?.CalAIM_Status || 'No Status',
          Staff_Assigned: staffAssigned,
          Next_Step_Due_Date: member?.Next_Step_Due_Date || '',
          workflow_step: member?.workflow_step || '',
          workflow_notes: member?.workflow_notes || '',
          last_updated: member?.lastUpdated || new Date().toISOString(),
          created_at: member?.created_at || new Date().toISOString()
        };
      });

      setMembers(cleanMembers);
      
      if (!opts?.quiet) {
        toast({
          title: "Data synced",
          description: `Loaded ${cleanMembers.length} Kaiser members`,
        });
      }
    } catch (error) {
      console.error('Error fetching Kaiser members:', error);
      if (!opts?.quiet) {
        toast({
          title: "Sync failed",
          description: "Failed to load Kaiser members. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const syncAll = async () => {
    if (isLoading || statusListSyncing) return;
    try {
      await Promise.all([syncKaiserStatusOptions({ quiet: true }), fetchCaspioData({ quiet: true })]);
      toast({
        title: 'Synced',
        description: 'Updated members cache + Kaiser status list (includes Kaiser & CalAIM status).',
      });
    } catch (e: any) {
      toast({
        title: 'Sync failed',
        description: e?.message || 'Could not sync members and statuses.',
        variant: 'destructive',
      });
    }
  };

  // Filter and sort functions
  const filteredMembers = () => {
    return members.filter(member => {
      if (filters.kaiserStatus !== 'all' && getEffectiveKaiserStatus(member) !== filters.kaiserStatus) return false;
      if (filters.calaimStatus !== 'all') {
        const normalized = normalizeCalaimStatus(member.CalAIM_Status || '');
        if (CALAIM_STATUS_MAP[normalized] !== filters.calaimStatus) return false;
      }
      if (filters.county !== 'all' && member.memberCounty !== filters.county) return false;
      if (filters.staffAssigned !== 'all' && String(member.Kaiser_User_Assignment || member.Staff_Assigned || '') !== filters.staffAssigned) return false;
      return true;
    });
  };

  const sortedMembers = filteredMembers().sort((a, b) => {
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
        aValue = String(a.Kaiser_User_Assignment || a.Staff_Assigned || '');
        bValue = String(b.Kaiser_User_Assignment || b.Staff_Assigned || '');
              break;
            default:
              return 0;
          }
          
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
  });

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
    const seen = new Set<string>();
    for (const m of members) {
      const s = getEffectiveKaiserStatus(m);
      if (s) seen.add(s);
    }
    const unknown = Array.from(seen)
      .filter((s) => !known.includes(s) && s !== 'Unknown')
      .sort();
    const withUnknown = known.includes('Unknown') ? known : [...known, 'Unknown'];
    return [...withUnknown, ...unknown];
  }, [kaiserStatusOptions, members]);
  const availableCounties = [...new Set(members.map(m => m.memberCounty).filter(Boolean))];
  const availableCalAIMStatuses = CALAIM_STATUS_OPTIONS;
  const staffMembers = [...new Set(members.map(m => String(m.Kaiser_User_Assignment || m.Staff_Assigned || '')).filter(Boolean).map(String))];

  // Load data on component mount
  useEffect(() => {
    // Only fetch data when user manually clicks sync button, not on page load
    // fetchCaspioData();
    loadKaiserStatusOptions();
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
            Overview of {members.length} Kaiser members | Last sync: {members.length > 0 ? new Date().toLocaleString() : 'Never'}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {statusListLoading ? 'Loading Kaiser status list…' : (kaiserStatusListUpdatedAtLabel || ' ')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            onClick={() => void syncAll()}
            disabled={isLoading || statusListSyncing || statusListLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading || statusListSyncing ? 'animate-spin' : ''}`} />
            {isLoading || statusListSyncing ? 'Syncing…' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Interactive Filtering Message */}
      {members.length > 0 && (
        <p className="text-sm text-gray-600 mb-4 text-center">
          Click on any status or staff member to view assigned members
        </p>
      )}

      {/* Summary Cards - Compact */}
      <KaiserSummaryCards
        members={members}
        allKaiserStatuses={allKaiserStatuses}
        counties={COUNTIES}
        calaimStatusOptions={CALAIM_STATUS_OPTIONS}
        calaimStatusMap={CALAIM_STATUS_MAP}
        normalizeCalaimStatus={normalizeCalaimStatus}
        openMemberModal={openMemberModal}
      />

      <KaiserStaffAssignments
        allStaff={allStaff}
        staffAssignments={staffAssignments as any}
        openStaffMemberModal={openStaffMemberModal}
        openMemberModal={openMemberModal}
      />

      <MemberSearchCard members={members} searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />

      {/* Member List Modal */}
      <MemberListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        members={modalMembers}
        title={modalTitle}
        description={modalDescription}
        onMemberClick={(member) => {
          // Handle member click if needed
          console.log('Member clicked:', member);
        }}
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
          fetchCaspioData();
        }}
      />

      <MemberNotesModal
        isOpen={memberNotesModal.isOpen}
        onClose={() => setMemberNotesModal({ isOpen: false, member: null, notes: [], isLoadingNotes: false })}
        member={memberNotesModal.member}
        notes={memberNotesModal.notes}
        isLoadingNotes={memberNotesModal.isLoadingNotes}
        newNote={newNote}
        onNewNoteChange={setNewNote}
        onCreateNote={handleCreateNote}
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