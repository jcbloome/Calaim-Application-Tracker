
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
    console.log('🔍 useAdmin Debug:', {
      isUserLoading,
      userEmail: user?.email,
      userExists: !!user,
      timestamp: new Date().toLocaleTimeString()
    });

    if (isUserLoading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      console.log('🚫 useAdmin: No user found');
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
    
    const isAdminUser = adminEmails.includes(user.email || '');
    console.log('🔍 useAdmin: Admin check result:', {
      userEmail: user.email,
      isAdminUser,
      adminEmails
    });
    
    if (isAdminUser) {
      console.log('✅ useAdmin: User recognized as admin');
      setIsAdmin(true);
      setIsSuperAdmin(true);
      setIsLoading(false);
    } else {
      console.log('❌ useAdmin: User NOT recognized as admin');
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
