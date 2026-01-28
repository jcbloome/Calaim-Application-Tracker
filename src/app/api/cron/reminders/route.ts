
import { NextResponse } from 'next/server';
import { sendReminderEmails } from '@/ai/flows/manage-reminders';
import * as admin from 'firebase-admin';
import { Application } from '@/lib/definitions';
import { FormValues } from '@/app/forms/cs-summary-form/schema';

// DO NOT MOVE THIS IMPORT. It must be the first line to initialize Firebase Admin.
import '@/ai/firebase';


/**
 * This is a secure API route designed to be called by a cron job (e.g., Google Cloud Scheduler).
 * It fetches all applications, filters for those needing reminders, and triggers the email sending logic.
 */
export async function GET(request: Request) {
  // 1. Security Check: Ensure only an authorized scheduler can call this endpoint.
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Fetch all application data from Firestore.
  try {
    const firestore = admin.firestore();
    const applicationsSnapshot = await firestore.collectionGroup('applications').get();
    
    if (applicationsSnapshot.empty) {
      return NextResponse.json({ success: true, message: 'No applications found to process.' });
    }

    const allApplications = applicationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() as Application & FormValues
    }));

    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const isDueForReminder = (lastSent: any) => {
      if (!lastSent) return true;
      const lastDate = typeof lastSent?.toDate === 'function'
        ? lastSent.toDate()
        : new Date(lastSent);
      if (Number.isNaN(lastDate.getTime())) return true;
      return now - lastDate.getTime() >= TWO_DAYS_MS;
    };

    const appsToRemind = allApplications.filter(({ data }) =>
      data.emailRemindersEnabled === true &&
      (data.status === 'In Progress' || data.status === 'Requires Revision') &&
      data.forms?.some(form => form.status === 'Pending') &&
      isDueForReminder((data as any).emailReminderLastSentAt)
    );
    
    if (appsToRemind.length === 0) {
        return NextResponse.json({ success: true, sentCount: 0, message: 'No applications currently need reminders.' });
    }

    // 3. Call your existing email logic with the fetched data.
    // The data is stringified and parsed to handle non-serializable Firestore Timestamps.
    const result = await sendReminderEmails(
      JSON.parse(JSON.stringify(appsToRemind.map(({ data }) => data)))
    );

    if (!result.success) {
      // If the email sending failed, return a 500 error to make the cron job status reflect the failure.
      return NextResponse.json(result, { status: 500 });
    }

    if (result.sentApplicationIds?.length) {
      const batch = firestore.batch();
      appsToRemind.forEach(({ id, ref }) => {
        if (!result.sentApplicationIds?.includes(id)) return;
        batch.update(ref, {
          emailReminderLastSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[CRON JOB ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
