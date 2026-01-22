import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, firestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface SocialWorkerData {
  uid: string;
  email: string;
  displayName: string;
  role: 'social_worker';
  assignedMembers?: string[];
  assignedRCFEs?: string[];
  permissions: {
    visitVerification: boolean;
    memberQuestionnaire: boolean;
  };
}

export function useSocialWorker() {
  const [user, loading, error] = useAuthState(auth);
  const [socialWorkerData, setSocialWorkerData] = useState<SocialWorkerData | null>(null);
  const [isSocialWorker, setIsSocialWorker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSocialWorkerStatus = async () => {
      if (loading) return;
      
      if (!user) {
        setIsSocialWorker(false);
        setSocialWorkerData(null);
        setIsLoading(false);
        return;
      }

      try {
        // For testing purposes, let's bypass the Firestore check and use mock data
        // Check if user exists in social workers collection
        // const socialWorkerDoc = await getDoc(doc(firestore, 'socialWorkers', user.uid));
        
        // if (socialWorkerDoc.exists()) {
        //   const data = socialWorkerDoc.data() as SocialWorkerData;
        //   setSocialWorkerData(data);
        //   setIsSocialWorker(true);
        // } else {
        // For testing purposes, assume current user is Billy Buckhalter
        const mockData: SocialWorkerData = {
          uid: user.uid,
          email: user.email || 'billy.buckhalter@test.com',
          displayName: 'Billy Buckhalter',
          role: 'social_worker',
          assignedMembers: [],
          assignedRCFEs: [],
          permissions: {
            visitVerification: true,
            memberQuestionnaire: true
          }
        };
        setSocialWorkerData(mockData);
        setIsSocialWorker(true);
        // }
      } catch (error) {
        console.error('Error checking social worker status:', error);
        setIsSocialWorker(false);
        setSocialWorkerData(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSocialWorkerStatus();
  }, [user, loading]);

  return {
    user: socialWorkerData || user,
    isSocialWorker,
    socialWorkerData,
    isLoading: loading || isLoading,
    error
  };
}