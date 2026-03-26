'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bell, FileText, Loader2, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CreateApplicationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  
  const [isCreating, setIsCreating] = useState(false);
  const [intakeType, setIntakeType] = useState<'standard' | 'kaiser_auth_received_via_ils'>('standard');
  const [kaiserStaffList, setKaiserStaffList] = useState<Array<{ uid: string; displayName: string }>>([]);
  const [isLoadingKaiserStaff, setIsLoadingKaiserStaff] = useState(false);
  const [selectedAssignedStaffId, setSelectedAssignedStaffId] = useState('');
  const [selectedAssignedStaffName, setSelectedAssignedStaffName] = useState('');
  const [selectedStaffActionItemCount, setSelectedStaffActionItemCount] = useState(0);
  const [eligibilityScreenshotFiles, setEligibilityScreenshotFiles] = useState<File[]>([]);
  const [memberData, setMemberData] = useState({
    memberFirstName: '',
    memberLastName: '',
    memberMrn: '',
    memberPhone: '',
    memberCustomaryLocation: '',
    Authorization_Number_T038: '',
    Authorization_Start_T2038: '',
    Authorization_End_T2038: '',
    Diagnostic_Code: '',
    contactFirstName: '',
    contactLastName: '',
    contactPhone: '',
    contactEmail: '',
    contactRelationship: '',
    notes: ''
  });

  useEffect(() => {
    const loadKaiserStaff = async () => {
      if (!firestore || intakeType !== 'kaiser_auth_received_via_ils') return;
      setIsLoadingKaiserStaff(true);
      try {
        const snap = await getDocs(query(collection(firestore, 'users'), where('isKaiserStaff', '==', true)));
        const staff = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const firstName = String(data?.firstName || '').trim();
            const lastName = String(data?.lastName || '').trim();
            const email = String(data?.email || '').trim();
            const displayName = `${firstName} ${lastName}`.trim() || email || d.id;
            return { uid: d.id, displayName };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setKaiserStaffList(staff);
      } catch (error) {
        console.error('Failed to load Kaiser staff list:', error);
      } finally {
        setIsLoadingKaiserStaff(false);
      }
    };
    void loadKaiserStaff();
  }, [firestore, intakeType]);

  useEffect(() => {
    const loadActionItemCount = async () => {
      if (!firestore || !selectedAssignedStaffId) {
        setSelectedStaffActionItemCount(0);
        return;
      }
      try {
        const snap = await getDocs(query(collection(firestore, 'staff_notifications'), where('userId', '==', selectedAssignedStaffId)));
        const count = snap.docs.filter((d) => {
          const n = d.data() as any;
          const status = String(n?.status || '').trim().toLowerCase();
          const requiresAction = Boolean(n?.requiresStaffAction);
          return requiresAction && (status === 'open' || status === '');
        }).length;
        setSelectedStaffActionItemCount(count);
      } catch (error) {
        console.warn('Could not load staff action item count:', error);
        setSelectedStaffActionItemCount(0);
      }
    };
    void loadActionItemCount();
  }, [firestore, selectedAssignedStaffId]);

  const uploadEligibilityFiles = async (applicationId: string) => {
    if (!storage || eligibilityScreenshotFiles.length === 0) return [];
    const uploads = eligibilityScreenshotFiles.map((file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `applications/${applicationId}/eligibility-screenshots/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      return new Promise<{ fileName: string; filePath: string; downloadURL: string }>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          undefined,
          reject,
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({ fileName: file.name, filePath: storagePath, downloadURL });
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    });
    return Promise.all(uploads);
  };

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

  const formatMemberPhoneWithDashes = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');
    const limitedPhoneNumber = phoneNumber.substring(0, 10);
    if (limitedPhoneNumber.length >= 6) {
      return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3, 6)}-${limitedPhoneNumber.substring(6)}`;
    } else if (limitedPhoneNumber.length >= 3) {
      return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3)}`;
    }
    return limitedPhoneNumber;
  };

  const createApplicationForMember = async () => {
    const isKaiserAuthReceived = intakeType === 'kaiser_auth_received_via_ils';
    const hasStandardRequired = memberData.contactPhone && memberData.contactFirstName && memberData.contactLastName;
    const hasKaiserRequired = selectedAssignedStaffId;

    if (
      !firestore ||
      !memberData.memberFirstName ||
      !memberData.memberLastName ||
      (!isKaiserAuthReceived && !hasStandardRequired) ||
      (isKaiserAuthReceived && !hasKaiserRequired)
    ) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields for this intake type.",
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
      const baseApplication: Record<string, unknown> = {
        // Member information
        memberFirstName: memberData.memberFirstName,
        memberLastName: memberData.memberLastName,
        ...(isKaiserAuthReceived
          ? {
              memberMrn: memberData.memberMrn || '',
              memberPhone: memberData.memberPhone || '',
              Authorization_Number_T038: memberData.Authorization_Number_T038 || '',
              Authorization_Start_T2038: memberData.Authorization_Start_T2038 || '',
              Authorization_End_T2038: memberData.Authorization_End_T2038 || '',
              Diagnostic_Code: memberData.Diagnostic_Code || '',
              customaryLocationType: memberData.memberCustomaryLocation || '',
              currentLocation: 'Unknown',
              currentAddress: 'Unknown',
              currentCity: 'Unknown',
              currentState: 'Unknown',
              currentZip: 'Unknown',
              currentCounty: 'Unknown',
              customaryAddress: memberData.memberCustomaryLocation || '',
              customaryCity: 'Unknown',
              customaryState: 'Unknown',
              customaryZip: 'Unknown',
              customaryCounty: 'Unknown',
            }
          : {}),

        // Contact/Referrer information (person helping with application)
        referrerFirstName: memberData.contactFirstName || '',
        referrerLastName: memberData.contactLastName || '',
        referrerPhone: memberData.contactPhone || memberData.memberPhone || '',
        referrerRelationship: memberData.contactRelationship || '',

        // Best contact defaults to same as referrer for admin-created applications
        bestContactFirstName: memberData.contactFirstName || '',
        bestContactLastName: memberData.contactLastName || '',
        bestContactPhone: memberData.contactPhone || memberData.memberPhone || '',
        bestContactRelationship: memberData.contactRelationship || '',
        bestContactEmail: memberData.contactEmail || '',

        intakeType,
        kaiserAuthReceivedViaIls: isKaiserAuthReceived,
        kaiserAuthReceivedDate: isKaiserAuthReceived ? serverTimestamp() : null,

        // Application metadata
        createdAt: serverTimestamp(),
        createdByAdmin: true,
        status: isKaiserAuthReceived ? 'Authorization Received (Doc Collection)' : 'draft',
        currentStep: 1,
        adminNotes: memberData.notes,

        // Mark as incomplete - will be completed through the form
        isComplete: false,
      };

      const authReceivedForms = [
        { name: 'CS Member Summary', status: 'Pending', type: 'online-form', href: '/admin/forms/edit' },
        { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '/admin/forms/waivers' },
        { name: 'Eligibility Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' },
        { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'Upload', href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
        { name: 'Medicine List', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Room and Board/Tier Level Agreement', status: 'Pending', type: 'Upload', href: '/forms/room-board-obligation/printable' },
      ];

      await setDoc(applicationRef, {
        ...baseApplication,
        healthPlan: isKaiserAuthReceived ? 'Kaiser' : '',
        pathway: isKaiserAuthReceived ? 'SNF Transition' : '',
        kaiserStatus: isKaiserAuthReceived ? 'Authorization Received (Doc Collection)' : '',
        forms: isKaiserAuthReceived ? authReceivedForms : [],
        ...(isKaiserAuthReceived
          ? {
              assignedStaffId: selectedAssignedStaffId,
              assignedStaffName: selectedAssignedStaffName,
              assignedDate: new Date().toISOString(),
            }
          : {}),
      });

      if (isKaiserAuthReceived && eligibilityScreenshotFiles.length > 0) {
        try {
          const uploadedFiles = await uploadEligibilityFiles(applicationId);
          if (uploadedFiles.length > 0) {
            const completedEligibilityForm = {
              name: 'Eligibility Screenshot',
              status: 'Completed',
              type: 'Upload',
              fileName: uploadedFiles[0].fileName,
              filePath: uploadedFiles[0].filePath,
              downloadURL: uploadedFiles[0].downloadURL,
              uploadedFiles,
              dateCompleted: new Date().toISOString(),
            };
            const updatedForms = authReceivedForms.map((f) =>
              f.name === 'Eligibility Screenshot' ? completedEligibilityForm : f
            );
            await setDoc(applicationRef, { forms: updatedForms, lastUpdated: serverTimestamp() }, { merge: true });
          }
        } catch (error) {
          console.error('Eligibility screenshot upload failed:', error);
          toast({
            variant: 'destructive',
            title: 'Eligibility upload failed',
            description: 'Application was created, but eligibility screenshots failed to upload. You can upload them on the application details page.',
          });
        }
      }

      if (isKaiserAuthReceived && selectedAssignedStaffId) {
        try {
          const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
          const dueDate = new Date();
          dueDate.setHours(17, 0, 0, 0);
          const assignedByName = String(user?.displayName || user?.email || 'Manager').trim();
          await addDoc(collection(firestore, 'staff_notifications'), {
            userId: selectedAssignedStaffId,
            title: `Kaiser assignment: ${memberName}`,
            message: `You were assigned ${memberName} in Application Pathway. Please review and complete the next step.`,
            memberName,
            healthPlan: 'Kaiser',
            type: 'assignment',
            priority: 'Priority',
            status: 'Open',
            isRead: false,
            requiresStaffAction: true,
            followUpRequired: true,
            followUpDate: dueDate.toISOString(),
            senderName: assignedByName,
            assignedByUid: String(user?.uid || '').trim() || null,
            assignedByName,
            actionUrl: `/admin/applications/${applicationId}`,
            applicationId,
            source: 'application-pathway',
            timestamp: serverTimestamp(),
          });
        } catch (error) {
          console.warn('Failed to create initial staff assignment notification:', error);
        }
      }

      toast({
        title: "Application Created",
        description: isKaiserAuthReceived
          ? `Kaiser auth-received intake created for ${memberData.memberFirstName} ${memberData.memberLastName}.`
          : `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
      });

      if (isKaiserAuthReceived) {
        router.push(`/admin/applications/${applicationId}`);
      } else {
        // Redirect to CS Summary form with the application ID
        router.push(`/admin/applications/create/cs-summary?applicationId=${applicationId}`);
      }
      
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
                     memberData.memberLastName && (
                       intakeType === 'kaiser_auth_received_via_ils'
                         ? Boolean(selectedAssignedStaffId)
                         : Boolean(
                             memberData.contactFirstName &&
                             memberData.contactLastName &&
                             memberData.contactPhone &&
                             memberData.contactPhone.replace(/\D/g, '').length === 10
                           )
                     );

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
          <div>
            <Label>Intake Type</Label>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant={intakeType === 'standard' ? 'default' : 'outline'}
                onClick={() => setIntakeType('standard')}
                className="justify-start"
              >
                Standard CS Summary Intake
              </Button>
              <Button
                type="button"
                variant={intakeType === 'kaiser_auth_received_via_ils' ? 'default' : 'outline'}
                onClick={() => setIntakeType('kaiser_auth_received_via_ils')}
                className="justify-start"
              >
                Kaiser Auth Received (via ILS)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Kaiser Auth Received creates an early tracking application with authorization already received and supports staff assignment, task notifications, and optional early Caspio push for client ID tracking.
            </p>
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <p className="text-xs text-muted-foreground mt-1">
                Name-only intake is supported for spreadsheet workflows. You can assign staff now and complete MRN, auth dates, diagnostics, and eligibility uploads later.
              </p>
            )}
          </div>

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
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="md:col-span-2 p-3 border rounded-md bg-muted/30 space-y-3">
                  <div>
                    <Label>Assign Kaiser Staff *</Label>
                    <Select
                      value={selectedAssignedStaffId}
                      onValueChange={(value) => {
                        const selected = kaiserStaffList.find((s) => s.uid === value);
                        setSelectedAssignedStaffId(value);
                        setSelectedAssignedStaffName(selected?.displayName || '');
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={isLoadingKaiserStaff ? 'Loading Kaiser staff...' : 'Select Kaiser staff'} />
                      </SelectTrigger>
                      <SelectContent>
                        {kaiserStaffList.length === 0 ? (
                          <SelectItem value="none" disabled>No Kaiser staff found</SelectItem>
                        ) : (
                          kaiserStaffList.map((staff) => (
                            <SelectItem key={staff.uid} value={staff.uid}>
                              {staff.displayName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedAssignedStaffId && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5" />
                      Current open action items for this staff: <span className="font-semibold">{selectedStaffActionItemCount}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    On create, this assignment is added to the staff member&apos;s Action Items (bell) and daily task calendar.
                  </div>
                </div>
                <div>
                  <Label htmlFor="memberMrn">Member MRN</Label>
                  <Input
                    id="memberMrn"
                    placeholder="Member MRN"
                    value={memberData.memberMrn}
                    onChange={(e) => setMemberData({ ...memberData, memberMrn: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberPhone">Member Phone</Label>
                  <Input
                    id="memberPhone"
                    type="tel"
                    placeholder="555-123-4567"
                    value={memberData.memberPhone}
                    onChange={(e) => {
                      const formattedPhone = formatMemberPhoneWithDashes(e.target.value);
                      setMemberData({ ...memberData, memberPhone: formattedPhone });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryLocation">Member Customary Location</Label>
                  <Input
                    id="memberCustomaryLocation"
                    placeholder="Home, SNF, Assisted Living, Unknown..."
                    value={memberData.memberCustomaryLocation}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryLocation: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_Number_T038">Authorization Number T2038</Label>
                  <Input
                    id="Authorization_Number_T038"
                    placeholder="Optional"
                    value={memberData.Authorization_Number_T038}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_Number_T038: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Diagnostic_Code">Diagnostic Code</Label>
                  <Input
                    id="Diagnostic_Code"
                    placeholder="Enter diagnostic code"
                    value={memberData.Diagnostic_Code}
                    onChange={(e) => setMemberData({ ...memberData, Diagnostic_Code: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_Start_T2038">Authorization Start T2038</Label>
                  <Input
                    id="Authorization_Start_T2038"
                    placeholder="MM/DD/YYYY"
                    value={memberData.Authorization_Start_T2038}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_Start_T2038: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_End_T2038">Authorization_End_T2038</Label>
                  <Input
                    id="Authorization_End_T2038"
                    placeholder="MM/DD/YYYY"
                    value={memberData.Authorization_End_T2038}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_End_T2038: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2 p-3 border rounded-md bg-muted/20">
                  <Label htmlFor="eligibilityScreenshots">Eligibility Check Screenshots (optional, multiple pages)</Label>
                  <Input
                    id="eligibilityScreenshots"
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.pdf"
                    className="mt-2"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setEligibilityScreenshotFiles(files);
                    }}
                  />
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                    <Upload className="h-3.5 w-3.5" />
                    {eligibilityScreenshotFiles.length > 0
                      ? `${eligibilityScreenshotFiles.length} file(s) selected`
                      : 'Upload one or more screenshot pages.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Primary Contact Person</h3>
            <p className="text-sm text-gray-600 mb-3">
              This is the person helping with the application (family member, caregiver, case worker, etc.)
            </p>
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <Alert className="mb-3">
                <AlertDescription>
                  Contact person can be added later. Once available, add contact info so document and status reminders can be sent.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactFirstName">Contact First Name{intakeType === 'standard' ? ' *' : ''}</Label>
                <Input
                  id="contactFirstName"
                  placeholder="Contact person's first name"
                  value={memberData.contactFirstName}
                  onChange={(e) => setMemberData({ ...memberData, contactFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactLastName">Contact Last Name{intakeType === 'standard' ? ' *' : ''}</Label>
                <Input
                  id="contactLastName"
                  placeholder="Contact person's last name"
                  value={memberData.contactLastName}
                  onChange={(e) => setMemberData({ ...memberData, contactLastName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone{intakeType === 'standard' ? ' *' : ''}</Label>
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
                {intakeType === 'kaiser_auth_received_via_ils'
                  ? 'Create Kaiser Skeleton Application'
                  : 'Create Application & Continue to CS Summary Form'}
              </>
            )}
          </Button>

          {!isFormValid && (
            <div className="text-sm text-gray-500 text-center space-y-1">
              <p>Please fill in all required fields (marked with *) for the selected intake type.</p>
              {intakeType === 'standard' && memberData.contactPhone && memberData.contactPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Contact phone number must be 10 digits (xxx.xxx.xxxx)</p>
              )}
              {intakeType === 'kaiser_auth_received_via_ils' && memberData.memberPhone && memberData.memberPhone.replace(/\D/g, '').length > 0 && memberData.memberPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Member phone number must be 10 digits (xxx.xxx.xxxx)</p>
              )}
              {intakeType === 'kaiser_auth_received_via_ils' && !selectedAssignedStaffId && (
                <p className="text-red-500">Please assign Kaiser staff.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}