// Centralized Status Management
// Eliminates duplication of status colors, icons, and styling across pages

import React from 'react';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Pause, 
  XCircle, 
  FileText, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail,
  Target,
  RefreshCw
} from 'lucide-react';
import type { StatusStyle, HealthPlan } from './types';

// Centralized status color mapping (used across kaiser-tracker, my-tasks, etc.)
export const STATUS_COLORS: Record<string, StatusStyle> = {
  // Completion States
  'Complete': {
    color: 'bg-green-50 text-green-700 border-green-200',
    backgroundColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
    icon: 'CheckCircle'
  },
  'ILS Contracted (Complete)': {
    color: 'bg-green-50 text-green-700 border-green-200',
    backgroundColor: 'bg-green-50',
    borderColor: 'border-green-200', 
    textColor: 'text-green-700',
    icon: 'CheckCircle'
  },
  
  // Active/In Progress States
  'Active': {
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    backgroundColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    icon: 'Target'
  },
  'Pending': {
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    backgroundColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-700',
    icon: 'Clock'
  },
  
  // Hold/Inactive States
  'On-Hold': {
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    backgroundColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-700',
    icon: 'Pause'
  },
  'Non-active': {
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    backgroundColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-700',
    icon: 'XCircle'
  },
  
  // Error/Problem States
  'Denied': {
    color: 'bg-red-50 text-red-700 border-red-200',
    backgroundColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    icon: 'XCircle'
  },
  'Expired': {
    color: 'bg-red-50 text-red-700 border-red-200',
    backgroundColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    icon: 'AlertTriangle'
  },
  
  // Kaiser-Specific Statuses
  'Pre-T2038, Compiling Docs': {
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    backgroundColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    icon: 'FileText'
  },
  'T2038 Requested': {
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    backgroundColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    icon: 'FileText'
  },
  'T2038 Received': {
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    backgroundColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    icon: 'CheckCircle'
  },
  'T2038 received, Need First Contact': {
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    backgroundColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    textColor: 'text-violet-700',
    icon: 'Phone'
  },
  'T2038 received, doc collection': {
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    backgroundColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    textColor: 'text-violet-700',
    icon: 'FileText'
  },
  'RN Visit Needed': {
    color: 'bg-red-50 text-red-700 border-red-200',
    backgroundColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    icon: 'Calendar'
  },
  'RN/MSW Scheduled': {
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    backgroundColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    textColor: 'text-cyan-700',
    icon: 'Calendar'
  },
  'RN Visit Complete': {
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    backgroundColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    textColor: 'text-teal-700',
    icon: 'CheckCircle'
  },
  'Tier Level Requested': {
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    backgroundColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    textColor: 'text-indigo-700',
    icon: 'FileText'
  },
  'Tier Level Received': {
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    backgroundColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    textColor: 'text-indigo-700',
    icon: 'CheckCircle'
  },
  'Tier Level Appeal': {
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    backgroundColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    icon: 'AlertTriangle'
  },
  'RCFE Needed': {
    color: 'bg-sky-50 text-sky-700 border-sky-200',
    backgroundColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    textColor: 'text-sky-700',
    icon: 'MapPin'
  },
  'RCFE_Located': {
    color: 'bg-green-50 text-green-700 border-green-200',
    backgroundColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
    icon: 'MapPin'
  },
  'R&B Needed': {
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    backgroundColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-700',
    icon: 'FileText'
  },
  'R&B Requested': {
    color: 'bg-pink-50 text-pink-700 border-pink-200',
    backgroundColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    textColor: 'text-pink-700',
    icon: 'FileText'
  },
  'R&B Signed': {
    color: 'bg-pink-50 text-pink-700 border-pink-200',
    backgroundColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    textColor: 'text-pink-700',
    icon: 'CheckCircle'
  },
  'ILS Sent for Contract': {
    color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    backgroundColor: 'bg-fuchsia-50',
    borderColor: 'border-fuchsia-200',
    textColor: 'text-fuchsia-700',
    icon: 'FileText'
  },
  'ILS Contract Email Needed': {
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    backgroundColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    icon: 'Mail'
  },
  
  // New Kaiser Statuses from Updated Caspio List
  'T2038, Not Requested, Doc Collection': {
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    backgroundColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-700',
    icon: 'FileText'
  },
  'T2038 Request Ready': {
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    backgroundColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    textColor: 'text-emerald-700',
    icon: 'CheckCircle'
  },
  'T2038 Auth Only Email': {
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    backgroundColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    icon: 'Mail'
  },
  'Tier Level Request Needed': {
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    backgroundColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    textColor: 'text-rose-700',
    icon: 'FileText'
  },
  'ILS/RCFE Contract Email Needed': {
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    backgroundColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    icon: 'Mail'
  },
  'ILS/RCFE Contact Email Sent': {
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    backgroundColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    textColor: 'text-cyan-700',
    icon: 'Mail'
  },
  'ILS/RCFE Connection Confirmed': {
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    backgroundColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    textColor: 'text-teal-700',
    icon: 'CheckCircle'
  },
  'ILS Contracted and Member Moved In': {
    color: 'bg-green-50 text-green-700 border-green-200',
    backgroundColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
    icon: 'CheckCircle'
  },
  
  // Health Net Statuses
  'Application Being Reviewed': {
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    backgroundColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    icon: 'FileText'
  },
  'Scheduling ISP': {
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    backgroundColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-700',
    icon: 'Calendar'
  },
  'ISP Completed': {
    color: 'bg-green-50 text-green-700 border-green-200',
    backgroundColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
    icon: 'CheckCircle'
  },
  'Locating RCFEs': {
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    backgroundColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-700',
    icon: 'MapPin'
  },
  'Submitted to Health Net': {
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    backgroundColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    icon: 'FileText'
  },
  'Authorization Status': {
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    backgroundColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    textColor: 'text-indigo-700',
    icon: 'CheckCircle'
  }
};

