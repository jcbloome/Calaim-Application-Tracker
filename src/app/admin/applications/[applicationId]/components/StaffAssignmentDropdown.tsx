'use client';

import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { isMifServiceRequestFormName } from '@/lib/mif-service-delivery-form';
import type { Application } from '@/lib/definitions';
import { useFirestore } from '@/firebase';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useDesktopPresenceMap } from '@/hooks/use-desktop-presence';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { firebaseAuthHeaders } from '@/lib/admin-fetch';
import { buildMemberActionLogEntry, MEMBER_ACTION_KEYS, type MemberActionLogEntry } from '@/lib/member-action-log';
import { buildFirstContactAckResetFields, isNeedFirstContactKaiserStatus } from '@/lib/first-contact-ack';

// Staff Assignment Dropdown Component
export function StaffAssignmentDropdown({ 
    application, 
    onStaffChange 
}: { 
    application: Application; 
    onStaffChange: (
      staffId: string,
      staffName: string,
      meta?: {
        assignedDate?: string;
        staffAssignmentNotifiedAt?: string | null;
        logEntries?: MemberActionLogEntry[];
      }
    ) => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const { user: adminUser } = useAdmin();
    type StaffCandidate = {
      uid: string;
      role: 'Admin' | 'Super Admin' | 'Staff';
      firstName: string;
      lastName: string;
      email: string;
      isKaiserStaff?: boolean;
      isHealthNetStaff?: boolean;
      displayName: string;
    };
    const [staffList, setStaffList] = useState<StaffCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);
    const [staffFilterLabel, setStaffFilterLabel] = useState<string>('Showing all staff');
    const staffUids = useMemo(() => staffList.map((s) => s.uid).filter(Boolean), [staffList]);
    const { isActiveByUid } = useDesktopPresenceMap(staffUids);
    useEffect(() => {
        // Filter staff list based on the application's health plan.
        let staff: StaffCandidate[] = [];
        
        const loadStaff = async () => {
            if (!firestore) {
                setIsLoadingStaff(false);
                return;
            }
            try {
                const planLower = String(application.healthPlan || '').toLowerCase();
                const isKaiserPlan = planLower.includes('kaiser');
                const isHealthNetPlan =
                  planLower.includes('health net') ||
                  planLower.includes('healthnet') ||
                  planLower === 'hn';

                // Pull three small staff sets and merge:
                // - isStaff (general staff)
                // - isKaiserStaff (designated Kaiser staff)
                // - isHealthNetStaff (designated Health Net staff)
                // This avoids missing staff that are designated but not flagged isStaff.
                const [staffResult, kaiserResult, hnResult, adminRolesResult, superAdminRolesResult] =
                  await Promise.allSettled([
                    getDocs(query(collection(firestore, 'users'), where('isStaff', '==', true))),
                    getDocs(query(collection(firestore, 'users'), where('isKaiserStaff', '==', true))),
                    getDocs(query(collection(firestore, 'users'), where('isHealthNetStaff', '==', true))),
                    getDocs(collection(firestore, 'roles_admin')),
                    getDocs(collection(firestore, 'roles_super_admin')),
                  ]);

                const staffSnap = staffResult.status === 'fulfilled' ? staffResult.value : null;
                const kaiserSnap = kaiserResult.status === 'fulfilled' ? kaiserResult.value : null;
                const hnSnap = hnResult.status === 'fulfilled' ? hnResult.value : null;
                const adminRolesSnap = adminRolesResult.status === 'fulfilled' ? adminRolesResult.value : null;
                const superAdminRolesSnap = superAdminRolesResult.status === 'fulfilled' ? superAdminRolesResult.value : null;

                if (!staffSnap && !kaiserSnap && !hnSnap) {
                  throw new Error('Unable to load staff records from Firestore.');
                }

                if (adminRolesResult.status === 'rejected' || superAdminRolesResult.status === 'rejected') {
                  console.warn('Staff role collections unavailable; continuing with fallback staff roles.');
                }

                const adminIds = new Set((adminRolesSnap?.docs || []).map((d) => d.id));
                const superAdminIds = new Set((superAdminRolesSnap?.docs || []).map((d) => d.id));

                const userDataByUid = new Map<string, any>();
                (staffSnap?.docs || []).forEach((d) => userDataByUid.set(d.id, d.data()));
                (kaiserSnap?.docs || []).forEach((d) => userDataByUid.set(d.id, d.data()));
                (hnSnap?.docs || []).forEach((d) => userDataByUid.set(d.id, d.data()));

                const currentAssignedId = String((application as any)?.assignedStaffId || '').trim();
                if (currentAssignedId && !userDataByUid.has(currentAssignedId)) {
                  try {
                    const snap = await getDoc(doc(firestore, 'users', currentAssignedId));
                    if (snap.exists()) {
                      userDataByUid.set(currentAssignedId, snap.data());
                    }
                  } catch {
                    // ignore
                  }
                }

                const toCandidate = (uid: string, data: any): StaffCandidate | null => {
                  if (!data) return null;
                  const firstName = String(data?.firstName || data?.displayName || data?.name || '').trim();
                  const lastName = String(data?.lastName || '').trim();
                  const email = String(data?.email || '').trim();
                  const displayName = `${firstName} ${lastName}`.trim() || email;
                  if (!displayName) return null;
                  const role: StaffCandidate['role'] =
                    superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
                  return {
                    uid,
                    role,
                    firstName,
                    lastName,
                    email: email || uid,
                    isKaiserStaff: Boolean(data?.isKaiserStaff),
                    isHealthNetStaff: Boolean(data?.isHealthNetStaff),
                    displayName,
                  };
                };

                const candidates: StaffCandidate[] = Array.from(userDataByUid.entries())
                  .map(([uid, data]) => toCandidate(uid, data))
                  .filter(Boolean) as StaffCandidate[];

                const designatedCandidates = isKaiserPlan
                  ? candidates.filter((c) => c.isKaiserStaff)
                  : isHealthNetPlan
                    ? candidates.filter((c) => c.isHealthNetStaff)
                    : [];

                let filtered = candidates;
                let label = 'Showing all staff';

                if (isKaiserPlan || isHealthNetPlan) {
                  filtered = [...designatedCandidates];
                  // Keep currently assigned staff visible even if designation was later changed.
                  if (currentAssignedId) {
                    const currentAssigned = candidates.find((c) => c.uid === currentAssignedId);
                    if (currentAssigned && !filtered.some((c) => c.uid === currentAssigned.uid)) {
                      filtered.push(currentAssigned);
                    }
                  }
                  if (filtered.length > 0) {
                    label = isKaiserPlan ? 'Showing Kaiser staff cards' : 'Showing Health Net staff cards';
                  } else if (isKaiserPlan) {
                    label = 'No Kaiser staff designated in Staff Management.';
                  } else {
                    label = 'No Health Net staff designated in Staff Management.';
                  }
                }

                staff = [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName));
                setStaffFilterLabel(label);
            } catch (error) {
                console.warn('Error loading staff list:', error);
            } finally {
                setStaffList(staff);
                setIsLoadingStaff(false);
            }
        };

        loadStaff();

    }, [application.healthPlan, firestore]);

    const handleStaffAssignment = async (
      staffId: string,
      options?: { forceResend?: boolean }
    ) => {
        const selectedStaff = staffList.find(staff => staff.uid === staffId);
        if (!selectedStaff || !firestore) return;
        if (!application?.id) return;

        const previousStaffId = String((application as any)?.assignedStaffId || '').trim();
        const isSameStaff = Boolean(previousStaffId && previousStaffId === staffId);
        if (isSameStaff && !options?.forceResend) {
          return;
        }
        const isResendSameStaff = Boolean(options?.forceResend && isSameStaff);
        const isReassignment = Boolean(previousStaffId) && !isResendSameStaff;

        setIsLoading(true);
        try {
            const isAdminStored =
              String(application.id || '').startsWith('admin_app_') ||
              !String(application.userId || '').trim();
            const docRef = isAdminStored
              ? doc(firestore, 'applications', application.id)
              : doc(firestore, `users/${application.userId}/applications/${application.id}`);
            const assignedAtIso = new Date().toISOString();
            const assignedByName = String(adminUser?.displayName || '').trim() || 'CalAIM Team';
            const assignLogEntry = buildMemberActionLogEntry({
              actionKey: MEMBER_ACTION_KEYS.staffAssigned,
              label: isResendSameStaff
                ? `Reassigned same staff: ${selectedStaff.displayName}`
                : isReassignment
                  ? `Reassigned staff: ${selectedStaff.displayName}`
                  : `Assigned staff: ${selectedStaff.displayName}`,
              atIso: assignedAtIso,
              byName: assignedByName,
              byEmail: String(adminUser?.email || '').trim() || null,
              byUid: String(adminUser?.uid || '').trim() || null,
              details: selectedStaff.email || null,
            });
            const updateData: Record<string, any> = {
                assignedStaffId: staffId,
                assignedStaffName: selectedStaff.displayName,
                assignedStaffEmail: String(selectedStaff.email || '').trim() || null,
                assignedDate: assignedAtIso,
                memberActionLog: arrayUnion(assignLogEntry),
            };
            const currentKaiserStatus = String(
              (application as any)?.Kaiser_Status ||
              (application as any)?.kaiserStatus ||
              ''
            ).trim();
            if (isNeedFirstContactKaiserStatus(currentKaiserStatus)) {
              Object.assign(
                updateData,
                buildFirstContactAckResetFields({
                  assignedByName,
                })
              );
            }
            
            await setDoc(docRef, updateData, { merge: true });

            const memberName = `${application.memberFirstName || ''} ${application.memberLastName || ''}`.trim() || 'Member';
            const dueDate = new Date();
            dueDate.setHours(17, 0, 0, 0);
            const planLabel = String(application.healthPlan || '').trim() || 'Member';
            const actionUrl = application.userId
              ? `/admin/applications/${application.id}?userId=${encodeURIComponent(String(application.userId))}`
              : `/admin/applications/${application.id}`;

            // Create a tagged daily calendar task (skip duplicate task when only re-notifying same staff).
            if (!isResendSameStaff) {
              try {
                await fetch('/api/daily-tasks', {
                  method: 'POST',
                  headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: `${planLabel} assignment: ${memberName}`,
                    description: `You were assigned ${memberName}. Please review and complete the next step.`,
                    memberName,
                    healthPlan: String(application.healthPlan || '').trim(),
                    assignedTo: selectedStaff.uid,
                    assignedToName: selectedStaff.displayName,
                    priority: 'high',
                    dueDate: dueDate.toISOString().split('T')[0],
                    createdBy: String(adminUser?.uid || '').trim(),
                    notes: `Assigned by ${assignedByName} from Application Pathway.`,
                    applicationId: application.id,
                    applicationLink: actionUrl,
                    source: 'caspio_assignment',
                  }),
                });
              } catch (calendarError) {
                console.warn('Failed to create calendar task for assignment:', calendarError);
              }
            }

            // Server-side email + in-app Action Item for the assignee (covers reassignment / re-notify).
            let notifyOk = false;
            let sentLogEntry: MemberActionLogEntry | null = null;
            let staffAssignmentNotifiedAt: string | null = null;
            try {
              const memberMrn = String(
                (application as any)?.memberMrn ||
                (application as any)?.Member_MRN ||
                (application as any)?.memberMRN ||
                ''
              ).trim();
              const memberCounty = String(
                (application as any)?.memberCounty ||
                (application as any)?.county ||
                ''
              ).trim();
              const kaiserStatus = String(
                (application as any)?.Kaiser_Status ||
                (application as any)?.kaiserStatus ||
                ''
              ).trim();
              const calaimStatus = String(
                (application as any)?.CalAIM_Status ||
                (application as any)?.status ||
                ''
              ).trim();
              const serviceDeliveryForm = (Array.isArray((application as any)?.forms) ? (application as any).forms : []).find(
                (form: any) => isMifServiceRequestFormName(form?.name)
              );
              const notifyRes = await fetch('/api/admin/send-staff-assignment-email', {
                method: 'POST',
                headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  applicationId: application.id,
                  appUserId: String(application.userId || '').trim() || undefined,
                  staffId: selectedStaff.uid,
                  staffName: selectedStaff.displayName,
                  to: String(selectedStaff.email || '').trim() || undefined,
                  memberName,
                  memberMrn: memberMrn || 'N/A',
                  memberCounty: memberCounty || 'N/A',
                  healthPlan: String(application.healthPlan || '').trim() || undefined,
                  serviceDeliveryFormUrl: String(
                    serviceDeliveryForm?.downloadURL ||
                      serviceDeliveryForm?.uploadedFiles?.[0]?.downloadURL ||
                      ''
                  ).trim(),
                  serviceDeliveryFormFileName: String(
                    serviceDeliveryForm?.fileName ||
                      serviceDeliveryForm?.uploadedFiles?.[0]?.fileName ||
                      ''
                  ).trim(),
                  serviceDeliveryFormFilePath: String(
                    serviceDeliveryForm?.filePath ||
                      serviceDeliveryForm?.uploadedFiles?.[0]?.filePath ||
                      ''
                  ).trim(),
                  kaiserStatus: kaiserStatus || 'Pending',
                  calaimStatus: calaimStatus || 'Pending',
                  assignedBy: assignedByName,
                  alreadyPushedToCaspio: Boolean(
                    (application as any)?.caspioSent ||
                      (application as any)?.caspioPushed ||
                      String((application as any)?.caspioClientId2 || (application as any)?.clientId2 || '').trim()
                  ),
                }),
              });
              const notifyData = (await notifyRes.json().catch(() => ({}))) as any;
              notifyOk = Boolean(notifyRes.ok && notifyData?.success);
              if (!notifyOk) {
                console.warn('Assignment notification API failed:', notifyData?.error || notifyRes.status);
              } else {
                staffAssignmentNotifiedAt = new Date().toISOString();
                sentLogEntry = buildMemberActionLogEntry({
                  actionKey: MEMBER_ACTION_KEYS.staffAssigned,
                  label: isResendSameStaff
                    ? `Re-sent to staff: ${selectedStaff.displayName}`
                    : `Sent to staff: ${selectedStaff.displayName}`,
                  atIso: staffAssignmentNotifiedAt,
                  byName: assignedByName,
                  byEmail: String(adminUser?.email || '').trim() || null,
                  byUid: String(adminUser?.uid || '').trim() || null,
                  details: selectedStaff.email
                    ? `Email + Action Items → ${selectedStaff.email}`
                    : 'Email + Action Items',
                });
                await setDoc(
                  docRef,
                  {
                    staffAssignmentNotifiedAt,
                    memberActionLog: arrayUnion(sentLogEntry),
                    lastUpdated: serverTimestamp(),
                  },
                  { merge: true }
                ).catch((logError) => {
                  console.warn('Failed to persist sent-to-staff log:', logError);
                });
              }
            } catch (assignmentEmailError) {
              console.warn('Failed to send assignment email notification:', assignmentEmailError);
            }

            onStaffChange(staffId, selectedStaff.displayName, {
              assignedDate: assignedAtIso,
              staffAssignmentNotifiedAt,
              logEntries: [assignLogEntry, ...(sentLogEntry ? [sentLogEntry] : [])],
            });
            
            toast({
                title: isResendSameStaff
                  ? 'Staff Re-notified'
                  : isReassignment
                    ? 'Staff Reassigned'
                    : 'Staff Assigned',
                description: notifyOk
                  ? `${selectedStaff.displayName} was notified of the assignment (email + Action Items).`
                  : `Application assigned to ${selectedStaff.displayName}. Notification may not have sent — try Reassign same staff again.`,
            });
        } catch (error) {
            console.error('Error assigning staff:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to assign staff",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const currentAssignedStaffId = String((application as any)?.assignedStaffId || '').trim();
    const currentAssignedStaffName = String((application as any)?.assignedStaffName || '').trim();

    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">{staffFilterLabel}</div>
        <Select
          value={currentAssignedStaffId || ''}
          onValueChange={(value) => void handleStaffAssignment(value)}
          disabled={isLoading || isLoadingStaff}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoadingStaff ? 'Loading staff…' : 'Assign a staff member...'} />
          </SelectTrigger>
          <SelectContent>
            {staffList.map((staff) => (
              <SelectItem key={staff.uid} value={staff.uid}>
                <div className="flex items-center gap-2">
                  {isActiveByUid[staff.uid] ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                      aria-label="Electron active"
                      title="Electron active"
                    />
                  ) : null}
                  <span>{staff.displayName}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currentAssignedStaffId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={isLoading || isLoadingStaff}
            onClick={() => void handleStaffAssignment(currentAssignedStaffId, { forceResend: true })}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reassign same staff
            {currentAssignedStaffName ? ` (${currentAssignedStaffName})` : ''}
          </Button>
        ) : null}
        {currentAssignedStaffId ? (
          <p className="text-[11px] text-muted-foreground">
            Reassigns {currentAssignedStaffName || 'this staff member'} again and re-sends the assignment email + Action Item.
          </p>
        ) : null}
      </div>
    );
}
