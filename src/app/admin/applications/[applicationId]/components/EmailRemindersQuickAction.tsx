'use client';

import { Label } from '@/components/ui/label';
import { QaDoneMeta, toMillisSafe } from './shared';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { type Application } from '@/lib/definitions';

export interface EmailRemindersQuickActionProps {
  application: Application;
  documentReminderFrequencyDays: number;
  updateReminderSettings: (patch: Record<string, any>) => Promise<void>;
  documentReminderNextAtMs: number;
  DAY_MS: number;
  isUpdatingReminderControls: boolean;
  reminderFrequencyOptions: readonly [7];
  toDateInputValue: (ms: number) => string;
  fromDateInputToMs: (value: string) => number | null;
}

export function EmailRemindersQuickAction({
  application,
  documentReminderFrequencyDays,
  updateReminderSettings,
  documentReminderNextAtMs,
  DAY_MS,
  isUpdatingReminderControls,
  reminderFrequencyOptions,
  toDateInputValue,
  fromDateInputToMs,
}: EmailRemindersQuickActionProps) {
  return (
    <div className="order-[8] space-y-2">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/10 p-3">
      <div className="sm:col-span-2 flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">8. Email reminders</Label>
        <QaDoneMeta
          done={Boolean((application as any)?.emailRemindersEnabled)}
          atMs={toMillisSafe((application as any)?.emailRemindersEnabledAt) || undefined}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Email reminders frequency</Label>
        <Select
          value={Boolean((application as any)?.emailRemindersEnabled) ? String(documentReminderFrequencyDays) : 'none'}
          onValueChange={(v) => {
            if (v === 'none') {
              updateReminderSettings({ emailRemindersEnabled: false });
              return;
            }
            const nextAtMs = documentReminderNextAtMs || (Date.now() + Number(v) * DAY_MS);
            updateReminderSettings({
              emailRemindersEnabled: true,
              emailRemindersEnabledAt: new Date().toISOString(),
              documentReminderFrequencyDays: Number(v),
              documentReminderNextAtMs: nextAtMs,
            });
          }}
          disabled={isUpdatingReminderControls}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {reminderFrequencyOptions.map((d) => (
              <SelectItem key={`qa-email-doc-freq-${d}`} value={String(d)}>
                Once a week
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Next email reminder date</Label>
        <Input
          type="date"
          value={toDateInputValue(documentReminderNextAtMs)}
          onChange={(event) => {
            const nextAtMs = fromDateInputToMs(event.target.value);
            updateReminderSettings({ documentReminderNextAtMs: nextAtMs });
          }}
          disabled={isUpdatingReminderControls}
        />
      </div>
      <p className="sm:col-span-2 text-[11px] text-muted-foreground">
        Establish the member in Caspio first, then use Email Primary Contact after CS Summary is filled out online.
        Push CS Summary updates to Caspio to enable auto reminders.
      </p>
    </div>
    </div>
  );
}
