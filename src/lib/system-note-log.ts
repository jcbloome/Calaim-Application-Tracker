export interface SystemNoteActionPayload {
  action: string;
  noteId?: string;
  noteType?: 'internal' | 'task' | 'alert' | 'system';
  priority?: 'General' | 'Priority' | 'Urgent';
  memberName?: string;
  applicationId?: string;
  actorName?: string;
  actorEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
  source?: string;
  status?: string;
}

export async function logSystemNoteAction(payload: SystemNoteActionPayload) {
  try {
    const response = await fetch('/api/admin/system-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn('System note log failed:', text);
    }
  } catch (error) {
    console.warn('System note log error:', error);
  }
}
