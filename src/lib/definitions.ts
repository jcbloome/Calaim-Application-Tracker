
import { Timestamp } from 'firebase/firestore';

export type ApplicationStatus = 'In Progress' | 'Completed & Submitted' | 'Requires Revision' | 'Approved';

export type Application = {
  id: string;
  userId: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  status: ApplicationStatus;
  lastUpdated: string | Timestamp; 
  pathway: 'SNF Transition' | 'SNF Diversion';
  healthPlan: 'Kaiser' | 'Health Net' | 'Other';
  forms: FormStatus[];
  progress: number;
};

export type FormStatus = {
  name: string;
  status: 'Pending' | 'Completed';
  type: 'Form' | 'Upload' | 'Info' | 'online-form';
  href: string;
  downloadHref?: string;
  dateCompleted?: Timestamp;
  choice?: 'accept' | 'decline';
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
};
