export type IspWorkflowActivityEvent =
  | 'sw_invite_sent'
  | 'sw_viewed'
  | 'sw_submitted_signed'
  | 'clinical_file_uploaded'
  | 'clinical_files_note_sent';

export type IspWorkflowActivityEntry = {
  event: IspWorkflowActivityEvent | string;
  atIso: string;
  byName?: string | null;
  byEmail?: string | null;
  details?: string | null;
  fileName?: string | null;
  fileLabel?: string | null;
  recipientEmail?: string | null;
  noteSentToSw?: boolean;
  isResend?: boolean;
};

export function buildIspWorkflowActivityEntry(
  entry: Omit<IspWorkflowActivityEntry, 'atIso'> & { atIso?: string }
): IspWorkflowActivityEntry {
  return {
    event: String(entry.event || '').trim() || 'activity',
    atIso: entry.atIso || new Date().toISOString(),
    byName: entry.byName || null,
    byEmail: entry.byEmail || null,
    details: entry.details || null,
    fileName: entry.fileName || null,
    fileLabel: entry.fileLabel || null,
    recipientEmail: entry.recipientEmail || null,
    noteSentToSw: Boolean(entry.noteSentToSw),
    isResend: Boolean(entry.isResend),
  };
}

export function formatIspWorkflowActivityLabel(entry: IspWorkflowActivityEntry): string {
  const event = String(entry.event || '').trim();
  if (event === 'sw_invite_sent') {
    return entry.isResend ? 'SW invite re-sent' : 'SW invite sent';
  }
  if (event === 'sw_viewed') return 'SW logged in and viewed member';
  if (event === 'sw_submitted_signed') return 'SW submitted & signed';
  if (event === 'clinical_file_uploaded') {
    const name = String(entry.fileLabel || entry.fileName || 'Clinical file').trim();
    return entry.noteSentToSw
      ? `New file uploaded (${name}) — note sent to SW`
      : `New file uploaded (${name})`;
  }
  if (event === 'clinical_files_note_sent') {
    return 'Note sent to SW: new clinical file(s) uploaded';
  }
  return event.replace(/_/g, ' ') || 'Activity';
}
