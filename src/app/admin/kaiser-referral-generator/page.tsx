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
import { findCountyByCityAndZip } from '@/lib/california-cities';

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
  RCFE_State?: string;
  RCFE_Zip?: string;
  Room_and_Board_Amount?: string;
  memberAddress?: string;
  Authorized_Party_First?: string;
  Authorized_Party_Last?: string;
  Authorized_Party_Phone?: string;
  Authorized_Party_Email?: string;
  Authorized_Party_Relationship?: string;
  CalAIM_MCO?: string;
  caspioRaw?: Record<string, unknown>;
};

type RecentReferralEntry = {
  id: string;
  memberName: string;
  memberMrn?: string;
  submittedBy?: string;
  status?: string;
  createdAt?: string;
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

const getCurrentCostCoverage = (member: KaiserMember) =>
  getMemberValue(member, [
    'Current_Cost_and_How_Covered',
    'Current_Cost_How_Covered',
    'Current_cost_and_how_its_being_covered',
    'Room_and_Board_Amount',
  ]);

const isAssistedLivingSelected = (member: KaiserMember) => {
  const explicitChoice = getMemberValue(member, ['ALF_2_2_Choice', 'alft22Choice']).toUpperCase();
  if (explicitChoice === 'C') return true;
  const livingText = getMemberValue(member, [
    'Where_Living',
    'Describe_Member_Living_Situation',
    'Member_Current_Living_Situation',
    'Current_Living_Situation',
    'ISP_Current_Location',
  ]).toLowerCase();
  if (
    livingText.includes('assisted living') ||
    livingText.includes('board and care') ||
    livingText.includes('rcfe')
  ) {
    return true;
  }
  const hasRcfeLocation = Boolean(
    getMemberValue(member, ['RCFE_Name', 'RCFE_Address', 'RCFE_City', 'RCFE_State', 'RCFE_Zip'])
  );
  return hasRcfeLocation;
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

const getLastNameForLookup = (member: KaiserMember) => {
  const explicitLast = clean(member.memberLastName);
  if (explicitLast) return explicitLast;
  const normalizedName = normalizeMemberName(member.memberName);
  if (!normalizedName) return '';
  const parts = normalizedName.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return normalizedName;
  return parts[parts.length - 1];
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
  getMemberValue(member, [
    'memberPhone',
    'Best_Contact_Phone',
    'Best_Contact_Number',
    'Best Contact Phone',
    'Best_Phone',
    'Senior_Phone',
    'Senior Phone',
    'Senior_Phone_Number',
    'SeniorPhone',
    'Cell_Phone',
    'CellPhone',
    'Phone',
    'Member_Phone',
    'MemberPhone',
    'Phone_Number',
    'Primary_Phone_Number',
    'Primary_Phone',
    'Home_Phone_Number',
    'Home_Phone',
    'ISP_Contact_Phone',
    'Authorized_Party_Phone',
    'contactPhone',
    'Contact_Phone',
    'emergencyContactPhone',
    'Emergency_Contact_Phone',
    'bestContactPhone',
  ]);

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

const resolveMemberCounty = (member: KaiserMember) => {
  const stored = clean(member.memberCounty);
  if (stored && stored.toLowerCase() !== 'unknown') return stored;
  const city = getMemberValue(member, [
    'Normal_Housing_City',
    'Member_City',
    'MemberCity',
    'City',
    'memberCustomaryCity',
  ]);
  const zip = getMemberValue(member, [
    'Normal_Housing_Zip',
    'Member_Zip',
    'Zip',
    'memberCustomaryZip',
  ]);
  const address = toMemberAddress(member);
  const zipFromAddress = address.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] || '';
  return findCountyByCityAndZip(city, zip || zipFromAddress) || stored;
};

const buildReferralUrl = (
  member: KaiserMember,
  submitter: { name: string; email: string },
  options?: { phoneOverride?: string }
) => {
  const query = new URLSearchParams();
  const today = format(new Date(), 'yyyy-MM-dd');
  const memberName = toName(member);
  const memberDob = normalizeDobForReferral(toMemberDob(member));
  const memberPhone = clean(options?.phoneOverride) || toMemberPhone(member);
  const memberAddress = toMemberAddress(member);
  const authorizedPartyFirst = getMemberValue(member, ['Authorized_Party_First']);
  const authorizedPartyLast = getMemberValue(member, ['Authorized_Party_Last']);
  const authorizedPartyPhone = getMemberValue(member, ['Authorized_Party_Phone']);
  const authorizedPartyEmail = getMemberValue(member, ['Authorized_Party_Email']);
  const authorizedPartyRelationship = getMemberValue(member, ['Authorized_Party_Relationship']);
  const authorizedPartyName = [authorizedPartyFirst, authorizedPartyLast].filter(Boolean).join(' ').trim();
  const authorizedPartyContact = [authorizedPartyPhone, authorizedPartyEmail].filter(Boolean).join(' | ').trim();
  const assistedLivingSelected = isAssistedLivingSelected(member);
  const currentCostCoverage = getCurrentCostCoverage(member);
  const clientId2 = clean(member.Client_ID2 || member.client_ID2);
  const memberCounty = resolveMemberCounty(member);
  const rcfeAddress = composeAddress(
    getMemberValue(member, ['RCFE_Address']),
    getMemberValue(member, ['RCFE_City']),
    getMemberValue(member, ['RCFE_State']),
    getMemberValue(member, ['RCFE_Zip'])
  );

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
  if (assistedLivingSelected) {
    query.set('alft22Choice', 'C');
    query.set('currentLocationName', getMemberValue(member, ['RCFE_Name']));
    query.set('currentLocationAddress', rcfeAddress);
    if (currentCostCoverage) query.set('alft22CurrentCost', currentCostCoverage);
  }
  if (authorizedPartyName) query.set('caregiverName', authorizedPartyName);
  if (authorizedPartyContact) query.set('caregiverContact', authorizedPartyContact);
  if (authorizedPartyFirst) query.set('authorizedPartyFirst', authorizedPartyFirst);
  if (authorizedPartyLast) query.set('authorizedPartyLast', authorizedPartyLast);
  if (authorizedPartyPhone) query.set('authorizedPartyPhone', authorizedPartyPhone);
  if (authorizedPartyEmail) query.set('authorizedPartyEmail', authorizedPartyEmail);
  if (authorizedPartyRelationship) query.set('authorizedPartyRelationship', authorizedPartyRelationship);

  return `/admin/kaiser-referral-generator/printable?${query.toString()}`;
};

export default function KaiserReferralGeneratorPage() {
  const { toast } = useToast();
  const { user } = useAdmin();
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [recentReferrals, setRecentReferrals] = useState<RecentReferralEntry[]>([]);
  const [isLoadingRecentReferrals, setIsLoadingRecentReferrals] = useState(false);
  const [lastSource, setLastSource] = useState<'cache' | 'caspio'>('cache');
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');

  const resolveOnDemandClientId2 = async (): Promise<string> => {
    const selected = clean(selectedClientId);
    if (selected) return selected;

    const lookup = clean(query);
    if (!lookup) {
      toast({
        variant: 'destructive',
        title: 'Enter lookup value first',
        description: 'Type a last name or Client_ID2, or select a member, before pulling from Caspio.',
      });
      return '';
    }

    // Numeric lookup: treat as Client_ID2/MRN/CIN style ID.
    if (/^\d+$/.test(lookup)) return lookup;

    // Text lookup: treat as last-name prefix only.
    const lowered = lookup.toLowerCase();
    const localMatches = members.filter((member) =>
      getLastNameForLookup(member).toLowerCase().startsWith(lowered)
    );
    if (localMatches.length === 1) {
      return clean(localMatches[0].Client_ID2 || localMatches[0].client_ID2);
    }

    const response = await fetch(`/api/members?search=${encodeURIComponent(lookup)}&limit=25&offset=0`, {
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok || !Array.isArray(data?.members)) {
      throw new Error(String(data?.error || 'Failed to resolve member by last name.'));
    }

    const lastNameMatches = (data.members as any[])
      .map((member) => ({
        clientId2: clean(member?.clientId2),
        lastName: clean(member?.lastName),
      }))
      .filter((member) => member.clientId2 && member.lastName.toLowerCase().startsWith(lowered));

    if (lastNameMatches.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No member found',
        description: `No member found for last name "${lookup}". Try full last name or Client_ID2.`,
      });
      return '';
    }
    if (lastNameMatches.length > 1) {
      toast({
        variant: 'destructive',
        title: 'Multiple matches found',
        description: `More than one member matches "${lookup}". Please search by Client_ID2.`,
      });
      return '';
    }
    return lastNameMatches[0].clientId2;
  };

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
      setMembers((prev) => {
        // Keep full list visible: on-demand Caspio pulls should update a member
        // without replacing the whole cache-backed list.
        if (requestedSource === 'caspio' && requestedClientId2) {
          if (loadedMembers.length === 0) return prev;
          const next = [...prev];
          loadedMembers.forEach((incoming) => {
            const incomingId = clean(incoming.Client_ID2 || incoming.client_ID2);
            if (!incomingId) {
              next.push(incoming);
              return;
            }
            const existingIndex = next.findIndex(
              (member) => clean(member.Client_ID2 || member.client_ID2) === incomingId
            );
            if (existingIndex >= 0) {
              next[existingIndex] = incoming;
            } else {
              next.push(incoming);
            }
          });
          return next;
        }
        return loadedMembers;
      });
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
    const lookup = clean(query);
    if (!lookup) return members;

    // Limit lookup to IDs and last name only (no broad free-text scanning).
    if (/^\d+$/.test(lookup)) {
      return members.filter((member) => {
        const clientId2 = clean(member.Client_ID2 || member.client_ID2);
        const mrn = clean(member.memberMrn);
        return clientId2.includes(lookup) || mrn.includes(lookup);
      });
    }

    const lowered = lookup.toLowerCase();
    return members.filter((member) => getLastNameForLookup(member).toLowerCase().startsWith(lowered));
  }, [members, query]);

  const selectedMember = useMemo(
    () =>
      filteredMembers.find(
        (member) => clean(member.Client_ID2 || member.client_ID2) === clean(selectedClientId)
      ) || filteredMembers[0] || null,
    [filteredMembers, selectedClientId]
  );

  const selectedReferralUrl = selectedMember
    ? buildReferralUrl(
        selectedMember,
        {
          name: String(user?.displayName || '').trim(),
          email: String(user?.email || '').trim(),
        },
        { phoneOverride }
      )
    : '';
  const selectedMemberAssistedLiving = selectedMember ? isAssistedLivingSelected(selectedMember) : false;
  const selectedMemberCurrentCostCoverage = selectedMember ? getCurrentCostCoverage(selectedMember) : '';
  const selectedMemberPhone = clean(phoneOverride) || (selectedMember ? toMemberPhone(selectedMember) : '');

  const selectedMemberRequiredStatuses = useMemo(() => {
    if (!selectedMember) return [];
    const base = [
      { label: 'Member Name', value: toName(selectedMember) },
      { label: 'MRN/CIN', value: clean(selectedMember.memberMrn) },
      { label: 'Birth Date (Birth_Date)', value: normalizeDobForReferral(toMemberDob(selectedMember)) },
      { label: 'Best Contact Phone', value: selectedMemberPhone },
      { label: 'Member Mailing Address', value: toMemberAddress(selectedMember) },
    ];
    if (selectedMemberAssistedLiving) {
      base.push({
        label: 'Current Cost and How It Is Covered',
        value: selectedMemberCurrentCostCoverage,
      });
    }
    return base;
  }, [
    selectedMember,
    selectedMemberAssistedLiving,
    selectedMemberCurrentCostCoverage,
    selectedMemberPhone,
  ]);
  const selectedMemberMissingRequired = useMemo(
    () => selectedMemberRequiredStatuses.filter((field) => !clean(field.value)),
    [selectedMemberRequiredStatuses]
  );
  const canGenerateReferral = Boolean(selectedMember && selectedMemberMissingRequired.length === 0);
  const canRefreshSelectedMember = Boolean(clean(selectedClientId));

  useEffect(() => {
    setPhoneOverride('');
  }, [selectedClientId]);

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

  const loadRecentReferrals = async () => {
    if (!user) {
      setRecentReferrals([]);
      return;
    }
    setIsLoadingRecentReferrals(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/forms/kaiser-referral/recent?limit=10', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || 'Failed to load recent referrals'));
      }
      setRecentReferrals(Array.isArray(body.referrals) ? (body.referrals as RecentReferralEntry[]) : []);
    } catch {
      setRecentReferrals([]);
    } finally {
      setIsLoadingRecentReferrals(false);
    }
  };

  useEffect(() => {
    void loadRecentReferrals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

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
              onClick={async () => {
                const resolvedClientId2 = await resolveOnDemandClientId2();
                if (!resolvedClientId2) return;
                await fetchMembers({
                  sourceOverride: 'caspio',
                  forceRefresh: true,
                  clientId2: resolvedClientId2,
                });
                setSelectedClientId(resolvedClientId2);
              }}
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
              placeholder="Search by last name or Client_ID2"
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
                        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                          Cannot generate yet — missing:{' '}
                          <span className="font-semibold">
                            {selectedMemberMissingRequired.map((item) => item.label).join(', ')}
                          </span>
                          .
                          {!selectedMemberPhone ? (
                            <span className="mt-1 block">
                              Enter a Best Contact Phone below (Caspio has no phone on file for this member).
                            </span>
                          ) : null}
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
                          { label: 'Phone (Best_Contact_Phone)', value: selectedMemberPhone, required: true },
                          { label: 'Mailing Address', value: toMemberAddress(selectedMember), required: true },
                          { label: 'MRN/CIN', value: clean(selectedMember.memberMrn), required: true },
                          { label: 'County', value: resolveMemberCounty(selectedMember), required: false },
                          {
                            label: 'Current Cost and How It Is Covered',
                            value: selectedMemberCurrentCostCoverage,
                            required: selectedMemberAssistedLiving,
                          },
                          { label: 'CalAIM Status', value: clean(selectedMember.CalAIM_Status), required: false },
                          { label: 'RCFE', value: clean(selectedMember.RCFE_Name), required: false },
                        ].map((field) => {
                          const value = clean(field.value);
                          const hasValue = Boolean(value) && value.toLowerCase() !== 'unknown';
                          const isCountyField = field.label === 'County';
                          const countyUndetermined = isCountyField && !hasValue;
                          const rowClass = countyUndetermined
                            ? 'text-amber-800'
                            : hasValue
                              ? 'text-green-700'
                              : field.required
                                ? 'text-red-700'
                                : 'text-slate-500';
                          return (
                            <div key={field.label} className={rowClass}>
                              {field.label}:{' '}
                              {countyUndetermined
                                ? 'County cannot be determined'
                                : hasValue
                                  ? `Ready (${field.value})`
                                  : field.required
                                    ? 'Missing'
                                    : 'Optional (not set)'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {!toMemberPhone(selectedMember) ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="text-sm font-medium text-amber-950">Best Contact Phone required</div>
                        <p className="text-xs text-amber-900/90">
                          No phone was found on this Caspio member record. Enter a phone number to unlock Generate.
                        </p>
                        <Input
                          value={phoneOverride}
                          onChange={(event) => setPhoneOverride(event.target.value)}
                          placeholder="e.g. 555-123-4567"
                          inputMode="tel"
                          autoComplete="tel"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {canGenerateReferral ? (
                        <Button asChild>
                          <Link href={selectedReferralUrl}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Generate Kaiser Referral Form
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled
                          title={
                            selectedMemberMissingRequired.length
                              ? `Missing: ${selectedMemberMissingRequired.map((item) => item.label).join(', ')}`
                              : 'Select a member first'
                          }
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Generate Kaiser Referral Form
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Opens `/admin/kaiser-referral-generator/printable` with prefilled member data and logs submission context
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

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Last 10 Referrals Generated</CardTitle>
                <CardDescription>Recent Kaiser referral generation/sent records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <Link
                    href="/admin/email-logs/kaiser-referrals"
                    className="text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900"
                  >
                    Open Referral DataPage
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadRecentReferrals()}
                    disabled={isLoadingRecentReferrals}
                  >
                    {isLoadingRecentReferrals ? 'Loading...' : 'Refresh'}
                  </Button>
                </div>
                {isLoadingRecentReferrals ? (
                  <div className="text-xs text-muted-foreground">Loading recent referrals...</div>
                ) : recentReferrals.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No recent referrals found.</div>
                ) : (
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {recentReferrals.map((entry) => (
                      <div key={entry.id} className="rounded border p-2 text-xs">
                        <div className="font-medium text-slate-800">
                          {clean(entry.memberName) || 'Unknown member'}
                        </div>
                        <div className="text-slate-600">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'}
                        </div>
                        <div className="text-slate-500">
                          {(clean(entry.status) || 'unknown').toUpperCase()}
                          {clean(entry.submittedBy) ? ` • ${clean(entry.submittedBy)}` : ''}
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

