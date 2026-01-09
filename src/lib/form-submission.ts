'use server';

import { syncApplicationToCaspio } from '@/ai/flows/caspio-sync-flow';
import * as admin from 'firebase-admin';

/**
 * Enhanced form submission handler that automatically syncs to Caspio
 */
export async function submitApplicationWithCaspioSync(
  userId: string,
  applicationId: string,
  applicationData: any,
  isUpdate: boolean = false
): Promise<{ success: boolean; message: string; error?: any }> {
  try {
    console.log('[FormSubmission] Starting application submission with Caspio sync...');
    
    // First, save to Firebase
    const firestore = admin.firestore();
    const docRef = firestore.doc(`users/${userId}/applications/${applicationId}`);
    
    const dataToSave = {
      ...applicationData,
      id: applicationId,
      userId: userId,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      // Add sync status tracking
      caspioSyncStatus: 'pending',
      caspioSyncAttempts: 0,
    };
    
    await docRef.set(dataToSave, { merge: true });
    console.log('[FormSubmission] Successfully saved to Firebase');
    
    // Then, sync to Caspio
    const syncResult = await syncApplicationToCaspio({
      userId,
      applicationId,
      isUpdate,
    });
    
    if (syncResult.success) {
      console.log('[FormSubmission] Successfully synced to Caspio');
      return {
        success: true,
        message: 'Application saved and synced to Caspio successfully',
      };
    } else {
      console.warn('[FormSubmission] Caspio sync failed, but Firebase save succeeded');
      return {
        success: true, // Firebase save succeeded
        message: 'Application saved to Firebase, but Caspio sync failed. Data will be retried automatically.',
        error: syncResult.error,
      };
    }
    
  } catch (error: any) {
    console.error('[FormSubmission] Critical error:', error);
    return {
      success: false,
      message: `Failed to save application: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Retry failed Caspio syncs
 */
export async function retryCaspioSync(
  userId: string,
  applicationId: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[FormSubmission] Retrying Caspio sync for application:', applicationId);
    
    const firestore = admin.firestore();
    const docRef = firestore.doc(`users/${userId}/applications/${applicationId}`);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new Error('Application not found');
    }
    
    const currentData = docSnap.data();
    const attempts = (currentData?.caspioSyncAttempts || 0) + 1;
    
    // Update attempt counter
    await docRef.update({
      caspioSyncAttempts: attempts,
      caspioSyncStatus: 'retrying',
      lastCaspioSyncAttempt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Attempt sync
    const syncResult = await syncApplicationToCaspio({
      userId,
      applicationId,
      isUpdate: true,
    });
    
    return syncResult;
    
  } catch (error: any) {
    console.error('[FormSubmission] Retry failed:', error);
    return {
      success: false,
      message: `Retry failed: ${error.message}`,
    };
  }
}