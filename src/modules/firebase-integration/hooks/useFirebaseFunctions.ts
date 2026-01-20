// Firebase Functions Hook - Manages Firebase Functions calls

'use client';

import { useState, useCallback } from 'react';
import { FirebaseService } from '../services/FirebaseService';
import type { 
  FunctionCallOptions, 
  FirebaseError 
} from '../types';

interface UseFirebaseFunctionsReturn {
  // Loading state
  isLoading: boolean;
  
  // Error handling
  error: FirebaseError | null;
  
  // Actions
  callFunction: <T, R>(functionName: string, data?: T, options?: FunctionCallOptions) => Promise<R>;
  clearError: () => void;
}

export function useFirebaseFunctions(): UseFirebaseFunctionsReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FirebaseError | null>(null);
  
  const firebaseService = FirebaseService.getInstance();

  // Call Firebase Function
  const callFunction = useCallback(async <T, R>(
    functionName: string, 
    data?: T, 
    options?: FunctionCallOptions
  ): Promise<R> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await firebaseService.callFunction<T, R>(functionName, data, options);
      
      console.log(`✅ Function ${functionName} called successfully`);
      return result;
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Function ${functionName} failed:`, firebaseError);
      throw firebaseError;
    } finally {
      setIsLoading(false);
    }
  }, [firebaseService]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Loading state
    isLoading,
    
    // Error handling
    error,
    
    // Actions
    callFunction,
    clearError
  };
}