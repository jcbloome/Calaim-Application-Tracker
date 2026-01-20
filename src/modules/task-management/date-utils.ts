// Centralized Date Utilities
// Eliminates duplication of date formatting and calculation logic

export interface DateCalculationResult {
  daysUntilDue: number;
  isOverdue: boolean;
  isToday: boolean;
  isDueSoon: boolean; // within 3 days
  formattedDate: string;
  relativeDescription: string;
}

// Centralized date calculation (used across my-tasks, kaiser-tracker, etc.)
export const calculateTaskDates = (dateString: string): DateCalculationResult => {
  if (!dateString) {
    return {
      daysUntilDue: 999,
      isOverdue: false,
      isToday: false,
      isDueSoon: false,
      formattedDate: 'No date set',
      relativeDescription: 'No due date'
    };
  }

  try {
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const isOverdue = daysUntilDue < 0;
    const isToday = daysUntilDue === 0;
    const isDueSoon = daysUntilDue > 0 && daysUntilDue <= 3;
    
    const formattedDate = formatDate(dateString);
    const relativeDescription = getRelativeDescription(daysUntilDue, isOverdue, isToday);
    
    return {
      daysUntilDue,
      isOverdue,
      isToday,
      isDueSoon,
      formattedDate,
      relativeDescription
    };
  } catch (error) {
    return {
      daysUntilDue: 999,
      isOverdue: false,
      isToday: false,
      isDueSoon: false,
      formattedDate: 'Invalid date',
      relativeDescription: 'Invalid date'
    };
  }
};

// Centralized date formatting (used across all task pages)
export const formatDate = (dateString: string): string => {
  if (!dateString) return 'No date set';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  } catch {
    return 'Invalid date';
  }
};

// Get relative description (e.g., "2 days overdue", "Due today", "Due in 5 days")
export const getRelativeDescription = (daysUntilDue: number, isOverdue: boolean, isToday: boolean): string => {
  if (isOverdue) {
    const daysOverdue = Math.abs(daysUntilDue);
    return daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`;
  }
  
  if (isToday) {
    return 'Due today';
  }
  
  if (daysUntilDue === 1) {
    return 'Due tomorrow';
  }
  
  if (daysUntilDue <= 7) {
    return `Due in ${daysUntilDue} days`;
  }
  
  if (daysUntilDue <= 30) {
    const weeks = Math.ceil(daysUntilDue / 7);
    return weeks === 1 ? 'Due in 1 week' : `Due in ${weeks} weeks`;
  }
  
  const months = Math.ceil(daysUntilDue / 30);
  return months === 1 ? 'Due in 1 month' : `Due in ${months} months`;
};

// Calculate recommended due date based on workflow step
export const calculateRecommendedDueDate = (currentDate: string, recommendedDays: number): string => {
  const startDate = currentDate ? new Date(currentDate) : new Date();
  const dueDate = new Date(startDate);
  dueDate.setDate(dueDate.getDate() + recommendedDays);
  
  return dueDate.toISOString().split('T')[0]; // Return YYYY-MM-DD format
};

// Get business days between two dates (excluding weekends)
export const getBusinessDaysBetween = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let businessDays = 0;
  const currentDate = new Date(start);
  
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
      businessDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return businessDays;
};

// Add business days to a date (excluding weekends)
export const addBusinessDays = (dateString: string, businessDays: number): string => {
  const date = new Date(dateString);
  let daysAdded = 0;
  
  while (daysAdded < businessDays) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
      daysAdded++;
    }
  }
  
  return date.toISOString().split('T')[0];
};

// Check if a date is a business day
export const isBusinessDay = (dateString: string): boolean => {
  const date = new Date(dateString);
  const dayOfWeek = date.getDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6; // Not Sunday or Saturday
};

// Get the next business day from a given date
export const getNextBusinessDay = (dateString: string): string => {
  const date = new Date(dateString);
  
  do {
    date.setDate(date.getDate() + 1);
  } while (!isBusinessDay(date.toISOString().split('T')[0]));
  
  return date.toISOString().split('T')[0];
};

// Format date for display in different contexts
export const formatDateForContext = (dateString: string, context: 'short' | 'long' | 'relative' | 'time-ago'): string => {
  if (!dateString) return 'No date';
  
  const date = new Date(dateString);
  const now = new Date();
  
  switch (context) {
    case 'short':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    case 'long':
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    
    case 'relative':
      const diffTime = date.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return getRelativeDescription(diffDays, diffDays < 0, diffDays === 0);
    
    case 'time-ago':
      const timeDiff = now.getTime() - date.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) return 'Today';
      if (daysDiff === 1) return 'Yesterday';
      if (daysDiff < 7) return `${daysDiff} days ago`;
      if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
      return `${Math.floor(daysDiff / 30)} months ago`;
    
    default:
      return formatDate(dateString);
  }
};