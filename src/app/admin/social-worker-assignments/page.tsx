'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Clock, CheckCircle, Calendar, User, RefreshCw, Edit, Users, UserPlus, Search, Filter, ArrowUpDown, ChevronUp, ChevronDown, Pause, Play, MapPinned, Download, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { loadGoogleMaps } from '@/lib/google-maps-loader';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';

interface Member {
  id: string;
  Client_ID2: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  memberCounty: string;
  CalAIM_MCO: string;
  CalAIM_Status: string;
  Social_Worker_Assigned: string;
  SW_One_Time_Kaiser?: string;
  Staff_Assigned: string;
  Hold_For_Social_Worker: string;
  RCFE_Name: string;
  RCFE_Address: string;
  RCFE_Street?: string;
  RCFE_City?: string;
  RCFE_Zip?: string;
  RCFE_Administrator?: string;
  RCFE_Administrator_Email?: string;
  RCFE_Admin_Email?: string;
  RCFE_Administrator_Phone?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Phone?: string;
  Number_of_Beds?: string;
  Authorization_Start_Date_T2038?: string;
  pathway: string;
  last_updated: string;
}

interface RCFEDirectoryRow {
  key: string;
  RCFE_Name: string;
  RCFE_Administrator: string;
  RCFE_Street: string;
  RCFE_City_RCFE_Zip: string;
  RCFE_Administrator_Email: string;
  RCFE_Administrator_Phone: string;
  Number_of_Beds: string;
  memberCount: number;
  memberIds: string[];
  memberNames: string[];
}

interface SocialWorkerStats {
  name: string;
  memberCount: number;
  members: Member[];
  healthNetMembers: Member[];
  kaiserMembers: Member[];
  healthNetAuthorizedCount: number;
  kaiserAuthorizedCount: number;
  mcoBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  countyBreakdown: Record<string, number>;
  rcfeBreakdown: Record<string, number>;
  onHoldCount: number;
  notOnHoldCount: number;
  atRcfeCount: number;
  rcfeUnassignedCount: number;
  monthlyVisitEligibleCount: number;
}

type GeoLatLng = { lat: number; lng: number; formattedAddress: string; cached: boolean };

type GeoAssignedRcfe = {
  rcfeName: string;
  rcfeAddress: string;
  memberCount: number;
  distanceMiles: number;
  county: string | null;
  city: string | null;
  geo: GeoLatLng | null;
  membersSample: Array<{ clientId2: string; memberName: string; memberCounty?: string; memberCity?: string }>;
};

type GeoSw = {
  sw_id: string;
  name: string;
  email?: string;
  address?: string;
  geo: GeoLatLng | null;
  currentAssignedCount: number;
  suggestedMemberCount: number;
  remainingCapacity: number;
  countyBreakdown: Record<string, number>;
  cityBreakdown: Record<string, number>;
  assignedRcfes: GeoAssignedRcfe[];
};

type GeoMemberAssignmentRow = {
  clientId2: string;
  memberName: string;
  memberCounty: string | null;
  memberCity: string | null;
  rcfeName: string;
  rcfeAddress: string;
  rcfeCounty: string | null;
  rcfeCity: string | null;
  suggestedSwId: string;
  suggestedSwName: string;
  suggestedSwEmail: string | null;
  distanceMiles: number;
};

type GeoSuggestResponse = {
  success: boolean;
  capacityPerSw: number;
  maxRcfes: number;
  maxMiles: number | null;
  includeHolds: boolean;
  stats: {
    swTotal: number;
    swWithGeo: number;
    rcfeTotal: number;
    rcfeGeocoded: number;
    assignedRcfes: number;
    overflowRcfes: number;
    assignedMembers: number;
    overflowMembers: number;
    missingSwAddresses: number;
    swGeocodeFailed: number;
  };
  sw: GeoSw[];
  memberAssignments: GeoMemberAssignmentRow[];
  overflow: Array<{
    rcfeName: string;
    rcfeAddress: string;
    memberCount: number;
    county: string | null;
    city: string | null;
    reason: string;
  }>;
};

// Sortable column header component
function SortableHeader({ 
  field, 
  children, 
  currentSortField, 
  currentSortDirection, 
  onSort 
}: { 
  field: string; 
  children: React.ReactNode; 
  currentSortField: string; 
  currentSortDirection: 'asc' | 'desc'; 
  onSort: (field: any) => void; 
}) {
  const isActive = currentSortField === field;
  
  return (
    <TableHead 
      className={`cursor-pointer hover:bg-muted/50 select-none transition-colors ${
        isActive ? 'bg-muted/30' : ''
      }`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-2 font-medium">
        <span className={isActive ? 'text-primary' : ''}>{children}</span>
        {isActive ? (
          currentSortDirection === 'asc' ? (
            <ChevronUp className="h-4 w-4 text-primary" />
          ) : (
            <ChevronDown className="h-4 w-4 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50 group-hover:opacity-75" />
        )}
      </div>
    </TableHead>
  );
}

function GeoAssignmentMap(props: { sw: GeoSw[]; selectedSwId: string; className?: string }) {
  const { sw, selectedSwId, className } = props;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);

  const selected = useMemo(() => sw.find((s) => s.sw_id === selectedSwId) || null, [sw, selectedSwId]);

  const clearOverlays = () => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
  };

  useEffect(() => {
    const init = async () => {
      if (!mapRef.current) return;
      try {
        await loadGoogleMaps();
        if (!mapRef.current) return;
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: 36.7783, lng: -119.4179 },
          zoom: 6,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapInstanceRef.current = map;
      } catch (e: any) {
        setMapError(e?.message || 'Failed to load Google Maps.');
      }
    };
    init();
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    clearOverlays();

    const bounds = new window.google.maps.LatLngBounds();

    // SW markers
    sw.forEach((s) => {
      if (!s.geo) return;
      const isSelected = selectedSwId && s.sw_id === selectedSwId;
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: s.geo.lat, lng: s.geo.lng },
        title: `${s.name} (${s.sw_id})`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 8 : 6,
          fillColor: isSelected ? '#1d4ed8' : '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
    });

    // Selected SW assigned RCFE markers + lines
    if (selected?.geo) {
      selected.assignedRcfes.forEach((r) => {
        if (!r.geo) return;
        const marker = new window.google.maps.Marker({
          map,
          position: { lat: r.geo.lat, lng: r.geo.lng },
          title: `${r.rcfeName} • ${r.memberCount} member(s) • ${r.distanceMiles} mi`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: '#16a34a',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
        markersRef.current.push(marker);
        bounds.extend(marker.getPosition());

        const line = new window.google.maps.Polyline({
          map,
          path: [
            { lat: selected.geo!.lat, lng: selected.geo!.lng },
            { lat: r.geo.lat, lng: r.geo.lng },
          ],
          geodesic: true,
          strokeOpacity: 0.65,
          strokeWeight: 2,
        });
        linesRef.current.push(line);
      });
    }

    // Fit bounds if we have points
    try {
      map.fitBounds(bounds);
      const listener = window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        const z = map.getZoom();
        if (typeof z === 'number' && z > 11) map.setZoom(11);
      });
      return () => window.google.maps.event.removeListener(listener);
    } catch {
      // ignore
    }
  }, [sw, selectedSwId, selected]);

  if (mapError) {
    return (
      <div className={className}>
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">{mapError}</div>
      </div>
    );
  }

  return <div ref={mapRef} className={className || 'h-[460px] w-full rounded-lg border'} />;
}

