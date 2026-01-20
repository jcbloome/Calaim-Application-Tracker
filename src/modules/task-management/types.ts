// Centralized Task Management Types
// Unified types used across all task-related pages

export type HealthPlan = 'Kaiser' | 'Health Net' | 'Other';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'overdue' | 'due-today' | 'due-soon' | 'future' | 'completed' | 'on-hold';

// Base Task Interface - used across all task systems
export interface BaseTask {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  clientId: string;
  pathway: string;
  healthPlan: HealthPlan;
  
  // Status & Workflow
  currentStatus: string;
  nextStatus?: string;
  workflowStep: string;
  
  // Dates & Timing
  dueDate: string;
  lastUpdated: string;
  createdDate: string;
  
  // Assignment & Notes
  assignedTo: string;
  notes?: string;
  
  // Calculated Fields
  daysUntilDue: number;
  isOverdue: boolean;
  priority: TaskPriority;
  taskStatus: TaskStatus;
  nextAction: string;
  
  // Workflow Automation
  canAutoAdvance: boolean;
  autoAdvanceConditions?: string[];
  estimatedCompletionDays: number;
}

// Kaiser-specific task (extends BaseTask)
export interface KaiserTask extends BaseTask {
  healthPlan: 'Kaiser';
  kaiserStatus: string;
  calaimStatus: string;
  kaiserUserAssignment: string;
  t2038Status?: string;
  rnVisitStatus?: string;
  tierLevelStatus?: string;
  rcfeStatus?: string;
  ilsStatus?: string;
}

// Health Net-specific task (extends BaseTask)
export interface HealthNetTask extends BaseTask {
  healthPlan: 'Health Net';
  healthNetStatus: string;
  ispStatus?: string;
  authorizationStatus?: string;
}

// Unified Task type (union of all task types)
export type UnifiedTask = KaiserTask | HealthNetTask;

// Task Group for filtering and organization
export interface TaskGroup {
  name: string;
  tasks: UnifiedTask[];
  count: number;
  priority: TaskPriority;
  color: string;
  icon: string;
}

// Workflow Configuration
export interface WorkflowStep {
  status: string;
  nextStatus?: string;
  recommendedDays: number;
  requiredActions: string[];
  autoAdvanceConditions?: string[];
  canSkip: boolean;
  description: string;
}

export interface WorkflowConfig {
  name: string;
  healthPlan: HealthPlan;
  steps: WorkflowStep[];
  completionCriteria: string[];
}

// Status Styling Configuration
export interface StatusStyle {
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon: string;
  textColor: string;
}

// Task Filter Configuration
export interface TaskFilter {
  status?: string[];
  assignedTo?: string[];
  healthPlan?: HealthPlan[];
  priority?: TaskPriority[];
  daysUntilDue?: {
    min?: number;
    max?: number;
  };
  county?: string[];
  pathway?: string[];
}

// Smart Prioritization Configuration
export interface PrioritizationConfig {
  weights: {
    daysOverdue: number;
    memberComplexity: number;
    staffWorkload: number;
    pathwayCriticality: number;
    historicalDelay: number;
  };
  thresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

// Workflow Automation Configuration
export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  conditions: {
    status: string;
    daysInStatus: number;
    requiredDocuments?: string[];
    customConditions?: string[];
  };
  actions: {
    newStatus: string;
    assignTo?: string;
    addNote?: string;
    sendNotification?: boolean;
    scheduleReminder?: number; // days
  };
  enabled: boolean;
  healthPlan?: HealthPlan;
}

// Task Analytics
export interface TaskAnalytics {
  totalTasks: number;
  overdueTasks: number;
  completedThisWeek: number;
  averageCompletionTime: number;
  bottleneckStatuses: string[];
  staffWorkloadDistribution: Record<string, number>;
  priorityDistribution: Record<TaskPriority, number>;
  healthPlanDistribution: Record<HealthPlan, number>;
}

// Task Management Context State
export interface TaskManagementState {
  tasks: UnifiedTask[];
  filteredTasks: UnifiedTask[];
  taskGroups: Record<string, TaskGroup>;
  currentFilter: TaskFilter;
  analytics: TaskAnalytics;
  isLoading: boolean;
  error: string | null;
  
  // Workflow Automation
  automationRules: AutomationRule[];
  automationEnabled: boolean;
  
  // Smart Prioritization
  prioritizationConfig: PrioritizationConfig;
  smartSortEnabled: boolean;
}

// Action types for task management
export type TaskAction = 
  | { type: 'SET_TASKS'; payload: UnifiedTask[] }
  | { type: 'UPDATE_TASK'; payload: { id: string; updates: Partial<UnifiedTask> } }
  | { type: 'SET_FILTER'; payload: TaskFilter }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TOGGLE_AUTOMATION'; payload: boolean }
  | { type: 'UPDATE_AUTOMATION_RULE'; payload: AutomationRule }
  | { type: 'BULK_UPDATE_TASKS'; payload: { ids: string[]; updates: Partial<UnifiedTask> } }
  | { type: 'AUTO_ADVANCE_WORKFLOW'; payload: { taskId: string; newStatus: string } };