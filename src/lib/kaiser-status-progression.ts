// Kaiser Status Progression with Sort Order and Next Steps
export interface KaiserStatusStep {
  id: number;
  status: string;
  sortOrder: number;
  nextStep?: string;
  description?: string;
  category: 'T2038' | 'RN' | 'TierLevel' | 'RCFE' | 'RB' | 'ILS' | 'Other';
}

export const KAISER_STATUS_PROGRESSION: KaiserStatusStep[] = [
  // T2038 Process (Initial Authorization)
  { id: 36, status: 'T2038, Not Requested, Doc Collection', sortOrder: 0, nextStep: 'T2038 Request Ready', category: 'T2038' },
  { id: 35, status: 'T2038 Request Ready', sortOrder: 1, nextStep: 'T2038 Requested', category: 'T2038' },
  { id: 1, status: 'T2038 Requested', sortOrder: 2, nextStep: 'T2038 received, Need First Contact', category: 'T2038' },
  { id: 21, status: 'T2038 received, Need First Contact', sortOrder: 4, nextStep: 'T2038 received, doc collection', category: 'T2038' },
  { id: 20, status: 'T2038 received, doc collection', sortOrder: 5, nextStep: 'T2038 Auth Only Email', category: 'T2038' },
  { id: 33, status: 'T2038 Auth Only Email', sortOrder: 5.4, nextStep: 'RN Visit Needed', category: 'T2038' },
  
  // RN Process (Nursing Assessment)
  { id: 40, status: 'RN Visit Needed', sortOrder: 6.5, nextStep: 'RN/MSW Scheduled', category: 'RN' },
  { id: 12, status: 'RN/MSW Scheduled', sortOrder: 7, nextStep: 'RN Visit Complete', category: 'RN' },
  { id: 4, status: 'RN Visit Complete', sortOrder: 8, nextStep: 'Tier Level Request Needed', category: 'RN' },
  
  // Tier Level Process (Care Level Determination)
  { id: 31, status: 'Tier Level Request Needed', sortOrder: 9, nextStep: 'Tier Level Requested', category: 'TierLevel' },
  { id: 5, status: 'Tier Level Requested', sortOrder: 10, nextStep: 'Tier Level Received', category: 'TierLevel' },
  { id: 6, status: 'Tier Level Received', sortOrder: 11, nextStep: 'Tier Level Appeal', category: 'TierLevel' },
  { id: 26, status: 'Tier Level Appeal', sortOrder: 11.2, nextStep: 'RCFE Needed', category: 'TierLevel' },
  
  // RCFE Process (Residential Care Facility)
  { id: 37, status: 'RCFE Needed', sortOrder: 12, nextStep: 'RCFE_Located', category: 'RCFE' },
  { id: 41, status: 'RCFE_Located', sortOrder: 14, nextStep: 'R&B Needed', category: 'RCFE' },
  
  // R&B Process (Room & Board)
  { id: 39, status: 'R&B Needed', sortOrder: 14.1, nextStep: 'R&B Requested', category: 'RB' },
  { id: 14, status: 'R&B Requested', sortOrder: 14.2, nextStep: 'R&B Signed', category: 'RB' },
  { id: 15, status: 'R&B Signed', sortOrder: 14.3, nextStep: 'ILS Sent for Contract', category: 'RB' },
  
  // ILS Process (Independent Living Services)
  { id: 38, status: 'ILS Sent for Contract', sortOrder: 16, nextStep: null, category: 'ILS' },
  
  // Final Statuses
  { id: 22, status: 'Non-active', sortOrder: 22, nextStep: null, category: 'Other' },
  { id: 25, status: 'On-Hold', sortOrder: 23, nextStep: null, category: 'Other' },
];

// Helper functions
export function getKaiserStatusById(id: number): KaiserStatusStep | undefined {
  return KAISER_STATUS_PROGRESSION.find(step => step.id === id);
}

export function getKaiserStatusByName(status: string): KaiserStatusStep | undefined {
  return KAISER_STATUS_PROGRESSION.find(step => step.status === status);
}

export function getNextStep(currentStatus: string): string | null {
  const currentStep = getKaiserStatusByName(currentStatus);
  return currentStep?.nextStep || null;
}

export function getSortedKaiserStatuses(): KaiserStatusStep[] {
  return [...KAISER_STATUS_PROGRESSION].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getKaiserStatusesByCategory(category: KaiserStatusStep['category']): KaiserStatusStep[] {
  return KAISER_STATUS_PROGRESSION.filter(step => step.category === category);
}

// Get the next logical step in the progression
export function getNextStepInProgression(currentStatus: string): KaiserStatusStep | null {
  const currentStep = getKaiserStatusByName(currentStatus);
  if (!currentStep || !currentStep.nextStep) return null;
  
  return getKaiserStatusByName(currentStep.nextStep) || null;
}

// Check if a status is a final status (no next step)
export function isFinalStatus(status: string): boolean {
  const step = getKaiserStatusByName(status);
  return step ? !step.nextStep : false;
}

// Get all possible next steps for a given status
export function getPossibleNextSteps(currentStatus: string): KaiserStatusStep[] {
  const currentStep = getKaiserStatusByName(currentStatus);
  if (!currentStep) return [];
  
  // Return steps that come after the current step in sort order
  return KAISER_STATUS_PROGRESSION.filter(step => 
    step.sortOrder > currentStep.sortOrder && 
    step.category !== 'Other'
  ).slice(0, 3); // Limit to next 3 logical steps
}