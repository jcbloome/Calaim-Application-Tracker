'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSubmittingStaffIdentity } from './member-data-helpers';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { type User } from 'firebase/auth';
import { type Dispatch, type SetStateAction, type ChangeEvent } from 'react';

export interface PrimaryContactSectionProps {
  intakeType: "standard" | "kaiser_auth_received_via_ils";
  user: User | null;
  memberData: { memberFirstName: string; memberLastName: string; memberMrn: string; memberMediCalNum: string; confirmMemberMediCalNum: string; memberSex: string; parsedSourceType: string; createServiceDeliveryFormPdf: boolean; memberDob: string; memberPhone: string; memberEmail: string; memberCustomaryLocation: string; memberCustomaryAddress: string; memberCustomaryCity: string; memberCustomaryState: string; memberCustomaryZip: string; memberCustomaryCounty: string; Authorization_Number_T038: string; Authorization_Start_T2038: string; Authorization_End_T2038: string; Diagnostic_Code: string; kaiserStatus: string; contactFirstName: string; contactLastName: string; contactPhone: string; contactEmail: string; careManagerName: string; careManagerPhone: string; careManagerEmail: string; contactRelationship: string; eligibilityCheckStatus: string; notes: string; };
  setMemberData: Dispatch<SetStateAction<{ memberFirstName: string; memberLastName: string; memberMrn: string; memberMediCalNum: string; confirmMemberMediCalNum: string; memberSex: string; parsedSourceType: string; createServiceDeliveryFormPdf: boolean; memberDob: string; memberPhone: string; memberEmail: string; memberCustomaryLocation: string; memberCustomaryAddress: string; memberCustomaryCity: string; memberCustomaryState: string; memberCustomaryZip: string; memberCustomaryCounty: string; Authorization_Number_T038: string; Authorization_Start_T2038: string; Authorization_End_T2038: string; Diagnostic_Code: string; kaiserStatus: string; contactFirstName: string; contactLastName: string; contactPhone: string; contactEmail: string; careManagerName: string; careManagerPhone: string; careManagerEmail: string; contactRelationship: string; eligibilityCheckStatus: string; notes: string; }>>;
  handlePhoneChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function PrimaryContactSection({
  intakeType,
  user,
  memberData,
  setMemberData,
  handlePhoneChange,
}: PrimaryContactSectionProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Primary Contact Person</h3>
      <p className="text-sm text-gray-600 mb-3">
        This is who receives missing-document requests and status outreach (family member, caregiver, case worker, etc.).
      </p>
      <Alert className="mb-3">
        <AlertDescription>
          {intakeType === 'kaiser_auth_received_via_ils'
            ? 'Submitting staff is tracked automatically for this draft. For Kaiser auth upload, primary contact can be entered after eligibility review in CS Summary.'
            : 'Submitting staff is tracked automatically for this draft. Primary contact is separate and required before draft creation.'}
        </AlertDescription>
      </Alert>
      <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {(() => {
          const submittingStaff = getSubmittingStaffIdentity(user);
          return `Submitting staff: ${submittingStaff.name}${submittingStaff.email ? ` (${submittingStaff.email})` : ''}`;
        })()}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contactFirstName">Contact First Name {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
          <Input
            id="contactFirstName"
            value={memberData.contactFirstName || ''}
            onChange={(e) => setMemberData({ ...memberData, contactFirstName: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="contactLastName">Contact Last Name {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
          <Input
            id="contactLastName"
            value={memberData.contactLastName || ''}
            onChange={(e) => setMemberData({ ...memberData, contactLastName: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="contactPhone">Contact Phone {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
          <Input
            id="contactPhone"
            type="text"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={12}
            placeholder="xxx-xxx-xxxx"
            value={memberData.contactPhone || ''}
            onChange={handlePhoneChange}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Tip: Use xxx-xxx-xxxx format (you can type with or without dashes).
          </p>
        </div>
        <div>
          <Label htmlFor="contactRelationship">Relationship to Member</Label>
          <Input
            id="contactRelationship"
            value={memberData.contactRelationship || ''}
            onChange={(e) => setMemberData({ ...memberData, contactRelationship: e.target.value })}
            placeholder="e.g. Daughter, Son, Spouse, POA (leave blank if unknown)"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Type the relationship in words. Coded values from MIF (like 1 or 4) are cleared automatically.
          </p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="contactEmail">Contact Email {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
          <Input
            id="contactEmail"
            type="text"
            inputMode="email"
            value={memberData.contactEmail || ''}
            onChange={(e) => setMemberData({ ...memberData, contactEmail: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">If no email exists, enter &quot;N/A&quot; so follow-up staff can update it later.</p>
        </div>
      </div>
    </div>
  );
}
