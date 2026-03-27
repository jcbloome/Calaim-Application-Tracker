'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown, Building2, RefreshCw } from 'lucide-react';

interface Member {
  Client_ID2: string;
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
  RCFE_Street: string;
  RCFE_City: string;
  RCFE_Zip: string;
  RCFE_City_RCFE_Zip: string;
  RCFE_Administrator: string;
  RCFE_Administrator_Email: string;
  RCFE_Administrator_Phone: string;
  Number_of_Beds: string;
  memberCount: number;
  memberIds: string[];
  memberNames: string[];
}

type RCFESortField =
  | 'RCFE_Name'
  | 'RCFE_Administrator'
  | 'RCFE_Administrator_Email'
  | 'RCFE_Administrator_Phone'
  | 'Number_of_Beds';

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

export default function RcfeDataToolsPage() {
  const { isAdmin, isLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();

  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<RCFESortField>('RCFE_Name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [rcfeDrafts, setRcfeDrafts] = useState<
    Record<string, { RCFE_Administrator: string; RCFE_Administrator_Email: string; RCFE_Administrator_Phone: string; Number_of_Beds: string }>
  >({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);

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

  const getRcfeName = (member: Member) => normalizeRcfeNameForAssignment(member.RCFE_Name) || 'RCFE Unassigned';
  const getRcfeStreet = (member: Member) => String(member.RCFE_Street || member.RCFE_Address || '').trim();
  const getRcfeCity = (member: Member) => String(member.RCFE_City || '').trim();
  const getRcfeZip = (member: Member) => String(member.RCFE_Zip || '').trim();
  const getRcfeCityZip = (member: Member) => [getRcfeCity(member), getRcfeZip(member)].filter(Boolean).join(', ');
  const getRcfeAdministrator = (member: Member) => String(member.RCFE_Administrator || member.RCFE_Admin_Name || '').trim();
  const getRcfeAdministratorEmail = (member: Member) => String(member.RCFE_Administrator_Email || member.RCFE_Admin_Email || '').trim();
  const getRcfeAdministratorPhone = (member: Member) => String(member.RCFE_Administrator_Phone || member.RCFE_Admin_Phone || '').trim();
  const getRcfeBeds = (member: Member) => String(member.Number_of_Beds || '').trim();

  const loadMembers = useCallback(async () => {
    setIsLoadingMembers(true);
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

      const res = await fetch('/api/all-members');
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || `Fetch failed (HTTP ${res.status})`);
      }

      const allMembers = (Array.isArray(data.members) ? data.members : []) as Member[];
      const scoped = allMembers.filter((m) => (isHealthNetMember(m) || isKaiserMember(m)) && isAuthorizedMember(m));
      setMembers(scoped);
      toast({ title: 'RCFE data loaded', description: `Loaded ${scoped.length} authorized members.` });
    } catch (error: any) {
      toast({
        title: 'Load failed',
        description: error?.message || 'Could not load RCFE data.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMembers(false);
    }
  }, [auth?.currentUser, toast]);

  const rcfeRows = useMemo<RCFEDirectoryRow[]>(() => {
    const grouped = new Map<string, RCFEDirectoryRow>();

    members.forEach((member) => {
      if (!hasAssignedRcfe(member)) return;
      const rcfeName = String(getRcfeName(member) || '').trim();
      if (!rcfeName || rcfeName === 'RCFE Unassigned') return;

      const street = getRcfeStreet(member);
      const city = getRcfeCity(member);
      const zip = getRcfeZip(member);
      const cityZip = getRcfeCityZip(member);
      const adminName = getRcfeAdministrator(member);
      const adminEmail = getRcfeAdministratorEmail(member);
      const adminPhone = getRcfeAdministratorPhone(member);
      const beds = getRcfeBeds(member);
      const memberId = String(member.Client_ID2 || '').trim();
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
        if (!existing.RCFE_Administrator_Email && adminEmail) existing.RCFE_Administrator_Email = adminEmail;
        if (!existing.RCFE_Administrator_Phone && adminPhone) existing.RCFE_Administrator_Phone = adminPhone;
        if (!existing.Number_of_Beds && beds) existing.Number_of_Beds = beds;
        if (memberId && !existing.memberIds.includes(memberId)) existing.memberIds.push(memberId);
        if (memberName && !existing.memberNames.includes(memberName)) existing.memberNames.push(memberName);
      } else {
        grouped.set(key, {
          key,
          RCFE_Name: rcfeName,
          RCFE_Street: street,
          RCFE_City: city,
          RCFE_Zip: zip,
          RCFE_City_RCFE_Zip: cityZip,
          RCFE_Administrator: adminName,
          RCFE_Administrator_Email: adminEmail,
          RCFE_Administrator_Phone: adminPhone,
          Number_of_Beds: beds,
          memberCount: 1,
          memberIds: memberId ? [memberId] : [],
          memberNames: memberName ? [memberName] : [],
        });
      }
    });

    return Array.from(grouped.values());
  }, [members]);

  const getDraft = (row: RCFEDirectoryRow) => ({
    RCFE_Administrator: rcfeDrafts[row.key]?.RCFE_Administrator ?? row.RCFE_Administrator,
    RCFE_Administrator_Email: rcfeDrafts[row.key]?.RCFE_Administrator_Email ?? row.RCFE_Administrator_Email,
    RCFE_Administrator_Phone: rcfeDrafts[row.key]?.RCFE_Administrator_Phone ?? row.RCFE_Administrator_Phone,
    Number_of_Beds: rcfeDrafts[row.key]?.Number_of_Beds ?? row.Number_of_Beds,
  });

  const hasDraftChanges = (row: RCFEDirectoryRow) => {
    const draft = getDraft(row);
    return (
      String(draft.RCFE_Administrator || '').trim() !== String(row.RCFE_Administrator || '').trim() ||
      String(draft.RCFE_Administrator_Email || '').trim() !== String(row.RCFE_Administrator_Email || '').trim() ||
      String(draft.RCFE_Administrator_Phone || '').trim() !== String(row.RCFE_Administrator_Phone || '').trim() ||
      String(draft.Number_of_Beds || '').trim() !== String(row.Number_of_Beds || '').trim()
    );
  };

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rcfeRows.filter((row) => {
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
      const dir = sortDirection === 'asc' ? 1 : -1;
      const av = String((a as any)[sortField] || '').toLowerCase();
      const bv = String((b as any)[sortField] || '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [rcfeRows, search, sortField, sortDirection]);

  const editedRows = useMemo(() => rcfeRows.filter((row) => hasDraftChanges(row)), [rcfeRows, rcfeDrafts]);

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
        RCFE_Administrator: normalizeAdminName(raw.RCFE_Administrator),
        Number_of_Beds: normalizeBedsInput(raw.Number_of_Beds),
      };
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
          updates: {
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
                RCFE_Administrator: draft.RCFE_Administrator,
                RCFE_Administrator_Email: draft.RCFE_Administrator_Email,
                RCFE_Admin_Email: draft.RCFE_Administrator_Email,
                RCFE_Administrator_Phone: draft.RCFE_Administrator_Phone,
                Number_of_Beds: draft.Number_of_Beds,
                RCFE_Street: normalizedStreet || member.RCFE_Street,
                RCFE_City: normalizedCity || member.RCFE_City,
                RCFE_Zip: normalizedZip || member.RCFE_Zip,
                RCFE_Address: normalizedAddress || member.RCFE_Address,
              }
            : member
        )
      );
      setRcfeDrafts((prev) => ({ ...prev, [row.key]: draft }));
    },
    [auth?.currentUser, rcfeDrafts]
  );

  const syncEditedRows = useCallback(async (rows: RCFEDirectoryRow[], mode: 'auto' | 'manual') => {
    if (rows.length === 0) {
      if (mode === 'manual') {
        toast({ title: 'No edits to push', description: 'Make a change first, then push all edited.' });
      }
      return { success: 0, failed: 0 };
    }

    if (mode === 'manual') {
      setIsSavingAll(true);
    } else {
      setIsAutoSaving(true);
    }

    let success = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await saveRow(row);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    if (mode === 'manual') {
      setIsSavingAll(false);
    } else {
      setIsAutoSaving(false);
    }

    if (mode === 'manual') {
      if (failed === 0) {
        toast({ title: 'All edits synced', description: `Successfully pushed ${success} RCFE row(s).` });
      } else {
        toast({
          title: 'RCFE sync completed with errors',
          description: `Synced ${success}, failed ${failed}. You can run Push All Edited again.`,
          variant: 'destructive',
        });
      }
    } else if (failed > 0) {
      toast({
        title: 'Some autosave updates failed',
        description: `Autosaved ${success}, failed ${failed}. Use Push All Edited to retry.`,
        variant: 'destructive',
      });
    }

    return { success, failed };
  }, [editedRows, saveRow, toast]);

  const pushAllEdited = useCallback(async () => {
    await syncEditedRows(editedRows, 'manual');
  }, [editedRows, syncEditedRows]);

  useEffect(() => {
    if (editedRows.length === 0) return;
    if (autoSaveInFlightRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (autoSaveInFlightRef.current) return;
      autoSaveInFlightRef.current = true;
      try {
        const snapshotRows = [...editedRows];
        await syncEditedRows(snapshotRows, 'auto');
      } finally {
        autoSaveInFlightRef.current = false;
      }
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [editedRows, syncEditedRows]);

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
            Update RCFE administrator contact details and number of beds, then push updates for grouped member records.
          </p>
        </div>
        <Button onClick={loadMembers} disabled={isLoadingMembers}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
          Sync from Caspio
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex-1 max-w-lg">
              <Input
                placeholder="Search RCFE, city, administrator, or member name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{visibleRows.length} RCFEs</Badge>
              <Badge variant="secondary">{editedRows.length} Edited</Badge>
              <Badge variant={isAutoSaving ? 'default' : 'outline'}>
                {isAutoSaving ? 'Autosaving...' : 'Autosave on'}
              </Badge>
              <Button onClick={pushAllEdited} disabled={isSavingAll || editedRows.length === 0}>
                {isSavingAll ? 'Syncing edited rows...' : `Push All Edited (${editedRows.length})`}
              </Button>
            </div>
          </div>

          <div className="w-full overflow-x-auto pb-2">
            <TooltipProvider delayDuration={120}>
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[320px]">
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => handleSort('RCFE_Name')}>
                        RCFE Home
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
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No RCFEs match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((row) => {
                      const draft = getDraft(row);
                      return (
                        <TableRow key={row.key}>
                          <TableCell className="max-w-[320px]">
                            <div className="font-medium">{row.RCFE_Name || '-'}</div>
                            <div className="text-xs text-muted-foreground break-words">
                              {[toAddressCase(row.RCFE_Street), [toAddressCase(row.RCFE_City), normalizeZipInput(row.RCFE_Zip)].filter(Boolean).join(', ')]
                                .filter(Boolean)
                                .join(', ') || '-'}
                            </div>
                            <div className="text-xs mt-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="font-medium text-left underline-offset-2 hover:underline">
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
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[110px]"
                              inputMode="numeric"
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
    </div>
  );
}