// Get status styling (centralized function used across all pages)
export const getStatusStyle = (status: string): StatusStyle => {
  return STATUS_COLORS[status] || {
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    backgroundColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-700',
    icon: 'Clock'
  };
};

// Get status color (legacy support for existing code)
export const getStatusColor = (status: string): string => {
  return getStatusStyle(status).color;
};

// Get status icon component (centralized icon mapping)
export const getStatusIcon = (status: string, className: string = "h-3 w-3") => {
  const iconName = getStatusStyle(status).icon;
  
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    CheckCircle,
    Clock,
    AlertTriangle,
    Pause,
    XCircle,
    FileText,
    Calendar,
    MapPin,
    Phone,
    Mail,
    Target,
    RefreshCw
  };
  
  const IconComponent = iconMap[iconName] || Clock;
  return <IconComponent className={className} />;
};

// Priority-based styling
export const getPriorityStyle = (priority: 'critical' | 'high' | 'medium' | 'low'): StatusStyle => {
  const priorityStyles: Record<string, StatusStyle> = {
    critical: {
      color: 'bg-red-100 text-red-800 border-red-300',
      backgroundColor: 'bg-red-100',
      borderColor: 'border-red-300',
      textColor: 'text-red-800',
      icon: 'AlertTriangle'
    },
    high: {
      color: 'bg-orange-100 text-orange-800 border-orange-300',
      backgroundColor: 'bg-orange-100',
      borderColor: 'border-orange-300',
      textColor: 'text-orange-800',
      icon: 'Clock'
    },
    medium: {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      backgroundColor: 'bg-yellow-100',
      borderColor: 'border-yellow-300',
      textColor: 'text-yellow-800',
      icon: 'Target'
    },
    low: {
      color: 'bg-green-100 text-green-800 border-green-300',
      backgroundColor: 'bg-green-100',
      borderColor: 'border-green-300',
      textColor: 'text-green-800',
      icon: 'CheckCircle'
    }
  };
  
  return priorityStyles[priority] || priorityStyles.medium;
};

// Urgency-based styling (for overdue/due soon tasks)
export const getUrgencyStyle = (daysUntilDue: number, isOverdue: boolean): StatusStyle => {
  if (isOverdue || daysUntilDue <= 0) {
    return {
      color: 'bg-red-100 text-red-800 border-red-200',
      backgroundColor: 'bg-red-100',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      icon: 'AlertTriangle'
    };
  }
  
  if (daysUntilDue <= 1) {
    return {
      color: 'bg-orange-100 text-orange-800 border-orange-200',
      backgroundColor: 'bg-orange-100',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      icon: 'Clock'
    };
  }
  
  if (daysUntilDue <= 3) {
    return {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      backgroundColor: 'bg-yellow-100',
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-800',
      icon: 'Clock'
    };
  }
  
  return {
    color: 'bg-green-100 text-green-800 border-green-200',
    backgroundColor: 'bg-green-100',
    borderColor: 'border-green-200',
    textColor: 'text-green-800',
    icon: 'CheckCircle'
  };
};