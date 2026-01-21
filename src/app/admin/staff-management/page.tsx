'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Users, Bell, Save, Trash2, ShieldCheck, Mail, UserPlus, RotateCcw, UserMinus, MoreHorizontal } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface StaffMember {
    uid: string;
    role: 'Admin' | 'Super Admin';
    firstName: string;
    lastName: string;
    email: string;
}

export default function StaffManagementPage() {
    const { isSuperAdmin, isAdmin, isLoading: isAdminLoading, user: currentUser } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();

    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);
    const [notificationRecipients, setNotificationRecipients] = useState<string[]>([]);
    const [healthNetRecipients, setHealthNetRecipients] = useState<string[]>([]);
    const [kaiserRecipients, setKaiserRecipients] = useState<string[]>([]);
    const [ilsNotePermissions, setIlsNotePermissions] = useState<string[]>([]);
    const [kaiserAssignmentStaff, setKaiserAssignmentStaff] = useState<string[]>([]);
    const [healthNetAssignmentStaff, setHealthNetAssignmentStaff] = useState<string[]>([]);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);

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
            const allAdminIds = Array.from(new Set([...adminIds, ...superAdminIds]));

            const users = usersSnap.docs.reduce((acc, doc) => {
                acc[doc.id] = doc.data();
                return acc;
            }, {} as Record<string, any>);

            const staff: StaffMember[] = allAdminIds.map(uid => {
                const userData = users[uid] || {};
                return {
                    uid,
                    role: superAdminIds.has(uid) ? 'Super Admin' : 'Admin',
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    email: userData.email || uid
                };
            });

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
            const settingsRef = doc(firestore, 'system_settings', 'notifications');
            const docSnap = await getDoc(settingsRef).catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: settingsRef.path, operation: 'get' }));
                throw e;
            });

            if (docSnap.exists()) {
                const data = docSnap.data();
                setNotificationRecipients(data?.recipientUids || []);
                setHealthNetRecipients(data?.healthNetRecipients || []);
                setKaiserRecipients(data?.kaiserRecipients || []);
                setIlsNotePermissions(data?.ilsNotePermissions || []);
                setKaiserAssignmentStaff(data?.kaiserAssignmentStaff || []);
                setHealthNetAssignmentStaff(data?.healthNetAssignmentStaff || []);
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
            // This is a placeholder - in a real implementation, you'd need to:
            // 1. Create a Firebase Auth user
            // 2. Add them to the users collection
            // 3. Add them to roles_admin collection
            
            toast({
                title: "Feature Coming Soon",
                description: "Staff creation functionality will be implemented with proper Firebase Auth integration.",
                className: 'bg-blue-100 text-blue-900 border-blue-200'
            });
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

    const handleHealthNetToggle = (uid: string, checked: boolean) => {
        setHealthNetRecipients(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
    };

    const handleKaiserToggle = (uid: string, checked: boolean) => {
        setKaiserRecipients(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
    };

    const handleKaiserAssignmentToggle = (uid: string, checked: boolean) => {
        setKaiserAssignmentStaff(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
    };

    const handleHealthNetAssignmentToggle = (uid: string, checked: boolean) => {
        setHealthNetAssignmentStaff(prev => 
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
            const settingsRef = doc(firestore, 'system_settings', 'notifications');
            const data = { 
                recipientUids: notificationRecipients,
                healthNetRecipients: healthNetRecipients,
                kaiserRecipients: kaiserRecipients,
                ilsNotePermissions: ilsNotePermissions,
                kaiserAssignmentStaff: kaiserAssignmentStaff,
                healthNetAssignmentStaff: healthNetAssignmentStaff
            };
            await setDoc(settingsRef, data, { merge: true }).catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: settingsRef.path, operation: 'update', requestResourceData: data }));
                throw e;
            });

            toast({ 
                title: "Settings Saved", 
                description: "All notification preferences and permissions updated.", 
                className: 'bg-green-100 text-green-900 border-green-200' 
            });
        } catch (error: any) {
            // Error emitted above
        } finally {
            setIsSavingNotifications(false);
        }
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
            <div className="flex items-center justify-between">
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
                        Create a new admin user account
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
                    {isLoadingStaff ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span>Loading staff members...</span>
                        </div>
                    ) : staffList.length > 0 ? (
                        <div className="space-y-4">
                            {staffList.map((staff) => (
                                <div key={staff.uid} className="p-4 border rounded-lg">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="font-semibold">
                                                {staff.firstName} {staff.lastName}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">{staff.email}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-1 text-xs rounded-full ${
                                                    staff.role === 'Super Admin' 
                                                        ? 'bg-red-100 text-red-800' 
                                                        : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {staff.role}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {staff.uid !== currentUser?.uid && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="outline" size="sm" className="text-muted-foreground border-muted-foreground/30 hover:text-red-600 hover:border-red-300 hover:bg-red-50">
                                                            <UserMinus className="h-4 w-4 mr-2" />
                                                            Manage Access
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Remove Admin Access</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will remove admin permissions for {staff.firstName} {staff.lastName}. 
                                                                They will no longer have access to the admin portal. This action can be reversed by re-adding them as an admin.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction 
                                                                onClick={() => handleRevokeStaff(staff.uid)}
                                                                className="bg-red-600 text-white hover:bg-red-700"
                                                            >
                                                                Remove Access
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${notificationRecipients.includes(staff.uid) ? 'text-primary' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`notif-${staff.uid}`} className="text-sm font-medium">General Notifications</Label>
                                            </div>
                                            <Checkbox 
                                                id={`notif-${staff.uid}`} 
                                                checked={notificationRecipients.includes(staff.uid)} 
                                                onCheckedChange={(checked) => handleNotificationToggle(staff.uid, !!checked)} 
                                                aria-label={`Toggle general notifications for ${staff.email}`} 
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${healthNetRecipients.includes(staff.uid) ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`healthnet-${staff.uid}`} className="text-sm font-medium">Health Net Applications</Label>
                                            </div>
                                            <Checkbox 
                                                id={`healthnet-${staff.uid}`} 
                                                checked={healthNetRecipients.includes(staff.uid)} 
                                                onCheckedChange={(checked) => handleHealthNetToggle(staff.uid, !!checked)} 
                                                aria-label={`Toggle Health Net notifications for ${staff.email}`} 
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${kaiserRecipients.includes(staff.uid) ? 'text-red-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`kaiser-${staff.uid}`} className="text-sm font-medium">Kaiser Applications</Label>
                                            </div>
                                            <Checkbox 
                                                id={`kaiser-${staff.uid}`} 
                                                checked={kaiserRecipients.includes(staff.uid)} 
                                                onCheckedChange={(checked) => handleKaiserToggle(staff.uid, !!checked)} 
                                                aria-label={`Toggle Kaiser notifications for ${staff.email}`} 
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <Mail className={`h-4 w-4 ${ilsNotePermissions.includes(staff.uid) ? 'text-green-600' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`ils-${staff.uid}`} className="text-sm font-medium">ILS Note Permissions</Label>
                                            </div>
                                            <Checkbox 
                                                id={`ils-${staff.uid}`} 
                                                checked={ilsNotePermissions.includes(staff.uid)} 
                                                onCheckedChange={(checked) => handleIlsNoteToggle(staff.uid, !!checked)} 
                                                aria-label={`Toggle ILS note permissions for ${staff.email}`} 
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Staff Assignment Configuration */}
                                    <div className="mt-4 pt-4 border-t">
                                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">Staff Assignment Availability</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-2">
                                                    <Users className={`h-4 w-4 ${kaiserAssignmentStaff.includes(staff.uid) ? 'text-red-600' : 'text-muted-foreground'}`} />
                                                    <Label htmlFor={`kaiser-assign-${staff.uid}`} className="text-sm font-medium">Available for Kaiser Assignments</Label>
                                                </div>
                                                <Checkbox 
                                                    id={`kaiser-assign-${staff.uid}`} 
                                                    checked={kaiserAssignmentStaff.includes(staff.uid)} 
                                                    onCheckedChange={(checked) => handleKaiserAssignmentToggle(staff.uid, !!checked)} 
                                                    aria-label={`Toggle Kaiser assignment availability for ${staff.email}`} 
                                                />
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-2">
                                                    <Users className={`h-4 w-4 ${healthNetAssignmentStaff.includes(staff.uid) ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                                    <Label htmlFor={`healthnet-assign-${staff.uid}`} className="text-sm font-medium">Available for Health Net Assignments</Label>
                                                </div>
                                                <Checkbox 
                                                    id={`healthnet-assign-${staff.uid}`} 
                                                    checked={healthNetAssignmentStaff.includes(staff.uid)} 
                                                    onCheckedChange={(checked) => handleHealthNetAssignmentToggle(staff.uid, !!checked)} 
                                                    aria-label={`Toggle Health Net assignment availability for ${staff.email}`} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
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