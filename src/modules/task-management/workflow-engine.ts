// Workflow Automation Engine (Option B)
// Centralizes workflow progression logic and enables automation

import type { 
  WorkflowConfig, 
  WorkflowStep, 
  AutomationRule, 
  UnifiedTask, 
  HealthPlan 
} from './types';
import { calculateRecommendedDueDate, addBusinessDays } from './date-utils';

// Kaiser Workflow Configuration (centralized from multiple files)
export const KAISER_WORKFLOW: WorkflowConfig = {
  name: 'Kaiser Permanente CalAIM Workflow',
  healthPlan: 'Kaiser',
  steps: [
    {
      status: 'Pre-T2038, Compiling Docs',
      nextStatus: 'T2038 Requested',
      recommendedDays: 7,
      requiredActions: ['Gather member documentation', 'Complete initial assessment'],
      autoAdvanceConditions: ['documents_complete', 'assessment_reviewed'],
      canSkip: false,
      description: 'Compile all necessary documentation before T2038 request'
    },
    {
      status: 'T2038 Requested',
      nextStatus: 'T2038 Received',
      recommendedDays: 14,
      requiredActions: ['Submit T2038 request', 'Follow up with Kaiser'],
      autoAdvanceConditions: ['t2038_received'],
      canSkip: false,
      description: 'T2038 authorization request submitted to Kaiser'
    },
    {
      status: 'T2038 Received',
      nextStatus: 'T2038 received, Need First Contact',
      recommendedDays: 3,
      requiredActions: ['Review T2038 details', 'Plan member contact'],
      autoAdvanceConditions: ['t2038_reviewed'],
      canSkip: false,
      description: 'T2038 authorization received, ready for member contact'
    },
    {
      status: 'T2038 received, Need First Contact',
      nextStatus: 'T2038 received, doc collection',
      recommendedDays: 7,
      requiredActions: ['Contact member', 'Schedule initial meeting'],
      autoAdvanceConditions: ['member_contacted', 'meeting_scheduled'],
      canSkip: false,
      description: 'Initial member contact required'
    },
    {
      status: 'T2038 received, doc collection',
      nextStatus: 'RN Visit Needed',
      recommendedDays: 14,
      requiredActions: ['Collect additional documents', 'Verify member information'],
      autoAdvanceConditions: ['documents_collected', 'info_verified'],
      canSkip: false,
      description: 'Collect additional required documentation'
    },
    {
      status: 'RN Visit Needed',
      nextStatus: 'RN/MSW Scheduled',
      recommendedDays: 7,
      requiredActions: ['Schedule RN assessment', 'Coordinate with member'],
      autoAdvanceConditions: ['rn_visit_scheduled'],
      canSkip: false,
      description: 'RN assessment visit required'
    },
    {
      status: 'RN/MSW Scheduled',
      nextStatus: 'RN Visit Complete',
      recommendedDays: 14,
      requiredActions: ['Conduct RN visit', 'Complete assessment'],
      autoAdvanceConditions: ['rn_visit_completed', 'assessment_submitted'],
      canSkip: false,
      description: 'RN/MSW assessment visit scheduled'
    },
    {
      status: 'RN Visit Complete',
      nextStatus: 'Tier Level Requested',
      recommendedDays: 3,
      requiredActions: ['Review RN assessment', 'Prepare tier level request'],
      autoAdvanceConditions: ['assessment_reviewed', 'tier_request_ready'],
      canSkip: false,
      description: 'RN assessment completed, ready for tier level request'
    },
    {
      status: 'Tier Level Requested',
      nextStatus: 'Tier Level Received',
      recommendedDays: 14,
      requiredActions: ['Submit tier level request', 'Follow up with Kaiser'],
      autoAdvanceConditions: ['tier_level_received'],
      canSkip: false,
      description: 'Tier level determination requested'
    },
    {
      status: 'Tier Level Received',
      nextStatus: 'RCFE Needed',
      recommendedDays: 3,
      requiredActions: ['Review tier level', 'Begin RCFE search'],
      autoAdvanceConditions: ['tier_level_approved', 'rcfe_search_started'],
      canSkip: false,
      description: 'Tier level received, begin RCFE placement'
    },
    {
      status: 'RCFE Needed',
      nextStatus: 'RCFE_Located',
      recommendedDays: 21,
      requiredActions: ['Search for appropriate RCFE', 'Contact facilities'],
      autoAdvanceConditions: ['rcfe_identified', 'placement_confirmed'],
      canSkip: false,
      description: 'Search for appropriate RCFE placement'
    },
    {
      status: 'RCFE_Located',
      nextStatus: 'R&B Needed',
      recommendedDays: 7,
      requiredActions: ['Confirm RCFE placement', 'Prepare R&B documentation'],
      autoAdvanceConditions: ['placement_confirmed', 'rb_docs_ready'],
      canSkip: false,
      description: 'RCFE located and confirmed'
    },
    {
      status: 'R&B Needed',
      nextStatus: 'R&B Requested',
      recommendedDays: 7,
      requiredActions: ['Submit R&B request', 'Provide financial documentation'],
      autoAdvanceConditions: ['rb_request_submitted'],
      canSkip: false,
      description: 'Room and Board authorization needed'
    },
    {
      status: 'R&B Requested',
      nextStatus: 'R&B Signed',
      recommendedDays: 14,
      requiredActions: ['Follow up on R&B request', 'Coordinate signing'],
      autoAdvanceConditions: ['rb_approved', 'rb_signed'],
      canSkip: false,
      description: 'Room and Board request submitted'
    },
    {
      status: 'R&B Signed',
      nextStatus: 'ILS Sent for Contract',
      recommendedDays: 3,
      requiredActions: ['Process R&B approval', 'Initiate ILS contracting'],
      autoAdvanceConditions: ['rb_processed', 'ils_contract_initiated'],
      canSkip: false,
      description: 'Room and Board approved and signed'
    },
    {
      status: 'ILS Sent for Contract',
      nextStatus: 'ILS Contracted (Complete)',
      recommendedDays: 14,
      requiredActions: ['Complete ILS contracting', 'Finalize placement'],
      autoAdvanceConditions: ['ils_contract_signed', 'placement_finalized'],
      canSkip: false,
      description: 'ILS contracting in progress'
    },
    {
      status: 'ILS Contracted (Complete)',
      nextStatus: undefined,
      recommendedDays: 0,
      requiredActions: ['Archive case', 'Update records'],
      autoAdvanceConditions: [],
      canSkip: false,
      description: 'Case completed successfully'
    }
  ],
  completionCriteria: ['ILS Contracted (Complete)']
};

