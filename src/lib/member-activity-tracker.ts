// Comprehensive member activity tracking system
// Tracks all member changes: status, pathway, dates, assignments, etc.

interface MemberActivity {
  id: string;
  clientId2: string;
  activityType: 'status_change' | 'pathway_change' | 'date_update' | 'assignment_change' | 'note_added' | 'form_update' | 'authorization_change';
  category: 'pathway' | 'kaiser' | 'application' | 'assignment' | 'communication' | 'authorization' | 'system';
  title: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  fieldChanged: string;
  changedBy: string;
  changedByName: string;
  timestamp: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  requiresNotification: boolean;
  assignedStaff?: string[];
  relatedData?: any;
  source: 'admin_app' | 'caspio_sync' | 'manual_entry' | 'system_auto';
}

interface ActivitySummary {
  clientId2: string;
  memberName: string;
  totalActivities: number;
  recentActivities: number;
  lastActivity: string;
  activePathway: string;
  currentStatus: string;
  assignedStaff: string[];
  urgentItems: number;
  pendingFollowUps: number;
}

class MemberActivityTracker {
  private activitiesKey = 'member-activities';
  private notificationKey = 'activity-notifications';

  // Log a new member activity
  logActivity(activity: Omit<MemberActivity, 'id' | 'timestamp'>): string {
    try {
      const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fullActivity: MemberActivity = {
        ...activity,
        id: activityId,
        timestamp: new Date().toISOString()
      };

      // Save activity to storage
      const activities = this.getAllActivities();
      activities.push(fullActivity);
      
      // Keep only last 10,000 activities to prevent storage overflow
      if (activities.length > 10000) {
        activities.splice(0, activities.length - 10000);
      }
      
      localStorage.setItem(this.activitiesKey, JSON.stringify(activities));

      // Create notifications if required
      if (fullActivity.requiresNotification) {
        this.createActivityNotifications(fullActivity);
      }

      console.log(`📊 Activity logged: ${fullActivity.title} for ${fullActivity.clientId2}`);
      return activityId;
    } catch (error) {
      console.error('Error logging activity:', error);
      return '';
    }
  }

