'use client';

// Task Management Context
// Provides centralized state management for all task-related functionality

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type { 
  TaskManagementState, 
  TaskAction, 
  UnifiedTask, 
  TaskFilter,
  AutomationRule 
} from './types';
import { taskProcessor } from './task-processor';
import { workflowEngine } from './workflow-engine';
import { smartTaskHub } from './smart-task-hub';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Initial state
const initialState: TaskManagementState = {
  tasks: [],
  filteredTasks: [],
  taskGroups: {},
  currentFilter: {},
  analytics: {
    totalTasks: 0,
    overdueTasks: 0,
    completedThisWeek: 0,
    averageCompletionTime: 0,
    bottleneckStatuses: [],
    staffWorkloadDistribution: {},
    priorityDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
    healthPlanDistribution: { Kaiser: 0, 'Health Net': 0, Other: 0 }
  },
  isLoading: false,
  error: null,
  automationRules: [],
  automationEnabled: true,
  prioritizationConfig: {
    weights: {
      daysOverdue: 0.4,
      memberComplexity: 0.2,
      staffWorkload: 0.15,
      pathwayCriticality: 0.15,
      historicalDelay: 0.1
    },
    thresholds: {
      critical: 85,
      high: 65,
      medium: 35
    }
  },
  smartSortEnabled: true
};

// Reducer function
function taskManagementReducer(state: TaskManagementState, action: TaskAction): TaskManagementState {
  switch (action.type) {
    case 'SET_TASKS': {
      const tasks = action.payload;
      const filteredTasks = taskProcessor.filterTasks(tasks, state.currentFilter);
      const taskGroups = smartTaskHub.groupTasksIntelligently(filteredTasks);
      const analytics = smartTaskHub.generateAnalytics(tasks);
      
      return {
        ...state,
        tasks,
        filteredTasks,
        taskGroups,
        analytics
      };
    }
    
    case 'UPDATE_TASK': {
      const { id, updates } = action.payload;
      const updatedTasks = state.tasks.map(task => 
        task.id === id ? { ...task, ...updates } : task
      );
      
      const filteredTasks = taskProcessor.filterTasks(updatedTasks, state.currentFilter);
      const taskGroups = smartTaskHub.groupTasksIntelligently(filteredTasks);
      const analytics = smartTaskHub.generateAnalytics(updatedTasks);
      
      return {
        ...state,
        tasks: updatedTasks,
        filteredTasks,
        taskGroups,
        analytics
      };
    }
    
    case 'SET_FILTER': {
      const filter = action.payload;
      const filteredTasks = taskProcessor.filterTasks(state.tasks, filter);
      const taskGroups = smartTaskHub.groupTasksIntelligently(filteredTasks);
      
      return {
        ...state,
        currentFilter: filter,
        filteredTasks,
        taskGroups
      };
    }
    
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      };
    
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false
      };
    
    case 'TOGGLE_AUTOMATION':
      return {
        ...state,
        automationEnabled: action.payload
      };
    
    case 'UPDATE_AUTOMATION_RULE': {
      const rule = action.payload;
      const existingIndex = state.automationRules.findIndex(r => r.id === rule.id);
      
      const automationRules = existingIndex >= 0
        ? state.automationRules.map((r, i) => i === existingIndex ? rule : r)
        : [...state.automationRules, rule];
      
      return {
        ...state,
        automationRules
      };
    }
    
    case 'BULK_UPDATE_TASKS': {
      const { ids, updates } = action.payload;
      const updatedTasks = taskProcessor.bulkUpdateTasks(state.tasks, updates, ids);
      const filteredTasks = taskProcessor.filterTasks(updatedTasks, state.currentFilter);
      const taskGroups = smartTaskHub.groupTasksIntelligently(filteredTasks);
      const analytics = smartTaskHub.generateAnalytics(updatedTasks);
      
      return {
        ...state,
        tasks: updatedTasks,
        filteredTasks,
        taskGroups,
        analytics
      };
    }
    
    case 'AUTO_ADVANCE_WORKFLOW': {
      const { taskId, newStatus } = action.payload;
      const updatedTasks = state.tasks.map(task => {
        if (task.id === taskId) {
          const newDueDate = workflowEngine.getRecommendedDueDate(task.healthPlan, newStatus);
          return {
            ...task,
            currentStatus: newStatus,
            dueDate: newDueDate,
            lastUpdated: new Date().toISOString()
          };
        }
        return task;
      });
      
      const filteredTasks = taskProcessor.filterTasks(updatedTasks, state.currentFilter);
      const taskGroups = smartTaskHub.groupTasksIntelligently(filteredTasks);
      const analytics = smartTaskHub.generateAnalytics(updatedTasks);
      
      return {
        ...state,
        tasks: updatedTasks,
        filteredTasks,
        taskGroups,
        analytics
      };
    }
    
    default:
      return state;
  }
}

// Context
const TaskManagementContext = createContext<{
  state: TaskManagementState;
  dispatch: React.Dispatch<TaskAction>;
  actions: {
    loadTasks: () => Promise<void>;
    updateTask: (id: string, updates: Partial<UnifiedTask>) => void;
    bulkUpdateTasks: (ids: string[], updates: Partial<UnifiedTask>) => void;
    setFilter: (filter: TaskFilter) => void;
    autoAdvanceTask: (taskId: string) => Promise<boolean>;
    searchTasks: (searchTerm: string) => UnifiedTask[];
    getTasksForUser: (userEmail: string) => UnifiedTask[];
    refreshTasks: () => Promise<void>;
  };
} | null>(null);