// Health Net Workflow Configuration
export const HEALTH_NET_WORKFLOW: WorkflowConfig = {
  name: 'Health Net CalAIM Workflow',
  healthPlan: 'Health Net',
  steps: [
    {
      status: 'Application Being Reviewed',
      nextStatus: 'Scheduling ISP',
      recommendedDays: 14,
      requiredActions: ['Submit application', 'Provide documentation'],
      autoAdvanceConditions: ['application_approved'],
      canSkip: false,
      description: 'Application under review by Health Net'
    },
    {
      status: 'Scheduling ISP',
      nextStatus: 'ISP Completed',
      recommendedDays: 21,
      requiredActions: ['Schedule ISP meeting', 'Coordinate with member'],
      autoAdvanceConditions: ['isp_completed'],
      canSkip: false,
      description: 'Individual Service Plan meeting scheduling'
    },
    {
      status: 'ISP Completed',
      nextStatus: 'Locating RCFEs',
      recommendedDays: 7,
      requiredActions: ['Review ISP results', 'Begin RCFE search'],
      autoAdvanceConditions: ['isp_approved', 'rcfe_search_started'],
      canSkip: false,
      description: 'ISP meeting completed and approved'
    },
    {
      status: 'Locating RCFEs',
      nextStatus: 'Submitted to Health Net',
      recommendedDays: 21,
      requiredActions: ['Find appropriate RCFE', 'Prepare submission'],
      autoAdvanceConditions: ['rcfe_selected', 'submission_ready'],
      canSkip: false,
      description: 'Searching for appropriate RCFE placement'
    },
    {
      status: 'Submitted to Health Net',
      nextStatus: 'Authorization Status',
      recommendedDays: 14,
      requiredActions: ['Submit to Health Net', 'Follow up on status'],
      autoAdvanceConditions: ['authorization_received'],
      canSkip: false,
      description: 'Placement submitted to Health Net for authorization'
    },
    {
      status: 'Authorization Status',
      nextStatus: undefined,
      recommendedDays: 0,
      requiredActions: ['Process authorization', 'Finalize placement'],
      autoAdvanceConditions: [],
      canSkip: false,
      description: 'Final authorization and placement completion'
    }
  ],
  completionCriteria: ['Authorization Status']
};

