'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowUpDown, Building2, CheckCircle2, RefreshCw } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

interface Member {
  Client_ID2: string;
  RCFE_Registered_ID?: string;
  memberName: string;
  memberFirstName?: string;
  memberLastName?: string;
  CalAIM_MCO: string;
  CalAIM_Status: string;
  RCFE_Name: string;
  RCFE_Address?: string;
  RCFE_Street?: string;
  RCFE_City?: string;
  RCFE_Zip?: string;
  RCFE_County?: string;
  Member_County?: string;
  RCFE_Administrator?: string;
  RCFE_Administrator_Email?: string;
  RCFE_Admin_Email?: string;
  RCFE_Administrator_Phone?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Phone?: string;
  Number_of_Beds?: string;
}

interface RCFEDirectoryRow {
  key: string;
  RCFE_Name: string;
  rcfeRegisteredIds: string[];
  RCFE_Street: string;
  RCFE_City: string;
  RCFE_Zip: string;
  RCFE_County: string;
  RCFE_City_RCFE_Zip: string;
  RCFE_Administrator: string;
  RCFE_Administrator_Email: string;
  RCFE_Administrator_Phone: string;
  Number_of_Beds: string;
  memberCount: number;
  memberIds: string[];
  memberNames: string[];
  members: Array<{ id: string; name: string }>;
}

type RCFESortField =
  | 'RCFE_Name'
  | 'RCFE_County'
  | 'RCFE_Administrator'
  | 'RCFE_Administrator_Email'
  | 'RCFE_Administrator_Phone'
  | 'Number_of_Beds';

type RcfeDraftFields = {
  RCFE_County: string;
  RCFE_Administrator: string;
  RCFE_Administrator_Email: string;
  RCFE_Administrator_Phone: string;
  Number_of_Beds: string;
};

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
            .map((seg) => (seg ? `${seg.charAt(0).toUpperCase()}${seg.slice(1).toLowerCase()}` : seg))
            .join("'")
        )
        .join('-')
    )
    .join(' ');

const normalizeBedsInput = (value: unknown) => String(value || '').replace(/[^\d]/g, '');

const toAddressCase = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const upper = token.toUpperCase();
      const directional = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
      if (directional.has(upper)) return upper;

      return token
        .split('-')
        .map((part) =>
          part
            .split("'")
            .map((seg) => (seg ? `${seg.charAt(0).toUpperCase()}${seg.slice(1).toLowerCase()}` : seg))
            .join("'")
        )
        .join('-');
    })
    .join(' ');

const normalizeZipInput = (value: unknown) => String(value || '').replace(/[^\d-]/g, '');
const normalizeRcfeName = (value: unknown) => toAddressCase(value);
const normalizeCountyInput = (value: unknown) =>
  toAddressCase(value)
    .replace(/\s+county$/i, '')
    .trim();

