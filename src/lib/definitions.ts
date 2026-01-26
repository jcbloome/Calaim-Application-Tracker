
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
  submissionDate?: Timestamp | FieldValue;
  lastUpdated: Timestamp | FieldValue;
  pathway: 'SNF Transition' | 'SNF Diversion';
  healthPlan: 'Kaiser' | 'Health Net' | 'Other';
  forms: FormStatus[];
  progress: number;
  referrerName?: string;
  referrerEmail?: string;
  ispContactName?: string;
  agency?: string | null;
  memberAge?: number;
  memberMediCalNum?: string;
  confirmMemberMediCalNum?: string;
  confirmMemberMrn?: string;
  memberLanguage?: string;
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
  currentAddress?: string;
  currentCity?: string;
  currentState?: string;
  currentZip?: string;
  currentCounty?: string;
  copyAddress?: boolean;
  customaryLocationType?: string;
  customaryAddress?: string;
  customaryCity?: string;
  customaryState?: string;
  customaryZip?: string;
  customaryCounty?: string;
  existingHealthPlan?: string | null;
  switchingHealthPlan?: 'Yes' | 'No' | 'N/A' | null;
  meetsPathwayCriteria?: boolean;
  snfDiversionReason?: string | null;
  ispFirstName?: string;
  ispLastName?: string;
  ispRelationship?: string;
  ispPhone?: string;
  ispEmail?: string;
  ispLocationType?: string;
  ispAddress?: string;
  ispFacilityName?: string;
  onALWWaitlist?: 'Yes' | 'No' | 'Unknown';
  monthlyIncome?: string;
  ackRoomAndBoard?: boolean;
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
};

export type FormStatus = {
  name: string;
  status: 'Pending' | 'Completed';
  type: 'Form' | 'Upload' | 'Info' | 'online-form' | 'bundle';
  href: string;
  downloadHref?: string;
  dateCompleted?: Timestamp;
  choice?: 'accept' | 'decline';
  fileName?: string | null;
  filePath?: string | null;
  downloadURL?: string | null;
  signerType?: 'member' | 'representative' | null;
  signerName?: string | null;
  signerRelationship?: string | null;
  ackRoomAndBoard?: boolean;
  ackNmoHC?: boolean;
  ackHipaa?: boolean;
  ackLiability?: boolean;
  ackFoc?: boolean;
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
