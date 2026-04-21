
import { Timestamp, FieldValue } from 'firebase/firestore';

export type ApplicationStatus =
  | 'In Progress'
  | 'Completed & Submitted'
  | 'Requires Revision'
  | 'Approved'
  | 'Deleted'
  | 'Application in Review'
  | 'Authorization Requested'
  | 'Authorization Received (Doc Collection)'
  | 'RN/Visit Scheduled'
  | 'Tier Level Requested'
  | 'Tier Level Recieved'
  | 'Locating RCFEs'
  | 'RCFE Found'
  | 'Room and Board Committment Letter Required'
  | 'Room and Board Letter Completed'
  | 'RCFE Connected with ILS for Contracting'
  | 'RCFE Contract Received'
  | '(Ready for Placement)'
  | 'Member Placed at RCFE';

export type Application = {
  id: string;
  userId?: string;
  uniqueKey?: string;
  source?: 'user' | 'admin';
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberDob?: any;
  sex?: 'Male' | 'Female';
  status: ApplicationStatus;
  adminProcessingStatus?:
    | 'In Process'
    | 'On Hold'
    | 'Pending Documents'
    | 'Pending Authorization'
    | 'Pending Placement'
    | 'Ready for Placement'
    | 'Closed'
    | null;
  adminProcessingReason?: string | null;
  adminProcessingUpdatedAt?: Timestamp | FieldValue;
  adminProcessingUpdatedBy?: string | null;
  adminProcessingUpdatedByUid?: string | null;
  adminProcessingHistory?: Array<{
    status: string;
    reason: string;
    updatedBy?: string | null;
    updatedByUid?: string | null;
    updatedAtIso?: string;
  }>;
  submissionDate?: Timestamp | FieldValue;
  lastUpdated: Timestamp | FieldValue;
  pathway: 'SNF Transition' | 'SNF Diversion';
  healthPlan: 'Kaiser' | 'Health Net' | 'Other';
  forms: FormStatus[];
  progress: number;
  // Staff review metadata
  applicationChecked?: boolean;
  applicationCheckedBy?: string | null;
  applicationCheckedByUid?: string | null;
  applicationCheckedDate?: string | null; // ISO string
  pendingCsReview?: boolean;
  pendingDocReviewCount?: number;
  pendingDocReviewUpdatedAt?: Timestamp | FieldValue;
  referrerName?: string;
  referrerEmail?: string;
  ispContactName?: string;
  agency?: string | null;
  memberAge?: number;
  memberMediCalNum?: string;
  confirmMemberMediCalNum?: string;
  confirmMemberMrn?: string;
  memberLanguage?: string;
  Authorization_Number_T038?: string | null;
  Authorization_Start_T2038?: string | null;
  Authorization_End_T2038?: string | null;
  Diagnostic_Code?: string | null;
  referrerFirstName?: string;
  referrerLastName?: string;
  referrerPhone?: string;
  referrerRelationship?: string;
  bestContactFirstName?: string;
  bestContactLastName?: string;
  bestContactRelationship?: string;
  bestContactPhone?: string;
  bestContactEmail?: string;
  bestContactLanguage?: string;
  secondaryContactFirstName?: string;
  secondaryContactLastName?: string;
  secondaryContactRelationship?: string;
  secondaryContactPhone?: string;
  secondaryContactEmail?: string;
  secondaryContactLanguage?: string;
  hasLegalRep?: 'notApplicable' | 'same_as_primary' | 'different' | 'no_has_rep' | null;
  repFirstName?: string | null;
  repLastName?: string | null;
  repRelationship?: string | null;
  repPhone?: string | null;
  repEmail?: string | null;
  currentLocation?: string;
  currentLocationName?: string;
  currentAddress?: string;
  currentCity?: string;
  currentState?: string;
  currentZip?: string;
  currentCounty?: string;
  copyAddress?: boolean;
  customaryLocationType?: string;
  customaryLocationName?: string;
  customaryAddress?: string;
  customaryCity?: string;
  customaryState?: string;
  customaryZip?: string;
  customaryCounty?: string;
  existingHealthPlan?: string | null;
  switchingHealthPlan?: 'Yes' | 'No' | 'N/A' | null;
  meetsPathwayCriteria?: boolean;
  pathwaySelectionConfirmedAt?: string | null;
  snfDiversionReason?: string | null;
  ispFirstName?: string;
  ispLastName?: string;
  ispRelationship?: string;
  ispPhone?: string;
  ispEmail?: string;
  ispLocationSameAsCurrent?: boolean;
  ispLocationType?: string;
  ispAddress?: string;
  ispCity?: string;
  ispState?: string;
  ispZip?: string;
  ispFacilityName?: string;
  onALWWaitlist?: 'Yes' | 'No' | 'Unknown';
  monthlyIncome?: string;
  incomeSource?: Array<'SSI' | 'SSA' | 'SSD' | 'OTHER' | 'N/A'> | 'SSI' | 'SSA' | 'SSD' | 'OTHER' | 'N/A' | string;
  expectedRoomBoardPayment?: string;
  ackRoomAndBoard?: boolean;
  ackSocDetermination?: boolean;
  customerFeedbackRating?: number;
  customerFeedbackComments?: string;
  customerFeedbackSubmittedAt?: string;
  roomBoardFamilyPayAttestation?: boolean;
  roomBoardNoIncomeFacilityDiscretionAck?: boolean;
  hasPrefRCFE?: 'Yes' | 'No';
  rcfeName?: string | null;
  rcfeAddress?: string | null;
  rcfePreferredCities?: string | null;
  rcfeAdminFirstName?: string | null;
  rcfeAdminLastName?: string | null;
  rcfeAdminPhone?: string | null;
  rcfeAdminEmail?: string | null;
  // Notification settings
  emailRemindersEnabled?: boolean;
  reviewNotificationSent?: boolean;
  emailRemindersEnabledAt?: Timestamp | FieldValue;
  reviewNotificationSentAt?: Timestamp | FieldValue;
  documentReminderFrequencyDays?: number;
  calaimTrackingStatus?: string;
  calaimTrackingReason?: string;
  calaimNotEligibleSwitchingProviders?: boolean;
  calaimNotEligibleHasSoc?: boolean;
  calaimNotEligibleOutOfCounty?: boolean;
  calaimNotEligibleOther?: boolean;
  calaimNotEligibleReason?: string;
  calaimNotEligibleOtherReason?: string;
  intakeType?: 'standard' | 'kaiser_auth_received_via_ils';
  kaiserAuthReceivedViaIls?: boolean;
  memberPhone?: string | null;
  memberEmail?: string | null;
  kaiserAuthReceivedDate?: Timestamp | FieldValue;
  kaiserReferralSubmission?: {
    submitted?: boolean;
    submittedAt?: Timestamp | FieldValue;
    submittedAtIso?: string | null;
    from?: string | null;
    to?: string | null;
    cc?: string[] | null;
    subject?: string | null;
    region?: string | null;
    providerMessageId?: string | null;
    submittedByName?: string | null;
    submittedByEmail?: string | null;
    overrideResubmit?: boolean;
    overrideReason?: string | null;
  };
  kaiserReferralSubmissionCount?: number;
};

