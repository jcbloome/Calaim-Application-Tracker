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
import { useAdmin } from '@/hooks/use-admin';

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
  CalAIM_Status?: string;
  Kaiser_Status?: string;
  RCFE_Name?: string;
  RCFE_Address?: string;
  RCFE_City?: string;
  RCFE_Zip?: string;
  memberAddress?: string;
  Authorized_Party_First?: string;
  Authorized_Party_Last?: string;
  Authorized_Party_Phone?: string;
  Authorized_Party_Email?: string;
  Authorized_Party_Relationship?: string;
  CalAIM_MCO?: string;
  caspioRaw?: Record<string, unknown>;
};

const clean = (value: unknown) => String(value || '').trim();
const cleanCaspioValue = (value: unknown) => {
  const normalized = clean(value).replace(/\u00a0/g, ' ');
  if (!normalized) return '';
  // Ignore unresolved Caspio template tokens.
  if (/^\{\{\s*@field:[^}]+\}\}$/i.test(normalized)) return '';
  if (/^\(\(\s*@field:[^)]+\)\)$/i.test(normalized)) return '';
  if (/@field:/i.test(normalized) && !/[a-z0-9]/i.test(normalized.replace(/@field:[^}\)]*/gi, ''))) return '';
  return normalized;
};

const getMemberValue = (member: KaiserMember, keys: string[]) => {
  for (const key of keys) {
    const top = cleanCaspioValue((member as any)?.[key]);
    if (top) return top;
    const raw = cleanCaspioValue((member as any)?.caspioRaw?.[key]);
    if (raw) return raw;
  }
  return '';
};
const normalizeMemberName = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const withoutTrailingId = raw.replace(/\s+[a-zA-Z-]*\d{3,}\s*$/, '').trim();
  if (withoutTrailingId.includes(',')) {
    const [lastNameRaw, firstNameRaw] = withoutTrailingId.split(',', 2);
    return `${clean(firstNameRaw)} ${clean(lastNameRaw)}`.trim();
  }
  return withoutTrailingId.replace(/\s+/g, ' ').trim();
};

const composeAddress = (...parts: Array<unknown>) =>
  parts
    .map((part) => clean(part))
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ', ')
    .trim();

const toName = (member: KaiserMember) => {
  const firstLast = `${clean(member.memberFirstName)} ${clean(member.memberLastName)}`.trim();
  const preferred = firstLast || normalizeMemberName(member.memberName);
  return preferred || `Client ${clean(member.Client_ID2 || member.client_ID2)}`;
};

const toMemberDob = (member: KaiserMember) =>
  cleanCaspioValue(member.Birth_Date) || cleanCaspioValue((member as any)?.caspioRaw?.Birth_Date);

const normalizeDobForReferral = (value: string) => {
  const raw = clean(value);
  if (!raw) return '';
  const mmDdYyyyDashed = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mmDdYyyyDashed) return `${mmDdYyyyDashed[1]}-${mmDdYyyyDashed[2]}-${mmDdYyyyDashed[3]}`;
  const mmDdYyyySlashed = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mmDdYyyySlashed) return `${mmDdYyyySlashed[1]}-${mmDdYyyySlashed[2]}-${mmDdYyyySlashed[3]}`;
  const yyyyMmDd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDd) return `${yyyyMmDd[2]}-${yyyyMmDd[3]}-${yyyyMmDd[1]}`;
  const yyyyMmDdWithTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T.*$/);
  if (yyyyMmDdWithTime) return `${yyyyMmDdWithTime[2]}-${yyyyMmDdWithTime[3]}-${yyyyMmDdWithTime[1]}`;
  return raw;
};

