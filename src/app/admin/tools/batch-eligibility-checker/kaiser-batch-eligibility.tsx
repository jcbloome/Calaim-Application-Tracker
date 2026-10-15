'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, CloudDownload, Download, Loader2, RefreshCw, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { BatchEligibilityMember } from '@/lib/batch-eligibility';
import {
  DEFAULT_EDI_270_SETTINGS,
  build270,
  edi270Problems,
  missingEdiSettings,
  payerIdForMember,
  type Edi270Settings,
} from '@/lib/x12-270';
import { EligibilityResultsCard } from './eligibility-results-card';

type TextSettingKey = Exclude<
  {
    [K in keyof Edi270Settings]-?: Edi270Settings[K] extends string ? K : never;
  }[keyof Edi270Settings],
  'usage' | 'memberIdSource' | 'updatedAtIso' | 'updatedByEmail'
>;

const SETTING_FIELDS: Array<{ key: TextSettingKey; label: string; hint?: string; required?: boolean }> = [
  { key: 'senderId', label: 'Sender / submitter ID (ISA06)', hint: 'Assigned to us by Smart Data Solutions', required: true },
  { key: 'senderQualifier', label: 'Sender ID qualifier (ISA05)', hint: 'Usually ZZ' },
  { key: 'receiverId', label: 'Receiver ID (ISA08)', hint: "Smart Data Solutions' ID from their companion guide", required: true },
  { key: 'receiverQualifier', label: 'Receiver ID qualifier (ISA07)', hint: 'Usually ZZ' },
  { key: 'gsSenderId', label: 'GS sender code (GS02)', hint: 'Blank = same as sender ID' },
  { key: 'gsReceiverId', label: 'GS receiver code (GS03)', hint: 'Blank = same as receiver ID' },
  { key: 'payerName', label: 'Payer name (NM1*PR)' },
  { key: 'payerIdNorth', label: 'Kaiser payer ID — Northern California', required: true },
  { key: 'payerIdSouth', label: 'Kaiser payer ID — Southern California', hint: 'Blank = use the Northern ID for everyone' },
  { key: 'providerName', label: 'Provider / organization name (NM1*1P)', required: true },
  { key: 'providerNpi', label: 'Provider NPI', required: true },
  { key: 'originatorId', label: 'Trace originator ID (TRN03)', hint: 'Blank = 9 + first 9 digits of NPI' },
  { key: 'serviceType', label: 'Service type code (EQ01)', hint: '30 = health benefit plan coverage' },
];

const isAuthorizedStatus = (status: string) => status.trim().toLowerCase() === 'authorized';

