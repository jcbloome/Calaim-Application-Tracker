import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Resend API configuration (hardcoded for now)
const RESEND_API_KEY = 're_Yb6yeiQd_8k3GB9QmERSH4PZRoEx4Y6Yg';

interface EmailOptions {
  to: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
  memberName?: string;
  applicationId?: string;
  type?: 'document_upload' | 'cs_summary_complete' | 'kaiser_update' | 'general' | 'note_notification';
}

// Helper function for direct email sending (not a Firebase function)
export async function sendResendEmailNotification(options: EmailOptions): Promise<void> {
  const apiKey = RESEND_API_KEY;

  if (!apiKey) {
    console.log('⚠️ Resend API key not configured, skipping email send');
    return;
  }

  console.log(`📧 Sending Resend notification to ${options.to.length} recipients`);
  console.log(`📧 Subject: ${options.subject}`);
  console.log(`📧 Type: ${options.type || 'general'}`);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CalAIM Tracker <notifications@connectcalaim.com>',
        to: options.to,
        subject: options.subject,
        html: options.htmlContent,
        text: options.textContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Email sent successfully via Resend. ID: ${result.id}`);

  } catch (error: any) {
    console.error('❌ Error sending email via Resend:', error);
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}

// Send email using Resend API
export const sendResendNotification = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { to, subject, htmlContent, textContent, memberName, applicationId, type } = request.data;

    if (!to || !subject || !htmlContent) {
      throw new HttpsError('invalid-argument', 'Missing required email fields: to, subject, htmlContent');
    }

    console.log(`📧 Sending Resend notification to ${to.length} recipients`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Type: ${type || 'general'}`);

    const apiKey = RESEND_API_KEY;

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CalAIM Tracker <notifications@connectcalaim.com>',
        to: to,
        subject: subject,
        html: htmlContent,
        text: textContent,
        tags: [
          { name: 'system', value: 'calaim-tracker' },
          { name: 'type', value: type || 'general' },
          ...(memberName ? [{ name: 'member', value: memberName }] : []),
          ...(applicationId ? [{ name: 'application', value: applicationId }] : [])
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Resend API error:', errorData);
      throw new HttpsError('internal', `Resend API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log('✅ Resend notification sent successfully:', result.id);

    // Log notification activity
    await logNotificationActivity({
      type: type || 'general',
      applicationId,
      memberName,
      recipients: to,
      resendId: result.id,
      success: true,
      triggeredBy: request.auth.uid
    });

    return {
      success: true,
      message: `Email sent successfully to ${to.length} recipients`,
      resendId: result.id,
      recipients: to.length
    };

  } catch (error: any) {
    console.error('❌ Error sending Resend notification:', error);
    
    // Log failed notification
    await logNotificationActivity({
      type: request.data?.type || 'general',
      applicationId: request.data?.applicationId,
      memberName: request.data?.memberName,
      recipients: request.data?.to || [],
      error: error.message,
      success: false,
      triggeredBy: request.auth?.uid
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Resend notification failed: ${error.message}`);
  }
});

// Document upload notification
export const sendDocumentUploadNotification = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { applicationId, memberName, uploaderName, files } = request.data;

    if (!applicationId || !memberName) {
      throw new HttpsError('invalid-argument', 'Missing required fields: applicationId, memberName');
    }

    console.log(`📄 Sending document upload notification for ${memberName}`);

    // Get staff members to notify
    const staffToNotify = await getStaffToNotify(applicationId);

    if (staffToNotify.length === 0) {
      console.log('No staff members to notify');
      return { success: true, message: 'No staff members configured for notifications' };
    }

    const fileList = files?.map((file: any) => `• ${file.name}`).join('\n') || 'Multiple files';
    
    const htmlContent = generateDocumentUploadEmailHTML(memberName, uploaderName, files || [], applicationId);
    const textContent = generateDocumentUploadEmailText(memberName, uploaderName, files || [], applicationId);

    // Send via Resend
    const emailResult = await sendResendEmail({
      to: staffToNotify.map(staff => staff.email),
      subject: `📄 New Documents Uploaded - ${memberName}`,
      htmlContent,
      textContent,
      memberName,
      applicationId,
      type: 'document_upload'
    });

    console.log(`✅ Document upload notification sent for ${memberName}`);

    return {
      success: true,
      message: `Document upload notification sent to ${staffToNotify.length} staff members`,
      recipients: staffToNotify.length,
      resendId: emailResult.id
    };

  } catch (error: any) {
    console.error('❌ Error sending document upload notification:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Document upload notification failed: ${error.message}`);
  }
});

