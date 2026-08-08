'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Database, Map as MapIcon, RefreshCw, Save } from 'lucide-react';

type MappingRow = {
  alftField: string;
  label: string;
  selectable: boolean;
  staticSource?: string;
  defaultPrimary?: string;
};

const PAGE_1_2_MAPPINGS: MappingRow[] = [
  { alftField: 'p1_agency', label: 'Agency', selectable: false, staticSource: 'Static: Connections Care Home Consultants' },
  {
    alftField: 'p1_plan_id',
    label: 'Plan ID',
    selectable: true,
    defaultPrimary: 'MCP_CIN',
  },
  {
    alftField: 'p1_member_name',
    label: 'Member Name',
    selectable: true,
    defaultPrimary: 'Senior_Last_First_ID',
  },
  {
    alftField: 'p1_assessor_name',
    label: 'Assessor Name',
    selectable: true,
    defaultPrimary: 'Social_Worker_Assigned',
  },
  { alftField: 'p1_first_name', label: 'First Name', selectable: true, defaultPrimary: 'Senior_First' },
  { alftField: 'p1_last_name', label: 'Last Name', selectable: true, defaultPrimary: 'Senior_Last' },
  {
    alftField: 'p1_mrn',
    label: 'MRN Number',
    selectable: true,
    defaultPrimary: 'MCP_CIN',
  },
  {
    alftField: 'p1_phone',
    label: 'Phone Number',
    selectable: true,
    defaultPrimary: 'ISP_Contact_Phone',
  },
  { alftField: 'p1_dob', label: 'Date of Birth', selectable: true, defaultPrimary: 'Birth_Date' },
  {
    alftField: 'p1_sex',
    label: 'Sex',
    selectable: true,
    defaultPrimary: 'Sex',
  },
  {
    alftField: 'p1_primary_language',
    label: 'Primary Language',
    selectable: true,
    defaultPrimary: 'Primary_Language',
  },
  {
    alftField: 'p2_facility_name',
    label: 'Facility Name',
    selectable: true,
    defaultPrimary: 'ISP_Current_Location',
  },
  {
    alftField: 'p2_current_street',
    label: 'Current Location Street',
    selectable: true,
    defaultPrimary: 'ISP_Current_Address',
  },
  {
    alftField: 'p2_current_city',
    label: 'Current Location City',
    selectable: true,
    defaultPrimary: 'ISP_Current_City',
  },
  {
    alftField: 'p2_current_state',
    label: 'Current Location State',
    selectable: true,
    defaultPrimary: 'ISP_Current_State',
  },
  {
    alftField: 'p2_current_zip',
    label: 'Current Location Zip',
    selectable: true,
    defaultPrimary: 'ISP_Current_Zip',
  },
  {
    alftField: 'p2_current_type',
    label: 'Current Location Type',
    selectable: true,
    defaultPrimary: 'Where_Living',
  },
  {
    alftField: 'p2_assessment_site',
    label: 'Assessment Site',
    selectable: true,
    defaultPrimary: 'Assessment',
  },
  {
    alftField: 'p2_home_street',
    label: 'Home Address Street',
    selectable: true,
    defaultPrimary: 'Normal_Housing_Street',
  },
  {
    alftField: 'p2_home_city',
    label: 'Home Address City',
    selectable: true,
    defaultPrimary: 'Normal_Housing_City',
  },
  {
    alftField: 'p2_home_state',
    label: 'Home Address State',
    selectable: true,
    defaultPrimary: 'Normal_Housing_State',
  },
  {
    alftField: 'p2_home_zip',
    label: 'Home Address Zip',
    selectable: true,
    defaultPrimary: 'Normal_Housing_Zip',
  },
];

type RowState = { primary: string };
const OPTIONAL_PREFILL_FIELDS = new Set<string>(['p2_facility_name']);

