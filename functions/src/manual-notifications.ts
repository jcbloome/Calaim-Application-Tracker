import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Manual notification functions (alternative to Firestore triggers)
export const checkForNewDocuments = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    console.log('📄 Checking for new document uploads');
    
    const db = admin.firestore();
    
    // Get applications with new documents flag
    const applicationsQuery = db.collection('applications')
      .where('hasNewDocuments', '==', true)
      .limit(50);
    
    const applicationsSnapshot = await applicationsQuery.get();
    const newDocuments: any[] = [];
    
    for (const doc of applicationsSnapshot.docs) {
      const data = doc.data();
      const memberName = `${data.memberFirstName} ${data.memberLastName}`;
      const uploaderName = `${data.referrerFirstName} ${data.referrerLastName}`;
      const uploadedFiles = data.uploadedFiles || [];
      const newDocumentCount = data.newDocumentCount || 0;
      
      newDocuments.push({
        applicationId: doc.id,
        memberName,
        uploaderName,
        newDocumentCount,
        uploadedFiles: uploadedFiles.slice(-newDocumentCount), // Get the last N files
        lastDocumentUpload: data.lastDocumentUpload?.toDate()
      });
    }
    
    console.log(`✅ Found ${newDocuments.length} applications with new documents`);
    
    return {
      success: true,
      newDocuments,
      count: newDocuments.length
    };
    
  } catch (error: any) {
    console.error('❌ Error checking for new documents:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to check new documents: ${error.message}`);
  }
});

export const checkForCompletedCsSummaries = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    console.log('📋 Checking for completed CS Summary forms');
    
    const db = admin.firestore();
    
    // Get applications with completed CS Summary that haven't been notified
    const applicationsQuery = db.collection('applications')
      .where('csSummaryComplete', '==', true)
      .where('csSummaryNotificationSent', '!=', true)
      .limit(50);
    
    const applicationsSnapshot = await applicationsQuery.get();
    const completedSummaries: any[] = [];
    
    for (const doc of applicationsSnapshot.docs) {
      const data = doc.data();
      const memberName = `${data.memberFirstName} ${data.memberLastName}`;
      const referrerName = `${data.referrerFirstName} ${data.referrerLastName}`;
      
      completedSummaries.push({
        applicationId: doc.id,
        memberName,
        referrerName,
        healthPlan: data.healthPlan,
        memberCounty: data.memberCounty,
        completedAt: data.csSummaryCompletedAt?.toDate() || new Date()
      });
    }
    
    console.log(`✅ Found ${completedSummaries.length} completed CS Summary forms`);
    
    return {
      success: true,
      completedSummaries,
      count: completedSummaries.length
    };
    
  } catch (error: any) {
    console.error('❌ Error checking for completed CS summaries:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to check completed CS summaries: ${error.message}`);
  }
});

