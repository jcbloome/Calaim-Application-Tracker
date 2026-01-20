// Smart Task Management Hub (Option C)
// AI-powered task prioritization and intelligent workload management

import type { 
  UnifiedTask, 
  TaskPriority, 
  TaskFilter, 
  TaskGroup, 
  PrioritizationConfig,
  TaskAnalytics 
} from './types';
import { calculateTaskDates } from './date-utils';

// Smart Task Hub Class
export class SmartTaskHub {
  private prioritizationConfig: PrioritizationConfig;
  
  constructor(config?: Partial<PrioritizationConfig>) {
    this.prioritizationConfig = {
      weights: {
        daysOverdue: 0.4,        // 40% - Most important factor
        memberComplexity: 0.2,   // 20% - Member needs complexity
        staffWorkload: 0.15,     // 15% - Current staff workload
        pathwayCriticality: 0.15, // 15% - Pathway urgency
        historicalDelay: 0.1     // 10% - Historical delay patterns
      },
      thresholds: {
        critical: 85,  // Score >= 85 = Critical
        high: 65,      // Score >= 65 = High  
        medium: 35     // Score >= 35 = Medium, < 35 = Low
      },
      ...config
    };
  }
  
  // Calculate intelligent priority score for a task
  calculatePriorityScore(task: UnifiedTask, context: {
    staffWorkloads?: Record<string, number>;
    historicalDelays?: Record<string, number>;
    memberComplexityScores?: Record<string, number>;
  } = {}): number {
    let score = 0;
    
    // 1. Days Overdue Factor (40% weight)
    const daysOverdueFactor = this.calculateDaysOverdueFactor(task);
    score += daysOverdueFactor * this.prioritizationConfig.weights.daysOverdue;
    
    // 2. Member Complexity Factor (20% weight)
    const complexityFactor = this.calculateComplexityFactor(task, context.memberComplexityScores);
    score += complexityFactor * this.prioritizationConfig.weights.memberComplexity;
    
    // 3. Staff Workload Factor (15% weight)
    const workloadFactor = this.calculateWorkloadFactor(task, context.staffWorkloads);
    score += workloadFactor * this.prioritizationConfig.weights.staffWorkload;
    
    // 4. Pathway Criticality Factor (15% weight)
    const pathwayFactor = this.calculatePathwayCriticalityFactor(task);
    score += pathwayFactor * this.prioritizationConfig.weights.pathwayCriticality;
    
    // 5. Historical Delay Factor (10% weight)
    const delayFactor = this.calculateHistoricalDelayFactor(task, context.historicalDelays);
    score += delayFactor * this.prioritizationConfig.weights.historicalDelay;
    
    return Math.min(100, Math.max(0, score)); // Clamp between 0-100
  }
  
  // Calculate days overdue factor (0-100 scale)
  private calculateDaysOverdueFactor(task: UnifiedTask): number {
    if (!task.isOverdue) {
      // Future tasks get lower priority based on how far out they are
      const daysUntilDue = task.daysUntilDue;
      if (daysUntilDue <= 1) return 75; // Due today/tomorrow = high priority
      if (daysUntilDue <= 3) return 50; // Due soon = medium priority
      if (daysUntilDue <= 7) return 25; // Due this week = lower priority
      return 10; // Future = lowest priority
    }
    
    // Overdue tasks - exponential scaling
    const daysOverdue = Math.abs(task.daysUntilDue);
    if (daysOverdue >= 7) return 100;  // 7+ days overdue = maximum priority
    if (daysOverdue >= 3) return 90;   // 3-6 days overdue = very high
    if (daysOverdue >= 1) return 80;   // 1-2 days overdue = high
    return 70; // Just became overdue
  }
  
  // Calculate member complexity factor
  private calculateComplexityFactor(task: UnifiedTask, complexityScores?: Record<string, number>): number {
    // Use provided complexity score if available
    if (complexityScores && complexityScores[task.id]) {
      return complexityScores[task.id];
    }
    
    // Calculate complexity based on available data
    let complexity = 50; // Base complexity
    
    // Kaiser pathway is generally more complex
    if (task.healthPlan === 'Kaiser') {
      complexity += 20;
    }
    
    // SNF Diversion typically more complex than SNF Transition
    if (task.pathway === 'SNF Diversion') {
      complexity += 15;
    }
    
    // Certain statuses indicate higher complexity
    const complexStatuses = [
      'Tier Level Appeal',
      'On-Hold',
      'Tier Level Revision Request',
      'T2038 email but need auth sheet'
    ];
    
    if (complexStatuses.includes(task.currentStatus)) {
      complexity += 25;
    }
    
    return Math.min(100, complexity);
  }
  
