// Staff directory mapping names to email addresses
// This should eventually be moved to a database or admin configuration

export interface StaffMember {
  name: string;
  email: string;
  role?: string;
}

// Default staff directory - this should be configurable via admin panel
export const STAFF_DIRECTORY: Record<string, StaffMember> = {
  'Jason Bloome': {
    name: 'Jason Bloome',
    email: 'jason@carehomefinders.com',
    role: 'Admin'
  },
  'Jesse Bloome': {
    name: 'Jesse Bloome', 
    email: 'jesse@carehomefinders.com',
    role: 'Admin'
  },
  'John Amber': {
    name: 'John Amber',
    email: 'john@carehomefinders.com',
    role: 'Staff'
  },
  'Leidy Kanjanapitak': {
    name: 'Leidy Kanjanapitak',
    email: 'leidy@carehomefinders.com',
    role: 'Staff'
  },
  'Nick Jaksic': {
    name: 'Nick Jaksic',
    email: 'nick@carehomefinders.com',
    role: 'Staff'
  },
  'Tang Kanjanapitak': {
    name: 'Tang Kanjanapitak',
    email: 'tang@carehomefinders.com',
    role: 'Staff'
  }
};

/**
 * Get staff member email by name
 */
export function getStaffEmail(staffName: string): string | null {
  const staff = STAFF_DIRECTORY[staffName];
  return staff?.email || null;
}

/**
 * Get all staff members
 */
export function getAllStaff(): StaffMember[] {
  return Object.values(STAFF_DIRECTORY);
}

/**
 * Check if staff member exists
 */
export function isValidStaffMember(staffName: string): boolean {
  return staffName in STAFF_DIRECTORY;
}

/**
 * Get staff member details
 */
export function getStaffMember(staffName: string): StaffMember | null {
  return STAFF_DIRECTORY[staffName] || null;
}