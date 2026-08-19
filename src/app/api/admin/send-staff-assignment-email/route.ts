import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendStaffAssignmentEmail } from '@/app/actions/send-email';

let adminDb: any;
try {
  if (!getApps().length) {
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
    });
    adminDb = getFirestore(app);
  } else {
    adminDb = getFirestore();
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const applicationId = String(body?.applicationId || '').trim();
    const appUserId = String(body?.appUserId || '').trim();
    const staffId = String(body?.staffId || '').trim();
    const staffName = String(body?.staffName || '').trim() || 'Staff';
    const memberName = String(body?.memberName || '').trim() || 'Member';
    const memberMrn = String(body?.memberMrn || '').trim() || 'N/A';
    const memberCounty = String(body?.memberCounty || '').trim() || 'N/A';
    const serviceDeliveryFormUrl = String(body?.serviceDeliveryFormUrl || '').trim();
    const kaiserStatus = String(body?.kaiserStatus || '').trim() || 'T2038 Received, Need First Contact';
    const calaimStatus = String(body?.calaimStatus || '').trim() || 'Authorized';
    const assignedBy = String(body?.assignedBy || '').trim() || 'Manager';
    const explicitTo = normalizeEmail(body?.to);
    let serviceDeliveryFormFileName = String(body?.serviceDeliveryFormFileName || '').trim();
    let serviceDeliveryFormFilePath = String(body?.serviceDeliveryFormFilePath || '').trim();

    if (!applicationId || !staffId) {
      return NextResponse.json(
        { success: false, error: 'applicationId and staffId are required.' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    let recipient = explicitTo;
    if (!recipient) {
      const staffSnap = await adminDb.collection('users').doc(staffId).get();
      const staffData = staffSnap.exists ? (staffSnap.data() as any) : null;
      recipient = normalizeEmail(staffData?.email);
    }

    if (!recipient) {
      return NextResponse.json(
        { success: false, error: 'Assigned staff email was not found.' },
        { status: 400 }
      );
    }

    let alreadyPushedToCaspio = Boolean(body?.alreadyPushedToCaspio);
    let resolvedServiceDeliveryFormUrl = serviceDeliveryFormUrl;
    if (!resolvedServiceDeliveryFormUrl || !serviceDeliveryFormFileName || !serviceDeliveryFormFilePath || !alreadyPushedToCaspio) {
      try {
        const appSnap = await adminDb.collection('applications').doc(applicationId).get();
        const appData = appSnap.exists ? (appSnap.data() as any) : null;
        if (!alreadyPushedToCaspio) {
          alreadyPushedToCaspio = Boolean(
            appData?.caspioSent ||
              appData?.caspioPushed ||
              String(appData?.caspioClientId2 || appData?.clientId2 || '').trim()
          );
        }
        const forms = Array.isArray(appData?.forms) ? appData.forms : [];
        const match = forms.find((form: any) =>
          String(form?.name || '').toLowerCase().includes('service delivery')
        );
        const root = appData?.serviceDeliveryForm || {};
        if (!resolvedServiceDeliveryFormUrl) {
          resolvedServiceDeliveryFormUrl = String(
            match?.downloadURL || match?.uploadedFiles?.[0]?.downloadURL || root?.downloadURL || ''
          ).trim();
        }
        if (!serviceDeliveryFormFileName) {
          serviceDeliveryFormFileName = String(
            match?.fileName || match?.uploadedFiles?.[0]?.fileName || root?.fileName || ''
          ).trim();
        }
        if (!serviceDeliveryFormFilePath) {
          serviceDeliveryFormFilePath = String(
            match?.filePath || match?.uploadedFiles?.[0]?.filePath || root?.filePath || ''
          ).trim();
        }
      } catch (lookupError) {
        console.warn('Could not load Service Delivery Form from application for assignment email:', lookupError);
      }
    }

    const baseUrl = String(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://connectcalaim.com').trim();
    const dashboardUrl = `${baseUrl.replace(/\/$/, '')}/admin/applications/${encodeURIComponent(applicationId)}${appUserId ? `?userId=${encodeURIComponent(appUserId)}` : ''}`;

    await sendStaffAssignmentEmail({
      to: recipient,
      staffName,
      memberName,
      memberMrn,
      memberCounty,
      serviceDeliveryFormUrl: resolvedServiceDeliveryFormUrl,
      serviceDeliveryFormFileName,
      serviceDeliveryFormFilePath,
      kaiserStatus,
      calaimStatus,
      assignedBy,
      dashboardUrl,
      alreadyPushedToCaspio,
    });

    return NextResponse.json({ success: true, to: recipient });
  } catch (error: any) {
    console.error('Error sending staff assignment email:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send staff assignment email') },
      { status: 500 }
    );
  }
}