export type FormStatus = {
  name: string;
  status: 'Pending' | 'Completed';
  type: 'Form' | 'Upload' | 'Info' | 'online-form' | 'bundle';
  href: string;
  downloadHref?: string;
  dateCompleted?: Timestamp;
  // Staff review metadata (document acknowledgement)
  acknowledged?: boolean;
  acknowledgedBy?: string | null;
  acknowledgedByUid?: string | null;
  acknowledgedDate?: string | null; // ISO string
  choice?: 'accept' | 'decline';
  fileName?: string | null;
  filePath?: string | null;
  downloadURL?: string | null;
  signerType?: 'member' | 'representative' | null;
  signerName?: string | null;
  signerRelationship?: string | null;
  ackRoomAndBoard?: boolean;
  roomBoardAgreement?: 'agree' | 'disagree' | null;
  ackNmoHC?: boolean;
  ackHipaa?: boolean;
  ackLiability?: boolean;
  ackFoc?: boolean;
  ackSocDetermination?: boolean;
  monthlyIncome?: string | null;
  incomeSource?: Array<'SSI' | 'SSA' | 'SSD' | 'OTHER' | 'N/A'> | 'SSI' | 'SSA' | 'SSD' | 'OTHER' | 'N/A' | string | null;
  feedbackRating?: number | null;
  feedbackComments?: string | null;
};

export type Acronym = {
  term: string;
  definition: string;
};

export type Activity = {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  details: string;
  applicationId?: string;
};

export type StaffTracker = {
  id: string;
  applicationId: string;
  userId: string;
  healthPlan: 'Kaiser' | 'Health Net' | 'Other';
  status: string;
  lastUpdated: Timestamp;
  assignedStaffId?: string;
  nextStep?: string;
  nextStepDate?: Timestamp;
  isPriority?: boolean;
};

export interface StaffMember {
    uid: string;
    role: 'Admin' | 'Super Admin';
    firstName: string;
    lastName: string;
    email: string;
}