// CS Summary completion notification
export const sendCsSummaryCompletionNotification = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { applicationId, memberName, referrerName } = request.data;

    if (!applicationId || !memberName) {
      throw new HttpsError('invalid-argument', 'Missing required fields: applicationId, memberName');
    }

    console.log(`📋 Sending CS Summary completion notification for ${memberName}`);

    // Get application data
    const db = admin.firestore();
    const applicationDoc = await db.collection('applications').doc(applicationId).get();
    
    if (!applicationDoc.exists) {
      throw new HttpsError('not-found', 'Application not found');
    }

    const applicationData = applicationDoc.data()!;

    // Get staff members to notify
    const staffToNotify = await getStaffToNotify(applicationId);

    if (staffToNotify.length === 0) {
      console.log('No staff members to notify');
      return { success: true, message: 'No staff members configured for notifications' };
    }

    const htmlContent = generateCsSummaryEmailHTML(memberName, referrerName, applicationData, applicationId);
    const textContent = generateCsSummaryEmailText(memberName, referrerName, applicationData, applicationId);

    // Send via Resend
    const emailResult = await sendResendEmail({
      to: staffToNotify.map(staff => staff.email),
      subject: `📋 CS Summary Completed - ${memberName}`,
      htmlContent,
      textContent,
      memberName,
      applicationId,
      type: 'cs_summary_complete'
    });

    console.log(`✅ CS Summary completion notification sent for ${memberName}`);

    return {
      success: true,
      message: `CS Summary completion notification sent to ${staffToNotify.length} staff members`,
      recipients: staffToNotify.length,
      resendId: emailResult.id
    };

  } catch (error: any) {
    console.error('❌ Error sending CS Summary completion notification:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `CS Summary completion notification failed: ${error.message}`);
  }
});

// Kaiser status update notification
export const sendKaiserStatusUpdateNotification = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { applicationId, memberName, oldStatus, newStatus, updatedBy } = request.data;

    if (!applicationId || !memberName || !newStatus) {
      throw new HttpsError('invalid-argument', 'Missing required fields: applicationId, memberName, newStatus');
    }

    console.log(`🏥 Sending Kaiser status update notification for ${memberName}: ${oldStatus} → ${newStatus}`);

    // Get staff members to notify
    const staffToNotify = await getStaffToNotify(applicationId);

    if (staffToNotify.length === 0) {
      console.log('No staff members to notify');
      return { success: true, message: 'No staff members configured for notifications' };
    }

    const htmlContent = generateKaiserStatusUpdateEmailHTML(memberName, oldStatus, newStatus, updatedBy, applicationId);
    const textContent = generateKaiserStatusUpdateEmailText(memberName, oldStatus, newStatus, updatedBy, applicationId);

    // Send via Resend
    const emailResult = await sendResendEmail({
      to: staffToNotify.map(staff => staff.email),
      subject: `🏥 Kaiser Status Updated - ${memberName}`,
      htmlContent,
      textContent,
      memberName,
      applicationId,
      type: 'kaiser_update'
    });

    console.log(`✅ Kaiser status update notification sent for ${memberName}`);

    return {
      success: true,
      message: `Kaiser status update notification sent to ${staffToNotify.length} staff members`,
      recipients: staffToNotify.length,
      resendId: emailResult.id
    };

  } catch (error: any) {
    console.error('❌ Error sending Kaiser status update notification:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Kaiser status update notification failed: ${error.message}`);
  }
});

