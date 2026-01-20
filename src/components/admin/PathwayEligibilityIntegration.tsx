'use client';

import React from 'react';
import { EligibilityVerificationCard, EligibilityData } from './EligibilityVerificationCard';
import { useEligibilityVerification } from '@/hooks/useEligibilityVerification';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface PathwayEligibilityIntegrationProps {
  memberData: {
    id?: string;
    memberFirstName: string;
    memberLastName: string;
    memberMrn: string;
    healthPlan?: 'Kaiser' | 'Health Net';
    pathway?: string;
  };
  onEligibilityUpdate?: (data: EligibilityData) => void;
  showRequirementAlert?: boolean;
  className?: string;
}

export function PathwayEligibilityIntegration({
  memberData,
  onEligibilityUpdate,
  showRequirementAlert = true,
  className = ''
}: PathwayEligibilityIntegrationProps) {
  
  // Determine health plan from pathway or member data
  const healthPlan = memberData.healthPlan || 
    (memberData.pathway?.toLowerCase().includes('kaiser') ? 'Kaiser' : 'Health Net') as 'Kaiser' | 'Health Net';

  const eligibilityData: EligibilityData = {
    id: memberData.id,
    memberName: `${memberData.memberFirstName} ${memberData.memberLastName}`,
    memberMrn: memberData.memberMrn,
    healthPlan: healthPlan
  };

  const {
    eligibilityData: currentEligibility,
    isLoading,
    updateEligibility,
    saveEligibilityVerification,
    isEligibilityComplete,
    eligibilityRequirement
  } = useEligibilityVerification({
    initialData: eligibilityData,
    onUpdate: onEligibilityUpdate
  });

  const handleEligibilityUpdate = (data: EligibilityData) => {
    updateEligibility(data);
  };

  const handleSave = async (data: EligibilityData) => {
    await saveEligibilityVerification(data);
  };

  return (
    <div className={className}>
      {/* Requirement Alert */}
      {showRequirementAlert && !isEligibilityComplete && (
        <Alert className="mb-4 border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-yellow-800">
            <strong>Eligibility Verification Required:</strong> {eligibilityRequirement.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {showRequirementAlert && isEligibilityComplete && (
        <Alert className="mb-4 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription className="text-green-800">
            <strong>Eligibility Verified:</strong> {eligibilityRequirement.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Eligibility Verification Card */}
      <EligibilityVerificationCard
        memberData={currentEligibility || eligibilityData}
        onEligibilityUpdate={handleEligibilityUpdate}
        onSave={handleSave}
        showTitle={true}
        className="mb-6"
      />
    </div>
  );
}

export default PathwayEligibilityIntegration;