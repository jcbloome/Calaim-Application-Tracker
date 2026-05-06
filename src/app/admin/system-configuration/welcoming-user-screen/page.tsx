'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, Mail, Save, Send } from 'lucide-react';
import Link from 'next/link';

type WelcomeSettings = {
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  portalUrl: string;
  portalHintWord: string;
  loginRoleLabel: string;
  rcfeInstruction: string;
  footerText: string;
  fromName: string;
  fromEmail: string;
};

type PreviewPayload = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

const INITIAL_SETTINGS: WelcomeSettings = {
  enabled: true,
  subjectTemplate: '',
  bodyTemplate: '',
  portalUrl: '',
  portalHintWord: '',
  loginRoleLabel: '',
  rcfeInstruction: '',
  footerText: '',
  fromName: '',
  fromEmail: '',
};

export default function WelcomingUserScreenPage() {
  const { isLoading: isAdminLoading, isSuperAdmin } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [settings, setSettings] = useState<WelcomeSettings>(INITIAL_SETTINGS);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [testEmail, setTestEmail] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      if (!auth?.currentUser) return;
      setIsLoading(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/welcoming-user-email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, action: 'get' }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || 'Failed to load welcoming user settings'));
      setSettings((data.settings as WelcomeSettings) || INITIAL_SETTINGS);
      setPreview((data.preview as PreviewPayload) || null);
      setTestEmail(auth.currentUser.email || '');
    } catch (error: unknown) {
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Could not load welcome email settings.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [auth?.currentUser, toast]);

  const saveSettings = async () => {
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in');
      setIsSaving(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/welcoming-user-email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'set',
          ...settings,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || 'Failed to save welcome email settings'));
      setSettings((data.settings as WelcomeSettings) || settings);
      setPreview((data.preview as PreviewPayload) || preview);
      toast({
        title: 'Saved',
        description: 'Welcoming user email settings updated.',
      });
    } catch (error: unknown) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save welcome email settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestEmail = async () => {
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in');
      setIsSendingTest(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/welcoming-user-email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'send_test_email',
          toEmail: testEmail,
          settings,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || 'Failed to send test email'));
      setPreview((data.preview as PreviewPayload) || preview);
      toast({
        title: 'Test sent',
        description: `Welcome preview sent to ${String(data?.sentTo || testEmail)}`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Test email failed',
        description: error instanceof Error ? error.message : 'Could not send test email.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  useEffect(() => {
    if (!auth?.currentUser?.uid) return;
    void loadSettings();
  }, [auth?.currentUser?.uid, loadSettings]);

  if (isAdminLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You need super admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcoming User Screen</h1>
          <p className="text-sm text-muted-foreground">
            Configure the auto welcome email sent when Account Activation is checked in user registration.
          </p>
        </div>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/admin/system-configuration">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to System Configuration
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Welcome Email Settings
          </CardTitle>
          <CardDescription>
            Available placeholders: {'{{firstName}}'}, {'{{fullName}}'}, {'{{email}}'}, {'{{portalUrl}}'}, {'{{portalHintWord}}'}, {'{{loginRoleLabel}}'}, {'{{rcfeInstruction}}'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3 bg-slate-50">
            <div>
              <div className="text-sm font-medium">Automatic sending</div>
              <div className="text-xs text-muted-foreground">Turn this off to disable auto-send from webhook.</div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(next) => setSettings((prev) => ({ ...prev, enabled: Boolean(next) }))}
              disabled={isLoading || isSaving}
            />
          </div>

          <Input
            value={settings.subjectTemplate}
            onChange={(e) => setSettings((prev) => ({ ...prev, subjectTemplate: e.target.value }))}
            placeholder="Subject template"
            disabled={isLoading}
          />
          <Textarea
            value={settings.bodyTemplate}
            onChange={(e) => setSettings((prev) => ({ ...prev, bodyTemplate: e.target.value }))}
            rows={12}
            placeholder="Body template"
            disabled={isLoading}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              value={settings.portalUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, portalUrl: e.target.value }))}
              placeholder="Portal URL"
              disabled={isLoading}
            />
            <Input
              value={settings.portalHintWord}
              onChange={(e) => setSettings((prev) => ({ ...prev, portalHintWord: e.target.value }))}
              placeholder='Portal hint word (e.g., "bluesky")'
              disabled={isLoading}
            />
            <Input
              value={settings.loginRoleLabel}
              onChange={(e) => setSettings((prev) => ({ ...prev, loginRoleLabel: e.target.value }))}
              placeholder="Login role label"
              disabled={isLoading}
            />
            <Input
              value={settings.fromName}
              onChange={(e) => setSettings((prev) => ({ ...prev, fromName: e.target.value }))}
              placeholder="From name"
              disabled={isLoading}
            />
            <Input
              value={settings.fromEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, fromEmail: e.target.value }))}
              placeholder="From email"
              disabled={isLoading}
            />
            <Input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Test email recipient"
              disabled={isLoading}
            />
          </div>

          <Textarea
            value={settings.rcfeInstruction}
            onChange={(e) => setSettings((prev) => ({ ...prev, rcfeInstruction: e.target.value }))}
            rows={3}
            placeholder="RCFE specific instruction line"
            disabled={isLoading}
          />
          <Textarea
            value={settings.footerText}
            onChange={(e) => setSettings((prev) => ({ ...prev, footerText: e.target.value }))}
            rows={2}
            placeholder="Footer text"
            disabled={isLoading}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void saveSettings()} disabled={isSaving || isLoading} className="w-full sm:w-auto">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Settings
            </Button>
            <Button
              variant="outline"
              onClick={() => void sendTestEmail()}
              disabled={isSendingTest || isLoading}
              className="w-full sm:w-auto"
            >
              {isSendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Test Email
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
          <CardDescription>Preview uses sample user data and your current saved template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading preview...</div>
          ) : (
            <>
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Subject</div>
                <div className="font-medium">{preview?.subject || 'No preview available'}</div>
              </div>
              <div className="rounded-md border p-3 bg-white">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Rendered Email</div>
                <div
                  className="max-h-[420px] overflow-auto rounded border bg-slate-50 p-3"
                  dangerouslySetInnerHTML={{ __html: preview?.htmlBody || '<p>No preview available.</p>' }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
