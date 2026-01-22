import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, useFirestore } from '@/firebase';
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
          setSocialWorkerData(data);
          setIsSocialWorker(true);
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
  }, [user, loading]);

  return {
    user: socialWorkerData || user,
    isSocialWorker,
    socialWorkerData,
    isLoading: loading || isLoading,
    error
  };
}