// Helper function to send email via Resend API
async function sendResendEmail(options: EmailOptions): Promise<any> {
  // Use the API key directly for now
  const apiKey = RESEND_API_KEY;
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CalAIM Tracker <notifications@connectcalaim.com>',
      to: options.to,
      subject: options.subject,
      html: options.htmlContent,
      text: options.textContent,
      tags: [
        { name: 'system', value: 'calaim-tracker' },
        { name: 'type', value: options.type || 'general' },
        ...(options.memberName ? [{ name: 'member', value: options.memberName }] : []),
        ...(options.applicationId ? [{ name: 'application', value: options.applicationId }] : [])
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Resend API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}

// Helper function to get staff members who should be notified
async function getStaffToNotify(applicationId: string): Promise<any[]> {
  const db = admin.firestore();
  const staffToNotify: any[] = [];
  
  try {
    // Get application data to find assigned staff
    const applicationDoc = await db.collection('applications').doc(applicationId).get();
    const applicationData = applicationDoc.exists ? applicationDoc.data() : null;

    // Get all staff members with notification preferences
    const staffQuery = db.collection('users')
      .where('isAdmin', '==', true);
    
    const staffSnapshot = await staffQuery.get();
    
    staffSnapshot.forEach(doc => {
      const staffData = doc.data();
      if (staffData.email && staffData.emailNotifications !== false) {
        staffToNotify.push({
          uid: doc.id,
          email: staffData.email,
          firstName: staffData.firstName,
          lastName: staffData.lastName,
          role: staffData.isSuperAdmin ? 'Super Admin' : 'Admin'
        });
      }
    });

    // Also include assigned staff member if specified
    if (applicationData?.assignedStaff) {
      const assignedStaffDoc = await db.collection('users').doc(applicationData.assignedStaff).get();
      if (assignedStaffDoc.exists) {
        const assignedStaffData = assignedStaffDoc.data()!;
        if (assignedStaffData.email && !staffToNotify.find(s => s.uid === applicationData.assignedStaff)) {
          staffToNotify.push({
            uid: applicationData.assignedStaff,
            email: assignedStaffData.email,
            firstName: assignedStaffData.firstName,
            lastName: assignedStaffData.lastName,
            role: 'Assigned Staff'
          });
        }
      }
    }

    // Sort staff: Super Admins first, then Admins, then alphabetical
    staffToNotify.sort((a, b) => {
      if (a.role === 'Super Admin' && b.role !== 'Super Admin') return -1;
      if (b.role === 'Super Admin' && a.role !== 'Super Admin') return 1;
      if (a.role === 'Admin' && b.role !== 'Admin' && b.role !== 'Super Admin') return -1;
      if (b.role === 'Admin' && a.role !== 'Admin' && a.role !== 'Super Admin') return 1;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });

    console.log(`📧 Found ${staffToNotify.length} staff members to notify`);
    return staffToNotify;
    
  } catch (error) {
    console.error('Error getting staff to notify:', error);
    return [];
  }
}

// Log notification activity
async function logNotificationActivity(activity: any): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('notification-logs').add({
    ...activity,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    service: 'resend'
  });
}

