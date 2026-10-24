import type { FormStatus as FormStatusType } from '@/lib/definitions';

export type StandaloneUploadRow = {
  id: string;
  status: string;
  documentType?: string;
  memberName?: string;
  healthPlan?: string;
  medicalRecordNumber?: string;
  createdAtMs: number;
  files: Array<{ fileName: string; downloadURL: string; storagePath?: string }>;
};

export type PortalActivityItem = {
  id: string;
  kind: 'first_login' | 'submitted' | 'login' | 'login_failed' | 'upload' | 'form';
  label: string;
  atMs: number;
  detail?: string;
};

export type FormStatusUpdate = Omit<Partial<FormStatusType>, 'dateCompleted'> & {
  dateCompleted?: FormStatusType['dateCompleted'] | null;
  completedBy?: string;
  completedWithoutUpload?: boolean;
  receivedByEmail?: boolean;
};

export type EligibilityScreenshotUpload = {
  id: string;
  fileName: string;
  filePath: string | null;
  downloadURL: string | null;
  assetType?: 'screenshot' | 'pdf_packet';
  uploadedAtIso: string;
  uploadedByUid: string | null;
  uploadedByName: string | null;
};

export type CommunicationNoteLogEntry = {
  id: string;
  category: 'user_staff' | 'interoffice';
  channel: 'eligibility_note' | 'portal_note' | 'interoffice_note' | string;
  direction: 'staff_to_user' | 'user_to_staff' | 'staff_to_staff';
  healthPlanTag: 'H' | 'K' | '';
  status: 'success' | 'failed' | 'blocked_duplicate';
  subject: string;
  messagePreview: string;
  fullMessage?: string;
  recipientName?: string;
  recipientEmail?: string;
  authorUid?: string | null;
  authorName?: string;
  requiresResponse?: boolean;
  respondedAtIso?: string | null;
  metadata?: Record<string, unknown>;
  createdAtIso: string;
  timestampMs: number;
};
