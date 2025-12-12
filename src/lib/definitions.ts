
import { Timestamp } from 'firebase/firestore';

export type ApplicationStatus = 'In Progress' | 'Completed & Submitted' | 'Requires Revision' | 'Approved';

export type Application = {
  id: string;
  userId?: string;
  memberFirstName: string;
  memberLastName: string;
  memberCounty: string;
  memberMrn: string;
  memberDob?: string | Timestamp | Date;
  status: ApplicationStatus;
  lastUpdated: string | Timestamp; 
  pathway: 'SNF Transition' | 'SNF Diversion';
  healthPlan: 'Kaiser' | 'Health Net' | 'Other' | 'Kaiser Permanente';
  forms: FormStatus[];
  progress: number;
  referrerName?: string;
  ispContactName?: string;
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

  