export default function RcfeDataToolsPage() {
  const { isAdmin, isLoading } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [confirmationFilter, setConfirmationFilter] = useState<'all' | 'confirmed_there' | 'told_not_there' | 'not_confirmed'>('all');
  const [sortField, setSortField] = useState<RCFESortField>('RCFE_Name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [rcfeDrafts, setRcfeDrafts] = useState<Record<string, RcfeDraftFields>>({});
  const [rcfeFieldOverrides, setRcfeFieldOverrides] = useState<Record<string, RcfeDraftFields>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [updatedRowTimestamps, setUpdatedRowTimestamps] = useState<Record<string, string>>({});
  const [lastPushResult, setLastPushResult] = useState<{
    attempted: number;
    success: number;
    failed: number;
    at: string;
  } | null>(null);
  const [memberPresenceStatus, setMemberPresenceStatus] = useState<Record<string, 'there' | 'not_there'>>({});
  const confirmedStorageKey = 'rcfe-member-presence-status';
  const [memberExtraDetails, setMemberExtraDetails] = useState<Record<string, string>>({});
  const commentsStorageKey = 'rcfe-member-extra-details';
  const [memberVerifiedAt, setMemberVerifiedAt] = useState<Record<string, string>>({});
  const verifiedAtStorageKey = 'rcfe-member-verified-at';
  const rcfeOverridesStorageKey = 'rcfe-field-overrides';
  const progressDocRef = useMemo(
    () => (firestore ? doc(firestore, 'admin_tool_state', 'rcfe_data_progress') : null),
    [firestore]
  );
  const hasHydratedProgressRef = useRef(false);
  const progressSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const getRcfeName = (member: Member) =>
    normalizeRcfeName(normalizeRcfeNameForAssignment(member.RCFE_Name) || 'RCFE Unassigned');
  const getRcfeStreet = (member: Member) => String(member.RCFE_Street || member.RCFE_Address || '').trim();
  const getRcfeCity = (member: Member) => String(member.RCFE_City || '').trim();
  const getRcfeZip = (member: Member) => String(member.RCFE_Zip || '').trim();
  const getRcfeCounty = (member: Member) => normalizeCountyInput(member.RCFE_County || member.Member_County || '');
  const getRcfeCityZip = (member: Member) => [getRcfeCity(member), getRcfeZip(member)].filter(Boolean).join(', ');
  const getRcfeAdministrator = (member: Member) =>
    normalizeAdminName(String(member.RCFE_Administrator || member.RCFE_Admin_Name || '').trim());
  const getRcfeAdministratorEmail = (member: Member) => String(member.RCFE_Administrator_Email || member.RCFE_Admin_Email || '').trim();
  const getRcfeAdministratorPhone = (member: Member) => String(member.RCFE_Administrator_Phone || member.RCFE_Admin_Phone || '').trim();
  const getRcfeBeds = (member: Member) => String(member.Number_of_Beds || '').trim();

  const formatDateTimeSafe = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleString();
  };

  const fetchCachedMembers = useCallback(
    async (showLoadedToast: boolean) => {
      const res = await fetch('/api/all-members');
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || `Fetch failed (HTTP ${res.status})`);
      }

      const allMembers = (Array.isArray(data.members) ? data.members : []) as Member[];
      const scoped = allMembers.filter((m) => (isHealthNetMember(m) || isKaiserMember(m)) && isAuthorizedMember(m));
      setMembers(scoped);
      if (showLoadedToast) {
        toast({ title: 'RCFE data loaded', description: `Loaded ${scoped.length} authorized members.` });
      }
      return scoped.length;
    },
    [toast]
  );

  const loadMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    let syncErrorMessage = '';
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in to sync.');
      const idToken = await auth.currentUser.getIdToken();

      const syncRes = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'full' }),
      });
      const syncData = (await syncRes.json().catch(() => ({}))) as any;
      if (!syncRes.ok || !syncData?.success) {
        throw new Error(syncData?.error || syncData?.details || `Sync failed (HTTP ${syncRes.status})`);
      }
    } catch (syncError: any) {
      syncErrorMessage = String(syncError?.message || 'Sync failed.');
    }

    try {
      const count = await fetchCachedMembers(!syncErrorMessage);
      if (syncErrorMessage) {
        toast({
          title: 'Sync failed, loaded cached data',
          description: `${syncErrorMessage} Showing ${count} existing authorized members.`,
          variant: 'destructive',
        });
      }
    } catch (fetchError: any) {
      const baseMessage = String(fetchError?.message || 'Could not load RCFE data.');
      toast({
        title: 'Load failed',
        description: syncErrorMessage ? `${syncErrorMessage} Also failed to load cache: ${baseMessage}` : baseMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMembers(false);
    }
  }, [auth?.currentUser, fetchCachedMembers, toast]);

  useEffect(() => {
    if (!isAdmin) return;
    if (members.length > 0) return;
    setIsLoadingMembers(true);
    fetchCachedMembers(false)
      .catch(() => {
        // Keep this silent on initial page load.
      })
      .finally(() => setIsLoadingMembers(false));
  }, [isAdmin, members.length, fetchCachedMembers]);

  const rcfeRows = useMemo<RCFEDirectoryRow[]>(() => {
    const grouped = new Map<string, RCFEDirectoryRow>();

    members.forEach((member) => {
      if (!hasAssignedRcfe(member)) return;
      const rcfeName = String(getRcfeName(member) || '').trim();
      if (!rcfeName || rcfeName === 'RCFE Unassigned') return;

      const street = getRcfeStreet(member);
      const city = getRcfeCity(member);
      const zip = getRcfeZip(member);
      const county = getRcfeCounty(member);
      const cityZip = getRcfeCityZip(member);
      const adminName = getRcfeAdministrator(member);
      const adminEmail = getRcfeAdministratorEmail(member);
      const adminPhone = getRcfeAdministratorPhone(member);
      const beds = getRcfeBeds(member);
      const memberId = String(member.Client_ID2 || '').trim();
      const rcfeRegisteredId = String(member.RCFE_Registered_ID || '').trim();
      const memberName =
        String(member.memberName || '').trim() ||
        `${String(member.memberFirstName || '').trim()} ${String(member.memberLastName || '').trim()}`.trim();

      const key = [rcfeName.toLowerCase(), street.toLowerCase(), cityZip.toLowerCase()].filter(Boolean).join('|');
      const existing = grouped.get(key);
      if (existing) {
        existing.memberCount += 1;
        if (!existing.RCFE_Administrator && adminName) existing.RCFE_Administrator = adminName;
        if (!existing.RCFE_Street && street) existing.RCFE_Street = street;
        if (!existing.RCFE_City && city) existing.RCFE_City = city;
        if (!existing.RCFE_Zip && zip) existing.RCFE_Zip = zip;
        if (!existing.RCFE_County && county) existing.RCFE_County = county;
        if (!existing.RCFE_Administrator_Email && adminEmail) existing.RCFE_Administrator_Email = adminEmail;
        if (!existing.RCFE_Administrator_Phone && adminPhone) existing.RCFE_Administrator_Phone = adminPhone;
        if (!existing.Number_of_Beds && beds) existing.Number_of_Beds = beds;
        if (rcfeRegisteredId && !existing.rcfeRegisteredIds.includes(rcfeRegisteredId)) {
          existing.rcfeRegisteredIds.push(rcfeRegisteredId);
        }
        if (memberId && !existing.memberIds.includes(memberId)) existing.memberIds.push(memberId);
        if (memberName && !existing.memberNames.includes(memberName)) existing.memberNames.push(memberName);
        if (memberId && !existing.members.some((m) => m.id === memberId)) existing.members.push({ id: memberId, name: memberName || memberId });
      } else {
        grouped.set(key, {
          key,
          RCFE_Name: rcfeName,
          rcfeRegisteredIds: rcfeRegisteredId ? [rcfeRegisteredId] : [],
          RCFE_Street: street,
          RCFE_City: city,
          RCFE_Zip: zip,
          RCFE_County: county,
          RCFE_City_RCFE_Zip: cityZip,
          RCFE_Administrator: adminName,
          RCFE_Administrator_Email: adminEmail,
          RCFE_Administrator_Phone: adminPhone,
          Number_of_Beds: beds,
          memberCount: 1,
          memberIds: memberId ? [memberId] : [],
          memberNames: memberName ? [memberName] : [],
          members: memberId ? [{ id: memberId, name: memberName || memberId }] : [],
        });
      }
    });

    return Array.from(grouped.values());
  }, [members]);

  const getBaseDraft = (row: RCFEDirectoryRow): RcfeDraftFields => ({
    RCFE_County: row.RCFE_County,
    RCFE_Administrator: row.RCFE_Administrator,
    RCFE_Administrator_Email: row.RCFE_Administrator_Email,
    RCFE_Administrator_Phone: row.RCFE_Administrator_Phone,
    Number_of_Beds: row.Number_of_Beds,
  });

  const getDraft = (row: RCFEDirectoryRow): RcfeDraftFields => {
    const base = getBaseDraft(row);
    const persisted = rcfeFieldOverrides[row.key];
    const inSession = rcfeDrafts[row.key];
    return {
      RCFE_County: normalizeCountyInput(inSession?.RCFE_County ?? persisted?.RCFE_County ?? base.RCFE_County),
      RCFE_Administrator: normalizeAdminName(inSession?.RCFE_Administrator ?? persisted?.RCFE_Administrator ?? base.RCFE_Administrator),
      RCFE_Administrator_Email: inSession?.RCFE_Administrator_Email ?? persisted?.RCFE_Administrator_Email ?? base.RCFE_Administrator_Email,
      RCFE_Administrator_Phone: inSession?.RCFE_Administrator_Phone ?? persisted?.RCFE_Administrator_Phone ?? base.RCFE_Administrator_Phone,
      Number_of_Beds: inSession?.Number_of_Beds ?? persisted?.Number_of_Beds ?? base.Number_of_Beds,
    };
  };

  const updateDraftField = useCallback(
    (row: RCFEDirectoryRow, updater: (current: RcfeDraftFields) => RcfeDraftFields) => {
      const current = getDraft(row);
      const next = updater(current);
      setRcfeDrafts((prev) => ({ ...prev, [row.key]: next }));
      setRcfeFieldOverrides((prev) => ({ ...prev, [row.key]: next }));
      setUpdatedRowTimestamps((prev) => {
        if (!prev[row.key]) return prev;
        const changed =
          String(next.RCFE_County || '').trim() !== String(row.RCFE_County || '').trim() ||
          String(next.RCFE_Administrator || '').trim() !== String(row.RCFE_Administrator || '').trim() ||
          String(next.RCFE_Administrator_Email || '').trim() !== String(row.RCFE_Administrator_Email || '').trim() ||
          String(next.RCFE_Administrator_Phone || '').trim() !== String(row.RCFE_Administrator_Phone || '').trim() ||
          String(next.Number_of_Beds || '').trim() !== String(row.Number_of_Beds || '').trim();
        if (!changed) return prev;
        const copy = { ...prev };
        delete copy[row.key];
        return copy;
      });
    },
    [rcfeDrafts, rcfeFieldOverrides]
  );

  const hasDraftChanges = (row: RCFEDirectoryRow) => {
    const draft = getDraft(row);
    return (
      String(draft.RCFE_County || '').trim() !== String(row.RCFE_County || '').trim() ||
      String(draft.RCFE_Administrator || '').trim() !== String(row.RCFE_Administrator || '').trim() ||
      String(draft.RCFE_Administrator_Email || '').trim() !== String(row.RCFE_Administrator_Email || '').trim() ||
      String(draft.RCFE_Administrator_Phone || '').trim() !== String(row.RCFE_Administrator_Phone || '').trim() ||
      String(draft.Number_of_Beds || '').trim() !== String(row.Number_of_Beds || '').trim()
    );
  };

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rcfeRows.filter((row) => {
      const confirmedThereCount = row.members.filter((m) => memberPresenceStatus[m.id] === 'there').length;
      const toldNotThereCount = row.members.filter((m) => memberPresenceStatus[m.id] === 'not_there').length;
      const unresolvedCount = Math.max(0, row.members.length - confirmedThereCount - toldNotThereCount);

      if (confirmationFilter === 'confirmed_there' && confirmedThereCount === 0) return false;
      if (confirmationFilter === 'told_not_there' && toldNotThereCount === 0) return false;
      if (confirmationFilter === 'not_confirmed' && unresolvedCount === 0) return false;

      if (!needle) return true;
      return (
        row.RCFE_Name.toLowerCase().includes(needle) ||
        row.RCFE_County.toLowerCase().includes(needle) ||
        row.RCFE_City_RCFE_Zip.toLowerCase().includes(needle) ||
        row.RCFE_Administrator.toLowerCase().includes(needle) ||
        row.RCFE_Administrator_Email.toLowerCase().includes(needle) ||
        row.memberNames.some((name) => String(name || '').toLowerCase().includes(needle)) ||
        row.members.some((m) => {
          const memberId = String(m.id || '').toLowerCase();
          const extra = String(memberExtraDetails[m.id] || '').toLowerCase();
          return memberId.includes(needle) || extra.includes(needle);
        })
      );
    });

    return filtered.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const av = String((a as any)[sortField] || '').toLowerCase();
      const bv = String((b as any)[sortField] || '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [rcfeRows, search, sortField, sortDirection, confirmationFilter, memberPresenceStatus, memberExtraDetails]);

  const editedRows = useMemo(() => rcfeRows.filter((row) => hasDraftChanges(row)), [rcfeRows, rcfeDrafts, rcfeFieldOverrides]);
  const updatedRowsCount = useMemo(
    () => rcfeRows.filter((row) => Boolean(updatedRowTimestamps[row.key])).length,
    [rcfeRows, updatedRowTimestamps]
  );

  const handleSort = (field: RCFESortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const saveRow = useCallback(
    async (row: RCFEDirectoryRow) => {
      if (!auth?.currentUser) throw new Error('You must be signed in to update RCFE data.');
      if (!row.memberIds.length) throw new Error('No member IDs available for this RCFE.');

      const raw = getDraft(row);
      const draft = {
        ...raw,
        RCFE_County: normalizeCountyInput(raw.RCFE_County),
        RCFE_Administrator: normalizeAdminName(raw.RCFE_Administrator),
        Number_of_Beds: normalizeBedsInput(raw.Number_of_Beds),
      };
      const normalizedRcfeName = normalizeRcfeName(row.RCFE_Name);
      const normalizedStreet = toAddressCase(row.RCFE_Street);
      const normalizedCity = toAddressCase(row.RCFE_City);
      const normalizedZip = normalizeZipInput(row.RCFE_Zip);
      const normalizedAddress = [normalizedStreet, [normalizedCity, normalizedZip].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ');

      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/rcfe-directory/upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          memberIds: row.memberIds,
          rcfeRegisteredIds: row.rcfeRegisteredIds,
          updates: {
            RCFE_Name: normalizedRcfeName,
            ...draft,
            RCFE_Street: normalizedStreet,
            RCFE_City: normalizedCity,
            RCFE_Zip: normalizedZip,
            RCFE_Address: normalizedAddress,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to update RCFE data (HTTP ${res.status})`);
      }

      const memberIdSet = new Set(row.memberIds.map((id) => String(id || '').trim()));
      setMembers((prev) =>
        prev.map((member) =>
          memberIdSet.has(String(member.Client_ID2 || '').trim())
            ? {
                ...member,
                RCFE_Name: normalizedRcfeName || member.RCFE_Name,
                RCFE_Administrator: draft.RCFE_Administrator,
                RCFE_Administrator_Email: draft.RCFE_Administrator_Email,
                RCFE_Admin_Email: draft.RCFE_Administrator_Email,
                RCFE_Administrator_Phone: draft.RCFE_Administrator_Phone,
                Number_of_Beds: draft.Number_of_Beds,
                RCFE_Street: normalizedStreet || member.RCFE_Street,
                RCFE_City: normalizedCity || member.RCFE_City,
                RCFE_Zip: normalizedZip || member.RCFE_Zip,
                RCFE_County: draft.RCFE_County || member.RCFE_County,
                RCFE_Address: normalizedAddress || member.RCFE_Address,
              }
            : member
        )
      );
      setRcfeDrafts((prev) => ({ ...prev, [row.key]: draft }));
      setRcfeFieldOverrides((prev) => ({ ...prev, [row.key]: draft }));
    },
    [auth?.currentUser, rcfeDrafts]
  );

  const syncEditedRows = useCallback(async (rows: RCFEDirectoryRow[]) => {
    if (rows.length === 0) {
      toast({ title: 'No edits to push', description: 'Make a change first, then push all edited.' });
      return { attempted: 0, success: 0, failed: 0 };
    }

    setIsSavingAll(true);

    const attempted = rows.length;
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await saveRow(row);
        success += 1;
        const stamp = new Date().toISOString();
        setUpdatedRowTimestamps((prev) => ({ ...prev, [row.key]: stamp }));
      } catch {
        failed += 1;
      }
    }

    setIsSavingAll(false);
    setLastPushResult({
      attempted,
      success,
      failed,
      at: new Date().toISOString(),
    });

    if (failed === 0) {
      toast({ title: 'All edits synced', description: `Successfully pushed ${success} RCFE row(s).` });
    } else {
      toast({
        title: 'RCFE sync completed with errors',
        description: `Synced ${success}, failed ${failed}. You can run Push All Edited again.`,
        variant: 'destructive',
      });
    }

    return { attempted, success, failed };
  }, [saveRow, toast]);

  const pushAllEdited = useCallback(async () => {
    await syncEditedRows(editedRows);
  }, [editedRows, syncEditedRows]);

  const setMemberPresence = useCallback((memberId: string, status: 'there' | 'not_there', checked: boolean) => {
    const key = String(memberId || '').trim();
    if (!key) return;
    setMemberPresenceStatus((prev) => {
      const next = { ...prev };
      if (!checked) {
        if (next[key] === status) delete next[key];
        return next;
      }
      next[key] = status;
      return next;
    });
    if (checked) {
      setMemberVerifiedAt((prev) => ({ ...prev, [key]: new Date().toISOString() }));
    }
  }, []);

  const toggleAllRowMembers = useCallback((row: RCFEDirectoryRow, status: 'there' | 'not_there', checked: boolean) => {
    setMemberPresenceStatus((prev) => {
      const next = { ...prev };
      row.members.forEach((member) => {
        if (!member.id) return;
        if (!checked) {
          if (next[member.id] === status) delete next[member.id];
        } else {
          next[member.id] = status;
        }
      });
      return next;
    });
    if (checked) {
      const stamp = new Date().toISOString();
      setMemberVerifiedAt((prev) => {
        const next = { ...prev };
        row.members.forEach((member) => {
          if (member.id) next[member.id] = stamp;
        });
        return next;
      });
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(confirmedStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, 'there' | 'not_there'>;
      if (parsed && typeof parsed === 'object') {
        setMemberPresenceStatus(parsed);
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(verifiedAtStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        setMemberVerifiedAt(parsed);
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(rcfeOverridesStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, RcfeDraftFields>;
      if (parsed && typeof parsed === 'object') {
        setRcfeFieldOverrides(parsed);
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(confirmedStorageKey, JSON.stringify(memberPresenceStatus));
    } catch {
      // ignore storage issues
    }
  }, [memberPresenceStatus]);

  useEffect(() => {
    try {
      window.localStorage.setItem(verifiedAtStorageKey, JSON.stringify(memberVerifiedAt));
    } catch {
      // ignore storage issues
    }
  }, [memberVerifiedAt]);

  useEffect(() => {
    try {
      window.localStorage.setItem(rcfeOverridesStorageKey, JSON.stringify(rcfeFieldOverrides));
    } catch {
      // ignore storage issues
    }
  }, [rcfeFieldOverrides]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(commentsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        setMemberExtraDetails(parsed);
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    const loadFirestoreProgress = async () => {
      if (!progressDocRef) {
        hasHydratedProgressRef.current = true;
        return;
      }
      try {
        const snap = await getDoc(progressDocRef);
        if (!snap.exists()) {
          hasHydratedProgressRef.current = true;
          return;
        }
        const data = snap.data() as any;
        const fsPresence = (data?.memberPresenceStatus || {}) as Record<string, 'there' | 'not_there'>;
        const fsDetails = (data?.memberExtraDetails || {}) as Record<string, string>;
        const fsVerifiedAt = (data?.memberVerifiedAt || {}) as Record<string, string>;
        const fsOverrides = (data?.rcfeFieldOverrides || {}) as Record<string, RcfeDraftFields>;
        if (fsPresence && typeof fsPresence === 'object') {
          setMemberPresenceStatus((prev) => ({ ...prev, ...fsPresence }));
        }
        if (fsDetails && typeof fsDetails === 'object') {
          setMemberExtraDetails((prev) => ({ ...prev, ...fsDetails }));
        }
        if (fsVerifiedAt && typeof fsVerifiedAt === 'object') {
          setMemberVerifiedAt((prev) => ({ ...prev, ...fsVerifiedAt }));
        }
        if (fsOverrides && typeof fsOverrides === 'object') {
          setRcfeFieldOverrides((prev) => ({ ...prev, ...fsOverrides }));
        }
      } catch (error) {
        console.warn('Failed to load RCFE progress from Firestore:', error);
      } finally {
        hasHydratedProgressRef.current = true;
      }
    };

    void loadFirestoreProgress();
  }, [progressDocRef]);

  useEffect(() => {
    try {
      window.localStorage.setItem(commentsStorageKey, JSON.stringify(memberExtraDetails));
    } catch {
      // ignore storage issues
    }
  }, [memberExtraDetails]);

  useEffect(() => {
    if (!hasHydratedProgressRef.current) return;
    if (!progressDocRef) return;
    if (!auth?.currentUser) return;

    if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
    progressSaveTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(
          progressDocRef,
          {
            memberPresenceStatus,
            memberExtraDetails,
            memberVerifiedAt,
            rcfeFieldOverrides,
            updatedAt: serverTimestamp(),
            updatedByUid: auth.currentUser?.uid || null,
            updatedByEmail: auth.currentUser?.email || null,
          },
          { merge: true }
        );
      } catch (error) {
        console.warn('Failed to save RCFE progress to Firestore:', error);
      }
    }, 800);

    return () => {
      if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
    };
  }, [progressDocRef, auth?.currentUser, memberPresenceStatus, memberExtraDetails, memberVerifiedAt, rcfeFieldOverrides]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need admin permissions to view RCFE Data Management.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-indigo-600" />
            RCFE Data Management
          </h1>
          <p className="text-muted-foreground">
            Update RCFE administrator contact details and number of beds. Draft edits persist in Firestore; Caspio updates are push-only on demand.
          </p>
        </div>
        <Button onClick={loadMembers} disabled={isLoadingMembers}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
          Sync from Caspio
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/tools/rcfe-data/monthly-verification">
            Monthly Verification Email
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex-1 max-w-lg">
              <Input
                placeholder="Search RCFE, city, administrator, member name, or comments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={confirmationFilter}
                onValueChange={(value) =>
                  setConfirmationFilter(value as 'all' | 'confirmed_there' | 'told_not_there' | 'not_confirmed')
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Confirmation filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All RCFEs</SelectItem>
                  <SelectItem value="confirmed_there">Has Confirmed There Members</SelectItem>
                  <SelectItem value="told_not_there">Has Told Not There Members</SelectItem>
                  <SelectItem value="not_confirmed">Has Unconfirmed Members</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline">{visibleRows.length} RCFEs</Badge>
              <Badge variant="secondary">Needs Update: {editedRows.length}</Badge>
              <Badge variant="outline">Already Updated: {updatedRowsCount}</Badge>
              {lastPushResult ? (
                <Badge variant="outline">
                  Last Push: {lastPushResult.success}/{lastPushResult.attempted}
                  {lastPushResult.failed > 0 ? ` (${lastPushResult.failed} failed)` : ''}
                </Badge>
              ) : null}
              <Badge variant="outline">Drafts saved to Firestore</Badge>
              <Button onClick={pushAllEdited} disabled={isSavingAll || editedRows.length === 0}>
                {isSavingAll ? 'Syncing edited rows...' : `Push All Edited (${editedRows.length})`}
              </Button>
            </div>
          </div>

          <div className="w-full overflow-x-auto pb-2">
              <Table className="min-w-[1240px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[320px]">
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('RCFE_Name')}>
                        RCFE Home
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('RCFE_County')}>
                        County
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('RCFE_Administrator')}>
                        Admin Name
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('RCFE_Administrator_Email')}>
                        Admin Email
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('RCFE_Administrator_Phone')}>
                        Admin Phone
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('Number_of_Beds')}>
                        Number of Beds
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No RCFEs match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((row) => {
                      const draft = getDraft(row);
                      const hasPendingChanges = hasDraftChanges(row);
                      const updatedAt = updatedRowTimestamps[row.key];
                      const verifiedCount = row.members.filter(
                        (m) => memberPresenceStatus[m.id] === 'there' || memberPresenceStatus[m.id] === 'not_there'
                      ).length;
                      const allVerified = row.members.length > 0 && verifiedCount === row.members.length;
                      return (
                        <TableRow key={row.key}>
                          <TableCell className="max-w-[320px]">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{row.RCFE_Name || '-'}</div>
                              {allVerified && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Verified
                                </span>
                              )}
                              {!hasPendingChanges && updatedAt ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Updated
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground break-words">
                              {[toAddressCase(row.RCFE_Street), [toAddressCase(row.RCFE_City), normalizeZipInput(row.RCFE_Zip)].filter(Boolean).join(', ')]
                                .filter(Boolean)
                                .join(', ') || '-'}
                            </div>
                            <div className="text-xs mt-1">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="font-medium text-left underline-offset-2 hover:underline">
                                    Members: {row.memberCount}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="start" className="w-[320px] p-3">
                                  <div className="text-xs font-semibold mb-2">Confirm members at RCFE ({row.memberCount})</div>
                                  <div className="mb-2 flex items-center gap-2">
                                    <Checkbox
                                      checked={row.members.length > 0 && row.members.every((m) => memberPresenceStatus[m.id] === 'there')}
                                      onCheckedChange={(checked) => toggleAllRowMembers(row, 'there', Boolean(checked))}
                                    />
                                    <span className="text-xs">Mark all Confirmed There</span>
                                  </div>
                                  <div className="mb-2 flex items-center gap-2">
                                    <Checkbox
                                      checked={row.members.length > 0 && row.members.every((m) => memberPresenceStatus[m.id] === 'not_there')}
                                      onCheckedChange={(checked) => toggleAllRowMembers(row, 'not_there', Boolean(checked))}
                                    />
                                    <span className="text-xs">Mark all Told Not There</span>
                                  </div>
                                  <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
                                    {row.members.length > 0 ? (
                                      row.members
                                        .slice()
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((member) => (
                                          <div key={`${row.key}-${member.id}`} className="space-y-1 rounded-sm border p-2">
                                            <div className="text-xs leading-tight">{member.name}</div>
                                            <div className="text-[11px] text-muted-foreground">
                                              Last Verified: {formatDateTimeSafe(memberVerifiedAt[member.id]) || 'Not yet'}
                                            </div>
                                            <div className="flex items-center gap-4">
                                              <label className="flex items-center gap-2 text-[11px]">
                                                <Checkbox
                                                  checked={memberPresenceStatus[member.id] === 'there'}
                                                  onCheckedChange={(checked) => setMemberPresence(member.id, 'there', Boolean(checked))}
                                                />
                                                <span>Confirmed There</span>
                                              </label>
                                              <label className="flex items-center gap-2 text-[11px]">
                                                <Checkbox
                                                  checked={memberPresenceStatus[member.id] === 'not_there'}
                                                  onCheckedChange={(checked) => setMemberPresence(member.id, 'not_there', Boolean(checked))}
                                                />
                                                <span>Told Not There</span>
                                              </label>
                                            </div>
                                            <div className="pt-1">
                                              <Input
                                                value={String(memberExtraDetails[member.id] || '')}
                                                onChange={(e) =>
                                                  setMemberExtraDetails((prev) => ({
                                                    ...prev,
                                                    [member.id]: e.target.value,
                                                  }))
                                                }
                                                placeholder="Extra details from admin..."
                                                className="h-7 text-[11px]"
                                              />
                                            </div>
                                          </div>
                                        ))
                                    ) : (
                                      <div className="text-xs text-muted-foreground">No member names available</div>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Verified: {verifiedCount}/{row.members.length}
                                {' | '}
                                Confirmed There: {row.members.filter((m) => memberPresenceStatus[m.id] === 'there').length}/{row.members.length}
                                {' | '}
                                Told Not There: {row.members.filter((m) => memberPresenceStatus[m.id] === 'not_there').length}
                                {!hasPendingChanges && updatedAt ? ` | Updated: ${formatDateTimeSafe(updatedAt)}` : ''}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[140px]"
                              value={draft.RCFE_County}
                              onChange={(e) => updateDraftField(row, (current) => ({ ...current, RCFE_County: e.target.value }))}
                              onBlur={(e) => {
                                const normalized = normalizeCountyInput(e.target.value);
                                if (normalized !== e.target.value) {
                                  updateDraftField(row, (current) => ({ ...current, RCFE_County: normalized }));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[160px]"
                              value={draft.RCFE_Administrator}
                              onChange={(e) => updateDraftField(row, (current) => ({ ...current, RCFE_Administrator: e.target.value }))}
                              onBlur={(e) => {
                                const normalized = normalizeAdminName(e.target.value);
                                if (normalized !== e.target.value) {
                                  updateDraftField(row, (current) => ({ ...current, RCFE_Administrator: normalized }));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[190px]"
                              value={draft.RCFE_Administrator_Email}
                              onChange={(e) => updateDraftField(row, (current) => ({ ...current, RCFE_Administrator_Email: e.target.value }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[150px]"
                              value={draft.RCFE_Administrator_Phone}
                              onChange={(e) => updateDraftField(row, (current) => ({ ...current, RCFE_Administrator_Phone: e.target.value }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[110px]"
                              inputMode="numeric"
                              value={draft.Number_of_Beds}
                              onChange={(e) =>
                                updateDraftField(row, (current) => ({
                                  ...current,
                                  Number_of_Beds: normalizeBedsInput(e.target.value),
                                }))
                              }
                            />
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
