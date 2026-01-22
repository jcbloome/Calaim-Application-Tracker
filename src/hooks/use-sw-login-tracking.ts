'use client';

import { useEffect, useCallback } from 'react';
import { useSocialWorker } from './use-social-worker';

type PortalSection = 'login' | 'portal-home' | 'visit-verification' | 'assignments';

export function useSWLoginTracking() {
  const { user, isSocialWorker, socialWorkerData } = useSocialWorker();

  const trackPortalAccess = useCallback(async (section: PortalSection) => {
    if (!isSocialWorker || !user) {
      return;
    }

    try {
      const socialWorkerId = socialWorkerData?.id || user.uid || 'unknown';
      const socialWorkerName = socialWorkerData?.name || user.displayName || user.email || 'Unknown SW';

      const response = await fetch('/api/sw-visits/login-tracking', {
        method: 'POST',
        headers: {
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
  const { isSocialWorker, isLoading } = useSocialWorker();

  useEffect(() => {
    if (!isLoading && isSocialWorker) {
      // Small delay to ensure user data is loaded
      const timer = setTimeout(() => {
        trackPortalAccess(section);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [trackPortalAccess, section, isSocialWorker, isLoading]);
}