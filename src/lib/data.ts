

import { Application, Acronym, Activity } from './definitions';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';


export const applications: (Omit<Application, 'userId'> & { id: string; userId: string; memberName?: string; healthPlan?: string; referrerName?: string; ispContactName?: string; agency?: string; memberMrn?: string; })[] = [
  {
    id: 'app-001',
    userId: 'user-001',
    memberFirstName: 'Tim',
    memberLastName: 'Frank',
    memberMrn: '123456789',
    memberCounty: 'Los Angeles',
    status: 'In Progress',
    lastUpdated: Timestamp.fromDate(new Date('2023-10-26T10:00:00Z')),
    pathway: 'SNF Transition',
    healthPlan: 'Kaiser Permanente',
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '#' },
      { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '#' },
      { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '#' }
    ],
    progress: 33,
  },
];

export const acronyms: Acronym[] = [
  { term: 'ARF', definition: 'Adult Residential Facility' },
  { term: 'CalAIM', definition: 'California Advancing and Innovating Medi-Cal' },
  { term: 'CS', definition: 'Community Supports' },
  { term: 'DOB', definition: 'Date of Birth' },
  { term: 'HIPAA', definition: 'Health Insurance Portability and Accountability Act' },
  { term: 'ISP', definition: 'Individual Service Plan' },
  { term: 'MCP', definition: 'Managed Care Plan' },
  { term: 'MRN', definition: 'Medical Record Number' },
  { term: 'RCFE', definition: 'Residential Care Facility for the Elderly' },
  { term: 'SNF', definition: 'Skilled Nursing Facility' },
  { term: 'SOC', definition: 'Share of Cost' },
];

export const activities: Activity[] = [
    { id: 'act-1', applicationId: 'app-002', user: 'Jason Bloome', action: 'Revision Request', timestamp: '2023-10-27 10:00 AM', details: 'Requested revision for "Proof of Income".' },
    { id: 'act-2', applicationId: 'app-002', user: 'Jane Smith', action: 'Form Completed', timestamp: '2023-10-27 09:45 AM', details: 'Completed "CS Member Summary".' },
    { id: 'act-3', applicationId: 'app-005', user: 'Admin', action: 'Application Created', timestamp: '2023-10-27 09:30 AM', details: 'Application created for Chris Lee.' },
    { id: 'act-4', applicationId: 'app-001', user: 'John Doe', action: 'Form Started', timestamp: '2023-10-26 03:15 PM', details: 'Started "Liability Waiver".' },
    { id: 'act-5', applicationId: 'app-004', user: 'Jason Bloome', action: 'Status Change', timestamp: '2023-10-25 11:00 AM', details: 'Application status changed to "Approved".' },
    { id: 'act-6', applicationId: 'app-003', user: 'Peter Jones', action: 'Application Submitted', timestamp: '2023-09-24 08:00 AM', details: 'Application submitted for review.' },
];
