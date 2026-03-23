import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { buildCaspioConfig, getCaspioAccessTokenFromConfig } from "./caspio-auth";

const caspioBaseUrl = defineSecret("CASPIO_BASE_URL");
const caspioClientId = defineSecret("CASPIO_CLIENT_ID");
const caspioClientSecret = defineSecret("CASPIO_CLIENT_SECRET");

function getCaspioConfig() {
  const rawBaseUrl = (caspioBaseUrl.value() || process.env.CASPIO_BASE_URL || '').trim();
  const clientId = (caspioClientId.value() || process.env.CASPIO_CLIENT_ID || '').trim();
  const clientSecret = (caspioClientSecret.value() || process.env.CASPIO_CLIENT_SECRET || '').trim();

  if (!rawBaseUrl || !clientId || !clientSecret) {
    throw new HttpsError('failed-precondition', 'Caspio credentials are not configured.');
  }

  const config = buildCaspioConfig(rawBaseUrl, clientId, clientSecret);
  return { hostBaseUrl: config.oauthBaseUrl, restBaseUrl: config.restBaseUrl, clientId: config.clientId, clientSecret: config.clientSecret };
}

async function getCaspioAccessToken(): Promise<{ accessToken: string; restBaseUrl: string }> {
  const config = getCaspioConfig();
  try {
    const accessToken = await getCaspioAccessTokenFromConfig(
      buildCaspioConfig(config.hostBaseUrl, config.clientId, config.clientSecret)
    );
    return { accessToken, restBaseUrl: config.restBaseUrl };
  } catch {
    throw new HttpsError('internal', 'Failed to get Caspio access token');
  }
}

// Auto-sync function for immediate field changes
export const performAutoSync = onCall({
  secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret]
}, async (request) => {
  try {
    const { applicationId, clientId, memberData, changedFields, triggerType } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!applicationId || !clientId || !changedFields || changedFields.length === 0) {
      throw new HttpsError('invalid-argument', 'Required data missing for auto-sync');
    }
    
    console.log(`🔄 Auto-sync triggered: ${triggerType} - ${changedFields.join(', ')}`);
    
    // Prepare update data with only changed fields
    const updateData: any = {
      LastUpdated: new Date().toISOString(),
      AutoSyncedBy: request.auth.uid,
      AutoSyncedAt: new Date().toISOString(),
      SyncTrigger: triggerType
    };
    
    // Map changed fields to Caspio format
    const fieldMapping: Record<string, string> = {
      'Kaiser_Status': 'Kaiser_Status',
      'CalAIM_Status': 'CalAIM_Status',
      'kaiser_user_assignment': 'Kaiser_User_Assignment',
      'memberFirstName': 'Senior_First',
      'memberLastName': 'Senior_Last',
      'memberMrn': 'MCP_CIN',
      'memberCounty': 'Member_County',
      'pathway': 'SNF_Diversion_or_Transition'
    };
    
    // Only include changed fields in update
    changedFields.forEach((field: string) => {
      const caspioField = fieldMapping[field];
      if (caspioField && memberData[field] !== undefined) {
        updateData[caspioField] = memberData[field];
      }
    });
    
    // EMERGENCY DISABLE: Update Caspio record - DISABLED TO PREVENT CASPIO INTERFERENCE
    console.log('🚨 EMERGENCY: Auto-batch sync Caspio UPDATE operations disabled to prevent RCFE/Social Worker access interference');
    console.log('✅ Auto-batch sync Caspio UPDATE DISABLED - preventing interference');
    
    // Update Firestore sync status
    const db = admin.firestore();
    await db.collection('sync-status').doc(clientId).set({
      clientId,
      applicationId,
      lastSynced: admin.firestore.FieldValue.serverTimestamp(),
      lastAutoSynced: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncedData: memberData,
      syncedBy: request.auth.uid,
      changedFields: changedFields,
      syncMethod: 'auto',
      triggerType: triggerType
    }, { merge: true });
    
    // Log auto-sync activity
    await db.collection('sync-logs').add({
      clientId,
      applicationId,
      syncType: 'auto',
      triggerType,
      changedFields,
      syncedBy: request.auth.uid,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });
    
    console.log(`✅ Auto-sync completed for client: ${clientId} - ${changedFields.join(', ')}`);
    
    return {
      success: true,
      message: `Auto-synced ${changedFields.length} field(s) to Caspio`,
      syncedFields: changedFields,
      syncType: 'auto'
    };
    
  } catch (error: any) {
    console.error('❌ Error performing auto-sync:', error);
    
    // Log failed auto-sync
    if (request.data.clientId) {
      const db = admin.firestore();
      await db.collection('sync-logs').add({
        clientId: request.data.clientId,
        applicationId: request.data.applicationId,
        syncType: 'auto',
        triggerType: request.data.triggerType,
        changedFields: request.data.changedFields,
        syncedBy: request.auth?.uid,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        success: false,
        error: error.message
      });
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Auto-sync failed: ${error.message}`);
  }
});

// Get pending sync items
export const getPendingSyncs = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    console.log('📋 Loading pending sync items');
    
    const db = admin.firestore();
    
    // Get all applications that need syncing
    const applicationsQuery = db.collection('applications')
      .where('needsSync', '==', true)
      .orderBy('lastModified', 'desc')
      .limit(100);
    
    const applicationsSnapshot = await applicationsQuery.get();
    
    const pendingItems: any[] = [];
    const stats = {
      total: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      inProgress: 0
    };
    
    for (const doc of applicationsSnapshot.docs) {
      const data = doc.data();
      const clientId = data.client_ID2;
      
      if (!clientId) continue;
      
      // Get sync status
      const syncStatusDoc = await db.collection('sync-status').doc(clientId).get();
      const syncStatus = syncStatusDoc.exists ? syncStatusDoc.data() : null;
      
      // Determine changed fields
      const changedFields = await detectChangedFields(data, syncStatus?.lastSyncedData);
      
      if (changedFields.length > 0) {
        const priority = determinePriority(changedFields, data);
        const status = determineStatus(syncStatus);
        
        pendingItems.push({
          id: doc.id,
          clientId: clientId,
          memberName: `${data.memberFirstName} ${data.memberLastName}`,
          changedFields: changedFields,
          lastModified: data.lastModified?.toDate() || new Date(),
          priority: priority,
          status: status,
          error: syncStatus?.lastError
        });
        
        // Update stats
        stats.total++;
        switch (status) {
          case 'pending': stats.pending++; break;
          case 'completed': stats.completed++; break;
          case 'failed': stats.failed++; break;
          case 'syncing': stats.inProgress++; break;
        }
      }
    }
    
    console.log(`✅ Found ${pendingItems.length} pending sync items`);
    
    return {
      success: true,
      pendingItems: pendingItems,
      stats: stats
    };
    
  } catch (error: any) {
    console.error('❌ Error getting pending syncs:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to get pending syncs: ${error.message}`);
  }
});

