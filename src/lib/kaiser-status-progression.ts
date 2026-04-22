// Kaiser Status Progression System
// Based on Caspio Kaiser_ID_Status table with sort order

export interface KaiserStatus {
  id: number;
  status: string;
  sortOrder: number;
  description?: string;
  category: 'initial' | 'assessment' | 'authorization' | 'placement' | 'completion' | 'inactive';
  isActive: boolean;
}

const normalizeKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

// Central alias map so older labels still match current Caspio labels.
// Keys are normalized via normalizeKey().
export const KAISER_STATUS_ALIASES: Record<string, string> = {
  [normalizeKey('ILS Contract Email Needed')]: 'ILS/RCFE Contract Email Needed',
  [normalizeKey('ILS Contract Email Sent')]: 'ILS/RCFE Contract Email Sent',
  [normalizeKey('ILS/RCFE Contract Email Needed')]: 'ILS/RCFE Contract Email Needed',
  [normalizeKey('ILS/RCFE Contract Email Sent')]: 'ILS/RCFE Contract Email Sent',
  [normalizeKey('Non Active')]: 'Non-active',
  [normalizeKey('Non_Active')]: 'Non-active',
  [normalizeKey('On Hold')]: 'On-Hold',
  [normalizeKey('On_Hold')]: 'On-Hold',
  [normalizeKey('RN Visit Complete Pending Signatures')]: 'RN Visit Complete, Pending Signatures',
  [normalizeKey('RN Visit Complete - Pending Signatures')]: 'RN Visit Complete, Pending Signatures',
  [normalizeKey('Case Close')]: 'Case Closed',
  [normalizeKey('Final Member at RCFE')]: 'Final- Member at RCFE',
  [normalizeKey('Final - Member at RCFE')]: 'Final- Member at RCFE',
  [normalizeKey('Final- ILS/RCFE Contract Completed')]: 'Final- Member at RCFE',
  [normalizeKey('ILS/RCFE_Member_At_RCFE_Confirmed')]: 'Final- Member at RCFE',
  [normalizeKey('T2038 Auth Only Email')]: 'T2038_Auth_Email_Kaiser',
  [normalizeKey('T2038_Auth_Email_Kaiser')]: 'T2038_Auth_Email_Kaiser',
  [normalizeKey('T2038 Received, Need First Contact')]: 'T2038 received, Need First Contact',
  [normalizeKey('T2038 Received, Needs First Contact')]: 'T2038 received, Need First Contact',
  [normalizeKey('T2038 Received, Unreachable')]: 'T2038 received, Unreachable',
  [normalizeKey('T2038 Received, doc collection')]: 'T2038 received, doc collection',
  [normalizeKey('T2038 Received, Doc Collection')]: 'T2038 received, doc collection',
};

export function normalizeKaiserStatusName(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const normalized = normalizeKey(trimmed);
  const directAlias = KAISER_STATUS_ALIASES[normalized];
  if (directAlias) return directAlias;

  // Defensive normalization for legacy "Final ..." RCFE completion labels
  // that differ by punctuation/spacing in Caspio exports.
  const loose = normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const isFinalRcfeVariant =
    loose.includes('final') &&
    loose.includes('rcfe') &&
    (loose.includes('member at rcfe') || loose.includes('ils rcfe'));
  if (isFinalRcfeVariant) return 'Final- Member at RCFE';

  return trimmed;
}

