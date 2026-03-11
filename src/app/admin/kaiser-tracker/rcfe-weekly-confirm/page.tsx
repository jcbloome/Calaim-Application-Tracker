'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { getEffectiveKaiserStatus } from '../components/shared';

type RcfeRow = {
  key: string;
  rcfeName: string;
  rcfeAdminEmail: string;
  memberCount: number;
};

const normalizeRcfeKey = (name: string, email: string) =>
  `${String(name || '').trim().toLowerCase()}|${String(email || '').trim().toLowerCase()}`;

const isRbPendingIlsContractStatus = (status: string) => {
  const s = String(status || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return s === 'r&b sent pending ils contract' || s === 'r & b sent pending ils contract';
};

export default function RcfeWeeklyConfirmPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [settings, setSettings] = useState<Record<string, { enabled: boolean; rcfeName: string; rcfeAdminEmail: string }>>({});
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
        if (!isRbPendingIlsContractStatus(status)) continue;
        const rcfeName = String(member?.RCFE_Name || '').trim();
        const rcfeAdminEmail = String(member?.RCFE_Admin_Email || member?.RCFE_Administrator_Email || '').trim().toLowerCase();
        if (!rcfeName || !rcfeAdminEmail) continue;
        const key = normalizeRcfeKey(rcfeName, rcfeAdminEmail);
        const prev = rowsByKey.get(key);
        if (!prev) {
          rowsByKey.set(key, { key, rcfeName, rcfeAdminEmail, memberCount: 1 });
        } else {
          prev.memberCount += 1;
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
          <h1 className="text-2xl font-bold tracking-tight">RCFE Weekly Confirmation</h1>
          <p className="text-sm text-muted-foreground">
            RCFEs at Kaiser status: R&B Sent Pending ILS Contract
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
          <CardTitle className="text-base">Weekly Auto-Email Toggles</CardTitle>
          <CardDescription>
            Enable weekly confirmation emails to RCFE admins for members currently in R&B Sent Pending ILS Contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
              No RCFE rows found with admin email in R&B Sent Pending ILS Contract stage.
            </div>
          )}

          <div className="space-y-2">
            {filteredRows.map((row) => {
              const enabled = Boolean(settings[row.key]?.enabled);
              const saving = savingKey === row.key;
              return (
                <div key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{row.rcfeName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.rcfeAdminEmail} • {row.memberCount} member{row.memberCount === 1 ? '' : 's'} in stage
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
