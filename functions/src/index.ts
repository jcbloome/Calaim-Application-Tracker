import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();

// Run every day at 9:00 AM (Los Angeles time)
export const checkMissingForms = onSchedule({
  schedule: "0 9 * * *",
  timeZone: "America/Los_Angeles",
}, async (event) => {

  const db = admin.firestore();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  console.log("🔍 Checking for missing forms created before:", sevenDaysAgo);

  // Find applications that are 'Incomplete' and older than 7 days
  const snapshot = await db.collection("applications")
    .where("status", "==", "Incomplete")
    .where("createdAt", "<", sevenDaysAgo)
    .get();

  if (snapshot.empty) {
    console.log("✅ No missing forms found.");
    return;
  }

  // Loop through the results
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`⚠️ Found Missing Form: Client ${data.clientName} (ID: ${doc.id})`);
  });
});