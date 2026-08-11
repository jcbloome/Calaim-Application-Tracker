'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Search, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';

type KaiserMember = {
  id?: string;
  Client_ID2?: string;
  client_ID2?: string;
  memberName?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberPhone?: string;
  memberEmail?: string;
  memberCounty?: string;
  Birth_Date?: string;
  birthDate?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
  caspioRaw?: Record<string, unknown>;
  [key: string]: unknown;
};

const clean = (value: unknown) => String(value || '').trim();

const normalizeMemberName = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.includes(',')) {
    const [last, first] = raw.split(',', 2);
    return `${clean(first)} ${clean(last)}`.trim();
  }
  return raw.replace(/\s+/g, ' ').trim();
};

const toTitleCaseName = (value: string) =>
  value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_m, prefix: string, chr: string) => `${prefix}${chr.toUpperCase()}`);

const normalizePersonName = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.includes('@')) return raw.toLowerCase();

  const commaParts = raw
    .split(',')
    .map((part) => clean(part))
    .filter(Boolean);
  const reordered =
    commaParts.length >= 2
      ? `${commaParts.slice(1).join(' ')} ${commaParts[0]}`.trim()
      : raw;

  const tokens = reordered
    .replace(/[:;|/\\]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-zA-Z]+|[^a-zA-Z'-]+$/g, ''))
    .filter(Boolean)
    .filter((token) => /[a-zA-Z]/.test(token) && !/\d/.test(token));

  return toTitleCaseName(tokens.join(' ').replace(/\s+/g, ' ').trim());
};

const ensureMswTitle = (value: string) => {
  const normalized = clean(value);
  if (!normalized) return '';
  if (/\bmsw\b/i.test(normalized)) {
    return normalized.replace(/\bmsw\b/gi, 'MSW');
  }
  return `${normalized}, MSW`;
};

const toName = (member: KaiserMember) => {
  const firstLast = `${clean(member.memberFirstName)} ${clean(member.memberLastName)}`.trim();
  const preferred = firstLast || normalizeMemberName(member.memberName);
  return preferred || `Client ${clean(member.Client_ID2 || member.client_ID2)}`;
};

const getValue = (member: KaiserMember, keys: string[]) => {
  for (const key of keys) {
    const top = clean(member[key]);
    if (top) return top;
    const raw = clean(member.caspioRaw?.[key]);
    if (raw) return raw;
  }
  return '';
};

const composeAddress = (...parts: Array<unknown>) =>
  parts
    .map((part) => clean(part))
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ', ')
    .trim();

const getRcfeFullAddress = (member: KaiserMember) => {
  const rcfeStreet = getValue(member, ['RCFE_Address']);
  const rcfeCity = getValue(member, ['RCFE_City']);
  const rcfeState = getValue(member, ['RCFE_State']);
  const rcfeZip = getValue(member, ['RCFE_Zip']);
  const rcfeCombined = composeAddress(rcfeStreet, rcfeCity, rcfeState, rcfeZip);
  if (rcfeCombined) return rcfeCombined;
  return getValue(member, ['Facility_Address', 'ISP_Current_Address']);
};

const toYesNo = (value: unknown): string => {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (['yes', 'y', '1', 'true', 'checked'].includes(raw)) return 'Yes';
  if (['no', 'n', '0', 'false', 'unchecked'].includes(raw)) return 'No';
  return clean(value);
};

const normalizeAlwSubmitted = (value: unknown): string => {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'yes' || raw === 'y' || raw === '1' || raw === 'true') return 'Yes';
  if (raw.includes('no') && raw.includes('assist')) {
    return 'No, ILS/external providers to assist Member with completing ALW Application';
  }
  if (raw === 'no' || raw === 'n' || raw === '0' || raw === 'false') {
    return 'No, ILS/external providers to assist Member with completing ALW Application';
  }
  return clean(value);
};

const normalizeTierLabel = (value: unknown): string => {
  const raw = clean(value);
  if (!raw) return '';
  const match = raw.match(/(\d+)/);
  if (!match) return raw;
  return `Tier ${match[1]}`;
};

const normalizeCountyName = (value: unknown): string =>
  clean(value).toLowerCase().replace(/ county$/i, '').replace(/[^a-z]/g, '');

