// Centralized Task Processor
// Unifies task processing logic from my-tasks, kaiser-tracker, managerial-overview

import type { UnifiedTask, KaiserTask, HealthNetTask, TaskFilter } from './types';
import { calculateTaskDates } from './date-utils';
import { workflowEngine } from './workflow-engine';
import { smartTaskHub } from './smart-task-hub';

// Next actions mapping (centralized from my-tasks page)
const NEXT_ACTIONS: Record<string, string> = {
  "Pre-T2038, Compiling Docs": "Gather required documentation and submit T2038 request",
  "T2038 Requested": "Follow up on T2038 request status",
  "T2038 Received": "Review T2038 and initiate first member contact",
  "T2038 received, Need First Contact": "Schedule and complete initial member contact",
  "T2038 received, doc collection": "Collect additional required documents",
  "RN Visit Needed": "Schedule RN assessment visit",
  "RN/MSW Scheduled": "Confirm RN/MSW appointment and prepare materials",
  "RN Visit Complete": "Review RN assessment and prepare for tier level request",
  "Tier Level Requested": "Follow up on tier level determination",
  "Tier Level Received": "Review tier level and begin RCFE search",
  "Locating RCFEs": "Search and contact appropriate RCFE facilities",
  "RCFE_Located": "Initiate R&B process with selected RCFE",
  "R&B Needed": "Submit and prepare R&B documentation",
  "R&B Requested": "Follow up on R&B request and documentation",
  "R&B Signed": "Process member for ILS contracting",
  "ILS Sent for Contract": "Complete ILS contracting process",
  "ILS Contracted (Complete)": "Confirm ILS contract completion and finalize",
  "Tier Level Appeal": "Process tier level appeal documentation",
  "On-Hold": "Review hold status and determine next steps",
  "Non-active": "Review case status and determine reactivation steps",
  
  // Health Net actions
  "Application Being Reviewed": "Follow up on application review status",
  "Scheduling ISP": "Schedule Individual Service Plan meeting",
  "ISP Completed": "Review ISP results and begin RCFE search",
  "Submitted to Health Net": "Follow up on Health Net authorization",
  "Authorization Status": "Process final authorization and complete placement"
};

// Task Processor Class
export class TaskProcessor {
  
  // Convert raw Caspio data to UnifiedTask
  processRawTaskData(rawData: any): UnifiedTask {
    const dateCalc = calculateTaskDates(rawData.next_steps_date || rawData.Next_Step_Due_Date);
    
    const baseTask = {
      id: rawData.id || rawData.client_ID2,
      memberFirstName: rawData.memberFirstName,
      memberLastName: rawData.memberLastName,
      memberMrn: rawData.memberMrn,
      memberCounty: rawData.memberCounty,
      clientId: rawData.client_ID2,
      pathway: rawData.pathway,
      healthPlan: this.normalizeHealthPlan(rawData.healthPlan),
      
      // Status & Workflow
      currentStatus: rawData.Kaiser_Status || rawData.healthNetStatus || rawData.status,
      workflowStep: rawData.workflow_step || '',
      
      // Dates & Timing
      dueDate: rawData.next_steps_date || rawData.Next_Step_Due_Date || '',
      lastUpdated: rawData.last_updated || new Date().toISOString(),
      createdDate: rawData.created_at || rawData.createdDate || new Date().toISOString(),
      
      // Assignment & Notes
      assignedTo: rawData.kaiser_user_assignment || rawData.Staff_Assigned || rawData.assignedTo || '',
      notes: rawData.workflow_notes || rawData.notes || '',
      
      // Calculated Fields
      daysUntilDue: dateCalc.daysUntilDue,
      isOverdue: dateCalc.isOverdue,
      priority: 'medium' as const, // Will be calculated by smart hub
      taskStatus: this.determineTaskStatus(dateCalc),
      nextAction: this.getNextAction(rawData.Kaiser_Status || rawData.healthNetStatus || rawData.status),
      
      // Workflow Automation
      canAutoAdvance: false, // Will be determined by workflow engine
      estimatedCompletionDays: this.estimateCompletionDays(rawData.Kaiser_Status || rawData.healthNetStatus || rawData.status)
    };
    
    // Create health plan specific task
    if (baseTask.healthPlan === 'Kaiser') {
      return {
        ...baseTask,
        healthPlan: 'Kaiser',
        kaiserStatus: rawData.Kaiser_Status,
        calaimStatus: rawData.CalAIM_Status,
        kaiserUserAssignment: rawData.kaiser_user_assignment,
        t2038Status: rawData.t2038Status,
        rnVisitStatus: rawData.rnVisitStatus,
        tierLevelStatus: rawData.tierLevelStatus,
        rcfeStatus: rawData.rcfeStatus,
        ilsStatus: rawData.ilsStatus
      } as KaiserTask;
    } else {
      return {
        ...baseTask,
        healthPlan: 'Health Net',
        healthNetStatus: rawData.healthNetStatus || rawData.status,
        ispStatus: rawData.ispStatus,
        authorizationStatus: rawData.authorizationStatus
      } as HealthNetTask;
    }
  }
  
