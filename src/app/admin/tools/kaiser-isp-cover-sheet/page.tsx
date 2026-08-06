'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Search, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type DataSource = 'cache' | 'caspio';
type CoverPageType = 'authorization' | 'reauthorization';
type PreviewMode = 'template' | 'prefilled';

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
  if (raw === 'no' || raw === 'n' || raw === '0' || raw === 'false') return 'No';
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
  { label: 'Facility Address (RCFE)', value: getValue(member, ['RCFE_Address', 'Facility_Address', 'ISP_Current_Address']) },
  { label: 'Did Submit ALW Application', value: normalizeAlwSubmitted(getValue(member, ['Did_Submit_ALW_Application'])) },
];

const getOptionalFieldStatuses = (member: KaiserMember): OptionalFieldStatus[] => [
  { label: 'At ALW Facility', value: getValue(member, ['At_ALW_Facility']) },
  { label: 'On ALW Waitlist', value: getValue(member, ['On_ALW_Waitlist']) },
  { label: 'Room and Board Amount', value: getValue(member, ['Room_and_Board_Amount']) },
  { label: 'Requested Tier Level', value: getValue(member, ['Requested_Tier_Level']) },
  { label: 'In ALW County', value: getValue(member, ['In_ALW_County']) },
  { label: 'Date Member Moved Into Facility', value: getValue(member, ['Move_In_Date', 'Date_Member_Moved_Into_Facility']) },
];

