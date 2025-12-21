
import { Timestamp, FieldValue } from 'firebase/firestore';

export type ApplicationStatus = 'In Progress' | 'Completed & Submitted' | 'Requires Revision' | 'Approved' | 'Deleted';

export type Application = {
  id: string;
  userId?: string;
  memberFirstName: string;
  memberLastName: string;
  memberCounty: string;
  memberMrn: string;
  memberDob?: any;
  status: ApplicationStatus;
  submissionDate?: Timestamp | FieldValue;
  lastUpdated: Timestamp | FieldValue;
  pathway: 'SNF Transition' | 'SNF Diversion';
  healthPlan: 'Kaiser' | 'Health Net' | 'Other' | 'Kaiser Permanente';
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
  hasCapacity?: 'Yes' | 'No';
  hasLegalRep?: 'Yes' | 'No' | null;
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
  rcfeAdminName?: string | null;
  rcfeAdminPhone?: string | null;
  rcfeAdminEmail?: string | null;
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
  signerType?: 'member' | 'representative' | null;
  signerName?: string | null;
  signerRelationship?: string | null;
  ackRoomAndBoard?: boolean;
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
};




    
