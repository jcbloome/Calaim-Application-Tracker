'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2, Mail, RefreshCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

type PreviewResponse = {
  success: boolean;
  draft?: {
    to?: string;
    cc?: string;
    subject?: string;
    message?: string;
  };
  missingDocuments?: string[];
  portalLinks?: {
    loginUrl?: string;
    signupUrl?: string;
    inviteUrl?: string;
  };
  acknowledgement?: {
    lastSentAtIso?: string | null;
    lastSentTo?: string | null;
  };
  sendHistory?: Array<{
    sentAtIso?: string | null;
    to?: string | null;
    sentByName?: string | null;
    sentByEmail?: string | null;
  }>;
  sender?: {
    from?: string;
    warning?: string;
    usesFallbackFrom?: boolean;
  };
  error?: string;
};

export default function EmailPrimaryContactPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { toast } = useToast();

  const applicationId = String(params?.applicationId || '').trim();
  const appUserId = String(searchParams.get('userId') || '').trim();
  const backHref = `/admin/applications/${encodeURIComponent(applicationId)}${appUserId ? `?userId=${encodeURIComponent(appUserId)}` : ''}`;

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [defaultSubject, setDefaultSubject] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');
  const [senderFromLabel, setSenderFromLabel] = useState('');
  const [senderWarning, setSenderWarning] = useState('');
  const [senderUsesFallbackFrom, setSenderUsesFallbackFrom] = useState(false);
  const [lastSentAtIso, setLastSentAtIso] = useState('');
  const [lastSentTo, setLastSentTo] = useState('');
  const [sendHistory, setSendHistory] = useState<
    Array<{ sentAtIso: string; to: string; sentByName: string; sentByEmail: string }>
  >([]);
  const [missingDocuments, setMissingDocuments] = useState<string[]>([]);
  const [portalLinks, setPortalLinks] = useState<{ loginUrl: string; signupUrl: string; inviteUrl: string }>({
    loginUrl: '',
    signupUrl: '',
    inviteUrl: '',
  });

  const hasEmailContent = useMemo(() => {
    return Boolean(to.trim() && subject.trim() && message.trim());
  }, [to, subject, message]);
  const lastSentLabel = useMemo(() => {
    const raw = String(lastSentAtIso || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
  }, [lastSentAtIso]);

  const applyTemplate = (template: 'default' | 'reminder' | 'concise') => {
    if (template === 'default') {
      setSubject(defaultSubject || subject);
      setMessage(defaultMessage || message);
      return;
    }

    const lines = (defaultMessage || message || '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const helloLine = lines.find((line) => line.toLowerCase().startsWith('hello ')) || 'Hello,';
    const supportLine =
      lines.find((line) => line.toLowerCase().includes('for any questions, please contact')) ||
      'For any questions, reply to this email.';

    const docsLines =
      missingDocuments.length > 0
        ? missingDocuments.map((item) => `- ${item}`)
        : ['- Please upload each document marked Pending in your portal checklist.'];
    const reminderMessage = [
      helloLine,
      '',
      'This is a quick reminder to complete the pending CalAIM application items.',
      '',
      'Required documents to upload:',
      ...docsLines,
      '',
      'Quick links:',
      `- Log in: ${portalLinks.loginUrl || ''}`,
      `- Create your portal account (if needed): ${portalLinks.signupUrl || ''}`,
      `- Connect application: ${portalLinks.inviteUrl || ''}`,
      '',
      supportLine,
      '',
      'Thank you,',
      'Connections Care Home Consultants',
    ]
      .filter((line) => line !== '')
      .join('\n');

    const conciseMessage = [
      helloLine,
      '',
      'Please sign in and upload the required documents for this CalAIM application.',
      '',
      'Required documents:',
      ...docsLines,
      '',
      `Portal: ${portalLinks.loginUrl || ''}`,
      `Connect application: ${portalLinks.inviteUrl || ''}`,
      '',
      'Thank you.',
    ]
      .filter((line) => line !== '')
      .join('\n');

    if (template === 'reminder') {
      setSubject(
        defaultSubject
          ? `Reminder: ${defaultSubject.replace(/^Reminder:\s*/i, '').trim()}`
          : 'Reminder: CalAIM portal action needed'
      );
      setMessage(reminderMessage);
      return;
    }

    setSubject(defaultSubject ? `Quick action needed: ${defaultSubject.replace(/^Reminder:\s*/i, '').trim()}` : 'CalAIM documents needed');
    setMessage(conciseMessage);
  };

  const loadPreview = async () => {
    if (!applicationId) return;
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please refresh and try again.', variant: 'destructive' });
      return;
    }
    setIsLoadingPreview(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/send-introductory-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          ...(appUserId ? { userId: appUserId } : {}),
          mode: 'preview',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PreviewResponse;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load email preview.');
      }
      setTo(String(data?.draft?.to || '').trim());
      setCc(String(data?.draft?.cc || '').trim());
      const nextSubject = String(data?.draft?.subject || '').trim();
      const nextMessage = String(data?.draft?.message || '').trim();
      setSubject(nextSubject);
      setMessage(nextMessage);
      setDefaultSubject(nextSubject);
      setDefaultMessage(nextMessage);
      setSenderFromLabel(String(data?.sender?.from || '').trim());
      setSenderWarning(String(data?.sender?.warning || '').trim());
      setSenderUsesFallbackFrom(Boolean(data?.sender?.usesFallbackFrom));
      setLastSentAtIso(String(data?.acknowledgement?.lastSentAtIso || '').trim());
      setLastSentTo(String(data?.acknowledgement?.lastSentTo || '').trim());
      setSendHistory(
        (Array.isArray(data?.sendHistory) ? data.sendHistory : [])
          .map((item) => ({
            sentAtIso: String(item?.sentAtIso || '').trim(),
            to: String(item?.to || '').trim(),
            sentByName: String(item?.sentByName || '').trim(),
            sentByEmail: String(item?.sentByEmail || '').trim(),
          }))
          .filter((item) => Boolean(item.sentAtIso))
      );
      setMissingDocuments(Array.isArray(data?.missingDocuments) ? data.missingDocuments.filter(Boolean) : []);
      setPortalLinks({
        loginUrl: String(data?.portalLinks?.loginUrl || '').trim(),
        signupUrl: String(data?.portalLinks?.signupUrl || '').trim(),
        inviteUrl: String(data?.portalLinks?.inviteUrl || '').trim(),
      });
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: String(error?.message || 'Unable to load email preview.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const sendEmail = async () => {
    if (!applicationId) return;
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please refresh and try again.', variant: 'destructive' });
      return;
    }
    if (!hasEmailContent) {
      toast({
        title: 'Missing email content',
        description: 'Recipient, subject, and message are required before sending.',
        variant: 'destructive',
      });
      return;
    }
    setIsSending(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/send-introductory-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          ...(appUserId ? { userId: appUserId } : {}),
          mode: 'send',
          to: String(to || '').trim(),
          cc: String(cc || '').trim(),
          subject: String(subject || '').trim(),
          message: String(message || '').trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        sentAtIso?: string;
        sentTo?: string;
      };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send email.');
      }
      setLastSentAtIso(String(data?.sentAtIso || new Date().toISOString()).trim());
      setLastSentTo(String(data?.sentTo || to || '').trim());
      await loadPreview();
      toast({
        title: 'Email sent',
        description: `Primary contact email sent to ${String(to || '').trim()}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Send failed',
        description: String(error?.message || 'Unable to send email.'),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!applicationId || !user) return;
    void loadPreview();
  }, [applicationId, appUserId, user?.uid]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Application
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void loadPreview()} disabled={isLoadingPreview || isSending}>
            {isLoadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh Preview
          </Button>
          <Button type="button" onClick={() => void sendEmail()} disabled={!hasEmailContent || isLoadingPreview || isSending}>
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send Email
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Primary Contact
          </CardTitle>
          <CardDescription>
            Dedicated email page with required docs and quick links for easier review and scrolling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastSentLabel ? (
            <Alert className="border-green-200 bg-green-50 text-green-900">
              <AlertTitle>Email sent successfully</AlertTitle>
              <AlertDescription>
                Sent at <span className="font-medium">{lastSentLabel}</span>
                {lastSentTo ? (
                  <>
                    {' '}to <span className="font-medium">{lastSentTo}</span>
                  </>
                ) : null}
                .
              </AlertDescription>
            </Alert>
          ) : null}
          {sendHistory.length > 0 ? (
            <div className="rounded-md border p-3">
              <div className="text-sm font-semibold">Email send history</div>
              <div className="mt-2 space-y-1.5 text-xs">
                {sendHistory.map((item) => {
                  const sentAt = new Date(item.sentAtIso);
                  const sentAtLabel = Number.isNaN(sentAt.getTime()) ? item.sentAtIso : sentAt.toLocaleString();
                  return (
                    <div key={`${item.sentAtIso}-${item.to}`} className="rounded border bg-muted/20 px-2 py-1.5">
                      <div>
                        <span className="font-medium">Sent:</span> {sentAtLabel}
                      </div>
                      <div>
                        <span className="font-medium">To:</span> {item.to || '—'}
                      </div>
                      {(item.sentByName || item.sentByEmail) ? (
                        <div>
                          <span className="font-medium">By:</span> {item.sentByName || item.sentByEmail}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {senderFromLabel ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
              Sending as: <span className="font-medium">{senderFromLabel}</span>
            </div>
          ) : null}
          {senderWarning ? (
            <Alert variant={senderUsesFallbackFrom ? 'warning' : 'default'}>
              <AlertTitle>Sender fallback notice</AlertTitle>
              <AlertDescription>{senderWarning}</AlertDescription>
            </Alert>
          ) : null}

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-semibold text-amber-900">Required Documents</div>
            {missingDocuments.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                {missingDocuments.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-amber-900">
                No pending document list returned. Confirm checklist status on the application page before sending.
              </p>
            )}
          </div>

          <div className="rounded-md border p-3">
            <div className="text-sm font-semibold">Friendly Links</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {portalLinks.loginUrl ? (
                <Button asChild variant="default" size="sm">
                  <a href={portalLinks.loginUrl} target="_blank" rel="noopener noreferrer">
                    Open Portal
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </a>
                </Button>
              ) : null}
              {portalLinks.signupUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={portalLinks.signupUrl} target="_blank" rel="noopener noreferrer">
                    Create Account
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </a>
                </Button>
              ) : null}
              {portalLinks.inviteUrl ? (
                <Button asChild variant="secondary" size="sm">
                  <a href={portalLinks.inviteUrl} target="_blank" rel="noopener noreferrer">
                    Connect App
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-semibold">Preformatted Options</div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => applyTemplate('default')} disabled={isLoadingPreview || isSending}>
                Default Draft
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyTemplate('reminder')} disabled={isLoadingPreview || isSending}>
                Reminder Version
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyTemplate('concise')} disabled={isLoadingPreview || isSending}>
                Concise Version
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Start with the default draft from workflow data, then switch to reminder/concise wording when needed.
            </p>
          </div>

          <div className="space-y-2">
            <Label>To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="contact@example.com" />
          </div>
          <div className="space-y-2">
            <Label>CC (Staff)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="staff@carehomefinders.com" />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={20} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