const toMemberPhone = (member: KaiserMember) =>
  [
    (member as any)?.memberPhone,
    (member as any)?.Best_Contact_Phone,
    (member as any)?.Best_Contact_Number,
    (member as any)?.['Best Contact Phone'],
    (member as any)?.Best_Phone,
    (member as any)?.Senior_Phone,
    (member as any)?.['Senior Phone'],
    (member as any)?.Senior_Phone_Number,
    (member as any)?.Cell_Phone,
    (member as any)?.CellPhone,
    (member as any)?.Phone,
    (member as any)?.Member_Phone,
    (member as any)?.Phone_Number,
    (member as any)?.Primary_Phone_Number,
    (member as any)?.Home_Phone_Number,
    (member as any)?.caspioRaw?.Best_Contact_Phone,
    (member as any)?.caspioRaw?.Best_Contact_Number,
    (member as any)?.caspioRaw?.['Best Contact Phone'],
    (member as any)?.caspioRaw?.Best_Phone,
    (member as any)?.caspioRaw?.Senior_Phone,
    (member as any)?.caspioRaw?.['Senior Phone'],
    (member as any)?.caspioRaw?.Senior_Phone_Number,
    (member as any)?.caspioRaw?.Cell_Phone,
    (member as any)?.caspioRaw?.CellPhone,
    (member as any)?.caspioRaw?.Phone,
    (member as any)?.caspioRaw?.Member_Phone,
    (member as any)?.caspioRaw?.Phone_Number,
    (member as any)?.caspioRaw?.Primary_Phone_Number,
    (member as any)?.caspioRaw?.Home_Phone_Number,
  ]
    .map((value) => cleanCaspioValue(value))
    .find(Boolean) || '';

const toMemberAddress = (member: KaiserMember) => {
  const fromTop = cleanCaspioValue((member as any)?.memberAddress);
  if (fromTop) return fromTop;
  const topStreet = cleanCaspioValue(
    (member as any)?.Normal_Housing_Street ||
    (member as any)?.Normal_Housing_Address ||
    (member as any)?.['Normal Housing Street']
  );
  const topCity = cleanCaspioValue((member as any)?.Normal_Housing_City || (member as any)?.['Normal Housing City']);
  const topState = cleanCaspioValue((member as any)?.Normal_Housing_State || (member as any)?.['Normal Housing State']);
  const topZip = cleanCaspioValue((member as any)?.Normal_Housing_Zip || (member as any)?.['Normal Housing Zip']);
  const topCityStateZip = [topCity, topState, topZip].filter(Boolean).join(', ').replace(', ,', ', ').trim();
  const fromTopNormalHousing = [topStreet, topCityStateZip].filter(Boolean).join(', ').trim();
  if (fromTopNormalHousing) return fromTopNormalHousing;
  const raw = (member as any)?.caspioRaw || {};
  const street = cleanCaspioValue(raw?.Normal_Housing_Street || raw?.Normal_Housing_Address || raw?.['Normal Housing Street']);
  const city = cleanCaspioValue(raw?.Normal_Housing_City || raw?.['Normal Housing City']);
  const state = cleanCaspioValue(raw?.Normal_Housing_State || raw?.['Normal Housing State']);
  const zip = cleanCaspioValue(raw?.Normal_Housing_Zip || raw?.['Normal Housing Zip']);
  const cityStateZip = [city, state, zip].filter(Boolean).join(', ').replace(', ,', ', ').trim();
  const normalHousingAddress = [street, cityStateZip].filter(Boolean).join(', ').trim();
  if (normalHousingAddress) return normalHousingAddress;
  const fallbackStreet = cleanCaspioValue(raw?.Member_Address || raw?.Address || raw?.Street_Address || raw?.Home_Address);
  const fallbackCity = cleanCaspioValue(raw?.Member_City || raw?.MemberCity || raw?.City || raw?.Home_City);
  const fallbackState = cleanCaspioValue(raw?.Member_State || raw?.State || raw?.Home_State);
  const fallbackZip = cleanCaspioValue(raw?.Member_Zip || raw?.Zip || raw?.Home_Zip);
  const fallbackCityStateZip = [fallbackCity, fallbackState, fallbackZip].filter(Boolean).join(', ').trim();
  return [fallbackStreet, fallbackCityStateZip].filter(Boolean).join(', ').trim();
};