  // Calculate staff workload factor
  private calculateWorkloadFactor(task: UnifiedTask, staffWorkloads?: Record<string, number>): number {
    if (!staffWorkloads || !staffWorkloads[task.assignedTo]) {
      return 50; // Default if no workload data
    }
    
    const workload = staffWorkloads[task.assignedTo];
    
    // Higher workload = higher priority (to balance workloads)
    if (workload >= 20) return 90;  // Very high workload
    if (workload >= 15) return 70;  // High workload
    if (workload >= 10) return 50;  // Medium workload
    if (workload >= 5) return 30;   // Low workload
    return 10; // Very low workload
  }
  
  // Calculate pathway criticality factor
  private calculatePathwayCriticalityFactor(task: UnifiedTask): number {
    // Critical statuses that need immediate attention
    const criticalStatuses = [
      'T2038 Requested',
      'RN Visit Needed',
      'Tier Level Requested',
      'R&B Requested',
      'Authorization Status'
    ];
    
    if (criticalStatuses.includes(task.currentStatus)) {
      return 80;
    }
    
    // Important but not critical
    const importantStatuses = [
      'T2038 received, Need First Contact',
      'RN/MSW Scheduled',
      'RCFE Needed',
      'Scheduling ISP'
    ];
    
    if (importantStatuses.includes(task.currentStatus)) {
      return 60;
    }
    
    // Completion statuses
    const completionStatuses = [
      'ILS Contracted (Complete)',
      'Complete',
      'Authorization Status'
    ];
    
    if (completionStatuses.includes(task.currentStatus)) {
      return 90; // High priority to complete
    }
    
    return 40; // Default priority
  }
  
  // Calculate historical delay factor
  private calculateHistoricalDelayFactor(task: UnifiedTask, historicalDelays?: Record<string, number>): number {
    if (!historicalDelays) return 50;
    
    const statusDelayHistory = historicalDelays[task.currentStatus];
    if (!statusDelayHistory) return 50;
    
    // Higher historical delays = higher priority
    if (statusDelayHistory >= 10) return 90;  // This status often delayed
    if (statusDelayHistory >= 5) return 70;   // Sometimes delayed
    if (statusDelayHistory >= 2) return 50;   // Occasionally delayed
    return 30; // Rarely delayed
  }
  
  // Convert priority score to priority level
  getPriorityLevel(score: number): TaskPriority {
    if (score >= this.prioritizationConfig.thresholds.critical) return 'critical';
    if (score >= this.prioritizationConfig.thresholds.high) return 'high';
    if (score >= this.prioritizationConfig.thresholds.medium) return 'medium';
    return 'low';
  }
  
  // Prioritize and sort tasks intelligently
  prioritizeTasks(tasks: UnifiedTask[], context?: {
    staffWorkloads?: Record<string, number>;
    historicalDelays?: Record<string, number>;
    memberComplexityScores?: Record<string, number>;
  }): UnifiedTask[] {
    return tasks
      .map(task => {
        const score = this.calculatePriorityScore(task, context || {});
        const priority = this.getPriorityLevel(score);
        
        return {
          ...task,
          priority,
          priorityScore: score
        } as UnifiedTask & { priorityScore: number };
      })
      .sort((a, b) => {
        // Sort by priority score (descending)
        const scoreDiff = (b as any).priorityScore - (a as any).priorityScore;
        if (scoreDiff !== 0) return scoreDiff;
        
        // Secondary sort by days until due (overdue first)
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        
        // Tertiary sort by due date
        return a.daysUntilDue - b.daysUntilDue;
      });
  }
  
  // Group tasks intelligently
  groupTasksIntelligently(tasks: UnifiedTask[]): Record<string, TaskGroup> {
    const groups: Record<string, TaskGroup> = {};
    
    // Group by urgency
    const overdue = tasks.filter(t => t.isOverdue);
    const dueToday = tasks.filter(t => t.daysUntilDue === 0 && !t.isOverdue);
    const dueSoon = tasks.filter(t => t.daysUntilDue > 0 && t.daysUntilDue <= 3);
    const dueThisWeek = tasks.filter(t => t.daysUntilDue > 3 && t.daysUntilDue <= 7);
    const future = tasks.filter(t => t.daysUntilDue > 7);
    
    groups.overdue = {
      name: 'Overdue',
      tasks: overdue,
      count: overdue.length,
      priority: 'critical',
      color: 'bg-red-100 text-red-800 border-red-200',
      icon: 'AlertTriangle'
    };
    
    groups.dueToday = {
      name: 'Due Today',
      tasks: dueToday,
      count: dueToday.length,
      priority: 'high',
      color: 'bg-orange-100 text-orange-800 border-orange-200',
      icon: 'Clock'
    };
    
    groups.dueSoon = {
      name: 'Due Soon (1-3 days)',
      tasks: dueSoon,
      count: dueSoon.length,
      priority: 'medium',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      icon: 'Clock'
    };
    
    groups.dueThisWeek = {
      name: 'Due This Week',
      tasks: dueThisWeek,
      count: dueThisWeek.length,
      priority: 'medium',
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: 'Calendar'
    };
    
    groups.future = {
      name: 'Future',
      tasks: future,
      count: future.length,
      priority: 'low',
      color: 'bg-green-100 text-green-800 border-green-200',
      icon: 'CheckCircle'
    };
    
    return groups;
  }
  