  // Get all activities
  getAllActivities(): MemberActivity[] {
    try {
      const stored = localStorage.getItem(this.activitiesKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting activities:', error);
      return [];
    }
  }

  // Get activities for specific member
  getMemberActivities(clientId2: string, limit?: number): MemberActivity[] {
    const allActivities = this.getAllActivities();
    const memberActivities = allActivities
      .filter(activity => activity.clientId2 === clientId2)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return limit ? memberActivities.slice(0, limit) : memberActivities;
  }

  // Get recent activities across all members
  getRecentActivities(limit: number = 50): MemberActivity[] {
    const allActivities = this.getAllActivities();
    return allActivities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // Get activities by category
  getActivitiesByCategory(category: MemberActivity['category'], limit?: number): MemberActivity[] {
    const allActivities = this.getAllActivities();
    const categoryActivities = allActivities
      .filter(activity => activity.category === category)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return limit ? categoryActivities.slice(0, limit) : categoryActivities;
  }

  // Get activity summary for member
  getMemberActivitySummary(clientId2: string): ActivitySummary | null {
    const activities = this.getMemberActivities(clientId2);
    
    if (activities.length === 0) return null;

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivities = activities.filter(a => new Date(a.timestamp) > last24Hours);
    
    // Get current status from most recent status change
    const statusActivity = activities.find(a => a.activityType === 'status_change');
    const pathwayActivity = activities.find(a => a.activityType === 'pathway_change');
    
    // Get assigned staff from recent assignment changes
    const assignmentActivities = activities.filter(a => a.activityType === 'assignment_change');
    const assignedStaff = [...new Set(assignmentActivities.map(a => a.newValue).filter(Boolean))];

    return {
      clientId2,
      memberName: this.getMemberNameFromActivities(activities),
      totalActivities: activities.length,
      recentActivities: recentActivities.length,
      lastActivity: activities[0]?.timestamp || '',
      activePathway: pathwayActivity?.newValue || 'Unknown',
      currentStatus: statusActivity?.newValue || 'Unknown',
      assignedStaff,
      urgentItems: activities.filter(a => a.priority === 'urgent').length,
      pendingFollowUps: activities.filter(a => 
        a.activityType === 'date_update' && 
        a.newValue && 
        new Date(a.newValue) > new Date()
      ).length
    };
  }

  // Create notifications for activity
  private createActivityNotifications(activity: MemberActivity): void {
    try {
      const notifications = this.getActivityNotifications();
      
      // Determine who should be notified
      const recipients = this.getNotificationRecipients(activity);
      
      recipients.forEach(recipient => {
        const notification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          activityId: activity.id,
          recipientUserId: recipient.userId,
          recipientName: recipient.name,
          type: 'member_activity',
          title: this.getNotificationTitle(activity),
          message: this.getNotificationMessage(activity),
          priority: activity.priority,
          category: activity.category,
          clientId2: activity.clientId2,
          timestamp: new Date().toISOString(),
          read: false,
          dismissed: false
        };
        
        notifications.push(notification);
      });
      
      localStorage.setItem(this.notificationKey, JSON.stringify(notifications));
      
      // Send push notifications if enabled
      this.sendActivityPushNotifications(activity, recipients);
      
    } catch (error) {
      console.error('Error creating activity notifications:', error);
    }
  }

  // Get notification recipients based on activity
  private getNotificationRecipients(activity: MemberActivity): Array<{userId: string, name: string}> {
    const recipients: Array<{userId: string, name: string}> = [];
    
    // Add assigned staff
    if (activity.assignedStaff) {
      activity.assignedStaff.forEach(staffId => {
        recipients.push({ userId: staffId, name: 'Assigned Staff' });
      });
    }
    
    // Add supervisors for high priority items
    if (activity.priority === 'high' || activity.priority === 'urgent') {
      // Add supervisor notifications (you'd get these from your staff directory)
      recipients.push({ userId: 'supervisor-1', name: 'Supervisor' });
    }
    
    // Add case managers for pathway changes
    if (activity.category === 'pathway') {
      recipients.push({ userId: 'case-manager-1', name: 'Case Manager' });
    }
    
    return recipients;
  }

  // Send push notifications for activities
  private async sendActivityPushNotifications(activity: MemberActivity, recipients: Array<{userId: string, name: string}>): Promise<void> {
    try {
      // This would integrate with your existing push notification system
      const notificationData = {
        title: this.getNotificationTitle(activity),
        body: this.getNotificationMessage(activity),
        data: {
          type: 'member_activity',
          activityId: activity.id,
          clientId2: activity.clientId2,
          category: activity.category,
          priority: activity.priority,
          url: `/admin/client-notes?client=${activity.clientId2}&activity=${activity.id}`
        }
      };

      // Send to each recipient
      for (const recipient of recipients) {
        await fetch('/api/send-activity-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientUserId: recipient.userId,
            notificationData
          })
        });
      }
    } catch (error) {
      console.error('Error sending activity push notifications:', error);
    }
  }

  // Get activity notifications
  getActivityNotifications(): any[] {
    try {
      const stored = localStorage.getItem(this.notificationKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting activity notifications:', error);
      return [];
    }
  }

  // Helper methods
  private getMemberNameFromActivities(activities: MemberActivity[]): string {
    // Try to extract member name from activity descriptions
    const nameActivity = activities.find(a => a.description.includes('for '));
    if (nameActivity) {
      const match = nameActivity.description.match(/for ([^(]+)/);
      return match ? match[1].trim() : 'Unknown Member';
    }
    return 'Unknown Member';
  }

  private getNotificationTitle(activity: MemberActivity): string {
    const icons = {
      status_change: '📊',
      pathway_change: '🛤️',
      date_update: '📅',
      assignment_change: '👥',
      note_added: '📝',
      form_update: '📋',
      authorization_change: '✅'
    };

    const icon = icons[activity.activityType] || '📋';
    return `${icon} ${activity.title}`;
  }

  private getNotificationMessage(activity: MemberActivity): string {
    let message = activity.description;
    
    if (activity.oldValue && activity.newValue) {
      message += ` (${activity.oldValue} → ${activity.newValue})`;
    }
    
    return message;
  }

  // Track specific types of changes
  trackStatusChange(clientId2: string, fieldName: string, oldValue: string, newValue: string, changedBy: string, changedByName: string): string {
    return this.logActivity({
      clientId2,
      activityType: 'status_change',
      category: this.getCategoryFromField(fieldName),
      title: `Status Updated: ${fieldName}`,
      description: `${fieldName} changed from "${oldValue}" to "${newValue}" for member ${clientId2}`,
      oldValue,
      newValue,
      fieldChanged: fieldName,
      changedBy,
      changedByName,
      priority: this.getPriorityFromChange(fieldName, oldValue, newValue),
      requiresNotification: this.shouldNotifyForChange(fieldName, oldValue, newValue),
      source: 'admin_app'
    });
  }

  trackDateUpdate(clientId2: string, dateField: string, oldDate: string, newDate: string, changedBy: string, changedByName: string): string {
    return this.logActivity({
      clientId2,
      activityType: 'date_update',
      category: 'application',
      title: `Date Updated: ${dateField}`,
      description: `${dateField} updated for member ${clientId2}`,
      oldValue: oldDate,
      newValue: newDate,
      fieldChanged: dateField,
      changedBy,
      changedByName,
      priority: this.isUrgentDate(newDate) ? 'urgent' : 'normal',
      requiresNotification: true,
      source: 'admin_app'
    });
  }

  trackPathwayChange(clientId2: string, oldPathway: string, newPathway: string, changedBy: string, changedByName: string): string {
    return this.logActivity({
      clientId2,
      activityType: 'pathway_change',
      category: 'pathway',
      title: `Pathway Changed`,
      description: `Member pathway changed from "${oldPathway}" to "${newPathway}"`,
      oldValue: oldPathway,
      newValue: newPathway,
      fieldChanged: 'pathway',
      changedBy,
      changedByName,
      priority: 'high',
      requiresNotification: true,
      source: 'admin_app'
    });
  }

  trackAssignmentChange(clientId2: string, staffField: string, oldStaff: string, newStaff: string, changedBy: string, changedByName: string): string {
    return this.logActivity({
      clientId2,
      activityType: 'assignment_change',
      category: 'assignment',
      title: `Staff Assignment Changed`,
      description: `${staffField} changed from "${oldStaff}" to "${newStaff}"`,
      oldValue: oldStaff,
      newValue: newStaff,
      fieldChanged: staffField,
      changedBy,
      changedByName,
      priority: 'normal',
      requiresNotification: true,
      assignedStaff: [newStaff],
      source: 'admin_app'
    });
  }

  // Helper methods for categorization
  private getCategoryFromField(fieldName: string): MemberActivity['category'] {
    const fieldMappings: { [key: string]: MemberActivity['category'] } = {
      'Kaiser_Status': 'kaiser',
      'CalAIM_Status': 'authorization',
      'pathway': 'pathway',
      'SNF_Diversion_or_Transition': 'pathway',
      'kaiser_user_assignment': 'assignment',
      'assigned_staff': 'assignment'
    };
    
    return fieldMappings[fieldName] || 'system';
  }

  private getPriorityFromChange(fieldName: string, oldValue: string, newValue: string): MemberActivity['priority'] {
    // High priority changes
    const highPriorityFields = ['CalAIM_Status', 'Kaiser_Status', 'pathway'];
    if (highPriorityFields.includes(fieldName)) {
      return 'high';
    }
    
    // Urgent if moving to error/failed states
    const urgentValues = ['Failed', 'Denied', 'Error', 'Cancelled'];
    if (urgentValues.includes(newValue)) {
      return 'urgent';
    }
    
    return 'normal';
  }

  private shouldNotifyForChange(fieldName: string, oldValue: string, newValue: string): boolean {
    // Always notify for status and pathway changes
    const alwaysNotifyFields = ['CalAIM_Status', 'Kaiser_Status', 'pathway', 'assigned_staff'];
    return alwaysNotifyFields.includes(fieldName);
  }

  private isUrgentDate(dateString: string): boolean {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    const now = new Date();
    const daysDiff = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    // Urgent if due within 3 days
    return daysDiff <= 3 && daysDiff >= 0;
  }

  // Clear old activities (maintenance)
  clearOldActivities(daysToKeep: number = 90): number {
    const activities = this.getAllActivities();
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const filteredActivities = activities.filter(activity => 
      new Date(activity.timestamp) > cutoffDate
    );
    
    const removedCount = activities.length - filteredActivities.length;
    localStorage.setItem(this.activitiesKey, JSON.stringify(filteredActivities));
    
    return removedCount;
  }

  // Get activity statistics
  getActivityStats(): {
    totalActivities: number;
    todayActivities: number;
    weekActivities: number;
    urgentActivities: number;
    membersCovered: number;
    categoryCounts: { [key: string]: number };
  } {
    const activities = this.getAllActivities();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const todayActivities = activities.filter(a => new Date(a.timestamp) >= today).length;
    const weekActivities = activities.filter(a => new Date(a.timestamp) >= weekAgo).length;
    const urgentActivities = activities.filter(a => a.priority === 'urgent').length;
    const membersCovered = new Set(activities.map(a => a.clientId2)).size;
    
    const categoryCounts = activities.reduce((acc, activity) => {
      acc[activity.category] = (acc[activity.category] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
    
    return {
      totalActivities: activities.length,
      todayActivities,
      weekActivities,
      urgentActivities,
      membersCovered,
      categoryCounts
    };
  }
}

// Export singleton instance
export const memberActivityTracker = new MemberActivityTracker();

// React hook for using activity tracker
import React from 'react';

export function useMemberActivityTracker() {
  const [stats, setStats] = React.useState(memberActivityTracker.getActivityStats());
  
  const refreshStats = React.useCallback(() => {
    setStats(memberActivityTracker.getActivityStats());
  }, []);
  
  React.useEffect(() => {
    const interval = setInterval(refreshStats, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [refreshStats]);
  
  return {
    stats,
    refreshStats,
    logActivity: memberActivityTracker.logActivity.bind(memberActivityTracker),
    getMemberActivities: memberActivityTracker.getMemberActivities.bind(memberActivityTracker),
    getRecentActivities: memberActivityTracker.getRecentActivities.bind(memberActivityTracker),
    getMemberActivitySummary: memberActivityTracker.getMemberActivitySummary.bind(memberActivityTracker),
    trackStatusChange: memberActivityTracker.trackStatusChange.bind(memberActivityTracker),
    trackDateUpdate: memberActivityTracker.trackDateUpdate.bind(memberActivityTracker),
    trackPathwayChange: memberActivityTracker.trackPathwayChange.bind(memberActivityTracker),
    trackAssignmentChange: memberActivityTracker.trackAssignmentChange.bind(memberActivityTracker)
  };
}