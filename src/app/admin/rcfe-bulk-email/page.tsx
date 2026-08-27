'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Send, TestTube2, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';

interface RcfeRegistration {
  [key: string]: any;
}

type RecipientListMode = 'all' | 'health_net';

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const isHealthNetMember = (member: Record<string, unknown>) => {
  const plan = String(member?.CalAIM_MCO || '').trim().toLowerCase();
  return plan.includes('health') && plan.includes('net');
};

const isAuthorizedMember = (member: Record<string, unknown>) => {
  const status = String(member?.CalAIM_Status || '').trim().toLowerCase();
  if (!status) return false;
  return status === 'authorized' || status.startsWith('authorized ');
};

const hasAssignedRcfe = (member: Record<string, unknown>) => {
  const rcfeName = String(normalizeRcfeNameForAssignment(member?.RCFE_Name || '') || '')
    .trim()
    .toLowerCase();
  const rcfeAddress = String(member?.RCFE_Address || '').trim();
  if (rcfeAddress) return true;
  if (!rcfeName) return false;
  if (rcfeName.includes('calaim_use') || rcfeName.includes('calaim use')) return false;
  if (rcfeName === 'unknown' || rcfeName === 'unassigned') return false;
  return true;
};

const getFieldValue = (record: RcfeRegistration, keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }

  const recordKeys = Object.keys(record);
  for (const key of keys) {
    const match = recordKeys.find((recordKey) => recordKey.toLowerCase() === key.toLowerCase());
    if (match && record[match] !== undefined && record[match] !== null && record[match] !== '') {
      return record[match];
    }
  }

  return 'N/A';
};

const extractRegistrationEmail = (record: RcfeRegistration) => {
  const raw = getFieldValue(record, ['RCFE_Registered_User_Email', 'RCFE_Registered_UserEmail', 'Email']);
  if (typeof raw !== 'string' || !raw.includes('@')) return '';
  return raw.trim().toLowerCase();
};

const getRegistrationRcfeIds = (record: RcfeRegistration) => {
  const ids = [
    getFieldValue(record, ['RCFE_Registered_ID', 'User_Registered_For_RCFE_ID', 'RCFE_ID', 'RCFE_ID2']),
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== 'N/A');
  return ids;
};

const getRegistrationNameToken = (record: RcfeRegistration) =>
  normalizeLookupToken(getFieldValue(record, ['RCFE_Name', 'RCFE Name', 'RCFE']));

