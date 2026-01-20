# Eligibility Verification Integration Guide

## How to Add Eligibility Verification to ANY Admin Pathway

### 1. Import the Components

```tsx
import { PathwayEligibilityIntegration } from '@/components/admin/PathwayEligibilityIntegration';
import { EligibilityData } from '@/components/admin/EligibilityVerificationCard';
```

### 2. Add to Your Pathway Component

```tsx
// Example: Kaiser Tracker Page Integration
export default function KaiserTrackerPage() {
  const [selectedMember, setSelectedMember] = useState<KaiserMember | null>(null);
  
  const handleEligibilityUpdate = (eligibilityData: EligibilityData) => {
    // Handle eligibility update - could update member status, etc.
    console.log('Eligibility updated:', eligibilityData);
    
    // Example: Update member's CalAIM_Status based on eligibility
    if (selectedMember && eligibilityData.eligibilityStatus === 'eligible') {
      // Update member status or trigger next workflow step
      updateMemberStatus(selectedMember.id, 'Eligible - Ready for Next Step');
    }
  };

  return (
    <div>
      {/* Your existing pathway content */}
      
      {selectedMember && (
        <div className="space-y-6">
          {/* REQUIRED: Add Eligibility Verification Card */}
          <PathwayEligibilityIntegration
            memberData={{
              id: selectedMember.id,
              memberFirstName: selectedMember.memberFirstName,
              memberLastName: selectedMember.memberLastName,
              memberMrn: selectedMember.memberMrn,
              healthPlan: 'Kaiser', // or 'Health Net'
              pathway: selectedMember.pathway
            }}
            onEligibilityUpdate={handleEligibilityUpdate}
            showRequirementAlert={true}
          />
          
          {/* Your existing member details, workflow steps, etc. */}
        </div>
      )}
    </div>
  );
}
```

### 3. Integration Points for Different Pathways

#### Kaiser Tracker (`/admin/kaiser-tracker`)
- Add after member selection
- Before workflow progression buttons
- Update Kaiser_Status based on eligibility

#### Applications (`/admin/applications/[id]`)
- Add in the requirements section
- Before "Complete Application" button
- Prevent completion without eligibility verification

#### Progress Tracker (`/admin/progress-tracker`)
- Add in member details panel
- Before status update actions
- Show eligibility status in progress timeline

#### My Tasks (`/admin/my-tasks`)
- Add when viewing task details
- Before marking tasks complete
- Include eligibility status in task completion

### 4. Workflow Integration Examples

#### Prevent Progression Without Eligibility
```tsx
const canProgressWorkflow = (member: Member, eligibilityData?: EligibilityData) => {
  if (!eligibilityData || eligibilityData.eligibilityStatus !== 'eligible') {
    return {
      canProceed: false,
      message: 'Eligibility verification required before proceeding'
    };
  }
  
  return {
    canProceed: true,
    message: 'Ready to proceed'
  };
};
```

#### Auto-Update Status Based on Eligibility
```tsx
const handleEligibilityUpdate = async (eligibilityData: EligibilityData) => {
  if (eligibilityData.eligibilityStatus === 'eligible') {
    // Auto-advance to next workflow step
    await updateMemberWorkflowStep(memberId, 'Eligible - Documentation Collection');
  } else if (eligibilityData.eligibilityStatus === 'not-eligible') {
    // Move to not-eligible pathway
    await updateMemberWorkflowStep(memberId, 'Not Eligible - Case Closed');
  }
};
```

### 5. Required Props for PathwayEligibilityIntegration

```tsx
interface RequiredMemberData {
  id?: string;                    // Optional: for existing members
  memberFirstName: string;        // Required
  memberLastName: string;         // Required  
  memberMrn: string;             // Required: Medical Record Number
  healthPlan?: 'Kaiser' | 'Health Net'; // Optional: will be inferred from pathway
  pathway?: string;              // Optional: helps determine health plan
}
```

### 6. Styling and Placement

```tsx
{/* Place BEFORE workflow actions */}
<PathwayEligibilityIntegration
  memberData={memberData}
  onEligibilityUpdate={handleEligibilityUpdate}
  showRequirementAlert={true}
  className="mb-6" // Add spacing
/>

{/* Your workflow buttons/actions come AFTER */}
<div className="flex gap-2">
  <Button 
    onClick={handleNextStep}
    disabled={!isEligibilityComplete}
  >
    Proceed to Next Step
  </Button>
</div>
```

### 7. Complete Integration Checklist

For EVERY admin pathway, ensure:

- [ ] Import `PathwayEligibilityIntegration` component
- [ ] Add component before workflow progression buttons
- [ ] Pass correct member data (name, MRN, health plan)
- [ ] Handle `onEligibilityUpdate` callback
- [ ] Prevent workflow progression without eligibility verification
- [ ] Show requirement alerts when eligibility is missing
- [ ] Update member status based on eligibility results
- [ ] Include eligibility status in completion criteria

### 8. Backend Integration

The eligibility verification automatically:
- Saves to Firestore (`eligibilityVerifications` collection)
- Uploads screenshots to Firebase Storage
- Tracks verification history
- Provides audit trail for compliance

### 9. HIPAA Compliance Notes

- Screenshots are stored securely in Firebase Storage
- Only admin users can view eligibility verifications
- No screenshots are sent to end users via email
- All eligibility data is encrypted and access-controlled
- Audit trail maintained for all verifications

This ensures consistent eligibility verification across ALL pathways while maintaining security and compliance standards.