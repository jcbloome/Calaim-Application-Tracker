

import { Application, Acronym, Activity } from './definitions';
import { format } from 'date-fns';

export const applications: (Omit<Application, 'userId'> & { id: string; userId: string; memberName?: string; healthPlan?: string; referrerName?: string; ispContactName?: string; agency?: string; memberMrn?: string; })[] = [
  {
    id: 'app-001',
    userId: 'user-001',
    memberFirstName: 'John',
    memberLastName: 'Doe',
    memberCounty: 'Los Angeles',
    memberMrn: 'mrn-test-999',
    status: 'In Progress',
    healthPlan: 'Kaiser Permanente',
    lastUpdated: '2023-10-26',
    pathway: 'SNF Transition',
    progress: 40,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Completed', type: 'online-form', href: '/forms/hipaa-authorization' },
      { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '/forms/liability-waiver' },
      { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'online-form', href: '/forms/freedom-of-choice' },
      { name: 'Proof of Income', status: 'Pending', type: 'upload', href: '#' },
      { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'upload', href: '#' },
      { name: "Medicine List", status: 'Pending', type: 'upload', href: '#' },
    ],
    referrerName: 'Jason Bloome',
    ispContactName: 'Dr. Emily Carter',
    agency: 'Care Home Finders',
  },
  {
    id: 'app-002',
    userId: 'user-002',
    memberFirstName: 'Jane',
    memberLastName: 'Smith',
    memberCounty: 'Los Angeles',
    memberMrn: 'MRN-TEST-007',
    status: 'In Progress',
    healthPlan: 'Health Net',
    lastUpdated: '2023-10-25',
    pathway: 'SNF Diversion',
    progress: 75,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '/forms/hipaa-authorization' },
      { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '/forms/liability-waiver' },
      { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'online-form', href: '/forms/freedom-of-choice' },
      { name: 'Declaration of Eligibility (SNF Diversion)', status: 'Pending', type: 'upload', href: '#' },
      { name: 'Program Information', status: 'Pending', type: 'info', href: '/info' },
    ],
    referrerName: 'Social Worker Agency',
    ispContactName: 'Dr. Michael Ramirez',
    agency: 'Social Worker Agency',
  },
  {
    id: 'd311d971-e3af-43ab-9fc2-89065ee78e8a',
    userId: 'user-001',
    memberFirstName: 'Jane',
    memberLastName: 'Smith (Test)',
    memberCounty: 'Los Angeles',
    memberMrn: 'mrn-test-008',
    status: 'In Progress',
    healthPlan: 'Health Net',
    lastUpdated: '2023-09-28',
    pathway: 'SNF Diversion',
    progress: 25,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Completed', type: 'online-form', href: '/forms/hipaa-authorization' },
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
    userId: 'user-003',
    memberFirstName: 'Peter',
    memberLastName: 'Jones',
    memberCounty: 'Los Angeles',
    memberMrn: 'mrn-test-004',
    status: 'In Progress',
    healthPlan: 'Kaiser Permanente',
    lastUpdated: '2023-09-24',
    pathway: 'SNF Transition',
    progress: 100,
    forms: [
        { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '' },
        { name: 'HIPAA Authorization', status: 'Completed', type: 'online-form', href: '' },
        { name: 'Liability Waiver', status: 'Completed', type: 'online-form', href: '' },
        { name: 'Freedom of Choice Waiver', status: 'Completed', type: 'online-form', href: '' },
    ],
    referrerName: 'Hospital Discharge Planner',
    ispContactName: 'Dr. Sarah Connor',
    agency: 'Community Hospital',
  },
  {
    id: 'app-004',
    userId: 'user-001',
    memberFirstName: 'Mary',
    memberLastName: 'Johnson',
    memberCounty: 'Los Angeles',
    memberMrn: 'mrn-test-005',
    status: 'In Progress',
    healthPlan: 'Health Net',
    lastUpdated: '2023-08-20',
    pathway: 'SNF Diversion',
    progress: 100,
    forms: [
        { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '' },
        { name: 'HIPAA Authorization', status: 'Completed', type: 'online-form', href: '' },
        { name: 'Liability Waiver', status: 'Completed', type: 'online-form', href: '' },
        { name: 'Freedom of Choice Waiver', status: 'Completed', type: 'online-form', href: '' },
    ],
     referrerName: 'Jason Bloome',
    ispContactName: 'Dr. Michael Ramirez',
    agency: 'Care Home Finders',
  },
    {
    id: 'app-005',
    userId: 'user-002',
    memberFirstName: 'Chris',
    memberLastName: 'Lee',
    memberCounty: 'Los Angeles',
    memberMrn: 'mrn-test-006',
    status: 'In Progress',
    healthPlan: 'Kaiser Permanente',
    lastUpdated: '2023-08-27',
    pathway: 'SNF Diversion',
    progress: 15,
    forms: [
        { name: 'CS Member Summary', status: 'Pending', type: 'online-form', href: '' },
        { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '' },
    ],
    referrerName: 'Family Member',
    ispContactName: 'Dr. Emily Carter',
    agency: 'N/A',
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


type Stats = {
  byMcp: { name: string; value: number }[];
  byPathway: { name: string; value: number }[];
  byCounty: { name: string; value: number }[];
  monthly: { month: string; total: number }[];
  topIspContacts: { name: string; value: number }[];
  topReferrers: { name: string; value: number }[];
};

const calculateStats = (apps: typeof applications): Stats => {
  const byMcp: Record<string, number> = {};
  const byPathway: Record<string, number> = {};
  const byCounty: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const topIspContacts: Record<string, number> = {};
  const topReferrers: Record<string, number> = {};

  for (const app of apps) {
    if (app.healthPlan) {
      byMcp[app.healthPlan] = (byMcp[app.healthPlan] || 0) + 1;
    }
    if (app.pathway) {
      byPathway[app.pathway] = (byPathway[app.pathway] || 0) + 1;
    }
    // `memberCounty` doesn't exist on the base type, so we'll assume it might.
    const county = (app as any).memberCounty;
    if (county) {
        byCounty[county] = (byCounty[county] || 0) + 1;
    }

    if (app.lastUpdated) {
        try {
            const month = format(new Date(app.lastUpdated), 'MMM');
            monthly[month] = (monthly[month] || 0) + 1;
        } catch (e) {
            console.error(`Invalid date format for app ${app.id}: ${app.lastUpdated}`);
        }
    }

    if (app.ispContactName) {
      topIspContacts[app.ispContactName] = (topIspContacts[app.ispContactName] || 0) + 1;
    }
    if (app.agency && app.agency !== 'N/A') {
      topReferrers[app.agency] = (topReferrers[app.agency] || 0) + 1;
    }
  }
  
  const formatForChart = (data: Record<string, number>) => {
      return Object.entries(data)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
  }
  
  // Create a sorted list of months for the chart
  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sortedMonthly = Object.entries(monthly)
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));


  return {
    byMcp: formatForChart(byMcp),
    byPathway: formatForChart(byPathway),
    byCounty: formatForChart(byCounty),
    monthly: sortedMonthly,
    topIspContacts: formatForChart(topIspContacts),
    topReferrers: formatForChart(topReferrers),
  };
};

export const statsData = calculateStats(applications);
