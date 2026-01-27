'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Send, TestTube2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RcfeRegistration {
  [key: string]: any;
}

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

  const buildRecipients = () => {
    const emails = registrations
      .map((record) => getFieldValue(record, ['RCFE_Registered_User_Email', 'RCFE_Registered_UserEmail', 'Email']))
      .filter((email) => typeof email === 'string' && email.includes('@')) as string[];
    const unique = Array.from(new Set(emails));
    setRecipients(unique);
    if (unique.length === 0) {
      toast({
        title: 'No Recipients',
        description: 'No RCFE registration emails were found.',
        variant: 'destructive'
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
                        </Badge>
                        <Button onClick={handleSendBulk} disabled={isSendingBulk} className="ml-auto">
              {isSendingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Bulk Email
            </Button>
          </div>
        </CardContent>
      </Card>

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
                          Build Recipient List
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
