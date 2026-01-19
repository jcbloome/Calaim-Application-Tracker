'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, FileText, Loader2, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function CreateApplicationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [isCreating, setIsCreating] = useState(false);
  const [memberData, setMemberData] = useState({
    memberFirstName: '',
    memberLastName: '',
    contactFirstName: '',
    contactLastName: '',
    contactPhone: '',
    contactEmail: '',
    contactRelationship: '',
    notes: ''
  });

  // Phone number formatting function
  const formatPhoneNumber = (value: string) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limitedPhoneNumber = phoneNumber.substring(0, 10);
    
    // Format as xxx.xxx.xxxx
    if (limitedPhoneNumber.length >= 6) {
      return `${limitedPhoneNumber.substring(0, 3)}.${limitedPhoneNumber.substring(3, 6)}.${limitedPhoneNumber.substring(6)}`;
    } else if (limitedPhoneNumber.length >= 3) {
      return `${limitedPhoneNumber.substring(0, 3)}.${limitedPhoneNumber.substring(3)}`;
    } else {
      return limitedPhoneNumber;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhone = formatPhoneNumber(e.target.value);
    setMemberData({ ...memberData, contactPhone: formattedPhone });
  };

  const createApplicationForMember = async () => {
    if (!firestore || !memberData.memberFirstName || !memberData.memberLastName || !memberData.contactFirstName || !memberData.contactLastName || !memberData.contactPhone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create a unique application ID for this member
      const applicationId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const applicationRef = doc(firestore, 'applications', applicationId);
      
      // Create the application document with initial member and contact information
      await setDoc(applicationRef, {
        // Member information
        memberFirstName: memberData.memberFirstName,
        memberLastName: memberData.memberLastName,
        
        // Contact/Referrer information (person helping with application)
        referrerFirstName: memberData.contactFirstName,
        referrerLastName: memberData.contactLastName,
        referrerPhone: memberData.contactPhone,
        referrerRelationship: memberData.contactRelationship,
        
        // Best contact defaults to same as referrer for admin-created applications
        bestContactFirstName: memberData.contactFirstName,
        bestContactLastName: memberData.contactLastName,
        bestContactPhone: memberData.contactPhone,
        bestContactRelationship: memberData.contactRelationship,
        bestContactEmail: memberData.contactEmail || '',
        
        // Application metadata
        createdAt: serverTimestamp(),
        createdByAdmin: true,
        status: 'draft',
        currentStep: 1,
        adminNotes: memberData.notes,
        
        // Mark as incomplete - will be completed through the form
        isComplete: false,
      });

      toast({
        title: "Application Created",
        description: `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
      });

      // Redirect to CS Summary form with the application ID
      router.push(`/admin/applications/create/cs-summary?applicationId=${applicationId}`);
      
    } catch (error) {
      console.error('Error creating application:', error);
      toast({
        title: "Creation Error",
        description: "Failed to create application. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const isFormValid = memberData.memberFirstName && 
                     memberData.memberLastName && 
                     memberData.contactFirstName && 
                     memberData.contactLastName && 
                     memberData.contactPhone && 
                     memberData.contactPhone.replace(/\D/g, '').length === 10;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href="/admin/applications">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create Application for Member</h1>
        <p className="text-gray-600 mt-2">
          Create a CS Summary application on behalf of a member/family. This is for families who need assistance completing their application or don't have email access.
        </p>
      </div>

      {/* Information Alert */}
      <Alert className="mb-6">
        <Users className="h-4 w-4" />
        <AlertDescription>
          <strong>Admin Application Creation:</strong> Use this form when families request help completing their CalAIM application. 
          You'll provide basic member and contact information, then complete the full CS Summary form on their behalf.
        </AlertDescription>
      </Alert>

      {/* Member & Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Member & Contact Information
          </CardTitle>
          <CardDescription>
            Provide basic information about the member and the primary contact person (family member, caregiver, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Member Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Member Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="memberFirstName">Member First Name *</Label>
                <Input
                  id="memberFirstName"
                  placeholder="Member's first name"
                  value={memberData.memberFirstName}
                  onChange={(e) => setMemberData({ ...memberData, memberFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="memberLastName">Member Last Name *</Label>
                <Input
                  id="memberLastName"
                  placeholder="Member's last name"
                  value={memberData.memberLastName}
                  onChange={(e) => setMemberData({ ...memberData, memberLastName: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Primary Contact Person</h3>
            <p className="text-sm text-gray-600 mb-3">
              This is the person helping with the application (family member, caregiver, case worker, etc.)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactFirstName">Contact First Name *</Label>
                <Input
                  id="contactFirstName"
                  placeholder="Contact person's first name"
                  value={memberData.contactFirstName}
                  onChange={(e) => setMemberData({ ...memberData, contactFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactLastName">Contact Last Name *</Label>
                <Input
                  id="contactLastName"
                  placeholder="Contact person's last name"
                  value={memberData.contactLastName}
                  onChange={(e) => setMemberData({ ...memberData, contactLastName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone *</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  placeholder="555.123.4567"
                  value={memberData.contactPhone}
                  onChange={handlePhoneChange}
                />
              </div>
              <div>
                <Label htmlFor="contactRelationship">Relationship to Member</Label>
                <Input
                  id="contactRelationship"
                  placeholder="e.g., Daughter, Son, Case Manager"
                  value={memberData.contactRelationship}
                  onChange={(e) => setMemberData({ ...memberData, contactRelationship: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  placeholder="contact@example.com (leave blank if no email)"
                  value={memberData.contactEmail}
                  onChange={(e) => setMemberData({ ...memberData, contactEmail: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Admin Notes */}
          <div>
            <Label htmlFor="notes">Admin Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about this application or special circumstances..."
              value={memberData.notes}
              onChange={(e) => setMemberData({ ...memberData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <Button 
            onClick={createApplicationForMember}
            disabled={isCreating || !isFormValid}
            className="w-full"
            size="lg"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Application...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Create Application & Continue to CS Summary Form
              </>
            )}
          </Button>

          {!isFormValid && (
            <div className="text-sm text-gray-500 text-center space-y-1">
              <p>Please fill in all required fields (marked with *) to continue</p>
              {memberData.contactPhone && memberData.contactPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Phone number must be 10 digits (xxx.xxx.xxxx)</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}