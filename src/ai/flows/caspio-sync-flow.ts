'use server';
/**
 * @fileOverview Direct Caspio API integration flow to replace Make.com webhook.
 * 
 * This flow handles syncing application data directly to Caspio database
 * without the need for Make.com as a middleman.
 */
import '@/ai/firebase';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { syncToCaspio, testCaspioConnection } from '@/lib/caspio-api';
import * as admin from 'firebase-admin';

// Input schema for the Caspio sync flow
const CaspioSyncInputSchema = z.object({
  userId: z.string().describe("The Firebase UID of the user"),
  applicationId: z.string().describe("The application ID to sync"),
  isUpdate: z.boolean().default(false).describe("Whether this is an update or new record"),
  testConnection: z.boolean().default(false).describe("Whether to test connection only"),
});

// Output schema for the Caspio sync flow
const CaspioSyncOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  applicationId: z.string().optional(),
  error: z.any().optional(),
});

export type CaspioSyncInput = z.infer<typeof CaspioSyncInputSchema>;
export type CaspioSyncOutput = z.infer<typeof CaspioSyncOutputSchema>;

/**
 * Main function to sync application data to Caspio
 */
export async function syncApplicationToCaspio(input: CaspioSyncInput): Promise<CaspioSyncOutput> {
  return caspioSyncFlow(input);
}

/**
 * Test Caspio connection
 */
export async function testCaspioApiConnection(): Promise<CaspioSyncOutput> {
  return caspioSyncFlow({ 
    userId: 'test', 
    applicationId: 'test', 
    isUpdate: false,
    testConnection: true 
  });
}

const caspioSyncFlow = ai.defineFlow(
  {
    name: 'caspioSyncFlow',
    inputSchema: CaspioSyncInputSchema,
    outputSchema: CaspioSyncOutputSchema,
  },
  async (input) => {
    const { userId, applicationId, isUpdate, testConnection } = input;
    
    try {
      // If this is just a connection test
      if (testConnection) {
        console.log('[CaspioSyncFlow] Testing Caspio connection...');
        const testResult = await testCaspioConnection();
        
        return {
          success: testResult.success,
          message: testResult.message,
          error: testResult.error,
        };
      }
      
      console.log('[CaspioSyncFlow] Starting sync process...', { userId, applicationId, isUpdate });
      
      // Get the application data from Firestore
      const firestore = admin.firestore();
      const docRef = firestore.doc(`users/${userId}/applications/${applicationId}`);
      const docSnap = await docRef.get();
      
      if (!docSnap.exists) {
        throw new Error(`Application ${applicationId} not found for user ${userId}`);
      }
      
      const applicationData = docSnap.data();
      if (!applicationData) {
        throw new Error(`Application ${applicationId} has no data`);
      }
      
      console.log('[CaspioSyncFlow] Retrieved application data, syncing to Caspio...');
      
      // Sync to Caspio
      const syncResult = await syncToCaspio(applicationData, isUpdate);
      
      if (syncResult.success) {
        // Update the Firebase record to indicate successful sync
        await docRef.update({
          caspioSyncStatus: 'synced',
          caspioSyncDate: admin.firestore.FieldValue.serverTimestamp(),
          lastCaspioSync: new Date().toISOString(),
        });
        
        console.log('[CaspioSyncFlow] Successfully synced to Caspio and updated Firebase');
      } else {
        // Update Firebase to indicate sync failure
        await docRef.update({
          caspioSyncStatus: 'failed',
          caspioSyncError: syncResult.message,
          caspioSyncDate: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.error('[CaspioSyncFlow] Caspio sync failed:', syncResult.message);
      }
      
      return {
        success: syncResult.success,
        message: syncResult.message,
        applicationId: applicationId,
        error: syncResult.error,
      };
      
    } catch (error: any) {
      console.error('[CaspioSyncFlow] Flow execution failed:', error);
      
      // Try to update Firebase with the error (if we have valid IDs)
      if (userId && applicationId && !testConnection) {
        try {
          const firestore = admin.firestore();
          const docRef = firestore.doc(`users/${userId}/applications/${applicationId}`);
          await docRef.update({
            caspioSyncStatus: 'failed',
            caspioSyncError: error.message,
            caspioSyncDate: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (updateError) {
          console.error('[CaspioSyncFlow] Failed to update Firebase with error:', updateError);
        }
      }
      
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        applicationId: applicationId,
        error: error.message,
      };
    }
  }
);

/**
 * Batch sync multiple applications to Caspio
 */
export async function batchSyncToCaspio(userId: string, applicationIds: string[]): Promise<CaspioSyncOutput[]> {
  console.log('[CaspioSyncFlow] Starting batch sync for', applicationIds.length, 'applications');
  
  const results: CaspioSyncOutput[] = [];
  
  for (const applicationId of applicationIds) {
    try {
      const result = await syncApplicationToCaspio({
        userId,
        applicationId,
        isUpdate: true, // Assume updates for batch operations
        testConnection: false
      });
      results.push(result);
      
      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error: any) {
      results.push({
        success: false,
        message: `Batch sync failed for ${applicationId}: ${error.message}`,
        applicationId,
        error: error.message,
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log('[CaspioSyncFlow] Batch sync completed:', successCount, 'of', results.length, 'succeeded');
  
  return results;
}