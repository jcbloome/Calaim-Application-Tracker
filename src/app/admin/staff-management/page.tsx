'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Users, Bell, ShieldCheck, Mail, Trash2, ReceiptText, CalendarCheck, UserPlus, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, doc, writeBatch, getDocs, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import NotificationSettings from '@/components/NotificationSettings';
import StaffAssignmentNotificationSystem from '@/components/StaffAssignmentNotificationSystem';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
interface StaffMember {
    uid: string;
    role: 'Admin' | 'Super Admin' | 'Staff';
    firstName: string;
    lastName: string;
    email: string;
    isKaiserStaff?: boolean;
    isHealthNetStaff?: boolean;
    isClaimsStaff?: boolean;
    isKaiserAssignmentManager?: boolean;
    hasRegistered?: boolean;
}

const ILS_MEMBER_TARGET_EMAIL = 'jhernandez@ilshealth.com';
const STAFF_CARD_EXCLUDED_EMAILS = new Set(['jocelyn@ilshealth.com']);
const formatNamePart = (raw: unknown) =>
    String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/(^|[\s'-])([a-z])/g, (_m, sep: string, chr: string) => `${sep}${chr.toUpperCase()}`);

type ReviewRecipientSettings = {
    enabled: boolean;
    csSummary: boolean;
    documents: boolean;
    eligibility?: boolean;
    standalone?: boolean;
    alft?: boolean;
    alftReviewer?: boolean;
    kaiserRnVisitAssigner?: boolean;
    // Which plan uploads should count as action items / popups for this staff member.
    // Defaults to true when not explicitly set.
    kaiserUploads?: boolean;
    healthNetUploads?: boolean;
    label?: string;
    email?: string;
};

export default function StaffManagementPage() {
    const { isSuperAdmin, isAdmin, isLoading: isAdminLoading, user: currentUser } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();

    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);
    const [notificationRecipients, setNotificationRecipients] = useState<string[]>([]);
    const [interofficeElectronEnabled, setInterofficeElectronEnabled] = useState(true);
    const [ilsNotePermissions, setIlsNotePermissions] = useState<string[]>([]);
    const [swVisitDeletePermissions, setSwVisitDeletePermissions] = useState<string[]>([]);
    const [memberVerificationKaiserRecipientUids, setMemberVerificationKaiserRecipientUids] = useState<string[]>([]);
    const [memberVerificationHealthNetRecipientUids, setMemberVerificationHealthNetRecipientUids] = useState<string[]>([]);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffRole, setNewStaffRole] = useState<'Admin' | 'Super Admin'>('Admin');
    const [isAddingStaff, setIsAddingStaff] = useState(false);
    const [showAddStaffForm, setShowAddStaffForm] = useState(false);
    const [createdStaff, setCreatedStaff] = useState<null | { email: string; role: string; uid: string; tempPassword: string }>(null);
    const [staffNameFilter, setStaffNameFilter] = useState('');
    const [staffRoleFilter, setStaffRoleFilter] = useState<'all' | 'Admin' | 'Super Admin' | 'Staff'>('all');
    const [notificationRecipientsHadField, setNotificationRecipientsHadField] = useState<boolean | null>(null);
    const [ilsMemberAllowedEmails, setIlsMemberAllowedEmails] = useState<string[]>([]);
    const [ilsWeeklyEmailEnabled, setIlsWeeklyEmailEnabled] = useState(false);
    const [ilsWeeklyEmailRecipients, setIlsWeeklyEmailRecipients] = useState<string[]>([]);

    // Global admin portal access (master switch)
    const [adminPortalEnabled, setAdminPortalEnabled] = useState(true);
    // Global app access (master switch for ALL users)
    const [appAccessEnabled, setAppAccessEnabled] = useState(true);
    const [appAccessMessage, setAppAccessMessage] = useState('');

    // Web in-app notifications (cards/toasts) for staff notes
    const [webAppNotificationsEnabled, setWebAppNotificationsEnabled] = useState(true);
    const [suppressWebWhenDesktopActive, setSuppressWebWhenDesktopActive] = useState(true);

    // Electron review popups (incoming forms)
    const [reviewPopupsEnabled, setReviewPopupsEnabled] = useState(true);
    const [alftElectronEnabled, setAlftElectronEnabled] = useState(true);
    const [reviewPollIntervalSeconds, setReviewPollIntervalSeconds] = useState(180);
    const [reviewRecipients, setReviewRecipients] = useState<Record<string, ReviewRecipientSettings>>({});
    const reviewRecipientsRef = useRef<Record<string, ReviewRecipientSettings>>({});
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoSaveInFlightRef = useRef(false);
    const autoSaveQueuedRef = useRef(false);
    const toMillis = (value: any): number => {
        try {
            if (!value) return 0;
            if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
            if (typeof value?.toDate === 'function') return Number(value.toDate()?.getTime?.()) || 0;
            const parsed = new Date(value).getTime();
            return Number.isFinite(parsed) ? parsed : 0;
        } catch {
            return 0;
        }
    };

    useEffect(() => {
        reviewRecipientsRef.current = reviewRecipients || {};
    }, [reviewRecipients]);

    // Redirect if not super admin
    useEffect(() => {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin');
        }
    }, [isSuperAdmin, isAdminLoading, router]);

    const fetchAllStaff = async () => {
        if (!firestore) return;
        setIsLoadingStaff(true);
        try {
            const [adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
                getDocs(collection(firestore, 'roles_admin')).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'roles_admin', operation: 'list' }));
                    throw e;
                }),
                getDocs(collection(firestore, 'roles_super_admin')).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'roles_super_admin', operation: 'list' }));
                    throw e;
                }),
                getDocs(collection(firestore, 'users')).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'users', operation: 'list' }));
                    throw e;
                })
            ]);

            const adminIds = new Set(adminRolesSnap.docs.map(d => d.id));
            const superAdminIds = new Set(superAdminRolesSnap.docs.map(d => d.id));

            const users = usersSnap.docs.reduce((acc, doc) => {
                acc[doc.id] = doc.data();
                return acc;
            }, {} as Record<string, any>);

            // Map email -> canonical UID (avoid legacy email doc IDs).
            const emailToUid = Object.entries(users).reduce((acc, [uid, data]) => {
                const email = String((data as any)?.email || '').trim().toLowerCase();
                if (email) acc[email] = uid;
                return acc;
            }, {} as Record<string, string>);

            const staffFlagIds = usersSnap.docs
                .filter(d => Boolean((d.data() as any)?.isStaff))
                .map(d => d.id);

            const rawStaffIds = Array.from(new Set([
                ...Array.from(adminIds),
                ...Array.from(superAdminIds),
                ...staffFlagIds,
            ]));

            const canonicalStaffIds = Array.from(new Set(
                rawStaffIds.map((id) => {
                    const looksLikeEmail = String(id).includes('@');
                    if (looksLikeEmail) {
                        const mapped = emailToUid[String(id).trim().toLowerCase()];
                        return mapped || id;
                    }
                    return id;
                })
            ));

            let staff: StaffMember[] = canonicalStaffIds.map(uid => {
                const userData = users[uid] || {};
                const createdAtMs = toMillis(userData.createdAt);
                const updatedAtMs = toMillis(userData.updatedAt);
                const hasRegistered = updatedAtMs > 0 && (!createdAtMs || updatedAtMs - createdAtMs > 60_000);
                return {
                    uid,
                    role: superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff',
                    firstName: formatNamePart(userData.firstName || ''),
                    lastName: formatNamePart(userData.lastName || ''),
                    email: userData.email || uid,
                    isKaiserStaff: Boolean(userData.isKaiserStaff),
                    isHealthNetStaff: Boolean(userData.isHealthNetStaff),
                    isClaimsStaff: Boolean(userData.isClaimsStaff),
                    isKaiserAssignmentManager: Boolean(userData.isKaiserAssignmentManager),
                    hasRegistered,
                };
            });

            // Hydrate current user details if missing
            if (currentUser?.uid) {
                const displayName = currentUser.displayName || '';
                const [firstNameFromAuth = '', ...rest] = displayName.split(' ');
                const lastNameFromAuth = rest.join(' ').trim();
                staff = staff.map(member => {
                    if (member.uid !== currentUser.uid) {
                        return member;
                    }
                    return {
                        ...member,
                        firstName: member.firstName || formatNamePart(firstNameFromAuth),
                        lastName: member.lastName || formatNamePart(lastNameFromAuth),
                        email: member.email || currentUser.email || member.uid
                    };
                });
            }

            // Ensure current super admin shows even if not in roles collections yet
            if (isSuperAdmin && currentUser?.uid && !staff.some(member => member.uid === currentUser.uid)) {
                const displayName = currentUser.displayName || '';
                const [firstName = '', ...rest] = displayName.split(' ');
                const lastName = rest.join(' ').trim();
                staff.push({
                    uid: currentUser.uid,
                    role: 'Super Admin',
                    firstName: formatNamePart(firstName),
                    lastName: formatNamePart(lastName),
                    email: currentUser.email || currentUser.uid
                });
            }

            setStaffList(staff);
        } catch (error: any) {
            console.error("Error fetching staff:", error);
        } finally {
            setIsLoadingStaff(false);
        }
    };

    const handlePlanFlagUpdate = async (
      uid: string,
      patch: Partial<Pick<StaffMember, 'isKaiserStaff' | 'isHealthNetStaff' | 'isClaimsStaff' | 'isKaiserAssignmentManager'>>
    ) => {
      if (!firestore) return;
      const cleanUid = String(uid || '').trim();
      if (!cleanUid) return;

      // Optimistic UI update
      setStaffList((prev) =>
        prev.map((s) => (s.uid === cleanUid ? { ...s, ...patch } : s))
      );

      try {
        await setDoc(doc(firestore, 'users', cleanUid), patch, { merge: true });
      } catch (error) {
        // Revert on error (best effort)
        setStaffList((prev) =>
          prev.map((s) => {
            if (s.uid !== cleanUid) return s;
            const current = prev.find((x) => x.uid === cleanUid) || s;
            return current;
          })
        );
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Could not update plan staff flags. Please try again.',
        });
      }
    };

    // Normalize any legacy email-based IDs in settings to canonical UIDs.
    const emailToCanonicalUid = useMemo(() => {
        const map: Record<string, string> = {};
        staffList.forEach((s) => {
            const email = String(s.email || '').trim().toLowerCase();
            if (!email) return;
            // Prefer non-email doc IDs as canonical keys.
            if (!String(s.uid).includes('@')) {
                map[email] = s.uid;
            }
        });
        return map;
    }, [staffList]);

    useEffect(() => {
        if (!staffList.length) return;

        // recipientUids / ilsNotePermissions arrays
        const normalizeIdList = (list: string[]) => {
            const mapped = (list || []).map((id) => {
                const str = String(id || '');
                if (str.includes('@')) {
                    const canonical = emailToCanonicalUid[str.trim().toLowerCase()];
                    return canonical || str;
                }
                return str;
            });
            return Array.from(new Set(mapped.filter(Boolean)));
        };

        setNotificationRecipients((prev) => normalizeIdList(prev));
        setIlsNotePermissions((prev) => normalizeIdList(prev));
        setSwVisitDeletePermissions((prev) => normalizeIdList(prev));
        setMemberVerificationKaiserRecipientUids((prev) => normalizeIdList(prev));
        setMemberVerificationHealthNetRecipientUids((prev) => normalizeIdList(prev));

        // reviewRecipients map
        setReviewRecipients((prev) => {
            const next: Record<string, ReviewRecipientSettings> = { ...(prev || {}) };
            let changed = false;
            Object.entries(prev || {}).forEach(([key, value]) => {
                if (!String(key).includes('@')) return;
                const canonical = emailToCanonicalUid[String(key).trim().toLowerCase()];
                if (!canonical) return;
                if (!next[canonical]) {
                    next[canonical] = value;
                } else {
                    // Merge conservatively: any "true" should remain true.
                    next[canonical] = {
                        ...next[canonical],
                        enabled: Boolean(next[canonical].enabled || value.enabled),
                        csSummary: Boolean(next[canonical].csSummary || value.csSummary),
                        documents: Boolean(next[canonical].documents || value.documents),
                        eligibility: Boolean((next[canonical] as any).eligibility || (value as any).eligibility),
                        standalone: Boolean((next[canonical] as any).standalone || (value as any).standalone),
                        alftReviewer: Boolean(
                          (next[canonical] as any).alftReviewer ||
                          (next[canonical] as any).alft ||
                          (value as any).alftReviewer ||
                          (value as any).alft
                        ),
                        alft: Boolean(
                          (next[canonical] as any).alft ||
                          (next[canonical] as any).alftReviewer ||
                          (value as any).alft ||
                          (value as any).alftReviewer
                        ),
                        kaiserRnVisitAssigner: Boolean(
                          (next[canonical] as any).kaiserRnVisitAssigner ||
                          (value as any).kaiserRnVisitAssigner
                        ),
                        kaiserUploads: Boolean((next[canonical] as any).kaiserUploads ?? true) || Boolean((value as any).kaiserUploads ?? true),
                        healthNetUploads: Boolean((next[canonical] as any).healthNetUploads ?? true) || Boolean((value as any).healthNetUploads ?? true),
                        email: next[canonical].email || value.email,
                        label: next[canonical].label || value.label,
                    };
                }
                delete next[key];
                changed = true;
            });
            return changed ? next : prev;
        });
    }, [staffList.length, emailToCanonicalUid]);
    
    const fetchNotificationRecipients = async () => {
        if (!firestore) return;
        try {
            const [notificationsSnap, adminAccessSnap, reviewSnap, appAccessSnap, ilsAccessSnap] = await Promise.all([
                getDoc(doc(firestore, 'system_settings', 'notifications')).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'system_settings/notifications', operation: 'get' }));
                    throw e;
                }),
                getDoc(doc(firestore, 'system_settings', 'admin_access')).catch(() => null),
                getDoc(doc(firestore, 'system_settings', 'review_notifications')).catch(() => null),
                getDoc(doc(firestore, 'system_settings', 'app_access')).catch(() => null),
                getDoc(doc(firestore, 'system_settings', 'ils_member_access')).catch(() => null),
            ]);

            if (notificationsSnap?.exists()) {
                const data = notificationsSnap.data();
                const rawRecipientUids = (data as any)?.recipientUids;
                setNotificationRecipientsHadField(rawRecipientUids !== undefined);
                setNotificationRecipients(Array.isArray(rawRecipientUids) ? rawRecipientUids : []);
                setInterofficeElectronEnabled(Boolean((data as any)?.interofficeElectronEnabled ?? (data as any)?.interofficeNotificationsEnabled ?? true));
                setIlsNotePermissions(data?.ilsNotePermissions || []);
                setSwVisitDeletePermissions((data as any)?.swVisitDeletePermissions || []);
                setMemberVerificationKaiserRecipientUids((data as any)?.memberVerificationKaiserRecipientUids || []);
                setMemberVerificationHealthNetRecipientUids((data as any)?.memberVerificationHealthNetRecipientUids || []);
                setWebAppNotificationsEnabled(Boolean((data as any)?.webAppNotificationsEnabled ?? true));
                setSuppressWebWhenDesktopActive(Boolean((data as any)?.suppressWebWhenDesktopActive ?? true));
            } else {
                setNotificationRecipientsHadField(false);
                setInterofficeElectronEnabled(true);
                setMemberVerificationKaiserRecipientUids([]);
                setMemberVerificationHealthNetRecipientUids([]);
            }

            if (adminAccessSnap?.exists()) {
                const data = adminAccessSnap.data() as any;
                setAdminPortalEnabled(Boolean(data?.enabled ?? true));
            } else {
                setAdminPortalEnabled(true);
            }

            if (appAccessSnap?.exists()) {
                const data = appAccessSnap.data() as any;
                setAppAccessEnabled(Boolean(data?.enabled ?? true));
                setAppAccessMessage(String(data?.message || '').trim());
            } else {
                setAppAccessEnabled(true);
                setAppAccessMessage('');
            }

            if (reviewSnap?.exists()) {
                const data = reviewSnap.data() as any;
                setReviewPopupsEnabled(Boolean(data?.enabled ?? true));
                setAlftElectronEnabled(Boolean(data?.alftElectronEnabled ?? true));
                setReviewPollIntervalSeconds(Number(data?.pollIntervalSeconds || 180));
                setReviewRecipients((data?.recipients || {}) as Record<string, ReviewRecipientSettings>);
            } else {
                setReviewPopupsEnabled(true);
                setAlftElectronEnabled(true);
                setReviewPollIntervalSeconds(180);
                setReviewRecipients({});
            }

            if (ilsAccessSnap?.exists()) {
                const data = ilsAccessSnap.data() as any;
                setIlsMemberAllowedEmails(Array.isArray(data?.allowedEmails) ? data.allowedEmails : []);
                setIlsWeeklyEmailEnabled(Boolean(data?.weeklyEmailEnabled));
                setIlsWeeklyEmailRecipients(Array.isArray(data?.weeklyEmailRecipients) ? data.weeklyEmailRecipients : []);
            } else {
                setIlsMemberAllowedEmails([]);
                setIlsWeeklyEmailEnabled(false);
                setIlsWeeklyEmailRecipients([]);
            }
        } catch (error) {
             console.error("Error fetching notification settings:", error);
        }
    };

    useEffect(() => {
        if (!isAdminLoading && firestore && isSuperAdmin) {
            fetchAllStaff();
            fetchNotificationRecipients();
        }
    }, [firestore, isSuperAdmin, isAdminLoading]);

    // Interoffice notes should be ON by default for staff.
    // If `recipientUids` isn't present yet, default it to all staff IDs in the UI (and on save it will persist).
    useEffect(() => {
        if (notificationRecipientsHadField !== false) return;
        if (!staffList || staffList.length === 0) return;
        setNotificationRecipients((prev) => {
            if (prev && prev.length > 0) return prev;
            return staffList.map((s) => s.uid).filter(Boolean);
        });
    }, [notificationRecipientsHadField, staffList]);

    const handleAddStaff = async () => {
        if (!firestore || !newStaffFirstName || !newStaffLastName || !newStaffEmail) {
            toast({
                title: "Missing Information",
                description: "Please fill in all fields.",
                variant: "destructive"
            });
            return;
        }

        setIsAddingStaff(true);
        try {
            if (!currentUser) {
                toast({
                    title: "Not signed in",
                    description: "Please sign in again and retry.",
                    variant: "destructive"
                });
                return;
            }

            const idToken = await currentUser.getIdToken();
            const res = await fetch('/api/admin/staff/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    email: newStaffEmail,
                    firstName: formatNamePart(newStaffFirstName),
                    lastName: formatNamePart(newStaffLastName),
                    role: newStaffRole,
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                throw new Error(data?.error || data?.details || 'Failed to create staff user');
            }

            setCreatedStaff({
                email: data.email,
                role: data.role,
                uid: data.uid,
                tempPassword: data.tempPassword
            });

            toast({
                title: "Staff account created",
                description: `${data.email} created as ${data.role}.`,
                className: 'bg-green-100 text-green-900 border-green-200'
            });

            setNewStaffFirstName('');
            setNewStaffLastName('');
            setNewStaffEmail('');
            setNewStaffRole('Admin');

            await fetchAllStaff();
            await fetchNotificationRecipients();
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to add staff member",
                variant: "destructive"
            });
        } finally {
            setIsAddingStaff(false);
        }
    };

    const handleRevokeStaff = async (uid: string) => {
        if (!firestore) return;
        
        const batch = writeBatch(firestore);
        batch.delete(doc(firestore, 'roles_admin', uid));
        batch.delete(doc(firestore, 'roles_super_admin', uid));
        
        if (notificationRecipients.includes(uid)) {
            const updatedRecipients = notificationRecipients.filter(id => id !== uid);
            batch.set(doc(firestore, 'system_settings', 'notifications'), { recipientUids: updatedRecipients }, { merge: true });
        }

        try {
            await batch.commit().catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `roles_admin/${uid}`, operation: 'delete' }));
                throw e;
            });
            
            toast({ 
                title: 'Staff Roles Revoked', 
                description: `Admin permissions have been removed for the user.`, 
                className: 'bg-green-100 text-green-900 border-green-200' 
            });
            
            await fetchAllStaff();
            await fetchNotificationRecipients();
        } catch (error: any) {
            // Error is emitted above
        }
    };

    const handleInterofficeElectronCardToggle = (
        uid: string,
        checked: boolean,
        staff?: StaffMember,
        current?: ReviewRecipientSettings
    ) => {
        const enable = Boolean(checked);
        setNotificationRecipients((prev) =>
            enable ? Array.from(new Set([...prev, uid])) : prev.filter((id) => id !== uid)
        );
        setReviewRecipient(
            uid,
            {
                enabled: enable,
                documents: enable,
                csSummary: enable,
                // Keep ALFT reviewer selection untouched when enabling; force off when disabling.
                alftReviewer: enable ? (current?.alftReviewer ?? current?.alft) : false,
                // Backward-compatibility mirror.
                alft: enable ? (current?.alftReviewer ?? current?.alft) : false,
                // Separate role for H2022 renewal workflow notifications.
                kaiserRnVisitAssigner: enable ? Boolean(current?.kaiserRnVisitAssigner) : false,
            },
            staff
        );
    };

    const applyInterofficeMasterSwitch = (enabled: boolean) => {
        const nextEnabled = Boolean(enabled);
        setInterofficeElectronEnabled(nextEnabled);

        // When turning master ON, mirror that state into each staff card toggle.
        if (nextEnabled) {
            const allUids = Array.from(
                new Set(
                    (staffList || [])
                        .map((member) => String(member?.uid || '').trim())
                        .filter(Boolean)
                )
            );

            setNotificationRecipients(allUids);
            setReviewRecipients((prev) => {
                const next: Record<string, ReviewRecipientSettings> = { ...prev };
                (staffList || []).forEach((member) => {
                    const uid = String(member?.uid || '').trim();
                    if (!uid) return;
                    const current = next[uid] || {
                        enabled: false,
                        csSummary: false,
                        documents: false,
                        eligibility: false,
                        standalone: false,
                        alft: false,
                        alftReviewer: false,
                        kaiserRnVisitAssigner: false,
                        kaiserUploads: true,
                        healthNetUploads: true,
                        email: member?.email,
                        label: (member?.firstName || member?.lastName)
                            ? `${member?.firstName || ''} ${member?.lastName || ''}`.trim()
                            : member?.email,
                    };
                    next[uid] = {
                        ...current,
                        enabled: true,
                        documents: true,
                        csSummary: true,
                        email: current.email || member?.email,
                        label: current.label || ((member?.firstName || member?.lastName)
                            ? `${member?.firstName || ''} ${member?.lastName || ''}`.trim()
                            : member?.email),
                    };
                });
                return next;
            });
        }

        queueAutoSave();
    };

    const superAdminCount = useMemo(
        () => staffList.filter((member) => member.role === 'Super Admin').length,
        [staffList]
    );
    const staffCount = useMemo(
        () => staffList.filter((member) => member.role !== 'Super Admin').length,
        [staffList]
    );
    const scrollToSection = (sectionId: string) => {
        if (typeof window === 'undefined') return;
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const controlButtons: Array<{ id: string; label: string }> = [
        { id: 'add-staff-section', label: 'Add new staff' },
        { id: 'staff-permissions-section', label: 'Staff access & settings' },
        { id: 'super-admins-section', label: 'Super Admins' },
        { id: 'staff-section', label: 'Staff' },
        { id: 'global-controls-section', label: 'Global access controls' },
        { id: 'email-notifications-section', label: 'Email notifications' },
        { id: 'desktop-controls-section', label: 'Desktop notification controls' },
        { id: 'staff-assignment-section', label: 'Staff assignment & rotation' },
        { id: 'advanced-notifications-section', label: 'Advanced notification settings' },
    ];

    const handleRoleChange = async (uid: string, nextRole: StaffMember['role']) => {
        if (!uid) return;
        if (nextRole === 'Staff') {
            await handleSetAdminAccessForUser(uid, false, 'Staff');
            return;
        }
        await handleSetAdminAccessForUser(uid, true, nextRole);
    };

    const handleIlsNoteToggle = (uid: string, checked: boolean) => {
        setIlsNotePermissions(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
        queueAutoSave();
    };

    const handleSwVisitDeleteToggle = (uid: string, checked: boolean) => {
        setSwVisitDeletePermissions(prev =>
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
        queueAutoSave();
    };

    const handleMemberVerificationNotifyToggle = (
        plan: 'kaiser' | 'healthnet',
        uid: string,
        checked: boolean
    ) => {
        if (plan === 'kaiser') {
            setMemberVerificationKaiserRecipientUids((prev) =>
                checked ? Array.from(new Set([...prev, uid])) : prev.filter((id) => id !== uid)
            );
        } else {
            setMemberVerificationHealthNetRecipientUids((prev) =>
                checked ? Array.from(new Set([...prev, uid])) : prev.filter((id) => id !== uid)
            );
        }
        queueAutoSave();
    };

    const toggleIlsMemberTargetAccess = (targetEmail: string, checked: boolean) => {
        const email = String(targetEmail || '').trim().toLowerCase();
        if (!email) return;
        setIlsMemberAllowedEmails((prev) => {
            const set = new Set((prev || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
            if (checked) set.add(email);
            else set.delete(email);
            return Array.from(set);
        });
        queueAutoSave();
    };

    const toggleIlsWeeklyTargetEmail = (targetEmail: string, checked: boolean) => {
        const email = String(targetEmail || '').trim().toLowerCase();
        if (!email) return;
        setIlsWeeklyEmailEnabled(Boolean(checked));
        setIlsWeeklyEmailRecipients((prev) => {
            const set = new Set((prev || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
            if (checked) set.add(email);
            else set.delete(email);
            return Array.from(set);
        });
        queueAutoSave();
    };

    const handleSaveNotifications = async (options?: { silentSuccess?: boolean }) => {
        if (!firestore) return;
        setIsSavingNotifications(true);
        try {
            const staffByUid = new Map(
                (staffList || []).map((staff) => [String(staff.uid || '').trim(), staff] as const).filter(([uid]) => Boolean(uid))
            );
            const emailToUid = new Map(
                (staffList || [])
                    .map((staff) => [String(staff.email || '').trim().toLowerCase(), String(staff.uid || '').trim()] as const)
                    .filter(([email, uid]) => Boolean(email) && Boolean(uid))
            );
            const normalizeRecipientKey = (rawKey: string, value: ReviewRecipientSettings) => {
                const key = String(rawKey || '').trim();
                if (!key) return '';
                if (key.includes('@')) {
                    const keyEmail = key.toLowerCase();
                    if (emailToUid.has(keyEmail)) {
                        return emailToUid.get(keyEmail) || keyEmail;
                    }
                    return keyEmail;
                }
                if (staffByUid.has(key)) return key;
                const keyEmail = key.toLowerCase();
                if (emailToUid.has(keyEmail)) {
                    return emailToUid.get(keyEmail) || key;
                }
                const valueEmail = String(value?.email || '').trim().toLowerCase();
                if (valueEmail && emailToUid.has(valueEmail)) {
                    return emailToUid.get(valueEmail) || key;
                }
                return key;
            };
            const latestReviewRecipients = reviewRecipientsRef.current || {};
            const normalizedReviewRecipients = Object.entries(latestReviewRecipients).reduce(
                (acc, [rawKey, value]) => {
                    const targetUid = normalizeRecipientKey(rawKey, value as ReviewRecipientSettings);
                    if (!targetUid) return acc;
                    const staff = staffByUid.get(targetUid);
                    const existing = acc[targetUid] || ({} as ReviewRecipientSettings);
                    const incoming = (value || {}) as ReviewRecipientSettings;
                    acc[targetUid] = {
                        ...existing,
                        ...incoming,
                        enabled: Boolean(existing.enabled || incoming.enabled),
                        documents: Boolean(existing.documents || incoming.documents),
                        csSummary: Boolean(existing.csSummary || incoming.csSummary),
                        eligibility: Boolean((existing as any).eligibility || (incoming as any).eligibility),
                        standalone: Boolean((existing as any).standalone || (incoming as any).standalone),
                        alftReviewer: Boolean((existing as any).alftReviewer || (existing as any).alft || (incoming as any).alftReviewer || (incoming as any).alft),
                        alft: Boolean((existing as any).alft || (existing as any).alftReviewer || (incoming as any).alft || (incoming as any).alftReviewer),
                        kaiserRnVisitAssigner: Boolean((existing as any).kaiserRnVisitAssigner || (incoming as any).kaiserRnVisitAssigner),
                        kaiserUploads: (incoming as any).kaiserUploads ?? (existing as any).kaiserUploads ?? true,
                        healthNetUploads: (incoming as any).healthNetUploads ?? (existing as any).healthNetUploads ?? true,
                        email: incoming.email || existing.email || staff?.email,
                        label:
                            incoming.label ||
                            existing.label ||
                            ((staff?.firstName || staff?.lastName)
                                ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim()
                                : staff?.email),
                    };
                    return acc;
                },
                {} as Record<string, ReviewRecipientSettings>
            );

            const notificationsRef = doc(firestore, 'system_settings', 'notifications');
            const notificationsData = {
                recipientUids: notificationRecipients,
                interofficeNotificationsEnabled: Boolean(interofficeElectronEnabled),
                interofficeElectronEnabled: Boolean(interofficeElectronEnabled),
                ilsNotePermissions: ilsNotePermissions,
                swVisitDeletePermissions: swVisitDeletePermissions,
                memberVerificationKaiserRecipientUids: Array.from(
                    new Set((memberVerificationKaiserRecipientUids || []).map((x) => String(x || '').trim()).filter(Boolean))
                ),
                memberVerificationHealthNetRecipientUids: Array.from(
                    new Set((memberVerificationHealthNetRecipientUids || []).map((x) => String(x || '').trim()).filter(Boolean))
                ),
                webAppNotificationsEnabled: Boolean(webAppNotificationsEnabled),
                suppressWebWhenDesktopActive: Boolean(suppressWebWhenDesktopActive),
            };

            const adminAccessRef = doc(firestore, 'system_settings', 'admin_access');
            const adminAccessData = {
                enabled: Boolean(adminPortalEnabled),
                updatedAt: new Date(),
                updatedBy: currentUser?.uid || null,
            };

            const appAccessRef = doc(firestore, 'system_settings', 'app_access');
            const appAccessData = {
                enabled: Boolean(appAccessEnabled),
                message: String(appAccessMessage || '').trim() || null,
                updatedAt: new Date(),
                updatedBy: currentUser?.uid || null,
            };

            const reviewRef = doc(firestore, 'system_settings', 'review_notifications');
            const reviewData = {
                enabled: Boolean(reviewPopupsEnabled),
                alftElectronEnabled: Boolean(alftElectronEnabled),
                pollIntervalSeconds: Math.max(30, Math.min(3600, Math.round(Number(reviewPollIntervalSeconds || 180)))),
                recipients: normalizedReviewRecipients,
                updatedAt: new Date(),
                updatedBy: currentUser?.uid || null,
            };

            const ilsAccessRef = doc(firestore, 'system_settings', 'ils_member_access');
            const ilsAccessData = {
                allowedEmails: Array.from(new Set((ilsMemberAllowedEmails || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))),
                weeklyEmailEnabled: Boolean(ilsWeeklyEmailEnabled),
                weeklyEmailRecipients: Array.from(
                    new Set((ilsWeeklyEmailRecipients || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))
                ),
                weeklySendDay: 'wednesday',
                updatedAt: new Date(),
                updatedBy: currentUser?.uid || null,
            };

            await Promise.all([
                setDoc(notificationsRef, notificationsData, { merge: true }).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: notificationsRef.path, operation: 'update', requestResourceData: notificationsData }));
                    throw e;
                }),
                setDoc(adminAccessRef, adminAccessData, { merge: true }).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: adminAccessRef.path, operation: 'update', requestResourceData: adminAccessData }));
                    throw e;
                }),
                setDoc(appAccessRef, appAccessData, { merge: true }).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: appAccessRef.path, operation: 'update', requestResourceData: appAccessData }));
                    throw e;
                }),
                setDoc(reviewRef, reviewData, { merge: true }).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: reviewRef.path, operation: 'update', requestResourceData: reviewData }));
                    throw e;
                }),
                setDoc(ilsAccessRef, ilsAccessData, { merge: true }).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: ilsAccessRef.path, operation: 'update', requestResourceData: ilsAccessData }));
                    throw e;
                }),
            ]);

            // Keep local state stable during autosave; forced refetch on every toggle causes UI
            // jump/reset behavior that looks like a page refresh.
            if (!options?.silentSuccess) {
                await Promise.all([fetchAllStaff(), fetchNotificationRecipients()]);
            }

            if (!options?.silentSuccess) {
                toast({ 
                    title: "Settings Saved", 
                    description: "All settings updated.", 
                    className: 'bg-green-100 text-green-900 border-green-200' 
                });
            }
        } catch (error: any) {
            toast({
                title: 'Save failed',
                description: error?.message || 'Unable to save staff notification settings.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const queueAutoSave = () => {
        if (!firestore) return;
        if (!currentUser?.uid) return;
        if (autoSaveInFlightRef.current) {
            autoSaveQueuedRef.current = true;
            return;
        }
        setIsAutoSaving(true);
        // Debounce saves to avoid spamming Firestore during rapid toggles.
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(async () => {
            autoSaveInFlightRef.current = true;
            autoSaveQueuedRef.current = false;
            try {
                await handleSaveNotifications({ silentSuccess: true });
            } finally {
                autoSaveInFlightRef.current = false;
                // If changes happened while saving, run one more save pass.
                if (autoSaveQueuedRef.current) {
                    queueAutoSave();
                } else {
                    setIsAutoSaving(false);
                }
            }
        }, 750);
    };

    const setReviewRecipient = (uid: string, updates: Partial<ReviewRecipientSettings>, staff?: StaffMember) => {
        const normalizedUid = String(uid || '').trim().includes('@')
            ? String(uid || '').trim().toLowerCase()
            : String(uid || '').trim();
        setReviewRecipients(prev => {
            const current = prev[normalizedUid] || {
                enabled: false,
                csSummary: false,
                documents: false,
                eligibility: false,
                standalone: false,
                alft: false,
                alftReviewer: false,
                kaiserRnVisitAssigner: false,
                kaiserUploads: true,
                healthNetUploads: true,
                email: staff?.email,
                label: (staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email,
            };
            return {
                ...prev,
                [normalizedUid]: {
                    ...current,
                    ...updates,
                    // Keep both fields aligned while we migrate from `alft` to `alftReviewer`.
                    alftReviewer:
                        updates.alftReviewer !== undefined
                            ? updates.alftReviewer
                            : (updates.alft !== undefined ? updates.alft : (current.alftReviewer ?? current.alft ?? false)),
                    alft:
                        updates.alft !== undefined
                            ? updates.alft
                            : (updates.alftReviewer !== undefined ? updates.alftReviewer : (current.alft ?? current.alftReviewer ?? false)),
                    kaiserRnVisitAssigner:
                        updates.kaiserRnVisitAssigner !== undefined
                            ? updates.kaiserRnVisitAssigner
                            : Boolean(current.kaiserRnVisitAssigner),
                    kaiserUploads: updates.kaiserUploads === undefined ? (current.kaiserUploads ?? true) : updates.kaiserUploads,
                    healthNetUploads: updates.healthNetUploads === undefined ? (current.healthNetUploads ?? true) : updates.healthNetUploads,
                    email: current.email || staff?.email,
                    label: current.label || ((staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email),
                }
            };
        });
        queueAutoSave();
    };

    const handleSetAdminAccessForUser = async (uid: string, enabled: boolean, role: StaffMember['role']) => {
        if (!firestore) return;
        const batch = writeBatch(firestore);
        if (!enabled) {
            batch.delete(doc(firestore, 'roles_admin', uid));
            batch.delete(doc(firestore, 'roles_super_admin', uid));
        } else {
            batch.set(doc(firestore, 'roles_admin', uid), { enabled: true, updatedAt: new Date() }, { merge: true });
            if (role === 'Super Admin') {
                batch.set(doc(firestore, 'roles_super_admin', uid), { enabled: true, updatedAt: new Date() }, { merge: true });
            }
        }
        await batch.commit().catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `roles_admin/${uid}`, operation: enabled ? 'update' : 'delete' }));
            throw e;
        });
        await fetchAllStaff();
    };

    if (isAdminLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!isSuperAdmin) {
        return null;
    }

    return (
        <div className="container mx-auto max-w-7xl p-6 space-y-6">
            {/* Header */}
            <Card className="border-border/70 shadow-sm">
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-primary/10 p-2">
                                <Users className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Staff Management</h1>
                                <p className="text-sm text-muted-foreground">
                                    Manage access, staffing, and notification systems from one page.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">Super Admins: {superAdminCount}</Badge>
                            <Badge variant="secondary">Staff: {staffCount}</Badge>
                            <Badge variant={isAutoSaving ? 'default' : 'outline'}>
                                {isAutoSaving ? 'Auto-saving changes...' : 'All changes synced'}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">System controls</CardTitle>
                    <CardDescription>
                        Jump directly to any section. Everything below is grouped by function.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {controlButtons.map((item) => (
                        <Button
                            key={item.id}
                            variant="outline"
                            className="justify-start"
                            onClick={() => scrollToSection(item.id)}
                        >
                            {item.label}
                        </Button>
                    ))}
                </CardContent>
            </Card>

            <div className="space-y-6">

            <Card id="add-staff-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5" />
                                Add New Staff Member
                            </CardTitle>
                            <CardDescription>
                                Keep this collapsed when focusing on Staff Access & Settings.
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowAddStaffForm((prev) => !prev)}
                            className="shrink-0"
                        >
                            {showAddStaffForm ? (
                                <>
                                    <ChevronUp className="mr-2 h-4 w-4" />
                                    Collapse
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="mr-2 h-4 w-4" />
                                    Expand
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
                {showAddStaffForm && (
                <CardContent>
                    <Alert className="mb-4">
                        <AlertTitle>How this works</AlertTitle>
                        <AlertDescription>
                            Create staff here, then share the temporary password so they can sign in and reset it.
                        </AlertDescription>
                    </Alert>

                    {createdStaff && (
                        <Alert className="mb-4">
                            <AlertTitle>New staff credentials</AlertTitle>
                            <AlertDescription>
                                <div className="space-y-1">
                                    <div><span className="font-semibold">Email:</span> {createdStaff.email}</div>
                                    <div><span className="font-semibold">Role:</span> {createdStaff.role}</div>
                                    <div><span className="font-semibold">UID:</span> <span className="font-mono">{createdStaff.uid}</span></div>
                                    <div><span className="font-semibold">Temporary password:</span> <span className="font-mono">{createdStaff.tempPassword}</span></div>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="newStaffFirstName">First Name</Label>
                            <Input
                                id="newStaffFirstName"
                                value={newStaffFirstName}
                                onChange={(e) => setNewStaffFirstName(e.target.value)}
                                placeholder="Enter first name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newStaffLastName">Last Name</Label>
                            <Input
                                id="newStaffLastName"
                                value={newStaffLastName}
                                onChange={(e) => setNewStaffLastName(e.target.value)}
                                placeholder="Enter last name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newStaffEmail">Email</Label>
                            <Input
                                id="newStaffEmail"
                                type="email"
                                value={newStaffEmail}
                                onChange={(e) => setNewStaffEmail(e.target.value)}
                                placeholder="Enter email address"
                            />
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="newStaffRole">Role</Label>
                            <select
                                id="newStaffRole"
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={newStaffRole}
                                onChange={(e) => setNewStaffRole(e.target.value as 'Admin' | 'Super Admin')}
                            >
                                <option value="Admin">Admin</option>
                                <option value="Super Admin">Super Admin</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
                )}
                {showAddStaffForm && (
                <CardFooter>
                    <Button onClick={handleAddStaff} disabled={isAddingStaff}>
                        {isAddingStaff ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            <>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Add Staff Member
                            </>
                        )}
                    </Button>
                </CardFooter>
                )}
            </Card>

            {/* Staff List & Permissions */}
            <Card id="staff-permissions-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Staff Access & Settings
                    </CardTitle>
                    <CardDescription>
                        Manage staff roles, permissions, and notification toggles
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-muted/20">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Manage access (global)</div>
                                <div className="text-xs text-muted-foreground">Admin portal on/off for non-super admins.</div>
                            </div>
                            <Switch
                                checked={adminPortalEnabled}
                                onCheckedChange={(v) => { setAdminPortalEnabled(Boolean(v)); queueAutoSave(); }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-muted/20">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Application access (master switch)</div>
                                <div className="text-xs text-muted-foreground">Global on/off for user app access.</div>
                            </div>
                            <Switch
                                checked={appAccessEnabled}
                                onCheckedChange={(v) => { setAppAccessEnabled(Boolean(v)); queueAutoSave(); }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-muted/20">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Interoffice + Electron tray alerts</div>
                                <div className="text-xs text-muted-foreground">Single master on/off for interoffice priority alerts and Electron tray popups.</div>
                            </div>
                            <Switch
                                checked={interofficeElectronEnabled}
                                onCheckedChange={(v) => applyInterofficeMasterSwitch(Boolean(v))}
                            />
                        </div>
                    </div>
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="staffNameFilter">Filter by name or email</Label>
                            <Input
                                id="staffNameFilter"
                                value={staffNameFilter}
                                onChange={(e) => setStaffNameFilter(e.target.value)}
                                placeholder="Search name or email"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="staffRoleFilter">Filter by role</Label>
                            <select
                                id="staffRoleFilter"
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={staffRoleFilter}
                                onChange={(e) => setStaffRoleFilter(e.target.value as 'all' | 'Admin' | 'Super Admin')}
                            >
                                <option value="all">All</option>
                                <option value="Admin">Admin</option>
                                <option value="Super Admin">Super Admin</option>
                                <option value="Staff">Staff</option>
                            </select>
                        </div>
                    </div>
                    {isLoadingStaff ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span>Loading staff members...</span>
                        </div>
                    ) : staffList.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(() => {
                                const filtered = staffList.filter((staff) => {
                                    const normalizedEmail = String(staff.email || '').trim().toLowerCase();
                                    if (STAFF_CARD_EXCLUDED_EMAILS.has(normalizedEmail)) {
                                        return false;
                                    }
                                    const query = staffNameFilter.trim().toLowerCase();
                                    if (query) {
                                        const fullName = `${staff.firstName} ${staff.lastName}`.toLowerCase();
                                        const email = (staff.email || '').toLowerCase();
                                        if (!fullName.includes(query) && !email.includes(query)) {
                                            return false;
                                        }
                                    }
                                    if (staffRoleFilter !== 'all' && staff.role !== staffRoleFilter) {
                                        return false;
                                    }
                                    return true;
                                });

                                const superAdmins = filtered.filter((s) => s.role === 'Super Admin');
                                const nonSuperAdmins = filtered.filter((s) => s.role !== 'Super Admin');

                                const renderCard = (staff: any) => {
                                    const staffUid = String(staff?.uid || '').trim();
                                    const staffEmail = String(staff?.email || '').trim().toLowerCase();
                                    const canonicalFromEmail = staffEmail ? emailToCanonicalUid[staffEmail] : '';
                                    const reviewRecipient = (
                                        reviewRecipients[staffUid] ||
                                        reviewRecipients[staffUid.toLowerCase()] ||
                                        (canonicalFromEmail ? reviewRecipients[canonicalFromEmail] : undefined) ||
                                        (staffEmail ? reviewRecipients[staffEmail] : undefined)
                                    ) || {
                                        enabled: false,
                                        csSummary: false,
                                        documents: false,
                                        eligibility: false,
                                        standalone: false,
                                        alft: false,
                                        alftReviewer: false,
                                        kaiserRnVisitAssigner: false,
                                        kaiserUploads: true,
                                        healthNetUploads: true,
                                        email: staff?.email,
                                        label: (staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email,
                                    } satisfies ReviewRecipientSettings;
                                    const notificationsEnabled = notificationRecipients.includes(staff.uid);
                                    const interofficeElectronChecked = Boolean(
                                        notificationsEnabled &&
                                        reviewRecipient.enabled &&
                                        (reviewRecipient.documents || reviewRecipient.csSummary || reviewRecipient.alftReviewer || reviewRecipient.alft || reviewRecipient.kaiserRnVisitAssigner)
                                    );

                                    return (
                                    <div key={staff.uid} className="p-3 border rounded-lg">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-semibold">
                                                {(staff.firstName || staff.lastName) ? `${staff.firstName} ${staff.lastName}`.trim() : (staff.email || staff.uid)}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">{staff.email || staff.uid}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                                                    staff.role === 'Super Admin'
                                                        ? 'bg-red-100 text-red-800'
                                                        : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {staff.role}
                                                </span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                                                    staff.hasRegistered
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {staff.hasRegistered ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                                                    {staff.hasRegistered ? 'Registered' : 'Pending first login'}
                                                </span>
                                            </div>
                                        </div>
                                <div className="flex items-center gap-2">
                                    <Label htmlFor={`role-select-${staff.uid}`} className="text-xs text-muted-foreground">Role</Label>
                                    <select
                                        id={`role-select-${staff.uid}`}
                                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                                        value={staff.role}
                                        disabled={staff.uid === currentUser?.uid}
                                        onChange={(e) => {
                                            const nextRole = e.target.value as StaffMember['role'];
                                            handleRoleChange(staff.uid, nextRole).catch(() => undefined);
                                        }}
                                    >
                                        <option value="Super Admin">Super Admin</option>
                                        <option value="Admin">Admin</option>
                                        <option value="Staff">Staff</option>
                                    </select>
                                </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Users className={`h-4 w-4 ${staff.isKaiserStaff ? 'text-orange-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`kaiser-staff-${staff.uid}`} className="text-sm font-medium">Kaiser staff</Label>
                                            </div>
                                            <Checkbox
                                                id={`kaiser-staff-${staff.uid}`}
                                                checked={Boolean(staff.isKaiserStaff)}
                                                onCheckedChange={(checked) => {
                                                    handlePlanFlagUpdate(staff.uid, { isKaiserStaff: Boolean(checked) }).catch(() => undefined);
                                                }}
                                                aria-label={`Toggle Kaiser staff for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className={`h-4 w-4 ${staff.isKaiserAssignmentManager ? 'text-orange-700' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`kaiser-assignment-manager-${staff.uid}`} className="text-sm font-medium">Kaiser assignment manager</Label>
                                            </div>
                                            <Checkbox
                                                id={`kaiser-assignment-manager-${staff.uid}`}
                                                checked={Boolean(staff.isKaiserAssignmentManager)}
                                                onCheckedChange={(checked) => {
                                                    handlePlanFlagUpdate(staff.uid, { isKaiserAssignmentManager: Boolean(checked) }).catch(() => undefined);
                                                }}
                                                aria-label={`Toggle Kaiser assignment manager for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Users className={`h-4 w-4 ${staff.isHealthNetStaff ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`hn-staff-${staff.uid}`} className="text-sm font-medium">Health Net staff</Label>
                                            </div>
                                            <Checkbox
                                                id={`hn-staff-${staff.uid}`}
                                                checked={Boolean(staff.isHealthNetStaff)}
                                                onCheckedChange={(checked) => {
                                                    handlePlanFlagUpdate(staff.uid, { isHealthNetStaff: Boolean(checked) }).catch(() => undefined);
                                                }}
                                                aria-label={`Toggle Health Net staff for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <ReceiptText className={`h-4 w-4 ${staff.isClaimsStaff ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`claims-staff-${staff.uid}`} className="text-sm font-medium">Claims access</Label>
                                            </div>
                                            <Checkbox
                                                id={`claims-staff-${staff.uid}`}
                                                checked={Boolean(staff.isClaimsStaff)}
                                                onCheckedChange={(checked) => {
                                                    handlePlanFlagUpdate(staff.uid, { isClaimsStaff: Boolean(checked) }).catch(() => undefined);
                                                }}
                                                aria-label={`Toggle claims access for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${interofficeElectronChecked ? 'text-primary' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`interoffice-electron-${staff.uid}`} className="text-sm font-medium">Interoffice + Electron</Label>
                                            </div>
                                            <Checkbox 
                                                id={`interoffice-electron-${staff.uid}`}
                                                checked={interofficeElectronChecked}
                                                disabled={!interofficeElectronEnabled}
                                                onCheckedChange={(checked) => {
                                                    const nextValue = Boolean(checked);
                                                    handleInterofficeElectronCardToggle(staff.uid, nextValue, staff, reviewRecipient);
                                                }} 
                                                aria-label={`Toggle interoffice and electron alerts for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${Boolean(reviewRecipient.kaiserUploads ?? true) ? 'text-orange-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`manager-kaiser-review-${staff.uid}`} className="text-sm font-medium">Manager notify: Kaiser CS/docs</Label>
                                            </div>
                                            <Checkbox
                                                id={`manager-kaiser-review-${staff.uid}`}
                                                checked={Boolean(reviewRecipient.kaiserUploads ?? true)}
                                                disabled={!reviewPopupsEnabled}
                                                onCheckedChange={(checked) => {
                                                    const nextValue = Boolean(checked);
                                                    setReviewRecipient(
                                                      staff.uid,
                                                      {
                                                        kaiserUploads: nextValue,
                                                        enabled: nextValue || Boolean((reviewRecipient.healthNetUploads ?? true) || reviewRecipient.documents || reviewRecipient.csSummary || reviewRecipient.eligibility || reviewRecipient.standalone || reviewRecipient.alftReviewer || reviewRecipient.alft || reviewRecipient.kaiserRnVisitAssigner),
                                                        documents: nextValue ? true : reviewRecipient.documents,
                                                        csSummary: nextValue ? true : reviewRecipient.csSummary,
                                                      },
                                                      staff
                                                    );
                                                }}
                                                aria-label={`Toggle Kaiser manager CS/docs Electron notifications for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${Boolean(reviewRecipient.healthNetUploads ?? true) ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`manager-hn-review-${staff.uid}`} className="text-sm font-medium">Manager notify: Health Net CS/docs</Label>
                                            </div>
                                            <Checkbox
                                                id={`manager-hn-review-${staff.uid}`}
                                                checked={Boolean(reviewRecipient.healthNetUploads ?? true)}
                                                disabled={!reviewPopupsEnabled}
                                                onCheckedChange={(checked) => {
                                                    const nextValue = Boolean(checked);
                                                    setReviewRecipient(
                                                      staff.uid,
                                                      {
                                                        healthNetUploads: nextValue,
                                                        enabled: nextValue || Boolean((reviewRecipient.kaiserUploads ?? true) || reviewRecipient.documents || reviewRecipient.csSummary || reviewRecipient.eligibility || reviewRecipient.standalone || reviewRecipient.alftReviewer || reviewRecipient.alft || reviewRecipient.kaiserRnVisitAssigner),
                                                        documents: nextValue ? true : reviewRecipient.documents,
                                                        csSummary: nextValue ? true : reviewRecipient.csSummary,
                                                      },
                                                      staff
                                                    );
                                                }}
                                                aria-label={`Toggle Health Net manager CS/docs Electron notifications for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Mail className={`h-4 w-4 ${ilsNotePermissions.includes(staff.uid) ? 'text-green-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`ils-${staff.uid}`} className="text-sm font-medium">ILS Notes</Label>
                                            </div>
                                            <Checkbox 
                                                id={`ils-${staff.uid}`} 
                                                checked={ilsNotePermissions.includes(staff.uid)} 
                                                onCheckedChange={(checked) => handleIlsNoteToggle(staff.uid, !!checked)} 
                                                aria-label={`Toggle ILS note permissions for ${staff.email}`} 
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Mail className={`h-4 w-4 ${memberVerificationKaiserRecipientUids.includes(staff.uid) ? 'text-orange-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`member-verify-kaiser-${staff.uid}`} className="text-sm font-medium">Member verification notify: Kaiser</Label>
                                            </div>
                                            <Checkbox
                                                id={`member-verify-kaiser-${staff.uid}`}
                                                checked={memberVerificationKaiserRecipientUids.includes(staff.uid)}
                                                onCheckedChange={(checked) =>
                                                    handleMemberVerificationNotifyToggle('kaiser', staff.uid, Boolean(checked))
                                                }
                                                aria-label={`Toggle Kaiser member verification notifications for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Mail className={`h-4 w-4 ${memberVerificationHealthNetRecipientUids.includes(staff.uid) ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`member-verify-healthnet-${staff.uid}`} className="text-sm font-medium">Member verification notify: Health Net</Label>
                                            </div>
                                            <Checkbox
                                                id={`member-verify-healthnet-${staff.uid}`}
                                                checked={memberVerificationHealthNetRecipientUids.includes(staff.uid)}
                                                onCheckedChange={(checked) =>
                                                    handleMemberVerificationNotifyToggle('healthnet', staff.uid, Boolean(checked))
                                                }
                                                aria-label={`Toggle Health Net member verification notifications for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Trash2 className={`h-4 w-4 ${swVisitDeletePermissions.includes(staff.uid) ? 'text-red-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`sw-visit-delete-${staff.uid}`} className="text-sm font-medium">SW visit delete</Label>
                                            </div>
                                            <Checkbox
                                                id={`sw-visit-delete-${staff.uid}`}
                                                checked={swVisitDeletePermissions.includes(staff.uid)}
                                                onCheckedChange={(checked) => handleSwVisitDeleteToggle(staff.uid, !!checked)}
                                                aria-label={`Toggle SW visit delete permissions for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <CalendarCheck className={`h-4 w-4 ${Boolean(reviewRecipient.kaiserRnVisitAssigner) ? 'text-purple-700' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`review-rn-visit-assigner-${staff.uid}`} className="text-sm font-medium">RN Visit Assigner (Kaiser)</Label>
                                            </div>
                                            <Checkbox
                                                id={`review-rn-visit-assigner-${staff.uid}`}
                                                checked={Boolean(reviewRecipient.kaiserRnVisitAssigner)}
                                                disabled={!reviewPopupsEnabled}
                                                onCheckedChange={(checked) => {
                                                    const nextValue = Boolean(checked);
                                                    const keepEnabled = nextValue || Boolean(reviewRecipient.documents || reviewRecipient.csSummary || reviewRecipient.eligibility || reviewRecipient.standalone || reviewRecipient.alftReviewer || reviewRecipient.alft);
                                                    setReviewRecipient(
                                                      staff.uid,
                                                      { kaiserRnVisitAssigner: nextValue, enabled: keepEnabled },
                                                      staff
                                                    );
                                                }}
                                                aria-label={`Toggle RN visit assigner routing for ${staff.email}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                                );
                                };

                                return (
                                    <>
                                        <div id="super-admins-section" className="space-y-4">
                                            <div className="text-xs font-semibold text-muted-foreground">Super Admins</div>
                                            {superAdmins.length > 0 ? superAdmins.map(renderCard) : (
                                                <div className="text-sm text-muted-foreground">No Super Admins match your filters.</div>
                                            )}
                                        </div>
                                        <div id="staff-section" className="space-y-4">
                                            <div className="text-xs font-semibold text-muted-foreground">Staff</div>
                                            {nonSuperAdmins.length > 0 ? nonSuperAdmins.map(renderCard) : (
                                                <div className="text-sm text-muted-foreground">No staff match your filters.</div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No staff members found.</p>
                    )}
                </CardContent>
                {staffList.length > 0 ? (
                    <CardFooter className="pt-0">
                        <div className="text-xs text-muted-foreground">
                            Settings on this page save automatically.
                        </div>
                    </CardFooter>
                ) : null}
            </Card>

            <Card id="global-controls-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Global access controls</CardTitle>
                    <CardDescription>System-wide access switches for admins and app users.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-muted/20">
                        <div className="space-y-1">
                            <div className="text-sm font-semibold">Manage access (global)</div>
                            <div className="text-xs text-muted-foreground">
                                Turn off to block Admin logins (Super Admins can still log in).
                            </div>
                        </div>
                        <Switch
                            checked={adminPortalEnabled}
                            onCheckedChange={(v) => { setAdminPortalEnabled(Boolean(v)); queueAutoSave(); }}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-muted/20">
                        <div className="space-y-1">
                            <div className="text-sm font-semibold">Application access (master switch)</div>
                            <div className="text-xs text-muted-foreground">
                                Turn off to block all users from the app (except <span className="font-semibold">jason@carehomefinders.com</span>).
                            </div>
                        </div>
                        <Switch
                            checked={appAccessEnabled}
                            onCheckedChange={(v) => { setAppAccessEnabled(Boolean(v)); queueAutoSave(); }}
                        />
                    </div>
                    {!appAccessEnabled ? (
                        <div className="md:col-span-2 space-y-2 p-3 border rounded-lg bg-amber-50">
                            <div className="text-sm font-semibold text-amber-900">Master switch message (optional)</div>
                            <div className="text-xs text-amber-900/80">
                                This message is shown to blocked users when access is disabled.
                            </div>
                            <Input
                                value={appAccessMessage}
                                onChange={(e) => { setAppAccessMessage(e.target.value); queueAutoSave(); }}
                                placeholder="Example: Maintenance in progress. Please try again at 2pm."
                            />
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card id="email-notifications-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Email notifications</CardTitle>
                    <CardDescription>Configure ILS access and weekly email behavior.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div className="p-3 border rounded-lg bg-blue-50/40">
                        <div className="flex items-center gap-2 mb-2">
                            <CalendarCheck className="h-4 w-4 text-blue-700" />
                            <div className="text-sm font-semibold text-blue-900">ILS Member Access - John</div>
                        </div>
                        <div className="text-xs text-blue-900/80 mb-3">
                            Configure page-only access for <span className="font-semibold">{ILS_MEMBER_TARGET_EMAIL}</span> to open
                            <span className="font-mono"> /admin/reports/ils</span>, add comments/notes per member, and optionally receive the weekly ILS list every Wednesday.
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-white px-3 py-2">
                                <Label htmlFor="ils-page-access-jhernandez" className="text-sm font-medium">
                                    ILS page access (only this page)
                                </Label>
                                <Switch
                                    id="ils-page-access-jhernandez"
                                    checked={ilsMemberAllowedEmails.map((x) => String(x).toLowerCase()).includes(ILS_MEMBER_TARGET_EMAIL)}
                                    onCheckedChange={(v) => toggleIlsMemberTargetAccess(ILS_MEMBER_TARGET_EMAIL, Boolean(v))}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-white px-3 py-2">
                                <Label htmlFor="ils-weekly-email-jhernandez" className="text-sm font-medium">
                                    Send ILS list every Wednesday
                                </Label>
                                <Switch
                                    id="ils-weekly-email-jhernandez"
                                    checked={
                                        ilsWeeklyEmailEnabled &&
                                        ilsWeeklyEmailRecipients.map((x) => String(x).toLowerCase()).includes(ILS_MEMBER_TARGET_EMAIL)
                                    }
                                    onCheckedChange={(v) => toggleIlsWeeklyTargetEmail(ILS_MEMBER_TARGET_EMAIL, Boolean(v))}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card id="desktop-controls-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Desktop notification controls</CardTitle>
                    <CardDescription>Electron and web notification behavior for staff alerts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg bg-muted/20">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">ALFT Electron activation (global)</div>
                                <div className="text-xs text-muted-foreground">
                                    Master on/off for ALFT Electron notifications.
                                </div>
                            </div>
                            <Switch
                                checked={alftElectronEnabled}
                                onCheckedChange={(v) => { setAlftElectronEnabled(Boolean(v)); queueAutoSave(); }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Electron notifications (incoming forms)</div>
                                <div className="text-xs text-muted-foreground">
                                    Controls CS Summary + Documents review popups for selected staff.
                                </div>
                            </div>
                            <Switch
                                checked={reviewPopupsEnabled}
                                onCheckedChange={(v) => { setReviewPopupsEnabled(Boolean(v)); queueAutoSave(); }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Web in-app notifications</div>
                                <div className="text-xs text-muted-foreground">
                                    Turns on/off the web notification cards for staff notes.
                                </div>
                            </div>
                            <Switch
                                checked={webAppNotificationsEnabled}
                                onCheckedChange={(v) => { setWebAppNotificationsEnabled(Boolean(v)); queueAutoSave(); }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Suppress web when Electron is active</div>
                                <div className="text-xs text-muted-foreground">
                                    Prevents duplicate notifications inside the desktop app.
                                </div>
                            </div>
                            <Switch
                                checked={suppressWebWhenDesktopActive}
                                onCheckedChange={(v) => { setSuppressWebWhenDesktopActive(Boolean(v)); queueAutoSave(); }}
                            />
                        </div>
                    </div>

                    <div className="max-w-sm space-y-2">
                        <Label htmlFor="reviewPollIntervalSeconds">Electron poll interval (seconds)</Label>
                        <Input
                            id="reviewPollIntervalSeconds"
                            type="number"
                            min={30}
                            max={3600}
                            value={String(reviewPollIntervalSeconds)}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                if (Number.isFinite(next)) {
                                    setReviewPollIntervalSeconds(next);
                                    queueAutoSave();
                                }
                            }}
                            placeholder="180"
                        />
                        <div className="text-xs text-muted-foreground">Minimum 30 seconds. Maximum 1 hour.</div>
                    </div>
                </CardContent>
            </Card>

            <Card id="staff-assignment-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Staff assignment &amp; rotation</CardTitle>
                    <CardDescription>Configure automatic staff assignments and rotation schedules.</CardDescription>
                </CardHeader>
                <CardContent>
                    <StaffAssignmentNotificationSystem />
                </CardContent>
            </Card>

            <Card id="advanced-notifications-section" className="border-border/70 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Advanced notification settings</CardTitle>
                    <CardDescription>Configure notification templates and delivery behavior.</CardDescription>
                </CardHeader>
                <CardContent>
                    <NotificationSettings />
                </CardContent>
            </Card>
            </div>
        </div>
    );
}