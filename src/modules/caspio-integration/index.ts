// Caspio Integration Module - Barrel Export
// Centralized access point for all Caspio functionality

// Services
export { CaspioService } from './services/CaspioService';
export { CaspioAuthService } from './services/CaspioAuthService';
export { CaspioMemberService } from './services/CaspioMemberService';
export { CaspioNotesService } from './services/CaspioNotesService';

// Hooks
export { useCaspioAuth } from './hooks/useCaspioAuth';
export { useCaspioMembers } from './hooks/useCaspioMembers';
export { useCaspioNotes } from './hooks/useCaspioNotes';
export { useCaspioSync } from './hooks/useCaspioSync';

// Types
export type {
  CaspioMember,
  CaspioNote,
  CaspioStaff,
  CaspioAuthToken,
  CaspioSyncStatus,
  CaspioApiResponse,
  CaspioError
} from './types';

// Constants
export { CASPIO_CONFIG } from './config/constants';

// Utils
export { CaspioErrorHandler } from './utils/errorHandler';
export { CaspioDataValidator } from './utils/dataValidator';