export default function SocialWorkerAssignmentsPage() {
  const { isAdmin, isLoading } = useAdmin();
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [kaiserAuthorizedMembers, setKaiserAuthorizedMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSocialWorker, setSelectedSocialWorker] = useState('all');
  const [selectedMCO, setSelectedMCO] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCounty, setSelectedCounty] = useState('all');
  const [selectedRCFE, setSelectedRCFE] = useState('all');
  const [selectedHoldStatus, setSelectedHoldStatus] = useState('all');
  const [selectedSwAssignmentDue, setSelectedSwAssignmentDue] = useState<'all' | 'due' | 'other'>('all');
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedSWForModal, setSelectedSWForModal] = useState<SocialWorkerStats | null>(null);
  const [memberModalPlan, setMemberModalPlan] = useState<'all' | 'healthNet' | 'kaiser'>('all');
  const [activeTab, setActiveTab] = useState('overview');

  type RCFESortField =
    | 'RCFE_Name'
    | 'memberCount'
    | 'RCFE_Administrator'
    | 'RCFE_Street'
    | 'RCFE_City_RCFE_Zip'
    | 'RCFE_Administrator_Email'
    | 'RCFE_Administrator_Phone'
    | 'Number_of_Beds';
  const [rcfeSortField, setRcfeSortField] = useState<RCFESortField>('RCFE_Name');
  const [rcfeSortDirection, setRcfeSortDirection] = useState<'asc' | 'desc'>('asc');
  const [rcfeSearch, setRcfeSearch] = useState('');
  const [rcfeDrafts, setRcfeDrafts] = useState<
    Record<string, { RCFE_Administrator: string; RCFE_Administrator_Email: string; RCFE_Administrator_Phone: string; Number_of_Beds: string }>
  >({});
  const [isSavingAllRcfe, setIsSavingAllRcfe] = useState(false);
  
  // Geo assignment tool state (suggest/export only)
  const [geoCapacityPerSw, setGeoCapacityPerSw] = useState('30');
  const [geoMaxRcfes, setGeoMaxRcfes] = useState('800');
  const [geoMaxMiles, setGeoMaxMiles] = useState('');
  const [geoIncludeHolds, setGeoIncludeHolds] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoData, setGeoData] = useState<GeoSuggestResponse | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoSelectedSwId, setGeoSelectedSwId] = useState('');

  // Sorting state
  type SortField = 'memberName' | 'Client_ID2' | 'CalAIM_MCO' | 'memberCounty' | 'CalAIM_Status' | 'Social_Worker_Assigned' | 'RCFE_Name' | 'Hold_For_Social_Worker';
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('memberName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Admin assignment override editor (Firestore-backed source-of-truth when needed)
  const [assignmentEditorOpen, setAssignmentEditorOpen] = useState(false);
  const [assignmentEditorMember, setAssignmentEditorMember] = useState<Member | null>(null);
  const [assignmentEditorToEmail, setAssignmentEditorToEmail] = useState('');
  const [assignmentEditorReason, setAssignmentEditorReason] = useState('');
  const [assignmentEditorSaving, setAssignmentEditorSaving] = useState(false);

  const openAssignmentEditor = useCallback((member: Member) => {
    setAssignmentEditorMember(member);
    setAssignmentEditorToEmail(String(member?.Social_Worker_Assigned || '').trim());
    setAssignmentEditorReason('');
    setAssignmentEditorOpen(true);
  }, []);

  const saveAssignmentOverride = useCallback(async () => {
    if (!auth?.currentUser) {
      toast({ title: 'Not signed in', description: 'You must be signed in as an admin.', variant: 'destructive' });
      return;
    }
    if (!assignmentEditorMember) return;
    const memberId = String(assignmentEditorMember?.Client_ID2 || '').trim();
    if (!memberId) {
      toast({ title: 'Missing member ID', description: 'This member is missing Client_ID2.', variant: 'destructive' });
      return;
    }

    const toSwEmail = String(assignmentEditorToEmail || '').trim();
    const fromSwEmail = String(assignmentEditorMember?.Social_Worker_Assigned || '').trim();

    setAssignmentEditorSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/sw-assignments/override-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          memberId,
          fromSwEmail,
          toSwEmail,
          reason: assignmentEditorReason,
          member: assignmentEditorMember,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to save override (HTTP ${res.status})`);
      }

      // Update the local view immediately (admin portal becomes the source-of-truth UX-wise).
      setMembers((prev) =>
        prev.map((m) =>
          String(m?.Client_ID2 || '').trim() === memberId
            ? {
                ...m,
                Social_Worker_Assigned: toSwEmail,
                last_updated: new Date().toISOString(),
              }
            : m
        )
      );
      setKaiserAuthorizedMembers((prev) =>
        prev.map((m) =>
          String(m?.Client_ID2 || '').trim() === memberId
            ? {
                ...m,
                Social_Worker_Assigned: toSwEmail,
                last_updated: new Date().toISOString(),
              }
            : m
        )
      );

      toast({
        title: 'Assignment updated',
        description: `${assignmentEditorMember.memberName} → ${toSwEmail || 'Unassigned'}`,
      });
      setAssignmentEditorOpen(false);
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e?.message || 'Could not save the assignment override.',
        variant: 'destructive',
      });
    } finally {
      setAssignmentEditorSaving(false);
    }
  }, [assignmentEditorMember, assignmentEditorReason, assignmentEditorToEmail, auth?.currentUser, toast]);

  const isHold = (value?: string | null) => {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return false;
    return v.includes('hold') || v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'x';
  };

  const isHealthNetMember = (member: Member) => {
    const plan = String(member?.CalAIM_MCO || '').trim().toLowerCase();
    return plan.includes('health') && plan.includes('net');
  };

  const isKaiserMember = (member: Member) => {
    const plan = String(member?.CalAIM_MCO || '').trim().toLowerCase();
    return plan.includes('kaiser');
  };

  const isAuthorizedMember = (member: Member) => {
    const status = String(member?.CalAIM_Status || '').trim().toLowerCase();
    if (!status) return false;
    return status === 'authorized' || status.startsWith('authorized ');
  };

  const hasAssignedRcfe = (member: Member) => {
    const rcfeName = String(normalizeRcfeNameForAssignment(member?.RCFE_Name || '') || '').trim().toLowerCase();
    const rcfeAddress = String(member?.RCFE_Address || '').trim();
    if (rcfeAddress) return true;
    if (!rcfeName) return false;
    if (rcfeName.includes('calaim_use') || rcfeName.includes('calaim use')) return false;
    if (rcfeName === 'unknown' || rcfeName === 'unassigned') return false;
    return true;
  };

  const parseCaspioDateToLocalDate = (raw: any): Date | null => {
    if (!raw) return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    const s = String(raw).trim();
    if (!s) return null;

    // First try native parsing (handles ISO strings well).
    const d1 = new Date(s);
    if (!Number.isNaN(d1.getTime())) return d1;

    // Try M/D/YYYY (common in Caspio exports).
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
    if (mdy) {
      const m = Number(mdy[1]);
      const d = Number(mdy[2]);
      const y = Number(mdy[3]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900) {
        const dt = new Date(y, m - 1, d);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    }

    // Try YYYY-MM-DD
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+.*)?$/);
    if (ymd) {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const d = Number(ymd[3]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900) {
        const dt = new Date(y, m - 1, d);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    }

    return null;
  };

  const isUnassignedSw = (member: Member) => {
    const v = String(member.Social_Worker_Assigned || '').trim();
    return !v || v.toLowerCase() === 'unassigned';
  };

  const getRcfeFilterBucket = (member: Member) => {
    const normalized = normalizeRcfeNameForAssignment(member.RCFE_Name);
    return normalized ? normalized : 'RCFE Unassigned';
  };

  const getRcfeStreet = (member: Member) =>
    String(member.RCFE_Street || member.RCFE_Address || '').trim();

  const getRcfeCity = (member: Member) =>
    String(member.RCFE_City || '').trim();

  const getRcfeZip = (member: Member) =>
    String(member.RCFE_Zip || '').trim();

  const getRcfeCityZip = (member: Member) =>
    [getRcfeCity(member), getRcfeZip(member)].filter(Boolean).join(', ');

  const getRcfeAdministrator = (member: Member) =>
    String(member.RCFE_Administrator || member.RCFE_Admin_Name || '').trim();

  const getRcfeAdministratorEmail = (member: Member) =>
    String(member.RCFE_Administrator_Email || member.RCFE_Admin_Email || '').trim();

  const getRcfeAdministratorPhone = (member: Member) =>
    String(member.RCFE_Administrator_Phone || member.RCFE_Admin_Phone || '').trim();

  const getRcfeNumberOfBeds = (member: Member) =>
    String(member.Number_of_Beds || '').trim();

  const isDueForSwAssignment = (member: Member) => {
    if (!isUnassignedSw(member)) return false;
    // We only assign SWs once a real RCFE has been selected (exclude placeholders like "CalAIM_Use...").
    if (!normalizeRcfeNameForAssignment(member.RCFE_Name)) return false;
    const start = parseCaspioDateToLocalDate(member.Authorization_Start_Date_T2038);
    if (!start) return false;
    const due = new Date(start);
    due.setHours(0, 0, 0, 0);
    due.setMonth(due.getMonth() + 1);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime() >= due.getTime();
  };

  const dueSwAssignmentCount = useMemo(() => {
    return members.filter(isDueForSwAssignment).length;
  }, [members]);

  const onHoldMembersCount = useMemo(() => (
    members.filter((member) => isHold(member.Hold_For_Social_Worker)).length
  ), [members]);

  const notOnHoldMembersCount = useMemo(() => (
    members.filter((member) => !isHold(member.Hold_For_Social_Worker)).length
  ), [members]);

  const notOnHoldWithAssignedRcfeCount = useMemo(() => (
    members.filter((member) => !isHold(member.Hold_For_Social_Worker) && hasAssignedRcfe(member)).length
  ), [members]);

  const assignedToSocialWorkerCount = useMemo(() => (
    members.filter((member) => !isUnassignedSw(member)).length
  ), [members]);

  const atRcfeMembersCount = useMemo(() => (
    members.filter((member) => hasAssignedRcfe(member)).length
  ), [members]);

  const rcfeDirectoryRows = useMemo<RCFEDirectoryRow[]>(() => {
    const allMemberRows = [...members, ...kaiserAuthorizedMembers];
    const grouped = new Map<string, RCFEDirectoryRow>();

    allMemberRows.forEach((member) => {
      if (!hasAssignedRcfe(member)) return;
      const rcfeName = String(getRcfeFilterBucket(member) || '').trim();
      if (!rcfeName || rcfeName === 'RCFE Unassigned') return;

      const rcfeStreet = getRcfeStreet(member);
      const rcfeCityZip = getRcfeCityZip(member);
      const rcfeAdmin = getRcfeAdministrator(member);
      const rcfeAdminEmail = getRcfeAdministratorEmail(member);
      const rcfeAdminPhone = getRcfeAdministratorPhone(member);
      const rcfeBeds = getRcfeNumberOfBeds(member);
      const clientId2 = String(member.Client_ID2 || '').trim();
      const memberName = String(member.memberName || '').trim() || `${String(member.memberFirstName || '').trim()} ${String(member.memberLastName || '').trim()}`.trim();
      const key = [
        rcfeName.toLowerCase(),
        rcfeStreet.toLowerCase(),
        rcfeCityZip.toLowerCase(),
      ]
        .filter(Boolean)
        .join('|');

      const existing = grouped.get(key);
      if (existing) {
        existing.memberCount += 1;
        if (!existing.RCFE_Administrator && rcfeAdmin) existing.RCFE_Administrator = rcfeAdmin;
        if (!existing.RCFE_Street && rcfeStreet) existing.RCFE_Street = rcfeStreet;
        if (!existing.RCFE_City_RCFE_Zip && rcfeCityZip) existing.RCFE_City_RCFE_Zip = rcfeCityZip;
        if (!existing.RCFE_Administrator_Email && rcfeAdminEmail) existing.RCFE_Administrator_Email = rcfeAdminEmail;
        if (!existing.RCFE_Administrator_Phone && rcfeAdminPhone) existing.RCFE_Administrator_Phone = rcfeAdminPhone;
        if (!existing.Number_of_Beds && rcfeBeds) existing.Number_of_Beds = rcfeBeds;
        if (clientId2 && !existing.memberIds.includes(clientId2)) existing.memberIds.push(clientId2);
        if (memberName && !existing.memberNames.includes(memberName)) existing.memberNames.push(memberName);
      } else {
        grouped.set(key, {
          key,
          RCFE_Name: rcfeName,
          RCFE_Administrator: rcfeAdmin,
          RCFE_Street: rcfeStreet,
          RCFE_City_RCFE_Zip: rcfeCityZip,
          RCFE_Administrator_Email: rcfeAdminEmail,
          RCFE_Administrator_Phone: rcfeAdminPhone,
          Number_of_Beds: rcfeBeds,
          memberCount: 1,
          memberIds: clientId2 ? [clientId2] : [],
          memberNames: memberName ? [memberName] : [],
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
      return a.RCFE_Name.localeCompare(b.RCFE_Name);
    });
  }, [members, kaiserAuthorizedMembers]);

  const getRcfeDraft = (row: RCFEDirectoryRow) => ({
    RCFE_Administrator: rcfeDrafts[row.key]?.RCFE_Administrator ?? row.RCFE_Administrator,
    RCFE_Administrator_Email: rcfeDrafts[row.key]?.RCFE_Administrator_Email ?? row.RCFE_Administrator_Email,
    RCFE_Administrator_Phone: rcfeDrafts[row.key]?.RCFE_Administrator_Phone ?? row.RCFE_Administrator_Phone,
    Number_of_Beds: rcfeDrafts[row.key]?.Number_of_Beds ?? row.Number_of_Beds,
  });

  const normalizeAdminName = (value: unknown) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((token) =>
        token
          .split('-')
          .map((part) =>
            part
              .split("'")
              .map((seg) =>
                seg ? `${seg.charAt(0).toUpperCase()}${seg.slice(1).toLowerCase()}` : seg
              )
              .join("'")
          )
          .join('-')
      )
      .join(' ');

  const normalizeBedsInput = (value: unknown) => String(value || '').replace(/[^\d]/g, '');

  const hasRcfeDraftChanges = useCallback((row: RCFEDirectoryRow) => {
    const draft = getRcfeDraft(row);
    return (
      String(draft.RCFE_Administrator || '').trim() !== String(row.RCFE_Administrator || '').trim() ||
      String(draft.RCFE_Administrator_Email || '').trim() !== String(row.RCFE_Administrator_Email || '').trim() ||
      String(draft.RCFE_Administrator_Phone || '').trim() !== String(row.RCFE_Administrator_Phone || '').trim() ||
      String(draft.Number_of_Beds || '').trim() !== String(row.Number_of_Beds || '').trim()
    );
  }, [rcfeDrafts]);

  const handleRcfeSort = (field: RCFESortField) => {
    if (rcfeSortField === field) {
      setRcfeSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setRcfeSortField(field);
      setRcfeSortDirection('asc');
    }
  };

  const visibleRcfeRows = useMemo(() => {
    const needle = rcfeSearch.trim().toLowerCase();
    const filtered = rcfeDirectoryRows.filter((row) => {
      if (!needle) return true;
      return (
        row.RCFE_Name.toLowerCase().includes(needle) ||
        row.RCFE_City_RCFE_Zip.toLowerCase().includes(needle) ||
        row.RCFE_Administrator.toLowerCase().includes(needle) ||
        row.RCFE_Administrator_Email.toLowerCase().includes(needle) ||
        row.memberNames.some((name) => String(name || '').toLowerCase().includes(needle))
      );
    });

    return filtered.sort((a, b) => {
      const dir = rcfeSortDirection === 'asc' ? 1 : -1;
      if (rcfeSortField === 'memberCount') return (a.memberCount - b.memberCount) * dir;
      const av = String((a as any)[rcfeSortField] || '').toLowerCase();
      const bv = String((b as any)[rcfeSortField] || '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [rcfeDirectoryRows, rcfeSearch, rcfeSortDirection, rcfeSortField]);

  const editedRcfeRows = useMemo(
    () => rcfeDirectoryRows.filter((row) => hasRcfeDraftChanges(row)),
    [rcfeDirectoryRows, hasRcfeDraftChanges]
  );

  const saveRcfeRowToCaspio = useCallback(async (row: RCFEDirectoryRow, options?: { silent?: boolean }) => {
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in to update RCFE data.');
      if (!row.memberIds.length) throw new Error('No member IDs available for this RCFE row.');
      const rawDraft = getRcfeDraft(row);
      const draft = {
        ...rawDraft,
        RCFE_Administrator: normalizeAdminName(rawDraft.RCFE_Administrator),
        Number_of_Beds: normalizeBedsInput(rawDraft.Number_of_Beds),
      };
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/rcfe-directory/upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          memberIds: row.memberIds,
          updates: draft,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to update RCFE data (HTTP ${res.status})`);
      }

      const memberIdSet = new Set(row.memberIds.map((id) => String(id || '').trim()));
      const applyUpdates = (member: Member): Member =>
        memberIdSet.has(String(member.Client_ID2 || '').trim())
          ? {
              ...member,
              RCFE_Administrator: draft.RCFE_Administrator,
              RCFE_Administrator_Email: draft.RCFE_Administrator_Email,
              RCFE_Admin_Email: draft.RCFE_Administrator_Email,
              RCFE_Administrator_Phone: draft.RCFE_Administrator_Phone,
              Number_of_Beds: draft.Number_of_Beds,
            }
          : member;

      setMembers((prev) => prev.map(applyUpdates));
      setKaiserAuthorizedMembers((prev) => prev.map(applyUpdates));
      setRcfeDrafts((prev) => ({
        ...prev,
        [row.key]: draft,
      }));

      if (!options?.silent) {
        toast({
          title: 'RCFE data synced',
          description: `Updated ${data?.updatedCount || row.memberIds.length} Caspio records.`,
        });
      }
      return true;
    } catch (error: any) {
      if (!options?.silent) {
        toast({
          title: 'RCFE sync failed',
          description: error?.message || 'Could not push RCFE updates to Caspio.',
          variant: 'destructive',
        });
      }
      return false;
    }
  }, [auth?.currentUser, rcfeDrafts, toast]);

  const saveAllEditedRcfeRows = useCallback(async () => {
    if (editedRcfeRows.length === 0) {
      toast({
        title: 'No RCFE edits to push',
        description: 'Make a change in RCFE Data first, then push.',
      });
      return;
    }

    setIsSavingAllRcfe(true);
    let successCount = 0;
    let failureCount = 0;
    for (const row of editedRcfeRows) {
      const ok = await saveRcfeRowToCaspio(row, { silent: true });
      if (ok) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }
    setIsSavingAllRcfe(false);

    if (failureCount === 0) {
      toast({
        title: 'All RCFE edits synced',
        description: `Successfully pushed ${successCount} edited RCFE row${successCount === 1 ? '' : 's'} to Caspio.`,
      });
      return;
    }

    toast({
      title: 'RCFE bulk sync completed with errors',
      description: `Synced ${successCount}, failed ${failureCount}. You can retry with Push All Edited again.`,
      variant: 'destructive',
    });
  }, [editedRcfeRows, saveRcfeRowToCaspio, toast]);

  // Fetch and scope members for the SW tracker (Health Net + Authorized)
  const fetchAllMembers = async () => {
    setIsLoadingMembers(true);
    try {
      if (!auth?.currentUser) {
        throw new Error('You must be signed in to sync.');
      }

      const idToken = await auth.currentUser.getIdToken();
      const syncRes = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'full' }),
      });
      const syncData = await syncRes.json().catch(() => ({} as any));
      if (!syncRes.ok || !(syncData as any)?.success) {
        const msg =
          (syncData as any)?.error ||
          (syncData as any)?.details ||
          `Failed to sync members cache (HTTP ${syncRes.status})`;
        throw new Error(msg);
      }

      const response = await fetch('/api/all-members');
      const responseData = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        const msg =
          (responseData as any)?.error ||
          (responseData as any)?.details ||
          `Failed to fetch members (HTTP ${response.status})`;
        throw new Error(msg);
      }
      
      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch members');
      }
      
      const allMembers = (responseData.members || []) as Member[];
      const healthNetAuthorizedMembers = allMembers.filter((member) => (
        isHealthNetMember(member) && isAuthorizedMember(member)
      ));
      const kaiserAuthorized = allMembers.filter((member) => (
        isKaiserMember(member) && isAuthorizedMember(member)
      ));
      setMembers(healthNetAuthorizedMembers);
      setKaiserAuthorizedMembers(kaiserAuthorized);
      
      toast({
        title: "Data Loaded Successfully",
        description: `Loaded ${healthNetAuthorizedMembers.length} Health Net authorized and ${kaiserAuthorized.length} Kaiser authorized members`,
      });
    } catch (error) {
      console.error('Error fetching all members:', error);
      toast({
        title: "Load Failed",
        description: error instanceof Error ? error.message : "Failed to load members. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const runGeoSuggest = useCallback(async () => {
    setGeoLoading(true);
    setGeoError(null);
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in.');
      const idToken = await auth.currentUser.getIdToken();

      const capacityPerSw = Math.floor(Number(geoCapacityPerSw || 30));
      const maxRcfes = Math.floor(Number(geoMaxRcfes || 800));
      const maxMiles =
        geoMaxMiles.trim() === '' ? null : Number.isFinite(Number(geoMaxMiles)) ? Number(geoMaxMiles) : null;

      const res = await fetch('/api/tools/sw-geo-assign/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          capacityPerSw,
          maxRcfes,
          maxMiles,
          includeHolds: geoIncludeHolds,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Geo suggestion failed (HTTP ${res.status})`);
      }
      const typed = data as GeoSuggestResponse;
      setGeoData(typed);
      const first = typed.sw.find((s) => !!s.geo)?.sw_id || '';
      setGeoSelectedSwId((prev) => prev || first);
      toast({
        title: 'Geo suggestions ready',
        description: `Assigned ${typed.stats.assignedMembers} member(s); overflow ${typed.stats.overflowMembers}.`,
      });
    } catch (e: any) {
      console.error(e);
      setGeoError(e?.message || 'Failed to compute geo suggestions.');
      toast({
        title: 'Geo suggestions failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGeoLoading(false);
    }
  }, [auth?.currentUser, geoCapacityPerSw, geoMaxRcfes, geoMaxMiles, geoIncludeHolds, toast]);

  const downloadGeoCsv = useCallback(() => {
    if (!geoData?.memberAssignments?.length) return;

    const escape = (value: any) => {
      const s = String(value ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      'Client_ID2',
      'Member',
      'Member_City',
      'Member_County',
      'RCFE_Name',
      'RCFE_Address',
      'RCFE_City',
      'RCFE_County',
      'Suggested_SW_ID',
      'Suggested_SW_Name',
      'Suggested_SW_Email',
      'Distance_Miles',
    ];

    const lines = [
      header.join(','),
      ...geoData.memberAssignments.map((r) =>
        [
          r.clientId2,
          r.memberName,
          r.memberCity || '',
          r.memberCounty || '',
          r.rcfeName,
          r.rcfeAddress,
          r.rcfeCity || '',
          r.rcfeCounty || '',
          r.suggestedSwId,
          r.suggestedSwName,
          r.suggestedSwEmail || '',
          r.distanceMiles,
        ]
          .map(escape)
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sw_geo_suggestions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [geoData]);

  // Disabled automatic loading - only sync when user clicks "Sync from Caspio" button
  // useEffect(() => {
  //   if (isAdmin) {
  //     fetchAllMembers();
  //   }
  // }, [isAdmin]);

  // Calculate social worker statistics
  const socialWorkerStats = useMemo((): SocialWorkerStats[] => {
    const stats: Record<string, SocialWorkerStats> = {};

    const ensureStat = (swName: string) => {
      if (!stats[swName]) {
        stats[swName] = {
          name: swName,
          memberCount: 0,
          members: [],
          healthNetMembers: [],
          kaiserMembers: [],
          healthNetAuthorizedCount: 0,
          kaiserAuthorizedCount: 0,
          mcoBreakdown: {},
          statusBreakdown: {},
          countyBreakdown: {},
          rcfeBreakdown: {},
          onHoldCount: 0,
          notOnHoldCount: 0,
          atRcfeCount: 0,
          rcfeUnassignedCount: 0,
          monthlyVisitEligibleCount: 0,
        };
      }
      return stats[swName];
    };

    // Health Net authorized (used by SW monthly visit portal scope)
    members.forEach((member) => {
      const swName = member.Social_Worker_Assigned || 'Unassigned';
      const stat = ensureStat(swName);

      stat.memberCount += 1;
      stat.healthNetAuthorizedCount += 1;
      stat.members.push(member);
      stat.healthNetMembers.push(member);

      const mco = member.CalAIM_MCO || 'Unknown';
      stat.mcoBreakdown[mco] = (stat.mcoBreakdown[mco] || 0) + 1;

      const status = member.CalAIM_Status || 'No Status';
      stat.statusBreakdown[status] = (stat.statusBreakdown[status] || 0) + 1;

      const county = member.memberCounty || 'Unknown';
      stat.countyBreakdown[county] = (stat.countyBreakdown[county] || 0) + 1;

      const rcfe = getRcfeFilterBucket(member);
      stat.rcfeBreakdown[rcfe] = (stat.rcfeBreakdown[rcfe] || 0) + 1;

      if (isHold(member.Hold_For_Social_Worker)) {
        stat.onHoldCount += 1;
      } else {
        stat.notOnHoldCount += 1;
      }

      const atRcfe = hasAssignedRcfe(member);
      if (atRcfe) {
        stat.atRcfeCount += 1;
      } else {
        stat.rcfeUnassignedCount += 1;
      }
      if (!isHold(member.Hold_For_Social_Worker) && atRcfe) {
        stat.monthlyVisitEligibleCount += 1;
      }
    });

    // Kaiser authorized (informational only; not included in SW portal monthly visits)
    kaiserAuthorizedMembers.forEach((member) => {
      const swName = member.Social_Worker_Assigned || 'Unassigned';
      const stat = ensureStat(swName);
      stat.kaiserAuthorizedCount += 1;
      stat.kaiserMembers.push(member);
      stat.members.push(member);

      const mco = member.CalAIM_MCO || 'Unknown';
      stat.mcoBreakdown[mco] = (stat.mcoBreakdown[mco] || 0) + 1;
    });

    return Object.values(stats).sort((a, b) => {
      // Sort: Unassigned last, then by member count descending
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return (b.healthNetAuthorizedCount + b.kaiserAuthorizedCount) - (a.healthNetAuthorizedCount + a.kaiserAuthorizedCount);
    });
  }, [members, kaiserAuthorizedMembers]);

  const openMemberModal = useCallback((sw: SocialWorkerStats, plan: 'all' | 'healthNet' | 'kaiser' = 'all') => {
    setSelectedSWForModal(sw);
    setMemberModalPlan(plan);
    setShowMemberModal(true);
  }, []);

  // Get all unique social workers for filter
  const allSocialWorkers = useMemo(() => {
    return socialWorkerStats.map(sw => sw.name);
  }, [socialWorkerStats]);

  // Get all unique values for filters
  const allMCOs = useMemo(() => {
    return [...new Set(members.map(m => m.CalAIM_MCO || 'Unknown'))].sort();
  }, [members]);

  const allStatuses = useMemo(() => {
    return [...new Set(members.map(m => m.CalAIM_Status || 'No Status'))].sort();
  }, [members]);

  const allCounties = useMemo(() => {
    return [...new Set(members.map(m => m.memberCounty || 'Unknown'))].sort();
  }, [members]);

  const allRCFEs = useMemo(() => {
    return [...new Set(members.map((m) => getRcfeFilterBucket(m)))].sort();
  }, [members]);

  // Handle column sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    // First filter
    const filtered = members.filter(member => {
      // Safety guard: this tracker only shows Health Net + Authorized scope.
      if (!isHealthNetMember(member) || !isAuthorizedMember(member)) return false;

      const matchesSearch = !searchTerm || 
        member.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.Client_ID2.toString().includes(searchTerm) ||
        (member.Social_Worker_Assigned || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.SW_One_Time_Kaiser || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSW = selectedSocialWorker === 'all' || 
        (member.Social_Worker_Assigned || 'Unassigned') === selectedSocialWorker;
      
      const matchesMCO = selectedMCO === 'all' || 
        (member.CalAIM_MCO || 'Unknown') === selectedMCO;
      
      const matchesStatus = selectedStatus === 'all' || 
        (member.CalAIM_Status || 'No Status') === selectedStatus;
      
      const matchesCounty = selectedCounty === 'all' || 
        (member.memberCounty || 'Unknown') === selectedCounty;
      
      const matchesRCFE = selectedRCFE === 'all' || 
        getRcfeFilterBucket(member) === selectedRCFE;
      
      const matchesHoldStatus =
        selectedHoldStatus === 'all' ||
        (selectedHoldStatus === 'hold' && isHold(member.Hold_For_Social_Worker)) ||
        (selectedHoldStatus === 'active' && !isHold(member.Hold_For_Social_Worker));

      const matchesSwDue =
        selectedSwAssignmentDue === 'all' ||
        (selectedSwAssignmentDue === 'due' && isDueForSwAssignment(member)) ||
        (selectedSwAssignmentDue === 'other' && !isDueForSwAssignment(member));
      
      return matchesSearch && matchesSW && matchesMCO && matchesStatus && matchesCounty && matchesRCFE && matchesHoldStatus && matchesSwDue;
    });

    // Then sort
    return filtered.sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';

      switch (sortField) {
        case 'memberName':
          aValue = a.memberName || '';
          bValue = b.memberName || '';
          break;
        case 'Client_ID2':
          aValue = a.Client_ID2 || '';
          bValue = b.Client_ID2 || '';
          break;
        case 'CalAIM_MCO':
          aValue = a.CalAIM_MCO || 'Unknown';
          bValue = b.CalAIM_MCO || 'Unknown';
          break;
        case 'memberCounty':
          aValue = a.memberCounty || 'Unknown';
          bValue = b.memberCounty || 'Unknown';
          break;
        case 'CalAIM_Status':
          aValue = a.CalAIM_Status || 'No Status';
          bValue = b.CalAIM_Status || 'No Status';
          break;
        case 'Social_Worker_Assigned':
          aValue = a.Social_Worker_Assigned || 'Unassigned';
          bValue = b.Social_Worker_Assigned || 'Unassigned';
          break;
        case 'RCFE_Name':
          aValue = getRcfeFilterBucket(a);
          bValue = getRcfeFilterBucket(b);
          break;
        case 'Hold_For_Social_Worker':
          aValue = a.Hold_For_Social_Worker || 'No';
          bValue = b.Hold_For_Social_Worker || 'No';
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      return 0;
    });
  }, [members, searchTerm, selectedSocialWorker, selectedMCO, selectedStatus, selectedCounty, selectedRCFE, selectedHoldStatus, selectedSwAssignmentDue, sortField, sortDirection]);

  const modalMembers = useMemo(() => {
    if (!selectedSWForModal) return [] as Member[];
    if (memberModalPlan === 'healthNet') return selectedSWForModal.healthNetMembers;
    if (memberModalPlan === 'kaiser') return selectedSWForModal.kaiserMembers;

    const byClientId = new Map<string, Member>();
    [...selectedSWForModal.healthNetMembers, ...selectedSWForModal.kaiserMembers].forEach((member) => {
      byClientId.set(String(member.Client_ID2), member);
    });
    return Array.from(byClientId.values());
  }, [memberModalPlan, selectedSWForModal]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading social worker assignments...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need admin permissions to view social worker assignments.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Worker Assignments</h1>
          <p className="text-muted-foreground">
            Health Net authorized tracker sync | {members.length} total authorized Health Net members
          </p>
        </div>
        <Button onClick={fetchAllMembers} disabled={isLoadingMembers}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
          Sync from Caspio
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assignments">Member Assignments</TabsTrigger>
          <TabsTrigger value="workload">Workload Analysis</TabsTrigger>
          <TabsTrigger value="geo">Geo Assignment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Health Net Authorized</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{members.length}</div>
                <p className="text-xs text-muted-foreground">
                  Members in sync scope
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assigned To SW</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{assignedToSocialWorkerCount}</div>
                <p className="text-xs text-muted-foreground">
                  Health Net authorized members assigned to social workers
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">At RCFE</CardTitle>
                <Building2 className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {atRcfeMembersCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Members with assigned RCFE
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-800">On Hold</CardTitle>
                <Pause className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700 flex items-center gap-2">
                  {onHoldMembersCount}
                  {onHoldMembersCount > 0 && (
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <p className="text-xs text-red-700">
                  Members on hold for SW visit
                </p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-800">Not On Hold</CardTitle>
                <Play className="h-4 w-4 text-green-700" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-800">{notOnHoldMembersCount}</div>
                <p className="text-xs text-green-800">
                  Active members in SW portal scope ({notOnHoldWithAssignedRcfeCount} with assigned RCFE for monthly visits)
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-800">SW Monthly Visits Total</CardTitle>
                <Calendar className="h-4 w-4 text-blue-700" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-800">{notOnHoldWithAssignedRcfeCount}</div>
                <p className="text-xs text-blue-800">
                  Filtered by: Authorized + Health Net + At RCFE + Not On Hold (matches SW monthly visits roster)
                </p>
              </CardContent>
            </Card>

            <button
              type="button"
              className="text-left"
              onClick={() => router.push('/admin/tools/rcfe-data')}
            >
              <Card className="border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-indigo-800">Total RCFEs With Members</CardTitle>
                  <MapPinned className="h-4 w-4 text-indigo-700" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-indigo-800">{rcfeDirectoryRows.length}</div>
                  <p className="text-xs text-indigo-800">
                    Click to open RCFE Data Management tool
                  </p>
                </CardContent>
              </Card>
            </button>
          </div>

          {/* Social Worker Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {socialWorkerStats.map((sw) => {
              const portalMonthlyVisitCount = sw.healthNetMembers.filter(
                (member) => !isHold(member.Hold_For_Social_Worker) && hasAssignedRcfe(member)
              ).length;
              const portalCountMatchesTracker = portalMonthlyVisitCount === sw.monthlyVisitEligibleCount;

              return (
              <Card key={sw.name} className={sw.name === 'Unassigned' ? 'border-yellow-200 bg-yellow-50' : ''}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className={sw.name === 'Unassigned' ? 'text-yellow-700' : ''}>
                      {sw.name === 'Unassigned' ? '⚠️ Unassigned Members' : sw.name}
                    </span>
                    <Button
                      variant={sw.name === 'Unassigned' ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => {
                        openMemberModal(sw, 'all');
                      }}
                    >
                      {sw.healthNetAuthorizedCount + sw.kaiserAuthorizedCount} members
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    {sw.healthNetAuthorizedCount} Health Net authorized • {sw.kaiserAuthorizedCount} Kaiser authorized • {sw.atRcfeCount} at RCFE • {sw.rcfeUnassignedCount} RCFE unassigned
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      SW portal monthly visits filter: CalAIM authorized + Health Net + Not On Hold + At RCFE.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Health Net:</span>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm font-semibold"
                        onClick={() => openMemberModal(sw, 'healthNet')}
                      >
                        {sw.healthNetAuthorizedCount}
                      </Button>
                      <span className="text-sm text-muted-foreground">click to view member names</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Kaiser:</span>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm font-semibold"
                        onClick={() => openMemberModal(sw, 'kaiser')}
                      >
                        {sw.kaiserAuthorizedCount}
                      </Button>
                      <span className="text-sm text-muted-foreground">informational only (not in SW monthly visits)</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline">At RCFE: {sw.atRcfeCount}</Badge>
                      <Badge variant="outline">RCFE Unassigned: {sw.rcfeUnassignedCount}</Badge>
                      <Badge variant="outline">On Hold (excluded from SW portal): {sw.onHoldCount}</Badge>
                      <Badge variant="outline">Not On Hold: {sw.notOnHoldCount}</Badge>
                      <Badge>Monthly Visits: {sw.monthlyVisitEligibleCount}</Badge>
                      <Badge variant={portalCountMatchesTracker ? 'default' : 'destructive'}>
                        {portalCountMatchesTracker ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Match
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Mismatch
                          </span>
                        )}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      SW portal check (Health Net + Authorized + At RCFE + Not On Hold): tracker {sw.monthlyVisitEligibleCount} vs portal {portalMonthlyVisitCount}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )})}
            {!isLoadingMembers && socialWorkerStats.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Data Loaded</h3>
                  <p className="text-muted-foreground max-w-md">
                    Click "Sync from Caspio" to load member data and social worker assignments.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Social Worker</label>
                  <Select value={selectedSocialWorker} onValueChange={setSelectedSocialWorker}>
                    <SelectTrigger>
                      <SelectValue placeholder="All social workers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Social Workers</SelectItem>
                      {allSocialWorkers.map(sw => (
                        <SelectItem key={sw} value={sw}>
                          {sw} ({socialWorkerStats.find(s => s.name === sw)?.memberCount || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">MCO</label>
                  <Select value={selectedMCO} onValueChange={setSelectedMCO}>
                    <SelectTrigger>
                      <SelectValue placeholder="All MCOs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All MCOs</SelectItem>
                      {allMCOs.map(mco => (
                        <SelectItem key={mco} value={mco}>
                          {mco}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">CalAIM Status</label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {allStatuses.map(status => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">County</label>
                  <Select value={selectedCounty} onValueChange={setSelectedCounty}>
                    <SelectTrigger>
                      <SelectValue placeholder="All counties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Counties</SelectItem>
                      {allCounties.map(county => (
                        <SelectItem key={county} value={county}>
                          {county}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">RCFE</label>
                  <Select value={selectedRCFE} onValueChange={setSelectedRCFE}>
                    <SelectTrigger>
                      <SelectValue placeholder="All RCFEs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All RCFEs</SelectItem>
                      {allRCFEs.map(rcfe => (
                        <SelectItem key={rcfe} value={rcfe}>
                          {rcfe === 'RCFE Unassigned' ? 'RCFE Unassigned' : rcfe.substring(0, 30) + (rcfe.length > 30 ? '...' : '')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Hold Status</label>
                  <Select value={selectedHoldStatus} onValueChange={setSelectedHoldStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="hold">
                        <div className="flex items-center gap-2">
                          <Pause className="h-3 w-3 text-red-600" />
                          On Hold
                        </div>
                      </SelectItem>
                      <SelectItem value="active">
                        <div className="flex items-center gap-2">
                          <Play className="h-3 w-3 text-green-600" />
                          Active
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Needs SW assignment</label>
                  <Select value={selectedSwAssignmentDue} onValueChange={(v) => setSelectedSwAssignmentDue(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="due">Due (T2038 + 1 month) ({dueSwAssignmentCount})</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedSocialWorker('all');
                      setSelectedMCO('all');
                      setSelectedStatus('all');
                      setSelectedCounty('all');
                      setSelectedRCFE('all');
                      setSelectedHoldStatus('all');
                      setSelectedSwAssignmentDue('all');
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Members Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>Member Assignments ({filteredMembers.length})</span>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground font-normal">
                    <ArrowUpDown className="h-3 w-3" />
                    <span>
                      Sorted by {
                        sortField === 'memberName' ? 'Member Name' :
                        sortField === 'Client_ID2' ? 'Client ID' :
                        sortField === 'CalAIM_MCO' ? 'MCO' :
                        sortField === 'memberCounty' ? 'County' :
                        sortField === 'CalAIM_Status' ? 'CalAIM Status' :
                        sortField === 'Social_Worker_Assigned' ? 'Social Worker' :
                        sortField === 'RCFE_Name' ? 'RCFE Name' :
                        sortField === 'Hold_For_Social_Worker' ? 'Hold Status' :
                        sortField
                      } ({sortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{filteredMembers.length} of {members.length} members</Badge>
                  <Badge variant="secondary">
                    SW monthly visits equivalent: {notOnHoldWithAssignedRcfeCount}
                  </Badge>
                  {(() => {
                    const holdCount = filteredMembers.filter((m) => isHold(m.Hold_For_Social_Worker)).length;
                    return holdCount > 0 ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <Pause className="h-3 w-3" />
                        {holdCount} on hold
                      </Badge>
                    ) : null;
                  })()}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader 
                        field="memberName" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        Member
                      </SortableHeader>
                      <SortableHeader 
                        field="Client_ID2" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        Client ID
                      </SortableHeader>
                      <SortableHeader 
                        field="CalAIM_MCO" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        MCO
                      </SortableHeader>
                      <SortableHeader 
                        field="memberCounty" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        County
                      </SortableHeader>
                      <SortableHeader 
                        field="CalAIM_Status" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        CalAIM Status
                      </SortableHeader>
                      <SortableHeader 
                        field="Social_Worker_Assigned" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        Social Worker
                      </SortableHeader>
                      <TableHead>Kaiser_ALFT</TableHead>
                      <SortableHeader 
                        field="RCFE_Name" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        RCFE
                      </SortableHeader>
                      <SortableHeader 
                        field="Hold_For_Social_Worker" 
                        currentSortField={sortField} 
                        currentSortDirection={sortDirection} 
                        onSort={handleSort}
                      >
                        Hold Status
                      </SortableHeader>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingMembers ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading members...
                        </TableCell>
                      </TableRow>
                    ) : filteredMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No members found matching the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMembers.map((member) => (
                        <TableRow
                          key={member.id}
                          className={isHold(member.Hold_For_Social_Worker) ? 'bg-red-50 border-l-4 border-l-red-500' : ''}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {isHold(member.Hold_For_Social_Worker) && (
                                <div className="flex items-center gap-1">
                                  <Pause className="h-4 w-4 text-red-600" />
                                  <span className="text-red-600 text-xs font-semibold">HOLD</span>
                                </div>
                              )}
                              <span className={isHold(member.Hold_For_Social_Worker) ? 'text-red-800' : ''}>
                                {member.memberName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{member.Client_ID2}</TableCell>
                          <TableCell>
                            <Badge variant="default" className="text-xs">
                              {member.CalAIM_MCO || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>{member.memberCounty}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {member.CalAIM_Status || 'No Status'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {member.Social_Worker_Assigned ? (
                              <Badge variant="default" className="text-xs">
                                {member.Social_Worker_Assigned}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                Unassigned
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {String(member.SW_One_Time_Kaiser || '').trim() ? (
                              <Badge variant="secondary" className="text-xs">
                                {String(member.SW_One_Time_Kaiser || '').trim()}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not set</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              {normalizeRcfeNameForAssignment(member.RCFE_Name) ? (
                                <div>
                                  <div className="font-medium">{normalizeRcfeNameForAssignment(member.RCFE_Name)}</div>
                                  <div className="text-muted-foreground">{member.RCFE_Address}</div>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  No RCFE selected
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {isHold(member.Hold_For_Social_Worker) ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive" className="text-xs flex items-center gap-1">
                                  <Pause className="h-3 w-3" />
                                  Hold for SW Visit
                                </Badge>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              </div>
                            ) : (
                              <Badge variant="default" className="text-xs flex items-center gap-1 bg-green-100 text-green-800 border-green-200">
                                <Play className="h-3 w-3" />
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => openAssignmentEditor(member)} aria-label="Edit assignment">
                              <Edit className="h-4 w-4" />
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
        </TabsContent>

        <TabsContent value="rcfe-data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>RCFE Data Management</CardTitle>
              <CardDescription>
                Update RCFE administrator contact details and number of beds, then push updates to Caspio for members grouped under each RCFE.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="flex-1 max-w-lg">
                  <Input
                    placeholder="Search RCFE, city, administrator, or member name..."
                    value={rcfeSearch}
                    onChange={(e) => setRcfeSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{visibleRcfeRows.length} RCFEs</Badge>
                  <Badge variant="secondary">{editedRcfeRows.length} Edited</Badge>
                  <Button
                    onClick={saveAllEditedRcfeRows}
                    disabled={isSavingAllRcfe || editedRcfeRows.length === 0}
                  >
                    {isSavingAllRcfe ? 'Syncing edited rows...' : `Push All Edited (${editedRcfeRows.length})`}
                  </Button>
                </div>
              </div>

              <div className="w-full overflow-x-auto pb-2">
                <TooltipProvider delayDuration={120}>
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[320px]">
                        <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleRcfeSort('RCFE_Name')}>
                          RCFE Home
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleRcfeSort('RCFE_Administrator')}>
                          Admin Name
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleRcfeSort('RCFE_Administrator_Email')}>
                          Admin Email
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleRcfeSort('RCFE_Administrator_Phone')}>
                          Admin Phone
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleRcfeSort('Number_of_Beds')}>
                          Number of Beds
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRcfeRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          No RCFEs match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleRcfeRows.map((row) => {
                        const draft = getRcfeDraft(row);
                        return (
                          <TableRow key={row.key}>
                            <TableCell className="max-w-[320px]">
                              <div className="font-medium">{row.RCFE_Name || '-'}</div>
                              <div className="text-xs text-muted-foreground break-words">
                                {[String(row.RCFE_Street || '').trim(), String(row.RCFE_City_RCFE_Zip || '').trim()]
                                  .filter(Boolean)
                                  .join(', ') || '-'}
                              </div>
                              <div className="text-xs mt-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="font-medium text-left underline-offset-2 hover:underline"
                                      aria-label={`View ${row.memberCount} members`}
                                    >
                                      Members: {row.memberCount}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="start" className="max-w-sm p-2">
                                    <div className="text-xs font-semibold mb-1">Members ({row.memberCount})</div>
                                    <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                                      {row.memberNames.length > 0 ? (
                                        row.memberNames
                                          .slice()
                                          .sort((a, b) => a.localeCompare(b))
                                          .map((memberName) => (
                                            <div key={`${row.key}-${memberName}`} className="text-xs leading-tight">
                                              {memberName}
                                            </div>
                                          ))
                                      ) : (
                                        <div className="text-xs text-muted-foreground">No member names available</div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                className="min-w-[160px]"
                                value={draft.RCFE_Administrator}
                                onChange={(e) =>
                                  setRcfeDrafts((prev) => {
                                    const base = prev[row.key] ?? {
                                      RCFE_Administrator: row.RCFE_Administrator,
                                      RCFE_Administrator_Email: row.RCFE_Administrator_Email,
                                      RCFE_Administrator_Phone: row.RCFE_Administrator_Phone,
                                      Number_of_Beds: row.Number_of_Beds,
                                    };
                                    return {
                                      ...prev,
                                      [row.key]: { ...base, RCFE_Administrator: e.target.value },
                                    };
                                  })
                                }
                                placeholder="Admin name"
                                onBlur={(e) => {
                                  const normalized = normalizeAdminName(e.target.value);
                                  if (normalized !== e.target.value) {
                                    setRcfeDrafts((prev) => {
                                      const base = prev[row.key] ?? {
                                        RCFE_Administrator: row.RCFE_Administrator,
                                        RCFE_Administrator_Email: row.RCFE_Administrator_Email,
                                        RCFE_Administrator_Phone: row.RCFE_Administrator_Phone,
                                        Number_of_Beds: row.Number_of_Beds,
                                      };
                                      return {
                                        ...prev,
                                        [row.key]: { ...base, RCFE_Administrator: normalized },
                                      };
                                    });
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="min-w-[190px]"
                                value={draft.RCFE_Administrator_Email}
                                onChange={(e) =>
                                  setRcfeDrafts((prev) => {
                                    const base = prev[row.key] ?? {
                                      RCFE_Administrator: row.RCFE_Administrator,
                                      RCFE_Administrator_Email: row.RCFE_Administrator_Email,
                                      RCFE_Administrator_Phone: row.RCFE_Administrator_Phone,
                                      Number_of_Beds: row.Number_of_Beds,
                                    };
                                    return {
                                      ...prev,
                                      [row.key]: { ...base, RCFE_Administrator_Email: e.target.value },
                                    };
                                  })
                                }
                                placeholder="admin@email.com"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="min-w-[150px]"
                                value={draft.RCFE_Administrator_Phone}
                                onChange={(e) =>
                                  setRcfeDrafts((prev) => {
                                    const base = prev[row.key] ?? {
                                      RCFE_Administrator: row.RCFE_Administrator,
                                      RCFE_Administrator_Email: row.RCFE_Administrator_Email,
                                      RCFE_Administrator_Phone: row.RCFE_Administrator_Phone,
                                      Number_of_Beds: row.Number_of_Beds,
                                    };
                                    return {
                                      ...prev,
                                      [row.key]: { ...base, RCFE_Administrator_Phone: e.target.value },
                                    };
                                  })
                                }
                                placeholder="(xxx) xxx-xxxx"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="min-w-[110px]"
                                value={draft.Number_of_Beds}
                                onChange={(e) =>
                                  setRcfeDrafts((prev) => {
                                    const base = prev[row.key] ?? {
                                      RCFE_Administrator: row.RCFE_Administrator,
                                      RCFE_Administrator_Email: row.RCFE_Administrator_Email,
                                      RCFE_Administrator_Phone: row.RCFE_Administrator_Phone,
                                      Number_of_Beds: row.Number_of_Beds,
                                    };
                                    return {
                                      ...prev,
                                      [row.key]: { ...base, Number_of_Beds: normalizeBedsInput(e.target.value) },
                                    };
                                  })
                                }
                                placeholder="Number_of_Beds"
                                inputMode="numeric"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Social Worker Workload Analysis</CardTitle>
              <CardDescription>
                Detailed breakdown of member assignments and workload distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {socialWorkerStats.map((sw) => (
                  <div key={sw.name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        {sw.name === 'Unassigned' ? (
                          <>
                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
                            <span className="text-yellow-700">Unassigned Members</span>
                          </>
                        ) : (
                          <>
                            <User className="h-5 w-5" />
                            {sw.name}
                          </>
                        )}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{sw.memberCount} total</Badge>
                        <Badge variant="default">{sw.notOnHoldCount} not on hold</Badge>
                        {sw.onHoldCount > 0 && (
                          <Badge variant="destructive">{sw.onHoldCount} on hold</Badge>
                        )}
                        <Badge variant="secondary">{sw.atRcfeCount} at RCFE</Badge>
                        <Badge variant="outline">{sw.monthlyVisitEligibleCount} monthly visits total</Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Status Breakdown</h4>
                        <div className="space-y-1">
                          {Object.entries(sw.statusBreakdown)
                            .sort(([,a], [,b]) => b - a)
                            .map(([status, count]) => (
                              <div key={status} className="flex justify-between items-center text-sm">
                                <span>{status}</span>
                                <Badge variant="outline" className="text-xs">{count}</Badge>
                              </div>
                            ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">County Distribution</h4>
                        <div className="space-y-1">
                          {Object.entries(sw.countyBreakdown)
                            .sort(([,a], [,b]) => b - a)
                            .map(([county, count]) => (
                              <div key={county} className="flex justify-between items-center text-sm">
                                <span>{county}</span>
                                <Badge variant="secondary" className="text-xs">{count}</Badge>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPinned className="h-5 w-5" />
                Geo assignment suggestions
              </CardTitle>
              <CardDescription>
                Suggest member assignments by proximity to SW base addresses (from <span className="font-mono">connect_tbl_usersregistration</span>), capped by capacity. Export only (no Caspio updates).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-sm font-medium mb-1">Capacity per SW</div>
                  <Input value={geoCapacityPerSw} onChange={(e) => setGeoCapacityPerSw(e.target.value)} placeholder="30" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Max RCFEs to consider</div>
                  <Input value={geoMaxRcfes} onChange={(e) => setGeoMaxRcfes(e.target.value)} placeholder="800" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Max miles (optional)</div>
                  <Input value={geoMaxMiles} onChange={(e) => setGeoMaxMiles(e.target.value)} placeholder="e.g. 35" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Include holds</div>
                  <Select value={geoIncludeHolds ? 'yes' : 'no'} onValueChange={(v) => setGeoIncludeHolds(v === 'yes')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No (recommended)</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={runGeoSuggest} disabled={geoLoading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${geoLoading ? 'animate-spin' : ''}`} />
                  Compute suggestions
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadGeoCsv}
                  disabled={!geoData?.memberAssignments?.length}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              </div>

              {geoError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {geoError}
                </div>
              ) : null}

              {geoData ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Assigned</CardTitle>
                        <CardDescription>Members assigned by algorithm</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{geoData.stats.assignedMembers}</div>
                        <div className="text-xs text-muted-foreground">
                          {geoData.stats.assignedRcfes} RCFEs
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Overflow</CardTitle>
                        <CardDescription>No capacity / no geo</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{geoData.stats.overflowMembers}</div>
                        <div className="text-xs text-muted-foreground">
                          {geoData.stats.overflowRcfes} RCFEs
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">SW geocoded</CardTitle>
                        <CardDescription>Has base lat/lng</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{geoData.stats.swWithGeo}</div>
                        <div className="text-xs text-muted-foreground">of {geoData.stats.swTotal}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">RCFE geocoded</CardTitle>
                        <CardDescription>Has facility lat/lng</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{geoData.stats.rcfeGeocoded}</div>
                        <div className="text-xs text-muted-foreground">of {geoData.stats.rcfeTotal}</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">Social workers</CardTitle>
                        <CardDescription>Click to focus map and see breakdown</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-[520px] overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>SW</TableHead>
                                <TableHead className="text-right">Current</TableHead>
                                <TableHead className="text-right">Suggested</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {geoData.sw
                                .slice()
                                .sort((a, b) => (b.suggestedMemberCount || 0) - (a.suggestedMemberCount || 0))
                                .map((s) => (
                                  <TableRow
                                    key={s.sw_id}
                                    className={`cursor-pointer ${geoSelectedSwId === s.sw_id ? 'bg-muted/40' : ''}`}
                                    onClick={() => setGeoSelectedSwId(s.sw_id)}
                                  >
                                    <TableCell>
                                      <div className="font-medium">{s.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        SW_ID {s.sw_id} {s.geo ? '• geo' : '• no-geo'}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">{s.currentAssignedCount}</TableCell>
                                    <TableCell className="text-right">{s.suggestedMemberCount}</TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant={s.remainingCapacity < 0 ? 'destructive' : 'secondary'}>
                                        {s.remainingCapacity}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="lg:col-span-3">
                      <CardHeader>
                        <CardTitle className="text-base">Map + focused SW</CardTitle>
                        <CardDescription>
                          Blue = SW bases. Green = focused SW assigned RCFEs.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <GeoAssignmentMap sw={geoData.sw} selectedSwId={geoSelectedSwId} className="h-[420px] w-full rounded-lg border" />

                        {geoSelectedSwId ? (() => {
                          const focused = geoData.sw.find((s) => s.sw_id === geoSelectedSwId) || null;
                          if (!focused) return null;
                          const top = (obj: Record<string, number>) =>
                            Object.entries(obj).sort(([, a], [, b]) => b - a).slice(0, 6);
                          return (
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold">{focused.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    SW_ID {focused.sw_id} • Suggested {focused.suggestedMemberCount} • Remaining {focused.remainingCapacity}
                                  </div>
                                  {focused.address ? (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Base: {focused.address}
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-sm font-medium mb-1">Top counties</div>
                                  <div className="flex flex-wrap gap-1">
                                    {top(focused.countyBreakdown).map(([k, v]) => (
                                      <Badge key={k} variant="secondary" className="font-normal">{k}: {v}</Badge>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium mb-1">Top cities</div>
                                  <div className="flex flex-wrap gap-1">
                                    {top(focused.cityBreakdown).map(([k, v]) => (
                                      <Badge key={k} variant="secondary" className="font-normal">{k}: {v}</Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>RCFE</TableHead>
                                      <TableHead className="text-right">Members</TableHead>
                                      <TableHead className="text-right">Miles</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {focused.assignedRcfes.slice(0, 50).map((r) => (
                                      <TableRow key={`${focused.sw_id}:${r.rcfeName}`}>
                                        <TableCell>
                                          <div className="font-medium">{r.rcfeName}</div>
                                          <div className="text-xs text-muted-foreground">{r.rcfeAddress}</div>
                                        </TableCell>
                                        <TableCell className="text-right">{r.memberCount}</TableCell>
                                        <TableCell className="text-right">{r.distanceMiles}</TableCell>
                                      </TableRow>
                                    ))}
                                    {focused.assignedRcfes.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={3} className="text-sm text-muted-foreground">
                                          No assigned RCFEs (missing geo or capacity).
                                        </TableCell>
                                      </TableRow>
                                    ) : null}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="text-sm text-muted-foreground">Select a Social Worker on the left.</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {geoData.overflow?.length ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Overflow RCFEs (top 200)</CardTitle>
                        <CardDescription>Could not be assigned due to capacity, missing geo, or max miles constraint.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-[420px] overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>RCFE</TableHead>
                                <TableHead className="text-right">Members</TableHead>
                                <TableHead>Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {geoData.overflow.map((r) => (
                                <TableRow key={`${r.rcfeName}:${r.rcfeAddress}`}>
                                  <TableCell>
                                    <div className="font-medium">{r.rcfeName}</div>
                                    <div className="text-xs text-muted-foreground">{r.rcfeAddress}</div>
                                  </TableCell>
                                  <TableCell className="text-right">{r.memberCount}</TableCell>
                                  <TableCell className="text-sm">{r.reason}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Click “Compute suggestions” to generate proximity-based assignment recommendations.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assignment Override Editor */}
      <Dialog open={assignmentEditorOpen} onOpenChange={setAssignmentEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Update social worker assignment</DialogTitle>
            <DialogDescription>
              This saves an admin assignment override (used by the SW portal roster immediately).
            </DialogDescription>
          </DialogHeader>

          {assignmentEditorMember ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <div className="font-medium">{assignmentEditorMember.memberName}</div>
                <div className="text-xs text-muted-foreground">Client_ID2: {assignmentEditorMember.Client_ID2}</div>
                <div className="text-xs text-muted-foreground">
                  Current: {assignmentEditorMember.Social_Worker_Assigned || 'Unassigned'}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Assign to (email)</label>
                <Input
                  value={assignmentEditorToEmail}
                  onChange={(e) => setAssignmentEditorToEmail(e.target.value)}
                  placeholder="e.g. john@carehomefinders.com"
                />
                <div className="text-xs text-muted-foreground">Leave blank to set Unassigned.</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reason (optional)</label>
                <Input value={assignmentEditorReason} onChange={(e) => setAssignmentEditorReason(e.target.value)} placeholder="Optional note" />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAssignmentEditorOpen(false)} disabled={assignmentEditorSaving}>
                  Cancel
                </Button>
                <Button onClick={() => void saveAssignmentOverride()} disabled={assignmentEditorSaving}>
                  {assignmentEditorSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a member to edit.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Member Details Modal */}
      <Dialog open={showMemberModal} onOpenChange={setShowMemberModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSWForModal?.name === 'Unassigned' ? 'Unassigned Members' : `${selectedSWForModal?.name} - Member Details`}
            </DialogTitle>
            <DialogDescription>
              {memberModalPlan === 'healthNet'
                ? `${selectedSWForModal?.healthNetAuthorizedCount || 0} Health Net authorized members`
                : memberModalPlan === 'kaiser'
                  ? `${selectedSWForModal?.kaiserAuthorizedCount || 0} Kaiser authorized members (excluded from SW monthly visits)`
                  : `${modalMembers.length} total members`}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSWForModal && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={memberModalPlan === 'healthNet' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMemberModalPlan('healthNet')}
                >
                  Health Net ({selectedSWForModal.healthNetAuthorizedCount})
                </Button>
                <Button
                  type="button"
                  variant={memberModalPlan === 'kaiser' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMemberModalPlan('kaiser')}
                >
                  Kaiser ({selectedSWForModal.kaiserAuthorizedCount})
                </Button>
                <Button
                  type="button"
                  variant={memberModalPlan === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMemberModalPlan('all')}
                >
                  All ({modalMembers.length})
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {modalMembers
                  .slice()
                  .sort((a, b) => String(a.memberName || '').localeCompare(String(b.memberName || '')))
                  .map((member) => {
                    const memberRcfe = getRcfeFilterBucket(member);
                    const plan = isKaiserMember(member) ? 'Kaiser' : 'Health Net';
                    return (
                      <div key={`${member.Client_ID2}-${plan}`} className="text-sm p-3 border rounded-lg bg-muted/40">
                        <div className="font-medium">{member.memberName}</div>
                        <div className="text-muted-foreground">{plan} • ID: {member.Client_ID2}</div>
                        <div className="text-muted-foreground">
                          {memberRcfe} {isHold(member.Hold_For_Social_Worker) ? '• On Hold' : '• Not On Hold'}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {modalMembers.length === 0 && (
                <div className="text-sm text-muted-foreground border rounded-lg p-4">
                  No members found for this selection.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}