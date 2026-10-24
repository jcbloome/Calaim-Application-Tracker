import { UploadCloud, Printer, FileText, Link as LinkIcon } from 'lucide-react';
import { LIC_602A_FORM_URL } from '@/lib/form-links';
import { getKaiserStatusesInOrder } from '@/lib/kaiser-status-progression';
import { requiresSnfFacesheet } from '@/lib/snf-residency';

// Get Kaiser statuses in proper sort order
export const kaiserSteps = getKaiserStatusesInOrder().map(status => status.status);

export const HEALTH_NET_PROCESS_STATUS_OPTIONS = [
  '1- On Hold (Not Interested)',
  '2- On Hold (Not Yet HN)',
  '3- Waiting for Papers',
  '4- Ready to Process',
  '5- ISP in Progress',
  '6- Submitted, Waiting for Auth',
  '7- Authorized',
];

export const parseNumericPrefix = (value: string): number => {
  const match = String(value || '').trim().match(/^(\d+)\s*-/);
  const n = match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

export const normalizeHealthNetStatusLabel = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^\d+\s*-\s*/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const healthNetSteps = [...HEALTH_NET_PROCESS_STATUS_OPTIONS].sort((a, b) => {
  const byPrefix = parseNumericPrefix(a) - parseNumericPrefix(b);
  if (byPrefix !== 0) return byPrefix;
  return a.localeCompare(b);
});

export const resolveHealthNetStatus = (raw: string): string => {
  const value = String(raw || '').trim();
  if (!value) return '';
  const exact = healthNetSteps.find((s) => s === value);
  if (exact) return exact;
  const normalized = normalizeHealthNetStatusLabel(value);
  return healthNetSteps.find((s) => normalizeHealthNetStatusLabel(s) === normalized) || '';
};

export const calaimTrackingOptions = [
  'CalAIM Eligible',
  'Not CalAIM Eligible'
];

export const notEligibleReasonOptions = [
  'Switching Providers by end of Month',
  'Has SOC',
  'Not in our contracted CalAIM County',
  'Might be eligible',
  'Not with Health Net',
  'Not with Kaiser',
  'Other'
];

export const STRICT_UPLOAD_REQUIRED_FOR_COMPLETION = new Set([
  'Medicine List',
  'Declaration of Eligibility',
]);
/** Staff may mark these complete without an in-app upload (e.g. family emailed the signed form). */
export const ALLOW_COMPLETE_WITHOUT_UPLOAD = new Set([
  "LIC 602A - Physician's Report",
]);
export const PROCESS_TRACKER_REVIEW_TARGETS = new Set([
  'CS Member Summary',
  'CS Summary',
  'Proof of Income',
  "LIC 602A - Physician's Report",
  'Medicine List',
]);

export const PROGRAM_INFO_GUIDE_URL = 'https://connectcalaim.com/info/eligibility';
export const HEALTH_NET_MANAGER_SIGNATURE = 'Leidy Kanjanapitak';
export const HEALTH_NET_MANAGER_EMAIL = 'leidy@carehomefinders.com';
export const DEFAULT_COORDINATOR_EMAIL = 'calaim@carehomefinders.com';
export const CONNECT_CALAIM_WEBSITE = 'https://connectcalaim.com';

export const getAuthorizationTypes = (healthPlan?: string) => {
  const normalized = String(healthPlan || '').toLowerCase();
  if (normalized.includes('health net')) {
    return ['T2038', 'H2022'];
  }
  return ['T2038'];
};

export type PathwayRequirement = {
  id: string;
  title: string;
  description: string;
  type: string;
  icon: typeof FileText;
  href: string;
  editHref?: string;
  links?: Array<{ name: string; url: string }>;
};

export const getPathwayRequirements = (
  pathway: 'SNF Transition' | 'SNF Diversion',
  healthPlan?: string,
  currentLocation?: string | null
): PathwayRequirement[] => {
  const normalizedPathway = String(pathway || '').trim().toLowerCase();
  const normalizedPlan = String(healthPlan || '').trim().toLowerCase();
  const isHealthNet = normalizedPlan.includes('health net');
  const isKaiser = normalizedPlan.includes('kaiser');
  const commonRequirements: PathwayRequirement[] = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/admin/forms/review', editHref: '/admin/forms/edit', icon: FileText },
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the waivers electronically, or print the form for the member or authorized representative to sign and upload the signed copy.', type: 'online-form', href: '/admin/forms/waivers', icon: FileText },
    { id: 'room-board-obligation', title: 'Room and Board/Tier Level Agreement', description: 'Admin-generated agreement addressed to the member/authorized representative and RCFE. Upload the fully signed copy here.', type: 'Upload', icon: UploadCloud, href: '/forms/room-board-obligation/printable' },
    { id: 'proof-of-income', title: "Proof of Income", description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'Upload', icon: UploadCloud, href: '#' },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'Upload', icon: Printer, href: LIC_602A_FORM_URL },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'Upload', icon: UploadCloud, href: '#' },
     {
      id: 'eligibility-screenshot',
      title: 'Eligibility Screenshot',
      description: 'Upload both required screenshots from the provider portal: member page and benefits coverage.',
      type: 'Upload',
      icon: LinkIcon,
      links: [
        { name: 'Health Net Portal', url: 'https://sso.entrykeyid.com/as/authorization.oauth2?response_type=code&client_id=44eb17c3-cf1e-4479-a811-61d23ae8ffbd&scope=openid%20profile&state=AHTpvDa32bFDvM5ov3mwyNx0K75Gqqp4McPzc6oUgds%3D&redirect_uri=https://provider.healthnetcalifornia.com/careconnect/login/oauth2/code/pingcloud&code_challenge_method=S256&nonce=maCZdZx6F1X7mug7ZQiIcWILmxz29uLnBvZQ6mNj4LE&code_challenge=45qFtSM3GXeNCBHkpyU9vJmOwqtKUwYdcb7VJBbw6YA&app_origin=https://provider.healthnetcalifornia.com/careconnect/login/oauth2/code/pingcloud&brand=healthnet' },
        { name: 'Availity (Health Net double-check)', url: 'https://essentials.availity.com/static/public/onb/onboarding-ui-apps/availity-fr-ui/#/login' },
        { name: 'Kaiser South Portal', url: 'https://healthy.kaiserpermanente.org/southern-california/community-providers/eligibility' },
        { name: 'Kaiser North Portal', url: 'https://healthy.kaiserpermanente.org/northern-california/community-providers/eligibility' },
      ],
      href: '#'
    },
  ];

  const eligibilityReq = commonRequirements.find((req) => req.id === 'eligibility-screenshot');
  if (eligibilityReq && Array.isArray(eligibilityReq.links)) {
    if (isHealthNet) {
      eligibilityReq.links = eligibilityReq.links.filter((link) => {
        const name = String(link?.name || '').toLowerCase();
        return name.includes('health net') || name.includes('availity');
      });
    } else if (isKaiser) {
      eligibilityReq.links = eligibilityReq.links.filter((link) =>
        String(link?.name || '').toLowerCase().includes('kaiser')
      );
    }
  }

  // Proof of income is required for Kaiser but not required for Health Net.
  const normalizedHealthPlan = String(healthPlan || '').trim();
  const filteredCommonRequirements =
    normalizedHealthPlan === 'Health Net'
      ? commonRequirements.filter((req) => req.id !== 'proof-of-income')
      : commonRequirements;
  const snfFacesheetRequirement: PathwayRequirement = {
    id: 'snf-facesheet',
    title: 'SNF Facesheet',
    description:
      "Upload the resident's facesheet from the Skilled Nursing Facility. Member must have resided in SNF for at least 60 days (hospital–SNF Medicare and Medi-Cal days may be combined). Required for SNF Transition.",
    type: 'Upload',
    icon: UploadCloud,
    href: '#',
  };
  const needsFacesheet = requiresSnfFacesheet({ pathway, currentLocation });
  if (normalizedPathway === 'snf diversion') {
    const isHealthNet = normalizedHealthPlan === 'Health Net';
    return [
      ...filteredCommonRequirements,
      ...(isHealthNet
        ? [
            {
              id: 'declaration-of-eligibility',
              title: 'Declaration of Eligibility',
              description: 'Download the form, have it signed by a PCP, and upload it here.',
              type: 'Upload',
              icon: Printer,
              href: '/forms/declaration-of-eligibility/printable',
            },
          ]
        : []),
      ...(needsFacesheet ? [snfFacesheetRequirement] : []),
    ];
  }
  
  if (normalizedPathway === 'snf transition' || needsFacesheet) {
    return [
        ...filteredCommonRequirements,
        snfFacesheetRequirement,
    ];
  }

  return filteredCommonRequirements;
};
