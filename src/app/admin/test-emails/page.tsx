'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, TestTube, Send } from 'lucide-react';
import { getAllStaff } from '@/lib/staff-directory';

export default function TestEmailsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const { toast } = useToast();
  
  const staffMembers = getAllStaff();

  const testPasswordReset = async () => {
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter an email address to test password reset',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/test-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'password-reset',
          email: email,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Test Email Sent!',
          description: `Password reset test email sent to ${email}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        throw new Error(data.message || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Test email error:', error);
      toast({
        variant: 'destructive',
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to send test email',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testStaffAssignment = async () => {
    if (!email || !selectedStaff) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please enter an email address and select a staff member',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/test-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'staff-assignment',
          email: email,
          testData: {
            staffName: selectedStaff,
            memberName: 'John Test Member',
            memberMrn: 'TEST123456',
            memberCounty: 'Los Angeles',
            kaiserStatus: 'T2038 Requested',
            calaimStatus: 'Pending',
            assignedBy: 'System Administrator (Test)',
            nextStepsDate: new Date().toLocaleDateString(),
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Test Email Sent!',
          description: `Staff assignment test email sent to ${email}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        throw new Error(data.message || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Test email error:', error);
      toast({
        variant: 'destructive',
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to send test email',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testRealPasswordReset = async () => {
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter an email address',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Real Password Reset Sent!',
          description: `Real password reset email sent to ${email}`,
          className: 'bg-blue-100 text-blue-900 border-blue-200',
        });
      } else {
        throw new Error(data.error || 'Failed to send password reset email');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      toast({
        variant: 'destructive',
        title: 'Password Reset Failed',
        description: error instanceof Error ? error.message : 'Failed to send password reset email',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email System Testing</h1>
        <p className="text-muted-foreground">
          Test password reset and staff assignment emails
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Password Reset Testing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Password Reset Email Test
            </CardTitle>
            <CardDescription>
              Test the custom branded password reset email system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="test@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={testPasswordReset}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Send Test Password Reset
              </Button>
              
              <Button 
                onClick={testRealPasswordReset}
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Real Password Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Staff Assignment Testing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-purple-600" />
              Staff Assignment Email Test
            </CardTitle>
            <CardDescription>
              Test the staff assignment notification email system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-select">Staff Member</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.map((staff) => (
                    <SelectItem key={staff.name} value={staff.name}>
                      {staff.name} ({staff.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={testStaffAssignment}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Send Test Staff Assignment
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Environment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5 text-green-600" />
            Environment Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>App URL:</strong> {process.env.NEXT_PUBLIC_APP_URL || 'Not set'}
            </div>
            <div>
              <strong>Staff Members:</strong> {staffMembers.length}
            </div>
          </div>
          
          <div className="mt-4">
            <strong>Staff Directory:</strong>
            <ul className="mt-2 space-y-1 text-sm">
              {staffMembers.map((staff) => (
                <li key={staff.name} className="flex justify-between">
                  <span>{staff.name}</span>
                  <span className="text-muted-foreground">{staff.email}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}