// Hook for automatic activity tracking in forms and components
import { useCallback, useRef } from 'react';
import { useAuth } from '@/firebase';

interface FormData {
  [key: string]: any;
}

interface TrackingOptions {
  clientId2: string;
  source?: 'admin_app' | 'caspio_sync' | 'manual_entry' | 'system_auto';
  skipFields?: string[];
  customFieldNames?: { [key: string]: string };
}

export function useActivityTracking() {
  const { user } = useAuth();
  const previousDataRef = useRef<FormData>({});

  const postActivity = useCallback(
    async (activity: any) => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/admin/member-activity/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, activity }),
        });
      } catch (error) {
        console.warn('Failed to log member activity', error);
      }
    },
    [user]
  );

  // Track changes between form states
  const trackFormChanges = useCallback((
    newData: FormData, 
    options: TrackingOptions
  ) => {
    if (!user || !options.clientId2) return;

    const previousData = previousDataRef.current;
    const changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      displayName: string;
    }> = [];

    // Compare all fields
    const allFields = new Set([...Object.keys(previousData), ...Object.keys(newData)]);
    
    allFields.forEach(field => {
      // Skip certain fields
      if (options.skipFields?.includes(field)) return;
      if (field.startsWith('_') || field === 'id' || field === 'timestamp') return;

      const oldValue = previousData[field];
      const newValue = newData[field];

      // Check if value actually changed
      if (oldValue !== newValue && !(oldValue === undefined && newValue === '')) {
        const displayName = options.customFieldNames?.[field] || formatFieldName(field);
        changes.push({
          field,
          oldValue: oldValue || '',
          newValue: newValue || '',
          displayName
        });
      }
    });

    // Log each change as a separate activity
    changes.forEach(change => {
      const activityType = getActivityType(change.field);
      const category = getCategoryFromField(change.field);
      
      void postActivity({
        clientId2: options.clientId2,
        activityType,
        category,
        title: `${change.displayName} Updated`,
        description: `${change.displayName} changed for member ${options.clientId2}`,
        oldValue: String(change.oldValue),
        newValue: String(change.newValue),
        fieldChanged: change.field,
        changedBy: user.uid,
        changedByName: user.displayName || user.email || 'Unknown User',
        priority: getPriorityFromField(change.field, change.oldValue, change.newValue),
        requiresNotification: shouldNotifyForField(change.field),
        source: options.source || 'admin_app'
      });
    });

    // Update previous data reference
    previousDataRef.current = { ...newData };

    return changes.length;
  }, [user, postActivity]);

  // Set initial form data (call this when form loads)
  const setInitialData = useCallback((data: FormData) => {
    previousDataRef.current = { ...data };
  }, []);

  // Track specific status change
  const trackStatusChange = useCallback((
    clientId2: string,
    fieldName: string,
    oldValue: string,
    newValue: string
  ) => {
    if (!user) return;

    void postActivity({
      clientId2,
      activityType: 'status_change',
      category: getCategoryFromField(fieldName),
      title: `Status Updated: ${fieldName}`,
      description: `${fieldName} changed from "${oldValue}" to "${newValue}" for member ${clientId2}`,
      oldValue,
      newValue,
      fieldChanged: fieldName,
      changedBy: user.uid,
      changedByName: user.displayName || user.email || 'Unknown User',
      priority: getPriorityFromField(fieldName, oldValue, newValue),
      requiresNotification: shouldNotifyForField(fieldName),
      source: 'admin_app',
    });
  }, [user, postActivity]);

  // Track date updates
  const trackDateUpdate = useCallback((
    clientId2: string,
    dateField: string,
    oldDate: string,
    newDate: string
  ) => {
    if (!user) return;

    void postActivity({
      clientId2,
      activityType: 'date_update',
      category: 'application',
      title: `Date Updated: ${dateField}`,
      description: `${dateField} updated for member ${clientId2}`,
      oldValue: oldDate,
      newValue: newDate,
      fieldChanged: dateField,
      changedBy: user.uid,
      changedByName: user.displayName || user.email || 'Unknown User',
      priority: 'normal',
      requiresNotification: true,
      source: 'admin_app',
    });
  }, [user, postActivity]);

  // Track pathway changes
  const trackPathwayChange = useCallback((
    clientId2: string,
    oldPathway: string,
    newPathway: string
  ) => {
    if (!user) return;

    void postActivity({
      clientId2,
      activityType: 'pathway_change',
      category: 'pathway',
      title: 'Pathway Changed',
      description: `Member pathway changed from "${oldPathway}" to "${newPathway}"`,
      oldValue: oldPathway,
      newValue: newPathway,
      fieldChanged: 'pathway',
      changedBy: user.uid,
      changedByName: user.displayName || user.email || 'Unknown User',
      priority: 'high',
      requiresNotification: true,
      source: 'admin_app',
    });
  }, [user, postActivity]);

  // Track staff assignments
  const trackAssignmentChange = useCallback((
    clientId2: string,
    staffField: string,
    oldStaff: string,
    newStaff: string
  ) => {
    if (!user) return;

    void postActivity({
      clientId2,
      activityType: 'assignment_change',
      category: 'assignment',
      title: 'Staff Assignment Changed',
      description: `${staffField} changed from "${oldStaff}" to "${newStaff}"`,
      oldValue: oldStaff,
      newValue: newStaff,
      fieldChanged: staffField,
      changedBy: user.uid,
      changedByName: user.displayName || user.email || 'Unknown User',
      priority: 'normal',
      requiresNotification: true,
      assignedStaff: [newStaff],
      source: 'admin_app',
    });
  }, [user, postActivity]);

  // Track note creation
  const trackNoteCreation = useCallback((
    clientId2: string,
    noteContent: string,
    assignedTo?: string
  ) => {
    if (!user) return;

    void postActivity({
      clientId2,
      activityType: 'note_added',
      category: 'communication',
      title: 'Note Added',
      description: `New note added for member ${clientId2}`,
      oldValue: '',
      newValue: noteContent.substring(0, 100) + (noteContent.length > 100 ? '...' : ''),
      fieldChanged: 'notes',
      changedBy: user.uid,
      changedByName: user.displayName || user.email || 'Unknown User',
      priority: assignedTo ? 'normal' : 'low',
      requiresNotification: !!assignedTo,
      assignedStaff: assignedTo ? [assignedTo] : undefined,
      source: 'admin_app'
    });
  }, [user, postActivity]);

  return {
    trackFormChanges,
    setInitialData,
    trackStatusChange,
    trackDateUpdate,
    trackPathwayChange,
    trackAssignmentChange,
    trackNoteCreation
  };
}