// Perform batch sync
export const performBatchSync = onCall({
  secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret]
}, async (request) => {
  try {
    const { itemIds, batchSize = 5 } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!itemIds || itemIds.length === 0) {
      throw new HttpsError('invalid-argument', 'Item IDs are required for batch sync');
    }
    
    console.log(`🔄 Starting batch sync for ${itemIds.length} items`);
    
    const db = admin.firestore();
    const results = {
      total: itemIds.length,
      successCount: 0,
      failureCount: 0,
      errors: [] as string[]
    };
    
    // Process items in batches
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (itemId: string) => {
        try {
          // Get application data
          const appDoc = await db.collection('applications').doc(itemId).get();
          if (!appDoc.exists) {
            throw new Error(`Application ${itemId} not found`);
          }
          
          const appData = appDoc.data();
          const clientId = appData?.client_ID2;
          
          if (!clientId) {
            throw new Error(`No client_ID2 for application ${itemId}`);
          }
          
          // Get sync status
          const syncStatusDoc = await db.collection('sync-status').doc(clientId).get();
          const syncStatus = syncStatusDoc.exists ? syncStatusDoc.data() : null;
          
          // Detect changed fields
          const changedFields = await detectChangedFields(appData, syncStatus?.lastSyncedData);
          
          if (changedFields.length === 0) {
            console.log(`⏭️ No changes for ${clientId}, skipping`);
            return { success: true, clientId, message: 'No changes to sync' };
          }
          
          // Perform sync using the same logic as manual sync
          const syncResult = await performSingleSync(clientId, itemId, appData, changedFields, request.auth!.uid);
          
          results.successCount++;
          return syncResult;
          
        } catch (error: any) {
          console.error(`❌ Batch sync failed for item ${itemId}:`, error);
          results.failureCount++;
          results.errors.push(`${itemId}: ${error.message}`);
          return { success: false, error: error.message };
        }
      });
      
      // Wait for current batch to complete
      await Promise.allSettled(batchPromises);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < itemIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Batch sync completed: ${results.successCount}/${results.total} successful`);
    
    return {
      success: true,
      results: results,
      message: `Batch sync completed: ${results.successCount}/${results.total} successful`
    };
    
  } catch (error: any) {
    console.error('❌ Error performing batch sync:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Batch sync failed: ${error.message}`);
  }
});

