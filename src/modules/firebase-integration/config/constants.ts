// Firebase Integration Configuration
// Centralized configuration for all Firebase operations

export const FIREBASE_CONFIG = {
  // Collection Names
  COLLECTIONS: {
    USERS: 'users',
    APPLICATIONS: 'applications',
    NOTIFICATIONS: 'notifications',
    ACTIVITY_LOGS: 'activityLogs',
    LOGIN_LOGS: 'loginLogs',
    MEMBER_NOTES: 'memberNotes',
    ROLES_ADMIN: 'roles_admin',
    ROLES_SUPER_ADMIN: 'roles_super_admin',
    ADMIN_SETTINGS: 'admin-settings'
  },

  // Query Limits
  LIMITS: {
    DEFAULT_PAGE_SIZE: 25,
    MAX_PAGE_SIZE: 100,
    NOTIFICATIONS_LIMIT: 50,
    ACTIVITY_LOGS_LIMIT: 100,
    SEARCH_RESULTS_LIMIT: 50
  },

  // Cache Configuration
  CACHE: {
    USER_PERMISSIONS_TTL: 300000, // 5 minutes
    COLLECTION_TTL: 60000, // 1 minute
    DOCUMENT_TTL: 30000, // 30 seconds
    MAX_CACHE_SIZE: 1000
  },

  // Real-time Subscription Settings
  REALTIME: {
    RECONNECT_DELAY: 1000,
    MAX_RECONNECT_ATTEMPTS: 5,
    HEARTBEAT_INTERVAL: 30000,
    SUBSCRIPTION_TIMEOUT: 10000
  },

  // Error Handling
  ERROR_CODES: {
    AUTH_FAILED: 'FIREBASE_AUTH_FAILED',
    PERMISSION_DENIED: 'FIREBASE_PERMISSION_DENIED',
    NOT_FOUND: 'FIREBASE_NOT_FOUND',
    NETWORK_ERROR: 'FIREBASE_NETWORK_ERROR',
    QUOTA_EXCEEDED: 'FIREBASE_QUOTA_EXCEEDED',
    INVALID_DATA: 'FIREBASE_INVALID_DATA',
    FUNCTION_ERROR: 'FIREBASE_FUNCTION_ERROR',
    STORAGE_ERROR: 'FIREBASE_STORAGE_ERROR'
  },

  // Retry Configuration
  RETRY: {
    MAX_RETRIES: 3,
    BASE_DELAY: 1000,
    MAX_DELAY: 10000,
    BACKOFF_MULTIPLIER: 2
  },

  // Function Configuration
  FUNCTIONS: {
    TIMEOUT: 60000, // 60 seconds
    REGION: 'us-central1',
    DEFAULT_RETRIES: 2
  },

  // Storage Configuration
  STORAGE: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    UPLOAD_TIMEOUT: 300000, // 5 minutes
    THUMBNAIL_SIZE: 200
  },

  // Validation Rules
  VALIDATION: {
    EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PASSWORD_MIN_LENGTH: 8,
    MAX_DOCUMENT_SIZE: 1000, // Max fields in a document
    MAX_ARRAY_SIZE: 100,
    MAX_STRING_LENGTH: 1000,
    REQUIRED_USER_FIELDS: ['email', 'uid'],
    REQUIRED_APPLICATION_FIELDS: ['memberFirstName', 'memberLastName', 'createdBy']
  },

  // Notification Settings
  NOTIFICATIONS: {
    PRIORITIES: ['low', 'medium', 'high', 'urgent'] as const,
    TYPES: ['system', 'member_note', 'staff_note', 'reminder'] as const,
    AUTO_MARK_READ_DELAY: 30000, // 30 seconds
    MAX_RECIPIENTS: 50
  },

  // Admin Permissions
  PERMISSIONS: {
    READ_USERS: 'read:users',
    WRITE_USERS: 'write:users',
    READ_APPLICATIONS: 'read:applications',
    WRITE_APPLICATIONS: 'write:applications',
    READ_NOTIFICATIONS: 'read:notifications',
    WRITE_NOTIFICATIONS: 'write:notifications',
    ADMIN_PANEL: 'access:admin',
    SUPER_ADMIN: 'access:super_admin',
    MANAGE_ROLES: 'manage:roles',
    VIEW_ANALYTICS: 'view:analytics'
  },

  // Performance Monitoring
  PERFORMANCE: {
    SLOW_QUERY_THRESHOLD: 2000, // 2 seconds
    MEMORY_WARNING_THRESHOLD: 100 * 1024 * 1024, // 100MB
    ENABLE_METRICS: process.env.NODE_ENV === 'production'
  }
} as const;

// Type-safe access to configuration
export type FirebaseConfigType = typeof FIREBASE_CONFIG;