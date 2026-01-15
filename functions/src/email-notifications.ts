import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Email service configuration (using SendGrid, but can be adapted for other services)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = 'notifications@connectcalaim.com';

interface EmailNotification {
  to: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
  type: 'document_upload' | 'cs_summary_complete';
  applicationId: string;
  memberName: string;
}

// Trigger when new documents are uploaded
export const onDocumentUpload = onDocumentCreated("applications/{applicationId}", async (event) => {
  try {
    const applicationId = event.params.applicationId;
    const applicationData = event.data?.data();
    
    if (!applicationData) {
      console.log('No application data found');
      return;
    }
    
    console.log(`📄 New document uploaded for application: ${applicationId}`);
    
    const memberName = `${applicationData.memberFirstName} ${applicationData.memberLastName}`;
    const uploaderName = `${applicationData.referrerFirstName} ${applicationData.referrerLastName}`;
    const uploadedFiles = applicationData.uploadedFiles || [];
    
    // Get the newly uploaded files (compare with previous version if available)
    const newFiles = uploadedFiles.filter((file: any) => {
      const uploadTime = file.uploadedAt?.toDate();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return uploadTime && uploadTime > fiveMinutesAgo;
    });
    
    if (newFiles.length === 0) {
      console.log('No new files detected');
      return;
    }
    
    // Get staff members to notify
    const staffToNotify = await getStaffToNotify(applicationData);
    
    if (staffToNotify.length === 0) {
      console.log('No staff members to notify');
      return;
    }
    
    // Create email notification with enhanced subject line
    const healthPlan = applicationData.healthPlan || applicationData.existingHealthPlan || 'Unknown';
    const memberMrn = applicationData.memberMrn || 'No MRN';
    const emailData: EmailNotification = {
      to: staffToNotify.map(staff => staff.email),
      subject: `New Documents Uploaded for ${memberName}, ${healthPlan}, MRN: ${memberMrn}`,
      htmlContent: generateDocumentUploadEmailHTML(memberName, uploaderName, newFiles, applicationId),
      textContent: generateDocumentUploadEmailText(memberName, uploaderName, newFiles, applicationId),
      type: 'document_upload',
      applicationId,
      memberName
    };
    
    // Send email notification
    await sendEmailNotification(emailData);
    
    // Log notification activity
    await logNotificationActivity({
      type: 'document_upload',
      applicationId,
      memberName,
      recipients: staffToNotify.map(staff => staff.email),
      documentCount: newFiles.length,
      success: true
    });
    
    console.log(`✅ Document upload notification sent for ${memberName}`);
    
  } catch (error: any) {
    console.error('❌ Error sending document upload notification:', error);
    
    // Log failed notification
    await logNotificationActivity({
      type: 'document_upload',
      applicationId: event.params.applicationId,
      error: error.message,
      success: false
    });
  }
});

// Trigger when CS Summary form is completed
export const onCsSummaryComplete = onDocumentUpdated("applications/{applicationId}", async (event) => {
  try {
    const applicationId = event.params.applicationId;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    if (!beforeData || !afterData) {
      console.log('Missing before/after data');
      return;
    }
    
    // Check if CS Summary was just completed
    const wasIncomplete = !beforeData.csSummaryComplete;
    const isNowComplete = afterData.csSummaryComplete;
    
    if (!wasIncomplete || !isNowComplete) {
      console.log('CS Summary completion status unchanged');
      return;
    }
    
    console.log(`📋 CS Summary completed for application: ${applicationId}`);
    
    const memberName = `${afterData.memberFirstName} ${afterData.memberLastName}`;
    const referrerName = `${afterData.referrerFirstName} ${afterData.referrerLastName}`;
    
    // Get staff members to notify
    const staffToNotify = await getStaffToNotify(afterData);
    
    if (staffToNotify.length === 0) {
      console.log('No staff members to notify');
      return;
    }
    
    // Create email notification with enhanced subject line
    const healthPlan = afterData.healthPlan || afterData.existingHealthPlan || 'Unknown';
    const memberMrn = afterData.memberMrn || 'No MRN';
    const emailData: EmailNotification = {
      to: staffToNotify.map(staff => staff.email),
      subject: `New CS Summary Form for ${memberName}, ${healthPlan}, MRN: ${memberMrn}`,
      htmlContent: generateCsSummaryEmailHTML(memberName, referrerName, afterData, applicationId),
      textContent: generateCsSummaryEmailText(memberName, referrerName, afterData, applicationId),
      type: 'cs_summary_complete',
      applicationId,
      memberName
    };
    
    // Send email notification
    await sendEmailNotification(emailData);
    
    // Log notification activity
    await logNotificationActivity({
      type: 'cs_summary_complete',
      applicationId,
      memberName,
      recipients: staffToNotify.map(staff => staff.email),
      success: true
    });
    
    console.log(`✅ CS Summary completion notification sent for ${memberName}`);
    
  } catch (error: any) {
    console.error('❌ Error sending CS Summary notification:', error);
    
    // Log failed notification
    await logNotificationActivity({
      type: 'cs_summary_complete',
      applicationId: event.params.applicationId,
      error: error.message,
      success: false
    });
  }
});

