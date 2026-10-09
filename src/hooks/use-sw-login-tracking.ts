'use client';

import { useEffect, useCallback } from 'react';
import { useSocialWorker, type SocialWorkerData } from './use-social-worker';
import { firebaseAuthHeaders } from '@/lib/admin-fetch';

type PortalSection = 'login' | 'portal-home' | 'visit-verification' | 'assignments';

export function useSWLoginTracking() {
  const { user, isSocialWorker, socialWorkerData } = useSocialWorker();

  const trackPortalAccess = useCallback(async (section: PortalSection) => {
    if (!isSocialWorker || !user) {
      console.log('🔍 Skipping login tracking - not a social worker or no user');
      return;
    }

    try {
      const swRecord = socialWorkerData as (SocialWorkerData & { id?: string; name?: string }) | null;
      const socialWorkerId = swRecord?.id || user.uid || 'unknown';
      const socialWorkerName = swRecord?.name || user.displayName || user.email || 'Unknown SW';
      
      if (!socialWorkerId || !socialWorkerName || socialWorkerId === 'unknown' || socialWorkerName === 'Unknown SW') {
        console.log('🔍 Skipping login tracking - insufficient user data');
        return;
      }

      const response = await fetch('/api/sw-visits/login-tracking', {
        method: 'POST',
        headers: {
          ...(await firebaseAuthHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          socialWorkerId,
          socialWorkerName,
          portalSection: section
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Portal access tracked:', {
          section,
          socialWorker: socialWorkerName,
          sessionId: result.sessionId
        });
      } else {
        console.warn('⚠️ Failed to track portal access:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error tracking portal access:', error);
    }
  }, [isSocialWorker, user, socialWorkerData]);

  const trackLogin = useCallback(() => trackPortalAccess('login'), [trackPortalAccess]);
  const trackPortalHome = useCallback(() => trackPortalAccess('portal-home'), [trackPortalAccess]);
  const trackVisitVerification = useCallback(() => trackPortalAccess('visit-verification'), [trackPortalAccess]);
  const trackAssignments = useCallback(() => trackPortalAccess('assignments'), [trackPortalAccess]);

  return {
    trackPortalAccess,
    trackLogin,
    trackPortalHome,
    trackVisitVerification,
    trackAssignments
  };
}

export function useAutoTrackPortalAccess(section: PortalSection) {
  const { trackPortalAccess } = useSWLoginTracking();
  const { isSocialWorker, isLoading, user } = useSocialWorker();

  useEffect(() => {
    if (!isLoading && isSocialWorker && user) {
      // Small delay to ensure user data is loaded
      const timer = setTimeout(() => {
        trackPortalAccess(section).catch(error => {
          console.error('Failed to track portal access:', error);
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [trackPortalAccess, section, isSocialWorker, isLoading, user]);
}