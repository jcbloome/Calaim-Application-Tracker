'use client';

import { useState, useEffect } from 'react';
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
}

type ReviewRecipientSettings = {
    enabled: boolean;
    csSummary: boolean;
    documents: boolean;
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

    // Global admin portal access (master switch)
    const [adminPortalEnabled, setAdminPortalEnabled] = useState(true);

    // Web in-app notifications (cards/toasts) for staff notes
    const [webAppNotificationsEnabled, setWebAppNotificationsEnabled] = useState(true);
    const [suppressWebWhenDesktopActive, setSuppressWebWhenDesktopActive] = useState(true);

    // Electron review popups (incoming forms)
    const [reviewPopupsEnabled, setReviewPopupsEnabled] = useState(true);
    const [reviewPollIntervalSeconds, setReviewPollIntervalSeconds] = useState(180);
    const [reviewRecipients, setReviewRecipients] = useState<Record<string, ReviewRecipientSettings>>({});

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

            const staffFlagIds = usersSnap.docs
                .filter(d => Boolean((d.data() as any)?.isStaff))
                .map(d => d.id);

            const allStaffIds = Array.from(new Set([
                ...Array.from(adminIds),
                ...Array.from(superAdminIds),
                ...staffFlagIds,
            ]));

            let staff: StaffMember[] = allStaffIds.map(uid => {
                const userData = users[uid] || {};
                return {
                    uid,
                    role: superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff',
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    email: userData.email || uid
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
                setNotificationRecipients(data?.recipientUids || []);
                setIlsNotePermissions(data?.ilsNotePermissions || []);
                setWebAppNotificationsEnabled(Boolean((data as any)?.webAppNotificationsEnabled ?? true));
                setSuppressWebWhenDesktopActive(Boolean((data as any)?.suppressWebWhenDesktopActive ?? true));
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
    };

    const handleIlsNoteToggle = (uid: string, checked: boolean) => {
        setIlsNotePermissions(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
    };

    const handleSaveNotifications = async () => {
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
                setDoc(adminAccessRef, adminAccessData, { merge: true }).catch(() => undefined),
                setDoc(reviewRef, reviewData, { merge: true }).catch(() => undefined),
            ]);

            toast({ 
                title: "Settings Saved", 
                description: "All settings updated.", 
                className: 'bg-green-100 text-green-900 border-green-200' 
            });
        } catch (error: any) {
            // Error emitted above
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const setReviewRecipient = (uid: string, updates: Partial<ReviewRecipientSettings>, staff?: StaffMember) => {
        setReviewRecipients(prev => {
            const current = prev[uid] || {
                enabled: false,
                csSummary: true,
                documents: true,
                email: staff?.email,
                label: (staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email,
            };
            return {
                ...prev,
                [uid]: {
                    ...current,
                    ...updates,
                    email: current.email || staff?.email,
                    label: current.label || ((staff?.firstName || staff?.lastName) ? `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() : staff?.email),
                }
            };
        });
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
                            <Switch checked={adminPortalEnabled} onCheckedChange={(v) => setAdminPortalEnabled(Boolean(v))} />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">Electron notifications (incoming forms)</div>
                                <div className="text-xs text-muted-foreground">
                                    Controls CS Summary + Documents review popups for selected staff.
                                </div>
                            </div>
                            <Switch checked={reviewPopupsEnabled} onCheckedChange={(v) => setReviewPopupsEnabled(Boolean(v))} />
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
                                onCheckedChange={(v) => setWebAppNotificationsEnabled(Boolean(v))}
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
                                onCheckedChange={(v) => setSuppressWebWhenDesktopActive(Boolean(v))}
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

                                const renderCard = (staff: any) => (
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
                                                <Bell className={`h-4 w-4 ${notificationRecipients.includes(staff.uid) ? 'text-primary' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`notif-${staff.uid}`} className="text-sm font-medium">General</Label>
                                            </div>
                                            <Checkbox 
                                                id={`notif-${staff.uid}`} 
                                                checked={notificationRecipients.includes(staff.uid)} 
                                                onCheckedChange={(checked) => handleNotificationToggle(staff.uid, !!checked)} 
                                                aria-label={`Toggle general notifications for ${staff.email}`} 
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
                                        {/* Electron notifications for incoming forms (review popups) */}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${Boolean(reviewRecipients[staff.uid]?.enabled) ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`electron-enabled-${staff.uid}`} className="text-sm font-medium">Electron Forms</Label>
                                            </div>
                                            <Checkbox
                                                id={`electron-enabled-${staff.uid}`}
                                                checked={Boolean(reviewRecipients[staff.uid]?.enabled)}
                                                disabled={!reviewPopupsEnabled}
                                                onCheckedChange={(checked) => setReviewRecipient(staff.uid, { enabled: !!checked }, staff)}
                                                aria-label={`Toggle Electron form review popups for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className="h-4 w-4 text-muted-foreground" />
                                                <Label htmlFor={`electron-cs-${staff.uid}`} className="text-sm font-medium">CS Summary</Label>
                                            </div>
                                            <Checkbox
                                                id={`electron-cs-${staff.uid}`}
                                                checked={Boolean(reviewRecipients[staff.uid]?.csSummary)}
                                                disabled={!reviewPopupsEnabled || !reviewRecipients[staff.uid]?.enabled}
                                                onCheckedChange={(checked) => setReviewRecipient(staff.uid, { csSummary: !!checked }, staff)}
                                                aria-label={`Toggle CS Summary review popups for ${staff.email}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className="h-4 w-4 text-muted-foreground" />
                                                <Label htmlFor={`electron-docs-${staff.uid}`} className="text-sm font-medium">Documents</Label>
                                            </div>
                                            <Checkbox
                                                id={`electron-docs-${staff.uid}`}
                                                checked={Boolean(reviewRecipients[staff.uid]?.documents)}
                                                disabled={!reviewPopupsEnabled || !reviewRecipients[staff.uid]?.enabled}
                                                onCheckedChange={(checked) => setReviewRecipient(staff.uid, { documents: !!checked }, staff)}
                                                aria-label={`Toggle document review popups for ${staff.email}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                                );

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
                        Email Notification System
                    </CardTitle>
                    <CardDescription>
                        Manage automated email notifications for document uploads and CS Summary completions
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