export function KaiserBatchEligibility({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Edi270Settings>(DEFAULT_EDI_270_SETTINGS);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [members, setMembers] = useState<BatchEligibilityMember[]>([]);
  const [membersSyncedIso, setMembersSyncedIso] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isPullingCaspio, setIsPullingCaspio] = useState(false);
  const [includedStatuses, setIncludedStatuses] = useState<Set<string>>(new Set(['Authorized']));
  const [isSavingRun, setIsSavingRun] = useState(false);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${await getIdToken()}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    [getIdToken]
  );

  const loadMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const data = await authedFetch('/api/admin/batch-eligibility/members?plan=kaiser');
      setMembers(data.members || []);
      setMembersSyncedIso(data.lastSyncedIso || null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load Kaiser members', description: error?.message });
    } finally {
      setIsLoadingMembers(false);
    }
  }, [authedFetch, toast]);

  useEffect(() => {
    authedFetch('/api/admin/batch-eligibility/edi-settings')
      .then((data) => setSettings({ ...DEFAULT_EDI_270_SETTINGS, ...(data.settings || {}) }))
      .catch((error) => toast({ variant: 'destructive', title: 'Could not load EDI settings', description: error?.message }));
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missingSettings = useMemo(() => missingEdiSettings(settings), [settings]);
  const showSettings = settingsOpen || settingsDirty || missingSettings.length > 0;

  const updateSetting = <K extends keyof Edi270Settings>(key: K, value: Edi270Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSettingsDirty(true);
  };

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const data = await authedFetch('/api/admin/batch-eligibility/edi-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSettings({ ...DEFAULT_EDI_270_SETTINGS, ...data.settings });
      setSettingsDirty(false);
      toast({ title: 'EDI settings saved' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not save EDI settings', description: error?.message });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const pullLatestFromCaspio = async () => {
    setIsPullingCaspio(true);
    try {
      const res = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await getIdToken(), mode: 'incremental' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadMembers();
      toast({
        title: 'Pulled latest from Caspio',
        description: `${Number(data?.upserted || 0).toLocaleString()} changed member record(s) updated.`,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Caspio sync failed', description: error?.message });
    } finally {
      setIsPullingCaspio(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m.calaimStatus, (counts.get(m.calaimStatus) || 0) + 1);
    return [...counts.entries()].sort((a, b) => {
      if (isAuthorizedStatus(a[0])) return -1;
      if (isAuthorizedStatus(b[0])) return 1;
      return b[1] - a[1];
    });
  }, [members]);

  const { included, excluded, regionCounts } = useMemo(() => {
    const byStatus = members.filter((m) => includedStatuses.has(m.calaimStatus));
    const ok: BatchEligibilityMember[] = [];
    const bad: Array<{ member: BatchEligibilityMember; problems: string[] }> = [];
    for (const m of byStatus) {
      const problems = edi270Problems(m, settings);
      if (problems.length) bad.push({ member: m, problems });
      else ok.push(m);
    }
    const regions = new Map<string, number>();
    for (const m of ok) {
      const key = m.region || 'Region unknown';
      regions.set(key, (regions.get(key) || 0) + 1);
    }
    return { included: ok, excluded: bad, regionCounts: [...regions.entries()] };
  }, [members, includedStatuses, settings]);

  const unknownRegionWithTwoPayers =
    Boolean(settings.payerIdNorth.trim() && settings.payerIdSouth.trim()) &&
    included.some((m) => m.region !== 'Kaiser North' && m.region !== 'Kaiser South');

  const preview = useMemo(() => {
    if (missingSettings.length || !included.length) return '';
    return build270(included.slice(0, 3), { ...settings, segmentPerLine: true });
  }, [included, settings, missingSettings]);

  const download270 = async () => {
    const edi = build270(included, settings);
    const statusLabel = includedStatuses.size === 1 && includedStatuses.has('Authorized') ? 'Authorized' : 'Selected statuses';
    const fileName = `Kaiser 270 eligibility - ${statusLabel} - ${format(new Date(), 'yyyy-MM-dd')}.edi`;
    const blob = new Blob([edi], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    setIsSavingRun(true);
    try {
      const form = new FormData();
      form.append('kind', 'batch');
      form.append('plan', 'kaiser');
      form.append('list', statusLabel === 'Authorized' ? 'authorized' : 'statuses');
      form.append(
        'summary',
        JSON.stringify({
          memberCount: included.length,
          listLabel: statusLabel,
          statuses: [...includedStatuses],
          skippedIncomplete: excluded.length,
          regions: Object.fromEntries(regionCounts),
          format: 'X12 270 (005010X279A1)',
          memberIdSource: settings.memberIdSource,
          membersSyncedIso,
        })
      );
      form.append('files', new File([blob], fileName, { type: 'text/plain' }));
      await authedFetch('/api/admin/batch-eligibility/runs', { method: 'POST', body: form });
      toast({ title: '270 file saved to the Batch Eligibility Log' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Downloaded, but could not save to the log', description: error?.message });
    } finally {
      setIsSavingRun(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setSettingsOpen((open) => !open)}>
          <CardTitle className="flex items-center gap-2">
            {showSettings ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            1. Smart Data Solutions EDI settings
            {!showSettings ? (
              <Badge variant="secondary" className="font-normal">
                Saved
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            {showSettings
              ? 'IDs for the X12 270 envelope. Use the values from Smart Data Solutions’ companion guide / enrollment. Saved for next time.'
              : `Sender ${settings.senderId} → receiver ${settings.receiverId} · payer ${[settings.payerIdNorth, settings.payerIdSouth]
                  .filter(Boolean)
                  .join(' / ')} · NPI ${settings.providerNpi} · member ID = ${
                  settings.memberIdSource === 'mrn' ? 'Kaiser MRN' : 'Medi-Cal CIN'
                } · ${settings.usage === 'P' ? 'production' : 'test'}. Click to view or change.`}
          </CardDescription>
        </CardHeader>
        <CardContent className={`space-y-4 ${showSettings ? '' : 'hidden'}`}>
          {missingSettings.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              Still needed: {missingSettings.join(', ')}.
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {SETTING_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`edi-${field.key}`}>
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  id={`edi-${field.key}`}
                  value={String(settings[field.key] ?? '')}
                  onChange={(e) => updateSetting(field.key, e.target.value)}
                />
                {field.hint ? <div className="text-xs text-muted-foreground">{field.hint}</div> : null}
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="edi-member-id">Member ID sent (NM1*IL)</Label>
              <select
                id="edi-member-id"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={settings.memberIdSource}
                onChange={(e) => updateSetting('memberIdSource', e.target.value as Edi270Settings['memberIdSource'])}
              >
                <option value="mrn">Kaiser MRN</option>
                <option value="medicalId">Medi-Cal CIN</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edi-usage">Usage (ISA15)</Label>
              <select
                id="edi-usage"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={settings.usage}
                onChange={(e) => updateSetting('usage', e.target.value as Edi270Settings['usage'])}
              >
                <option value="P">P — production</option>
                <option value="T">T — test</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edi-max">Max members per transaction (ST)</Label>
              <Input
                id="edi-max"
                type="number"
                min={1}
                value={settings.maxPerTransaction}
                onChange={(e) => updateSetting('maxPerTransaction', Number(e.target.value) || 1)}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox
                checked={settings.segmentPerLine}
                onCheckedChange={(value) => updateSetting('segmentPerLine', Boolean(value))}
              />
              One segment per line (line break after each ~)
            </label>
          </div>
          <Button size="sm" onClick={() => void saveSettings()} disabled={isSavingSettings || !settingsDirty}>
            {isSavingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {settingsDirty ? 'Save EDI settings' : 'Settings saved'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Kaiser members</CardTitle>
          <CardDescription>
            From the synced Caspio members cache
            {membersSyncedIso ? ` (last synced ${format(new Date(membersSyncedIso), 'MMM d, yyyy h:mm a')})` : ''}.
            Authorized members are included by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void loadMembers()} disabled={isLoadingMembers}>
              {isLoadingMembers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reload members
            </Button>
            <Button size="sm" variant="outline" onClick={() => void pullLatestFromCaspio()} disabled={isPullingCaspio}>
              {isPullingCaspio ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="mr-2 h-4 w-4" />
              )}
              Pull latest from Caspio
            </Button>
            <span className="text-sm text-muted-foreground">{members.length.toLocaleString()} Kaiser members</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusCounts.map(([status, count]) => {
              const checked = includedStatuses.has(status);
              return (
                <label
                  key={status}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm ${
                    checked ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      setIncludedStatuses((prev) => {
                        const next = new Set(prev);
                        if (value) next.add(status);
                        else next.delete(status);
                        return next;
                      })
                    }
                  />
                  {status} <Badge variant="secondary">{count}</Badge>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{included.length.toLocaleString()} in the 270 file</Badge>
            {regionCounts.map(([region, count]) => (
              <Badge key={region} variant="outline">
                {region}: {count}
                {settings.payerIdNorth || settings.payerIdSouth
                  ? ` → payer ${payerIdForMember({ region } as BatchEligibilityMember, settings) || '?'}`
                  : ''}
              </Badge>
            ))}
          </div>
          {unknownRegionWithTwoPayers ? (
            <div className="text-xs text-amber-700">
              Members with an unknown region are sent with the Northern California payer ID.
            </div>
          ) : null}
          {excluded.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-amber-700">
                {excluded.length} member{excluded.length === 1 ? '' : 's'} left out (missing data) — fix in Caspio, then
                Pull latest
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs">
                {excluded.map(({ member, problems }) => (
                  <li key={member.clientId2}>
                    {member.lastName}, {member.firstName} (Client ID {member.clientId2}): {problems.join(', ')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Download 270 for Smart Data Solutions</CardTitle>
          <CardDescription>
            X12 005010X279A1 batch eligibility inquiry. Each member&apos;s trace number (TRN) is their Caspio Client_ID2,
            so the 271 response can be matched back exactly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void download270()}
              disabled={!included.length || missingSettings.length > 0 || settingsDirty || isSavingRun}
            >
              {isSavingRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download 270 EDI ({included.length.toLocaleString()} members)
            </Button>
            {missingSettings.length ? (
              <span className="text-sm text-destructive">Fill the EDI settings in step 1 first.</span>
            ) : settingsDirty ? (
              <span className="text-sm text-muted-foreground">Save the EDI settings first.</span>
            ) : null}
          </div>
          {preview ? (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Preview (first 3 members)</div>
              <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px]">{preview}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <EligibilityResultsCard
        members={members}
        plan="kaiser"
        getIdToken={getIdToken}
        title="4. Decode Smart Data Solutions 271 results"
      />
    </div>
  );
}
