'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Users, Bell, Save, ShieldCheck, Mail, UserPlus, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, doc, writeBatch, getDocs, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { NotificationManager } from '@/components/NotificationManager';
import NotificationSettings from '@/components/NotificationSettings';
import StaffAssignmentNotificationSystem from '@/components/StaffAssignmentNotificationSystem';
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
}

type ReviewRecipientSettings = {
    enabled: boolean;
    csSummary: boolean;
    documents: boolean;
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
    const [ilsNotePermissions, setIlsNotePermissions] = useState<string[]>([]);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffRole, setNewStaffRole] = useState<'Admin' | 'Super Admin'>('Admin');
    const [isAddingStaff, setIsAddingStaff] = useState(false);
    const [createdStaff, setCreatedStaff] = useState<null | { email: string; role: string; uid: string; tempPassword: string }>(null);
    const [staffNameFilter, setStaffNameFilter] = useState('');
    const [staffRoleFilter, setStaffRoleFilter] = useState<'all' | 'Admin' | 'Super Admin'>('all');
    const [notificationRecipientsHadField, setNotificationRecipientsHadField] = useState<boolean | null>(null);

    // Global admin portal access (master switch)
    const [adminPortalEnabled, setAdminPortalEnabled] = useState(true);

    // Web in-app notifications (cards/toasts) for staff notes
    const [webAppNotificationsEnabled, setWebAppNotificationsEnabled] = useState(true);
    const [suppressWebWhenDesktopActive, setSuppressWebWhenDesktopActive] = useState(true);

    // Electron review popups (incoming forms)
    const [reviewPopupsEnabled, setReviewPopupsEnabled] = useState(true);
    const [reviewPollIntervalSeconds, setReviewPollIntervalSeconds] = useState(180);
    const [reviewRecipients, setReviewRecipients] = useState<Record<string, ReviewRecipientSettings>>({});
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoSaveInFlightRef = useRef(false);
    const autoSaveQueuedRef = useRef(false);

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
                return {
                    uid,
                    role: superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff',
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    email: userData.email || uid,
                    isKaiserStaff: Boolean(userData.isKaiserStaff),
                    isHealthNetStaff: Boolean(userData.isHealthNetStaff),
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
                        firstName: member.firstName || firstNameFromAuth,
                        lastName: member.lastName || lastNameFromAuth,
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
                    firstName,
                    lastName,
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
      patch: Partial<Pick<StaffMember, 'isKaiserStaff' | 'isHealthNetStaff'>>
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
            const [notificationsSnap, adminAccessSnap, reviewSnap] = await Promise.all([
                getDoc(doc(firestore, 'system_settings', 'notifications')).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'system_settings/notifications', operation: 'get' }));
                    throw e;
                }),
                getDoc(doc(firestore, 'system_settings', 'admin_access')).catch(() => null),
                getDoc(doc(firestore, 'system_settings', 'review_notifications')).catch(() => null),
            ]);

            if (notificationsSnap?.exists()) {
                const data = notificationsSnap.data();
                const rawRecipientUids = (data as any)?.recipientUids;
                setNotificationRecipientsHadField(rawRecipientUids !== undefined);
                setNotificationRecipients(Array.isArray(rawRecipientUids) ? rawRecipientUids : []);
                setIlsNotePermissions(data?.ilsNotePermissions || []);
                setWebAppNotificationsEnabled(Boolean((data as any)?.webAppNotificationsEnabled ?? true));
                setSuppressWebWhenDesktopActive(Boolean((data as any)?.suppressWebWhenDesktopActive ?? true));
            } else {
                setNotificationRecipientsHadField(false);
            }

            if (adminAccessSnap?.exists()) {
                const data = adminAccessSnap.data() as any;
                setAdminPortalEnabled(Boolean(data?.enabled ?? true));
            } else {
                setAdminPortalEnabled(true);
            }

            if (reviewSnap?.exists()) {
                const data = reviewSnap.data() as any;
                setReviewPopupsEnabled(Boolean(data?.enabled ?? true));
                setReviewPollIntervalSeconds(Number(data?.pollIntervalSeconds || 180));
                setReviewRecipients((data?.recipients || {}) as Record<string, ReviewRecipientSettings>);
            } else {
                setReviewPopupsEnabled(true);
                setReviewPollIntervalSeconds(180);
                setReviewRecipients({});
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
                    firstName: newStaffFirstName,
                    lastName: newStaffLastName,
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

    const handleNotificationToggle = (uid: string, checked: boolean) => {
        setNotificationRecipients(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
        queueAutoSave();
    };

    const handleIlsNoteToggle = (uid: string, checked: boolean) => {
        setIlsNotePermissions(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
        queueAutoSave();
    };

    const handleSaveNotifications = async (options?: { silentSuccess?: boolean }) => {
        if (!firestore) return;
        setIsSavingNotifications(true);
        try {
            const notificationsRef = doc(firestore, 'system_settings', 'notifications');
            const notificationsData = {
                recipientUids: notificationRecipients,
                ilsNotePermissions: ilsNotePermissions,
                webAppNotificationsEnabled: Boolean(webAppNotificationsEnabled),
                suppressWebWhenDesktopActive: Boolean(suppressWebWhenDesktopActive),
            };

            const adminAccessRef = doc(firestore, 'system_settings', 'admin_access');
            const adminAccessData = {
                enabled: Boolean(adminPortalEnabled),
                updatedAt: new Date(),
                updatedBy: currentUser?.uid || null,
            };

            const reviewRef = doc(firestore, 'system_settings', 'review_notifications');
            const reviewData = {
                enabled: Boolean(reviewPopupsEnabled),
                pollIntervalSeconds: Math.max(30, Math.min(3600, Math.round(Number(reviewPollIntervalSeconds || 180)))),
                recipients: reviewRecipients,
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
                setDoc(reviewRef, reviewData, { merge: true }).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: reviewRef.path, operation: 'update', requestResourceData: reviewData }));
                    throw e;
                }),
            ]);

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
        setReviewRecipients(prev => {
            const current = prev[uid] || {
                enabled: false,
                csSummary: false,
                documents: false,
                kaiserUploads: true,
                healthNetUploads: true,
                email: staff?.email,
                label: (staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email,
            };
            return {
                ...prev,
                [uid]: {
                    ...current,
                    ...updates,
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
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold">Staff Management</h1>
                        <p className="text-muted-foreground">
                            Manage staff assignments, notifications, and permissions
                        </p>
                    </div>
                </div>
            </div>

            {/* Add New Staff */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Add New Staff Member
                    </CardTitle>
                    <CardDescription>
                        Create a staff account in Firebase Auth (pre-approve access)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert className="mb-4">
                        <AlertTitle>How this works</AlertTitle>
                        <AlertDescription>
                            Staff cannot access the admin portal unless you create their account here (or in Firebase Auth) and assign a role.
                            After you create them, send them the temporary password and have them sign in at <span className="font-mono">/admin/login</span>.
                            They can then use “Forgot your password?” to set their own password.
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
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                value={newStaffFirstName}
                                onChange={(e) => setNewStaffFirstName(e.target.value)}
                                placeholder="Enter first name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                value={newStaffLastName}
                                onChange={(e) => setNewStaffLastName(e.target.value)}
                                placeholder="Enter last name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
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
            </Card>

            {/* Staff List & Permissions */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Staff Permissions & Notifications
                    </CardTitle>
                    <CardDescription>
                        Manage staff roles, notification preferences, and special permissions
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg bg-muted/20">
                        <div className="flex items-center justify-between gap-4">
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
                    </div>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg bg-muted/20">
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

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="reviewPollIntervalSeconds">Electron poll interval (seconds)</Label>
                            <Input
                                id="reviewPollIntervalSeconds"
                                type="number"
                                min={30}
                                max={3600}
                                value={String(reviewPollIntervalSeconds)}
                                onChange={(e) => setReviewPollIntervalSeconds(Number(e.target.value))}
                                placeholder="180"
                            />
                            <div className="text-xs text-muted-foreground">Minimum 30 seconds. Maximum 1 hour.</div>
                        </div>
                    </div>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
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
                                    const reviewRecipient = reviewRecipients[staff.uid] || {
                                        enabled: false,
                                        csSummary: false,
                                        documents: false,
                                        kaiserUploads: true,
                                        healthNetUploads: true,
                                        email: staff?.email,
                                        label: (staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email,
                                    } satisfies ReviewRecipientSettings;
                                    const notificationsEnabled = notificationRecipients.includes(staff.uid);

                                    return (
                                    <div key={staff.uid} className="p-3 border rounded-lg">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-semibold">
                                                {(staff.firstName || staff.lastName) ? `${staff.firstName} ${staff.lastName}`.trim() : (staff.email || staff.uid)}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">{staff.email || staff.uid}</p>
                                            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                                                staff.role === 'Super Admin' 
                                                    ? 'bg-red-100 text-red-800' 
                                                    : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {staff.role}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs text-muted-foreground">Access</Label>
                                            <Switch
                                                checked={staff.role === 'Admin' || staff.role === 'Super Admin'}
                                                disabled={staff.uid === currentUser?.uid}
                                                onCheckedChange={(checked) => {
                                                    const enable = Boolean(checked);
                                                    handleSetAdminAccessForUser(
                                                        staff.uid,
                                                        enable,
                                                        enable ? 'Admin' : staff.role
                                                    ).catch(() => undefined);
                                                }}
                                            />
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
                                                <Bell className={`h-4 w-4 ${notificationsEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`notif-${staff.uid}`} className="text-sm font-medium">Interoffice notes</Label>
                                            </div>
                                            <Checkbox 
                                                id={`notif-${staff.uid}`} 
                                                checked={notificationsEnabled} 
                                                onCheckedChange={(checked) => {
                                                    const nextValue = Boolean(checked);
                                                    handleNotificationToggle(staff.uid, nextValue);
                                                }} 
                                                aria-label={`Toggle interoffice notes for ${staff.email}`} 
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
                                        {/* Incoming forms review notifications (Doc uploads / CS Summary) */}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${Boolean(reviewRecipient.documents || reviewRecipient.csSummary) ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`review-docs-${staff.uid}`} className="text-sm font-medium">Doc uploads</Label>
                                            </div>
                                            <Checkbox
                                                id={`review-docs-${staff.uid}`}
                                                checked={Boolean(reviewRecipient.documents || reviewRecipient.csSummary)}
                                                disabled={!reviewPopupsEnabled}
                                                onCheckedChange={(checked) => {
                                                    const nextValue = Boolean(checked);
                                                    setReviewRecipient(
                                                      staff.uid,
                                                      {
                                                        documents: nextValue,
                                                        csSummary: nextValue,
                                                        enabled: nextValue,
                                                        // When enabling, default both plans on unless explicitly set.
                                                        ...(nextValue
                                                          ? {
                                                              kaiserUploads: reviewRecipient.kaiserUploads ?? true,
                                                              healthNetUploads: reviewRecipient.healthNetUploads ?? true,
                                                            }
                                                          : {}),
                                                      },
                                                      staff
                                                    );
                                                }}
                                                aria-label={`Toggle document upload review notifications for ${staff.email}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                                );
                                };

                                return (
                                    <>
                                        <div className="space-y-4">
                                            <div className="text-xs font-semibold text-muted-foreground">Super Admins</div>
                                            {superAdmins.length > 0 ? superAdmins.map(renderCard) : (
                                                <div className="text-sm text-muted-foreground">No Super Admins match your filters.</div>
                                            )}
                                        </div>
                                        <div className="space-y-4">
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
                {staffList.length > 0 && (
                    <CardFooter>
                        <Button onClick={handleSaveNotifications} disabled={isSavingNotifications} className="w-full sm:w-auto">
                            {isSavingNotifications ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save All Settings
                                </>
                            )}
                        </Button>
                    </CardFooter>
                )}
            </Card>

            {/* Notification Management */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Staff Review Email Alerts (SendGrid)
                    </CardTitle>
                    <CardDescription>
                        Controls staff-facing emails for doc uploads (includes CS Summary). This does not affect user/referrer reminder emails (Resend).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <NotificationManager />
                </CardContent>
            </Card>

            {/* Staff Assignment Notification System */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <RotateCcw className="h-5 w-5" />
                        Staff Assignment & Rotation System
                    </CardTitle>
                    <CardDescription>
                        Configure automatic staff assignments and rotation schedules
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <StaffAssignmentNotificationSystem />
                </CardContent>
            </Card>

            {/* Additional Notification Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Advanced Notification Settings
                    </CardTitle>
                    <CardDescription>
                        Configure notification templates and delivery preferences
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <NotificationSettings />
                </CardContent>
            </Card>
        </div>
    );
}