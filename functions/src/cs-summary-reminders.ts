import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Resend } from "resend";
import { defineSecret } from "firebase-functions/params";

const resendApiKey = defineSecret("RESEND_API_KEY");

const getBaseUrl = () => {
  if (process.env.FUNCTIONS_EMULATOR) {
    return "http://localhost:3000";
  }
  return "https://connectcalaim.com";
};

const hasCompletedCsSummary = (application: any) => {
  if (application?.csSummaryComplete === true) return true;
  const forms = application?.forms || [];
  return forms.some((form: any) =>
    (form.name === "CS Member Summary" || form.name === "CS Summary") &&
    form.status === "Completed"
  );
};

const buildReminderLink = (applicationId: string, userId?: string) => {
  const baseUrl = getBaseUrl();
  const userIdParam = userId ? `&userId=${encodeURIComponent(userId)}` : "";
  return `${baseUrl}/forms/cs-summary-form/review?applicationId=${encodeURIComponent(applicationId)}${userIdParam}`;
};

export const sendCsSummaryReminders = onSchedule({
  schedule: "0 9 * * *",
  timeZone: "America/Los_Angeles",
  secrets: [resendApiKey]
}, async () => {
  try {
    console.log("🔔 Starting CS Summary reminder check...");
    const db = admin.firestore();
    const resend = new Resend(resendApiKey.value());
    
    const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
      db.collectionGroup("applications").get(),
      db.collection("applications").get()
    ]);
    
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
    const remindersToSend: Array<{
      docRef: FirebaseFirestore.DocumentReference;
      applicationId: string;
      application: any;
      reminderLink: string;
    }> = [];
    
    const allDocs = [...userAppsSnapshot.docs, ...adminAppsSnapshot.docs];
    const seenDocPaths = new Set<string>();
    
    for (const doc of allDocs) {
      if (seenDocPaths.has(doc.ref.path)) continue;
      seenDocPaths.add(doc.ref.path);
      
      const application = doc.data();
      const remindersEnabled = application.emailRemindersEnabled !== false;
      const completedSummary = hasCompletedCsSummary(application);
      
      if (!remindersEnabled || completedSummary || !application.referrerEmail) {
        continue;
      }
      
      const lastUpdated = application.lastUpdated?.toDate?.() || application.createdAt?.toDate?.();
      const lastReminder = application.lastCsSummaryReminder?.toDate?.();
      const reminderCount = Number(application.csSummaryReminderCount || 0);
      
      const shouldSendReminder = reminderCount < 2 &&
        lastUpdated &&
        lastUpdated <= twoDaysAgo &&
        (!lastReminder || lastReminder <= twoDaysAgo);
      
      if (!shouldSendReminder) continue;
      
      remindersToSend.push({
        docRef: doc.ref,
        applicationId: doc.id,
        application,
        reminderLink: buildReminderLink(doc.id, application.userId)
      });
    }
    
    let remindersSent = 0;
    
    for (const reminder of remindersToSend) {
      try {
        await sendCsSummaryReminderEmail(resend, reminder);
        
        await reminder.docRef.update({
          lastCsSummaryReminder: admin.firestore.FieldValue.serverTimestamp(),
          csSummaryReminderCount: admin.firestore.FieldValue.increment(1)
        });
        
        remindersSent++;
        console.log(`✅ Sent CS Summary reminder for application ${reminder.applicationId}`);
      } catch (error) {
        console.error(`❌ Failed to send CS Summary reminder for ${reminder.applicationId}:`, error);
      }
    }
    
    console.log(`🎯 CS Summary reminder job completed: ${remindersSent} reminders sent`);
    
  } catch (error) {
    console.error("❌ Error in CS Summary reminder job:", error);
    throw error;
  }
});

export const triggerCsSummaryReminders = onCall({
  secrets: [resendApiKey]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    console.log("🔔 Manual trigger for CS Summary reminders...");
    const db = admin.firestore();
    const resend = new Resend(resendApiKey.value());
    
    const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
      db.collectionGroup("applications")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get(),
      db.collection("applications")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()
    ]);
    
    const allDocs = [...userAppsSnapshot.docs, ...adminAppsSnapshot.docs];
    const seenDocPaths = new Set<string>();
    const remindersToSend: Array<{
      docRef: FirebaseFirestore.DocumentReference;
      applicationId: string;
      application: any;
      reminderLink: string;
    }> = [];
    
    for (const doc of allDocs) {
      if (seenDocPaths.has(doc.ref.path)) continue;
      seenDocPaths.add(doc.ref.path);
      
      const application = doc.data();
      const remindersEnabled = application.emailRemindersEnabled !== false;
      const completedSummary = hasCompletedCsSummary(application);
      const reminderCount = Number(application.csSummaryReminderCount || 0);
      
      if (!remindersEnabled || completedSummary || reminderCount >= 2 || !application.referrerEmail) {
        continue;
      }
      
      remindersToSend.push({
        docRef: doc.ref,
        applicationId: doc.id,
        application,
        reminderLink: buildReminderLink(doc.id, application.userId)
      });
    }
    
    const testReminders = remindersToSend.slice(0, 5);
    let remindersSent = 0;
    
    for (const reminder of testReminders) {
      try {
        await sendCsSummaryReminderEmail(resend, reminder);
        remindersSent++;
        console.log(`✅ Sent test CS Summary reminder for ${reminder.applicationId}`);
      } catch (error) {
        console.error(`❌ Failed to send test CS Summary reminder for ${reminder.applicationId}:`, error);
      }
    }
    
    return {
      success: true,
      remindersSent,
      totalChecked: allDocs.length,
      message: `Sent ${remindersSent} test CS Summary reminders`
    };
    
  } catch (error: any) {
    console.error("❌ Error in manual CS Summary reminder trigger:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", `Unexpected error: ${error.message}`);
  }
});

async function sendCsSummaryReminderEmail(
  resend: Resend,
  reminder: {
    application: any;
    applicationId: string;
    reminderLink: string;
  }
) {
  const { application, reminderLink } = reminder;
  const memberName = `${application.memberFirstName || ""} ${application.memberLastName || ""}`.trim();
  const referrerName = `${application.referrerFirstName || ""} ${application.referrerLastName || ""}`.trim() || "there";
  
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Reminder: Complete CS Summary</h2>
      
      <p>Hi ${referrerName},</p>
      
      <p>This is a reminder to complete the CS Summary form for <strong>${memberName || "your member"}</strong>.</p>
      
      <div style="margin: 24px 0;">
        <a href="${reminderLink}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Complete CS Summary
        </a>
      </div>
      
      <p>If you have any questions or need assistance, please contact our support team.</p>
      
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        This is an automated reminder. You will receive reminders every 2 days until the CS Summary is completed.
      </p>
    </div>
  `;
  
  await resend.emails.send({
    from: "CalAIM Pathfinder <noreply@carehomefinders.com>",
    to: [application.referrerEmail],
    subject: `Action Required: CS Summary for ${memberName || "your member"}`,
    html: emailHtml
  });
}
