
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trash2, UserPlus, Send, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Timestamp, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore } from '@/firebase';
import { createAdminUser } from '@/app/actions/admin-actions';

const samplePayload = {
    memberFirstName: 'John',
    memberLastName: 'Doe',
    memberDob: Timestamp.fromDate(new Date('1965-01-15')).toDate(),
    memberAge: 59,
    memberMediCalNum: '912345678',
    confirmMemberMediCalNum: '912345678',
    memberMrn: 'MRN123456789',
    confirmMemberMrn: 'MRN123456789',
    memberLanguage: 'English',
    memberCounty: 'Los Angeles',
    referrerFirstName: 'Admin',
    referrerLastName: 'User',
    referrerEmail: 'admin.user@example.com',
    referrerPhone: '(555) 111-2222',
    referrerRelationship: 'System Admin',
    agency: 'Testing Agency',
    bestContactFirstName: 'Primary',
    bestContactLastName: 'Contact',
    bestContactRelationship: 'Spouse',
    bestContactPhone: '(555) 333-4444',
    bestContactEmail: 'primary@contact.com',
    bestContactLanguage: 'English',
    secondaryContactFirstName: 'Secondary',
    secondaryContactLastName: 'Contact',
    secondaryContactRelationship: 'Child',
    secondaryContactPhone: '(555) 555-6666',
    secondaryContactEmail: 'secondary@contact.com',
    secondaryContactLanguage: 'Spanish',
    hasCapacity: 'Yes',
    hasLegalRep: 'Yes',
    repFirstName: 'Legal',
    repLastName: 'Representative',
    repRelationship: 'Lawyer',
    repPhone: '(555) 777-8888',
    repEmail: 'legal@rep.com',
    repLanguage: 'English',
    isRepPrimaryContact: false,
    currentLocation: 'SNF',
    currentAddress: '123 Test St',
    currentCity: 'Testville',
    currentState: 'CA',
    currentZip: '90210',
    currentCounty: 'Los Angeles',
    copyAddress: false,
    customaryAddress: '456 Home Ave',
    customaryCity: 'Hometown',
    customaryState: 'CA',
    customaryZip: '90211',
    customaryCounty: 'Los Angeles',
    healthPlan: 'Kaiser',
    existingHealthPlan: null,
    switchingHealthPlan: null,
    pathway: 'SNF Transition',
    meetsPathwayCriteria: true,
    snfDiversionReason: null,
    ispFirstName: 'ISP',
    ispLastName: 'Coordinator',
    ispRelationship: 'Care Coordinator',
    ispFacilityName: 'Test Facility',
    ispPhone: '(555) 999-0000',
    ispEmail: 'isp@coordinator.com',
    ispCopyCurrent: false,
    ispLocationType: 'Other',
    ispAddress: '789 ISP Way',
    ispCity: 'Ispville',
    ispState: 'CA',
    ispZip: '90213',
    ispCounty: 'Los Angeles',
    onALWWaitlist: 'No',
    hasPrefRCFE: 'Yes',
    rcfeName: 'Preferred RCFE',
    rcfeAdminName: 'RCFE Admin',
    rcfeAdminPhone: '(555) 123-9876',
    rcfeAdminEmail: 'rcfe@admin.com',
    rcfeAddress: '101 RCFE Blvd',
    id: `test-payload-${Date.now()}`,
    caspioSent: true,
};

interface StaffMember {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Super Admin';
    avatar?: string;
}