const LOCAL_KEY = 'alftPage12CaspioMappingLocal_v1';
const COMMON_CASPIO_ALIASES = [
  'Client_ID2',
  'Senior_Last_First_ID',
  'Senior_First',
  'Senior_Last',
  'MCP_CIN',
  'MediCal_Number',
  'Member_MRN',
  'Member_Phone',
  'Birth_Date',
  'Sex',
  'Gender',
  'Member_Gender',
  'Senior_Gender',
  'Primary_Language',
  'Member_Language',
  'Language',
  'ISP_Current_Location',
  'ISP_Current_Address',
  'ISP_Current_City',
  'ISP_Current_State',
  'ISP_Current_Zip',
  'ISP_Contact_Phone',
  'Social_Worker_Assigned',
  'SW_ID',
  'RCFE_Name',
  'Facility_Name',
  'Where_Living',
  'Assessment',
  'Normal_Housing_Street',
  'Normal_Housing_City',
  'Normal_Housing_State',
  'Normal_Housing_Zip',
  'City',
  'State',
  'Zip',
];
const ALFT_CURRENT_LOCATION_TYPE_VALUES = [
  'private_residence',
  'alf',
  'nursing_facility',
  'hospital',
  'adult_day_care',
  'other',
];
const ALFT_ASSESSMENT_SITE_VALUES = [
  'home',
  'nursing_facility',
  'hospital',
  'alf',
  'adult_day_care',
  'other',
];

const HOME_ADDRESS_OVERRIDES: Record<string, string> = {
  p2_home_street: 'Normal_Housing_Street',
  p2_home_city: 'Normal_Housing_City',
  p2_home_state: 'Normal_Housing_State',
  p2_home_zip: 'Normal_Housing_Zip',
};

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeSwNameForUi = (name: string) =>
  (() => {
    let value = String(name || '').trim().replace(/\s+\d+$/, '').trim();
    if (!value) return '';
    if (value.includes(',')) {
      const [last, first] = value.split(',', 2).map((part) => part.trim());
      value = `${first || ''} ${last || ''}`.trim();
    }
    return value
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
      .join(' ')
      .trim();
  })();

const getCaseInsensitive = (source: Record<string, unknown>, key: string): unknown => {
  const direct = source[key];
  if (direct !== undefined && direct !== null && clean(direct) !== '') return direct;
  const wanted = clean(key).toLowerCase();
  if (!wanted) return undefined;
  for (const [k, value] of Object.entries(source || {})) {
    if (clean(k).toLowerCase() === wanted) return value;
  }
  return undefined;
};

const resolveAliasToken = (rawValue: unknown, source: Record<string, unknown>): string => {
  let value = clean(rawValue);
  const visited = new Set<string>();
  while (/^\[@field:[^\]]+\]$/i.test(value)) {
    const token = value.toLowerCase();
    if (visited.has(token)) break;
    visited.add(token);
    const field = value.replace(/^\[@field:/i, '').replace(/\]$/, '').trim();
    const next = getCaseInsensitive(source, field);
    if (next === undefined || next === null) return '';
    value = clean(next);
  }
  return value;
};

function toDefaultState(): Record<string, RowState> {
  const out: Record<string, RowState> = {};
  PAGE_1_2_MAPPINGS.forEach((row) => {
    if (!row.selectable) return;
    out[row.alftField] = {
      primary: row.defaultPrimary || '',
    };
  });
  return out;
}

