import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { validateFunctionTargetEnvironment } from "./env-validation";

validateFunctionTargetEnvironment();

// Export Google Drive migration functions
export { authenticateGoogleDrive, scanCalAIMDriveFolders, migrateDriveFoldersToFirebase } from './google-drive';

// Export Google Drive search functions
export { 
  searchClientIDFiles, 
  getCalAIMFolderStructure 
} from './google-drive-search';

// Export intelligent name matching functions
export {
  matchDriveFoldersWithCaspio,
  autoImportHighConfidenceMatches
} from './intelligent-name-matching';

// Export Smart Sync and Duplicate Prevention functions
export { checkSyncStatus, performManualSync, checkForDuplicateClients, resolveDuplicateClients } from './smart-sync';

// Export Auto-Sync and Batch Sync functions
export { performAutoSync, getPendingSyncs, performBatchSync } from './auto-batch-sync';

// Export Caspio Webhook functions
export { caspioWebhook } from './caspio-webhooks';
export { caspioH2022ClaimsWebhook, caspioT2038ClaimsWebhook } from './caspio-claims-webhooks';
export { caspioRcfeRegistrationWebhook } from './caspio-rcfe-webhook';
export { caspioUsersRegistrationWebhook } from './caspio-usersregistration-webhook';

// Export Caspio note monitoring functions (READ-ONLY)
export {
  monitorCaspioPriorityNotes,
  testPriorityNoteMonitoring,
  getPriorityNotesForDashboard
} from './caspio-note-monitor';

// Export morning digest notifications
export { sendMorningNoteDigest } from './morning-notifications';

// Export Caspio Member Sync Test functions
export { testCaspioMemberSync } from './caspio-member-sync-test';

// Simple test function to verify Firebase Functions connectivity
export const simpleTest = onCall({
  cors: [
    /localhost/,
    /\.vercel\.app$/,
    /\.netlify\.app$/,
    /\.firebaseapp\.com$/
  ]
}, async (request) => {
  return {
    success: true,
    message: "Firebase Functions is working correctly!",
    timestamp: new Date().toISOString(),
    userAuth: !!request.auth,
    userUid: request.auth?.uid || null
  };
});

// Export Email Notification functions
export { sendManualNotification } from './email-notifications';

// Export Resend Email functions
export { 
  sendResendNotification,
  sendDocumentUploadNotification,
  sendCsSummaryCompletionNotification,
  sendKaiserStatusUpdateNotification
} from './resend-email-service';

// Export Intelligent Matching functions
export {
  getAllCalAIMFolders,
  getAllCaspioMembers,
  generateMatchingSuggestions,
  applyMatchingSuggestions
} from './intelligent-matching';

// Export Comprehensive Drive Matching functions
export {
  scanAllCalAIMFolders,
  getAllCaspioMembersComprehensive,
  generateComprehensiveMatching,
  applyConfirmedMatches
} from './comprehensive-drive-matching';

// Export Legacy Member Search functions
export {
  importLegacyMembersFromDrive,
  refreshLegacyMemberData,
  searchLegacyMembers,
  testGoogleDriveConnection
} from './legacy-member-search';

// Export Staff Notification System functions
export {
  getStaffNotificationSettings,
  updateStaffNotificationSettings,
  sendTestStaffNotification,
  logStaffNote,
  getSystemNoteLog,
  markNoteAsRead
} from './staff-notification-system';

// Export Caspio Note Webhook functions
export {
  caspioCalAIMNotesWebhook,
  caspioClientNotesWebhook,
  getStaffNotes,
  markNotificationsRead,
  getMemberNotes,
  addStaffNote,
  getAllNotes,
  getStaffMemberNotes,
} from './caspio-note-webhooks';

// Export Manual Notification functions (alternative to Firestore triggers)
export { 
  checkForNewDocuments, 
  checkForCompletedCsSummaries, 
  sendDocumentUploadNotifications, 
  sendCsSummaryNotifications 
} from './manual-notifications';

// Export Two-Factor Authentication functions
export { 
  send2FACode, 
  verify2FACode, 
  check2FAStatus, 
  update2FAPreferences 
} from './two-factor-auth';

// Export Task and Note Management functions
export {
  createMemberTask,
  getMemberTasks,
  updateMemberTask,
  getDailyTasks,
  createMemberNote,
  createNoteReply,
  updateMemberNote,
  markNotesAsRead
} from './task-note-management';

// Export Notification Settings functions
export {
  getNotificationSettings,
  updateNotificationSettings,
  checkNotificationPermissions,
  sendNotificationWithSettings
} from './notification-settings';

// ERA Parser (Health Net) - server-side parsing for large PDFs
export { parseEraPdfFromStorage } from './era-parser';

// Export Login Tracking functions
export {
  logUserActivity,
  getLoginLogs,
  getActiveSessions,
  forceUserLogout,
  updateUserActivity,
  cleanupOldLogs
} from './login-tracking';

// Export Document Reminder functions
export { 
  sendDocumentReminders,
  triggerDocumentReminders
} from './document-reminders';

// Export CS Summary Reminder functions
export {
  sendCsSummaryReminders,
  triggerCsSummaryReminders
} from './cs-summary-reminders';

// Export Caspio members cache sync schedulers (SW portal freshness)
export {
  syncCaspioMembersCacheIncremental,
  syncCaspioMembersCacheFull,
  syncKaiserMidnightPreload
} from './caspio-members-cache-sync';

if (!admin.apps.length) {
  admin.initializeApp();
}

// Run every day at 9:00 AM (Los Angeles time)
export const checkMissingForms = onSchedule({
  schedule: "0 9 * * *",
  timeZone: "America/Los_Angeles",
}, async (event) => {

  const db = admin.firestore();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  console.log("🔍 Checking for missing forms created before:", sevenDaysAgo);

  // Find applications that are 'Incomplete' and older than 7 days
  const snapshot = await db.collection("applications")
    .where("status", "==", "Incomplete")
    .where("createdAt", "<", sevenDaysAgo)
    .get();

  if (snapshot.empty) {
    console.log("✅ No missing forms found.");
    return;
  }

  // Loop through the results
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`⚠️ Found Missing Form: Client ${data.clientName} (ID: ${doc.id})`);
  });
});

// Kaiser member fetch and date update (active callables)
export { fetchKaiserMembersFromCaspio, updateKaiserMemberDates } from './caspio-kaiser';

// Authorization Tracker (updateMemberAuthorization is called from UpdateAuthorizationDialog)
export { updateMemberAuthorization } from './authorization-tracker';

// Client Note Notification functions
export {
  sendNoteNotification,
  getUserNotifications,
  markNotificationRead,
  registerFCMToken
} from './client-note-notifications';
