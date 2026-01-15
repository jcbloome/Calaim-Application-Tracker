import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Resend } from 'resend';
import { defineSecret } from "firebase-functions/params";

// Define the secret for Resend API key
const resendApiKey = defineSecret("RESEND_API_KEY");

// Scheduled function to run every day at 9 AM PST
export const sendDocumentReminders = onSchedule({
  schedule: "0 9 * * *", // Daily at 9 AM
  timeZone: "America/Los_Angeles",
  secrets: [resendApiKey]
}, async (event) => {
  try {
    console.log('🔔 Starting daily document reminder check...');
    
    const db = admin.firestore();
    const resend = new Resend(resendApiKey.value());
    
    // Get all applications that need document reminders
    const applicationsQuery = await db.collectionGroup('applications').get();
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
    
    let remindersSent = 0;
    const remindersToSend = [];
    
    for (const doc of applicationsQuery.docs) {
      const application = doc.data();
      
      // Check if application has missing required documents
      const missingDocs = getMissingRequiredDocuments(application);
      
      if (missingDocs.length > 0) {
        const lastSubmitted = application.lastUpdated?.toDate() || application.createdAt?.toDate();
        const lastReminder = application.lastDocumentReminder?.toDate();
        
        // Send reminder if:
        // 1. It's been 2+ days since last submission/update
        // 2. No reminder sent yet, OR last reminder was 2+ days ago
        const shouldSendReminder = lastSubmitted && 
          lastSubmitted <= twoDaysAgo && 
          (!lastReminder || lastReminder <= twoDaysAgo);
        
        if (shouldSendReminder && application.referrerEmail) {
          remindersToSend.push({
            applicationId: doc.id,
            application,
            missingDocs
          });
        }
      }
    }
    
    // Send reminder emails
    for (const reminder of remindersToSend) {
      try {
        await sendDocumentReminderEmail(resend, reminder);
        
        // Update the application with last reminder timestamp
        await db.doc(`applications/${reminder.applicationId}`).update({
          lastDocumentReminder: admin.firestore.FieldValue.serverTimestamp(),
          documentReminderCount: admin.firestore.FieldValue.increment(1)
        });
        
        remindersSent++;
        console.log(`✅ Sent reminder for application ${reminder.applicationId}`);
      } catch (error) {
        console.error(`❌ Failed to send reminder for ${reminder.applicationId}:`, error);
      }
    }
    
    console.log(`🎯 Document reminder job completed: ${remindersSent} reminders sent`);
    
  } catch (error) {
    console.error('❌ Error in document reminder job:', error);
    throw error;
  }
});

// Manual trigger for testing document reminders
export const triggerDocumentReminders = onCall({
  secrets: [resendApiKey]
}, async (request) => {
  try {
    // Verify user is authenticated and authorized
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    console.log('🔔 Manual trigger for document reminders...');
    
    const db = admin.firestore();
    const resend = new Resend(resendApiKey.value());
    
    // Get applications that need reminders (for testing, check all recent ones)
    const applicationsQuery = await db.collectionGroup('applications')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    let remindersSent = 0;
    const remindersToSend = [];
    
    for (const doc of applicationsQuery.docs) {
      const application = doc.data();
      const missingDocs = getMissingRequiredDocuments(application);
      
      if (missingDocs.length > 0 && application.referrerEmail) {
        remindersToSend.push({
          applicationId: doc.id,
          application,
          missingDocs
        });
      }
    }
    
    // Send up to 5 test reminders
    const testReminders = remindersToSend.slice(0, 5);
    
    for (const reminder of testReminders) {
      try {
        await sendDocumentReminderEmail(resend, reminder);
        remindersSent++;
        console.log(`✅ Sent test reminder for application ${reminder.applicationId}`);
      } catch (error) {
        console.error(`❌ Failed to send test reminder for ${reminder.applicationId}:`, error);
      }
    }
    
    return {
      success: true,
      remindersSent,
      totalChecked: applicationsQuery.docs.length,
      message: `Sent ${remindersSent} test document reminders`
    };
    
  } catch (error: any) {
    console.error('❌ Error in manual document reminder trigger:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Helper function to determine missing required documents
function getMissingRequiredDocuments(application: any): string[] {
  const missingDocs: string[] = [];
  
  // Check required documents based on application type and health plan
  const requiredDocs = [
    'memberIdCard',
    'proofOfIncome',
    'medicalRecords'
  ];
  
  // Add health plan specific requirements
  if (application.healthPlan === 'Kaiser') {
    requiredDocs.push('kaiserAuthForm');
  } else if (application.healthPlan === 'Health Net') {
    requiredDocs.push('healthNetAuthForm');
  }
  
  // Add pathway specific requirements
  if (application.pathway === 'SNF Transition') {
    requiredDocs.push('snfDischargeDocuments');
  }
  
  // Check which documents are missing
  for (const docType of requiredDocs) {
    if (!application.documents || !application.documents[docType] || 
        !application.documents[docType].uploaded) {
      missingDocs.push(docType);
    }
  }
  
  return missingDocs;
}

// Helper function to send document reminder email
async function sendDocumentReminderEmail(resend: Resend, reminder: any) {
  const { application, missingDocs } = reminder;
  
  const missingDocsList = missingDocs.map((doc: string) => {
    const docNames: { [key: string]: string } = {
      'memberIdCard': 'Member ID Card',
      'proofOfIncome': 'Proof of Income',
      'medicalRecords': 'Medical Records',
      'kaiserAuthForm': 'Kaiser Authorization Form',
      'healthNetAuthForm': 'Health Net Authorization Form',
      'snfDischargeDocuments': 'SNF Discharge Documents'
    };
    return docNames[doc] || doc;
  }).join(', ');
  
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Document Reminder - CalAIM Application</h2>
      
      <p>Dear ${application.referrerFirstName} ${application.referrerLastName},</p>
      
      <p>This is a friendly reminder that the CalAIM application for <strong>${application.memberFirstName} ${application.memberLastName}</strong> is still missing some required documents.</p>
      
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0; color: #92400e;">Missing Documents:</h3>
        <p style="margin: 0; color: #92400e;"><strong>${missingDocsList}</strong></p>
      </div>
      
      <p>To complete the application process, please upload the missing documents as soon as possible.</p>
      
      <div style="margin: 30px 0;">
        <a href="${process.env.FUNCTIONS_EMULATOR ? 'http://localhost:3000' : 'https://your-domain.com'}/applications/${reminder.applicationId}" 
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Complete Application
        </a>
      </div>
      
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
      
      <p>Thank you for your attention to this matter.</p>
      
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        This is an automated reminder. You will receive these reminders every 2 days until all required documents are uploaded.
      </p>
    </div>
  `;
  
  await resend.emails.send({
    from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
    to: [application.referrerEmail],
    subject: `Document Reminder: ${application.memberFirstName} ${application.memberLastName} - CalAIM Application`,
    html: emailHtml
  });
}