// Workflow Engine Class
export class WorkflowAutomationEngine {
  private workflows: Map<HealthPlan, WorkflowConfig> = new Map();
  private automationRules: AutomationRule[] = [];
  
  constructor() {
    this.workflows.set('Kaiser', KAISER_WORKFLOW);
    this.workflows.set('Health Net', HEALTH_NET_WORKFLOW);
    this.initializeDefaultAutomationRules();
  }
  
  // Initialize default automation rules
  private initializeDefaultAutomationRules(): void {
    this.automationRules = [
      {
        id: 'kaiser-t2038-auto-advance',
        name: 'Auto-advance T2038 Requested when received',
        description: 'Automatically advance from T2038 Requested to T2038 Received when T2038 is received',
        conditions: {
          status: 'T2038 Requested',
          daysInStatus: 1,
          customConditions: ['t2038_received']
        },
        actions: {
          newStatus: 'T2038 Received',
          addNote: 'Auto-advanced: T2038 received and processed',
          sendNotification: true
        },
        enabled: true,
        healthPlan: 'Kaiser'
      },
      {
        id: 'overdue-escalation',
        name: 'Escalate overdue tasks',
        description: 'Send notifications for tasks overdue by 3+ days',
        conditions: {
          status: '*', // Any status
          daysInStatus: -3, // 3 days overdue
        },
        actions: {
          newStatus: '', // Don't change status
          addNote: 'Task is overdue - escalation triggered',
          sendNotification: true,
          scheduleReminder: 1
        },
        enabled: true
      },
      {
        id: 'rn-visit-auto-schedule',
        name: 'Auto-schedule RN visits',
        description: 'Automatically advance to RN/MSW Scheduled when visit is booked',
        conditions: {
          status: 'RN Visit Needed',
          daysInStatus: 1,
          customConditions: ['rn_visit_scheduled']
        },
        actions: {
          newStatus: 'RN/MSW Scheduled',
          addNote: 'Auto-advanced: RN visit scheduled',
          sendNotification: true
        },
        enabled: true,
        healthPlan: 'Kaiser'
      }
    ];
  }
  
  // Get workflow for health plan
  getWorkflow(healthPlan: HealthPlan): WorkflowConfig | undefined {
    return this.workflows.get(healthPlan);
  }
  
  // Get next status in workflow
  getNextStatus(healthPlan: HealthPlan, currentStatus: string): string | undefined {
    const workflow = this.getWorkflow(healthPlan);
    if (!workflow) return undefined;
    
    const currentStep = workflow.steps.find(step => step.status === currentStatus);
    return currentStep?.nextStatus;
  }
  
  // Get recommended due date for next step
  getRecommendedDueDate(healthPlan: HealthPlan, currentStatus: string, currentDate?: string): string {
    const workflow = this.getWorkflow(healthPlan);
    if (!workflow) return calculateRecommendedDueDate(currentDate || new Date().toISOString(), 7);
    
    const currentStep = workflow.steps.find(step => step.status === currentStatus);
    const recommendedDays = currentStep?.recommendedDays || 7;
    
    return addBusinessDays(currentDate || new Date().toISOString().split('T')[0], recommendedDays);
  }
  
  // Check if task can auto-advance
  canAutoAdvance(task: UnifiedTask, conditions: string[] = []): boolean {
    const workflow = this.getWorkflow(task.healthPlan);
    if (!workflow) return false;
    
    const currentStep = workflow.steps.find(step => step.status === task.currentStatus);
    if (!currentStep?.autoAdvanceConditions) return false;
    
    // Check if all required conditions are met
    return currentStep.autoAdvanceConditions.every(condition => 
      conditions.includes(condition)
    );
  }
  
