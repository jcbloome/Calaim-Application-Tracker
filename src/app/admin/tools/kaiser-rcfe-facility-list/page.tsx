'use client';

import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Building2, ChevronDown, ChevronUp, Download, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type RawKaiserMember = {
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  CalAIM_MCO?: string;
  RCFE_Name?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Email?: string;
  RCFE_Address?: string;
  RCFE_City?: string;
  RCFE_State?: string;
  RCFE_Zip?: string;
  caspioRaw?: Record<string, unknown>;
};

type FacilityRow = {
  key: string;
  facilityName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  licenseNumber: string;
  npiFirst: string;
  npiLast: string;
  memberCount: number;
  members: string[];
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeDisplay = (value: unknown, fallback = '—') => {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
};
const pickFirstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const getMissingFields = (row: FacilityRow) => {
  const missing: string[] = [];
  if (!String(row.contactPerson || '').trim()) missing.push('Contact Person');
  if (!String(row.email || '').trim()) missing.push('Email');
  if (!String(row.phone || '').trim()) missing.push('Phone');
  if (!String(row.licenseNumber || '').trim()) missing.push('RCFE License Number');
  if (!String(row.address || '').trim()) missing.push('Address');
  if (!String(row.city || '').trim()) missing.push('City');
  if (!String(row.state || '').trim()) missing.push('State');
  if (!String(row.zip || '').trim()) missing.push('Zip');
  return missing;
};

const isKaiserPlan = (value: unknown) => normalize(value).includes('kaiser');

const toFacilityRowFromMember = (member: RawKaiserMember): FacilityRow | null => {
  const raw = (member.caspioRaw || {}) as Record<string, unknown>;
  const assignedRcfeName = pickFirstNonEmpty(member.RCFE_Name, raw.RCFE_Name);
  const facilityName = pickFirstNonEmpty(assignedRcfeName, raw.ISP_Current_Location, raw.Facility_Name);
  const licenseNumber = pickFirstNonEmpty(raw.RCFE_License_Number, raw.RCFE_License, raw.License_Number, raw.RCFE_Licence_Number);
  const contactPerson = pickFirstNonEmpty(member.RCFE_Admin_Name, raw.RCFE_Admin_Name, raw.RCFE_Administrator, raw.RCFE_Admin);
  const email = normalizeEmail(
    pickFirstNonEmpty(member.RCFE_Admin_Email, raw.RCFE_Admin_Email, raw.RCFE_Administrator_Email, raw.RCFE_AdminEmail)
  );
  const phone = pickFirstNonEmpty(
    raw.RCFE_Admin_RCFE_Owner_Phone,
    raw.RCFE_Owner_Phone,
    raw.RCFE_Admin_Phone,
    raw.RCFE_Administrator_Phone,
    raw.RCFE_Phone
  );
  const address = pickFirstNonEmpty(member.RCFE_Address, raw.RCFE_Address, raw.RCFE_Street, raw.RCFE_Street_Address);
  const city = pickFirstNonEmpty(member.RCFE_City, raw.RCFE_City);
  const state = pickFirstNonEmpty(member.RCFE_State, raw.RCFE_State);
  const zip = pickFirstNonEmpty(member.RCFE_Zip, raw.RCFE_Zip);
  const county = pickFirstNonEmpty(raw.RCFE_County, raw.RCFE_County_Name, raw.Facility_County, raw.Member_County);
  const npiFirst = pickFirstNonEmpty(raw.NPI_First, raw.NPI_First_Name);
  const npiLast = pickFirstNonEmpty(raw.NPI_Last, raw.NPI_Last_Name, raw.NPI_RCFE_Owner);

  // Only include facilities when RCFE is explicitly assigned on the member record.
  const hasRcfeAssigned = Boolean(assignedRcfeName);
  if (!hasRcfeAssigned) return null;

  const memberName = `${String(member.memberLastName || '').trim()}, ${String(member.memberFirstName || '').trim()}`
    .replace(/^,\s*/, '')
    .trim();
  const memberLabel = pickFirstNonEmpty(memberName, String(member.memberMrn || '').trim(), 'Unknown Member');

  const dedupeKey = [
    normalize(licenseNumber),
    normalize(facilityName),
    normalize(address),
    normalize(city),
    normalize(zip),
  ].join('|');

  return {
    key: dedupeKey || `${normalize(facilityName)}|${normalize(contactPerson)}|${normalize(email)}`,
    facilityName: facilityName || 'Unknown Facility',
    contactPerson,
    email,
    phone,
    address,
    city,
    state,
    zip,
    county,
    licenseNumber,
    npiFirst,
    npiLast,
    memberCount: 1,
    members: [memberLabel],
  };
};

export default function KaiserRcfeFacilityListPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [removedFacilityKeys, setRemovedFacilityKeys] = useState<string[]>([]);
  const [expandedMobileRows, setExpandedMobileRows] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'auto' | 'compact' | 'table'>('auto');
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const fetchFacilities = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/kaiser-members', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to load Kaiser members (HTTP ${response.status})`));
      }

      const members: RawKaiserMember[] = Array.isArray(payload?.members) ? payload.members : [];
      const aggregated = new Map<string, FacilityRow>();
      members
        .filter((member) => isKaiserPlan(member.CalAIM_MCO))
        .forEach((member) => {
          const row = toFacilityRowFromMember(member);
          if (!row) return;
          const existing = aggregated.get(row.key);
          if (!existing) {
            aggregated.set(row.key, row);
            return;
          }
          const mergedMembers = new Set([...existing.members, ...row.members]);
          aggregated.set(row.key, {
            ...existing,
            contactPerson: existing.contactPerson || row.contactPerson,
            email: existing.email || row.email,
            phone: existing.phone || row.phone,
            address: existing.address || row.address,
            city: existing.city || row.city,
            state: existing.state || row.state,
            zip: existing.zip || row.zip,
            county: existing.county || row.county,
            licenseNumber: existing.licenseNumber || row.licenseNumber,
            npiFirst: existing.npiFirst || row.npiFirst,
            npiLast: existing.npiLast || row.npiLast,
            memberCount: mergedMembers.size,
            members: Array.from(mergedMembers),
          });
        });

      const nextRows = Array.from(aggregated.values()).sort((a, b) =>
        a.facilityName.localeCompare(b.facilityName, undefined, { sensitivity: 'base' })
      );
      setFacilities(nextRows);
      setRemovedFacilityKeys([]);
      setExpandedMobileRows([]);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setFacilities([]);
      setError(String(err?.message || 'Could not load facility list.'));
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  const filteredRows = useMemo(() => {
    const q = normalize(searchTerm);
    if (!q) return facilities;
    return facilities.filter((row) =>
      [
        row.facilityName,
        row.contactPerson,
        row.email,
        row.phone,
        row.address,
        row.city,
        row.state,
        row.zip,
        row.county,
        row.licenseNumber,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [facilities, searchTerm]);

  const removedKeysSet = useMemo(() => new Set(removedFacilityKeys), [removedFacilityKeys]);

  const outputRows = useMemo(
    () => filteredRows.filter((row) => !removedKeysSet.has(row.key)),
    [filteredRows, removedKeysSet]
  );
  const rowsWithMissingData = useMemo(
    () => outputRows.filter((row) => getMissingFields(row).length > 0),
    [outputRows]
  );
  const displayRows = useMemo(
    () => (showMissingOnly ? rowsWithMissingData : outputRows),
    [showMissingOnly, rowsWithMissingData, outputRows]
  );

  const handleRemoveFacility = useCallback((key: string) => {
    setRemovedFacilityKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleRestoreAllRemoved = useCallback(() => {
    setRemovedFacilityKeys([]);
  }, []);

  const toggleExpandedMobileRow = useCallback((key: string) => {
    setExpandedMobileRows((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const handleExportExcel = useCallback(async () => {
    if (displayRows.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const xlsxMod: any = await import('xlsx');
      const XLSX = xlsxMod?.default ?? xlsxMod;
      const rowsForExcel = displayRows.map((row) => ({
        'Facility Name': row.facilityName,
        'Contact Person': row.contactPerson,
        Email: row.email,
        Phone: row.phone,
        'Address w County': [row.address, row.city, row.state, row.zip, row.county].filter(Boolean).join(', '),
        'NPI First': row.npiFirst,
        'NPI Last': row.npiLast,
        'License #': row.licenseNumber,
        'RCFE Admin Name': row.contactPerson,
        'RCFE Admin Email': row.email,
        'RCFE Admin / RCFE Owner Phone': row.phone,
        RCFE_Address: row.address,
        RCFE_City: row.city,
        RCFE_State: row.state,
        RCFE_Zip: row.zip,
        'Kaiser Members Assigned': row.memberCount,
        'Member Names': row.members.join('; '),
      }));
      const worksheet = XLSX.utils.json_to_sheet(rowsForExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Current Facilities');
      const stamp = format(new Date(), 'yyyy-MM-dd');
      XLSX.writeFile(workbook, `Kaiser_RCFE_Current_Facility_List_${stamp}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }, [displayRows, isExporting]);

  if (isAdminLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading permissions...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <p className="p-6 text-sm text-destructive">Admin access required.</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Kaiser RCFE Current Facility List</h1>
          <p className="text-sm text-muted-foreground">
            Current RCFE list from Kaiser members with assigned facilities, ready for ILS long-term contract outreach.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void fetchFacilities()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Data
          </Button>
          <Button onClick={() => void handleExportExcel()} disabled={displayRows.length === 0 || isExporting} variant="outline">
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                RCFE Facilities
              </CardTitle>
              <CardDescription>
                Includes RCFE license, admin contact, owner/admin phone, and address fields from `CalAIM_tbl_Members`.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              {lastRefreshedAt ? `Last refreshed ${format(lastRefreshedAt, 'MMM d, yyyy h:mm a')}` : 'No data loaded yet'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Facilities</div>
              <div className="text-2xl font-bold">{facilities.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Filtered Facilities</div>
              <div className="text-2xl font-bold">{displayRows.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Total Kaiser Members in List</div>
              <div className="text-2xl font-bold">
                {displayRows.reduce((sum, row) => sum + row.memberCount, 0)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMissingOnly((prev) => !prev)}
              className={`rounded-md border p-3 text-left transition ${
                showMissingOnly
                  ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-200'
                  : 'hover:border-amber-300 hover:bg-amber-50/50'
              }`}
            >
              <div className="text-sm text-muted-foreground">
                Facilities Missing Required Info {showMissingOnly ? '(Showing only missing)' : '(Click to filter)'}
              </div>
              <div className="text-2xl font-bold text-amber-700">{rowsWithMissingData.length}</div>
            </button>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              placeholder="Search by facility, contact, license, city, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="md:flex-1"
            />
            <div className="flex items-center gap-1 rounded-md border p-1">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'auto' ? 'default' : 'ghost'}
                onClick={() => setViewMode('auto')}
              >
                Auto
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'compact' ? 'default' : 'ghost'}
                onClick={() => setViewMode('compact')}
              >
                Compact
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                onClick={() => setViewMode('table')}
              >
                Table
              </Button>
            </div>
            {showMissingOnly ? (
              <Button type="button" variant="outline" onClick={() => setShowMissingOnly(false)} className="md:w-auto">
                Show All Records
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={handleRestoreAllRemoved}
              disabled={removedFacilityKeys.length === 0}
              className="md:w-auto"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore Removed ({removedFacilityKeys.length})
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {facilities.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              Click <span className="font-medium">Refresh Data</span> to load the current Kaiser RCFE facility list.
            </p>
          ) : null}

          <div className="rounded-md border">
            <div className={viewMode === 'table' ? 'hidden' : `px-3 py-2 text-xs text-muted-foreground ${viewMode === 'auto' ? 'xl:hidden' : ''}`}>
              Compact 2-line view is shown on smaller screens. Full multi-column table appears on larger desktop.
            </div>

            <div className={`${viewMode === 'table' ? 'hidden' : ''} ${viewMode === 'auto' ? 'xl:hidden' : ''} space-y-2 p-3`}>
              {isLoading ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading facilities...
                  </span>
                </div>
              ) : displayRows.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No matching facilities found.
                </div>
              ) : (
                displayRows.map((row) => (
                  <div key={row.key} className="rounded-md border px-3 py-2">
                    {getMissingFields(row).length > 0 ? (
                      <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        Missing: {getMissingFields(row).join(', ')}. Member refs: {row.members.slice(0, 3).join('; ')}
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{normalizeDisplay(row.facilityName)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Contact: {normalizeDisplay(row.contactPerson)} • Phone: {normalizeDisplay(row.phone)} • License: {normalizeDisplay(row.licenseNumber)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          Email: {normalizeDisplay(row.email)} • {normalizeDisplay(row.city)}, {normalizeDisplay(row.state)} {normalizeDisplay(row.zip)} • Members: {row.memberCount}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleExpandedMobileRow(row.key)}
                        >
                          {expandedMobileRows.includes(row.key) ? (
                            <ChevronUp className="mr-2 h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="mr-2 h-3.5 w-3.5" />
                          )}
                          Details
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveFacility(row.key)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                    {expandedMobileRows.includes(row.key) ? (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Address</span>
                        <span className="break-words">{normalizeDisplay(row.address)}</span>
                        <span className="text-muted-foreground">County</span>
                        <span>{normalizeDisplay(row.county)}</span>
                        <span className="text-muted-foreground">NPI First Name</span>
                        <span>{normalizeDisplay(row.npiFirst)}</span>
                        <span className="text-muted-foreground">NPI Last Name</span>
                        <span>{normalizeDisplay(row.npiLast)}</span>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className={`${viewMode === 'compact' ? 'hidden' : ''} ${viewMode === 'auto' ? 'hidden xl:block' : ''}`}>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Desktop tip: this table supports horizontal scrolling. Scroll left/right (Shift + mouse wheel also works) to view all columns.
              </div>
              <div className="overflow-x-auto">
                <div className="max-h-[72vh] overflow-y-auto min-w-full">
              <Table className="min-w-[1380px]">
                <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Facility Name</TableHead>
                    <TableHead className="whitespace-nowrap">Contact Person</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Phone</TableHead>
                    <TableHead className="whitespace-nowrap">RCFE License Number</TableHead>
                    <TableHead className="whitespace-nowrap">Address</TableHead>
                    <TableHead className="whitespace-nowrap">City</TableHead>
                    <TableHead className="whitespace-nowrap">State</TableHead>
                    <TableHead className="whitespace-nowrap">Zip</TableHead>
                    <TableHead className="whitespace-nowrap">County</TableHead>
                    <TableHead className="whitespace-nowrap">NPI First Name</TableHead>
                    <TableHead className="whitespace-nowrap">NPI Last Name</TableHead>
                    <TableHead className="whitespace-nowrap">Missing Fields</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={15} className="py-6 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading facilities...
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="py-6 text-center text-sm text-muted-foreground">
                        No matching facilities found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((row) => {
                      const missingFields = getMissingFields(row);
                      const hasMissing = missingFields.length > 0;
                      return (
                      <TableRow key={row.key} className={hasMissing ? 'bg-amber-50/50' : ''}>
                        <TableCell className="min-w-[220px]">{normalizeDisplay(row.facilityName)}</TableCell>
                        <TableCell className="min-w-[160px]">{normalizeDisplay(row.contactPerson)}</TableCell>
                        <TableCell className="min-w-[220px] break-words">{normalizeDisplay(row.email)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.phone)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.licenseNumber)}</TableCell>
                        <TableCell className="min-w-[260px]">{normalizeDisplay(row.address)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.city)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.state)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.zip)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.county)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.npiFirst)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.npiLast)}</TableCell>
                        <TableCell className="min-w-[260px]">
                          {hasMissing ? (
                            <span className="text-xs text-amber-800">
                              {missingFields.join(', ')}. Member refs: {row.members.slice(0, 3).join('; ')}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-700">Complete</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{row.memberCount}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveFacility(row.key)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
                </div>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Export includes only the visible list after your manual removals.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

