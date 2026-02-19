// Firestore-backed member activity tracking
// The previous implementation stored demo events in localStorage. This version reads/writes
// real activity entries via admin-only API routes.

'use client';

import React from 'react';
import { useAuth } from '@/firebase';

export type MemberActivity = {
  id: string;
  clientId2: string;
  activityType:
    | 'status_change'
    | 'pathway_change'
    | 'date_update'
    | 'assignment_change'
    | 'note_added'
    | 'form_update'
    | 'authorization_change';
  category: 'pathway' | 'kaiser' | 'application' | 'assignment' | 'communication' | 'authorization' | 'system';
  title: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  fieldChanged: string;
  changedBy: string;
  changedByName: string;
  timestamp: string; // ISO string
  createdAt?: string | null; // ISO string (optional)
  priority: 'low' | 'normal' | 'high' | 'urgent';
  requiresNotification: boolean;
  assignedStaff?: string[];
  relatedData?: any;
  source: 'admin_app' | 'caspio_sync' | 'manual_entry' | 'system_auto';
};

export type ActivitySummary = {
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
};

type Stats = {
  totalActivities: number;
  todayActivities: number;
  weekActivities: number;
  urgentActivities: number;
  membersCovered: number;
  categoryCounts: Record<string, number>;
};

function computeStats(activities: MemberActivity[]): Stats {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayActivities = activities.filter((a) => new Date(a.timestamp) >= today).length;
  const weekActivities = activities.filter((a) => new Date(a.timestamp) >= weekAgo).length;
  const urgentActivities = activities.filter((a) => a.priority === 'urgent').length;
  const membersCovered = new Set(activities.map((a) => a.clientId2)).size;

  const categoryCounts = activities.reduce((acc, activity) => {
    acc[activity.category] = (acc[activity.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalActivities: activities.length,
    todayActivities,
    weekActivities,
    urgentActivities,
    membersCovered,
    categoryCounts,
  };
}

function inferMemberName(activities: MemberActivity[]): string {
  const nameActivity = activities.find((a) => a.description.includes('for '));
  if (nameActivity) {
    const match = nameActivity.description.match(/for ([^(]+)/);
    return match ? match[1].trim() : 'Unknown Member';
  }
  return 'Unknown Member';
}

async function fetchRecentActivities(params: { idToken: string; limit: number }): Promise<MemberActivity[]> {
  const res = await fetch('/api/admin/member-activity/recent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Failed to fetch member activities (HTTP ${res.status})`);
  }
  const raw = Array.isArray(data?.activities) ? data.activities : [];
  return raw as MemberActivity[];
}

async function postLogActivity(params: { idToken: string; activity: Omit<MemberActivity, 'id' | 'timestamp'> }) {
  const res = await fetch('/api/admin/member-activity/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Failed to log activity (HTTP ${res.status})`);
  }
  return String(data?.id || '');
}

export function useMemberActivityTracker() {
  const auth = useAuth();
  const [activities, setActivities] = React.useState<MemberActivity[]>([]);
  const [stats, setStats] = React.useState<Stats>(() => computeStats([]));
  const [isLoading, setIsLoading] = React.useState(false);

  const refreshStats = React.useCallback(async () => {
    if (!auth?.currentUser) return;
    setIsLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const next = await fetchRecentActivities({ idToken, limit: 2000 });
      next.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(next);
      setStats(computeStats(next));
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  React.useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const getMemberActivities = React.useCallback(
    (clientId2: string, limit?: number) => {
      const memberActivities = activities
        .filter((a) => a.clientId2 === clientId2)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return limit ? memberActivities.slice(0, limit) : memberActivities;
    },
    [activities]
  );

  const getRecentActivitiesFn = React.useCallback(
    (limit: number = 50) => activities.slice(0, limit),
    [activities]
  );

  const getMemberActivitySummary = React.useCallback(
    (clientId2: string): ActivitySummary | null => {
      const memberActs = getMemberActivities(clientId2);
      if (memberActs.length === 0) return null;

      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentActivities = memberActs.filter((a) => new Date(a.timestamp) > last24Hours);

      const statusActivity = memberActs.find((a) => a.activityType === 'status_change');
      const pathwayActivity = memberActs.find((a) => a.activityType === 'pathway_change');

      const assignmentActivities = memberActs.filter((a) => a.activityType === 'assignment_change');
      const assignedStaff = [...new Set(assignmentActivities.map((a) => a.newValue).filter(Boolean) as string[])];

      return {
        clientId2,
        memberName: inferMemberName(memberActs),
        totalActivities: memberActs.length,
        recentActivities: recentActivities.length,
        lastActivity: memberActs[0]?.timestamp || '',
        activePathway: pathwayActivity?.newValue || 'Unknown',
        currentStatus: statusActivity?.newValue || 'Unknown',
        assignedStaff,
        urgentItems: memberActs.filter((a) => a.priority === 'urgent').length,
        pendingFollowUps: memberActs.filter(
          (a) => a.activityType === 'date_update' && a.newValue && new Date(a.newValue) > new Date()
        ).length,
      };
    },
    [getMemberActivities]
  );

  const logActivity = React.useCallback(
    async (activity: Omit<MemberActivity, 'id' | 'timestamp'>) => {
      if (!auth?.currentUser) return '';
      const idToken = await auth.currentUser.getIdToken();
      const id = await postLogActivity({ idToken, activity });
      // Refresh in background so the dashboard updates.
      refreshStats().catch(() => {});
      return id;
    },
    [auth, refreshStats]
  );

  return {
    stats,
    activities,
    isLoading,
    refreshStats,
    logActivity,
    getMemberActivities,
    getRecentActivities: getRecentActivitiesFn,
    getMemberActivitySummary,
  };
}