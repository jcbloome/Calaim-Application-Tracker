import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Notification Settings Management Functions

export const getNotificationSettings = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const db = admin.firestore();
    const settingsDoc = await db.collection('notificationSettings').doc('global').get();
    
    let settings = {};
    if (settingsDoc.exists) {
      settings = settingsDoc.data() || {};
    }

    console.log('✅ Retrieved notification settings');

    return {
      success: true,
      settings
    };

  } catch (error: any) {
    console.error('❌ Error getting notification settings:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const updateNotificationSettings = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { settings } = request.data;

    if (!settings) {
      throw new HttpsError('invalid-argument', 'Settings are required');
    }

    // Verify user is Super Admin
    const db = admin.firestore();
    const userDoc = await db.collection('staff').doc(request.auth.uid).get();
    
    if (!userDoc.exists || userDoc.data()?.role !== 'Super Admin') {
      throw new HttpsError('permission-denied', 'Only Super Admins can update notification settings');
    }

    // Update global notification settings
    await db.collection('notificationSettings').doc('global').set({
      ...settings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid
    }, { merge: true });

    console.log('✅ Updated notification settings');

    return {
      success: true,
      message: 'Notification settings updated successfully'
    };

  } catch (error: any) {
    console.error('❌ Error updating notification settings:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const checkNotificationPermissions = onCall(async (request) => {
  try {
    const { type, priority, userId } = request.data;

    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    const db = admin.firestore();
    
    // Get global notification settings
    const settingsDoc = await db.collection('notificationSettings').doc('global').get();
    const globalSettings = settingsDoc.data() || {};

    // Check master switch
    if (!globalSettings.globalControls?.masterSwitch) {
      return {
        success: true,
        shouldNotify: false,
        reason: 'Master switch is off'
      };
    }

    // Check quiet hours
    if (globalSettings.globalControls?.quietHours?.enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
      const startTime = globalSettings.globalControls.quietHours.startTime;
      const endTime = globalSettings.globalControls.quietHours.endTime;

      // Simple time comparison (doesn't handle overnight periods perfectly)
      if (startTime && endTime && currentTime >= startTime && currentTime <= endTime) {
        return {
          success: true,
          shouldNotify: false,
          reason: 'Quiet hours active'
        };
      }
    }

    // Check type-specific settings
    let shouldNotify = true;
    const emailSettings = globalSettings.emailNotifications || {};
    const browserSettings = globalSettings.browserNotifications || {};

    switch (type) {
      case 'note':
        shouldNotify = emailSettings.newNotes || browserSettings.newNotes;
        break;
      case 'task':
        shouldNotify = emailSettings.taskAssignments || browserSettings.taskAssignments;
        break;
      case 'urgent':
        shouldNotify = emailSettings.urgentPriority || browserSettings.urgentPriority;
        break;
      default:
        shouldNotify = true;
    }

    // Always notify for urgent priority if enabled
    if (priority === 'Urgent' && (emailSettings.urgentPriority || browserSettings.urgentPriority)) {
      shouldNotify = true;
    }

    return {
      success: true,
      shouldNotify,
      settings: {
        email: emailSettings,
        browser: browserSettings,
        visual: globalSettings.visualEffects || {}
      }
    };

  } catch (error: any) {
    console.error('❌ Error checking notification permissions:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const sendNotificationWithSettings = onCall(async (request) => {
  try {
    const { 
      recipientIds, 
      type, 
      title, 
      message, 
      priority, 
      memberName, 
      authorName,
      data 
    } = request.data;

    if (!recipientIds || !type || !title || !message) {
      throw new HttpsError('invalid-argument', 'Missing required notification fields');
    }

    const db = admin.firestore();
    const results = [];

    // Check notification settings for each recipient
    for (const recipientId of recipientIds) {
      const permissionCheck = await checkNotificationPermissions({
        data: { type, priority, userId: recipientId }
      });

      if (permissionCheck.data.shouldNotify) {
        // Get recipient info
        const recipientDoc = await db.collection('staff').doc(recipientId).get();
        const recipient = recipientDoc.data();

        if (recipient && recipient.email) {
          // Send email notification if enabled
          if (permissionCheck.data.settings.email?.enabled) {
            try {
              await sendEmailNotification({
                to: recipient.email,
                subject: title,
                body: message,
                type,
                priority,
                memberName,
                authorName,
                data
              });
              
              results.push({
                recipientId,
                email: recipient.email,
                status: 'email_sent'
              });
            } catch (emailError) {
              console.error(`Failed to send email to ${recipient.email}:`, emailError);
              results.push({
                recipientId,
                email: recipient.email,
                status: 'email_failed',
                error: emailError
              });
            }
          }

          // Create in-app notification record
          await db.collection('notifications').add({
            recipientId,
            type,
            title,
            message,
            priority: priority || 'Medium',
            memberName,
            authorName,
            data: data || {},
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          results.push({
            recipientId,
            status: 'in_app_created'
          });
        }
      } else {
        results.push({
          recipientId,
          status: 'skipped',
          reason: permissionCheck.data.reason
        });
      }
    }

    console.log(`✅ Processed notifications for ${recipientIds.length} recipients`);

    return {
      success: true,
      results,
      message: `Processed notifications for ${recipientIds.length} recipients`
    };

  } catch (error: any) {
    console.error('❌ Error sending notifications with settings:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Helper function to send email notifications
async function sendEmailNotification(params: {
  to: string;
  subject: string;
  body: string;
  type: string;
  priority?: string;
  memberName?: string;
  authorName?: string;
  data?: any;
}) {
  // This would integrate with your email service (Nodemailer, SendGrid, etc.)
  // For now, just log the email details
  console.log('📧 Email notification:', {
    to: params.to,
    subject: params.subject,
    body: params.body,
    type: params.type,
    priority: params.priority,
    memberName: params.memberName,
    authorName: params.authorName
  });

  // Example implementation with Nodemailer:
  /*
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransporter({
    // Your email service configuration
  });

  await transporter.sendMail({
    from: 'noreply@carehomefinders.com',
    to: params.to,
    subject: params.subject,
    html: generateEmailTemplate(params)
  });
  */
}

// Helper function to generate email templates
function generateEmailTemplate(params: {
  subject: string;
  body: string;
  type: string;
  priority?: string;
  memberName?: string;
  authorName?: string;
}) {
  const priorityColor = params.priority === 'Urgent' ? '#dc2626' : 
                       params.priority === 'High' ? '#ea580c' : 
                       params.priority === 'Medium' ? '#2563eb' : '#6b7280';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0;">${params.subject}</h2>
        
        ${params.priority ? `
          <div style="background-color: ${priorityColor}; color: white; padding: 4px 8px; border-radius: 4px; display: inline-block; font-size: 12px; margin-bottom: 16px;">
            ${params.priority} Priority
          </div>
        ` : ''}
        
        <div style="background-color: white; padding: 16px; border-radius: 6px; border-left: 4px solid ${priorityColor};">
          <p style="margin: 0 0 12px 0; color: #374151;">${params.body}</p>
          
          ${params.memberName ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Member:</strong> ${params.memberName}</p>` : ''}
          ${params.authorName ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>From:</strong> ${params.authorName}</p>` : ''}
        </div>
        
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">This is an automated notification from CalAIM Tracker. Please do not reply to this email.</p>
        </div>
      </div>
    </div>
  `;
}