  // Normalize health plan names
  private normalizeHealthPlan(healthPlan: string): 'Kaiser' | 'Health Net' | 'Other' {
    if (!healthPlan) return 'Other';
    
    const normalized = healthPlan.toLowerCase();
    if (normalized.includes('kaiser')) return 'Kaiser';
    if (normalized.includes('health net') || normalized.includes('healthnet')) return 'Health Net';
    return 'Other';
  }
  
  // Determine task status based on date calculation
  private determineTaskStatus(dateCalc: any): 'overdue' | 'due-today' | 'due-soon' | 'future' | 'completed' | 'on-hold' {
    if (dateCalc.isOverdue) return 'overdue';
    if (dateCalc.isToday) return 'due-today';
    if (dateCalc.isDueSoon) return 'due-soon';
    return 'future';
  }
  
  // Get next action for status
  private getNextAction(status: string): string {
    return NEXT_ACTIONS[status] || 'Review case and determine next steps';
  }
  
  // Estimate completion days based on status
  private estimateCompletionDays(status: string): number {
    const estimations: Record<string, number> = {
      'Pre-T2038, Compiling Docs': 45,
      'T2038 Requested': 35,
      'T2038 Received': 30,
      'T2038 received, Need First Contact': 25,
      'T2038 received, doc collection': 20,
      'RN Visit Needed': 15,
      'RN/MSW Scheduled': 10,
      'RN Visit Complete': 8,
      'Tier Level Requested': 6,
      'Tier Level Received': 4,
      'RCFE Needed': 21,
      'RCFE_Located': 14,
      'R&B Needed': 10,
      'R&B Requested': 7,
      'R&B Signed': 5,
      'ILS Sent for Contract': 3,
      'ILS Contracted (Complete)': 0,
      
      // Health Net estimations
      'Application Being Reviewed': 30,
      'Scheduling ISP': 21,
      'ISP Completed': 14,
      'Locating RCFEs': 21,
      'Submitted to Health Net': 14,
      'Authorization Status': 7
    };
    
    return estimations[status] || 14; // Default 2 weeks
  }
  
  // Process multiple tasks with intelligent enhancements
  processTasks(rawTasks: any[], options: {
    enableSmartPrioritization?: boolean;
    enableWorkflowAnalysis?: boolean;
    staffWorkloads?: Record<string, number>;
    historicalDelays?: Record<string, number>;
  } = {}): UnifiedTask[] {
    // Convert raw data to unified tasks
    let tasks = rawTasks.map(raw => this.processRawTaskData(raw));
    
    // Apply workflow analysis
    if (options.enableWorkflowAnalysis) {
      tasks = tasks.map(task => {
        const nextStatus = workflowEngine.getNextStatus(task.healthPlan, task.currentStatus);
        const canAutoAdvance = workflowEngine.canAutoAdvance(task);
        const progress = workflowEngine.getWorkflowProgress(task.healthPlan, task.currentStatus);
        
        return {
          ...task,
          nextStatus,
          canAutoAdvance,
          workflowProgress: progress
        };
      });
    }
    
    // Apply smart prioritization
    if (options.enableSmartPrioritization) {
      tasks = smartTaskHub.prioritizeTasks(tasks, {
        staffWorkloads: options.staffWorkloads,
        historicalDelays: options.historicalDelays
      });
    }
    
    return tasks;
  }
  
  // Filter tasks based on criteria
  filterTasks(tasks: UnifiedTask[], filter: TaskFilter): UnifiedTask[] {
    return tasks.filter(task => {
      // Status filter
      if (filter.status && filter.status.length > 0) {
        if (!filter.status.includes(task.currentStatus)) return false;
      }
      
      // Assigned to filter
      if (filter.assignedTo && filter.assignedTo.length > 0) {
        if (!filter.assignedTo.includes(task.assignedTo)) return false;
      }
      
      // Health plan filter
      if (filter.healthPlan && filter.healthPlan.length > 0) {
        if (!filter.healthPlan.includes(task.healthPlan)) return false;
      }
      
      // Priority filter
      if (filter.priority && filter.priority.length > 0) {
        if (!filter.priority.includes(task.priority)) return false;
      }
      
      // Days until due filter
      if (filter.daysUntilDue) {
        if (filter.daysUntilDue.min !== undefined && task.daysUntilDue < filter.daysUntilDue.min) return false;
        if (filter.daysUntilDue.max !== undefined && task.daysUntilDue > filter.daysUntilDue.max) return false;
      }
      
      // County filter
      if (filter.county && filter.county.length > 0) {
        if (!filter.county.includes(task.memberCounty)) return false;
      }
      
      // Pathway filter
      if (filter.pathway && filter.pathway.length > 0) {
        if (!filter.pathway.includes(task.pathway)) return false;
      }
      
      return true;
    });
  }
  
