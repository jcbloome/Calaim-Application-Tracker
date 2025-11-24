
import { Application, Acronym, Activity } from './definitions';

export const applications: (Application & { healthPlan?: string; referrerName?: string; ispContactName?: string; agency?: string; })[] = [
  {
    id: 'app-001',
    memberName: 'John Doe',
    status: 'In Progress',
    healthPlan: 'Kaiser Permanente',
    lastUpdated: '2023-10-26',
    pathway: 'SNF Transition',
    progress: 40,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Completed', type: 'Form', href: '/forms/hipaa-authorization' },
      { name: 'Liability Waiver', status: 'Pending', type: 'Upload', href: '#', downloadHref: '#' },
      { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#', downloadHref: '#' },
      { name: 'Physician\'s Report', status: 'Pending', type: 'Upload', href: '#', downloadHref: '#' },
    ],
    referrerName: 'Jason Bloome',
    ispContactName: 'Dr. Emily Carter',
    agency: 'Care Home Finders',
  },
  {
    id: 'app-002',
    memberName: 'Jane Smith',
    status: 'Requires Revision',
    healthPlan: 'Health Net',
    lastUpdated: '2023-10-25',
    pathway: 'SNF Diversion',
    progress: 75,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Pending', type: 'Form', href: '/forms/hipaa-authorization' },
      { name: 'Liability Waiver', status: 'Pending', type: 'Upload', href: '#', downloadHref: '#' },
      { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'Upload', href: '#', downloadHref: '#' },
      { name: 'Declaration of Eligibility (SNF Diversion)', status: 'Pending', type: 'Upload', href: '#', downloadHref: '#' },
      { name: 'Program Information', status: 'Pending', type: 'Info', href: '/info' },
    ],
    referrerName: 'Social Worker Agency',
    ispContactName: 'Dr. Michael Ramirez',
    agency: 'Social Worker Agency',
  },
  {
    id: 'd311d971-e3af-43ab-9fc2-89065ee78e8a',
    memberName: 'Jane Smith (Test)',
    status: 'In Progress',
    healthPlan: 'Health Net',
    lastUpdated: '2023-10-28',
    pathway: 'SNF Diversion',
    progress: 25,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Completed', type: 'Form', href: '/forms/hipaa-authorization' },
      { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '#' },
      { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'online-form', href: '#' },
      { name: 'Declaration of Eligibility (SNF Diversion)', status: 'Pending', type: 'upload', href: '#' },
       { name: 'Program Information', status: 'Pending', type: 'info', href: '/info' },
    ],
     referrerName: 'Jason Bloome',
    ispContactName: 'Dr. Emily Carter',
    agency: 'Care Home Finders',
  },
  {
    id: 'app-003',
    memberName: 'Peter Jones',
    status: 'Completed & Submitted',
    healthPlan: 'Kaiser Permanente',
    lastUpdated: '2023-10-24',
    pathway: 'SNF Transition',
    progress: 100,
    forms: [],
    referrerName: 'Hospital Discharge Planner',
    ispContactName: 'Dr. Sarah Connor',
    agency: 'Community Hospital',
  },
  {
    id: 'app-004',
    memberName: 'Mary Johnson',
    status: 'Approved',
    healthPlan: 'Health Net',
    lastUpdated: '2023-10-20',
    pathway: 'SNF Diversion',
    progress: 100,
    forms: [],
     referrerName: 'Jason Bloome',
    ispContactName: 'Dr. Michael Ramirez',
    agency: 'Care Home Finders',
  },
    {
    id: 'app-005',
    memberName: 'Chris Lee',
    status: 'In Progress',
    healthPlan: 'Kaiser Permanente',
    lastUpdated: '2023-10-27',
    pathway: 'SNF Diversion',
    progress: 15,
    forms: [],
    referrerName: 'Family Member',
    ispContactName: 'Dr. Emily Carter',
    agency: 'N/A',
  },
];

export const acronyms: Acronym[] = [
  { term: 'RCFE', definition: 'Residential Care Facility for the Elderly' },
  { term: 'SNF', definition: 'Skilled Nursing Facility' },
  { term: 'MCP', definition: 'Managed Care Plan' },
  { term: 'SOC', definition: 'Share of Cost' },
  { term: 'ISP', definition: 'Individual Service Plan' },
  { term: 'HIPAA', definition: 'Health Insurance Portability and Accountability Act' },
  { term: 'MRN', definition: 'Medical Record Number' },
  { term: 'DOB', definition: 'Date of Birth' },
];

export const activities: Activity[] = [
  { id: 'act-1', user: 'Admin', action: 'Status Change', timestamp: '2023-10-27 10:00 AM', details: 'Application #app-002 status changed to "Requires Revision".' },
  { id: 'act-2', user: 'Jane Smith', action: 'Form Submitted', timestamp: '2023-10-27 09:45 AM', details: 'Submitted "Proof of Income" for application #app-002.' },
  { id: 'act-3', user: 'Admin', action: 'New Application', timestamp: '2023-10-27 09:30 AM', details: 'Application #app-005 created for Chris Lee.' },
  { id: 'act-4', user: 'John Doe', action: 'Form Started', timestamp: '2023-10-26 03:15 PM', details: 'Started "Liability Waiver" for application #app-001.' },
  { id: 'act-5', user: 'Admin', action: 'Application Approved', timestamp: '2023-10-25 11:00 AM', details: 'Application #app-004 was approved.' },
];

const getTopCounts = (data: typeof applications, key: keyof typeof applications[0]) => {
  const counts = data.reduce((acc, app) => {
    const item = app[key] as string | undefined;
    if (item && item !== 'N/A') {
      acc[item] = (acc[item] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

export const statsData = {
  byMcp: [
    { name: 'Kaiser Permanente', value: 120 },
    { name: 'Health Net', value: 230 },
    { name: 'Other', value: 45 },
  ],
  byCounty: [
    { name: 'Los Angeles', value: 150 },
    { name: 'San Diego', value: 90 },
    { name: 'Orange', value: 65 },
    { name: 'Riverside', value: 50 },
    { name: 'San Bernardino', value: 40 },
  ],
  byPathway: [
    { name: 'SNF Transition', value: 250 },
    { name: 'SNF Diversion', value: 145 },
  ],
  monthly: [
    { month: 'Jan', total: 30 },
    { month: 'Feb', total: 45 },
    { month: 'Mar', total: 38 },
    { month: 'Apr', total: 55 },
    { month: 'May', total: 62 },
    { month: 'Jun', total: 70 },
  ],
  topIspContacts: getTopCounts(applications, 'ispContactName'),
  topReferrers: getTopCounts(applications, 'agency'),
};
