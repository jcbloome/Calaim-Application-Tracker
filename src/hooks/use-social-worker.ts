import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, useFirestore } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

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
  const [status, setStatus] = useState<'unknown' | 'active' | 'inactive' | 'not-found' | 'error'>('unknown');

  useEffect(() => {
    const checkSocialWorkerStatus = async () => {
      if (loading || !firestore) return;
      
      if (!user) {
        setIsSocialWorker(false);
        setSocialWorkerData(null);
        setStatus('not-found');
        setIsLoading(false);
        return;
      }

      try {
        // Fast-path: trust token claim if present (set by `/api/auth/sw-session`),
        // but still try to load/resolve a friendly display name from Firestore/Caspio sync.
        let claimedSocialWorker = false;
        try {
          const tokenResult = await user.getIdTokenResult();
          const claims = (tokenResult?.claims || {}) as Record<string, any>;
          if (Boolean(claims.socialWorker)) {
            claimedSocialWorker = true;
            setIsSocialWorker(true);
            setStatus('active');
          }
        } catch (claimError) {
          console.warn('⚠️ useSocialWorker: Failed to read token claims', claimError);
        }

        // Check if user exists in social workers collection by UID first
        const socialWorkerDoc = await getDoc(doc(firestore, 'socialWorkers', user.uid));
        const normalizedEmail = user.email?.trim().toLowerCase();

        const resolveDisplayName = async (data: any): Promise<string> => {
          const fromData =
            String(data?.displayName || '').trim() ||
            String(data?.name || '').trim();
          if (fromData) return fromData;

          const fromAuth = String(user?.displayName || '').trim();
          if (fromAuth) return fromAuth;

          const email = String((data?.email || user?.email || '')).trim().toLowerCase();
          const swId = String((data?.sw_id || data?.SW_ID || '')).trim();

          // Best-effort fallback: use syncedSocialWorkers (populated from Caspio).
          try {
            if (email) {
              const q1 = query(collection(firestore, 'syncedSocialWorkers'), where('email', '==', email));
              const s1 = await getDocs(q1);
              if (!s1.empty) {
                const name = String((s1.docs[0].data() as any)?.name || '').trim();
                if (name) return name;
              }
            }
          } catch {
            // ignore
          }

          try {
            if (swId) {
              const q2 = query(collection(firestore, 'syncedSocialWorkers'), where('sw_id', '==', swId));
              const s2 = await getDocs(q2);
              if (!s2.empty) {
                const name = String((s2.docs[0].data() as any)?.name || '').trim();
                if (name) return name;
              }
            }
          } catch {
            // ignore
          }

          return String(user?.email || data?.email || 'Social Worker').trim() || 'Social Worker';
        };

        if (socialWorkerDoc.exists()) {
          const data = socialWorkerDoc.data() as SocialWorkerData;
          const isActive = !!data.isActive;

          if (isActive) {
            const displayNameResolved = await resolveDisplayName(data);
            setSocialWorkerData({
              ...data,
              uid: user.uid,
              displayName: displayNameResolved,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
              lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined
            });
            setIsSocialWorker(true);
            setStatus('active');

            // Update last login timestamp
            try {
              await updateDoc(doc(firestore, 'socialWorkers', user.uid), {
                lastLogin: serverTimestamp()
              });
            } catch (loginUpdateError) {
              console.warn('Failed to update last login:', loginUpdateError);
            }
          } else {
            setIsSocialWorker(false);
            setSocialWorkerData(null);
            setStatus('inactive');
            console.warn('Social worker account is inactive');
          }
        } else if (normalizedEmail) {
          // Fallback 1: some legacy docs used email as the doc ID.
          const emailIdDoc = await getDoc(doc(firestore, 'socialWorkers', normalizedEmail));
          if (emailIdDoc.exists()) {
            const data = emailIdDoc.data() as SocialWorkerData;
            const isActive = !!data.isActive;
            const displayNameResolved = await resolveDisplayName(data);
            setSocialWorkerData({
              ...data,
              uid: user.uid,
              displayName: displayNameResolved,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
              lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined
            });
            setIsSocialWorker(isActive);
            setStatus(isActive ? 'active' : 'inactive');

            try {
              await setDoc(
                doc(firestore, 'socialWorkers', user.uid),
                {
                  ...data,
                  email: normalizedEmail,
                  migratedFrom: normalizedEmail,
                  updatedAt: serverTimestamp()
                },
                { merge: true }
              );
            } catch (migrationError) {
              console.warn('Failed to migrate social worker doc to UID:', migrationError);
            }
          } else {
            // Fallback 2: look up by email field
            const emailQuery = query(
              collection(firestore, 'socialWorkers'),
              where('email', '==', normalizedEmail)
            );
            const emailSnapshot = await getDocs(emailQuery);
            if (!emailSnapshot.empty) {
              const emailDoc = emailSnapshot.docs[0];
              const data = emailDoc.data() as SocialWorkerData;
              const isActive = !!data.isActive;
              const displayNameResolved = await resolveDisplayName(data);
              setSocialWorkerData({
                ...data,
                uid: user.uid,
                displayName: displayNameResolved,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined
              });
              setIsSocialWorker(isActive);
              setStatus(isActive ? 'active' : 'inactive');

              // Migrate to UID-based doc for consistent lookups
              try {
                await setDoc(
                  doc(firestore, 'socialWorkers', user.uid),
                  {
                    ...data,
                    email: normalizedEmail,
                    migratedFrom: emailDoc.id,
                    updatedAt: serverTimestamp()
                  },
                  { merge: true }
                );
              } catch (migrationError) {
                console.warn('Failed to migrate social worker doc to UID:', migrationError);
              }
            } else {
              setIsSocialWorker(false);
              setSocialWorkerData(null);
              setStatus('not-found');
            }
          }
        } else {
          if (claimedSocialWorker) {
            const displayNameResolved = await resolveDisplayName({ email: normalizedEmail || user.email });
            setSocialWorkerData({
              uid: user.uid,
              email: normalizedEmail || String(user.email || '').trim(),
              displayName: displayNameResolved,
              role: 'social_worker',
              isActive: true,
              createdAt: new Date(),
              createdBy: 'system',
              permissions: {
                visitVerification: true,
                memberQuestionnaire: true,
                claimsSubmission: true
              }
            });
            setIsSocialWorker(true);
            setStatus('active');
          } else {
            setIsSocialWorker(false);
            setSocialWorkerData(null);
            setStatus('not-found');
          }
        }
      } catch (error) {
        console.error('Error checking social worker status:', error);
        setIsSocialWorker(false);
        setSocialWorkerData(null);
        setStatus('error');
      } finally {
        setIsLoading(false);
      }
    };

    checkSocialWorkerStatus();
  }, [user, loading, firestore]);

  // Helper functions to check specific permissions
  const hasPermission = (permission: keyof SocialWorkerData['permissions']): boolean => {
    // If we already determined the user is a social worker (e.g., via token claim),
    // but we don't have a loaded Firestore doc yet, default-allow permissions for
    // backward compatibility instead of hard-blocking.
    if (!socialWorkerData) return Boolean(isSocialWorker);
    const value = (socialWorkerData.permissions as any)?.[permission];
    // Default allow when the permission field is missing (backward compat).
    // Explicit false should still block access.
    if (value === undefined || value === null) return true;
    return Boolean(value);
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
    status,
    // Permission helpers
    hasPermission,
    canAccessVisitVerification,
    canAccessMemberQuestionnaire,
    canSubmitClaims
  };
}