export const KAISER_STATUS_PROGRESSION: KaiserStatus[] = [
  {
    id: 36,
    status: 'T2038, Not Requested, Doc Collection',
    sortOrder: 0,
    description: 'T2038 not requested; documentation collection underway',
    category: 'initial',
    isActive: true
  },
  {
    id: 35,
    status: 'T2038 Request Ready',
    sortOrder: 1,
    description: 'T2038 request is ready to be submitted',
    category: 'initial',
    isActive: true
  },
  {
    id: 1,
    status: 'T2038 Requested',
    sortOrder: 2,
    description: 'T2038 authorization has been formally requested',
    category: 'initial',
    isActive: true
  },
  {
    id: 21,
    status: 'T2038 received, Need First Contact',
    sortOrder: 4,
    description: 'T2038 received; first contact still needed',
    category: 'initial',
    isActive: true
  },
  {
    id: 52,
    status: 'T2038 received, Unreachable',
    sortOrder: 4.5,
    description: 'T2038 received; member unreachable',
    category: 'initial',
    isActive: true
  },
  {
    id: 20,
    status: 'T2038 received, doc collection',
    sortOrder: 5,
    description: 'T2038 received; document collection in progress',
    category: 'initial',
    isActive: true
  },
  {
    id: 33,
    status: 'T2038_Auth_Email_Kaiser',
    sortOrder: 5.4,
    description: 'T2038 authorization only email sent',
    category: 'authorization',
    isActive: true
  },
  {
    id: 40,
    status: 'RN Visit Needed',
    sortOrder: 6.5,
    description: 'RN visit required for assessment',
    category: 'assessment',
    isActive: true
  },
  {
    id: 12,
    status: 'RN/MSW Scheduled',
    sortOrder: 7,
    description: 'RN/MSW assessment visit has been scheduled',
    category: 'assessment',
    isActive: true
  },
  {
    id: 4,
    status: 'RN Visit Complete',
    sortOrder: 8,
    description: 'RN visit completed for member assessment',
    category: 'assessment',
    isActive: true
  },
  {
    id: 71,
    status: 'RN Visit Complete, Pending Signatures',
    sortOrder: 8.5,
    description: 'RN visit completed; signatures still pending before tier request',
    category: 'assessment',
    isActive: true
  },
  {
    id: 31,
    status: 'Tier Level Request Needed',
    sortOrder: 9,
    description: 'Tier level request is needed',
    category: 'assessment',
    // Not present in the current Caspio Kaiser status list; keep for backward-compat
    // but hide from the ordered active status list.
    isActive: false
  },
  {
    id: 5,
    status: 'Tier Level Requested',
    sortOrder: 10,
    description: 'Tier level assessment requested for member',
    category: 'assessment',
    isActive: true
  },
  {
    id: 6,
    status: 'Tier Level Received',
    sortOrder: 11,
    description: 'Tier level determination has been received',
    category: 'assessment',
    isActive: true
  },
  {
    id: 26,
    status: 'Tier Level Appeal',
    sortOrder: 11.2,
    description: 'Tier level determination is being appealed',
    category: 'assessment',
    isActive: true
  },
  {
    id: 37,
    status: 'RCFE Needed',
    sortOrder: 12,
    description: 'RCFE placement is needed for the member',
    category: 'placement',
    isActive: true
  },
  {
    id: 41,
    status: 'RCFE_Located',
    sortOrder: 14,
    description: 'Appropriate RCFE facility has been located',
    category: 'placement',
    isActive: true
  },
  {
    id: 39,
    status: 'R&B Needed',
    sortOrder: 14.1,
    description: 'Room and Board authorization needed',
    category: 'authorization',
    isActive: true
  },
  {
    id: 14,
    status: 'R&B Requested',
    sortOrder: 14.2,
    description: 'Room and Board authorization has been requested',
    category: 'authorization',
    isActive: true
  },
  {
    id: 15,
    status: 'R&B Signed',
    sortOrder: 14.3,
    description: 'Room and Board authorization has been signed',
    category: 'authorization',
    isActive: true
  },
  {
    id: 47,
    status: 'ILS/RCFE Contract Email Needed',
    sortOrder: 15.5,
    description: 'ILS/RCFE contract email needs to be sent',
    category: 'authorization',
    isActive: true
  },
  {
    id: 49,
    status: 'ILS/RCFE Contract Email Sent',
    sortOrder: 15.7,
    description: 'ILS/RCFE contract email sent',
    category: 'authorization',
    isActive: true
  },
  {
    id: 59,
    status: 'ILS/RCFE_Member_At_RCFE_Need_Conf',
    sortOrder: 15.8,
    description: 'Member is at RCFE; confirmation needed',
    category: 'placement',
    isActive: true
  },
  {
    id: 60,
    status: 'Final- Member at RCFE',
    sortOrder: 15.9,
    description: 'Final status: member at RCFE',
    category: 'completion',
    isActive: true
  },
  {
    id: 22,
    status: 'Non-active',
    sortOrder: 25,
    description: 'Case is currently non-active',
    category: 'inactive',
    isActive: false
  },
  {
    id: 25,
    status: 'On-Hold',
    sortOrder: 26,
    description: 'Case is temporarily on hold',
    category: 'inactive',
    isActive: false
  },
  {
    id: 72,
    status: 'Case Closed',
    sortOrder: 27,
    description: 'Case closed; member is no longer in program',
    category: 'inactive',
    isActive: false
  }
];

// Helper functions
export const getKaiserStatusById = (id: number): KaiserStatus | undefined => {
  return KAISER_STATUS_PROGRESSION.find(status => status.id === id);
};

export const getKaiserStatusByName = (statusName: string): KaiserStatus | undefined => {
  return KAISER_STATUS_PROGRESSION.find(status => status.status === statusName);
};

export const getKaiserStatusesByCategory = (category: KaiserStatus['category']): KaiserStatus[] => {
  return KAISER_STATUS_PROGRESSION.filter(status => status.category === category);
};

export const getActiveKaiserStatuses = (): KaiserStatus[] => {
  return KAISER_STATUS_PROGRESSION.filter(status => status.isActive);
};

export const getKaiserStatusesInOrder = (): KaiserStatus[] => {
  return [...KAISER_STATUS_PROGRESSION].sort((a, b) => a.sortOrder - b.sortOrder);
};

export const getNextKaiserStatus = (currentStatusId: number): KaiserStatus | undefined => {
  const currentStatus = getKaiserStatusById(currentStatusId);
  if (!currentStatus) return undefined;
  
  const orderedStatuses = getKaiserStatusesInOrder();
  const currentIndex = orderedStatuses.findIndex(status => status.id === currentStatusId);
  
  if (currentIndex === -1 || currentIndex === orderedStatuses.length - 1) return undefined;
  
  return orderedStatuses[currentIndex + 1];
};

export const getPreviousKaiserStatus = (currentStatusId: number): KaiserStatus | undefined => {
  const currentStatus = getKaiserStatusById(currentStatusId);
  if (!currentStatus) return undefined;
  
  const orderedStatuses = getKaiserStatusesInOrder();
  const currentIndex = orderedStatuses.findIndex(status => status.id === currentStatusId);
  
  if (currentIndex <= 0) return undefined;
  
  return orderedStatuses[currentIndex - 1];
};

export const getKaiserStatusProgress = (currentStatusId: number): {
  current: KaiserStatus;
  progress: number;
  totalSteps: number;
  category: string;
} | undefined => {
  const currentStatus = getKaiserStatusById(currentStatusId);
  if (!currentStatus) return undefined;
  
  const activeStatuses = getActiveKaiserStatuses();
  const orderedActiveStatuses = activeStatuses.sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = orderedActiveStatuses.findIndex(status => status.id === currentStatusId);
  
  if (currentIndex === -1) return undefined;
  
  return {
    current: currentStatus,
    progress: currentIndex + 1,
    totalSteps: orderedActiveStatuses.length,
    category: currentStatus.category
  };
};