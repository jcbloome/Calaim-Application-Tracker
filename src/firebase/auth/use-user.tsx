
'use client';

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase/provider';

export interface UserHookResult {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export const useUser = (): UserHookResult => {
  const auth = useAuth();
  const [userState, setUserState] = useState<UserHookResult>(() => {
    // Initial state should always be loading, until the first auth check completes.
    return {
      user: null,
      isUserLoading: true,
      userError: null,
    };
  });

  useEffect(() => {
    if (!auth) {
      setUserState({ user: null, isUserLoading: false, userError: new Error("Auth service not available.") });
      return;
    }

    // Set initial user from currentUser if available, but keep loading true
    // until the onAuthStateChanged listener fires for the first time.
    if (auth.currentUser && userState.isUserLoading) {
      setUserState(s => ({ ...s, user: auth.currentUser }));
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        // Auth state has been confirmed, loading is now false.
        setUserState({ user: firebaseUser, isUserLoading: false, userError: null });
      },
      (error) => {
        console.error("useUser: onAuthStateChanged error:", error);
        setUserState({ user: null, isUserLoading: false, userError: error });
      }
    );

    return () => unsubscribe();
  }, [auth]); // Only re-run the effect if the auth instance itself changes.

  return userState;
};
