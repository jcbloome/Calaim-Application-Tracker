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

type DataSource = 'cache' | 'caspio';

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
  CalAIM_MCO?: string;
};

const clean = (value: unknown) => String(value || '').trim();
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

const buildReferralUrl = (member: KaiserMember) => {
  const query = new URLSearchParams();
  const today = format(new Date(), 'yyyy-MM-dd');
  const memberName = toName(member);
  const clientId2 = clean(member.Client_ID2 || member.client_ID2);
  const memberCounty = clean(member.memberCounty);
  const rcfeAddress = composeAddress(member.RCFE_Address, member.RCFE_City, member.RCFE_Zip);

  query.set('returnTo', '/admin/kaiser-referral-generator');
  query.set('referralContext', 'manual_standalone_generator');
  query.set('memberClientId', clientId2);
  query.set('memberName', memberName);
  query.set('memberMrn', clean(member.memberMrn));
  query.set('memberMediCal', clean(member.memberMrn));
  query.set('memberDob', clean(member.birthDate || member.Birth_Date));
  query.set('memberPhone', clean(member.memberPhone));
  query.set('memberEmail', clean(member.memberEmail));
  query.set('memberCounty', memberCounty);
  query.set('healthPlan', clean(member.CalAIM_MCO || 'Kaiser'));
  query.set('referralDate', today);
  query.set('kaiserAuthAlreadyReceived', '0');
  query.set('currentLocationName', clean(member.RCFE_Name));
  query.set('currentLocationAddress', rcfeAddress);

  return `/forms/kaiser-referral/printable?${query.toString()}`;
};

export default function KaiserReferralGeneratorPage() {
  const { toast } = useToast();
  const [source, setSource] = useState<DataSource>('cache');
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
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

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

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

  const selectedReferralUrl = selectedMember ? buildReferralUrl(selectedMember) : '';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Standalone Kaiser Referral Generator</CardTitle>
          <CardDescription>
            Generate prefilled Kaiser referral forms independent of the application pathway. Use cache for speed,
            or live Caspio while testing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={source === 'cache' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSource('cache')}
              disabled={isLoading}
            >
              Firestore Cache
            </Button>
            <Button
              variant={source === 'caspio' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSource('caspio')}
              disabled={isLoading}
            >
              Live Caspio
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
            ) : null}
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
                  {filteredMembers.map((member) => {
                    const clientId2 = clean(member.Client_ID2 || member.client_ID2);
                    const isSelected = clientId2 && clientId2 === clean(selectedClientId);
                    return (
                      <button
                        type="button"
                        key={`${clientId2}-${toName(member)}`}
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
                {selectedMember ? (
                  <>
                    <div className="rounded-md border p-3 text-sm">
                      <div><span className="font-medium">Member:</span> {toName(selectedMember)}</div>
                      <div><span className="font-medium">Client_ID2:</span> {clean(selectedMember.Client_ID2 || selectedMember.client_ID2) || 'N/A'}</div>
                      <div><span className="font-medium">County:</span> {clean(selectedMember.memberCounty) || 'N/A'}</div>
                      <div><span className="font-medium">Kaiser Status:</span> {clean(selectedMember.Kaiser_Status) || 'N/A'}</div>
                      <div><span className="font-medium">CalAIM Status:</span> {clean(selectedMember.CalAIM_Status) || 'N/A'}</div>
                      <div><span className="font-medium">RCFE:</span> {clean(selectedMember.RCFE_Name) || 'N/A'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild>
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

