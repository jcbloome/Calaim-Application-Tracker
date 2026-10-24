'use client';

import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { type PushedNotesEntry } from '@/lib/ils-admin-notes';
import { type Dispatch, type SetStateAction } from 'react';

export interface PrePushNotesQuickActionProps {
  showPrePushNotesSection: boolean;
  originalNotesPushedToCaspio: string;
  laterNotesPushedToCaspio: PushedNotesEntry[];
  adminIntakeNotes: string;
  prePushNotesDraft: string;
  setPrePushNotesDraft: Dispatch<SetStateAction<string>>;
  notesAlreadyPushedToCaspio: boolean;
  isSavingPrePushNotes: boolean;
  prePushNotesAutosaveState: "idle" | "saving" | "saved" | "error";
  prePushNotesSavedAtIso: string;
}

export function PrePushNotesQuickAction({
  showPrePushNotesSection,
  originalNotesPushedToCaspio,
  laterNotesPushedToCaspio,
  adminIntakeNotes,
  prePushNotesDraft,
  setPrePushNotesDraft,
  notesAlreadyPushedToCaspio,
  isSavingPrePushNotes,
  prePushNotesAutosaveState,
  prePushNotesSavedAtIso,
}: PrePushNotesQuickActionProps) {
  return (
    <div className="order-[11]">
    {showPrePushNotesSection ? (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
        <Label htmlFor="quick-actions-pre-push-notes" className="text-xs font-medium text-muted-foreground">
          Notes
        </Label>
        {originalNotesPushedToCaspio || laterNotesPushedToCaspio.length > 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-950 space-y-2">
            <div className="font-medium">Notes pushed to Caspio</div>
            {originalNotesPushedToCaspio ? (
              <div className="whitespace-pre-wrap">{originalNotesPushedToCaspio}</div>
            ) : null}
            {laterNotesPushedToCaspio.map((entry, index) => {
              const at = Date.parse(entry.pushedAtIso);
              const label = [
                Number.isNaN(at) ? '' : format(new Date(at), 'MMM d, yyyy h:mm a'),
                entry.pushedByName,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={`${entry.pushedAtIso}-${index}`}
                  className="border-t border-emerald-200 pt-2 whitespace-pre-wrap"
                >
                  <div className="font-medium">Update{label ? ` (${label})` : ''}:</div>
                  {entry.notes}
                </div>
              );
            })}
          </div>
        ) : adminIntakeNotes ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900 whitespace-pre-wrap">
            <span className="font-medium">Imported admin intake notes:</span>
            {'\n'}
            {adminIntakeNotes}
          </div>
        ) : null}
        <Textarea
          id="quick-actions-pre-push-notes"
          value={prePushNotesDraft}
          onChange={(event) => setPrePushNotesDraft(event.target.value)}
          rows={4}
          placeholder={
            notesAlreadyPushedToCaspio
              ? 'Add updated notes for the next Caspio notes push (original notes above stay on this application).'
              : 'Add family call/intake notes before Caspio push.'
          }
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {notesAlreadyPushedToCaspio
              ? 'Original notes stay visible above. New text here is what gets sent on the next Caspio notes push.'
              : 'Saved to draft and sent on Caspio push (member notes field when mapped + Caspio client notes log).'}
          </p>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {isSavingPrePushNotes || prePushNotesAutosaveState === 'saving' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : prePushNotesAutosaveState === 'saved' ? (
              `Saved${prePushNotesSavedAtIso ? ` ${format(new Date(prePushNotesSavedAtIso), 'h:mm a')}` : ''}`
            ) : prePushNotesAutosaveState === 'error' ? (
              'Autosave failed'
            ) : (
              'Autosave on'
            )}
          </div>
        </div>
      </div>
    ) : null}
    </div>
  );
}
