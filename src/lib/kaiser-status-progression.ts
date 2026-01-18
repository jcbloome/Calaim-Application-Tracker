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

export const KAISER_STATUS_PROGRESSION: KaiserStatus[] = [
  // Initial Request Phase
  {
    id: 35,
    status: 'T2038 Request Received',
    sortOrder: 1,
    description: 'Initial T2038 request has been received and logged',
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
    status: 'T2038 received, pending review',
    sortOrder: 4,
    description: 'T2038 documentation received and awaiting review',
    category: 'initial',
    isActive: true
  },
  {
    id: 20,
    status: 'T2038 received, pending review',
    sortOrder: 5,
    description: 'T2038 documentation received and pending review process',
    category: 'initial',
    isActive: true
  },
  {
    id: 33,
    status: 'T2038 Auth Only',
    sortOrder: 5.4,
    description: 'T2038 authorization only, no additional services',
    category: 'authorization',
    isActive: true
  },
  {
    id: 40,
    status: 'RN Visit Needed',
    sortOrder: 6.5,
    description: 'Registered Nurse visit required for assessment',
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
    status: 'RN Visit',
    sortOrder: 8,
    description: 'RN visit completed for member assessment',
    category: 'assessment',
    isActive: true
  },
  {
    id: 31,
    status: 'Tier Level Requested',
    sortOrder: 9,
    description: 'Tier level determination has been requested',
    category: 'assessment',
    isActive: true
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
    status: 'ILS Contract Emailed',
    sortOrder: 15.5,
    description: 'Independent Living Services contract has been emailed',
    category: 'authorization',
    isActive: true
  },
  {
    id: 38,
    status: 'ILS Sent for Contract',
    sortOrder: 16,
    description: 'ILS documentation sent for contract processing',
    category: 'authorization',
    isActive: true
  },
  {
    id: 22,
    status: 'Non-active',
    sortOrder: 22,
    description: 'Case is currently non-active',
    category: 'inactive',
    isActive: false
  },
  {
    id: 25,
    status: 'On-Hold',
    sortOrder: 23,
    description: 'Case is temporarily on hold',
    category: 'inactive',
    isActive: false
  },
  {
    id: 36,
    status: 'T2038, Not Required',
    sortOrder: 0,
    description: 'T2038 authorization determined not required',
    category: 'completion',
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