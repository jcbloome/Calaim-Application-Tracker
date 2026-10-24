import { buildIlsMifDedupeKey as buildIlsMifDedupeKeyStrict } from '@/lib/ils-mif-parse';

type IlsMifDedupeKeyInput = Parameters<typeof buildIlsMifDedupeKeyStrict>[0];

export const buildIlsMifDedupeKey = (row: Partial<IlsMifDedupeKeyInput>) =>
  buildIlsMifDedupeKeyStrict(row as IlsMifDedupeKeyInput);

export type FilterMode =
  | 'all'
  | 'not-in-caspio'
  | 'new'
  | 'caspio'
  | 'caspio-pending'
  | 'status-updates'
  | 'duplicates'
  | 'incomplete'
  | 'northern'
  | 'declined';

export const MASTER_FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Master list (all members)',
  'not-in-caspio': 'Not in Caspio',
  new: 'Not in Caspio',
  caspio: 'In Caspio (Kaiser)',
  'caspio-pending': 'CalAIM Status Pending',
  'status-updates': 'Caspio updates needed',
  duplicates: 'Batch duplicates',
  incomplete: 'Incomplete',
  northern: 'Northern · not in Caspio',
  declined: 'Declined',
};

/** Short plain-language help for the banner above the member table. */
export const MASTER_FILTER_HELP: Record<FilterMode, string> = {
  all: 'Every member on the consolidated master list.',
  'not-in-caspio':
    'Kaiser members not in Caspio yet (Create Application candidates). Denied members are under Northern not in Caspio / Declined.',
  new: 'Kaiser members not in Caspio yet (Create Application candidates). Denied members are under Northern not in Caspio / Declined.',
  caspio: 'Members already matched to a Kaiser Caspio record (any CalAIM status).',
  'caspio-pending':
    'Caspio CalAIM_Status is still Pending. That is not the same as “needs authorize push” — only members whose MIF auth end extends past Caspio appear under Caspio updates needed. If auth dates are already in Caspio, set CalAIM_Status to Authorized in Caspio (or Refresh Caspio after you change it).',
  'status-updates':
    'Actionable Caspio field updates from this MIF: Pending→Authorized (newer auth end), auth date extensions, or T2038 Requested→Received.',
  duplicates: 'Duplicate rows within the current upload batch.',
  incomplete: 'Rows missing required identity fields (e.g. Medi-Cal/CIN).',
  northern:
    'Northern California counties not yet in Caspio. Already-denied members stay listed with Denied service + date.',
  declined:
    'Members we denied services for (bulk Northern denial, single-auth, or Create App). Still appear on monthly MIF master with date.',
};

export type ConsolidationRunSummary = {
  id: string;
  createdAtIso: string;
  label: string;
  sourceFiles: string[];
  totals: {
    total: number;
    unique: number;
    caspio: number;
    duplicates: number;
    incomplete: number;
    northern: number;
  };
  newMemberCount: number;
  memberCount?: number;
  caspioMemberCount?: number;
  northernMemberCount?: number;
  declinedMemberCount?: number;
};

export type DeclinedMemberRecord = {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  memberMediCalNum: string;
  memberDob: string;
  clientId2: string;
  dedupeKey: string;
  sourceFileName: string;
  sourceType: string;
  declinedAtIso: string;
  emailSubject: string;
  emailBodyText: string;
  customText: string;
  actedByEmail: string;
  to: string[];
  cc: string[];
};

export type NorthernDeclineBatchMember = {
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  memberMediCalNum: string;
  dedupeKey: string;
};

export type NorthernDeclineBatchRecord = {
  id: string;
  sentAtIso: string;
  subject: string;
  emailBodyText: string;
  customText: string;
  memberCount: number;
  members: NorthernDeclineBatchMember[];
  actedByEmail: string;
  to: string[];
  cc: string[];
  runId: string;
};