const WebhookPreparer = () => {
    const [isSending, setIsSending] = useState(false);
    const { toast } = useToast();

    const handleSendTestWebhook = async () => {
        setIsSending(true);
        const webhookUrl = 'https://hook.us2.make.com/mqif1rouo1wh762k2eze1y7568gwq6kx';
        
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(samplePayload),
            });

            if (!response.ok) throw new Error(`Server responded with ${response.status}`);

            toast({
                title: 'Webhook Sent!',
                description: 'The sample CS Summary data was sent to Make.com.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Webhook Error',
                description: `Failed to send data: ${error.message}`,
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Webhook Preparer</CardTitle>
                <CardDescription>Send a sample with all CS Summary fields to Make.com to prepare your scenario for field mapping.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Click the button below to send a test payload. Go to your Make.com scenario, click "Run once", and then come back here and click the button. Make.com will receive the data, allowing you to map the fields to your Caspio module.
                </p>
                <Button onClick={handleSendTestWebhook} disabled={isSending} className="w-full">
                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send Test Payload to Make.com
                </Button>
                <Separator />
                <h4 className="font-semibold">Sample Payload Fields</h4>
                 <ScrollArea className="h-64 border rounded-md p-4 bg-muted/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 text-sm">
                        {Object.entries(samplePayload).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                                <span className="font-semibold text-primary">{key}:</span>
                                <span className="text-muted-foreground truncate">
                                    {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};


export default function SuperAdminPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);
    
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);

    const fetchStaff = async () => {
        if (!firestore) return;
        setIsLoadingStaff(true);
        
        const adminUsers = new Map<string, Omit<StaffMember, 'role' | 'avatar'>>();
        const userDocs = await getDocs(collection(firestore, 'users'));
        userDocs.forEach(doc => {
            const data = doc.data();
            adminUsers.set(doc.id, {
                id: doc.id,
                name: data.displayName || `${data.firstName} ${data.lastName}`,
                email: data.email
            });
        });

        const allStaff: StaffMember[] = [];
        const adminRoles = await getDocs(collection(firestore, 'roles_admin'));
        adminRoles.forEach(doc => {
            const user = adminUsers.get(doc.id);
            if (user) {
                allStaff.push({ ...user, role: 'Admin' });
            }
        });

        const superAdminRoles = await getDocs(collection(firestore, 'roles_super_admin'));
        superAdminRoles.forEach(doc => {
            const user = adminUsers.get(doc.id);
            if (user) {
                const existingIndex = allStaff.findIndex(s => s.id === user.id);
                if (existingIndex !== -1) {
                    allStaff[existingIndex].role = 'Super Admin';
                } else {
                    allStaff.push({ ...user, role: 'Super Admin' });
                }
            }
        });

        setStaff(allStaff.sort((a,b) => a.name.localeCompare(b.name)));
        setIsLoadingStaff(false);
    };

    useEffect(() => {
        if(firestore){
            fetchStaff();
        }
    }, [firestore]);
    

    const handleAddStaff = async () => {
        if (!newStaffEmail || !newStaffFirstName || !newStaffLastName) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please provide a first name, last name, and email." });
            return;
        }

        setIsAddingStaff(true);
        try {
            const result = await createAdminUser({ 
                email: newStaffEmail, 
                firstName: newStaffFirstName, 
                lastName: newStaffLastName 
            });

            if (result.success) {
                toast({ title: "Staff Added", description: `${newStaffEmail} has been created and invited.` });
                setNewStaffEmail('');
                setNewStaffFirstName('');
                setNewStaffLastName('');
                await fetchStaff(); // Refresh the list
            } else {
                throw new Error(result.error || "An unknown error occurred.");
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Failed to Add Staff", description: error.message });
        } finally {
            setIsAddingStaff(false);
        }
    };
    
    const handleRemoveStaff = async (staffMember: StaffMember) => {
        if (!firestore) return;

        try {
            if (staffMember.role === 'Admin') {
                await deleteDoc(doc(firestore, 'roles_admin', staffMember.id));
            } else if (staffMember.role === 'Super Admin') {
                await deleteDoc(doc(firestore, 'roles_super_admin', staffMember.id));
            }
            toast({ title: "Staff Role Removed", description: `${staffMember.email} no longer has the ${staffMember.role} role.` });
            await fetchStaff(); // Refresh list
        } catch (error: any) {
             toast({ variant: "destructive", title: "Failed to Remove Role", description: error.message });
        }
    };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Super Admin Tools</h1>
        <p className="text-muted-foreground">Manage staff access and system-wide settings.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card>
            <CardHeader>
                <CardTitle>Manage Staff Access</CardTitle>
                <CardDescription>Add or remove staff who can access the admin portal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4 p-4 border rounded-lg">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input id="firstName" value={newStaffFirstName} onChange={e => setNewStaffFirstName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input id="lastName" value={newStaffLastName} onChange={e => setNewStaffLastName(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="add-staff-email">Invite New Staff by Email</Label>
                        <Input 
                            id="add-staff-email" 
                            type="email" 
                            placeholder="new.staff@example.com"
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleAddStaff} className="w-full" disabled={isAddingStaff}>
                        {isAddingStaff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Add Staff Member
                    </Button>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">Current Staff</h3>
                    <ScrollArea className="h-72">
                         {isLoadingStaff ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                         ) : (
                            staff.map(member => (
                                <div key={member.id} className="flex items-center justify-between pr-4 py-2">
                                    <div className="flex items-center gap-4">
                                        <Avatar>
                                            <AvatarImage src={member.avatar} alt={member.name} />
                                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold">{member.name}</p>
                                            <p className="text-sm text-muted-foreground">{member.email}</p>
                                        </div>
                                    </div>
                                     <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-muted-foreground">{member.role}</span>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="text-destructive hover:bg-destructive/10"
                                            onClick={() => handleRemoveStaff(member)}
                                            disabled={member.role === 'Super Admin'}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                         )}
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>

        <div className="space-y-6">
            <Card>
                <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>
                    Designate which staff members receive an email for important system events.
                </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>New Application Submitted</Label>
                        <p className="text-sm text-muted-foreground">Select staff to notify when a new application is submitted.</p>
                        <Input disabled placeholder="jason@carehomefinders.com, alice@example.com" />
                    </div>
                    <div className="space-y-2">
                        <Label>Secure Document Upload</Label>
                        <p className="text-sm text-muted-foreground">Select staff to notify when a document is uploaded to the secure portal.</p>
                        <Input disabled placeholder="jason@carehomefinders.com" />
                    </div>
                    <Button disabled>
                        <Send className="mr-2 h-4 w-4"/>
                        Save Notification Settings
                    </Button>
                </CardContent>
            </Card>

            <WebhookPreparer />
        </div>

      </div>

    </div>
  );
}
