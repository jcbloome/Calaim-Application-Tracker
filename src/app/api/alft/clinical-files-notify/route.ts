import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendSwClinicalFilesUpdatedEmail } from '@/app/actions/send-email';
import { buildIspWorkflowActivityEntry } from '@/lib/isp-workflow-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const idToken = clean(body?.idToken, 4000);
    const memberId = clean(body?.memberId, 120);
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 401 });
    if (!memberId) return NextResponse.json({ success: false, error: 'Missing memberId' }, { status: 400 });
    if (!files.length) {
      return NextResponse.json({ success: false, error: 'No files provided for notification.' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = clean(decoded.email, 220).toLowerCase();
    const uid = clean(decoded.uid, 128);
    const displayName = clean(decoded.name, 160) || email || 'Admin';
    if (!email || !uid) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const [uidAdmin, emailAdmin, uidSuper, emailSuper] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    const isAdmin =
      isHardcodedAdminEmail(email) ||
      uidAdmin.exists ||
      emailAdmin.exists ||
      uidSuper.exists ||
      emailSuper.exists;
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const assignmentRef = adminDb.collection('alft_assignments').doc(memberId);
    const assignmentSnap = await assignmentRef.get();
    const assignment = assignmentSnap.exists ? (assignmentSnap.data() as Record<string, any>) : {};
    const memberName =
      clean(assignment?.memberName, 180) ||
      `${clean(assignment?.memberFirstName, 80)} ${clean(assignment?.memberLastName, 80)}`.trim() ||
      'Member';
    const memberMrn = clean(assignment?.memberMrn || assignment?.medicalRecordNumber, 80);
    const swEmail = clean(assignment?.assignedSwEmail || body?.swEmail, 220).toLowerCase();
    const swName = clean(assignment?.assignedSwName || body?.swName, 160) || swEmail || 'Social Worker';

    let swUid = clean(assignment?.assignedSwUid, 128);
    if (!swUid && swEmail) {
      try {
        const byEmail = await adminDb.collection('socialWorkers').where('email', '==', swEmail).limit(1).get();
        if (!byEmail.empty) swUid = clean(byEmail.docs[0]?.id, 128);
        if (!swUid) {
          const emailDoc = await adminDb.collection('socialWorkers').doc(swEmail).get();
          if (emailDoc.exists) swUid = swEmail;
        }
      } catch {
        // best-effort
      }
    }

    const fileSummaries = files
      .map((file: any) => ({
        fileName: clean(file?.fileName, 180),
        label: clean(file?.label, 120),
      }))
      .filter((file: { fileName: string; label: string }) => file.fileName || file.label);

    const atIso = new Date().toISOString();
    const activityEntries = [
      ...fileSummaries.map((file: { fileName: string; label: string }) =>
        buildIspWorkflowActivityEntry({
          event: 'clinical_file_uploaded',
          atIso,
          byName: displayName,
          byEmail: email,
          fileName: file.fileName || null,
          fileLabel: file.label || null,
          recipientEmail: swEmail || null,
          noteSentToSw: Boolean(swEmail),
          details: swEmail
            ? `Note sent to SW (${swEmail}): new file uploaded`
            : 'Uploaded for SW portal (no SW email on assignment yet)',
        })
      ),
      buildIspWorkflowActivityEntry({
        event: 'clinical_files_note_sent',
        atIso,
        byName: displayName,
        byEmail: email,
        recipientEmail: swEmail || null,
        noteSentToSw: Boolean(swEmail),
        details: fileSummaries
          .map((f: { fileName: string; label: string }) => f.label || f.fileName)
          .filter(Boolean)
          .join(', '),
      }),
    ];

    await assignmentRef.set(
      {
        memberId,
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(...activityEntries),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    let emailSent = false;
    let emailError = '';
    if (swEmail) {
      try {
        await sendSwClinicalFilesUpdatedEmail({
          to: swEmail,
          socialWorkerName: swName,
          memberName,
          mrn: memberMrn || undefined,
          fileLabels: fileSummaries.map((f: { fileName: string; label: string }) => f.label || f.fileName),
          uploadedBy: displayName,
          portalUrl: '/sw-login',
        });
        emailSent = true;
      } catch (error: any) {
        emailError = String(error?.message || 'Failed to email social worker.');
      }
    }

    if (swUid) {
      const fileList = fileSummaries
        .map((f: { fileName: string; label: string }) => f.label || f.fileName)
        .filter(Boolean)
        .join(', ');
      await adminDb.collection('staff_notifications').add({
        userId: swUid,
        recipientName: swName,
        title: 'New clinical file uploaded for ISP',
        message: `${memberName}${memberMrn ? ` • MRN ${memberMrn}` : ''}\nNew file(s): ${fileList || 'Clinical document'}\nPlease review in SW Portal before or while completing the ALFT.`,
        memberName,
        type: 'alft_clinical_file_uploaded',
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        source: 'system',
        createdBy: uid,
        createdByName: displayName,
        senderName: displayName,
        senderId: uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actionUrl: '/sw-portal/alft-upload',
        memberClientId: memberId,
      });
    }

    return NextResponse.json({
      success: true,
      emailSent,
      emailError: emailError || null,
      notifiedSwUid: swUid || null,
      recipientEmail: swEmail || null,
      activityCount: activityEntries.length,
    });
  } catch (error: any) {
    console.error('clinical-files-notify failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to log/notify clinical file upload.') },
      { status: 500 }
    );
  }
}