  // Auto-advance task workflow
  autoAdvanceTask(task: UnifiedTask, conditions: string[] = []): { 
    success: boolean; 
    newStatus?: string; 
    message: string;
    dueDate?: string;
  } {
    if (!this.canAutoAdvance(task, conditions)) {
      return {
        success: false,
        message: 'Task does not meet auto-advance conditions'
      };
    }
    
    const nextStatus = this.getNextStatus(task.healthPlan, task.currentStatus);
    if (!nextStatus) {
      return {
        success: false,
        message: 'No next status available in workflow'
      };
    }
    
    const newDueDate = this.getRecommendedDueDate(task.healthPlan, nextStatus);
    
    return {
      success: true,
      newStatus: nextStatus,
      dueDate: newDueDate,
      message: `Auto-advanced from ${task.currentStatus} to ${nextStatus}`
    };
  }
  
  // Process automation rules for a task
  processAutomationRules(task: UnifiedTask): AutomationRule[] {
    return this.automationRules.filter(rule => {
      if (!rule.enabled) return false;
      if (rule.healthPlan && rule.healthPlan !== task.healthPlan) return false;
      if (rule.conditions.status !== '*' && rule.conditions.status !== task.currentStatus) return false;
      
      // Check days in status condition
      if (rule.conditions.daysInStatus) {
        const daysInStatus = this.calculateDaysInStatus(task);
        if (rule.conditions.daysInStatus > 0 && daysInStatus < rule.conditions.daysInStatus) return false;
        if (rule.conditions.daysInStatus < 0 && Math.abs(task.daysUntilDue) < Math.abs(rule.conditions.daysInStatus)) return false;
      }
      
      return true;
    });
  }
  
  // Calculate days in current status
  private calculateDaysInStatus(task: UnifiedTask): number {
    const lastUpdated = new Date(task.lastUpdated);
    const now = new Date();
    const diffTime = now.getTime() - lastUpdated.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Get workflow progress percentage
  getWorkflowProgress(healthPlan: HealthPlan, currentStatus: string): number {
    const workflow = this.getWorkflow(healthPlan);
    if (!workflow) return 0;
    
    const currentIndex = workflow.steps.findIndex(step => step.status === currentStatus);
    if (currentIndex === -1) return 0;
    
    return Math.round(((currentIndex + 1) / workflow.steps.length) * 100);
  }
  
  // Get all possible statuses for a health plan
  getAllStatuses(healthPlan: HealthPlan): string[] {
    const workflow = this.getWorkflow(healthPlan);
    return workflow?.steps.map(step => step.status) || [];
  }
  
  // Validate status transition
  isValidTransition(healthPlan: HealthPlan, fromStatus: string, toStatus: string): boolean {
    const workflow = this.getWorkflow(healthPlan);
    if (!workflow) return false;
    
    const fromStep = workflow.steps.find(step => step.status === fromStatus);
    return fromStep?.nextStatus === toStatus || fromStep?.canSkip;
  }
  
  // Get required actions for current status
  getRequiredActions(healthPlan: HealthPlan, currentStatus: string): string[] {
    const workflow = this.getWorkflow(healthPlan);
    if (!workflow) return [];
    
    const currentStep = workflow.steps.find(step => step.status === currentStatus);
    return currentStep?.requiredActions || [];
  }
  
  // Add custom automation rule
  addAutomationRule(rule: AutomationRule): void {
    this.automationRules.push(rule);
  }
  
  // Update automation rule
  updateAutomationRule(ruleId: string, updates: Partial<AutomationRule>): boolean {
    const index = this.automationRules.findIndex(rule => rule.id === ruleId);
    if (index === -1) return false;
    
    this.automationRules[index] = { ...this.automationRules[index], ...updates };
    return true;
  }
  
  // Get all automation rules
  getAutomationRules(): AutomationRule[] {
    return [...this.automationRules];
  }
}

// Export singleton instance
export const workflowEngine = new WorkflowAutomationEngine();