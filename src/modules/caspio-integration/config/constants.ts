// Caspio Integration Configuration
// Centralized configuration for all Caspio operations

function normalizeCaspioRestBaseUrl(raw: string): string {
  const input = String(raw || '').trim();
  if (!input) return 'https://c7ebl500.caspio.com/rest/v2';

  // Handle corrupted values by extracting domain.
  const domainMatch = input.match(/https?:\/\/([^\/\s]+)/i);
  const domain = domainMatch ? `https://${domainMatch[1]}` : input;

  // Remove duplicate protocol prefixes and whitespace.
  let base = domain.replace(/ffhttps:\/\//gi, 'https://').trim();

  // Ensure protocol.
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }

  // Remove any embedded /rest/v2 then re-append once.
  base = base.replace(/\/rest\/v2\/?/gi, '');
  base = base.replace(/\/+$/g, '');

  return `${base}/rest/v2`;
}

export const CASPIO_CONFIG = {
  // API Configuration
  BASE_URL: normalizeCaspioRestBaseUrl(
    process.env.NEXT_PUBLIC_CASPIO_BASE_URL ||
      process.env.CASPIO_BASE_URL ||
      'https://c7ebl500.caspio.com/rest/v2'
  ),
  
  // Table Names
  TABLES: {
    CLIENTS: 'connect_tbl_clients',
    CALAIM_MEMBERS: 'CalAIM_tbl_Members',
    MEMBER_NOTES: 'CalAIM_tbl_MemberNotes',
    STAFF: 'CalAIM_tbl_Staff',
    ILS_NOTES: 'CalAIM_tbl_ILSNotes'
  },
  
  // Authentication
  AUTH: {
    TOKEN_ENDPOINT: '/oauth/token',
    GRANT_TYPE: 'client_credentials',
    SCOPE: 'DataPageApi',
    TOKEN_BUFFER_TIME: 300000, // 5 minutes before expiry
  },
  
  // Sync Configuration
  SYNC: {
    BATCH_SIZE: 100,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 second
    HEALTH_CHECK_INTERVAL: 60000, // 1 minute
    CACHE_DURATION: 300000, // 5 minutes
  },
  
  // Field Mappings
  FIELD_MAPPINGS: {
    CLIENT_TO_MEMBER: {
      'First_Name': 'firstName',
      'Last_Name': 'lastName',
      'Senior_First': 'seniorFirst',
      'Senior_Last': 'seniorLast',
      'Email': 'email',
      'Phone': 'phone',
      'Address': 'address',
      'City': 'city',
      'State': 'state',
      'Zip_Code': 'zipCode',
      'Date_of_Birth': 'dateOfBirth',
      'Social_Worker': 'socialWorker',
      'RCFE_Name': 'rcfeName',
      'RCFE_Address': 'rcfeAddress'
    },
    NOTES: {
      'Member_ID': 'memberId',
      'Member_Name': 'memberName',
      'Note_Text': 'noteText',
      'Staff_Member': 'staffMember',
      'Priority': 'priority',
      'Category': 'category',
      'Is_ILS_Only': 'isILSOnly',
      'Created_Date': 'createdAt',
      'Updated_Date': 'updatedAt',
      'Is_Read': 'isRead'
    }
  },
  
  // Error Codes
  ERROR_CODES: {
    AUTH_FAILED: 'CASPIO_AUTH_FAILED',
    API_ERROR: 'CASPIO_API_ERROR',
    NETWORK_ERROR: 'CASPIO_NETWORK_ERROR',
    VALIDATION_ERROR: 'CASPIO_VALIDATION_ERROR',
    SYNC_ERROR: 'CASPIO_SYNC_ERROR',
    RATE_LIMIT: 'CASPIO_RATE_LIMIT'
  },
  
  // Rate Limiting
  RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 100,
    BURST_LIMIT: 10,
    COOLDOWN_PERIOD: 60000 // 1 minute
  },
  
  // Validation Rules
  VALIDATION: {
    MEMBER_ID_PATTERN: /^[A-Z]{2}-\d{5}$/,
    EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE_PATTERN: /^\(\d{3}\) \d{3}-\d{4}$/,
    MAX_NOTE_LENGTH: 5000,
    REQUIRED_MEMBER_FIELDS: ['firstName', 'lastName', 'id'],
    REQUIRED_NOTE_FIELDS: ['memberId', 'noteText', 'staffMember']
  }
} as const;

// Type-safe access to configuration
export type CaspioConfigType = typeof CASPIO_CONFIG;