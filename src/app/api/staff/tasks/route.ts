import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { normalizePriorityLabel } from '@/lib/notification-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const userSnap = await adminDb.collection('users').doc(userId).get().catch(() => null);
    const userData = userSnap?.exists ? userSnap.data() : null;
    const staffName = String(
      (userData as any)?.firstName
        ? `${(userData as any)?.firstName || ''} ${(userData as any)?.lastName || ''}`.trim()
        : (userData as any)?.displayName || ''
    ).trim() || 'Staff';
    const staffEmail = String((userData as any)?.email || '').trim().toLowerCase();

    try {
      const loadReviewNotificationRecipient = async () => {
        try {
          const settingsSnap = await adminDb
            .collection('system_settings')
            .doc('review_notifications')
            .get();
          const settings = settingsSnap.exists ? settingsSnap.data() : null;
          // Match the web poller defaults: enabled unless explicitly disabled.
          const enabled = (settings as any)?.enabled === undefined ? true : Boolean((settings as any)?.enabled);
          const pollIntervalSeconds = Number((settings as any)?.pollIntervalSeconds || 180);
          const recipients = ((settings as any)?.recipients || {}) as Record<string, any>;
          const byUid = recipients?.[userId] || null;
          const byEmailKey = staffEmail ? recipients?.[staffEmail] || null : null;
          const byEmailField =
            !byUid && !byEmailKey && staffEmail
              ? (Object.values(recipients).find((r: any) => String(r?.email || '').trim().toLowerCase() === staffEmail) || null)
              : null;
          const recipient = byUid || byEmailKey || byEmailField || null;
          const recipientEnabled = Boolean(recipient?.enabled);
          const allowCs = Boolean(recipient?.csSummary);
          const allowDocs = Boolean(recipient?.documents);
          return {
            enabled,
            pollIntervalSeconds,
            recipientEnabled,
            allowCs,
            allowDocs,
          };
        } catch {
          return {
            enabled: true,
            pollIntervalSeconds: 180,
            recipientEnabled: false,
            allowCs: false,
            allowDocs: false,
          };
        }
      };

      // Fetch Kaiser members assigned to this staff member
      const reviewPrefs = await loadReviewNotificationRecipient();
      const shouldIncludeKaiserTasks = true; // (separate from upload prefs)
      const kaiserResponse = shouldIncludeKaiserTasks
        ? await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/kaiser-members`)
        : null;
      
      if (kaiserResponse && !kaiserResponse.ok) {
        console.warn('Failed to fetch Kaiser members, returning empty tasks');
        return NextResponse.json({
          success: true,
          tasks: [],
          message: 'No Kaiser members data available'
        });
      }

      const kaiserData = kaiserResponse ? await kaiserResponse.json() : { members: [] };
      const allMembers = (kaiserData as any).members || [];

      // Filter members assigned to this staff member (Caspio: Kaiser_User_Assignment)
      const staffNameLower = staffName.toLowerCase();
      const staffFirstNameLower = String((userData as any)?.firstName || '').trim().toLowerCase();
      const staffDisplayLower = String((userData as any)?.displayName || '').trim().toLowerCase();
      const assignedMembers = allMembers.filter((member: any) => {
        const assignedStaffRaw =
          member.Kaiser_User_Assignment ||
          member.Staff_Assignment ||
          member.Staff_Assigned ||
          member.kaiser_user_assignment ||
          member.SW_ID ||
          member.Assigned_Staff ||
          '';
        const assigned = String(assignedStaffRaw || '').trim();
        const assignedLower = assigned.toLowerCase();
        if (!assignedLower) return false;

        // If Caspio stores an email, match by email.
        if (assignedLower.includes('@')) {
          return Boolean(staffEmail) && assignedLower === staffEmail;
        }

        // Otherwise treat as a name (often just first name).
        if (assignedLower === staffNameLower) return true;
        if (staffFirstNameLower && assignedLower === staffFirstNameLower) return true;
        if (staffDisplayLower && assignedLower === staffDisplayLower) return true;
        return false;
      });

      // Create tasks from assigned members (use Kaiser_Next_Step_Date as primary due date)
      const tasks = assignedMembers.map((member: any) => {
        const dueRaw = member.Kaiser_Next_Step_Date || member.Next_Step_Due_Date || '';
        const dueDateIso = dueRaw
          ? (() => {
              try {
                const d = new Date(dueRaw);
                const ms = d.getTime();
                if (!ms || Number.isNaN(ms)) return '';
                return new Date(ms).toISOString();
              } catch {
                return '';
              }
            })()
          : '';

        const isOverdue = dueDateIso ? new Date(dueDateIso) < new Date() : false;
        const isUrgent = dueDateIso
          ? new Date(dueDateIso) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days
          : false;

        return {
          id: `kaiser-${member.id}`,
          title: `Kaiser: ${member.memberFirstName} ${member.memberLastName}`,
          description: `Status: ${member.Kaiser_Status || '—'}. Next: ${member.workflow_step || 'Review next step in Caspio.'}`,
          memberName: `${member.memberFirstName} ${member.memberLastName}`,
          memberClientId: member.client_ID2,
          healthPlan: 'Kaiser',
          taskType: 'kaiser_status',
          priority: isOverdue ? 'Urgent' : isUrgent ? 'Priority' : 'General',
          status: isOverdue ? 'overdue' : 'pending',
          dueDate: dueDateIso || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          assignedBy: 'system',
          assignedByName: 'System',
          assignedTo: userId,
          assignedToName: staffName,
          createdAt: member.created_at || new Date().toISOString(),
          updatedAt: member.last_updated || new Date().toISOString(),
          notes: member.workflow_notes,
          source: 'applications',
          kaiserStatus: member.Kaiser_Status,
          currentKaiserStatus: member.Kaiser_Status
        };
      });

      const normalizePriority = (value: any) => normalizePriorityLabel(value);

      const followUpTasks: any[] = [];
      const reviewTasks: any[] = [];
      const nextStepTasks: any[] = [];
      const now = new Date();

      const buildActionUrl = (applicationId: string, ownerUid?: string | null) => {
        if (ownerUid) {
          return `/admin/applications/${applicationId}?userId=${encodeURIComponent(ownerUid)}`;
        }
        return `/admin/applications/${applicationId}`;
      };

      try {
        const staffSnap = await adminDb
          .collection('staff_notifications')
          .where('userId', '==', userId)
          .limit(200)
          .get();
        staffSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const followUpRequired = Boolean(data.followUpRequired) || Boolean(data.followUpDate);
          if (!followUpRequired) return;
          if (String(data.status || '').toLowerCase() === 'closed') return;
          const followUpDate = data.followUpDate?.toDate?.()?.toISOString?.()
            || data.followUpDate
            || data.timestamp?.toDate?.()?.toISOString?.()
            || new Date().toISOString();
          const isOverdue = followUpDate ? new Date(followUpDate) < now : false;
          followUpTasks.push({
            id: `staff-followup-${docSnap.id}`,
            title: data.title ? `Follow-up: ${data.title}` : 'Follow-up required',
            description: data.message || data.content || '',
            memberName: data.memberName,
            memberClientId: data.clientId2,
            healthPlan: data.healthPlan,
            taskType: 'follow_up',
            priority: normalizePriority(data.priority),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate: followUpDate,
            assignedBy: data.createdBy || 'system',
            assignedByName: data.senderName || data.createdByName || 'Staff',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: data.timestamp?.toDate?.()?.toISOString?.() || data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.timestamp?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            notes: data.message || data.content || '',
            source: 'notes'
          });
        });
      } catch (followupError) {
        console.warn('Failed to load staff follow-up notes:', followupError);
      }

      try {
        const clientSnap = await adminDb
          .collection('client_notes')
          .where('followUpAssignment', '==', userId)
          .limit(200)
          .get();
        clientSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (String(data.followUpStatus || '').toLowerCase() === 'closed') return;
          const followUpDate = data.followUpDate || data.timeStamp || data.createdAt;
          if (!followUpDate) return;
          const dueDate = followUpDate?.toDate?.()?.toISOString?.() || followUpDate;
          const isOverdue = dueDate ? new Date(dueDate) < now : false;
          followUpTasks.push({
            id: `client-followup-${docSnap.id}`,
            title: `Client follow-up: ${data.clientId2 || 'Client'}`,
            description: data.comments || '',
            memberName: data.memberName || `Client ${data.clientId2 || ''}`.trim(),
            memberClientId: data.clientId2,
            healthPlan: data.healthPlan,
            taskType: 'follow_up',
            priority: normalizePriority(data.priority),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate: dueDate,
            assignedBy: data.createdBy || 'system',
            assignedByName: data.createdByName || 'Staff',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: data.timeStamp || data.createdAt || new Date().toISOString(),
            updatedAt: data.syncedAt?.toDate?.()?.toISOString?.() || data.timeStamp || new Date().toISOString(),
            notes: data.comments || '',
            source: 'notes'
          });
        });
      } catch (clientError) {
        console.warn('Failed to load client follow-up notes:', clientError);
      }

      try {
        const memberSnap = await adminDb
          .collection('member-notes')
          .where('assignedTo', '==', userId)
          .limit(200)
          .get();
        memberSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const followUpDate = data.followUpDate;
          if (!followUpDate) return;
          const dueDate = followUpDate?.toDate?.()?.toISOString?.() || followUpDate;
          const isOverdue = dueDate ? new Date(dueDate) < now : false;
          followUpTasks.push({
            id: `member-followup-${docSnap.id}`,
            title: `Member follow-up: ${data.memberName || data.clientId2 || 'Member'}`,
            description: data.noteText || '',
            memberName: data.memberName,
            memberClientId: data.clientId2,
            healthPlan: data.healthPlan,
            taskType: 'follow_up',
            priority: normalizePriority(data.priority),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate: dueDate,
            assignedBy: data.createdBy || 'system',
            assignedByName: data.createdByName || 'Staff',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            notes: data.noteText || '',
            source: 'notes'
          });
        });
      } catch (memberError) {
        console.warn('Failed to load member follow-up notes:', memberError);
      }

      // Review-needed tasks (CS Summary + Documents), controlled by Super Admin toggles.
      try {
        if (reviewPrefs.enabled && reviewPrefs.recipientEnabled && (reviewPrefs.allowCs || reviewPrefs.allowDocs)) {
          const maxItems = 60;

          const buildMemberClientId = (data: any) => {
            return (
              data?.client_ID2 ||
              data?.memberClientId ||
              data?.memberMediCalNum ||
              data?.memberMrn ||
              ''
            );
          };

          const formatIso = (value: any) => {
            try {
              const date = value?.toDate?.() || new Date(value);
              const ms = date?.getTime?.();
              return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
            } catch {
              return new Date().toISOString();
            }
          };

          if (reviewPrefs.allowCs) {
            const [rootCsSnap, groupCsSnap] = await Promise.all([
              adminDb.collection('applications')
                .where('pendingCsReview', '==', true)
                .limit(maxItems)
                .get()
                .catch(() => null),
              adminDb.collectionGroup('applications')
                .where('pendingCsReview', '==', true)
                .limit(maxItems)
                .get()
                .catch(() => null)
            ]);

            const pushCsTask = (docSnap: any, ownerUid?: string | null) => {
              const data = docSnap.data() || {};
              const plan = String(data.healthPlan || '').trim();
              const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`.trim();
              const dueDate = formatIso(data.csSummaryCompletedAt || data.lastUpdated || data.createdAt);
              reviewTasks.push({
                id: `review-cs-${docSnap.id}-${ownerUid || 'admin'}`,
                title: 'Review CS Summary',
                description: 'A CS Summary form has been completed and needs review.',
                memberName,
                memberClientId: buildMemberClientId(data),
                healthPlan: plan || data.healthPlan,
                taskType: 'review',
                reviewKind: 'cs',
                priority: 'High',
                status: 'pending',
                dueDate,
                assignedBy: 'system',
                assignedByName: 'System',
                assignedTo: userId,
                assignedToName: staffName,
                createdAt: dueDate,
                updatedAt: dueDate,
                notes: '',
                source: 'applications',
                applicationId: docSnap.id,
                actionUrl: buildActionUrl(docSnap.id, ownerUid || data.userId || null)
              });
            };

            rootCsSnap?.docs?.forEach((docSnap: any) => pushCsTask(docSnap, null));
            groupCsSnap?.docs?.forEach((docSnap: any) => {
              const ownerUid = docSnap.ref?.parent?.parent?.id || null;
              pushCsTask(docSnap, ownerUid);
            });
          }

          if (reviewPrefs.allowDocs) {
            const [rootDocSnap, groupDocSnap, rootFlagSnap, groupFlagSnap] = await Promise.all([
              adminDb.collection('applications')
                .where('pendingDocReviewCount', '>', 0)
                .limit(maxItems)
                .get()
                .catch(() => null),
              adminDb.collectionGroup('applications')
                .where('pendingDocReviewCount', '>', 0)
                .limit(maxItems)
                .get()
                .catch(() => null)
              ,
              adminDb.collection('applications')
                .where('hasNewDocuments', '==', true)
                .limit(maxItems)
                .get()
                .catch(() => null),
              adminDb.collectionGroup('applications')
                .where('hasNewDocuments', '==', true)
                .limit(maxItems)
                .get()
                .catch(() => null)
            ]);

            const pushDocTask = (docSnap: any, ownerUid?: string | null) => {
              const data = docSnap.data() || {};
              const plan = String(data.healthPlan || '').trim();
              const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`.trim();
              const count = Number(data.pendingDocReviewCount || 0);
              const newCount = Number(data.newDocumentCount || 0);
              const dueDate = formatIso(data.lastDocumentUpload || data.pendingDocReviewUpdatedAt || data.lastUpdated || data.createdAt);
              reviewTasks.push({
                id: `review-docs-${docSnap.id}-${ownerUid || 'admin'}`,
                title: 'Review Uploaded Documents',
                description: (newCount > 0 ? newCount : count) > 0
                  ? `${newCount > 0 ? newCount : count} uploaded document${(newCount > 0 ? newCount : count) === 1 ? '' : 's'} need acknowledgement.`
                  : 'Uploaded documents need acknowledgement.',
                memberName,
                memberClientId: buildMemberClientId(data),
                healthPlan: plan || data.healthPlan,
                taskType: 'review',
                reviewKind: 'docs',
                priority: 'High',
                status: 'pending',
                dueDate,
                assignedBy: 'system',
                assignedByName: 'System',
                assignedTo: userId,
                assignedToName: staffName,
                createdAt: dueDate,
                updatedAt: dueDate,
                notes: '',
                source: 'applications',
                applicationId: docSnap.id,
                actionUrl: buildActionUrl(docSnap.id, ownerUid || data.userId || null)
              });
            };

            rootDocSnap?.docs?.forEach((docSnap: any) => pushDocTask(docSnap, null));
            groupDocSnap?.docs?.forEach((docSnap: any) => {
              const ownerUid = docSnap.ref?.parent?.parent?.id || null;
              pushDocTask(docSnap, ownerUid);
            });
            rootFlagSnap?.docs?.forEach((docSnap: any) => pushDocTask(docSnap, null));
            groupFlagSnap?.docs?.forEach((docSnap: any) => {
              const ownerUid = docSnap.ref?.parent?.parent?.id || null;
              pushDocTask(docSnap, ownerUid);
            });
          }

          // De-dupe review tasks by id (in case of any overlap).
          const seenIds = new Set<string>();
          const deduped = reviewTasks.filter((t) => {
            if (seenIds.has(t.id)) return false;
            seenIds.add(t.id);
            return true;
          });
          reviewTasks.length = 0;
          reviewTasks.push(...deduped);
        }
      } catch (reviewError) {
        console.warn('Failed to load review tasks:', reviewError);
      }

      // Next-step tasks (from staffTrackers), shown on staff Daily Task Tracker calendar.
      try {
        const trackerSnap = await adminDb
          .collectionGroup('staffTrackers')
          .where('assignedStaffId', '==', userId)
          .limit(200)
          .get()
          .catch(() => null);

        trackerSnap?.docs?.forEach((docSnap: any) => {
          const data = docSnap.data() || {};
          const applicationId = String(data.applicationId || docSnap.id || '').trim();
          const ownerUid = String(data.userId || docSnap.ref?.parent?.parent?.parent?.parent?.id || '').trim() || null;
          const memberName = String(data.memberName || '').trim();
          const memberClientId = String(data.memberClientId || data.client_ID2 || '').trim();
          const plan = String(data.healthPlan || '').trim();
          const nextStep = String(data.nextStep || '').trim();

          const dueDate = (() => {
            try {
              const d = data.nextStepDate?.toDate?.() || (data.nextStepDate ? new Date(data.nextStepDate) : null);
              const ms = d?.getTime?.();
              if (!ms || Number.isNaN(ms)) return '';
              return new Date(ms).toISOString();
            } catch {
              return '';
            }
          })();
          if (!dueDate) return;

          const due = new Date(dueDate);
          const isOverdue = due < now;
          const isUrgent = due <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

          nextStepTasks.push({
            id: `next-step-${applicationId}-${ownerUid || 'admin'}`,
            title: memberName ? `Next step: ${memberName}` : 'Next step due',
            description: nextStep || 'Follow the assigned next step.',
            memberName: memberName || undefined,
            memberClientId: memberClientId || undefined,
            healthPlan: plan || undefined,
            taskType: 'next_step',
            priority: normalizePriority(isOverdue ? 'Urgent' : isUrgent ? 'High' : 'Medium'),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate,
            assignedBy: 'system',
            assignedByName: 'System',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: dueDate,
            updatedAt: dueDate,
            notes: '',
            source: 'applications',
            applicationId,
            actionUrl: applicationId ? buildActionUrl(applicationId, ownerUid) : undefined,
          });
        });
      } catch (nextStepError) {
        console.warn('Failed to load next-step tasks:', nextStepError);
      }

      return NextResponse.json({
        success: true,
        tasks: [...followUpTasks, ...nextStepTasks, ...reviewTasks, ...tasks],
        reviewPrefs,
        message: `Found ${tasks.length + followUpTasks.length + reviewTasks.length + nextStepTasks.length} tasks for ${staffName}`
      });

    } catch (fetchError) {
      console.error('Error fetching Kaiser data:', fetchError);
      return NextResponse.json({
        success: true,
        tasks: [],
        message: 'Unable to load Kaiser member tasks at this time'
      });
    }
    
  } catch (error: any) {
    console.error('Error getting staff tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, taskData } = body;

    if (!userId || !taskData) {
      return NextResponse.json(
        { error: 'User ID and task data required' },
        { status: 400 }
      );
    }

    // For now, return success without actually creating the task
    // In production, this would create a task in Firestore or task management system
    return NextResponse.json({
      success: true,
      task: {
        id: `task_${Date.now()}`,
        ...taskData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      message: 'Task created successfully'
    });
  } catch (error: any) {
    console.error('Error creating staff task:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}