// Manual notification trigger (for testing or manual sends)
export const sendManualNotification = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { type, applicationId, recipients } = request.data;
    
    if (!type || !applicationId) {
      throw new HttpsError('invalid-argument', 'Type and application ID are required');
    }
    
    console.log(`📧 Manual notification requested: ${type} for ${applicationId}`);
    
    // Get application data
    const db = admin.firestore();
    const applicationDoc = await db.collection('applications').doc(applicationId).get();
    
    if (!applicationDoc.exists) {
      throw new HttpsError('not-found', 'Application not found');
    }
    
    const applicationData = applicationDoc.data()!;
    const memberName = `${applicationData.memberFirstName} ${applicationData.memberLastName}`;
    
    // Get recipients (use provided list or default staff)
    const staffToNotify = recipients || await getStaffToNotify(applicationData);
    
    let emailData: EmailNotification;
    
    const healthPlan = applicationData.healthPlan || applicationData.existingHealthPlan || 'Unknown';
    const memberMrn = applicationData.memberMrn || 'No MRN';
    
    if (type === 'document_upload') {
      const uploaderName = `${applicationData.referrerFirstName} ${applicationData.referrerLastName}`;
      const uploadedFiles = applicationData.uploadedFiles || [];
      
      emailData = {
        to: staffToNotify.map((staff: any) => staff.email || staff),
        subject: `New Documents Uploaded for ${memberName}, ${healthPlan}, MRN: ${memberMrn}`,
        htmlContent: generateDocumentUploadEmailHTML(memberName, uploaderName, uploadedFiles, applicationId),
        textContent: generateDocumentUploadEmailText(memberName, uploaderName, uploadedFiles, applicationId),
        type: 'document_upload',
        applicationId,
        memberName
      };
    } else if (type === 'cs_summary_complete') {
      const referrerName = `${applicationData.referrerFirstName} ${applicationData.referrerLastName}`;
      
      emailData = {
        to: staffToNotify.map((staff: any) => staff.email || staff),
        subject: `New CS Summary Form for ${memberName}, ${healthPlan}, MRN: ${memberMrn}`,
        htmlContent: generateCsSummaryEmailHTML(memberName, referrerName, applicationData, applicationId),
        textContent: generateCsSummaryEmailText(memberName, referrerName, applicationData, applicationId),
        type: 'cs_summary_complete',
        applicationId,
        memberName
      };
    } else {
      throw new HttpsError('invalid-argument', 'Invalid notification type');
    }
    
    // Send email notification
    await sendEmailNotification(emailData);
    
    // Log notification activity
    await logNotificationActivity({
      type: type,
      applicationId,
      memberName,
      recipients: emailData.to,
      manual: true,
      triggeredBy: request.auth.uid,
      success: true
    });
    
    console.log(`✅ Manual notification sent: ${type} for ${memberName}`);
    
    return {
      success: true,
      message: `${type} notification sent successfully`,
      recipients: emailData.to.length
    };
    
  } catch (error: any) {
    console.error('❌ Error sending manual notification:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Manual notification failed: ${error.message}`);
  }
});

