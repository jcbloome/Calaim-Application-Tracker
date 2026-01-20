// Firebase Data Validator - Validates data before Firebase operations

import { FIREBASE_CONFIG } from '../config/constants';

export class FirebaseDataValidator {
  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    return FIREBASE_CONFIG.VALIDATION.EMAIL_PATTERN.test(email);
  }

  /**
   * Validate document data
   */
  static validateDocumentData(data: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Data must be an object');
      return { isValid: false, errors };
    }

    // Check document size
    const fieldCount = Object.keys(data).length;
    if (fieldCount > FIREBASE_CONFIG.VALIDATION.MAX_DOCUMENT_SIZE) {
      errors.push(`Document has too many fields (max ${FIREBASE_CONFIG.VALIDATION.MAX_DOCUMENT_SIZE})`);
    }

    // Validate string lengths
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.length > FIREBASE_CONFIG.VALIDATION.MAX_STRING_LENGTH) {
        errors.push(`Field ${key} exceeds maximum string length`);
      }
      
      if (Array.isArray(value) && value.length > FIREBASE_CONFIG.VALIDATION.MAX_ARRAY_SIZE) {
        errors.push(`Array field ${key} exceeds maximum size`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize data for Firestore
   */
  static sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      return sanitized;
    }

    return data;
  }
}