const resolveKaiserRegion = (countyValue: unknown): string => {
  const normalized = normalizeCountyName(countyValue);
  if (!normalized) return '';
  const kaiserNorthCounties = new Set([
    'alameda', 'contracosta', 'marin', 'napa', 'sanfrancisco', 'sanmateo', 'santaclara', 'solano', 'sonoma',
    'sacramento', 'yolo', 'placer', 'eldorado', 'sutter', 'yuba', 'amador', 'nevada',
    'sanjoaquin', 'stanislaus', 'merced', 'madera', 'fresno', 'kings',
    'butte', 'shasta', 'tehama', 'glenn', 'colusa', 'humboldt', 'delnorte', 'siskiyou', 'trinity',
    'mendocino', 'lake', 'lassen', 'modoc', 'plumas',
  ]);
  return kaiserNorthCounties.has(normalized) ? 'Kaiser North' : 'Kaiser South';
};

type RequiredFieldStatus = { label: string; value: string };
type OptionalFieldStatus = { label: string; value: string };
type RecentCoverLog = {
  id: string;
  downloadName?: string;
  memberName?: string;
  memberClientId?: string;
  staffName?: string;
  createdAt?: string;
};

const getIspRnValue = (member: KaiserMember) =>
  normalizePersonName(
    getValue(member, ['ISP_RN', 'RN_Assigned'])
  );

const getIspSocialWorkerValue = (member: KaiserMember) =>
  ensureMswTitle(
    normalizePersonName(
      getValue(member, ['ISP_Social_Worker', 'Social_Worker_Assigned'])
    )
  );

const getRequiredFieldStatuses = (member: KaiserMember): RequiredFieldStatus[] => [
  {
    label: 'Kaiser Region',
    value:
      getValue(member, ['Kaiser_North_or_South']) ||
      resolveKaiserRegion(clean(member.memberCounty) || getValue(member, ['Member_County', 'memberCounty'])),
  },
  { label: 'Member Name', value: toName(member) },
  { label: 'MRN / CIN', value: clean(member.memberMrn) },
  { label: 'Date of Birth', value: clean(member.birthDate || member.Birth_Date) },
  { label: 'Cell Phone Number', value: clean(member.memberPhone) },
  { label: 'County', value: clean(member.memberCounty) || getValue(member, ['Member_County', 'memberCounty']) },
  { label: 'ISP Assessment Date', value: getValue(member, ['ISP_Assessment_Date']) },
  { label: 'ISP Social Worker', value: getIspSocialWorkerValue(member) },
  { label: 'ISP RN', value: getIspRnValue(member) },
  {
    label: 'Current Living Situation',
    value:
      getValue(member, [
        'Where_Living',
        'Describe_Member_Living_Situation',
        'Member_Current_Living_Situation',
        'Current_Living_Situation',
        'ISP_Current_Location',
        'RCFE_Name',
      ]),
  },
  { label: 'Facility Name (RCFE)', value: getValue(member, ['RCFE_Name', 'Facility_Name', 'ISP_Current_Location']) },
  { label: 'Facility Address (RCFE)', value: getRcfeFullAddress(member) },
  { label: 'Did Submit ALW Application', value: normalizeAlwSubmitted(getValue(member, ['Did_Submit_ALW_Application'])) },
];

const getOptionalFieldStatuses = (member: KaiserMember): OptionalFieldStatus[] => [
  { label: 'At ALW Facility', value: getValue(member, ['At_ALW_Facility']) },
  { label: 'On ALW Waitlist', value: getValue(member, ['On_ALW_Waitlist']) },
  { label: 'Room and Board Amount', value: getValue(member, ['Room_and_Board_Amount']) },
  { label: 'Requested Tier Level', value: getValue(member, ['Requested_Tier_Level']) },
  { label: 'In ALW County', value: getValue(member, ['In_ALW_County']) },
  { label: 'Date Member Moved Into Facility', value: getValue(member, ['Verified_Move_In_Date', 'Move_In_Date', 'Date_Member_Moved_Into_Facility']) },
];

