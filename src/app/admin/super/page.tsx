
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trash2, UserPlus, Send } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// Mock data - in a real app, this would come from Firestore
const initialStaff = [
  { id: '1', name: 'Jason Bloome', email: 'jason@carehomefinders.com', role: 'Super Admin', avatar: '/avatars/01.png' },
  { id: '2', name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', avatar: '/avatars/02.png' },
  { id: '3', name: 'Bob Williams', email: 'bob@example.com', role: 'Admin', avatar: '/avatars/03.png' },
];

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
      </div>

    </div>
  );
}
