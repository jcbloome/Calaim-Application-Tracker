import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface SocialWorkerData {
  uid: string;
  email: string;
  displayName: string;
  role: 'social_worker';
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  lastLogin?: Date;
  assignedMembers?: string[];
  assignedRCFEs?: string[];
  permissions: {
    visitVerification: boolean;
    memberQuestionnaire: boolean;
    claimsSubmission: boolean;
  };
  notes?: string;
}

export function useSocialWorker() {
  const [user, loading, error] = useAuthState(auth);
  const firestore = useFirestore();
  const [socialWorkerData, setSocialWorkerData] = useState<SocialWorkerData | null>(null);
  const [isSocialWorker, setIsSocialWorker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSocialWorkerStatus = async () => {
      if (loading || !firestore) return;
      
      if (!user) {
        setIsSocialWorker(false);
        setSocialWorkerData(null);
        setIsLoading(false);
        return;
      }

      try {
        // Check if user exists in social workers collection
        const socialWorkerDoc = await getDoc(doc(firestore, 'socialWorkers', user.uid));
        
        if (socialWorkerDoc.exists()) {
          const data = socialWorkerDoc.data() as SocialWorkerData;
          
          // Check if account is active
          if (data.isActive) {
            setSocialWorkerData({
              ...data,
              uid: user.uid,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
              lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined
            });
            setIsSocialWorker(true);
            
            // Update last login timestamp
            try {
              await updateDoc(doc(firestore, 'socialWorkers', user.uid), {
                lastLogin: serverTimestamp()
              });
            } catch (loginUpdateError) {
              console.warn('Failed to update last login:', loginUpdateError);
            }
          } else {
            // Account exists but is inactive
            setIsSocialWorker(false);
            setSocialWorkerData(null);
            console.warn('Social worker account is inactive');
          }
        } else {
          setIsSocialWorker(false);
          setSocialWorkerData(null);
        }
      } catch (error) {
        console.error('Error checking social worker status:', error);
        setIsSocialWorker(false);
        setSocialWorkerData(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSocialWorkerStatus();
  }, [user, loading, firestore]);

  // Helper functions to check specific permissions
  const hasPermission = (permission: keyof SocialWorkerData['permissions']): boolean => {
    return socialWorkerData?.permissions?.[permission] || false;
  };

  const canAccessVisitVerification = (): boolean => {
    return hasPermission('visitVerification');
  };

  const canAccessMemberQuestionnaire = (): boolean => {
    return hasPermission('memberQuestionnaire');
  };

  const canSubmitClaims = (): boolean => {
    return hasPermission('claimsSubmission');
  };

  return {
    user: socialWorkerData || user,
    isSocialWorker,
    socialWorkerData,
    isLoading: loading || isLoading,
    error,
    // Permission helpers
    hasPermission,
    canAccessVisitVerification,
    canAccessMemberQuestionnaire,
    canSubmitClaims
  };
}