const buildReferralUrl = (
  member: KaiserMember,
  submitter: { name: string; email: string }
) => {
  const query = new URLSearchParams();
  const today = format(new Date(), 'yyyy-MM-dd');
  const memberName = toName(member);
  const memberDob = normalizeDobForReferral(toMemberDob(member));
  const memberPhone = toMemberPhone(member);
  const memberAddress = toMemberAddress(member);
  const authorizedPartyFirst = getMemberValue(member, ['Authorized_Party_First']);
  const authorizedPartyLast = getMemberValue(member, ['Authorized_Party_Last']);
  const authorizedPartyPhone = getMemberValue(member, ['Authorized_Party_Phone']);
  const authorizedPartyEmail = getMemberValue(member, ['Authorized_Party_Email']);
  const authorizedPartyRelationship = getMemberValue(member, ['Authorized_Party_Relationship']);
  const authorizedPartyName = [authorizedPartyFirst, authorizedPartyLast].filter(Boolean).join(' ').trim();
  const authorizedPartyContact = [authorizedPartyPhone, authorizedPartyEmail].filter(Boolean).join(' | ').trim();
  const clientId2 = clean(member.Client_ID2 || member.client_ID2);
  const memberCounty = clean(member.memberCounty);
  const rcfeAddress = composeAddress(member.RCFE_Address, member.RCFE_City, member.RCFE_Zip);

  query.set('returnTo', '/admin/kaiser-referral-generator');
  query.set('referralContext', 'manual_standalone_generator');
  query.set('memberClientId', clientId2);
  query.set('memberName', memberName);
  query.set('memberMrn', clean(member.memberMrn));
  query.set('memberMediCal', clean(member.memberMrn));
  query.set('memberDob', memberDob);
  query.set('memberPhone', memberPhone);
  query.set('memberAddress', memberAddress);
  query.set('memberEmail', clean(member.memberEmail));
  query.set('memberCounty', memberCounty);
  query.set('healthPlan', clean(member.CalAIM_MCO || 'Kaiser'));
  query.set('submitterName', clean(submitter.name));
  query.set('submitterEmail', clean(submitter.email).toLowerCase());
  query.set('referralDate', today);
  query.set('kaiserAuthAlreadyReceived', '0');
  query.set('currentLocationName', clean(member.RCFE_Name));
  query.set('currentLocationAddress', rcfeAddress);
  if (authorizedPartyName) query.set('caregiverName', authorizedPartyName);
  if (authorizedPartyContact) query.set('caregiverContact', authorizedPartyContact);
  if (authorizedPartyFirst) query.set('authorizedPartyFirst', authorizedPartyFirst);
  if (authorizedPartyLast) query.set('authorizedPartyLast', authorizedPartyLast);
  if (authorizedPartyPhone) query.set('authorizedPartyPhone', authorizedPartyPhone);
  if (authorizedPartyEmail) query.set('authorizedPartyEmail', authorizedPartyEmail);
  if (authorizedPartyRelationship) query.set('authorizedPartyRelationship', authorizedPartyRelationship);

  return `/forms/kaiser-referral/printable?${query.toString()}`;
};

