// Caspio Authentication Hook
// Handles Caspio OAuth token management and authentication state

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CaspioService } from '../services/CaspioService';
import type { CaspioError } from '../types';

interface UseCaspioAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: CaspioError | null;
  accessToken: string | null;
  tokenExpiresAt: Date | null;
  authenticate: () => Promise<void>;
  clearError: () => void;
  refreshToken: () => Promise<void>;
}

export function useCaspioAuth(): UseCaspioAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<CaspioError | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null);

  const caspioService = CaspioService.getInstance();

  // Initialize authentication state
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const token = await caspioService.getAccessToken();
      
      if (token) {
        setAccessToken(token);
        setIsAuthenticated(true);
        // Note: We don't have direct access to token expiry from the service
        // This would need to be enhanced in the CaspioService
        setTokenExpiresAt(new Date(Date.now() + 3600000)); // 1 hour from now
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
        setTokenExpiresAt(null);
      }
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      setIsAuthenticated(false);
      setAccessToken(null);
      setTokenExpiresAt(null);
      console.error('❌ Caspio auth check failed:', caspioError);
    } finally {
      setIsLoading(false);
    }
  };

  const authenticate = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const token = await caspioService.getAccessToken();
      
      if (token) {
        setAccessToken(token);
        setIsAuthenticated(true);
        setTokenExpiresAt(new Date(Date.now() + 3600000)); // 1 hour from now
        console.log('✅ Caspio authentication successful');
      } else {
        throw new Error('Failed to obtain access token');
      }
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      setIsAuthenticated(false);
      setAccessToken(null);
      setTokenExpiresAt(null);
      console.error('❌ Caspio authentication failed:', caspioError);
    } finally {
      setIsLoading(false);
    }
  }, [caspioService]);

  const refreshToken = useCallback(async () => {
    await authenticate();
  }, [authenticate]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isAuthenticated,
    isLoading,
    error,
    accessToken,
    tokenExpiresAt,
    authenticate,
    clearError,
    refreshToken
  };
}