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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

type PlanType = 'health_net' | 'kaiser' | 'other';

type DailyFollowupStatus = {
  rcfeKey: string;
  rcfeName?: string;
  lastDailyFollowupSentAt?: string | null;
  lastDailyFollowupSentBy?: string | null;
};

type EmailMode = 'test' | 'bulk' | 'daily_followup';

type EmailSendLogEntry = {
  id: string;
  rcfeKey?: string | null;
  rcfeName: string;
  adminName?: string | null;
  adminEmail?: string | null;
  emailMode: 'bulk' | 'daily_followup' | 'test' | string;
  sentAt?: string | null;
  sentBy?: string | null;
  isTest?: boolean;
  success?: boolean;
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
const getPlanType = (member: Member): PlanType => {
  const plan = String(member?.CalAIM_MCO || '').trim().toLowerCase();
  if (plan.includes('health') && plan.includes('net')) return 'health_net';
  if (plan.includes('kaiser')) return 'kaiser';
  return 'other';
};
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
    `RCFE Member Eligibility Check (Health Net) - ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
  );
  const [monthlyIntro, setMonthlyIntro] = useState(
    'Hello RCFE Administrator,\n\nPlease review this Health Net member list and reply to confirm who is still at your RCFE and who is not there. Please include any corrections.'
  );
  const [kaiserDraftSubject, setKaiserDraftSubject] = useState(
    `RCFE Member Eligibility Check (Kaiser) - ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
  );
  const [kaiserDraftIntro, setKaiserDraftIntro] = useState(
    'Hello RCFE Administrator,\n\nPlease review this Kaiser member list and reply to confirm who is still at your RCFE and who is not there. Please include any corrections.'
  );
  const [isSendingMonthlyTest, setIsSendingMonthlyTest] = useState(false);
  const [isSendingMonthlyBulk, setIsSendingMonthlyBulk] = useState(false);
  const [isSendingDailyFollowup, setIsSendingDailyFollowup] = useState(false);
  const [dailyFollowupStatusByKey, setDailyFollowupStatusByKey] = useState<Record<string, DailyFollowupStatus>>({});
  const [dailyFollowupFilter, setDailyFollowupFilter] = useState<'all' | 'not_yet_sent_or_new' | 'already_sent'>('not_yet_sent_or_new');
  const [emailSentLog, setEmailSentLog] = useState<EmailSendLogEntry[]>([]);
  const [isSendConfirmOpen, setIsSendConfirmOpen] = useState(false);
  const [pendingSendMode, setPendingSendMode] = useState<EmailMode | null>(null);
  const [pendingSendRows, setPendingSendRows] = useState<
    Array<{
      rcfeKey: string;
      rcfeName: string;
      adminName: string;
      adminEmail: string;
      members: Array<{
        id: string;
        name: string;
        planType: PlanType;
        status: string;
        lastVerifiedAt: string;
        extraDetails: string;
      }>;
    }>
  >([]);

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

  const loadDailyFollowupStatus = useCallback(async () => {
    if (!auth?.currentUser) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/rcfe-data/send-monthly-verification', {
        method: 'GET',
        headers: { authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({} as any))) as any;
      if (!res.ok || !data?.success) return;
      const statuses = Array.isArray(data?.statuses) ? data.statuses : [];
      const sentLog = Array.isArray(data?.sentLog) ? data.sentLog : [];
      const next: Record<string, DailyFollowupStatus> = {};
      statuses.forEach((row: any) => {
        const key = String(row?.rcfeKey || '').trim();
        if (!key) return;
        next[key] = {
          rcfeKey: key,
          rcfeName: String(row?.rcfeName || '').trim() || undefined,
          lastDailyFollowupSentAt: String(row?.lastDailyFollowupSentAt || '').trim() || null,
          lastDailyFollowupSentBy: String(row?.lastDailyFollowupSentBy || '').trim() || null,
        };
      });
      setDailyFollowupStatusByKey(next);
      setEmailSentLog(
        sentLog.map((row: any) => ({
          id: String(row?.id || '').trim() || `${String(row?.rcfeName || 'unknown')}-${Math.random()}`,
          rcfeKey: String(row?.rcfeKey || '').trim() || null,
          rcfeName: String(row?.rcfeName || '').trim() || 'Unknown RCFE',
          adminName: String(row?.adminName || '').trim() || null,
          adminEmail: String(row?.adminEmail || '').trim() || null,
          emailMode: String(row?.emailMode || 'bulk').trim(),
          sentAt: String(row?.sentAt || '').trim() || null,
          sentBy: String(row?.sentBy || '').trim() || null,
          isTest: Boolean(row?.isTest),
          success: Boolean(row?.success),
        }))
      );
    } catch {
      // best effort only
    }
  }, [auth?.currentUser]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadDailyFollowupStatus();
  }, [loadDailyFollowupStatus]);

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
        rcfeKey: string;
        rcfeName: string;
        adminName: string;
        adminEmail: string;
        members: Array<{
          id: string;
          name: string;
          planType: PlanType;
          status: string;
          lastVerifiedAt: string;
          extraDetails: string;
        }>;
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
        rcfeKey: key,
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
          planType: getPlanType(member),
          status: memberPresenceStatus[memberId] || 'unknown',
          lastVerifiedAt: memberVerifiedAt[memberId] || '',
          extraDetails: memberExtraDetails[memberId] || '',
        });
      }
      grouped.set(key, row);
    });

    return Array.from(grouped.values()).filter((row) => row.adminEmail.includes('@') && row.members.length > 0);
  }, [members, memberPresenceStatus, memberExtraDetails, memberVerifiedAt, rcfeFieldOverrides]);

  const healthNetEmailRows = useMemo(
    () =>
      emailRows
        .map((row) => ({
          ...row,
          members: row.members.filter((member: any) => member.planType === 'health_net'),
        }))
        .filter((row) => row.members.length > 0),
    [emailRows]
  );
  const kaiserEligibleRowsCount = useMemo(
    () => emailRows.filter((row) => row.members.some((member: any) => member.planType === 'kaiser')).length,
    [emailRows]
  );
  const kaiserDraftRows = useMemo(
    () =>
      emailRows
        .map((row) => ({
          ...row,
          members: row.members.filter((member: any) => member.planType === 'kaiser'),
        }))
        .filter((row) => row.members.length > 0),
    [emailRows]
  );
  const kaiserDraftMemberCount = useMemo(
    () => kaiserDraftRows.reduce((sum, row) => sum + row.members.length, 0),
    [kaiserDraftRows]
  );
  const formatPreviewStatus = (status: string) => {
    if (status === 'there') return 'Confirmed There';
    if (status === 'not_there') return 'Told Not There';
    return 'Unverified';
  };
  const kaiserDraftPreview = useMemo(() => {
    if (!kaiserDraftRows.length) return '';
    const sample = kaiserDraftRows[0];
    const lines = sample.members
      .slice(0, 10)
      .map((member) => `- ${member.name} (${member.id}) | ${formatPreviewStatus(member.status)}`)
      .join('\n');
    return [
      `To: ${sample.adminEmail}`,
      `Admin: ${sample.adminName || 'Unknown'}`,
      `RCFE: ${sample.rcfeName}`,
      `Subject: ${kaiserDraftSubject}`,
      '',
      kaiserDraftIntro,
      '',
      `Kaiser Members (${sample.members.length})`,
      lines,
      sample.members.length > 10 ? '- ...more members...' : '',
      '',
      'Sending is disabled until Kaiser workflow is finalized.',
    ]
      .filter(Boolean)
      .join('\n');
  }, [kaiserDraftRows, kaiserDraftSubject, kaiserDraftIntro]);

  const dailyFollowupRows = useMemo(
    () => healthNetEmailRows.filter((row) => row.members.some((member: any) => member.status === 'not_there')),
    [healthNetEmailRows]
  );
  const filteredDailyFollowupRows = useMemo(() => {
    const getLatestVerificationMs = (row: any) =>
      row.members.reduce((max: number, member: any) => {
        if (member.status !== 'there' && member.status !== 'not_there') return max;
        const ms = new Date(String(member.lastVerifiedAt || '')).getTime();
        return Number.isFinite(ms) ? Math.max(max, ms) : max;
      }, 0);

    return dailyFollowupRows.filter((row: any) => {
      const status = dailyFollowupStatusByKey[String(row.rcfeKey || '').trim()];
      const sentMs = status?.lastDailyFollowupSentAt ? new Date(status.lastDailyFollowupSentAt).getTime() : 0;
      const latestVerificationMs = getLatestVerificationMs(row);
      const notYetSentOrNew = !sentMs || (latestVerificationMs > 0 && latestVerificationMs > sentMs);
      if (dailyFollowupFilter === 'all') return true;
      if (dailyFollowupFilter === 'already_sent') return !notYetSentOrNew;
      return notYetSentOrNew;
    });
  }, [dailyFollowupRows, dailyFollowupStatusByKey, dailyFollowupFilter]);

  const getRowsForMode = useCallback(
    (mode: EmailMode) => (mode === 'daily_followup' ? filteredDailyFollowupRows : healthNetEmailRows),
    [healthNetEmailRows, filteredDailyFollowupRows]
  );

  const sampleEmailPreview = useMemo(() => {
    if (!pendingSendRows.length || !pendingSendMode) return '';
    const row = pendingSendRows[0];
    const timestamp = new Date().toLocaleString();
    const subjectPrefix = pendingSendMode === 'daily_followup' ? `[Daily Follow-up ${timestamp}] ` : '';
    const verifiedThere = row.members.filter((member) => member.status === 'there');
    const notThere = row.members.filter((member) => member.status === 'not_there');
    const unverified = row.members.filter((member) => member.status !== 'there' && member.status !== 'not_there');
    const toLines = (label: string, items: typeof row.members) =>
      `${label} (${items.length})\n${items
        .slice(0, 8)
        .map((member) => `- ${member.name} (${member.id}) | ${formatPreviewStatus(member.status)}`)
        .join('\n')}${items.length > 8 ? '\n- ...more members...' : ''}`;
    return [
      `To: ${row.adminEmail}`,
      `Admin: ${row.adminName || 'Unknown'}`,
      `RCFE: ${row.rcfeName}`,
      `Subject: ${subjectPrefix}${monthlySubject}`,
      '',
      monthlyIntro,
      '',
      toLines('Members Verified at RCFE', verifiedThere),
      '',
      toLines('Residents Not at RCFE', notThere),
      '',
      toLines('Members Pending Verification', unverified),
      '',
      'Please reply to confirm all member statuses.',
    ].join('\n');
  }, [pendingSendRows, pendingSendMode, monthlySubject, monthlyIntro]);

  const openSendConfirmation = useCallback(
    (mode: EmailMode) => {
      if (!monthlySubject.trim() || !monthlyIntro.trim()) {
        toast({
          title: 'Missing required fields',
          description: 'Subject and intro are required.',
          variant: 'destructive',
        });
        return;
      }
      const rows = getRowsForMode(mode);
      if (rows.length === 0) {
        toast({
          title: 'No recipients',
          description:
            mode === 'daily_followup'
              ? 'No RCFEs match the daily follow-up filter.'
              : 'No RCFE rows with valid admin emails and members were found.',
          variant: 'destructive',
        });
        return;
      }
      setPendingSendMode(mode);
      setPendingSendRows(rows);
      setIsSendConfirmOpen(true);
    },
    [monthlySubject, monthlyIntro, getRowsForMode, toast]
  );

  const sendMonthlyVerificationEmails = useCallback(
    async (mode: EmailMode) => {
      try {
        if (!auth?.currentUser) throw new Error('You must be signed in to send emails.');
        const targetRows = getRowsForMode(mode);
        if (targetRows.length === 0) {
          throw new Error(
            mode === 'daily_followup'
              ? 'No RCFEs match the daily follow-up filter.'
              : 'No RCFE rows with valid admin emails and members were found.'
          );
        }

        if (mode === 'test') setIsSendingMonthlyTest(true);
        else if (mode === 'bulk') setIsSendingMonthlyBulk(true);
        else setIsSendingDailyFollowup(true);

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
            rows: targetRows,
            isTest: mode === 'test',
            testEmail: auth.currentUser?.email || '',
            emailMode: mode,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to send monthly verification emails (HTTP ${res.status})`);
        }

        toast({
          title:
            mode === 'test'
              ? 'Monthly verification test sent'
              : mode === 'daily_followup'
                ? 'Daily follow-up emails sent'
                : 'Monthly verification emails sent',
          description:
            mode === 'test'
              ? `Sent test email to ${auth.currentUser?.email || 'current user'}.`
              : `Sent ${data?.sent || 0} emails${data?.failed ? ` (${data.failed} failed)` : ''}.`,
          variant: data?.failed ? 'destructive' : 'default',
        });
        if (mode === 'daily_followup') {
          await loadDailyFollowupStatus();
        } else if (mode === 'bulk') {
          await loadDailyFollowupStatus();
        }
      } catch (error: any) {
        toast({
          title:
            mode === 'test'
              ? 'Test send failed'
              : mode === 'daily_followup'
                ? 'Daily follow-up send failed'
                : 'Bulk send failed',
          description: error?.message || 'Unable to send monthly verification emails.',
          variant: 'destructive',
        });
      } finally {
        if (mode === 'test') setIsSendingMonthlyTest(false);
        else if (mode === 'bulk') setIsSendingMonthlyBulk(false);
        else setIsSendingDailyFollowup(false);
      }
    },
    [auth?.currentUser, monthlySubject, monthlyIntro, getRowsForMode, toast, loadDailyFollowupStatus]
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
            Send RCFE eligibility verification emails for Health Net members only. Kaiser workflow will be configured separately.
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
          <CardDescription>Review the message and send test, monthly, or daily Health Net follow-up emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{emailRows.length} RCFEs with valid recipient emails</Badge>
            <Badge variant="outline">{healthNetEmailRows.length} Health Net RCFEs ready for email</Badge>
            <Badge variant="outline">{dailyFollowupRows.length} Health Net RCFEs with "not there" members</Badge>
            <Badge variant="secondary">Kaiser RCFEs pending separate workflow: {kaiserEligibleRowsCount}</Badge>
            <Select
              value={dailyFollowupFilter}
              onValueChange={(value) =>
                setDailyFollowupFilter(value as 'all' | 'not_yet_sent_or_new' | 'already_sent')
              }
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Daily follow-up filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_yet_sent_or_new">Daily: Not Yet Sent / Newly Verified</SelectItem>
                <SelectItem value="already_sent">Daily: Already Sent (No New Verification)</SelectItem>
                <SelectItem value="all">Daily: All with Not There</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">Daily target: {filteredDailyFollowupRows.length}</Badge>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Input
              value={monthlySubject}
              onChange={(e) => setMonthlySubject(e.target.value)}
              placeholder="RCFE Member Eligibility Check (Health Net) - Month Year"
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
              onClick={() => openSendConfirmation('bulk')}
              disabled={isSendingMonthlyBulk}
            >
              {isSendingMonthlyBulk ? 'Sending Bulk...' : 'Review + Send Monthly Bulk Email'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => openSendConfirmation('daily_followup')}
              disabled={isSendingDailyFollowup}
            >
              {isSendingDailyFollowup ? 'Sending Daily Follow-up...' : 'Review + Send Daily Not-There Follow-up'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kaiser Draft (Not Sending Yet)</CardTitle>
          <CardDescription>
            Draft-only card for Kaiser member verification messaging. Sending stays disabled until you approve Kaiser workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Kaiser draft RCFEs: {kaiserDraftRows.length}</Badge>
            <Badge variant="outline">Kaiser draft members: {kaiserDraftMemberCount}</Badge>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Kaiser Subject (Draft)</label>
            <Input
              value={kaiserDraftSubject}
              onChange={(e) => setKaiserDraftSubject(e.target.value)}
              placeholder="RCFE Member Eligibility Check (Kaiser) - Month Year"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Kaiser Message Intro (Draft)</label>
            <Textarea
              value={kaiserDraftIntro}
              onChange={(e) => setKaiserDraftIntro(e.target.value)}
              rows={4}
              placeholder="Kaiser intro message..."
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Kaiser Sample Preview (first RCFE)</p>
            <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3">
              {kaiserDraftPreview || 'No Kaiser RCFE rows are available yet.'}
            </pre>
          </div>
          <Button variant="outline" disabled>
            Send Kaiser Emails (Coming Soon)
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isSendConfirmOpen} onOpenChange={setIsSendConfirmOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Confirm {pendingSendMode === 'daily_followup' ? 'Daily Follow-up' : 'Monthly Bulk'} Email Send
            </DialogTitle>
            <DialogDescription>
              Review exactly which RCFEs will be emailed, the admin contact, and a sample email preview before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{pendingSendRows.length} RCFEs queued</Badge>
              <Badge variant="outline">Mode: {pendingSendMode === 'daily_followup' ? 'Daily Follow-up' : 'Monthly Bulk'}</Badge>
            </div>

            <div className="border rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">RCFEs to email</p>
              <div className="max-h-44 overflow-y-auto space-y-1 text-sm">
                {pendingSendRows.map((row) => (
                  <div key={`${row.rcfeKey}-${row.adminEmail}`} className="flex flex-col border-b pb-1 last:border-b-0">
                    <span className="font-medium">{row.rcfeName}</span>
                    <span className="text-muted-foreground">
                      Admin: {row.adminName || 'Unknown'} | {row.adminEmail} | Members: {row.members.length}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">Sample email preview (first RCFE)</p>
              <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3">{sampleEmailPreview || 'No preview available.'}</pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSendConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={pendingSendMode === 'daily_followup' ? 'destructive' : 'default'}
              onClick={async () => {
                if (!pendingSendMode) return;
                setIsSendConfirmOpen(false);
                await sendMonthlyVerificationEmails(pendingSendMode);
              }}
              disabled={isSendingMonthlyBulk || isSendingDailyFollowup}
            >
              {pendingSendMode === 'daily_followup' ? 'Confirm + Send Daily Follow-up' : 'Confirm + Send Monthly Bulk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Email Sent Log</CardTitle>
          <CardDescription>Track RCFEs already emailed and sent dates.</CardDescription>
        </CardHeader>
        <CardContent>
          {emailSentLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No email sends logged yet.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto space-y-2">
              {emailSentLog.map((entry) => (
                <div key={entry.id} className="border rounded-md p-3 text-sm">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-medium">{entry.rcfeName}</span>
                    <Badge variant="outline">{entry.emailMode === 'daily_followup' ? 'Daily Follow-up' : entry.isTest ? 'Test' : 'Monthly Bulk'}</Badge>
                    <Badge variant={entry.success ? 'default' : 'destructive'}>{entry.success ? 'Sent' : 'Failed'}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Admin: {entry.adminName || 'Unknown'} {entry.adminEmail ? `| ${entry.adminEmail}` : ''}
                  </p>
                  <p className="text-muted-foreground">
                    Sent: {entry.sentAt ? new Date(entry.sentAt).toLocaleString() : 'Unknown'} {entry.sentBy ? `| By: ${entry.sentBy}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