export default function AdminAlftCaspioMappingPage() {
  const searchParams = useSearchParams();
  const initialUrlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const requestedMemberId = clean(searchParams?.get('memberId') || initialUrlParams?.get('memberId'));
  const openedFrom = clean(searchParams?.get('from') || initialUrlParams?.get('from'));
  const readOnlyValidationMode = openedFrom === 'alft-intake' || Boolean(requestedMemberId);
  const rows = useMemo(() => PAGE_1_2_MAPPINGS, []);
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>(toDefaultState);
  const [loadingFields, setLoadingFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaSource, setSchemaSource] = useState<'cache' | 'live' | 'unknown'>('unknown');
  const [liveMembers, setLiveMembers] = useState<Record<string, unknown>[]>([]);
  const [loadingLiveMembers, setLoadingLiveMembers] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedMemberSource, setSelectedMemberSource] = useState<Record<string, unknown> | null>(null);
  const [selectedMemberResolved, setSelectedMemberResolved] = useState<Record<string, string>>({});
  const [loadingSelectedSource, setLoadingSelectedSource] = useState(false);
  const [selectedMemberReloadNonce, setSelectedMemberReloadNonce] = useState(0);
  const [hasManualPull, setHasManualPull] = useState(false);
  const backToMemberHref = useMemo(() => {
    const member = encodeURIComponent(selectedMemberId || requestedMemberId || '');
    return member ? `/admin/alft-tracker?member=${member}&focus=${member}` : '/admin/alft-tracker';
  }, [requestedMemberId, selectedMemberId]);

  const sortedAvailableFields = useMemo(() => {
    const merged = new Set<string>([
      ...availableFields,
      ...COMMON_CASPIO_ALIASES,
      ...Object.values(rowState).map((v) => v?.primary || '').filter(Boolean),
    ]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [availableFields, rowState]);

  const getMemberId = useCallback((member: Record<string, unknown>) => {
    return clean(member?.Client_ID2 || member?.client_ID2 || member?.id);
  }, []);

  const selectedMember = useMemo(
    () => liveMembers.find((m) => getMemberId(m) === selectedMemberId) || null,
    [getMemberId, liveMembers, selectedMemberId]
  );

  const previewSource = useMemo(() => {
    const member = (selectedMember || {}) as Record<string, unknown>;
    const memberRaw =
      member && typeof member.caspioRaw === 'object' && member.caspioRaw
        ? (member.caspioRaw as Record<string, unknown>)
        : {};
    return { ...member, ...memberRaw, ...(selectedMemberSource || {}) } as Record<string, unknown>;
  }, [selectedMember, selectedMemberSource]);

  const resolveMappedValue = useCallback(
    (alftField: string) => {
      const fromResolved = clean(selectedMemberResolved?.[alftField]);
      if (fromResolved) return fromResolved;
      const sourceField = clean(HOME_ADDRESS_OVERRIDES[alftField] || rowState?.[alftField]?.primary);
      if (!sourceField) return '';
      const raw = getCaseInsensitive(previewSource, sourceField);
      return resolveAliasToken(raw, previewSource);
    },
    [previewSource, rowState, selectedMemberResolved]
  );

  const loadAvailableFields = useCallback(async (refresh: boolean) => {
    setLoadingFields(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken().catch(() => undefined);
      const res = await fetch(
        refresh ? '/api/caspio-table-fields' : '/api/caspio-table-fields?tableName=CalAIM_tbl_Members',
        {
          method: refresh ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: refresh ? JSON.stringify({ tableName: 'CalAIM_tbl_Members' }) : undefined,
        }
      );
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !Array.isArray(data?.fields)) {
        throw new Error(String(data?.error || `HTTP ${res.status}`));
      }
      setAvailableFields(data.fields);
      setSchemaSource(refresh ? 'live' : (data?.cached ? 'cache' : 'unknown'));
    } catch (e: any) {
      toast({
        title: 'Could not load Caspio fields',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingFields(false);
    }
  }, [auth?.currentUser, toast]);

  const loadLiveMembers = useCallback(async () => {
    setLoadingLiveMembers(true);
    try {
      const res = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !Array.isArray(data?.members)) {
        throw new Error(String(data?.error || `HTTP ${res.status}`));
      }
      const nextMembers = (data.members as Record<string, unknown>[]).slice();
      setLiveMembers(nextMembers);
      const hasUrlMember = Boolean(requestedMemberId) && nextMembers.some((m) => getMemberId(m) === requestedMemberId);
      setSelectedMemberId((prev) => {
        if (hasUrlMember) return requestedMemberId;
        if (!prev && nextMembers.length > 0) return getMemberId(nextMembers[0]);
        if (prev && !nextMembers.some((m) => getMemberId(m) === prev)) return nextMembers.length > 0 ? getMemberId(nextMembers[0]) : '';
        return prev;
      });
    } catch (e: any) {
      toast({
        title: 'Could not load live members',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingLiveMembers(false);
    }
  }, [getMemberId, requestedMemberId, toast]);

  useEffect(() => {
    void loadAvailableFields(false);
  }, [loadAvailableFields]);

  useEffect(() => {
    if (readOnlyValidationMode && requestedMemberId) {
      setSelectedMemberId(requestedMemberId);
    }
  }, [readOnlyValidationMode, requestedMemberId]);

  useEffect(() => {
    if (!firestore) return;
    void (async () => {
      try {
        const snap = await getDoc(doc(firestore, 'admin-settings', 'alft-caspio-field-mapping'));
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.rows && typeof data.rows === 'object') {
            setRowState((prev) => ({ ...prev, ...data.rows }));
            return;
          }
        }
      } catch {
        // fall through to local cache
      }

      try {
        const saved = localStorage.getItem(LOCAL_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            setRowState((prev) => ({ ...prev, ...parsed }));
          }
        }
      } catch {
        // ignore local cache parse issues
      }
    })();
  }, [firestore]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(rowState));
    } catch {
      // ignore local cache write issues
    }
  }, [rowState]);

  useEffect(() => {
    // Prevent stale readiness/errors from briefly showing when switching members/routes.
    setHasManualPull(false);
    setSelectedMemberResolved({});
    setSelectedMemberSource(null);
  }, [requestedMemberId, openedFrom]);

  useEffect(() => {
    if (!selectedMemberId) {
      setSelectedMemberSource(null);
      setSelectedMemberResolved({});
      return;
    }
    if (readOnlyValidationMode && !hasManualPull) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingSelectedSource(true);
      try {
        const idToken = await auth?.currentUser?.getIdToken();
        if (!idToken) throw new Error('Sign in required.');
        const res = await fetch('/api/alft/prefill/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, memberId: selectedMemberId }),
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.ok || !data?.source || typeof data.source !== 'object') {
          throw new Error(String(data?.error || `HTTP ${res.status}`));
        }
        if (!cancelled) {
          setSelectedMemberSource(data.source as Record<string, unknown>);
          setSelectedMemberResolved(
            data?.resolved && typeof data.resolved === 'object'
              ? (data.resolved as Record<string, string>)
              : {}
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setSelectedMemberSource(null);
          setSelectedMemberResolved({});
          toast({
            title: 'Could not pull selected member from live Caspio',
            description: e?.message || 'Retry live pull for this member.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingSelectedSource(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth?.currentUser, hasManualPull, readOnlyValidationMode, selectedMemberId, selectedMemberReloadNonce, toast]);

  const setPrimary = (alftField: string, value: string) => {
    setRowState((prev) => {
      const current = prev[alftField] || { primary: '' };
      return {
        ...prev,
        [alftField]: { ...current, primary: value },
      };
    });
  };

  const resetDefaults = () => {
    setRowState(toDefaultState());
    toast({ title: 'Defaults restored', description: 'ALFT mapping has been reset to default values.' });
  };

  const saveMapping = useCallback(async () => {
    if (!firestore) {
      toast({ title: 'Firestore unavailable', description: 'Could not save mapping.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(firestore, 'admin-settings', 'alft-caspio-field-mapping'),
        {
          tableName: 'CalAIM_tbl_Members',
          rows: rowState,
          updatedAt: serverTimestamp(),
          updatedBy: String(auth?.currentUser?.email || '').toLowerCase(),
        },
        { merge: true }
      );
      toast({ title: 'Mapping saved', description: 'ALFT Caspio field mapping has been updated.' });
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e?.message || 'Could not save mapping.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [auth?.currentUser?.email, firestore, rowState, toast]);

  const memberOptions = useMemo(() => {
    const dedupedById = new Map<string, { id: string; label: string }>();
    liveMembers
      .map((m) => {
        const id = getMemberId(m);
        const name =
          clean(m?.Senior_Last_First_ID) ||
          clean(m?.memberName) ||
          `${clean(m?.Senior_Last)} ${clean(m?.Senior_First)}`.trim() ||
          'Unknown member';
        const mrn = clean(m?.MCP_CIN) || clean(m?.MediCal_Number) || clean(m?.Member_MRN);
        return { id, label: `${name}${mrn ? ` (${mrn})` : ''}` };
      })
      .filter((m) => Boolean(m.id))
      .forEach((m) => {
        if (!dedupedById.has(m.id)) dedupedById.set(m.id, m);
      });
    return Array.from(dedupedById.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [getMemberId, liveMembers]);

  const requiredFieldStatuses = useMemo(() => {
    return rows
      .filter((row) => row.selectable && !OPTIONAL_PREFILL_FIELDS.has(row.alftField))
      .map((row) => {
        const sourceField = clean(HOME_ADDRESS_OVERRIDES[row.alftField] || rowState[row.alftField]?.primary);
        const raw = sourceField ? getCaseInsensitive(previewSource, sourceField) : '';
        const resolved = clean(resolveMappedValue(row.alftField));
        return {
          alftField: row.alftField,
          label: row.label,
          sourceField,
          raw: clean(raw),
          resolved,
          ok: Boolean(resolved),
        };
      });
  }, [previewSource, resolveMappedValue, rowState, rows]);

  const missingRequiredFields = useMemo(
    () => requiredFieldStatuses.filter((item) => !item.ok),
    [requiredFieldStatuses]
  );

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="h-5 w-5" />
            {readOnlyValidationMode ? 'ALFT Prefill Readiness (Read-only)' : 'ALFT Page 1-2 Caspio Mapping'}
          </CardTitle>
          <CardDescription>
            {readOnlyValidationMode
              ? 'Read-only live prefill check for the selected member before sending SW notice.'
              : 'Match ALFT fields to live Caspio fields and validate values per selected member before sending workflow notice.'}
          </CardDescription>
          {readOnlyValidationMode ? (
            <div>
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link href={backToMemberHref}>Back to member</Link>
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4" />
              Source chain: Live Caspio member record → ALFT mapping → Assignment prefill.
            </div>
            <div className="flex flex-wrap gap-2">
              {!readOnlyValidationMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => void loadAvailableFields(false)} disabled={loadingFields}>
                    {loadingFields ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    Load Cached Fields
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadAvailableFields(true)} disabled={loadingFields}>
                    {loadingFields ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    Refresh from Caspio
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void loadLiveMembers()} disabled={loadingLiveMembers}>
                    {loadingLiveMembers ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    Refresh Members (Live)
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHasManualPull(true);
                    setSelectedMemberReloadNonce((n) => n + 1);
                  }}
                  disabled={!requestedMemberId || loadingSelectedSource}
                >
                  {loadingSelectedSource ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Refresh Selected Member (Live)
                </Button>
              )}
              {!readOnlyValidationMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={resetDefaults}>
                    Reset Defaults
                  </Button>
                  <Button size="sm" onClick={() => void saveMapping()} disabled={saving}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {saving ? 'Saving...' : 'Save Mapping'}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {!readOnlyValidationMode ? <Badge variant="secondary">Available fields: {sortedAvailableFields.length}</Badge> : null}
            {!readOnlyValidationMode ? <Badge variant="secondary">Schema source: {schemaSource}</Badge> : null}
            {!readOnlyValidationMode ? <Badge variant="secondary">Live members: {memberOptions.length}</Badge> : null}
            {openedFrom === 'alft-intake' ? <Badge variant="secondary">Opened from ALFT intake queue</Badge> : null}
            {readOnlyValidationMode ? <Badge variant="secondary">Read-only validation mode</Badge> : null}
          </div>
          {readOnlyValidationMode ? (
            <div className="mb-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Mapping is already configured. This view shows live prefill for this member only. All required prefill fields must be present before sending SW notice.
            </div>
          ) : null}
          <div className="mb-4 grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs font-semibold">Selected member (live Caspio)</div>
              {readOnlyValidationMode ? (
                <div className="rounded border bg-background px-2 py-1.5 text-xs font-mono">
                  {selectedMemberId || requestedMemberId || '—'}
                </div>
              ) : (
                <select
                  className="h-8 w-full rounded border bg-background px-2 text-xs"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                >
                  <option value="">Select member...</option>
                  {memberOptions.map((member) => (
                    <option key={`member-option-${member.id}`} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
              )}
              {loadingSelectedSource ? (
                <div className="text-xs text-muted-foreground">Loading selected member source record...</div>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              <div>
                Member ID: <span className="font-mono">{selectedMemberId || '—'}</span>
              </div>
              <div>
                Assigned SW:{' '}
                {normalizeSwNameForUi(
                  clean((previewSource as any)?.Social_Worker_Assigned || (previewSource as any)?.assignedSwName)
                ) || '—'}
              </div>
              <div>SW ID: {clean((previewSource as any)?.SW_ID || (previewSource as any)?.assignedSwId) || '—'}</div>
              <div>Plan/MRN: {clean((previewSource as any)?.MCP_CIN || (previewSource as any)?.MediCal_Number || (previewSource as any)?.Member_MRN) || '—'}</div>
            </div>
          </div>
          {!readOnlyValidationMode ? (
            <div className="mb-4 rounded-md border bg-muted/30 p-3 text-xs">
              <div className="font-semibold mb-1">Value alignment note for select fields</div>
              <div className="text-muted-foreground">
                For `p2_current_type` and `p2_assessment_site`, Caspio values should map to ALFT option values below.
              </div>
              <div className="mt-2">
                <span className="font-medium">Current Location Type:</span>{' '}
                {ALFT_CURRENT_LOCATION_TYPE_VALUES.map((value) => (
                  <Badge key={`loc-type-${value}`} variant="outline" className="mr-1 mb-1">
                    {value}
                  </Badge>
                ))}
              </div>
              <div className="mt-1">
                <span className="font-medium">Assessment Site:</span>{' '}
                {ALFT_ASSESSMENT_SITE_VALUES.map((value) => (
                  <Badge key={`assessment-site-${value}`} variant="outline" className="mr-1 mb-1">
                    {value}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {!readOnlyValidationMode || hasManualPull ? (
            <div className="mb-4 rounded-md border bg-muted/20 p-3 text-xs">
              <div className="font-semibold">Required prefill readiness</div>
              {missingRequiredFields.length === 0 ? (
                <div className="mt-1 text-green-700">All required mapped Caspio fields for ALFT prefill are present.</div>
              ) : (
                <div className="mt-1">
                  <div className="text-amber-700">
                    Required: Missing {missingRequiredFields.length} field(s). Assigned staff must update these in Caspio before SW notice is sent:
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {missingRequiredFields.map((item) => (
                      <Badge key={`missing-${item.alftField}`} variant="outline">
                        {item.label} ({item.sourceField || 'no source set'})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              Click <span className="font-medium">Refresh Selected Member (Live)</span> to pull current Caspio values and run readiness checks.
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ALFT Field</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Primary Source</TableHead>
                {!readOnlyValidationMode ? <TableHead>Caspio Status</TableHead> : null}
                {!readOnlyValidationMode ? <TableHead>Selected Member Source Value</TableHead> : null}
                <TableHead>ALFT Prefill Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.alftField}>
                  <TableCell className="font-mono text-xs">{row.alftField}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>
                    {row.selectable ? (
                      <div className="space-y-1">
                        {readOnlyValidationMode ? (
                          <div className="font-mono text-xs">
                            {clean(HOME_ADDRESS_OVERRIDES[row.alftField] || rowState[row.alftField]?.primary) || '—'}
                          </div>
                        ) : (
                          <select
                            className="h-8 min-w-[220px] rounded border bg-background px-2 text-xs"
                            value={rowState[row.alftField]?.primary || ''}
                            onChange={(e) => setPrimary(row.alftField, e.target.value)}
                            disabled={readOnlyValidationMode}
                          >
                            <option value="">Select primary field...</option>
                            {sortedAvailableFields.map((field) => (
                              <option key={`${row.alftField}-primary-${field}`} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{row.staticSource || '-'}</span>
                    )}
                  </TableCell>
                  {!readOnlyValidationMode ? (
                    <TableCell className="text-xs">
                      {row.selectable ? (
                        (() => {
                          const resolved = clean(resolveMappedValue(row.alftField));
                          return (
                            <Badge variant={resolved ? 'secondary' : 'outline'}>{resolved ? 'Filled' : 'Missing'}</Badge>
                          );
                        })()
                      ) : (
                        <Badge variant="secondary">Static</Badge>
                      )}
                    </TableCell>
                  ) : null}
                  {!readOnlyValidationMode ? (
                    <TableCell className="text-xs">
                      {row.selectable ? (
                        <>
                          {(() => {
                            const sourceField = clean(HOME_ADDRESS_OVERRIDES[row.alftField] || rowState[row.alftField]?.primary);
                            const raw = sourceField ? getCaseInsensitive(previewSource, sourceField) : '';
                            return (
                              <div>
                                <div className="font-mono text-[11px] text-muted-foreground">{sourceField || '—'}</div>
                                <div>{clean(raw) || '—'}</div>
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <span>{row.staticSource || '—'}</span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-xs">
                    {row.selectable ? clean(resolveMappedValue(row.alftField)) || '—' : 'Connections Care Home Consultants'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
