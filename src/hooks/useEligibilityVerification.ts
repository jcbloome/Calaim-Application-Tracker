'use client';

import { useState, useCallback } from 'react';
import { EligibilityData } from '@/components/admin/EligibilityVerificationCard';

interface UseEligibilityVerificationProps {
  initialData?: EligibilityData;
  onUpdate?: (data: EligibilityData) => void;
}

export function useEligibilityVerification({
  initialData,
  onUpdate
}: UseEligibilityVerificationProps = {}) {
  const [eligibilityData, setEligibilityData] = useState<EligibilityData | null>(
    initialData || null
  );
  const [isLoading, setIsLoading] = useState(false);

  const updateEligibility = useCallback((data: EligibilityData) => {
    setEligibilityData(data);
    if (onUpdate) {
      onUpdate(data);
    }
  }, [onUpdate]);

  const saveEligibilityVerification = useCallback(async (data: EligibilityData) => {
    setIsLoading(true);
    
    try {
      // This would typically save to your backend/Firestore
      // For now, we'll simulate the save operation
      
      const response = await fetch('/api/admin/eligibility-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save eligibility verification');
      }

      const result = await response.json();
      
      // Update local state with saved data
      const savedData = { ...data, id: result.id || data.id };
      setEligibilityData(savedData);
      
      if (onUpdate) {
        onUpdate(savedData);
      }

      return savedData;
      
    } catch (error) {
      console.error('Error saving eligibility verification:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onUpdate]);

  const isEligibilityComplete = useCallback((data?: EligibilityData) => {
    const checkData = data || eligibilityData;
    return checkData && 
           checkData.eligibilityStatus && 
           checkData.eligibilityStatus !== 'pending' && 
           checkData.eligibilityMessage && 
           checkData.eligibilityMessage.trim().length > 0;
  }, [eligibilityData]);

  const getEligibilityRequirement = useCallback(() => {
    if (!eligibilityData) {
      return {
        isRequired: true,
        message: 'Eligibility verification is required to complete this pathway',
        canProceed: false
      };
    }

    if (!isEligibilityComplete()) {
      return {
        isRequired: true,
        message: 'Please complete eligibility verification before proceeding',
        canProceed: false
      };
    }

    return {
      isRequired: false,
      message: `Eligibility verified: ${eligibilityData.eligibilityStatus}`,
      canProceed: true
    };
  }, [eligibilityData, isEligibilityComplete]);

  return {
    eligibilityData,
    isLoading,
    updateEligibility,
    saveEligibilityVerification,
    isEligibilityComplete: isEligibilityComplete(),
    eligibilityRequirement: getEligibilityRequirement(),
    setEligibilityData
  };
}

export default useEligibilityVerification;