// Helper function to get staff members who should be notified based on health plan
async function getStaffToNotify(applicationData: any): Promise<any[]> {
  const db = admin.firestore();
  const staffToNotify: any[] = [];
  
  try {
    // Get notification settings with health plan-specific recipients
    const settingsRef = db.collection('system_settings').doc('notifications');
    const settingsDoc = await settingsRef.get();
    
    let recipientUids: string[] = [];
    
    if (settingsDoc.exists) {
      const settings = settingsDoc.data()!;
      const healthPlan = applicationData.healthPlan || applicationData.existingHealthPlan;
      
      // Route based on health plan
      if (healthPlan === 'Kaiser' || healthPlan === 'Kaiser Permanente') {
        recipientUids = settings.kaiserRecipients || [];
        console.log(`📧 Using Kaiser notification recipients: ${recipientUids.length} staff members`);
      } else if (healthPlan === 'Health Net' || healthPlan === 'HealthNet') {
        recipientUids = settings.healthNetRecipients || [];
        console.log(`📧 Using Health Net notification recipients: ${recipientUids.length} staff members`);
      } else {
        // Fallback to general notifications for unknown health plans
        recipientUids = settings.recipientUids || [];
        console.log(`📧 Using general notification recipients for health plan "${healthPlan}": ${recipientUids.length} staff members`);
      }
    }
    
    // Get staff member details for each recipient UID
    if (recipientUids.length > 0) {
      const staffPromises = recipientUids.map(uid => db.collection('users').doc(uid).get());
      const staffDocs = await Promise.all(staffPromises);
      
      staffDocs.forEach((doc, index) => {
        if (doc.exists) {
          const staffData = doc.data()!;
          if (staffData.email) {
            staffToNotify.push({
              uid: recipientUids[index],
              email: staffData.email,
              firstName: staffData.firstName,
              lastName: staffData.lastName
            });
          }
        }
      });
    }
    
    // Also include assigned staff member if specified
    if (applicationData.assignedStaff) {
      const assignedStaffDoc = await db.collection('users').doc(applicationData.assignedStaff).get();
      if (assignedStaffDoc.exists) {
        const assignedStaffData = assignedStaffDoc.data()!;
        if (assignedStaffData.email && !staffToNotify.find(s => s.uid === applicationData.assignedStaff)) {
          staffToNotify.push({
            uid: applicationData.assignedStaff,
            email: assignedStaffData.email,
            firstName: assignedStaffData.firstName,
            lastName: assignedStaffData.lastName
          });
        }
      }
    }
    
    console.log(`📧 Found ${staffToNotify.length} staff members to notify`);
    return staffToNotify;
    
  } catch (error) {
    console.error('Error getting staff to notify:', error);
    return [];
  }
}

// Email sending function (using SendGrid API)
async function sendEmailNotification(emailData: EmailNotification): Promise<void> {
  if (!SENDGRID_API_KEY) {
    console.log('⚠️ SendGrid API key not configured, skipping email send');
    return;
  }
  
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: emailData.to.map(email => ({ email })),
          subject: emailData.subject
        }],
        from: { email: FROM_EMAIL, name: 'CalAIM Tracker' },
        content: [
          {
            type: 'text/plain',
            value: emailData.textContent
          },
          {
            type: 'text/html',
            value: emailData.htmlContent
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid API error: ${response.status} ${errorText}`);
    }
    
    console.log(`✅ Email sent successfully to ${emailData.to.length} recipients`);
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

// Log notification activity
async function logNotificationActivity(activity: any): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('notification-logs').add({
    ...activity,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

// Email template generators
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
          
          <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
            <p><strong>Action Required:</strong></p>
            <p>Please review the uploaded documents and update the application status as needed.</p>
          </div>
          
          <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View Application
          </a>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            This is an automated notification from the CalAIM Tracker system.
          </p>
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

ACTION REQUIRED:
Please review the uploaded documents and update the application status as needed.

View Application: https://connectcalaim.com/admin/applications/${applicationId}

---
This is an automated notification from the CalAIM Tracker system.
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
          <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #ecfdf5; border-radius: 8px; border-left: 4px solid #059669;">
            <p><strong>✅ Ready for Review</strong></p>
            <p>The CS Summary form has been completed and is ready for staff review and processing.</p>
          </div>
          
          <div style="margin: 20px 0;">
            <h3>Next Steps:</h3>
            <ul>
              <li>Review the completed CS Summary form</li>
              <li>Verify all required information is accurate</li>
              <li>Process the application according to CalAIM guidelines</li>
              <li>Update the application status as appropriate</li>
            </ul>
          </div>
          
          <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
             style="display: inline-block; padding: 12px 24px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Review CS Summary
          </a>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            This is an automated notification from the CalAIM Tracker system.
          </p>
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
Completion Date: ${new Date().toLocaleDateString()}

✅ READY FOR REVIEW
The CS Summary form has been completed and is ready for staff review and processing.

NEXT STEPS:
- Review the completed CS Summary form
- Verify all required information is accurate
- Process the application according to CalAIM guidelines
- Update the application status as appropriate

Review CS Summary: https://connectcalaim.com/admin/applications/${applicationId}

---
This is an automated notification from the CalAIM Tracker system.
  `.trim();
}