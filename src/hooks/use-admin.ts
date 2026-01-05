
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import type { User } from 'firebase/auth';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  user: User | null;
}

export function useAdmin(): AdminStatus {
  const { user, isUserLoading } = useUser();

  // Temporarily grant universal admin access as requested.
  // This will be reverted once the user has assigned their role.
  return {
    user,
    isAdmin: true,
    isSuperAdmin: true,
    isLoading: false,
  };
}