// Email template generators
function generateDocumentUploadEmailHTML(memberName: string, uploaderName: string, files: any[], applicationId: string): string {
  const fileList = files.map(file => `<li style="margin: 5px 0;">${file.name}</li>`).join('');
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Documents Uploaded - CalAIM Tracker</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #2563eb; color: white; border-radius: 8px;">
            <h1 style="margin: 0; font-size: 24px;">📄 New Documents Uploaded</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">CalAIM Tracker Notification</p>
          </div>
          
          <div style="margin-bottom: 25px;">
            <h2 style="color: #2563eb; margin-bottom: 15px;">Application Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 120px;">Member:</td>
                <td style="padding: 8px 0;">${memberName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Uploaded by:</td>
                <td style="padding: 8px 0;">${uploaderName || 'System'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Date:</td>
                <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
              </tr>
            </table>
          </div>
          
          <div style="margin-bottom: 25px;">
            <h3 style="color: #2563eb; margin-bottom: 10px;">Uploaded Files:</h3>
            <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 0;">
              ${fileList}
            </ul>
          </div>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <h3 style="color: #92400e; margin: 0 0 10px 0;">⚠️ Action Required</h3>
            <p style="margin: 0; color: #92400e;">Please review the uploaded documents and update the application status as needed.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
               style="display: inline-block; padding: 14px 28px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              View Application →
            </a>
          </div>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0;">
            This is an automated notification from the CalAIM Tracker system.<br>
            <a href="https://connectcalaim.com" style="color: #2563eb;">connectcalaim.com</a>
          </p>
        </div>
      </body>
    </html>
  `;
}

function generateDocumentUploadEmailText(memberName: string, uploaderName: string, files: any[], applicationId: string): string {
  const fileList = files.map(file => `• ${file.name}`).join('\n');
  
  return `
📄 NEW DOCUMENTS UPLOADED - CalAIM Tracker

MEMBER: ${memberName}
UPLOADED BY: ${uploaderName || 'System'}
DATE: ${new Date().toLocaleDateString()}

UPLOADED FILES:
${fileList}

⚠️ ACTION REQUIRED:
Please review the uploaded documents and update the application status as needed.

VIEW APPLICATION:
https://connectcalaim.com/admin/applications/${applicationId}

---
This is an automated notification from the CalAIM Tracker system.
Visit: https://connectcalaim.com
  `.trim();
}

function generateCsSummaryEmailHTML(memberName: string, referrerName: string, applicationData: any, applicationId: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CS Summary Completed - CalAIM Tracker</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #059669; color: white; border-radius: 8px;">
            <h1 style="margin: 0; font-size: 24px;">📋 CS Summary Completed</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">CalAIM Tracker Notification</p>
          </div>
          
          <div style="margin-bottom: 25px;">
            <h2 style="color: #059669; margin-bottom: 15px;">Application Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 120px;">Member:</td>
                <td style="padding: 8px 0;">${memberName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Referrer:</td>
                <td style="padding: 8px 0;">${referrerName || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Health Plan:</td>
                <td style="padding: 8px 0;">${applicationData.healthPlan || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">County:</td>
                <td style="padding: 8px 0;">${applicationData.memberCounty || 'Not specified'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Completion Date:</td>
                <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
              </tr>
            </table>
          </div>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #ecfdf5; border-radius: 8px; border-left: 4px solid #059669;">
            <h3 style="color: #065f46; margin: 0 0 10px 0;">✅ Ready for Review</h3>
            <p style="margin: 0; color: #065f46;">The CS Summary form has been completed and is ready for staff review and processing.</p>
          </div>
          
          <div style="margin: 20px 0;">
            <h3 style="color: #059669; margin-bottom: 10px;">Next Steps:</h3>
            <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 0;">
              <li style="margin: 5px 0;">Review the completed CS Summary form</li>
              <li style="margin: 5px 0;">Verify all required information is accurate</li>
              <li style="margin: 5px 0;">Process the application according to CalAIM guidelines</li>
              <li style="margin: 5px 0;">Update the application status as appropriate</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
               style="display: inline-block; padding: 14px 28px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              Review CS Summary →
            </a>
          </div>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0;">
            This is an automated notification from the CalAIM Tracker system.<br>
            <a href="https://connectcalaim.com" style="color: #059669;">connectcalaim.com</a>
          </p>
        </div>
      </body>
    </html>
  `;
}

function generateCsSummaryEmailText(memberName: string, referrerName: string, applicationData: any, applicationId: string): string {
  return `
📋 CS SUMMARY COMPLETED - CalAIM Tracker

MEMBER: ${memberName}
REFERRER: ${referrerName || 'Not specified'}
HEALTH PLAN: ${applicationData.healthPlan || 'Not specified'}
COUNTY: ${applicationData.memberCounty || 'Not specified'}
COMPLETION DATE: ${new Date().toLocaleDateString()}

✅ READY FOR REVIEW
The CS Summary form has been completed and is ready for staff review and processing.

NEXT STEPS:
• Review the completed CS Summary form
• Verify all required information is accurate
• Process the application according to CalAIM guidelines
• Update the application status as appropriate

REVIEW CS SUMMARY:
https://connectcalaim.com/admin/applications/${applicationId}

---
This is an automated notification from the CalAIM Tracker system.
Visit: https://connectcalaim.com
  `.trim();
}

function generateKaiserStatusUpdateEmailHTML(memberName: string, oldStatus: string, newStatus: string, updatedBy: string, applicationId: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kaiser Status Updated - CalAIM Tracker</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #7c3aed; color: white; border-radius: 8px;">
            <h1 style="margin: 0; font-size: 24px;">🏥 Kaiser Status Updated</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">CalAIM Tracker Notification</p>
          </div>
          
          <div style="margin-bottom: 25px;">
            <h2 style="color: #7c3aed; margin-bottom: 15px;">Status Change Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 120px;">Member:</td>
                <td style="padding: 8px 0;">${memberName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Previous Status:</td>
                <td style="padding: 8px 0;">${oldStatus || 'Not set'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">New Status:</td>
                <td style="padding: 8px 0; color: #7c3aed; font-weight: bold;">${newStatus}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Updated by:</td>
                <td style="padding: 8px 0;">${updatedBy || 'System'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Date:</td>
                <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
              </tr>
            </table>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
               style="display: inline-block; padding: 14px 28px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              View Application →
            </a>
          </div>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0;">
            This is an automated notification from the CalAIM Tracker system.<br>
            <a href="https://connectcalaim.com" style="color: #7c3aed;">connectcalaim.com</a>
          </p>
        </div>
      </body>
    </html>
  `;
}

function generateKaiserStatusUpdateEmailText(memberName: string, oldStatus: string, newStatus: string, updatedBy: string, applicationId: string): string {
  return `
🏥 KAISER STATUS UPDATED - CalAIM Tracker

MEMBER: ${memberName}
PREVIOUS STATUS: ${oldStatus || 'Not set'}
NEW STATUS: ${newStatus}
UPDATED BY: ${updatedBy || 'System'}
DATE: ${new Date().toLocaleDateString()}

VIEW APPLICATION:
https://connectcalaim.com/admin/applications/${applicationId}

---
This is an automated notification from the CalAIM Tracker system.
Visit: https://connectcalaim.com
  `.trim();
}