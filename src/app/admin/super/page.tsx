
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trash2, UserPlus, Send, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Timestamp } from 'firebase/firestore';


// Mock data - in a real app, this would come from Firestore
const initialStaff = [
  { id: '1', name: 'Jason Bloome', email: 'jason@carehomefinders.com', role: 'Super Admin', avatar: '/avatars/01.png' },
  { id: '2', name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', avatar: '/avatars/02.png' },
  { id: '3', name: 'Bob Williams', email: 'bob@example.com', role: 'Admin', avatar: '/avatars/03.png' },
];

const WebhookPreparer = () => {
    const [isSending, setIsSending] = useState(false);
    const { toast } = useToast();

    const handleSendTestWebhook = async () => {
        setIsSending(true);
        const webhookUrl = 'https://hook.us2.make.com/mqif1rouo1wh762k2eze1y7568gwq6kx';

        // This object contains every field from the form schema to ensure Make.com can see them all.
        const samplePayload = {
            memberFirstName: 'John',
            memberLastName: 'Doe',
            memberDob: Timestamp.fromDate(new Date('1965-01-15')).toDate(),
            memberAge: 59,
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
            bestContactType: 'other',
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
            repName: 'Legal Representative',
            repRelationship: 'Lawyer',
            repPhone: '(555) 777-8888',
            repEmail: 'legal@rep.com',
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
            </CardContent>
        </Card>
    );
};


export default function SuperAdminPage() {
    const [staff, setStaff] = useState(initialStaff);
    const [newStaffEmail, setNewStaffEmail] = useState('');

    const handleAddStaff = () => {
        if (newStaffEmail && !staff.find(s => s.email === newStaffEmail)) {
            const newStaffMember = {
                id: `staff-${Date.now()}`,
                name: newStaffEmail.split('@')[0] || 'New Staff', // simple name from email
                email: newStaffEmail,
                role: 'Admin',
                avatar: `/avatars/0${(staff.length % 5) + 1}.png` // Cycle through placeholder avatars
            };
            setStaff([...staff, newStaffMember]);
            setNewStaffEmail('');
        }
    };
    
    const handleRemoveStaff = (id: string) => {
        setStaff(staff.filter(s => s.id !== id));
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
                <div className="space-y-2">
                    <Label htmlFor="add-staff-email">Invite New Staff by Email</Label>
                    <div className="flex gap-2">
                        <Input 
                            id="add-staff-email" 
                            type="email" 
                            placeholder="new.staff@example.com"
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                        />
                        <Button onClick={handleAddStaff}>
                            <UserPlus className="mr-2 h-4 w-4" /> Add
                        </Button>
                    </div>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">Current Staff</h3>
                    {staff.map(member => (
                        <div key={member.id} className="flex items-center justify-between">
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
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveStaff(member.id)}
                                disabled={member.role === 'Super Admin'}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
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
                        {/* In a real app, this would be a multi-select component */}
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
