import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';

interface SocialWorkerInfo {
  isSocialWorker: boolean;
  email: string | null;
  name: string | null;
  loading: boolean;
}

// List of social worker email addresses
const SOCIAL_WORKER_EMAILS = [
  'jcbloome@gmail.com',
  'annalisabastian@gmail.com', 
  'mskiayang@yahoo.com',
  // Add more social worker emails as needed
];

export function useSocialWorker(): SocialWorkerInfo {
  const { user, isUserLoading } = useUser();

  const isSocialWorker = user?.email ? SOCIAL_WORKER_EMAILS.includes(user.email.toLowerCase()) : false;

  return {
    isSocialWorker,
    email: user?.email || null,
    name: user?.displayName || user?.email || null,
    loading: isUserLoading
  };
}