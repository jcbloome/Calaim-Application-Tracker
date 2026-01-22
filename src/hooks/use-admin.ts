
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import type { User } from 'firebase/auth';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isUserLoading: boolean;
  user: User | null;
}

export function useAdmin(): AdminStatus {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isUserLoading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      setIsLoading(false);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      return;
    }

    // Simple admin check - check hardcoded admin emails
    const adminEmails = [
      'jason@carehomefinders.com',
      'jason.bloome@connectionslos.com', // Add your work email
      'jcbloome@gmail.com' // Add your personal email if needed
    ];
    
    if (adminEmails.includes(user.email || '')) {
      setIsAdmin(true);
      setIsSuperAdmin(true);
      setIsLoading(false);
    } else {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setIsLoading(false);
    }
  }, [user, isUserLoading]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    isLoading: isUserLoading || isLoading,
    isUserLoading,
  };
}