const buildIspCoverSheetParams = (member: KaiserMember) => {
  const query = new URLSearchParams();
  const today = format(new Date(), 'yyyy-MM-dd');
  const clientId2 = clean(member.Client_ID2 || member.client_ID2);
  const memberCounty = clean(member.memberCounty) || getValue(member, ['Member_County', 'memberCounty']);
  const kaiserRegion =
    getValue(member, ['Kaiser_North_or_South']) || resolveKaiserRegion(memberCounty) || 'Kaiser South';

  query.set('returnTo', '/admin/tools/kaiser-isp-cover-sheet');
  query.set('memberClientId', clientId2);
  query.set('memberName', toName(member));
  query.set('memberFirstName', clean(member.memberFirstName));
  query.set('memberLastName', clean(member.memberLastName));
  query.set('memberMrn', clean(member.memberMrn));
  query.set('memberDob', clean(member.birthDate || member.Birth_Date));
  const memberPhone =
    getValue(member, [
      'Best_Contact_Phone',
      'Member_Phone',
      'Primary_Phone_Number',
      'Home_Phone_Number',
      'Primary_Phone',
      'Home_Phone',
    ]) || clean(member.memberPhone);
  query.set('memberPhone', memberPhone);
  query.set('memberEmail', clean(member.memberEmail));
  query.set('memberCounty', memberCounty);
  query.set('Kaiser_North_or_South', kaiserRegion);
  query.set('Date_Prepared', today);
  query.set('Facility_Name', getValue(member, ['RCFE_Name', 'Facility_Name', 'ISP_Current_Location']));
  query.set('Facility_Address', getRcfeFullAddress(member));
  query.set('Facility_Type', 'RCFE');
  query.set('Move_In_Date', getValue(member, ['Verified_Move_In_Date', 'Move_In_Date', 'Date_Member_Moved_Into_Facility']));
  query.set('Facility_Vetted_Contracted', 'Yes');
  query.set('In_ALW_County', toYesNo(getValue(member, ['In_ALW_County'])));
  const livingSituationSource = getValue(member, [
    'Where_Living',
    'Describe_Member_Living_Situation',
    'Member_Current_Living_Situation',
    'Current_Living_Situation',
    'ISP_Current_Location',
    'RCFE_Name',
  ]);
  const livingSituationFallback = livingSituationSource
    ? livingSituationSource
    : getValue(member, ['RCFE_Name'])
      ? `At assisted living facility: ${getValue(member, ['RCFE_Name'])}`
      : '';
  query.set('Describe_Member_Living_Situation', livingSituationFallback);

  const fieldMap: Array<[string, string[]]> = [
    ['ISP_Assessment_Date', ['ISP_Assessment_Date']],
    ['ISP_Social_Worker', ['ISP_Social_Worker', 'Social_Worker_Assigned']],
    ['ISP_RN', ['ISP_RN', 'RN_Assigned']],
    ['At_ALW_Facility', ['At_ALW_Facility']],
    ['Did_Submit_ALW_Application', ['Did_Submit_ALW_Application']],
    ['On_ALW_Waitlist', ['On_ALW_Waitlist']],
    ['Room_and_Board_Amount', ['Room_and_Board_Amount']],
    ['Requested_Tier_Level', ['Requested_Tier_Level', 'Tiered_Level_of_Care']],
    ['Tiered_Level_of_Care', ['Tiered_Level_of_Care', 'Requested_Tier_Level']],
  ];

  fieldMap.forEach(([targetKey, sourceKeys]) => {
    const value = getValue(member, sourceKeys);
    if (!value) return;
    if (targetKey === 'ISP_Social_Worker') {
      const normalizedSocialWorker = ensureMswTitle(normalizePersonName(value));
      if (normalizedSocialWorker) query.set(targetKey, normalizedSocialWorker);
      return;
    }
    if (targetKey === 'ISP_RN') {
      const normalizedRn = normalizePersonName(value);
      if (normalizedRn) query.set(targetKey, normalizedRn);
      return;
    }
    if (targetKey === 'At_ALW_Facility' || targetKey === 'On_ALW_Waitlist') {
      query.set(targetKey, toYesNo(value));
      return;
    }
    if (targetKey === 'Did_Submit_ALW_Application') {
      query.set(targetKey, normalizeAlwSubmitted(value));
      return;
    }
    if (targetKey === 'Requested_Tier_Level') {
      query.set(targetKey, normalizeTierLabel(value));
      return;
    }
    query.set(targetKey, value);
  });

  return query;
};

const buildIspCoverSheetUrl = (member: KaiserMember) => {
  const query = buildIspCoverSheetParams(member);
  return `/admin/tools/kaiser-isp-cover-sheet/kaiser-isp-cover-sheet?${query.toString()}`;
};

export default function KaiserIspCoverSheetToolPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const { user } = useUser();
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [recentCoverLogs, setRecentCoverLogs] = useState<RecentCoverLog[]>([]);
  const [isLoadingRecentCoverLogs, setIsLoadingRecentCoverLogs] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');

  const fetchMembers = async (opts?: { clientId2?: string }) => {
    const requestedClientId2 = clean(opts?.clientId2);
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('source', 'caspio');
      params.set('refresh', '1');
      if (requestedClientId2) params.set('clientId2', requestedClientId2);
      const url = `/api/kaiser-members?${params.toString()}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to load Kaiser members.'));
      }
      const loadedMembers = Array.isArray(data.members) ? (data.members as KaiserMember[]) : [];
      setMembers((prev) => {
        // For selected-member refresh, merge the returned member into existing list.
        if (requestedClientId2) {
          if (loadedMembers.length === 0) return prev;
          const next = [...prev];
          loadedMembers.forEach((incoming) => {
            const incomingId = clean(incoming.Client_ID2 || incoming.client_ID2);
            if (!incomingId) return;
            const existingIndex = next.findIndex(
              (member) => clean(member.Client_ID2 || member.client_ID2) === incomingId
            );
            if (existingIndex >= 0) next[existingIndex] = incoming;
            else next.push(incoming);
          });
          return next;
        }
        return loadedMembers;
      });
      setLastLoadedLabel(new Date().toLocaleString());
      if (loadedMembers.length > 0) {
        const firstClientId = clean(loadedMembers[0].Client_ID2 || loadedMembers[0].client_ID2);
        setSelectedClientId((prev) => prev || firstClientId);
      }
      toast({
        title: 'Kaiser members loaded',
        description: requestedClientId2
          ? `Selected member refreshed from Caspio (Client_ID2 ${requestedClientId2}).`
          : `${loadedMembers.length} members loaded from Caspio.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to load Kaiser members',
        description: String(error?.message || 'Unknown error'),
      });
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = useMemo(() => {
    const needle = clean(query).toLowerCase();
    if (!needle) return members;
    return members.filter((member) => {
      const haystack = [
        toName(member),
        clean(member.Client_ID2 || member.client_ID2),
        clean(member.memberMrn),
        clean(member.memberCounty),
        clean(member.Kaiser_Status),
        clean(member.CalAIM_Status),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [members, query]);

  const selectedMember = useMemo(
    () =>
      filteredMembers.find(
        (member) => clean(member.Client_ID2 || member.client_ID2) === clean(selectedClientId)
      ) || filteredMembers[0] || null,
    [filteredMembers, selectedClientId]
  );
  const canRefreshSelectedMember = Boolean(clean(selectedClientId));

  const requiredFieldStatuses = useMemo(
    () => (selectedMember ? getRequiredFieldStatuses(selectedMember) : []),
    [selectedMember]
  );
  const optionalFieldStatuses = useMemo(
    () => (selectedMember ? getOptionalFieldStatuses(selectedMember) : []),
    [selectedMember]
  );
  const missingRequiredLabels = useMemo(
    () =>
      requiredFieldStatuses
        .filter((field) => !clean(field.value))
        .map((field) => field.label),
    [requiredFieldStatuses]
  );
  const hasAllRequiredData = missingRequiredLabels.length === 0;
  const canOpenPrintable = Boolean(selectedMember && hasAllRequiredData);
  const printableHref = canOpenPrintable
    ? buildIspCoverSheetUrl(selectedMember as KaiserMember)
    : '';

  const handleOpenIspCoverSheet = () => {
    if (!selectedMember) return;
    if (!hasAllRequiredData) {
      toast({
        variant: 'destructive',
        title: 'Missing required Caspio fields',
        description: `Please complete: ${missingRequiredLabels.join(', ')}`,
      });
      return;
    }
    if (!printableHref) return;
    const popup = window.open(printableHref, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = printableHref;
    }
  };

  const handleRefreshSelectedMember = () => {
    const clientId2 = clean(selectedClientId);
    if (!clientId2) {
      toast({
        variant: 'destructive',
        title: 'Select a member first',
        description: 'Choose a member row, then refresh that selected member.',
      });
      return;
    }
    void fetchMembers({ clientId2 });
  };

  const loadRecentCoverLogs = async () => {
    const tokenUser = user || auth.currentUser;
    if (!tokenUser) {
      setRecentCoverLogs([]);
      return;
    }
    setIsLoadingRecentCoverLogs(true);
    try {
      const idToken = await tokenUser.getIdToken();
      const response = await fetch('/api/forms/kaiser-isp-cover-sheet/download-log?limit=10', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || 'Failed to load recent cover logs'));
      }
      setRecentCoverLogs(Array.isArray(body.logs) ? (body.logs as RecentCoverLog[]) : []);
    } catch {
      setRecentCoverLogs([]);
    } finally {
      setIsLoadingRecentCoverLogs(false);
    }
  };

  useEffect(() => {
    void loadRecentCoverLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kaiser ISP Cover Sheet Generator</CardTitle>
          <CardDescription>
            Search Kaiser members, prefill the Kaiser ISP Cover Sheet, then open the verified download flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMembers()}
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Load
            </Button>
            {lastLoadedLabel ? (
              <span className="text-xs text-muted-foreground">Last loaded: {lastLoadedLabel}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Click to load members from Caspio.</span>
            )}
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by member name, MRN, Client_ID2, county..."
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Members</CardTitle>
                <CardDescription>{filteredMembers.length} results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {filteredMembers.map((member, index) => {
                    const clientId2 = clean(member.Client_ID2 || member.client_ID2);
                    const isSelected = clientId2 && clientId2 === clean(selectedClientId);
                    const stableRowKey = [
                      clientId2 || 'no-client-id2',
                      clean(member.id),
                      toName(member),
                      clean(member.memberMrn),
                      String(index),
                    ]
                      .filter(Boolean)
                      .join('__');
                    return (
                      <button
                        type="button"
                        key={stableRowKey}
                        onClick={() => setSelectedClientId(clientId2)}
                        className={`w-full rounded-md border p-3 text-left transition ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="font-medium">{toName(member)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {clientId2 || 'No Client_ID2'} · MRN/CIN {clean(member.memberMrn) || 'N/A'}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {clean(member.Kaiser_Status) ? (
                            <Badge variant="outline">{clean(member.Kaiser_Status)}</Badge>
                          ) : null}
                          {clean(member.CalAIM_Status) ? (
                            <Badge variant="outline">{clean(member.CalAIM_Status)}</Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                  {filteredMembers.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No members found for this search.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Open ISP Cover Sheet Flow</CardTitle>
                <CardDescription>
                  Verify Caspio required fields, then open the Kaiser ISP Cover Sheet workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedMember ? (
                  <>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleRefreshSelectedMember}
                        disabled={isLoading || !canRefreshSelectedMember}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh Selected Member
                      </Button>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <div><span className="font-medium">Member:</span> {toName(selectedMember)}</div>
                      <div><span className="font-medium">Client_ID2:</span> {clean(selectedMember.Client_ID2 || selectedMember.client_ID2) || 'N/A'}</div>
                      <div><span className="font-medium">MRN/CIN:</span> {clean(selectedMember.memberMrn) || 'N/A'}</div>
                      <div><span className="font-medium">County:</span> {clean(selectedMember.memberCounty) || 'N/A'}</div>
                    </div>
                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                      <div className="font-medium">Required Caspio fields for this form</div>
                      {missingRequiredLabels.length > 0 ? (
                        <div className="mt-2 text-xs text-red-700">
                          Missing required data in Caspio: {missingRequiredLabels.join(', ')}.
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-green-700">
                          All required fields are present.
                        </div>
                      )}
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        {requiredFieldStatuses.map((field) => {
                          const ready = Boolean(clean(field.value));
                          return (
                          <div key={field.label} className={ready ? 'text-green-700' : 'text-red-700'}>
                            {field.label}: {ready ? `Ready (${clean(field.value)})` : 'Missing'}
                          </div>
                        )})}
                        {optionalFieldStatuses.map((field) => {
                          const hasValue = Boolean(clean(field.value));
                          return (
                          <div key={field.label} className={hasValue ? 'text-green-700' : 'text-slate-500'}>
                            {field.label}: {hasValue ? `Ready (${clean(field.value)})` : 'Optional (not blocking)'}
                          </div>
                        )})}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={handleOpenIspCoverSheet} disabled={!canOpenPrintable}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open ISP Cover Sheet
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Opens `/admin/tools/kaiser-isp-cover-sheet/kaiser-isp-cover-sheet` with selected member data.
                    </p>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Select a member to generate an ISP cover sheet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Last 10 Covers Generated</CardTitle>
                <CardDescription>Recent generated ISP covers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Link
                    href="/admin/tools/kaiser-isp-cover-downloads"
                    className="text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900"
                  >
                    ISP Cover Downloads Page
                  </Link>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadRecentCoverLogs()}
                    disabled={isLoadingRecentCoverLogs}
                  >
                    {isLoadingRecentCoverLogs ? 'Loading...' : 'Refresh List'}
                  </Button>
                </div>
                {isLoadingRecentCoverLogs ? (
                  <div className="text-xs text-muted-foreground">Loading recent cover downloads...</div>
                ) : recentCoverLogs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No recent cover downloads found.</div>
                ) : (
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {recentCoverLogs.map((log) => (
                      <div key={log.id} className="rounded border p-2 text-xs">
                        <div className="font-medium text-slate-800">
                          {clean(log.memberName) || clean(log.downloadName) || 'Unknown member'}
                        </div>
                        <div className="text-slate-600">
                          {clean(log.coverPageType) === 'reauthorization' ? 'Reauthorization' : 'Initial Authorization'} ·{' '}
                          {clean(log.staffName) || 'Unknown staff'}
                        </div>
                        <div className="text-slate-500">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