export default function RcfeBulkEmailPage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const router = useRouter();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<RcfeRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedRegistrations, setHasLoadedRegistrations] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [copiedRecipients, setCopiedRecipients] = useState(false);
  const [recipientListMode, setRecipientListMode] = useState<RecipientListMode | null>(null);
  const [isBuildingHealthNetList, setIsBuildingHealthNetList] = useState(false);

  const recipientListText = recipients.join(', ');
  const recipientListLabel =
    recipientListMode === 'health_net'
      ? 'Health Net RCFEs with authorized CalAIM members'
      : recipientListMode === 'all'
        ? 'All registered RCFEs'
        : '';

  useEffect(() => {
    if (!isAdminLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isSuperAdmin, isAdminLoading, router]);

  const loadRegistrations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/rcfe-registrations');
      const data = await response.json();
      if (data.success) {
        setRegistrations(data.records || []);
        setHasLoadedRegistrations(true);
      } else {
        throw new Error(data.error || 'Failed to load registrations');
      }
    } catch (error: any) {
      toast({
        title: 'Load Failed',
        description: error.message || 'Unable to load RCFE registrations',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadHealthNetRcfeKeys = async () => {
    const response = await fetch('/api/all-members');
    const data = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || data?.details || `Member fetch failed (HTTP ${response.status})`);
    }

    const members = (Array.isArray(data.members) ? data.members : []) as Record<string, unknown>[];
    const registeredIds = new Set<string>();
    const nameTokens = new Set<string>();
    let healthNetMemberCount = 0;

    members.forEach((member) => {
      if (!isHealthNetMember(member) || !isAuthorizedMember(member) || !hasAssignedRcfe(member)) return;
      healthNetMemberCount += 1;
      const rid = String(member.RCFE_Registered_ID || '').trim();
      if (rid) registeredIds.add(rid);
      const nameToken = normalizeLookupToken(normalizeRcfeNameForAssignment(member.RCFE_Name));
      if (nameToken) nameTokens.add(nameToken);
    });

    return { registeredIds, nameTokens, healthNetMemberCount };
  };

  const registrationHasHealthNetMembers = (
    record: RcfeRegistration,
    registeredIds: Set<string>,
    nameTokens: Set<string>
  ) => {
    const ids = getRegistrationRcfeIds(record);
    if (ids.some((id) => registeredIds.has(id))) return true;
    const nameToken = getRegistrationNameToken(record);
    return Boolean(nameToken && nameTokens.has(nameToken));
  };

  const applyRecipientList = (emails: string[], mode: RecipientListMode, description: string) => {
    const unique = Array.from(new Set(emails));
    setRecipients(unique);
    setRecipientListMode(mode);
    setCopiedRecipients(false);
    if (unique.length === 0) {
      toast({
        title: 'No Recipients',
        description,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Recipient list ready',
      description: `${unique.length} unique emails — ${description}`,
    });
  };

  const buildRecipients = () => {
    const emails = registrations.map(extractRegistrationEmail).filter(Boolean);
    applyRecipientList(
      emails,
      'all',
      'all registered RCFE contacts formatted for copy/paste.'
    );
  };

  const buildHealthNetRecipients = async () => {
    if (!hasLoadedRegistrations || registrations.length === 0) {
      toast({
        title: 'Load registrations first',
        description: 'Click Load RCFE Registrations before building a Health Net list.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsBuildingHealthNetList(true);
      const { registeredIds, nameTokens, healthNetMemberCount } = await loadHealthNetRcfeKeys();
      const emails = registrations
        .filter((record) => registrationHasHealthNetMembers(record, registeredIds, nameTokens))
        .map(extractRegistrationEmail)
        .filter(Boolean);

      applyRecipientList(
        emails,
        'health_net',
        `Health Net RCFEs only (${healthNetMemberCount} authorized Health Net members on file).`
      );
    } catch (error: any) {
      toast({
        title: 'Health Net list failed',
        description: error?.message || 'Could not build Health Net recipient list.',
        variant: 'destructive',
      });
    } finally {
      setIsBuildingHealthNetList(false);
    }
  };

  const copyRecipientList = async () => {
    if (!recipientListText) return;
    try {
      await navigator.clipboard.writeText(recipientListText);
      setCopiedRecipients(true);
      toast({
        title: 'Copied',
        description: `${recipients.length} emails copied — paste into Gmail To or Bcc.`,
      });
      window.setTimeout(() => setCopiedRecipients(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select the list below and copy manually (Ctrl+C).',
        variant: 'destructive',
      });
    }
  };

  const handleSendTest = async () => {
    if (!subject.trim() || !message.trim() || !testEmail.trim()) {
      toast({
        title: 'Missing Details',
        description: 'Provide a subject, message, and test email address.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsSendingTest(true);
      const response = await fetch('/api/rcfe-bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          recipients: [testEmail.trim()],
          isTest: true
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to send test email');
      }

      toast({
        title: 'Test Email Sent',
        description: `Sent to ${testEmail.trim()}.`
      });
    } catch (error: any) {
      toast({
        title: 'Test Failed',
        description: error.message || 'Unable to send test email',
        variant: 'destructive'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendBulk = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: 'Missing Details',
        description: 'Provide a subject and message before sending.',
        variant: 'destructive'
      });
      return;
    }

    if (recipients.length === 0) {
      toast({
        title: 'No Recipients',
        description: 'Load registrations and build the recipient list first.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsSendingBulk(true);
      const response = await fetch('/api/rcfe-bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          recipients
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to send bulk email');
      }

      toast({
        title: 'Bulk Email Sent',
        description: `Sent to ${data.sent} RCFE contacts.`
      });
    } catch (error: any) {
      toast({
        title: 'Send Failed',
        description: error.message || 'Unable to send bulk email',
        variant: 'destructive'
      });
    } finally {
      setIsSendingBulk(false);
    }
  };

  if (isAdminLoading || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Mail className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">RCFE Bulk Email Sender</h1>
          <p className="text-muted-foreground">
            Send messages to all registered RCFE contacts from CalAIM_tbl_New_RCFE_Registration.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message Builder</CardTitle>
          <CardDescription>
            Compose the message and send a test before bulk delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the email message..."
              rows={6}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Send test to</label>
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@carehomefinders.com"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="w-full"
              >
                {isSendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
                Send Test
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              {recipients.length} RCFE recipients selected
              {recipientListLabel ? ` · ${recipientListLabel}` : ''}
            </Badge>
                        <Button onClick={handleSendBulk} disabled={isSendingBulk} className="ml-auto">
              {isSendingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Bulk Email
            </Button>
          </div>
        </CardContent>
      </Card>

      {recipients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gmail recipient list</CardTitle>
            <CardDescription>
              Comma-separated emails for paste into Gmail To or Bcc ({recipients.length} unique
              {recipientListLabel ? ` · ${recipientListLabel}` : ''}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              readOnly
              value={recipientListText}
              rows={Math.min(12, Math.max(4, Math.ceil(recipients.length / 8)))}
              className="font-mono text-sm"
              onFocus={(e) => e.target.select()}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={copyRecipientList}>
                {copiedRecipients ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copiedRecipients ? 'Copied' : 'Copy all emails'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Tip: use Bcc in Gmail so recipients cannot see each other&apos;s addresses.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
                  <CardHeader>
          <CardTitle>Registered RCFEs</CardTitle>
          <CardDescription>
                        Load registrations on demand before viewing.
          </CardDescription>
        </CardHeader>
        <CardContent>
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <Button onClick={loadRegistrations} disabled={isLoading}>
                          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Load RCFE Registrations
                        </Button>
                        <Button
                          variant="outline"
                          onClick={buildRecipients}
                          disabled={!hasLoadedRegistrations || registrations.length === 0}
                        >
                          Build All Recipients
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void buildHealthNetRecipients()}
                          disabled={!hasLoadedRegistrations || registrations.length === 0 || isBuildingHealthNetList}
                        >
                          {isBuildingHealthNetList ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Build Health Net Recipients
                        </Button>
                        {hasLoadedRegistrations && (
                          <Badge variant="secondary">{registrations.length} records loaded</Badge>
                        )}
                      </div>

                      {!hasLoadedRegistrations ? (
                        <div className="text-sm text-muted-foreground">
                          Registrations are loaded only when requested.
                        </div>
                      ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading RCFE registrations...
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">RCFE Name</th>
                    <th className="py-2 pr-4">RCFE ID</th>
                    <th className="py-2 pr-4">Registered User</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Verification Email Sent</th>
                    <th className="py-2 pr-4">Verification Sent To</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((record, index) => {
                    const rcfeName = getFieldValue(record, ['RCFE_Name', 'RCFE Name', 'RCFE']);
                    const rcfeId = getFieldValue(record, ['User_Registered_For_RCFE_ID', 'RCFE_ID', 'RCFE_ID2']);
                    const firstName = getFieldValue(record, ['RCFE_Registered_User_First', 'Registered_User_First', 'First_Name']);
                    const lastName = getFieldValue(record, ['RCFE_Registered_User_Last', 'Registered_User_Last', 'Last_Name']);
                    const email = getFieldValue(record, ['RCFE_Registered_User_Email', 'Registered_User_Email', 'Email']);
                    const verificationSent = getFieldValue(record, ['Verification_Email_Sent', 'Verification_Email_Status', 'Verification_Status']);
                    const verificationSentTo = getFieldValue(record, ['Verification_Email_Sent_To', 'Verification_Recipient', 'Verification_Email']);

                    return (
                      <tr key={`${rcfeId}-${index}`} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">{rcfeName}</td>
                        <td className="py-2 pr-4">{rcfeId}</td>
                        <td className="py-2 pr-4">{`${firstName} ${lastName}`.trim()}</td>
                        <td className="py-2 pr-4">{email}</td>
                        <td className="py-2 pr-4">{verificationSent}</td>
                        <td className="py-2 pr-4">{verificationSentTo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