  // Get tasks for specific user (used in my-tasks page)
  getTasksForUser(tasks: UnifiedTask[], userEmail: string, userName?: string): UnifiedTask[] {
    return tasks.filter(task => {
      return task.assignedTo === userEmail ||
             task.assignedTo === userName ||
             task.assignedTo === userEmail.split('@')[0];
    });
  }
  
  // Group tasks by various criteria
  groupTasks(tasks: UnifiedTask[], groupBy: 'status' | 'assignedTo' | 'healthPlan' | 'priority' | 'urgency'): Record<string, UnifiedTask[]> {
    const groups: Record<string, UnifiedTask[]> = {};
    
    tasks.forEach(task => {
      let key: string;
      
      switch (groupBy) {
        case 'status':
          key = task.currentStatus;
          break;
        case 'assignedTo':
          key = task.assignedTo || 'Unassigned';
          break;
        case 'healthPlan':
          key = task.healthPlan;
          break;
        case 'priority':
          key = task.priority;
          break;
        case 'urgency':
          if (task.isOverdue) key = 'Overdue';
          else if (task.daysUntilDue === 0) key = 'Due Today';
          else if (task.daysUntilDue <= 3) key = 'Due Soon';
          else if (task.daysUntilDue <= 7) key = 'Due This Week';
          else key = 'Future';
          break;
        default:
          key = 'Other';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return groups;
  }
  
  // Bulk update tasks
  bulkUpdateTasks(tasks: UnifiedTask[], updates: Partial<UnifiedTask>, taskIds: string[]): UnifiedTask[] {
    return tasks.map(task => {
      if (taskIds.includes(task.id)) {
        const updatedTask = { ...task, ...updates };
        
        // Recalculate derived fields if due date changed
        if (updates.dueDate) {
          const dateCalc = calculateTaskDates(updates.dueDate);
          updatedTask.daysUntilDue = dateCalc.daysUntilDue;
          updatedTask.isOverdue = dateCalc.isOverdue;
          updatedTask.taskStatus = this.determineTaskStatus(dateCalc);
        }
        
        // Update next action if status changed
        if (updates.currentStatus) {
          updatedTask.nextAction = this.getNextAction(updates.currentStatus);
          updatedTask.estimatedCompletionDays = this.estimateCompletionDays(updates.currentStatus);
        }
        
        return updatedTask;
      }
      return task;
    });
  }
  
  // Search tasks by member name or MRN
  searchTasks(tasks: UnifiedTask[], searchTerm: string): UnifiedTask[] {
    if (!searchTerm.trim()) return tasks;
    
    const term = searchTerm.toLowerCase();
    
    return tasks.filter(task => {
      return task.memberFirstName.toLowerCase().includes(term) ||
             task.memberLastName.toLowerCase().includes(term) ||
             task.memberMrn.toLowerCase().includes(term) ||
             task.clientId.toLowerCase().includes(term) ||
             `${task.memberFirstName} ${task.memberLastName}`.toLowerCase().includes(term);
    });
  }
  
  // Get task statistics
  getTaskStatistics(tasks: UnifiedTask[]): {
    total: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
    completed: number;
    byHealthPlan: Record<string, number>;
    byPriority: Record<string, number>;
    byAssignee: Record<string, number>;
  } {
    const stats = {
      total: tasks.length,
      overdue: tasks.filter(t => t.isOverdue).length,
      dueToday: tasks.filter(t => t.daysUntilDue === 0 && !t.isOverdue).length,
      dueSoon: tasks.filter(t => t.daysUntilDue > 0 && t.daysUntilDue <= 3).length,
      completed: tasks.filter(t => t.currentStatus.includes('Complete')).length,
      byHealthPlan: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      byAssignee: {} as Record<string, number>
    };
    
    // Count by health plan
    tasks.forEach(task => {
      stats.byHealthPlan[task.healthPlan] = (stats.byHealthPlan[task.healthPlan] || 0) + 1;
      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
      stats.byAssignee[task.assignedTo || 'Unassigned'] = (stats.byAssignee[task.assignedTo || 'Unassigned'] || 0) + 1;
    });
    
    return stats;
  }
}

// Export singleton instance
export const taskProcessor = new TaskProcessor();