export const sendDocumentUploadNotifications = onCall(async (request) => {
  try {
    const { applicationIds } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!applicationIds || !Array.isArray(applicationIds)) {
      throw new HttpsError('invalid-argument', 'Application IDs array is required');
    }
    
    console.log(`📧 Sending document upload notifications for ${applicationIds.length} applications`);
    
    const db = admin.firestore();
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    for (const applicationId of applicationIds) {
      try {
        // Get application data
        const applicationDoc = await db.collection('applications').doc(applicationId).get();
        if (!applicationDoc.exists) {
          results.failed++;
          results.errors.push(`Application ${applicationId} not found`);
          continue;
        }
        
        const applicationData = applicationDoc.data()!;
        const memberName = `${applicationData.memberFirstName} ${applicationData.memberLastName}`;
        const uploaderName = `${applicationData.referrerFirstName} ${applicationData.referrerLastName}`;
        const uploadedFiles = applicationData.uploadedFiles || [];
        const newDocumentCount = applicationData.newDocumentCount || 0;
        
        // Get staff to notify
        const staffToNotify = await getStaffToNotify(applicationData);
        
        if (staffToNotify.length === 0) {
          results.failed++;
          results.errors.push(`No staff to notify for ${memberName}`);
          continue;
        }
        
        // Send email notification
        const emailData = {
          to: staffToNotify.map(staff => staff.email),
          subject: `New Documents Uploaded - ${memberName}`,
          htmlContent: generateDocumentUploadEmailHTML(memberName, uploaderName, uploadedFiles.slice(-newDocumentCount), applicationId),
          textContent: generateDocumentUploadEmailText(memberName, uploaderName, uploadedFiles.slice(-newDocumentCount), applicationId),
          type: 'document_upload',
          applicationId,
          memberName
        };
        
        await sendEmailNotification(emailData);
        
        // Clear the new documents flag
        await applicationDoc.ref.update({
          hasNewDocuments: false,
          newDocumentCount: 0,
          documentNotificationSent: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Log notification
        await logNotificationActivity({
          type: 'document_upload',
          applicationId,
          memberName,
          recipients: staffToNotify.map(staff => staff.email),
          documentCount: newDocumentCount,
          success: true
        });
        
        results.sent++;
        
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${applicationId}: ${error.message}`);
      }
    }
    
    console.log(`✅ Document notifications sent: ${results.sent} success, ${results.failed} failed`);
    
    return {
      success: true,
      results,
      message: `Sent ${results.sent} notifications, ${results.failed} failed`
    };
    
  } catch (error: any) {
    console.error('❌ Error sending document notifications:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to send notifications: ${error.message}`);
  }
});

export const sendCsSummaryNotifications = onCall(async (request) => {
  try {
    const { applicationIds } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!applicationIds || !Array.isArray(applicationIds)) {
      throw new HttpsError('invalid-argument', 'Application IDs array is required');
    }
    
    console.log(`📧 Sending CS Summary notifications for ${applicationIds.length} applications`);
    
    const db = admin.firestore();
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    for (const applicationId of applicationIds) {
      try {
        // Get application data
        const applicationDoc = await db.collection('applications').doc(applicationId).get();
        if (!applicationDoc.exists) {
          results.failed++;
          results.errors.push(`Application ${applicationId} not found`);
          continue;
        }
        
        const applicationData = applicationDoc.data()!;
        const memberName = `${applicationData.memberFirstName} ${applicationData.memberLastName}`;
        const referrerName = `${applicationData.referrerFirstName} ${applicationData.referrerLastName}`;
        
        // Get staff to notify
        const staffToNotify = await getStaffToNotify(applicationData);
        
        if (staffToNotify.length === 0) {
          results.failed++;
          results.errors.push(`No staff to notify for ${memberName}`);
          continue;
        }
        
        // Send email notification
        const emailData = {
          to: staffToNotify.map(staff => staff.email),
          subject: `CS Summary Form Completed - ${memberName}`,
          htmlContent: generateCsSummaryEmailHTML(memberName, referrerName, applicationData, applicationId),
          textContent: generateCsSummaryEmailText(memberName, referrerName, applicationData, applicationId),
          type: 'cs_summary_complete',
          applicationId,
          memberName
        };
        
        await sendEmailNotification(emailData);
        
        // Mark notification as sent
        await applicationDoc.ref.update({
          csSummaryNotificationSent: true,
          csSummaryNotificationSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Log notification
        await logNotificationActivity({
          type: 'cs_summary_complete',
          applicationId,
          memberName,
          recipients: staffToNotify.map(staff => staff.email),
          success: true
        });
        
        results.sent++;
        
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${applicationId}: ${error.message}`);
      }
    }
    
    console.log(`✅ CS Summary notifications sent: ${results.sent} success, ${results.failed} failed`);
    
    return {
      success: true,
      results,
      message: `Sent ${results.sent} notifications, ${results.failed} failed`
    };
    
  } catch (error: any) {
    console.error('❌ Error sending CS Summary notifications:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to send notifications: ${error.message}`);
  }
});

// Helper functions (reused from email-notifications.ts)
async function getStaffToNotify(applicationData: any): Promise<any[]> {
  const db = admin.firestore();
  const staffToNotify: any[] = [];
  
  try {
    // Get all staff members with notification preferences
    const staffQuery = db.collection('users')
      .where('isAdmin', '==', true)
      .where('emailNotifications', '==', true);
    
    const staffSnapshot = await staffQuery.get();
    
    staffSnapshot.forEach(doc => {
      const staffData = doc.data();
      if (staffData.email) {
        staffToNotify.push({
          uid: doc.id,
          email: staffData.email,
          firstName: staffData.firstName,
          lastName: staffData.lastName
        });
      }
    });
    
    return staffToNotify;
    
  } catch (error) {
    console.error('Error getting staff to notify:', error);
    return [];
  }
}

async function sendEmailNotification(emailData: any): Promise<void> {
  // For now, just log the email (you can integrate with SendGrid later)
  console.log('📧 Email notification (simulated):', {
    to: emailData.to,
    subject: emailData.subject,
    type: emailData.type
  });
  
  // TODO: Integrate with actual email service
  // const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  // if (SENDGRID_API_KEY) {
  //   // Send actual email
  // }
}

async function logNotificationActivity(activity: any): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('notification-logs').add({
    ...activity,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

function generateDocumentUploadEmailHTML(memberName: string, uploaderName: string, files: any[], applicationId: string): string {
  const fileList = files.map(file => `<li>${file.name}</li>`).join('');
  
  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">📄 New Documents Uploaded</h2>
          
          <p><strong>Member:</strong> ${memberName}</p>
          <p><strong>Uploaded by:</strong> ${uploaderName}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          
          <h3>Uploaded Files:</h3>
          <ul>${fileList}</ul>
          
          <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View Application
          </a>
        </div>
      </body>
    </html>
  `;
}

function generateDocumentUploadEmailText(memberName: string, uploaderName: string, files: any[], applicationId: string): string {
  const fileList = files.map(file => `- ${file.name}`).join('\n');
  
  return `
📄 NEW DOCUMENTS UPLOADED

Member: ${memberName}
Uploaded by: ${uploaderName}
Date: ${new Date().toLocaleDateString()}

Uploaded Files:
${fileList}

View Application: https://connectcalaim.com/admin/applications/${applicationId}
  `.trim();
}

function generateCsSummaryEmailHTML(memberName: string, referrerName: string, applicationData: any, applicationId: string): string {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #059669;">📋 CS Summary Form Completed</h2>
          
          <p><strong>Member:</strong> ${memberName}</p>
          <p><strong>Referrer:</strong> ${referrerName}</p>
          <p><strong>Health Plan:</strong> ${applicationData.healthPlan || 'Not specified'}</p>
          <p><strong>County:</strong> ${applicationData.memberCounty || 'Not specified'}</p>
          
          <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
             style="display: inline-block; padding: 12px 24px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Review CS Summary
          </a>
        </div>
      </body>
    </html>
  `;
}

function generateCsSummaryEmailText(memberName: string, referrerName: string, applicationData: any, applicationId: string): string {
  return `
📋 CS SUMMARY FORM COMPLETED

Member: ${memberName}
Referrer: ${referrerName}
Health Plan: ${applicationData.healthPlan || 'Not specified'}
County: ${applicationData.memberCounty || 'Not specified'}

Review CS Summary: https://connectcalaim.com/admin/applications/${applicationId}
  `.trim();
}