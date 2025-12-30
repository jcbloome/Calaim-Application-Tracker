
import { NextResponse } from 'next/server';
import { sendReminderEmails } from '@/ai/flows/manage-reminders';
import * as admin from 'firebase-admin';
import { Application } from '@/lib/definitions';
import { FormValues } from '@/app/forms/cs-summary-form/schema';

// Firebase Admin is initialized globally in `src/ai/firebase.ts`
// and should not be re-initialized here.

/**
 * This is a secure API route designed to be called by a cron job (e.g., Google Cloud Scheduler).
 * It fetches all applications, filters for those needing reminders, and triggers the email sending logic.
 */
export async function GET(request: Request) {
  // 1. Security Check: Ensure only an authorized scheduler can call this endpoint.
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Fetch all application data from Firestore.
  try {
    const firestore = admin.firestore();
    const applicationsSnapshot = await firestore.collectionGroup('applications').get();
    
    if (applicationsSnapshot.empty) {
      return NextResponse.json({ success: true, message: 'No applications found to process.' });
    }

    const allApplications = applicationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Application & FormValues));
    
    const appsToRemind = allApplications.filter(app => 
        (app.status === 'In Progress' || app.status === 'Requires Revision') &&
        app.forms?.some(form => form.status === 'Pending')
    );
    
    if (appsToRemind.length === 0) {
        return NextResponse.json({ success: true, message: 'No applications currently need reminders.' });
    }

    // 3. Call your existing email logic with the fetched data.
    // The data is stringified and parsed to handle non-serializable Firestore Timestamps.
    const result = await sendReminderEmails(JSON.parse(JSON.stringify(appsToRemind)));

    return NextResponse.json({ success: true, ...result });

  } catch (error: any) {
    console.error('[CRON JOB ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