// Helper function to perform single sync
async function performSingleSync(clientId: string, applicationId: string, memberData: any, changedFields: string[], userId: string) {
  // Get Caspio access token
  const { accessToken, restBaseUrl } = await getCaspioAccessToken();
  
  // Prepare update data
  const updateData: any = {
    LastUpdated: new Date().toISOString(),
    BatchSyncedBy: userId,
    BatchSyncedAt: new Date().toISOString()
  };
  
  // Map changed fields to Caspio format
  const fieldMapping: Record<string, string> = {
    'Kaiser_Status': 'Kaiser_Status',
    'CalAIM_Status': 'CalAIM_Status',
    'kaiser_user_assignment': 'Kaiser_User_Assignment',
    'memberFirstName': 'Senior_First',
    'memberLastName': 'Senior_Last',
    'memberMrn': 'MCP_CIN',
    'memberCounty': 'Member_County',
    'pathway': 'SNF_Diversion_or_Transition'
  };
  
  changedFields.forEach((field: string) => {
    const caspioField = fieldMapping[field];
    if (caspioField && memberData[field] !== undefined) {
      updateData[caspioField] = memberData[field];
    }
  });
  
  // Update Caspio record
  const membersTable = 'CalAIM_tbl_Members';
  const updateUrl = `${restBaseUrl}/tables/${membersTable}/records?q.where=client_ID2='${clientId}'`;
  
  const updateResponse = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData),
  });
  
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Failed to update Caspio: ${updateResponse.status} ${errorText}`);
  }
  
  // Update Firestore sync status
  const db = admin.firestore();
  await db.collection('sync-status').doc(clientId).set({
    clientId,
    applicationId,
    lastSynced: admin.firestore.FieldValue.serverTimestamp(),
    lastBatchSynced: admin.firestore.FieldValue.serverTimestamp(),
    lastSyncedData: memberData,
    syncedBy: userId,
    changedFields: changedFields,
    syncMethod: 'batch'
  }, { merge: true });
  
  // Clear needsSync flag
  await db.collection('applications').doc(applicationId).update({
    needsSync: false,
    lastSynced: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    success: true,
    clientId,
    syncedFields: changedFields,
    message: `Synced ${changedFields.length} fields`
  };
}

// Helper functions
async function detectChangedFields(currentData: any, lastSyncedData: any): Promise<string[]> {
  if (!lastSyncedData) {
    // First sync - consider key fields as changed
    return ['Kaiser_Status', 'CalAIM_Status', 'kaiser_user_assignment'];
  }
  
  const changedFields: string[] = [];
  const fieldsToCheck = [
    'Kaiser_Status', 'CalAIM_Status', 'kaiser_user_assignment',
    'memberFirstName', 'memberLastName', 'memberMrn',
    'memberCounty', 'pathway'
  ];
  
  fieldsToCheck.forEach(field => {
    if (currentData[field] !== lastSyncedData[field] && currentData[field] !== undefined) {
      changedFields.push(field);
    }
  });
  
  return changedFields;
}

function determinePriority(changedFields: string[], memberData: any): 'high' | 'medium' | 'low' {
  // High priority for status changes
  if (changedFields.includes('Kaiser_Status') || changedFields.includes('CalAIM_Status')) {
    return 'high';
  }
  
  // Medium priority for assignment changes
  if (changedFields.includes('kaiser_user_assignment')) {
    return 'medium';
  }
  
  // Low priority for other fields
  return 'low';
}

function determineStatus(syncStatus: any): 'pending' | 'syncing' | 'completed' | 'failed' {
  if (!syncStatus) return 'pending';
  
  if (syncStatus.lastError) return 'failed';
  if (syncStatus.syncInProgress) return 'syncing';
  if (syncStatus.lastSynced) return 'completed';
  
  return 'pending';
}