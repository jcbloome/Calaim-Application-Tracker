// Firebase Error Handler
// Centralized error handling for all Firebase operations

import { FIREBASE_CONFIG } from '../config/constants';
import type { FirebaseError } from '../types';

export class FirebaseErrorHandler {
  /**
   * Handle and transform Firebase errors
   */
  static handle(error: any, context?: string): FirebaseError {
    const firebaseError: FirebaseError = {
      code: this.determineErrorCode(error),
      message: this.formatErrorMessage(error, context),
      details: error,
      timestamp: new Date(),
      service: this.determineService(error),
      operation: context
    };

    // Log error for monitoring
    this.logError(firebaseError);

    return firebaseError;
  }

  /**
   * Determine error code based on Firebase error
   */
  private static determineErrorCode(error: any): string {
    if (error.code) {
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          return FIREBASE_CONFIG.ERROR_CODES.AUTH_FAILED;
        
        case 'permission-denied':
        case 'auth/insufficient-permission':
          return FIREBASE_CONFIG.ERROR_CODES.PERMISSION_DENIED;
        
        case 'not-found':
        case 'auth/user-not-found':
          return FIREBASE_CONFIG.ERROR_CODES.NOT_FOUND;
        
        case 'unavailable':
        case 'network-request-failed':
          return FIREBASE_CONFIG.ERROR_CODES.NETWORK_ERROR;
        
        case 'resource-exhausted':
        case 'quota-exceeded':
          return FIREBASE_CONFIG.ERROR_CODES.QUOTA_EXCEEDED;
        
        case 'invalid-argument':
        case 'failed-precondition':
          return FIREBASE_CONFIG.ERROR_CODES.INVALID_DATA;
        
        case 'functions/internal':
        case 'functions/unavailable':
          return FIREBASE_CONFIG.ERROR_CODES.FUNCTION_ERROR;
        
        case 'storage/unauthorized':
        case 'storage/object-not-found':
          return FIREBASE_CONFIG.ERROR_CODES.STORAGE_ERROR;
        
        default:
          return error.code;
      }
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * Determine which Firebase service caused the error
   */
  private static determineService(error: any): 'auth' | 'firestore' | 'functions' | 'storage' {
    if (error.code) {
      if (error.code.startsWith('auth/')) return 'auth';
      if (error.code.startsWith('functions/')) return 'functions';
      if (error.code.startsWith('storage/')) return 'storage';
    }
    
    return 'firestore'; // Default to firestore
  }

  /**
   * Format error message for user display
   */
  private static formatErrorMessage(error: any, context?: string): string {
    let message = context ? `${context}: ` : '';
    
    // Use Firebase error message if available
    if (error.message) {
      message += error.message;
    } else if (error.code) {
      message += this.getHumanReadableMessage(error.code);
    } else {
      message += 'An unexpected error occurred';
    }

    return message;
  }

  /**
   * Get human-readable message for Firebase error codes
   */
  private static getHumanReadableMessage(code: string): string {
    switch (code) {
      case 'auth/user-not-found':
        return 'No user found with this email address';
      case 'auth/wrong-password':
        return 'Incorrect password';
      case 'auth/invalid-credential':
        return 'Invalid login credentials';
      case 'auth/too-many-requests':
        return 'Too many failed login attempts. Please try again later';
      case 'permission-denied':
        return 'You do not have permission to perform this action';
      case 'not-found':
        return 'The requested resource was not found';
      case 'unavailable':
        return 'Service is temporarily unavailable. Please try again';
      case 'network-request-failed':
        return 'Network connection failed. Please check your internet connection';
      case 'resource-exhausted':
        return 'Service quota exceeded. Please try again later';
      case 'invalid-argument':
        return 'Invalid data provided';
      case 'failed-precondition':
        return 'Operation failed due to invalid conditions';
      default:
        return 'An unexpected error occurred';
    }
  }

  /**
   * Log error for monitoring and debugging
   */
  private static logError(error: FirebaseError): void {
    const logLevel = this.getLogLevel(error.code);
    
    const logData = {
      code: error.code,
      message: error.message,
      service: error.service,
      operation: error.operation,
      timestamp: error.timestamp,
      context: 'FirebaseIntegration'
    };

    switch (logLevel) {
      case 'error':
        console.error('🔴 Firebase Error:', logData);
        break;
      case 'warn':
        console.warn('🟡 Firebase Warning:', logData);
        break;
      default:
        console.log('🔵 Firebase Info:', logData);
    }

    // TODO: Send to monitoring service (e.g., Sentry, LogRocket)
    // this.sendToMonitoring(error);
  }

  /**
   * Determine log level based on error code
   */
  private static getLogLevel(code: string): 'error' | 'warn' | 'info' {
    const errorCodes = [
      FIREBASE_CONFIG.ERROR_CODES.AUTH_FAILED,
      FIREBASE_CONFIG.ERROR_CODES.PERMISSION_DENIED,
      FIREBASE_CONFIG.ERROR_CODES.FUNCTION_ERROR,
      FIREBASE_CONFIG.ERROR_CODES.INVALID_DATA
    ];
    
    const warningCodes = [
      FIREBASE_CONFIG.ERROR_CODES.NETWORK_ERROR,
      FIREBASE_CONFIG.ERROR_CODES.QUOTA_EXCEEDED,
      FIREBASE_CONFIG.ERROR_CODES.STORAGE_ERROR
    ];
    
    if (errorCodes.includes(code)) return 'error';
    if (warningCodes.includes(code)) return 'warn';
    return 'info';
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: FirebaseError): boolean {
    const retryableCodes = [
      FIREBASE_CONFIG.ERROR_CODES.NETWORK_ERROR,
      FIREBASE_CONFIG.ERROR_CODES.QUOTA_EXCEEDED,
      'unavailable',
      'internal',
      'deadline-exceeded'
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Get retry delay based on error type and attempt number
   */
  static getRetryDelay(error: FirebaseError, attemptNumber: number): number {
    if (error.code === FIREBASE_CONFIG.ERROR_CODES.QUOTA_EXCEEDED) {
      // Longer delay for quota issues
      return Math.min(
        FIREBASE_CONFIG.RETRY.BASE_DELAY * Math.pow(FIREBASE_CONFIG.RETRY.BACKOFF_MULTIPLIER, attemptNumber) * 2,
        FIREBASE_CONFIG.RETRY.MAX_DELAY
      );
    }
    
    // Standard exponential backoff
    return Math.min(
      FIREBASE_CONFIG.RETRY.BASE_DELAY * Math.pow(FIREBASE_CONFIG.RETRY.BACKOFF_MULTIPLIER, attemptNumber),
      FIREBASE_CONFIG.RETRY.MAX_DELAY
    );
  }

  /**
   * Create user-friendly error message
   */
  static getUserMessage(error: FirebaseError): string {
    switch (error.code) {
      case FIREBASE_CONFIG.ERROR_CODES.AUTH_FAILED:
        return 'Login failed. Please check your credentials and try again.';
      
      case FIREBASE_CONFIG.ERROR_CODES.PERMISSION_DENIED:
        return 'You do not have permission to perform this action.';
      
      case FIREBASE_CONFIG.ERROR_CODES.NOT_FOUND:
        return 'The requested information could not be found.';
      
      case FIREBASE_CONFIG.ERROR_CODES.NETWORK_ERROR:
        return 'Network connection issue. Please check your internet connection.';
      
      case FIREBASE_CONFIG.ERROR_CODES.QUOTA_EXCEEDED:
        return 'Service is temporarily busy. Please try again in a few minutes.';
      
      case FIREBASE_CONFIG.ERROR_CODES.INVALID_DATA:
        return 'Invalid data provided. Please check your input and try again.';
      
      case FIREBASE_CONFIG.ERROR_CODES.FUNCTION_ERROR:
        return 'Server function failed. Please try again later.';
      
      case FIREBASE_CONFIG.ERROR_CODES.STORAGE_ERROR:
        return 'File operation failed. Please try again.';
      
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  /**
   * Create error for API responses
   */
  static createApiError(
    message: string, 
    code?: string, 
    service: 'auth' | 'firestore' | 'functions' | 'storage' = 'firestore',
    details?: any
  ): FirebaseError {
    return {
      code: code || 'API_ERROR',
      message,
      details,
      timestamp: new Date(),
      service
    };
  }

  /**
   * Wrap async operations with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string,
    retries: number = 0
  ): Promise<T> {
    let lastError: FirebaseError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.handle(error, context);
        
        if (attempt < retries && this.isRetryable(lastError)) {
          const delay = this.getRetryDelay(lastError, attempt);
          console.log(`🔄 Retrying ${context} in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw lastError;
      }
    }
    
    throw lastError!;
  }
}