  // Generate task analytics
  generateAnalytics(tasks: UnifiedTask[]): TaskAnalytics {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Basic counts
    const totalTasks = tasks.length;
    const overdueTasks = tasks.filter(t => t.isOverdue).length;
    const completedThisWeek = tasks.filter(t => {
      const lastUpdated = new Date(t.lastUpdated);
      return lastUpdated >= weekAgo && t.currentStatus.includes('Complete');
    }).length;
    
    // Average completion time (mock calculation)
    const averageCompletionTime = this.calculateAverageCompletionTime(tasks);
    
    // Bottleneck analysis
    const statusCounts = tasks.reduce((acc, task) => {
      acc[task.currentStatus] = (acc[task.currentStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const bottleneckStatuses = Object.entries(statusCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([status]) => status);
    
    // Staff workload distribution
    const staffWorkloadDistribution = tasks.reduce((acc, task) => {
      acc[task.assignedTo] = (acc[task.assignedTo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Priority distribution
    const priorityDistribution = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<TaskPriority, number>);
    
    // Health plan distribution
    const healthPlanDistribution = tasks.reduce((acc, task) => {
      acc[task.healthPlan] = (acc[task.healthPlan] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalTasks,
      overdueTasks,
      completedThisWeek,
      averageCompletionTime,
      bottleneckStatuses,
      staffWorkloadDistribution,
      priorityDistribution: priorityDistribution as Record<TaskPriority, number>,
      healthPlanDistribution: healthPlanDistribution as Record<any, number>
    };
  }
  
  // Calculate average completion time
  private calculateAverageCompletionTime(tasks: UnifiedTask[]): number {
    const completedTasks = tasks.filter(t => t.currentStatus.includes('Complete'));
    if (completedTasks.length === 0) return 0;
    
    const totalDays = completedTasks.reduce((sum, task) => {
      const created = new Date(task.createdDate);
      const completed = new Date(task.lastUpdated);
      const days = Math.floor((completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    
    return Math.round(totalDays / completedTasks.length);
  }
  
  // Recommend task assignments based on workload balancing
  recommendTaskAssignment(task: UnifiedTask, availableStaff: string[], staffWorkloads: Record<string, number>): {
    recommendedStaff: string;
    reason: string;
    confidence: number;
  } {
    // Find staff member with lowest workload
    const staffWithWorkloads = availableStaff.map(staff => ({
      staff,
      workload: staffWorkloads[staff] || 0
    }));
    
    staffWithWorkloads.sort((a, b) => a.workload - b.workload);
    
    const recommended = staffWithWorkloads[0];
    const workloadDifference = staffWithWorkloads[staffWithWorkloads.length - 1].workload - recommended.workload;
    
    return {
      recommendedStaff: recommended.staff,
      reason: `Lowest current workload (${recommended.workload} tasks)`,
      confidence: Math.min(95, 60 + (workloadDifference * 5)) // Higher confidence with bigger workload gaps
    };
  }
  
  // Get smart task suggestions
  getSmartSuggestions(tasks: UnifiedTask[]): {
    type: 'workflow' | 'assignment' | 'priority' | 'bottleneck';
    title: string;
    description: string;
    action: string;
    taskIds: string[];
  }[] {
    const suggestions = [];
    
    // Workflow suggestions
    const autoAdvanceable = tasks.filter(t => t.canAutoAdvance);
    if (autoAdvanceable.length > 0) {
      suggestions.push({
        type: 'workflow' as const,
        title: 'Auto-Advance Ready',
        description: `${autoAdvanceable.length} tasks can be automatically advanced`,
        action: 'Auto-advance eligible tasks',
        taskIds: autoAdvanceable.map(t => t.id)
      });
    }
    
    // Overdue task suggestions
    const criticalOverdue = tasks.filter(t => t.isOverdue && Math.abs(t.daysUntilDue) >= 5);
    if (criticalOverdue.length > 0) {
      suggestions.push({
        type: 'priority' as const,
        title: 'Critical Overdue Tasks',
        description: `${criticalOverdue.length} tasks are 5+ days overdue`,
        action: 'Review and prioritize overdue tasks',
        taskIds: criticalOverdue.map(t => t.id)
      });
    }
    
    return suggestions;
  }
  
  // Update prioritization configuration
  updatePrioritizationConfig(updates: Partial<PrioritizationConfig>): void {
    this.prioritizationConfig = {
      ...this.prioritizationConfig,
      ...updates,
      weights: {
        ...this.prioritizationConfig.weights,
        ...updates.weights
      },
      thresholds: {
        ...this.prioritizationConfig.thresholds,
        ...updates.thresholds
      }
    };
  }
  
  // Get current configuration
  getPrioritizationConfig(): PrioritizationConfig {
    return { ...this.prioritizationConfig };
  }
}

// Export singleton instance
export const smartTaskHub = new SmartTaskHub();