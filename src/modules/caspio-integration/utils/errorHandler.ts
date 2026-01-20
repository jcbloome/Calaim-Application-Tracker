// Caspio Error Handler
// Centralized error handling for all Caspio operations

import { CASPIO_CONFIG } from '../config/constants';
import type { CaspioError } from '../types';

export class CaspioErrorHandler {
  /**
   * Handle and transform Caspio API errors
   */
  static handle(error: any, context?: string): CaspioError {
    const caspioError: CaspioError = {
      code: this.determineErrorCode(error),
      message: this.formatErrorMessage(error, context),
      details: error,
      timestamp: new Date(),
      endpoint: this.extractEndpoint(error)
    };

    // Log error for monitoring
    this.logError(caspioError);

    return caspioError;
  }

  /**
   * Determine error code based on error type
   */
  private static determineErrorCode(error: any): string {
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      return CASPIO_CONFIG.ERROR_CODES.AUTH_FAILED;
    }
    
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      return CASPIO_CONFIG.ERROR_CODES.RATE_LIMIT;
    }
    
    if (error.message?.includes('400') || error.message?.includes('Bad Request')) {
      return CASPIO_CONFIG.ERROR_CODES.VALIDATION_ERROR;
    }
    
    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
      return CASPIO_CONFIG.ERROR_CODES.NETWORK_ERROR;
    }
    
    if (error.message?.includes('sync') || error.message?.includes('Sync')) {
      return CASPIO_CONFIG.ERROR_CODES.SYNC_ERROR;
    }
    
    return CASPIO_CONFIG.ERROR_CODES.API_ERROR;
  }

  /**
   * Format error message for user display
   */
  private static formatErrorMessage(error: any, context?: string): string {
    let message = context ? `${context}: ` : '';
    
    if (error.message) {
      message += error.message;
    } else if (typeof error === 'string') {
      message += error;
    } else {
      message += 'Unknown error occurred';
    }

    // Clean up technical details for user-friendly messages
    message = message
      .replace(/HTTP \d+:/g, '')
      .replace(/Bearer token/gi, 'authentication')
      .replace(/oauth\/token/gi, 'authentication service')
      .trim();

    return message;
  }

  /**
   * Extract API endpoint from error for debugging
   */
  private static extractEndpoint(error: any): string | undefined {
    if (error.config?.url) {
      return error.config.url;
    }
    
    if (error.message && error.message.includes('http')) {
      const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
      return urlMatch ? urlMatch[0] : undefined;
    }
    
    return undefined;
  }

  /**
   * Log error for monitoring and debugging
   */
  private static logError(error: CaspioError): void {
    const logLevel = this.getLogLevel(error.code);
    
    const logData = {
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
      endpoint: error.endpoint,
      context: 'CaspioIntegration'
    };

    switch (logLevel) {
      case 'error':
        console.error('🔴 Caspio Error:', logData);
        break;
      case 'warn':
        console.warn('🟡 Caspio Warning:', logData);
        break;
      default:
        console.log('🔵 Caspio Info:', logData);
    }

    // TODO: Send to monitoring service (e.g., Sentry, LogRocket)
    // this.sendToMonitoring(error);
  }

  /**
   * Determine log level based on error code
   */
  private static getLogLevel(code: string): 'error' | 'warn' | 'info' {
    switch (code) {
      case CASPIO_CONFIG.ERROR_CODES.AUTH_FAILED:
      case CASPIO_CONFIG.ERROR_CODES.API_ERROR:
      case CASPIO_CONFIG.ERROR_CODES.SYNC_ERROR:
        return 'error';
      
      case CASPIO_CONFIG.ERROR_CODES.RATE_LIMIT:
      case CASPIO_CONFIG.ERROR_CODES.NETWORK_ERROR:
        return 'warn';
      
      default:
        return 'info';
    }
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: CaspioError): boolean {
    const retryableCodes = [
      CASPIO_CONFIG.ERROR_CODES.NETWORK_ERROR,
      CASPIO_CONFIG.ERROR_CODES.RATE_LIMIT
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Get retry delay based on error type
   */
  static getRetryDelay(error: CaspioError, attemptNumber: number): number {
    if (error.code === CASPIO_CONFIG.ERROR_CODES.RATE_LIMIT) {
      // Exponential backoff for rate limiting
      return Math.min(CASPIO_CONFIG.SYNC.RETRY_DELAY * Math.pow(2, attemptNumber), 60000);
    }
    
    if (error.code === CASPIO_CONFIG.ERROR_CODES.NETWORK_ERROR) {
      // Linear backoff for network errors
      return CASPIO_CONFIG.SYNC.RETRY_DELAY * attemptNumber;
    }
    
    return CASPIO_CONFIG.SYNC.RETRY_DELAY;
  }

  /**
   * Create user-friendly error message
   */
  static getUserMessage(error: CaspioError): string {
    switch (error.code) {
      case CASPIO_CONFIG.ERROR_CODES.AUTH_FAILED:
        return 'Authentication failed. Please check your credentials and try again.';
      
      case CASPIO_CONFIG.ERROR_CODES.RATE_LIMIT:
        return 'Too many requests. Please wait a moment and try again.';
      
      case CASPIO_CONFIG.ERROR_CODES.NETWORK_ERROR:
        return 'Network connection issue. Please check your internet connection.';
      
      case CASPIO_CONFIG.ERROR_CODES.VALIDATION_ERROR:
        return 'Invalid data provided. Please check your input and try again.';
      
      case CASPIO_CONFIG.ERROR_CODES.SYNC_ERROR:
        return 'Data synchronization failed. Please try again later.';
      
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  /**
   * Create error for API responses
   */
  static createApiError(message: string, code?: string, details?: any): CaspioError {
    return {
      code: code || CASPIO_CONFIG.ERROR_CODES.API_ERROR,
      message,
      details,
      timestamp: new Date()
    };
  }
}