// Helper functions
function formatFieldName(field: string): string {
  // Convert camelCase and snake_case to readable names
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
}

function getActivityType(field: string): 'status_change' | 'pathway_change' | 'date_update' | 'assignment_change' | 'note_added' | 'form_update' | 'authorization_change' {
  const statusFields = ['Kaiser_Status', 'CalAIM_Status', 'status', 'memberStatus'];
  const pathwayFields = ['pathway', 'SNF_Diversion_or_Transition', 'memberPathway'];
  const dateFields = ['next_steps_date', 'followUpDate', 'dueDate', 'scheduledDate'];
  const assignmentFields = ['kaiser_user_assignment', 'assigned_staff', 'assignedTo'];
  const authFields = ['authorization', 'approved', 'authorized'];

  if (statusFields.some(f => field.includes(f))) return 'status_change';
  if (pathwayFields.some(f => field.includes(f))) return 'pathway_change';
  if (dateFields.some(f => field.includes(f))) return 'date_update';
  if (assignmentFields.some(f => field.includes(f))) return 'assignment_change';
  if (authFields.some(f => field.includes(f))) return 'authorization_change';
  
  return 'form_update';
}

function getCategoryFromField(field: string): 'pathway' | 'kaiser' | 'application' | 'assignment' | 'communication' | 'authorization' | 'system' {
  if (field.toLowerCase().includes('kaiser')) return 'kaiser';
  if (field.toLowerCase().includes('pathway') || field.includes('SNF')) return 'pathway';
  if (field.toLowerCase().includes('assign') || field.toLowerCase().includes('staff')) return 'assignment';
  if (field.toLowerCase().includes('auth') || field.toLowerCase().includes('approve')) return 'authorization';
  if (field.toLowerCase().includes('note') || field.toLowerCase().includes('comment')) return 'communication';
  if (field.toLowerCase().includes('date') || field.toLowerCase().includes('step')) return 'application';
  
  return 'system';
}

function getPriorityFromField(field: string, oldValue: any, newValue: any): 'low' | 'normal' | 'high' | 'urgent' {
  // High priority fields
  const highPriorityFields = ['Kaiser_Status', 'CalAIM_Status', 'pathway', 'authorization'];
  if (highPriorityFields.some(f => field.includes(f))) {
    return 'high';
  }

  // Urgent if moving to error/failed states
  const urgentValues = ['Failed', 'Denied', 'Error', 'Cancelled', 'Rejected'];
  if (urgentValues.some(v => String(newValue).includes(v))) {
    return 'urgent';
  }

  // Normal for assignments and dates
  const normalFields = ['assigned', 'date', 'staff'];
  if (normalFields.some(f => field.toLowerCase().includes(f))) {
    return 'normal';
  }

  return 'low';
}

function shouldNotifyForField(field: string): boolean {
  // Always notify for these fields
  const notifyFields = [
    'Kaiser_Status', 'CalAIM_Status', 'pathway', 'assigned_staff', 
    'kaiser_user_assignment', 'authorization', 'next_steps_date'
  ];
  
  return notifyFields.some(f => field.includes(f));
}

// Example usage in a form component:
/*
function MemberForm({ clientId2, initialData }) {
  const { trackFormChanges, setInitialData } = useActivityTracking();
  const [formData, setFormData] = useState(initialData);

  useEffect(() => {
    setInitialData(initialData);
  }, [initialData, setInitialData]);

  const handleSubmit = async (data) => {
    // Save to database
    await saveMemberData(data);
    
    // Track changes
    const changeCount = trackFormChanges(data, {
      clientId2,
      skipFields: ['lastModified', 'updatedAt'],
      customFieldNames: {
        'Kaiser_Status': 'Kaiser Authorization Status',
        'next_steps_date': 'Next Steps Date'
      }
    });
    
    if (changeCount > 0) {
      toast.success(`${changeCount} changes tracked and notifications sent`);
    }
  };
}
*/