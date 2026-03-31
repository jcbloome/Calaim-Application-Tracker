'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';

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
  RCFE_Admin_Name?: string;
}

type RcfeDraftFields = {
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

const normalizeRcfeName = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');

const getRcfeStreet = (member: Member) => String(member.RCFE_Street || member.RCFE_Address || '').trim();
const getRcfeCity = (member: Member) => String(member.RCFE_City || '').trim();
const getRcfeZip = (member: Member) => String(member.RCFE_Zip || '').trim();
const getRcfeKey = (member: Member, rcfeName: string) => {
  const street = getRcfeStreet(member).toLowerCase();
  const cityZip = [getRcfeCity(member), getRcfeZip(member)].filter(Boolean).join(', ').toLowerCase();
  return [rcfeName.toLowerCase(), street, cityZip].filter(Boolean).join('|');
};

export default function RcfeMonthlyVerificationPage() {
  const { isAdmin, isLoading } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberPresenceStatus, setMemberPresenceStatus] = useState<Record<string, 'there' | 'not_there'>>({});
  const [memberExtraDetails, setMemberExtraDetails] = useState<Record<string, string>>({});
  const [memberVerifiedAt, setMemberVerifiedAt] = useState<Record<string, string>>({});
  const [rcfeFieldOverrides, setRcfeFieldOverrides] = useState<Record<string, RcfeDraftFields>>({});
  const [monthlySubject, setMonthlySubject] = useState(
    `Monthly RCFE Member Verification - ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
  );
  const [monthlyIntro, setMonthlyIntro] = useState(
    'Hello RCFE Administrator,\n\nPlease review the member roster below and reply to confirm both groups: members verified at your RCFE and residents reported as not at the RCFE. Include any corrections or updates in your response.'
  );
  const [isSendingMonthlyTest, setIsSendingMonthlyTest] = useState(false);
  const [isSendingMonthlyBulk, setIsSendingMonthlyBulk] = useState(false);

  const progressDocRef = useMemo(
    () => (firestore ? doc(firestore, 'admin_tool_state', 'rcfe_data_progress') : null),
    [firestore]
  );

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

  const loadMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const res = await fetch('/api/all-members');
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || `Fetch failed (HTTP ${res.status})`);
      }
      const allMembers = (Array.isArray(data.members) ? data.members : []) as Member[];
      const scoped = allMembers.filter((m) => (isHealthNetMember(m) || isKaiserMember(m)) && isAuthorizedMember(m));
      setMembers(scoped);
    } catch (error: any) {
      toast({
        title: 'Load failed',
        description: error?.message || 'Could not load RCFE data.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMembers(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const localPresence = window.localStorage.getItem('rcfe-member-presence-status');
        const localDetails = window.localStorage.getItem('rcfe-member-extra-details');
        const localVerifiedAt = window.localStorage.getItem('rcfe-member-verified-at');
        const localOverrides = window.localStorage.getItem('rcfe-field-overrides');
        if (localPresence) setMemberPresenceStatus(JSON.parse(localPresence));
        if (localDetails) setMemberExtraDetails(JSON.parse(localDetails));
        if (localVerifiedAt) setMemberVerifiedAt(JSON.parse(localVerifiedAt));
        if (localOverrides) setRcfeFieldOverrides(JSON.parse(localOverrides));
      } catch {
        // ignore local storage issues
      }

      if (!progressDocRef) return;
      try {
        const snap = await getDoc(progressDocRef);
        if (!snap.exists()) return;
        const data = snap.data() as any;
        if (data?.memberPresenceStatus) setMemberPresenceStatus((prev) => ({ ...prev, ...data.memberPresenceStatus }));
        if (data?.memberExtraDetails) setMemberExtraDetails((prev) => ({ ...prev, ...data.memberExtraDetails }));
        if (data?.memberVerifiedAt) setMemberVerifiedAt((prev) => ({ ...prev, ...data.memberVerifiedAt }));
        if (data?.rcfeFieldOverrides) setRcfeFieldOverrides((prev) => ({ ...prev, ...data.rcfeFieldOverrides }));
      } catch {
        // ignore firestore read issues
      }
    };
    void loadProgress();
  }, [progressDocRef]);

  const emailRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        rcfeName: string;
        adminName: string;
        adminEmail: string;
        members: Array<{ id: string; name: string; status: string; lastVerifiedAt: string; extraDetails: string }>;
      }
    >();

    members.forEach((member) => {
      if (!hasAssignedRcfe(member)) return;
      const rcfeName = normalizeRcfeName(normalizeRcfeNameForAssignment(member.RCFE_Name) || 'RCFE Unassigned');
      if (!rcfeName || rcfeName === 'RCFE Unassigned') return;

      const key = getRcfeKey(member, rcfeName);
      const override = rcfeFieldOverrides[key];
      const adminEmail = String(
        override?.RCFE_Administrator_Email ||
          member.RCFE_Administrator_Email ||
          member.RCFE_Admin_Email ||
          ''
      )
        .trim()
        .toLowerCase();
      const adminName = normalizeAdminName(
        override?.RCFE_Administrator || member.RCFE_Administrator || member.RCFE_Admin_Name || ''
      );
      const memberId = String(member.Client_ID2 || '').trim();
      if (!memberId) return;
      const memberName =
        String(member.memberName || '').trim() ||
        `${String(member.memberFirstName || '').trim()} ${String(member.memberLastName || '').trim()}`.trim() ||
        memberId;

      const row = grouped.get(key) || {
        rcfeName,
        adminName,
        adminEmail,
        members: [],
      };
      if (!row.adminEmail && adminEmail) row.adminEmail = adminEmail;
      if (!row.adminName && adminName) row.adminName = adminName;
      if (!row.members.some((m) => m.id === memberId)) {
        row.members.push({
          id: memberId,
          name: memberName,
          status: memberPresenceStatus[memberId] || 'unknown',
          lastVerifiedAt: memberVerifiedAt[memberId] || '',
          extraDetails: memberExtraDetails[memberId] || '',
        });
      }
      grouped.set(key, row);
    });

    return Array.from(grouped.values()).filter((row) => row.adminEmail.includes('@') && row.members.length > 0);
  }, [members, memberPresenceStatus, memberExtraDetails, memberVerifiedAt, rcfeFieldOverrides]);

  const sendMonthlyVerificationEmails = useCallback(
    async (mode: 'test' | 'bulk') => {
      try {
        if (!auth?.currentUser) throw new Error('You must be signed in to send emails.');
        if (!monthlySubject.trim() || !monthlyIntro.trim()) {
          throw new Error('Subject and intro are required.');
        }
        if (emailRows.length === 0) {
          throw new Error('No RCFE rows with valid admin emails and members were found.');
        }

        if (mode === 'test') setIsSendingMonthlyTest(true);
        else setIsSendingMonthlyBulk(true);

        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/rcfe-data/send-monthly-verification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            subject: monthlySubject,
            intro: monthlyIntro,
            rows: emailRows,
            isTest: mode === 'test',
            testEmail: auth.currentUser?.email || '',
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to send monthly verification emails (HTTP ${res.status})`);
        }

        toast({
          title: mode === 'test' ? 'Monthly verification test sent' : 'Monthly verification emails sent',
          description:
            mode === 'test'
              ? `Sent test email to ${auth.currentUser?.email || 'current user'}.`
              : `Sent ${data?.sent || 0} emails${data?.failed ? ` (${data.failed} failed)` : ''}.`,
          variant: data?.failed ? 'destructive' : 'default',
        });
      } catch (error: any) {
        toast({
          title: mode === 'test' ? 'Test send failed' : 'Bulk send failed',
          description: error?.message || 'Unable to send monthly verification emails.',
          variant: 'destructive',
        });
      } finally {
        if (mode === 'test') setIsSendingMonthlyTest(false);
        else setIsSendingMonthlyBulk(false);
      }
    },
    [auth?.currentUser, monthlySubject, monthlyIntro, emailRows, toast]
  );

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
            <CardDescription>You need admin permissions to view Monthly Verification Email.</CardDescription>
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
            <Mail className="h-7 w-7 text-indigo-600" />
            Monthly Verification Email
          </h1>
          <p className="text-muted-foreground">
            Send monthly RCFE roster confirmation emails using the current RCFE Data verification state.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/tools/rcfe-data">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to RCFE Data
            </Link>
          </Button>
          <Button onClick={loadMembers} disabled={isLoadingMembers}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
            Refresh Members
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Setup</CardTitle>
          <CardDescription>Review the message and send a test or full monthly send.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{emailRows.length} RCFEs with valid recipient emails</Badge>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Input
              value={monthlySubject}
              onChange={(e) => setMonthlySubject(e.target.value)}
              placeholder="Monthly RCFE Member Verification - Month Year"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Message Intro</label>
            <Textarea
              value={monthlyIntro}
              onChange={(e) => setMonthlyIntro(e.target.value)}
              rows={4}
              placeholder="Intro message before roster table..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => sendMonthlyVerificationEmails('test')}
              disabled={isSendingMonthlyTest}
            >
              {isSendingMonthlyTest ? 'Sending Test...' : 'Send Test to Me'}
            </Button>
            <Button
              onClick={() => sendMonthlyVerificationEmails('bulk')}
              disabled={isSendingMonthlyBulk}
            >
              {isSendingMonthlyBulk ? 'Sending Bulk...' : 'Send Monthly Bulk Email'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
