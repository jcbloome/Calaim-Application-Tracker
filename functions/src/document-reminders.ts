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
    
    // Get all applications (user + admin)
    const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
      db.collectionGroup('applications').get(),
      db.collection('applications').get()
    ]);
    const now = new Date();
    const defaultFrequencyDays = 2;
    
    let remindersSent = 0;
    const remindersToSend = [];
    
    const allDocs = [...userAppsSnapshot.docs, ...adminAppsSnapshot.docs];
    const seenDocPaths = new Set<string>();
    
    for (const doc of allDocs) {
      if (seenDocPaths.has(doc.ref.path)) continue;
      seenDocPaths.add(doc.ref.path);
      
      const application = doc.data();
      
      // Check if application has missing required documents and reminders are enabled
      const missingDocs = getMissingRequiredDocuments(application);
      const emailRemindersEnabled = application.emailRemindersEnabled !== false; // Default to true if not set
      
      if (missingDocs.length > 0 && emailRemindersEnabled) {
        const frequencyDays = Math.max(1, Number(application.documentReminderFrequencyDays) || defaultFrequencyDays);
        const frequencyAgo = new Date(now.getTime() - (frequencyDays * 24 * 60 * 60 * 1000));
        const lastSubmitted = application.lastUpdated?.toDate() || application.createdAt?.toDate();
        const lastReminder = application.lastDocumentReminder?.toDate();
        
        // Send reminder if:
        // 1. It's been 2+ days since last submission/update
        // 2. No reminder sent yet, OR last reminder was 2+ days ago
        // 3. Email reminders are enabled for this application
        const shouldSendReminder = lastSubmitted && 
          lastSubmitted <= frequencyAgo && 
          (!lastReminder || lastReminder <= frequencyAgo);
        
        if (shouldSendReminder && application.referrerEmail) {
          remindersToSend.push({
            applicationId: doc.id,
            docRef: doc.ref,
            application,
            missingDocs,
            frequencyDays
          });
        }
      }
    }
    
    // Send reminder emails
    for (const reminder of remindersToSend) {
      try {
        await sendDocumentReminderEmail(resend, reminder);
        
        // Update the application with last reminder timestamp
        await reminder.docRef.update({
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
    const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
      db.collectionGroup('applications')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
      db.collection('applications')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
    ]);
    
    let remindersSent = 0;
    const remindersToSend = [];
    
    const allDocs = [...userAppsSnapshot.docs, ...adminAppsSnapshot.docs];
    const seenDocPaths = new Set<string>();
    
    for (const doc of allDocs) {
      if (seenDocPaths.has(doc.ref.path)) continue;
      seenDocPaths.add(doc.ref.path);
      
      const application = doc.data();
      const missingDocs = getMissingRequiredDocuments(application);
      const emailRemindersEnabled = application.emailRemindersEnabled !== false; // Default to true if not set
      
      if (missingDocs.length > 0 && application.referrerEmail && emailRemindersEnabled) {
        remindersToSend.push({
          applicationId: doc.id,
          docRef: doc.ref,
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
      totalChecked: allDocs.length,
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
function getDefaultRequiredFormNames(pathway?: string, healthPlan?: string): string[] {
  const baseRequirements = [
    'CS Member Summary',
    'Waivers & Authorizations',
    'Room and Board Commitment',
    'Proof of Income',
    "LIC 602A - Physician's Report",
    'Medicine List',
    'Eligibility Screenshot'
  ];
  
  if (String(pathway || '').toLowerCase().includes('diversion')) {
    return [...baseRequirements, 'Declaration of Eligibility'];
  }
  
  return [...baseRequirements, 'SNF Facesheet'];
}

function getMissingRequiredDocuments(application: any): string[] {
  const forms = Array.isArray(application?.forms) ? application.forms : [];
  const formNames = forms.map((form: any) => form?.name).filter(Boolean);
  const fallbackRequired = getDefaultRequiredFormNames(application?.pathway, application?.healthPlan);
  const requiredFormNames = formNames.length > 0 ? formNames : fallbackRequired;
  
  const formStatusMap = new Map<string, any>(
    forms.map((form: any) => [String(form?.name || '').trim(), form] as [string, any])
  );
  
  return requiredFormNames.filter((formName) => {
    const normalizedName = String(formName || '').trim();
    if (!normalizedName) return false;
    if (normalizedName === 'CS Member Summary' || normalizedName === 'CS Summary') return false;
    
    const form = formStatusMap.get(normalizedName);
    if (!form) return true;
    if (form.type === 'Info') return false;
    return form.status !== 'Completed';
  });
}

// Helper function to send document reminder email
async function sendDocumentReminderEmail(resend: Resend, reminder: any) {
  const { application, missingDocs, frequencyDays = 2 } = reminder;
  
  const missingDocsList = missingDocs.map((doc: string) => String(doc)).join(', ');
  
  const appLink = `${process.env.FUNCTIONS_EMULATOR ? 'http://localhost:3000' : 'https://connectcalaim.com'}/pathway?applicationId=${reminder.applicationId}`;
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
        <a href="${appLink}" 
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Complete Application
        </a>
      </div>
      
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
      
      <p>Thank you for your attention to this matter.</p>
      
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        This is an automated reminder. You will receive these reminders every ${frequencyDays} day${frequencyDays === 1 ? '' : 's'} until all required documents are uploaded.
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