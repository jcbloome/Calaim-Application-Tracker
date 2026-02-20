import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import HealthNetApplicationEmail from '@/components/emails/HealthNetApplicationEmail';
import { renderAsync } from '@react-email/render';
import { adminDb } from '@/firebase-admin';

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

// Health Net notification recipients
const HEALTH_NET_RECIPIENTS = [
  {
    email: 'monica@carehomefinders.com',
    name: 'Monica'
  },
  {
    email: 'leidy@carehomefinders.com', 
    name: 'Leidy'
  }
];

export async function POST(request: NextRequest) {
  try {
    console.log('🏥 Health Net notification request received');
    
    const body = await request.json();
    const {
      memberName,
      memberClientId,
      applicationId,
      submittedBy,
      submittedDate,
      pathway,
      currentLocation,
      healthPlan,
      applicationUrl,
    } = body;

    console.log('📋 Application details:', {
      memberName,
      applicationId,
      healthPlan,
      pathway,
      submittedBy
    });

    // Validate required fields
    if (!memberName || !applicationId || !healthPlan || !applicationUrl) {
      console.log('❌ Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: memberName, applicationId, healthPlan, applicationUrl' },
        { status: 400 }
      );
    }

    // Only process Health Net applications
    if (healthPlan !== 'Health Net') {
      console.log('ℹ️ Not a Health Net application, skipping notification');
      return NextResponse.json(
        { message: 'Not a Health Net application, no notification sent' },
        { status: 200 }
      );
    }

    const resend = getResendClient();
    if (!resend) {
      console.error('❌ RESEND_API_KEY not configured');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const emailResults = [];
    const notificationResults = [];

    // Send emails to Health Net recipients
    for (const recipient of HEALTH_NET_RECIPIENTS) {
      try {
        console.log(`📧 Sending email to ${recipient.name} (${recipient.email})`);

        // Render the email HTML
        const emailHtml = await renderAsync(HealthNetApplicationEmail({
          memberName,
          memberClientId,
          applicationId,
          submittedBy: submittedBy || 'Unknown',
          submittedDate: submittedDate || new Date().toLocaleDateString(),
          pathway: pathway || 'Not specified',
          currentLocation: currentLocation || 'Not specified',
          healthPlan,
          applicationUrl,
          recipientName: recipient.name,
        }));

        const emailResult = await resend.emails.send({
          from: 'CalAIM Application Portal <noreply@carehomefinders.com>',
          to: recipient.email,
          subject: `🏥 New Health Net Application: ${memberName} (${applicationId})`,
          html: emailHtml,
        });

        console.log(`✅ Email sent to ${recipient.name}:`, emailResult);
        emailResults.push({
          recipient: recipient.email,
          success: true,
          messageId: emailResult.data?.id,
        });

      } catch (emailError) {
        console.error(`❌ Failed to send email to ${recipient.name}:`, emailError);
        emailResults.push({
          recipient: recipient.email,
          success: false,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
        });
      }
    }

    // Store notification in Firestore for bell notifications
    try {
      const notificationData = {
        type: 'health-net-application',
        title: 'New Health Net Application',
        message: `${memberName} submitted a new Health Net CalAIM application`,
        applicationId,
        memberName,
        healthPlan,
        pathway,
        submittedBy,
        submittedDate,
        applicationUrl,
        recipients: HEALTH_NET_RECIPIENTS.map(r => r.email),
        createdAt: new Date(),
        read: false,
        priority: 'high',
      };

      const docRef = await adminDb.collection('notifications').add(notificationData);
      console.log('🔔 Notification stored in Firestore:', docRef.id);
      
      notificationResults.push({
        type: 'bell',
        success: true,
        notificationId: docRef.id,
      });

    } catch (firestoreError) {
      console.error('❌ Failed to store notification in Firestore:', firestoreError);
      notificationResults.push({
        type: 'bell',
        success: false,
        error: firestoreError instanceof Error ? firestoreError.message : 'Unknown error',
      });
    }

    // Return comprehensive results
    const response = {
      message: 'Health Net notifications processed',
      applicationId,
      memberName,
      healthPlan,
      emailResults,
      notificationResults,
      summary: {
        emailsSent: emailResults.filter(r => r.success).length,
        emailsFailed: emailResults.filter(r => !r.success).length,
        bellNotificationStored: notificationResults.some(r => r.type === 'bell' && r.success),
      }
    };

    console.log('📊 Notification summary:', response.summary);
    
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('❌ Health Net notification failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process Health Net notifications',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve Health Net notifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    let query = adminDb.collection('notifications')
      .where('type', '==', 'health-net-application')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (unreadOnly) {
      query = query.where('read', '==', false);
    }

    const snapshot = await query.get();
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({
      notifications,
      count: notifications.length,
    });

  } catch (error) {
    console.error('❌ Failed to fetch Health Net notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}