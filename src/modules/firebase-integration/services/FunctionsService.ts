// Firebase Functions Service - Handles all Firebase Functions calls

import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import { FirebaseErrorHandler } from '../utils/errorHandler';
import { FIREBASE_CONFIG } from '../config/constants';
import type { FunctionCallOptions, FunctionResult } from '../types';

export class FunctionsService {
  private functions = functions;

  /**
   * Call a Firebase Function
   */
  async callFunction<T, R>(
    functionName: string, 
    data?: T, 
    options?: FunctionCallOptions
  ): Promise<R> {
    try {
      const callable = httpsCallable(this.functions, functionName, {
        timeout: options?.timeout || FIREBASE_CONFIG.FUNCTIONS.TIMEOUT
      });

      const result = await callable(data);
      return result.data as R;
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Function call failed: ${functionName}`);
    }
  }

  /**
   * Call function with retry logic
   */
  async callFunctionWithRetry<T, R>(
    functionName: string,
    data?: T,
    options?: FunctionCallOptions
  ): Promise<R> {
    const maxRetries = options?.retries || FIREBASE_CONFIG.FUNCTIONS.DEFAULT_RETRIES;
    const retryDelay = options?.retryDelay || FIREBASE_CONFIG.RETRY.BASE_DELAY;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callFunction<T, R>(functionName, data, options);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Check if Functions service is available
   */
  isAvailable(): boolean {
    return this.functions !== null;
  }
}