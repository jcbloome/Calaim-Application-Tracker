'use client';

import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, useFirestore } from '@/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

export interface SocialWorkerData {
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
  sw_id?: string;
  SW_ID?: string;
}

type SwStatus = 'unknown' | 'active' | 'inactive' | 'not-found' | 'error';

export type SocialWorkerContextValue = {
  user: User | SocialWorkerData | null;
  isSocialWorker: boolean;
  socialWorkerData: SocialWorkerData | null;
  isLoading: boolean;
  error: Error | undefined;
  status: SwStatus;
  hasPermission: (permission: keyof SocialWorkerData['permissions']) => boolean;
  canAccessVisitVerification: () => boolean;
  canAccessMemberQuestionnaire: () => boolean;
  canSubmitClaims: () => boolean;
};

const SW_DISPLAY_NAME_CACHE_KEY = 'calaim_sw_display_name_v1';

const SocialWorkerContext = createContext<SocialWorkerContextValue | null>(null);

const defaultPermissions = (): SocialWorkerData['permissions'] => ({
  visitVerification: true,
  memberQuestionnaire: true,
  claimsSubmission: true,
});

const readCachedDisplayName = (uid: string) => {
  try {
    const raw = sessionStorage.getItem(SW_DISPLAY_NAME_CACHE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { uid?: string; displayName?: string };
    if (String(parsed?.uid || '') !== uid) return '';
    return String(parsed?.displayName || '').trim();
  } catch {
    return '';
  }
};

export const cacheSwDisplayName = (uid: string, displayName: string) => {
  try {
    sessionStorage.setItem(
      SW_DISPLAY_NAME_CACHE_KEY,
      JSON.stringify({ uid, displayName: String(displayName || '').trim() })
    );
  } catch {
    // ignore
  }
};

const buildFallbackProfile = (user: User, displayName?: string): SocialWorkerData => {
  const email = String(user.email || '').trim().toLowerCase();
  const resolvedName =
    String(displayName || '').trim() ||
    readCachedDisplayName(user.uid) ||
    String(user.displayName || '').trim() ||
    email.split('@')[0] ||
    'Social Worker';

  return {
    uid: user.uid,
    email,
    displayName: resolvedName,
    role: 'social_worker',
    isActive: true,
    createdAt: new Date(),
    createdBy: 'system',
    permissions: defaultPermissions(),
  };
};

const resolveDisplayName = async (
  firestore: Firestore,
  user: User,
  data: Record<string, unknown>
): Promise<string> => {
  const fromData = String(data?.displayName || data?.name || '').trim();
  if (fromData) return fromData;

  const fromAuth = String(user.displayName || '').trim();
  if (fromAuth) return fromAuth;

  const cached = readCachedDisplayName(user.uid);
  if (cached) return cached;

  const email = String(data?.email || user.email || '').trim().toLowerCase();
  const swId = String(data?.sw_id || data?.SW_ID || '').trim();

  try {
    if (email) {
      const snap = await getDocs(query(collection(firestore, 'syncedSocialWorkers'), where('email', '==', email)));
      if (!snap.empty) {
        const name = String((snap.docs[0].data() as { name?: string })?.name || '').trim();
        if (name) return name;
      }
    }
  } catch {
    // ignore
  }

  try {
    if (swId) {
      const snap = await getDocs(query(collection(firestore, 'syncedSocialWorkers'), where('sw_id', '==', swId)));
      if (!snap.empty) {
        const name = String((snap.docs[0].data() as { name?: string })?.name || '').trim();
        if (name) return name;
      }
    }
  } catch {
    // ignore
  }

  return String(user.email || data?.email || 'Social Worker').trim() || 'Social Worker';
};

async function enrichSocialWorkerProfile(
  firestore: Firestore,
  user: User,
  claimedSocialWorker: boolean,
  apply: (patch: Partial<SocialWorkerContextValue>) => void
) {
  const normalizedEmail = user.email?.trim().toLowerCase() || '';

  try {
    const socialWorkerDoc = await getDoc(doc(firestore, 'socialWorkers', user.uid));

    if (socialWorkerDoc.exists()) {
      const data = socialWorkerDoc.data() as SocialWorkerData;
      if (!data.isActive) {
        apply({ isSocialWorker: false, socialWorkerData: null, status: 'inactive' });
        return;
      }

      const displayNameResolved = await resolveDisplayName(firestore, user, data as unknown as Record<string, unknown>);
      cacheSwDisplayName(user.uid, displayNameResolved);
      apply({
        socialWorkerData: {
          ...data,
          uid: user.uid,
          displayName: displayNameResolved,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined,
        },
        isSocialWorker: true,
        status: 'active',
      });

      void updateDoc(doc(firestore, 'socialWorkers', user.uid), { lastLogin: serverTimestamp() }).catch(() => null);
      return;
    }

    if (normalizedEmail) {
      const emailIdDoc = await getDoc(doc(firestore, 'socialWorkers', normalizedEmail));
      if (emailIdDoc.exists()) {
        const data = emailIdDoc.data() as SocialWorkerData;
        const isActive = !!data.isActive;
        const displayNameResolved = await resolveDisplayName(firestore, user, data as unknown as Record<string, unknown>);
        if (isActive) cacheSwDisplayName(user.uid, displayNameResolved);
        apply({
          socialWorkerData: isActive
            ? {
                ...data,
                uid: user.uid,
                displayName: displayNameResolved,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined,
              }
            : null,
          isSocialWorker: isActive,
          status: isActive ? 'active' : 'inactive',
        });

        if (isActive) {
          void setDoc(
            doc(firestore, 'socialWorkers', user.uid),
            { ...data, email: normalizedEmail, migratedFrom: normalizedEmail, updatedAt: serverTimestamp() },
            { merge: true }
          ).catch(() => null);
        }
        return;
      }

      const emailSnapshot = await getDocs(
        query(collection(firestore, 'socialWorkers'), where('email', '==', normalizedEmail))
      );
      if (!emailSnapshot.empty) {
        const emailDoc = emailSnapshot.docs[0];
        const data = emailDoc.data() as SocialWorkerData;
        const isActive = !!data.isActive;
        const displayNameResolved = await resolveDisplayName(firestore, user, data as unknown as Record<string, unknown>);
        if (isActive) cacheSwDisplayName(user.uid, displayNameResolved);
        apply({
          socialWorkerData: isActive
            ? {
                ...data,
                uid: user.uid,
                displayName: displayNameResolved,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate() : undefined,
              }
            : null,
          isSocialWorker: isActive,
          status: isActive ? 'active' : 'inactive',
        });

        if (isActive) {
          void setDoc(
            doc(firestore, 'socialWorkers', user.uid),
            { ...data, email: normalizedEmail, migratedFrom: emailDoc.id, updatedAt: serverTimestamp() },
            { merge: true }
          ).catch(() => null);
        }
        return;
      }
    }

    if (claimedSocialWorker) {
      const displayNameResolved = await resolveDisplayName(firestore, user, { email: normalizedEmail });
      cacheSwDisplayName(user.uid, displayNameResolved);
      apply({
        socialWorkerData: buildFallbackProfile(user, displayNameResolved),
        isSocialWorker: true,
        status: 'active',
      });
      return;
    }

    apply({ isSocialWorker: false, socialWorkerData: null, status: 'not-found' });
  } catch (error) {
    console.error('Error enriching social worker profile:', error);
    if (claimedSocialWorker) {
      apply({
        socialWorkerData: buildFallbackProfile(user),
        isSocialWorker: true,
        status: 'active',
      });
    } else {
      apply({ isSocialWorker: false, socialWorkerData: null, status: 'error' });
    }
  }
}

function useSocialWorkerState(): SocialWorkerContextValue {
  const [user, loading, error] = useAuthState(auth);
  const firestore = useFirestore();
  const [socialWorkerData, setSocialWorkerData] = useState<SocialWorkerData | null>(null);
  const [isSocialWorker, setIsSocialWorker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<SwStatus>('unknown');

  useEffect(() => {
    let cancelled = false;

    const apply = (patch: Partial<SocialWorkerContextValue>) => {
      if (cancelled) return;
      if (patch.isSocialWorker !== undefined) setIsSocialWorker(patch.isSocialWorker);
      if (patch.socialWorkerData !== undefined) setSocialWorkerData(patch.socialWorkerData);
      if (patch.status !== undefined) setStatus(patch.status);
    };

    const run = async () => {
      if (loading || !firestore) {
        setIsLoading(true);
        return;
      }

      if (!user) {
        setIsSocialWorker(false);
        setSocialWorkerData(null);
        setStatus('not-found');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      let claimedSocialWorker = false;
      try {
        const tokenResult = await user.getIdTokenResult();
        claimedSocialWorker = Boolean((tokenResult?.claims as Record<string, unknown> | undefined)?.socialWorker);
      } catch (claimError) {
        console.warn('useSocialWorker: failed to read token claims', claimError);
      }

      if (!claimedSocialWorker) {
        try {
          claimedSocialWorker = localStorage.getItem('calaim_session_type') === 'sw';
        } catch {
          // ignore
        }
      }

      if (claimedSocialWorker) {
        const profile = buildFallbackProfile(user);
        setIsSocialWorker(true);
        setSocialWorkerData(profile);
        setStatus('active');
        setIsLoading(false);

        void user.getIdToken(true).catch(() => null);
        void enrichSocialWorkerProfile(firestore, user, true, apply);
        return;
      }

      await enrichSocialWorkerProfile(firestore, user, false, apply);
      if (!cancelled) setIsLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user, loading, firestore]);

  const hasPermission = (permission: keyof SocialWorkerData['permissions']): boolean => {
    if (!socialWorkerData) return Boolean(isSocialWorker);
    const value = socialWorkerData.permissions?.[permission];
    if (value === undefined || value === null) return true;
    return Boolean(value);
  };

  return useMemo(
    () => ({
      user: socialWorkerData || user,
      isSocialWorker,
      socialWorkerData,
      isLoading: loading || isLoading,
      error,
      status,
      hasPermission,
      canAccessVisitVerification: () => hasPermission('visitVerification'),
      canAccessMemberQuestionnaire: () => hasPermission('memberQuestionnaire'),
      canSubmitClaims: () => hasPermission('claimsSubmission'),
    }),
    [error, isLoading, isSocialWorker, loading, socialWorkerData, status, user]
  );
}

export function SocialWorkerProvider({ children }: { children: ReactNode }) {
  const value = useSocialWorkerState();
  return createElement(SocialWorkerContext.Provider, { value }, children);
}

export function useSocialWorker(): SocialWorkerContextValue {
  const context = useContext(SocialWorkerContext);
  if (context) return context;
  return useSocialWorkerState();
}
