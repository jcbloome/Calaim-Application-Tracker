'use client';

import { useState, useEffect } from 'react';
import { TwoFactorAuth } from './TwoFactorAuth';
import { useUser } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  require2FA?: boolean;
}

export function AuthGuard({ children, require2FA = false }: AuthGuardProps) {
  const [is2FAVerified, setIs2FAVerified] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!user || isUserLoading) return;

    const check2FAStatus = async () => {
      if (!require2FA) {
        setIs2FAVerified(true);
        setIsChecking(false);
        return;
      }

      try {
        const functions = getFunctions();
        const check2FA = httpsCallable(functions, 'check2FAStatus');
        
        const result = await check2FA({});
        const data = result.data as any;
        
        if (data.success) {
          setIs2FAVerified(data.isVerified);
        }
      } catch (error) {
        console.error('Error checking 2FA status:', error);
        setIs2FAVerified(false);
      } finally {
        setIsChecking(false);
      }
    };

    check2FAStatus();
  }, [user, isUserLoading, require2FA]);

  if (isUserLoading || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Checking authentication...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to continue</p>
        </div>
      </div>
    );
  }

  if (require2FA && !is2FAVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <TwoFactorAuth
          onVerificationComplete={() => setIs2FAVerified(true)}
          required={require2FA}
        />
      </div>
    );
  }

  return <>{children}</>;
}