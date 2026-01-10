import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Webhook endpoint for Caspio to notify us of changes
export const caspioWebhook = onRequest({
  cors: true
}, async (req, res) => {
  try {
    // Verify this is a POST request
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    // Verify webhook signature (if Caspio provides one)
    // const signature = req.headers['x-caspio-signature'];
    // if (!verifyWebhookSignature(req.body, signature)) {
    //   res.status(401).json({ error: 'Invalid signature' });
    //   return;
    // }
    
    const webhookData = req.body;
    console.log('📨 Caspio webhook received:', JSON.stringify(webhookData, null, 2));
    
    // Extract relevant data from webhook
    const {
      table_name,
      operation, // INSERT, UPDATE, DELETE
      record_data,
      changed_fields
    } = webhookData;
    
    // Only process CalAIM_tbl_Members table
    if (table_name !== 'CalAIM_tbl_Members') {
      console.log(`⏭️ Ignoring webhook for table: ${table_name}`);
      res.status(200).json({ message: 'Webhook received but ignored' });
      return;
    }
    
    const clientId = record_data?.client_ID2;
    if (!clientId) {
      console.log('⚠️ No client_ID2 in webhook data');
      res.status(200).json({ message: 'No client_ID2 found' });
      return;
    }
    
    console.log(`🔄 Processing ${operation} for client: ${clientId}`);
    
    const db = admin.firestore();
    
    // Find the corresponding Firestore application
    const applicationsQuery = db.collection('applications')
      .where('client_ID2', '==', clientId)
      .limit(1);
    
    const applicationsSnapshot = await applicationsQuery.get();
    
    if (applicationsSnapshot.empty) {
      console.log(`⚠️ No Firestore application found for client: ${clientId}`);
      res.status(200).json({ message: 'No matching application found' });
      return;
    }
    
    const applicationDoc = applicationsSnapshot.docs[0];
    const applicationData = applicationDoc.data();
    
    // Process different operations
    switch (operation) {
      case 'UPDATE':
        await handleCaspioUpdate(applicationDoc.id, applicationData, record_data, changed_fields);
        break;
      case 'INSERT':
        await handleCaspioInsert(record_data);
        break;
      case 'DELETE':
        await handleCaspioDelete(clientId);
        break;
      default:
        console.log(`⚠️ Unknown operation: ${operation}`);
    }
    
    // Log webhook activity
    await db.collection('webhook-logs').add({
      source: 'caspio',
      table: table_name,
      operation: operation,
      clientId: clientId,
      changedFields: changed_fields,
      recordData: record_data,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });
    
    console.log(`✅ Caspio webhook processed successfully for client: ${clientId}`);
    res.status(200).json({ 
      message: 'Webhook processed successfully',
      clientId: clientId,
      operation: operation
    });
    
  } catch (error: any) {
    console.error('❌ Error processing Caspio webhook:', error);
    
    // Log failed webhook
    const db = admin.firestore();
    await db.collection('webhook-logs').add({
      source: 'caspio',
      error: error.message,
      requestBody: req.body,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false
    });
    
    res.status(500).json({ 
      error: 'Webhook processing failed',
      message: error.message 
    });
  }
});

// Handle Caspio UPDATE operations
async function handleCaspioUpdate(applicationId: string, currentData: any, caspioData: any, changedFields: string[]) {
  const db = admin.firestore();
  
  // Map Caspio fields back to Firestore fields
  const fieldMapping: Record<string, string> = {
    'Kaiser_Status': 'Kaiser_Status',
    'CalAIM_Status': 'CalAIM_Status',
    'Kaiser_User_Assignment': 'kaiser_user_assignment',
    'Senior_First': 'memberFirstName',
    'Senior_Last': 'memberLastName',
    'MCP_CIN': 'memberMrn',
    'Member_County': 'memberCounty',
    'SNF_Diversion_or_Transition': 'pathway'
  };
  
  const updateData: any = {
    lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
    caspioWebhookReceived: admin.firestore.FieldValue.serverTimestamp()
  };
  
  // Only update fields that actually changed in Caspio
  changedFields.forEach(caspioField => {
    const firestoreField = fieldMapping[caspioField];
    if (firestoreField && caspioData[caspioField] !== undefined) {
      updateData[firestoreField] = caspioData[caspioField];
    }
  });
  
  // Update the Firestore application
  await db.collection('applications').doc(applicationId).update(updateData);
  
  // Update sync status
  await db.collection('sync-status').doc(caspioData.client_ID2).set({
    lastSyncedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
    caspioChangedFields: changedFields,
    syncDirection: 'caspio_to_firestore'
  }, { merge: true });
  
  console.log(`✅ Updated Firestore from Caspio: ${changedFields.join(', ')}`);
}

// Handle Caspio INSERT operations
async function handleCaspioInsert(caspioData: any) {
  console.log('📝 New record inserted in Caspio:', caspioData.client_ID2);
  
  // For now, just log the insert
  // In the future, you might want to create a corresponding Firestore record
  // or flag it for manual review
  
  const db = admin.firestore();
  await db.collection('caspio-inserts').add({
    clientId: caspioData.client_ID2,
    caspioData: caspioData,
    insertedAt: admin.firestore.FieldValue.serverTimestamp(),
    needsReview: true
  });
}

// Handle Caspio DELETE operations
async function handleCaspioDelete(clientId: string) {
  console.log('🗑️ Record deleted in Caspio:', clientId);
  
  const db = admin.firestore();
  
  // Find and flag the corresponding Firestore application
  const applicationsQuery = db.collection('applications')
    .where('client_ID2', '==', clientId)
    .limit(1);
  
  const applicationsSnapshot = await applicationsQuery.get();
  
  if (!applicationsSnapshot.empty) {
    const applicationDoc = applicationsSnapshot.docs[0];
    await applicationDoc.ref.update({
      deletedFromCaspio: admin.firestore.FieldValue.serverTimestamp(),
      needsReview: true
    });
  }
}