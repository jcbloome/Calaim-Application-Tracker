// Caspio Data Validator
// Validates and cleans data before sending to Caspio API

import { CASPIO_CONFIG } from '../config/constants';
import type { CaspioMember, CaspioNote } from '../types';

export class CaspioDataValidator {
  /**
   * Validate and clean member data
   */
  static validateMember(member: Partial<CaspioMember>): {
    isValid: boolean;
    errors: string[];
    cleanedData: Partial<CaspioMember>;
  } {
    const errors: string[] = [];
    const cleanedData: Partial<CaspioMember> = { ...member };

    // Check required fields
    const requiredFields = CASPIO_CONFIG.VALIDATION.REQUIRED_MEMBER_FIELDS;
    for (const field of requiredFields) {
      if (!member[field as keyof CaspioMember]) {
        errors.push(`Required field missing: ${field}`);
      }
    }

    // Validate member ID format
    if (member.id && !CASPIO_CONFIG.VALIDATION.MEMBER_ID_PATTERN.test(member.id)) {
      errors.push('Member ID must be in format: XX-12345');
    }

    // Validate email format
    if (member.email && !CASPIO_CONFIG.VALIDATION.EMAIL_PATTERN.test(member.email)) {
      errors.push('Invalid email format');
    }

    // Clean and validate phone number
    if (member.phone) {
      const cleanedPhone = this.cleanPhoneNumber(member.phone);
      if (cleanedPhone) {
        cleanedData.phone = cleanedPhone;
      } else {
        errors.push('Invalid phone number format');
      }
    }

    // Clean text fields
    if (member.firstName) {
      cleanedData.firstName = this.cleanTextInput(member.firstName);
    }
    if (member.lastName) {
      cleanedData.lastName = this.cleanTextInput(member.lastName);
    }
    if (member.address) {
      cleanedData.address = this.cleanTextInput(member.address);
    }

    // Validate status
    if (member.status && !['Active', 'Inactive', 'Pending'].includes(member.status)) {
      errors.push('Status must be Active, Inactive, or Pending');
    }

    return {
      isValid: errors.length === 0,
      errors,
      cleanedData
    };
  }

  /**
   * Validate and clean note data
   */
  static validateNote(note: Partial<CaspioNote>): {
    isValid: boolean;
    errors: string[];
    cleanedData: Partial<CaspioNote>;
  } {
    const errors: string[] = [];
    const cleanedData: Partial<CaspioNote> = { ...note };

    // Check required fields
    const requiredFields = CASPIO_CONFIG.VALIDATION.REQUIRED_NOTE_FIELDS;
    for (const field of requiredFields) {
      if (!note[field as keyof CaspioNote]) {
        errors.push(`Required field missing: ${field}`);
      }
    }

    // Validate note text length
    if (note.noteText && note.noteText.length > CASPIO_CONFIG.VALIDATION.MAX_NOTE_LENGTH) {
      errors.push(`Note text too long (max ${CASPIO_CONFIG.VALIDATION.MAX_NOTE_LENGTH} characters)`);
    }

    // Clean note text
    if (note.noteText) {
      cleanedData.noteText = this.cleanTextInput(note.noteText);
    }

    // Validate priority
    if (note.priority && !['General', 'Priority', 'Urgent'].includes(note.priority)) {
      errors.push('Priority must be General, Priority, or Urgent');
    }

    // Validate category
    const validCategories = ['General', 'Medical', 'Behavioral', 'Administrative', 'ILS'];
    if (note.category && !validCategories.includes(note.category)) {
      errors.push(`Category must be one of: ${validCategories.join(', ')}`);
    }

    // Clean member name
    if (note.memberName) {
      cleanedData.memberName = this.cleanTextInput(note.memberName);
    }

    // Clean staff member name
    if (note.staffMember) {
      cleanedData.staffMember = this.cleanTextInput(note.staffMember);
    }

    return {
      isValid: errors.length === 0,
      errors,
      cleanedData
    };
  }

  /**
   * Clean and format phone number
   */
  private static cleanPhoneNumber(phone: string): string | null {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Check if it's a valid US phone number (10 digits)
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    
    // Check if it's 11 digits starting with 1 (US country code)
    if (digits.length === 11 && digits.startsWith('1')) {
      const phoneDigits = digits.slice(1);
      return `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
    }
    
    return null;
  }

  /**
   * Clean text input (trim, remove special characters, etc.)
   */
  private static cleanTextInput(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-.,!?()]/g, '') // Remove special characters except basic punctuation
      .substring(0, 255); // Limit length to prevent database issues
  }

  /**
   * Validate date format
   */
  static validateDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString.includes('-');
  }

  /**
   * Clean and validate email
   */
  static cleanEmail(email: string): string | null {
    const cleaned = email.trim().toLowerCase();
    return CASPIO_CONFIG.VALIDATION.EMAIL_PATTERN.test(cleaned) ? cleaned : null;
  }

  /**
   * Validate member ID format
   */
  static validateMemberId(memberId: string): boolean {
    return CASPIO_CONFIG.VALIDATION.MEMBER_ID_PATTERN.test(memberId);
  }

  /**
   * Clean and validate zip code
   */
  static cleanZipCode(zipCode: string): string | null {
    const digits = zipCode.replace(/\D/g, '');
    
    // 5-digit zip code
    if (digits.length === 5) {
      return digits;
    }
    
    // 9-digit zip code (ZIP+4)
    if (digits.length === 9) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    
    return null;
  }

  /**
   * Sanitize data for Caspio API (remove null/undefined values)
   */
  static sanitizeForCaspio(data: any): any {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Validate sync options
   */
  static validateSyncOptions(options: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (options.batchSize && (options.batchSize < 1 || options.batchSize > 1000)) {
      errors.push('Batch size must be between 1 and 1000');
    }
    
    if (options.memberIds && !Array.isArray(options.memberIds)) {
      errors.push('Member IDs must be an array');
    }
    
    if (options.timestampFilter && !this.validateDate(options.timestampFilter.toISOString())) {
      errors.push('Invalid timestamp filter');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}