import { type IlsDecisionChoice } from '@/lib/ils-decision-email';

export type IlsDecisionLogState = {
  choice: IlsDecisionChoice;
  sentAtIso: string;
  sentBy: string;
  logId: string;
};
export type IlsDecisionPreviewDraft = {
  rowId: string;
  choice: IlsDecisionChoice;
  memberName: string;
  memberMrn: string;
  memberCounty: string;
  memberClientId: string;
  recipients: string[];
  subject: string;
  /** Full editable email body (overrides default narrative + optional notes). */
  emailBodyText: string;
  customText: string;
  idempotencyKey: string;
};
