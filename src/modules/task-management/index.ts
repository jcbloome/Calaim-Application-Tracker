// Centralized Task Management Module
// Eliminates duplication across kaiser-tracker, my-tasks, managerial-overview, etc.

export * from './types';
export * from './workflow-engine';
export * from './task-processor';
export * from './smart-prioritizer';
export * from './status-manager';
export * from './date-utils';
export * from './hooks';

// Main module exports
export { TaskManagementProvider, useTaskManagement } from './context';
export { WorkflowAutomationEngine } from './workflow-engine';
export { SmartTaskHub } from './smart-task-hub';