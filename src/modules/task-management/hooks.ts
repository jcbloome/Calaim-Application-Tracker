// Task Management Hooks
// Specialized hooks for common task management operations

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { UnifiedTask, TaskFilter, TaskPriority } from './types';
import { useTaskManagement } from './context';
import { taskProcessor } from './task-processor';
import { workflowEngine } from './workflow-engine';
import { smartTaskHub } from './smart-task-hub';

// Hook for task filtering with debounced search
export function useTaskFilter(initialFilter: TaskFilter = {}) {
  const { state, actions } = useTaskManagement();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Apply filters and search
  const filteredTasks = useMemo(() => {
    let tasks = taskProcessor.filterTasks(state.tasks, initialFilter);
    
    if (debouncedSearchTerm) {
      tasks = taskProcessor.searchTasks(tasks, debouncedSearchTerm);
    }
    
    return tasks;
  }, [state.tasks, initialFilter, debouncedSearchTerm]);
  
  return {
    filteredTasks,
    searchTerm,
    setSearchTerm,
    setFilter: actions.setFilter,
    isLoading: state.isLoading
  };
}

// Hook for bulk task operations
export function useBulkTaskOperations() {
  const { actions } = useTaskManagement();
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  }, []);
  
  const selectAllTasks = useCallback((taskIds: string[]) => {
    setSelectedTaskIds(taskIds);
  }, []);
  
  const clearSelection = useCallback(() => {
    setSelectedTaskIds([]);
  }, []);
  
  const bulkUpdateStatus = useCallback(async (newStatus: string) => {
    if (selectedTaskIds.length === 0) return;
    
    setIsProcessing(true);
    try {
      // Calculate new due dates based on workflow
      const updates: Partial<UnifiedTask> = {
        currentStatus: newStatus,
        lastUpdated: new Date().toISOString()
      };
      
      actions.bulkUpdateTasks(selectedTaskIds, updates);
      clearSelection();
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTaskIds, actions, clearSelection]);
  
  const bulkAssignStaff = useCallback(async (staffEmail: string) => {
    if (selectedTaskIds.length === 0) return;
    
    setIsProcessing(true);
    try {
      const updates: Partial<UnifiedTask> = {
        assignedTo: staffEmail,
        lastUpdated: new Date().toISOString()
      };
      
      actions.bulkUpdateTasks(selectedTaskIds, updates);
      clearSelection();
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTaskIds, actions, clearSelection]);
  
  const bulkUpdateDueDate = useCallback(async (newDueDate: string) => {
    if (selectedTaskIds.length === 0) return;
    
    setIsProcessing(true);
    try {
      const updates: Partial<UnifiedTask> = {
        dueDate: newDueDate,
        lastUpdated: new Date().toISOString()
      };
      
      actions.bulkUpdateTasks(selectedTaskIds, updates);
      clearSelection();
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTaskIds, actions, clearSelection]);
  
  return {
    selectedTaskIds,
    selectTask,
    selectAllTasks,
    clearSelection,
    bulkUpdateStatus,
    bulkAssignStaff,
    bulkUpdateDueDate,
    isProcessing,
    hasSelection: selectedTaskIds.length > 0,
    selectionCount: selectedTaskIds.length
  };
}

// Hook for workflow automation
export function useWorkflowAutomation() {
  const { state, actions } = useTaskManagement();
  const [automationResults, setAutomationResults] = useState<{
    taskId: string;
    success: boolean;
    message: string;
  }[]>([]);
  
  const autoAdvanceEligibleTasks = useCallback(async () => {
    const eligibleTasks = state.tasks.filter(task => task.canAutoAdvance);
    const results = [];
    
    for (const task of eligibleTasks) {
      const success = await actions.autoAdvanceTask(task.id);
      results.push({
        taskId: task.id,
        success,
        message: success 
          ? `Auto-advanced ${task.memberFirstName} ${task.memberLastName}`
          : `Failed to auto-advance ${task.memberFirstName} ${task.memberLastName}`
      });
    }
    
    setAutomationResults(results);
    return results;
  }, [state.tasks, actions]);
  
  const getWorkflowSuggestions = useCallback(() => {
    return smartTaskHub.getSmartSuggestions(state.tasks);
  }, [state.tasks]);
  
  const processAutomationRules = useCallback((taskId: string) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return [];
    
    return workflowEngine.processAutomationRules(task);
  }, [state.tasks]);
  
  return {
    automationEnabled: state.automationEnabled,
    automationRules: state.automationRules,
    automationResults,
    autoAdvanceEligibleTasks,
    getWorkflowSuggestions,
    processAutomationRules,
    clearAutomationResults: () => setAutomationResults([])
  };
}

// Hook for task analytics and insights
export function useTaskAnalytics() {
  const { state } = useTaskManagement();
  
  const analytics = useMemo(() => {
    return smartTaskHub.generateAnalytics(state.tasks);
  }, [state.tasks]);
  
  const bottleneckAnalysis = useMemo(() => {
    const statusCounts = taskProcessor.groupTasks(state.tasks, 'status');
    
    return Object.entries(statusCounts)
      .map(([status, tasks]) => ({
        status,
        count: tasks.length,
        averageDaysInStatus: tasks.reduce((sum, task) => {
          const daysInStatus = Math.floor(
            (new Date().getTime() - new Date(task.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
          );
          return sum + daysInStatus;
        }, 0) / tasks.length,
        overdueCount: tasks.filter(t => t.isOverdue).length
      }))
      .sort((a, b) => b.count - a.count);
  }, [state.tasks]);
  
  const staffWorkloadAnalysis = useMemo(() => {
    const workloads = taskProcessor.groupTasks(state.tasks, 'assignedTo');
    
    return Object.entries(workloads)
      .map(([staff, tasks]) => ({
        staff: staff || 'Unassigned',
        totalTasks: tasks.length,
        overdueTasks: tasks.filter(t => t.isOverdue).length,
        criticalTasks: tasks.filter(t => t.priority === 'critical').length,
        averagePriority: tasks.reduce((sum, task) => {
          const priorityScore = { critical: 4, high: 3, medium: 2, low: 1 }[task.priority];
          return sum + priorityScore;
        }, 0) / tasks.length
      }))
      .sort((a, b) => b.totalTasks - a.totalTasks);
  }, [state.tasks]);
  
  const priorityDistribution = useMemo(() => {
    const distribution = { critical: 0, high: 0, medium: 0, low: 0 };
    state.tasks.forEach(task => {
      distribution[task.priority]++;
    });
    return distribution;
  }, [state.tasks]);
  
  return {
    analytics,
    bottleneckAnalysis,
    staffWorkloadAnalysis,
    priorityDistribution,
    totalTasks: state.tasks.length,
    overdueTasks: state.tasks.filter(t => t.isOverdue).length,
    completionRate: state.tasks.filter(t => t.currentStatus.includes('Complete')).length / state.tasks.length
  };
}

// Hook for smart task prioritization
export function useSmartPrioritization() {
  const { state } = useTaskManagement();
  const [prioritizationEnabled, setPrioritizationEnabled] = useState(true);
  
  const prioritizedTasks = useMemo(() => {
    if (!prioritizationEnabled) return state.tasks;
    
    return smartTaskHub.prioritizeTasks(state.tasks, {
      staffWorkloads: state.analytics.staffWorkloadDistribution
    });
  }, [state.tasks, state.analytics.staffWorkloadDistribution, prioritizationEnabled]);
  
  const getPriorityRecommendations = useCallback((taskId: string) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return null;
    
    const score = smartTaskHub.calculatePriorityScore(task, {
      staffWorkloads: state.analytics.staffWorkloadDistribution
    });
    
    const recommendedPriority = smartTaskHub.getPriorityLevel(score);
    
    return {
      currentPriority: task.priority,
      recommendedPriority,
      score,
      shouldUpdate: task.priority !== recommendedPriority
    };
  }, [state.tasks, state.analytics.staffWorkloadDistribution]);
  
  return {
    prioritizedTasks,
    prioritizationEnabled,
    setPrioritizationEnabled,
    getPriorityRecommendations,
    prioritizationConfig: state.prioritizationConfig
  };
}

// Hook for task status management
export function useTaskStatus() {
  const { actions } = useTaskManagement();
  
  const updateTaskStatus = useCallback(async (
    taskId: string, 
    newStatus: string, 
    options: {
      updateDueDate?: boolean;
      addNote?: string;
      notifyAssignee?: boolean;
    } = {}
  ) => {
    const updates: Partial<UnifiedTask> = {
      currentStatus: newStatus,
      lastUpdated: new Date().toISOString()
    };
    
    // Update due date based on workflow if requested
    if (options.updateDueDate) {
      // This would calculate the new due date based on workflow rules
      // For now, we'll add a placeholder
      updates.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
    
    // Add note if provided
    if (options.addNote) {
      updates.notes = options.addNote;
    }
    
    actions.updateTask(taskId, updates);
    
    // TODO: Implement notification logic if notifyAssignee is true
    
    return true;
  }, [actions]);
  
  const getValidStatusTransitions = useCallback((taskId: string) => {
    // This would return valid next statuses based on workflow rules
    // For now, return a placeholder
    return [];
  }, []);
  
  return {
    updateTaskStatus,
    getValidStatusTransitions
  };
}

// Hook for task assignment management
export function useTaskAssignment() {
  const { state, actions } = useTaskManagement();
  
  const assignTask = useCallback((taskId: string, assigneeEmail: string) => {
    actions.updateTask(taskId, {
      assignedTo: assigneeEmail,
      lastUpdated: new Date().toISOString()
    });
  }, [actions]);
  
  const getAssignmentRecommendation = useCallback((taskId: string, availableStaff: string[]) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return null;
    
    return smartTaskHub.recommendTaskAssignment(
      task, 
      availableStaff, 
      state.analytics.staffWorkloadDistribution
    );
  }, [state.tasks, state.analytics.staffWorkloadDistribution]);
  
  const getStaffWorkload = useCallback((staffEmail: string) => {
    return state.analytics.staffWorkloadDistribution[staffEmail] || 0;
  }, [state.analytics.staffWorkloadDistribution]);
  
  return {
    assignTask,
    getAssignmentRecommendation,
    getStaffWorkload,
    staffWorkloads: state.analytics.staffWorkloadDistribution
  };
}