// Provider component
export function TaskManagementProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(taskManagementReducer, initialState);
  
  // Load tasks from Firebase Functions
  const loadTasks = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    
    try {
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      const result = await fetchKaiserMembers();
      const data = result.data as any;
      
      if (data.success) {
        const rawTasks = data.members || [];
        
        // Process tasks with intelligent enhancements
        const processedTasks = taskProcessor.processTasks(rawTasks, {
          enableSmartPrioritization: state.smartSortEnabled,
          enableWorkflowAnalysis: true,
          staffWorkloads: state.analytics.staffWorkloadDistribution
        });
        
        dispatch({ type: 'SET_TASKS', payload: processedTasks });
      } else {
        throw new Error(data.error || 'Failed to load tasks');
      }
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };
  
  // Update single task
  const updateTask = (id: string, updates: Partial<UnifiedTask>) => {
    dispatch({ type: 'UPDATE_TASK', payload: { id, updates } });
  };
  
  // Bulk update tasks
  const bulkUpdateTasks = (ids: string[], updates: Partial<UnifiedTask>) => {
    dispatch({ type: 'BULK_UPDATE_TASKS', payload: { ids, updates } });
  };
  
  // Set filter
  const setFilter = (filter: TaskFilter) => {
    dispatch({ type: 'SET_FILTER', payload: filter });
  };
  
  // Auto-advance task workflow
  const autoAdvanceTask = async (taskId: string): Promise<boolean> => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return false;
    
    const result = workflowEngine.autoAdvanceTask(task, ['conditions_met']); // Mock conditions
    
    if (result.success && result.newStatus) {
      dispatch({ 
        type: 'AUTO_ADVANCE_WORKFLOW', 
        payload: { taskId, newStatus: result.newStatus } 
      });
      return true;
    }
    
    return false;
  };
  
  // Search tasks
  const searchTasks = (searchTerm: string): UnifiedTask[] => {
    return taskProcessor.searchTasks(state.filteredTasks, searchTerm);
  };
  
  // Get tasks for specific user
  const getTasksForUser = (userEmail: string): UnifiedTask[] => {
    return taskProcessor.getTasksForUser(state.tasks, userEmail);
  };
  
  // Refresh tasks
  const refreshTasks = async () => {
    await loadTasks();
  };
  
  // Initialize automation rules
  useEffect(() => {
    const rules = workflowEngine.getAutomationRules();
    rules.forEach(rule => {
      dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: rule });
    });
  }, []);
  
  // Auto-load tasks on mount
  useEffect(() => {
    loadTasks();
  }, []);
  
  const actions = {
    loadTasks,
    updateTask,
    bulkUpdateTasks,
    setFilter,
    autoAdvanceTask,
    searchTasks,
    getTasksForUser,
    refreshTasks
  };
  
  return (
    <TaskManagementContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </TaskManagementContext.Provider>
  );
}

// Hook to use task management
export function useTaskManagement() {
  const context = useContext(TaskManagementContext);
  if (!context) {
    throw new Error('useTaskManagement must be used within TaskManagementProvider');
  }
  return context;
}

// Specialized hooks for common use cases

// Hook for my-tasks page
export function useMyTasks(userEmail: string) {
  const { state, actions } = useTaskManagement();
  
  const myTasks = taskProcessor.getTasksForUser(state.tasks, userEmail);
  const myTaskGroups = smartTaskHub.groupTasksIntelligently(myTasks);
  
  return {
    tasks: myTasks,
    taskGroups: myTaskGroups,
    isLoading: state.isLoading,
    error: state.error,
    refreshTasks: actions.refreshTasks,
    updateTask: actions.updateTask
  };
}

// Hook for kaiser-tracker page
export function useKaiserTasks() {
  const { state, actions } = useTaskManagement();
  
  const kaiserTasks = state.tasks.filter(t => t.healthPlan === 'Kaiser');
  const statusSummary = taskProcessor.groupTasks(kaiserTasks, 'status');
  
  return {
    tasks: kaiserTasks,
    filteredTasks: state.filteredTasks.filter(t => t.healthPlan === 'Kaiser'),
    statusSummary,
    isLoading: state.isLoading,
    error: state.error,
    setFilter: actions.setFilter,
    bulkUpdateTasks: actions.bulkUpdateTasks,
    refreshTasks: actions.refreshTasks
  };
}

// Hook for managerial overview
export function useManagerialOverview() {
  const { state, actions } = useTaskManagement();
  
  const analytics = smartTaskHub.generateAnalytics(state.tasks);
  const suggestions = smartTaskHub.getSmartSuggestions(state.tasks);
  
  return {
    tasks: state.tasks,
    analytics,
    suggestions,
    taskGroups: state.taskGroups,
    isLoading: state.isLoading,
    error: state.error,
    bulkUpdateTasks: actions.bulkUpdateTasks,
    autoAdvanceTask: actions.autoAdvanceTask,
    refreshTasks: actions.refreshTasks
  };
}