export default function KaiserReferralGeneratorPage() {
  const { toast } = useToast();
  const { user } = useAdmin();
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [lastSource, setLastSource] = useState<'cache' | 'caspio'>('cache');
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');

  const fetchMembers = async (opts?: {
    forceRefresh?: boolean;
    sourceOverride?: 'cache' | 'caspio';
    clientId2?: string;
  }) => {
    const requestedSource = opts?.sourceOverride || 'cache';
    const requestedClientId2 = clean(opts?.clientId2);

    if (requestedSource === 'caspio' && !requestedClientId2) {
      toast({
        variant: 'destructive',
        title: 'Select a member first',
        description: 'Pull from Caspio (On Demand) only fetches the selected Client_ID2.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (requestedSource === 'caspio') params.set('source', 'caspio');
      if (opts?.forceRefresh && requestedSource === 'caspio') params.set('refresh', '1');
      if (requestedSource === 'caspio' && requestedClientId2) params.set('clientId2', requestedClientId2);
      const url = `/api/kaiser-members${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to load Kaiser members.'));
      }
      const loadedMembers = Array.isArray(data.members) ? (data.members as KaiserMember[]) : [];
      setMembers(loadedMembers);
      setLastSource(requestedSource);
      setLastLoadedLabel(new Date().toLocaleString());
      if (loadedMembers.length > 0) {
        const firstClientId = clean(loadedMembers[0].Client_ID2 || loadedMembers[0].client_ID2);
        setSelectedClientId((prev) => prev || firstClientId);
      }
      toast({
        title: 'Kaiser members loaded',
        description: `${loadedMembers.length} members loaded from ${requestedSource === 'caspio' ? 'live Caspio' : 'cache'}.`,
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

  useEffect(() => {
    void fetchMembers({ sourceOverride: 'cache' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        clean(member.RCFE_Name),
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

  const selectedReferralUrl = selectedMember
    ? buildReferralUrl(selectedMember, {
        name: String(user?.displayName || '').trim(),
        email: String(user?.email || '').trim(),
      })
    : '';

  const selectedMemberRequiredStatuses = useMemo(() => {
    if (!selectedMember) return [];
    return [
      { label: 'Member Name', value: toName(selectedMember) },
      { label: 'MRN/CIN', value: clean(selectedMember.memberMrn) },
      { label: 'Birth Date (Birth_Date)', value: normalizeDobForReferral(toMemberDob(selectedMember)) },
      { label: 'Best Contact Phone', value: toMemberPhone(selectedMember) },
      { label: 'Member Mailing Address', value: toMemberAddress(selectedMember) },
    ];
  }, [selectedMember]);
  const selectedMemberMissingRequired = useMemo(
    () => selectedMemberRequiredStatuses.filter((field) => !clean(field.value)),
    [selectedMemberRequiredStatuses]
  );
  const canGenerateReferral = Boolean(selectedMember && selectedMemberMissingRequired.length === 0);
  const canRefreshSelectedMember = Boolean(clean(selectedClientId));

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
    void fetchMembers({
      sourceOverride: 'caspio',
      forceRefresh: true,
      clientId2,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Standalone Kaiser Referral Generator</CardTitle>
          <CardDescription>
            Generate prefilled Kaiser referral forms independent of the application pathway. Default is cached data;
            pull from Caspio only on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={lastSource === 'cache' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                void fetchMembers({ sourceOverride: 'cache' });
              }}
              disabled={isLoading}
            >
              Load Cache
            </Button>
            <Button
              variant={lastSource === 'caspio' ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                fetchMembers({
                  sourceOverride: 'caspio',
                  forceRefresh: true,
                  clientId2: clean(selectedClientId),
                })
              }
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Pull from Caspio (On Demand)
            </Button>
            {lastLoadedLabel ? (
              <span className="text-xs text-muted-foreground">Last loaded: {lastLoadedLabel}</span>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/email-logs/kaiser-referrals">
                View Referral DataPage
              </Link>
            </Button>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, Client_ID2, status, county..."
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
                      clean(member.memberCounty),
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
                        <div className="mt-1 text-xs text-muted-foreground">{clientId2 || 'No Client_ID2'}</div>
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
                <CardTitle className="text-base">Generate Form</CardTitle>
                <CardDescription>Preview selected member details before opening the standalone form.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {selectedMember ? (
                  <>
                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                      <div className="font-medium">Generate Form Field Check (Consolidated)</div>
                      {selectedMemberMissingRequired.length > 0 ? (
                        <div className="mt-2 text-xs text-red-700">
                          Missing required fields: {selectedMemberMissingRequired.map((item) => item.label).join(', ')}.
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-green-700">
                          All required fields are present. Ready to generate.
                        </div>
                      )}
                      <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                        {[
                          { label: 'Member', value: toName(selectedMember), required: true },
                          { label: 'Client_ID2', value: clean(selectedMember.Client_ID2 || selectedMember.client_ID2), required: true },
                          { label: 'DOB (Birth_Date)', value: normalizeDobForReferral(toMemberDob(selectedMember)), required: true },
                          { label: 'Phone (Best_Contact_Phone)', value: toMemberPhone(selectedMember), required: true },
                          { label: 'Mailing Address', value: toMemberAddress(selectedMember), required: true },
                          { label: 'MRN/CIN', value: clean(selectedMember.memberMrn), required: true },
                          { label: 'County', value: clean(selectedMember.memberCounty), required: false },
                          { label: 'Kaiser Status', value: clean(selectedMember.Kaiser_Status), required: false },
                          { label: 'CalAIM Status', value: clean(selectedMember.CalAIM_Status), required: false },
                          { label: 'RCFE', value: clean(selectedMember.RCFE_Name), required: false },
                        ].map((field) => {
                          const hasValue = Boolean(clean(field.value));
                          const rowClass = hasValue
                            ? 'text-green-700'
                            : field.required
                              ? 'text-red-700'
                              : 'text-slate-500';
                          return (
                            <div key={field.label} className={rowClass}>
                              {field.label}: {hasValue ? `Ready (${field.value})` : field.required ? 'Missing' : 'Optional (not set)'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild disabled={!canGenerateReferral}>
                        <Link href={selectedReferralUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Generate Kaiser Referral Form
                        </Link>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Opens `/forms/kaiser-referral/printable` with prefilled member data and logs submission context
                      as a standalone generator flow.
                    </p>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Select a member to generate a standalone referral form.
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

