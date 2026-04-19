const FUNCTION_SECRET_REQUIREMENTS: Record<string, string[]> = {
  fetchKaiserMembersFromCaspio: ['CASPIO_BASE_URL', 'CASPIO_CLIENT_ID', 'CASPIO_CLIENT_SECRET'],
  updateKaiserMemberDates: ['CASPIO_BASE_URL', 'CASPIO_CLIENT_ID', 'CASPIO_CLIENT_SECRET'],
  caspioCalAIMNotesWebhook: ['CASPIO_BASE_URL', 'CASPIO_CLIENT_ID', 'CASPIO_CLIENT_SECRET', 'CASPIO_WEBHOOK_SECRET'],
  caspioClientNotesWebhook: ['CASPIO_BASE_URL', 'CASPIO_CLIENT_ID', 'CASPIO_CLIENT_SECRET', 'CASPIO_WEBHOOK_SECRET'],
  caspioWebhook: ['CASPIO_WEBHOOK_SECRET'],
  caspioH2022ClaimsWebhook: ['CASPIO_WEBHOOK_SECRET'],
  caspioT2038ClaimsWebhook: ['CASPIO_WEBHOOK_SECRET'],
  caspioRcfeRegistrationWebhook: ['CASPIO_WEBHOOK_SECRET'],
  caspioUsersRegistrationWebhook: ['CASPIO_WEBHOOK_SECRET'],
  syncCaspioMembersCacheIncremental: ['CRON_SECRET'],
  syncCaspioMembersCacheFull: ['CRON_SECRET'],
  syncKaiserMidnightPreload: ['CRON_SECRET'],
  sendDocumentReminders: ['RESEND_API_KEY'],
  triggerDocumentReminders: ['RESEND_API_KEY'],
  sendCsSummaryReminders: ['RESEND_API_KEY'],
  triggerCsSummaryReminders: ['RESEND_API_KEY'],
  send2FACode: ['RESEND_API_KEY'],
  authenticateGoogleDrive: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  scanCalAIMDriveFolders: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_SERVICE_ACCOUNT_KEY'],
  migrateDriveFoldersToFirebase: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_SERVICE_ACCOUNT_KEY'],
  searchClientIDFiles: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  getCalAIMFolderStructure: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  matchDriveFoldersWithCaspio: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  autoImportHighConfidenceMatches: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  importLegacyMembersFromDrive: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  refreshLegacyMemberData: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  searchLegacyMembers: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
};

let validatedTargets = new Set<string>();

export function validateFunctionTargetEnvironment(): void {
  const target = String(process.env.FUNCTION_TARGET || '').trim();
  if (!target || validatedTargets.has(target)) return;
  validatedTargets.add(target);

  const required = FUNCTION_SECRET_REQUIREMENTS[target];
  if (!required || !required.length) return;

  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (!missing.length) return;

  const isProduction = process.env.NODE_ENV === 'production' && !process.env.FUNCTIONS_EMULATOR;
  const message = `[functions env] ${target} missing required secrets/env: ${missing.join(', ')}`;
  if (isProduction) {
    throw new Error(message);
  }

  console.warn(`${message}. Running in non-production mode; validation is warn-only.`);
}