const buildIspCoverSheetParams = (member: KaiserMember, coverPageType: CoverPageType) => {
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
  query.set('ispCoverPageType', coverPageType);
  query.set('Facility_Name', getValue(member, ['RCFE_Name', 'Facility_Name', 'ISP_Current_Location']));
  query.set('Facility_Address', getValue(member, ['RCFE_Address', 'Facility_Address', 'ISP_Current_Address']));
  query.set('Facility_Type', 'RCFE');
  query.set('Move_In_Date', getValue(member, ['Move_In_Date', 'Date_Member_Moved_Into_Facility']));
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
    ['Requested_Tier_Level', ['Requested_Tier_Level']],
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

const buildIspCoverSheetUrl = (member: KaiserMember, coverPageType: CoverPageType) => {
  const query = buildIspCoverSheetParams(member, coverPageType);
  return `/forms/kaiser-isp-cover-sheet/printable?${query.toString()}`;
};

const buildIspTemplatePdfUrl = (member: KaiserMember, coverPageType: CoverPageType) => {
  const query = buildIspCoverSheetParams(member, coverPageType);
  return `/api/forms/kaiser-isp-cover-sheet/template?${query.toString()}`;
};

export default function KaiserIspCoverSheetToolPage() {
  const { toast } = useToast();
  const [source, setSource] = useState<DataSource>('cache');
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [coverPageType, setCoverPageType] = useState<CoverPageType | ''>('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('template');
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');

  const fetchMembers = async (opts?: { forceRefresh?: boolean }) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (source === 'caspio') params.set('source', 'caspio');
      if (opts?.forceRefresh && source === 'caspio') params.set('refresh', '1');
      const url = `/api/kaiser-members${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to load Kaiser members.'));
      }
      const loadedMembers = Array.isArray(data.members) ? (data.members as KaiserMember[]) : [];
      setMembers(loadedMembers);
      setLastLoadedLabel(new Date().toLocaleString());
      if (loadedMembers.length > 0) {
        const firstClientId = clean(loadedMembers[0].Client_ID2 || loadedMembers[0].client_ID2);
        setSelectedClientId((prev) => prev || firstClientId);
      }
      toast({
        title: 'Kaiser members loaded',
        description: `${loadedMembers.length} members loaded from ${source === 'caspio' ? 'live Caspio' : 'cache'}.`,
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

  const handleSourceChange = (nextSource: DataSource) => {
    setSource(nextSource);
    setMembers([]);
    setSelectedClientId('');
    setLastLoadedLabel('');
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
  const canGenerate = Boolean(selectedMember && coverPageType && hasAllRequiredData);
  const prefilledPreviewUrl = canGenerate
    ? buildIspTemplatePdfUrl(selectedMember as KaiserMember, coverPageType as CoverPageType)
    : '';
  const printableHref = canGenerate
    ? buildIspCoverSheetUrl(selectedMember as KaiserMember, coverPageType as CoverPageType)
    : '';

  const handleOpenIspCoverSheet = () => {
    if (!selectedMember) return;
    if (!coverPageType) {
      toast({
        variant: 'destructive',
        title: 'Select cover sheet type',
        description: 'Choose Authorization or Reauthorization before opening the form.',
      });
      return;
    }
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kaiser ISP Cover Sheet Generator</CardTitle>
          <CardDescription>
            Search Kaiser members, prefill the ISP cover sheet, then open the printable PDF flow with download/print.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={source === 'cache' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSourceChange('cache')}
              disabled={isLoading}
            >
              Fast (Recommended)
            </Button>
            <Button
              variant={source === 'caspio' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSourceChange('caspio')}
              disabled={isLoading}
            >
              Live Caspio (Use if needed)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMembers({ forceRefresh: source === 'caspio' })}
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {lastLoadedLabel ? (
              <span className="text-xs text-muted-foreground">Last loaded: {lastLoadedLabel}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Select source, then click Refresh to load members.</span>
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                <CardTitle className="text-base">Generate ISP Cover Sheet</CardTitle>
                <CardDescription>Use the same print/download PDF flow as Kaiser referral forms.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedMember ? (
                  <>
                    <div className="rounded-md border p-3 text-sm">
                      <div><span className="font-medium">Member:</span> {toName(selectedMember)}</div>
                      <div><span className="font-medium">Client_ID2:</span> {clean(selectedMember.Client_ID2 || selectedMember.client_ID2) || 'N/A'}</div>
                      <div><span className="font-medium">MRN/CIN:</span> {clean(selectedMember.memberMrn) || 'N/A'}</div>
                      <div><span className="font-medium">County:</span> {clean(selectedMember.memberCounty) || 'N/A'}</div>
                    </div>
                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                      <div className="mb-2 font-medium">Select cover sheet section type (required)</div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={coverPageType === 'authorization' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCoverPageType('authorization')}
                        >
                          Authorization Cover Page
                        </Button>
                        <Button
                          type="button"
                          variant={coverPageType === 'reauthorization' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCoverPageType('reauthorization')}
                        >
                          Reauthorization Cover Page
                        </Button>
                      </div>
                      {!coverPageType ? (
                        <p className="mt-2 text-xs text-amber-700">
                          Staff must choose one section type before generating this form.
                        </p>
                      ) : null}
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
                      <Button type="button" onClick={handleOpenIspCoverSheet} disabled={!canGenerate}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open ISP Cover Sheet
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Opens `/forms/kaiser-isp-cover-sheet/printable` with selected member data and section type.
                    </p>
                    <div className="rounded-md border bg-white p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">On-page PDF viewer</div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={previewMode === 'template' ? 'default' : 'outline'}
                            onClick={() => setPreviewMode('template')}
                          >
                            Cover Sheet Template
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={previewMode === 'prefilled' ? 'default' : 'outline'}
                            onClick={() => setPreviewMode('prefilled')}
                            disabled={!canGenerate}
                          >
                            Prefilled Printable Form
                          </Button>
                        </div>
                      </div>
                      {previewMode === 'prefilled' && !canGenerate ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Select a cover sheet type and complete required Caspio fields to preview the prefilled form.
                        </div>
                      ) : (
                        <iframe
                          title={previewMode === 'template' ? 'Kaiser ISP template preview' : 'Kaiser ISP prefilled preview'}
                          src={
                            previewMode === 'template'
                              ? '/api/forms/kaiser-isp-cover-sheet/template'
                              : prefilledPreviewUrl
                          }
                          className="h-[640px] w-full rounded border"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Select a member to generate an ISP cover sheet.
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

