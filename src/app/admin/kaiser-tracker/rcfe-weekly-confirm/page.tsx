'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { getEffectiveKaiserStatus } from '../components/shared';

type RcfeRow = {
  key: string;
  rcfeName: string;
  rcfeAdminEmail: string;
  memberCount: number;
  nearestAuthorizationEndT2038: string;
};

const normalizeRcfeKey = (name: string, email: string) =>
  `${String(name || '').trim().toLowerCase()}|${String(email || '').trim().toLowerCase()}`;

const isBiweeklyFollowupStatus = (status: string) => {
  const s = String(status || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    s === 'r&b sent pending ils contract' ||
    s === 'r & b sent pending ils contract' ||
    s === 'final-member at rcfe' ||
    s === 'final- member at rcfe' ||
    s === 'final member at rcfe'
  );
};

const toDateOrNull = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isUnexpiredT2038 = (value: unknown) => {
  const date = toDateOrNull(value);
  if (!date) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return endDay >= today;
};

const formatShortDate = (value: unknown) => {
  const d = toDateOrNull(value);
  return d ? d.toLocaleDateString() : 'Not set';
};

export default function RcfeWeeklyConfirmPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [settings, setSettings] = useState<Record<string, { enabled: boolean; rcfeName: string; rcfeAdminEmail: string }>>({});
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState('');
  const [emailBodyTemplate, setEmailBodyTemplate] = useState('');
  const [cadenceDays, setCadenceDays] = useState(14);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [isSavingAutomation, setIsSavingAutomation] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rows, setRows] = useState<RcfeRow[]>([]);
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    try {
      setIsLoadingRows(true);
      const response = await fetch('/api/kaiser-members');
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to load Kaiser members');
      const members = Array.isArray(data?.members) ? data.members : [];

      const rowsByKey = new Map<string, RcfeRow>();
      for (const member of members) {
        const status = getEffectiveKaiserStatus(member);
        if (!isBiweeklyFollowupStatus(status)) continue;
        const authEnd = String((member as any)?.Authorization_End_Date_T2038 || (member as any)?.Authorization_End_T2038 || '').trim();
        if (!isUnexpiredT2038(authEnd)) continue;
        const rcfeName = String(member?.RCFE_Name || '').trim();
        const rcfeAdminEmail = String(member?.RCFE_Admin_Email || member?.RCFE_Administrator_Email || '').trim().toLowerCase();
        if (!rcfeName || !rcfeAdminEmail) continue;
        const key = normalizeRcfeKey(rcfeName, rcfeAdminEmail);
        const prev = rowsByKey.get(key);
        if (!prev) {
          rowsByKey.set(key, {
            key,
            rcfeName,
            rcfeAdminEmail,
            memberCount: 1,
            nearestAuthorizationEndT2038: authEnd,
          });
        } else {
          prev.memberCount += 1;
          const prevDate = toDateOrNull(prev.nearestAuthorizationEndT2038);
          const nextDate = toDateOrNull(authEnd);
          if (!prevDate || (nextDate && nextDate.getTime() < prevDate.getTime())) {
            prev.nearestAuthorizationEndT2038 = authEnd;
          }
          rowsByKey.set(key, prev);
        }
      }

      setRows(
        Array.from(rowsByKey.values()).sort(
          (a, b) => a.rcfeName.localeCompare(b.rcfeName) || a.rcfeAdminEmail.localeCompare(b.rcfeAdminEmail)
        )
      );
    } catch (error: any) {
      toast({
        title: 'Load failed',
        description: error?.message || 'Could not load RCFE rows.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingRows(false);
    }
  };

  const loadSettings = async () => {
    try {
      if (!auth?.currentUser) return;
      setIsLoadingSettings(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-rcfe-weekly-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, action: 'get' }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load settings');

      const entries = (data?.entries || {}) as Record<string, any>;
      const next: Record<string, { enabled: boolean; rcfeName: string; rcfeAdminEmail: string }> = {};
      Object.entries(entries).forEach(([k, v]: [string, any]) => {
        next[k] = {
          enabled: Boolean(v?.enabled),
          rcfeName: String(v?.rcfeName || ''),
          rcfeAdminEmail: String(v?.rcfeAdminEmail || '').toLowerCase(),
        };
      });
      setSettings(next);
      setEmailSubjectTemplate(String(data?.emailSubjectTemplate || ''));
      setEmailBodyTemplate(String(data?.emailBodyTemplate || ''));
      setCadenceDays(Number(data?.cadenceDays || 14));
      setAutomationEnabled(Boolean(data?.automationEnabled));
    } catch (error: any) {
      toast({
        title: 'Settings load failed',
        description: error?.message || 'Could not load weekly email settings.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const saveTemplate = async () => {
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in');
      setIsSavingTemplate(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-rcfe-weekly-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'set_template',
          emailSubjectTemplate,
          emailBodyTemplate,
          cadenceDays,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to save template settings');
      setEmailSubjectTemplate(String(data?.emailSubjectTemplate || emailSubjectTemplate));
      setEmailBodyTemplate(String(data?.emailBodyTemplate || emailBodyTemplate));
      setCadenceDays(Number(data?.cadenceDays || cadenceDays));
      toast({
        title: 'Saved',
        description: 'Biweekly RCFE email template settings updated.',
      });
    } catch (error: any) {
      toast({
        title: 'Save failed',
        description: error?.message || 'Could not save template settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const sendTestEmailToMe = async () => {
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in');
      setIsSendingTestEmail(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-rcfe-weekly-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'send_test_email',
          emailSubjectTemplate,
          emailBodyTemplate,
          testRcfeName: 'Template Preview RCFE',
          testRcfeAdminName: 'Template Preview Admin',
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to send test email');
      toast({
        title: 'Test email sent',
        description: `Preview sent to ${String(data?.sentTo || auth.currentUser.email || 'your inbox')}`,
      });
    } catch (error: any) {
      toast({
        title: 'Test email failed',
        description: error?.message || 'Could not send test template email.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const saveAutomationToggle = async (enabled: boolean) => {
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in');
      setIsSavingAutomation(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-rcfe-weekly-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'set_automation',
          automationEnabled: enabled,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to update automation setting');
      setAutomationEnabled(Boolean(data?.automationEnabled));
      toast({
        title: 'Updated',
        description: enabled ? 'Biweekly RCFE emails are now ON.' : 'Biweekly RCFE emails are now OFF.',
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Could not update automation setting.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingAutomation(false);
    }
  };

  const toggleWeekly = async (row: RcfeRow, enabled: boolean) => {
    const key = row.key;
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in');
      setSavingKey(key);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-rcfe-weekly-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          action: 'set',
          rcfeName: row.rcfeName,
          rcfeAdminEmail: row.rcfeAdminEmail,
          enabled,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to update setting');

      setSettings((prev) => ({
        ...prev,
        [key]: { enabled, rcfeName: row.rcfeName, rcfeAdminEmail: row.rcfeAdminEmail },
      }));
      toast({
        title: 'Updated',
        description: `${row.rcfeName}: ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Could not update RCFE setting.',
        variant: 'destructive',
      });
    } finally {
      setSavingKey(null);
    }
  };

  useEffect(() => {
    loadRows().catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings().catch(() => {});
  }, [auth?.currentUser?.uid]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.rcfeName.toLowerCase().includes(q) || r.rcfeAdminEmail.toLowerCase().includes(q));
  }, [rows, search]);

  if (isAdminLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RCFE Biweekly Follow-Up</h1>
          <p className="text-sm text-muted-foreground">
            RCFEs needing biweekly follow-up: R&B Sent Pending ILS Contract + Final-Member at RCFE, with active T2038 authorization
          </p>
        </div>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/admin/kaiser-tracker">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Kaiser Tracker
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Biweekly Auto-Email Toggles</CardTitle>
          <CardDescription>
            Emails run every {cadenceDays} days (default 14). Toggle OFF to exclude an RCFE from automated follow-ups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border p-3 bg-amber-50 border-amber-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Master send toggle</div>
                <div className="text-xs text-muted-foreground">
                  Turn ON only when you are ready for cron to send RCFE follow-up emails.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{automationEnabled ? 'ON' : 'OFF'}</span>
                <Switch
                  checked={automationEnabled}
                  disabled={isSavingAutomation || isLoadingSettings}
                  onCheckedChange={(next) => void saveAutomationToggle(Boolean(next))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3 bg-slate-50">
            <div className="text-sm font-medium">Email template and cadence</div>
            <Input
              value={emailSubjectTemplate}
              onChange={(e) => setEmailSubjectTemplate(e.target.value)}
              placeholder="Subject template"
            />
            <Textarea
              value={emailBodyTemplate}
              onChange={(e) => setEmailBodyTemplate(e.target.value)}
              rows={8}
              placeholder="Body template"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="number"
                min={1}
                value={cadenceDays}
                onChange={(e) => setCadenceDays(Math.max(1, Number(e.target.value || 14)))}
                className="w-full sm:w-36"
              />
              <div className="text-xs text-muted-foreground">
                Placeholders: {'{{rcfeName}}'}, {'{{rcfeAdminName}}'}, {'{{memberList}}'}, {'{{deydryReplyLinkList}}'}, {'{{memberCount}}'}, {'{{today}}'}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void saveTemplate()} disabled={isSavingTemplate || isLoadingSettings} className="w-full sm:w-auto">
                {isSavingTemplate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Template Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => void sendTestEmailToMe()}
                disabled={isSendingTestEmail || isLoadingSettings}
                className="w-full sm:w-auto"
              >
                {isSendingTestEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send Test Email to Me
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search RCFE name or admin email"
              className="w-full sm:max-w-md"
            />
            <Button variant="outline" onClick={() => void loadRows()} disabled={isLoadingRows || isLoadingSettings} className="w-full sm:w-auto">
              {isLoadingRows ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <Badge variant="secondary" className="self-start sm:self-auto">{filteredRows.length}</Badge>
          </div>

          {(isLoadingRows || isLoadingSettings) && (
            <div className="text-sm text-muted-foreground">Loading RCFE rows and settings...</div>
          )}

          {!isLoadingRows && !isLoadingSettings && filteredRows.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No eligible RCFE rows found (requires matching Kaiser status, RCFE admin email, and active T2038 end date).
            </div>
          )}

          <div className="space-y-2">
            {filteredRows.map((row) => {
              const enabled = settings[row.key]?.enabled !== false;
              const saving = savingKey === row.key;
              return (
                <div key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{row.rcfeName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.rcfeAdminEmail} • {row.memberCount} member{row.memberCount === 1 ? '' : 's'} • nearest T2038 end: {formatShortDate(row.nearestAuthorizationEndT2038)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-xs text-muted-foreground">{enabled ? 'On' : 'Off'}</span>
                    <Switch
                      checked={enabled}
                      disabled={saving}
                      onCheckedChange={(next) => void toggleWeekly(row, Boolean(next))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
