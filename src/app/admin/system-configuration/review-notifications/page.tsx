'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Bell, Users } from 'lucide-react';

type RecipientSettings = {
  enabled: boolean;
  csSummary: boolean;
  documents: boolean;
  label?: string;
  email?: string;
};

type ReviewNotificationsConfig = {
  enabled: boolean;
  pollIntervalSeconds: number;
  recipients: Record<string, RecipientSettings>;
  updatedAt?: any;
  updatedBy?: string;
};

type StaffUser = {
  uid: string;
  email: string;
  label: string;
  role?: string;
};

const DEFAULT_CONFIG: ReviewNotificationsConfig = {
  enabled: true,
  pollIntervalSeconds: 180,
  recipients: {}
};

const clampPollSeconds = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_CONFIG.pollIntervalSeconds;
  return Math.max(30, Math.min(3600, Math.round(value)));
};

export default function ReviewNotificationsPage() {
  const { isSuperAdmin, isLoading, user } = useAdmin();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isBusy, setIsBusy] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [config, setConfig] = useState<ReviewNotificationsConfig>(DEFAULT_CONFIG);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  const configRef = useMemo(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_settings', 'review_notifications');
  }, [firestore]);

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!firestore || !configRef || !isSuperAdmin) return;

    let active = true;
    const load = async () => {
      setIsBusy(true);
      try {
        const [configSnap, adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
          getDoc(configRef),
          getDocs(collection(firestore, 'roles_admin')),
          getDocs(collection(firestore, 'roles_super_admin')),
          getDocs(collection(firestore, 'users'))
        ]);

        const nextConfig = configSnap.exists()
          ? ({ ...DEFAULT_CONFIG, ...(configSnap.data() as any) } as ReviewNotificationsConfig)
          : DEFAULT_CONFIG;

        const adminIds = new Set(adminRolesSnap.docs.map((d) => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map((d) => d.id));

        const usersById = usersSnap.docs.reduce((acc, d) => {
          acc[d.id] = d.data() as any;
          return acc;
        }, {} as Record<string, any>);

        const isStaffFlagIds = usersSnap.docs
          .filter((d) => Boolean((d.data() as any)?.isStaff))
          .map((d) => d.id);

        const allStaffIds = Array.from(new Set([...adminIds, ...superAdminIds, ...isStaffFlagIds]));

        const nextStaff = allStaffIds
          .map((uid) => {
            const data = usersById[uid] || {};
            const email = String(data.email || '').trim() || uid;
            const displayName = String(data.displayName || '').trim();
            const firstName = String(data.firstName || '').trim();
            const lastName = String(data.lastName || '').trim();
            const label =
              (firstName || lastName)
                ? `${firstName} ${lastName}`.trim()
                : (displayName || email || uid);
            return {
              uid,
              email,
              label,
              role: superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff'
            } satisfies StaffUser;
          })
          .filter((item) => Boolean(item.uid))
          .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

        if (!active) return;
        setConfig({
          ...DEFAULT_CONFIG,
          ...nextConfig,
          pollIntervalSeconds: clampPollSeconds(Number((nextConfig as any).pollIntervalSeconds))
        });
        setStaff(nextStaff);
        setIsLoaded(true);
      } catch (error: any) {
        console.error('Failed to load review notification config:', error);
        toast({
          title: 'Unable to load settings',
          description: error?.message || 'Failed to load review notification settings.',
          variant: 'destructive'
        });
      } finally {
        if (active) setIsBusy(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [firestore, configRef, isSuperAdmin, toast]);

  const getRecipient = (uid: string, email?: string, label?: string): RecipientSettings => {
    const existing = config.recipients?.[uid];
    if (existing) {
      return {
        enabled: Boolean(existing.enabled),
        csSummary: Boolean(existing.csSummary),
        documents: Boolean(existing.documents),
        email: existing.email || email,
        label: existing.label || label
      };
    }
    return {
      enabled: false,
      csSummary: false,
      documents: false,
      email,
      label
    };
  };

  const updateRecipient = (uid: string, updates: Partial<RecipientSettings>, email?: string, label?: string) => {
    setConfig((prev) => {
      const nextRecipients = { ...(prev.recipients || {}) };
      const base = nextRecipients[uid] || getRecipient(uid, email, label);
      nextRecipients[uid] = { ...base, ...updates, email: base.email || email, label: base.label || label };
      return { ...prev, recipients: nextRecipients };
    });
  };

  const enabledRecipientCount = useMemo(() => {
    return Object.values(config.recipients || {}).filter((r) => r.enabled).length;
  }, [config.recipients]);

  const handleSave = async () => {
    if (!configRef || !firestore) return;
    setIsBusy(true);
    try {
      const sanitized: ReviewNotificationsConfig = {
        enabled: Boolean(config.enabled),
        pollIntervalSeconds: clampPollSeconds(Number(config.pollIntervalSeconds)),
        recipients: config.recipients || {}
      };
      await setDoc(
        configRef,
        {
          ...sanitized,
          updatedAt: new Date(),
          updatedBy: user?.uid || null
        },
        { merge: true }
      );
      toast({
        title: 'Saved',
        description: 'Review notification recipients updated.',
        className: 'bg-green-100 text-green-900 border-green-200'
      });
    } catch (error: any) {
      console.error('Failed to save review notification config:', error);
      toast({
        title: 'Save failed',
        description: error?.message || 'Unable to save review notification settings.',
        variant: 'destructive'
      });
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-7 w-7 text-indigo-600" />
            Review Notifications
          </h1>
          <p className="text-muted-foreground mt-1">
            Choose which staff receive Electron pop-ups when CS Summaries or documents need review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isBusy || !isLoaded}>
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Global Controls
          </CardTitle>
          <CardDescription>System-wide master switch and polling interval for Electron.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-base font-medium">Enable review pop-ups</Label>
              <p className="text-sm text-muted-foreground">
                If disabled, no one will receive CS Summary/document review pop-ups.
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enabled: Boolean(checked) }))}
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="poll">Polling interval (seconds)</Label>
              <Input
                id="poll"
                type="number"
                min={30}
                max={3600}
                value={String(config.pollIntervalSeconds)}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    pollIntervalSeconds: clampPollSeconds(Number(e.target.value))
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Minimum 30 seconds. Maximum 1 hour.</p>
            </div>
            <div className="space-y-2">
              <Label>Recipients enabled</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{enabledRecipientCount}</Badge>
                <span className="text-sm text-muted-foreground">staff enabled</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>Enable staff and choose which review events trigger pop-ups for them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLoaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : staff.length === 0 ? (
            <div className="text-sm text-muted-foreground">No staff found in `users` with `isStaff == true`.</div>
          ) : (
            <div className="space-y-2">
              {staff.map((person) => {
                const r = getRecipient(person.uid, person.email, person.label);
                return (
                  <div
                    key={person.uid}
                    className="rounded-md border border-border bg-background p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate">{person.label}</div>
                        {person.role && <Badge variant="outline">{person.role}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{person.email}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Enabled</Label>
                        <Switch
                          checked={r.enabled}
                          onCheckedChange={(checked) =>
                            updateRecipient(person.uid, { enabled: Boolean(checked) }, person.email, person.label)
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">CS Summary</Label>
                        <Switch
                          checked={r.csSummary}
                          disabled={!r.enabled}
                          onCheckedChange={(checked) =>
                            updateRecipient(person.uid, { csSummary: Boolean(checked) }, person.email, person.label)
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Documents</Label>
                        <Switch
                          checked={r.documents}
                          disabled={!r.enabled}
                          onCheckedChange={(checked) =>
                            updateRecipient(person.uid, { documents: Boolean(checked) }, person.email, person.label)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

