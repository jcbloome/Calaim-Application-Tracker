import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { sendEligibilityCheckConfirmationEmail } from '@/app/actions/send-email';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const KAISER_CONTRACTED_COUNTIES = [
  'Alameda',
  'Amador',
  'Contra Costa',
  'El Dorado',
  'Fresno',
  'Imperial',
  'Kern',
  'Kings',
  'Los Angeles',
  'Madera',
  'Marin',
  'Mariposa',
  'Napa',
  'Orange',
  'Placer',
  'Riverside',
  'Sacramento',
  'San Bernardino',
  'San Diego',
  'San Francisco',
  'San Joaquin',
  'San Mateo',
  'Santa Clara',
  'Santa Cruz',
  'Solano',
  'Sonoma',
  'Stanislaus',
  'Sutter',
  'Tulare',
  'Ventura',
  'Yolo',
  'Yuba',
] as const;

const HEALTH_NET_SUPPORTED_COUNTIES = ['Los Angeles', 'Sacramento'] as const;
const KAISER_CONTRACTED_COUNTIES_TEXT =
  'Alameda, Amador, Contra Costa, El Dorado, Fresno, Imperial, Kern, Kings, Los Angeles, Madera, Marin, Mariposa, Napa, Orange, Placer, Riverside, Sacramento, San Bernardino, San Diego, San Francisco, San Joaquin, San Mateo, Santa Clara, Santa Cruz, Solano, Sonoma, Stanislaus, Sutter, Tulare, Ventura, Yolo, and Yuba';

// Validation schema for eligibility check submission
const eligibilityCheckSchema = z.object({
  // Member Information
  memberFirstName: z.string().min(2, 'Member first name must be at least 2 characters'),
  memberLastName: z.string().min(2, 'Member last name must be at least 2 characters'),
  memberBirthday: z.string().min(1, 'Member birthday is required'),
  memberMrn: z.string().min(1, 'Medical Record Number (MRN) is required'),
  healthPlan: z.enum(['Kaiser', 'Health Net']),
  pathway: z.string().optional(),
  county: z.string().min(1, 'County is required'),
  
  // Requester Information
  requesterFirstName: z.string().min(2, 'Requester first name is required'),
  requesterLastName: z.string().min(2, 'Requester last name is required'),
  requesterEmail: z.string().email('Valid email is required'),
  confirmEmail: z.string().email('Valid email is required'),
  relationshipToMember: z.string().min(1, 'Relationship to member is required'),
  otherRelationshipSpecification: z.string().optional(),
  
  // Optional additional information
  additionalInfo: z.string().optional()
}).refine((data) => {
  // If relationship is "other", then otherRelationshipSpecification is required
  if (data.relationshipToMember === 'other') {
    return data.otherRelationshipSpecification && data.otherRelationshipSpecification.trim().length > 0;
  }
  return true;
}, {
  message: 'Please specify the relationship when selecting "Other"',
  path: ['otherRelationshipSpecification']
}).refine((data) => {
  // Email addresses must match
  return data.requesterEmail === data.confirmEmail;
}, {
  message: 'Email addresses do not match',
  path: ['confirmEmail']
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate the request data
    const validationResult = eligibilityCheckSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }
    
    const data = validationResult.data;
    const memberName = `${String(data.memberFirstName || '').trim()} ${String(data.memberLastName || '').trim()}`.trim();
    const requesterName = `${String(data.requesterFirstName || '').trim()} ${String(data.requesterLastName || '').trim()}`.trim();
    
    // Validate service area by plan.
    if (data.healthPlan === 'Health Net') {
      if (!HEALTH_NET_SUPPORTED_COUNTIES.includes(data.county as typeof HEALTH_NET_SUPPORTED_COUNTIES[number])) {
        return NextResponse.json(
          {
            success: false,
            error: 'Service area not supported',
            message: 'Health Net services are only available in Los Angeles and Sacramento counties.'
          },
          { status: 400 }
        );
      }
    }
    if (data.healthPlan === 'Kaiser') {
      if (!KAISER_CONTRACTED_COUNTIES.includes(data.county as typeof KAISER_CONTRACTED_COUNTIES[number])) {
        return NextResponse.json(
          {
            success: false,
            error: 'Service area not supported',
            message:
              `Kaiser services are only available in contracted counties: ${KAISER_CONTRACTED_COUNTIES_TEXT}`
          },
          { status: 400 }
        );
      }
    }
    
    // Save to Firestore
    const firestore = admin.firestore();
    const docRef = await firestore.collection('eligibilityChecks').add({
      ...data,
      memberName,
      requesterName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });
    
    console.log('📋 Eligibility Check Submitted:', {
      id: docRef.id,
      memberName,
      healthPlan: data.healthPlan,
      county: data.county,
      requesterEmail: data.requesterEmail
    });
    
    // Send confirmation email to requester
    try {
      await sendEligibilityCheckConfirmationEmail({
        to: data.requesterEmail,
        requesterName: requesterName || 'Requester',
        requesterEmail: data.requesterEmail,
        memberName: memberName || 'Member',
        healthPlan: data.healthPlan,
        county: data.county,
        checkId: docRef.id,
      });
    } catch (emailError) {
      // Don't fail the submission if email is down.
      console.error('📧 Eligibility confirmation email failed:', emailError);
    }

    // Notify staff recipients (Electron + My Notifications) using review notification settings.
    try {
      const settingsSnap = await firestore.collection('system_settings').doc('review_notifications').get();
      const settings = settingsSnap.exists ? settingsSnap.data() : null;
      const globalEnabled = (settings as any)?.enabled === undefined ? true : Boolean((settings as any)?.enabled);
      if (!globalEnabled) {
        return NextResponse.json({
          success: true,
          message: 'Eligibility check submitted successfully',
          checkId: docRef.id,
          estimatedResponse: '1 business day'
        });
      }
      const recipients = ((settings as any)?.recipients || {}) as Record<string, any>;
      const recipientUids: string[] = [];
      const recipientMetaByUid = new Map<string, any>();

      Object.entries(recipients).forEach(([key, raw]) => {
        const r = raw || {};
        if (!Boolean(r?.enabled)) return;
        if (!Boolean(r?.eligibility)) return;
        const uid = String(r?.uid || '').trim() || (!String(key).includes('@') ? String(key).trim() : '');
        if (!uid) return;
        if (!recipientUids.includes(uid)) recipientUids.push(uid);
        recipientMetaByUid.set(uid, r);
      });

      if (recipientUids.length > 0) {
        const memberMrn = String(data.memberMrn || '').trim() || '—';
        const memberDob = String(data.memberBirthday || '').trim() || '—';
        const memberCounty = String(data.county || '').trim() || '—';
        const mcpName = String(data.healthPlan || '').trim() || '—';
        const pathway = String(data.pathway || '').trim() || 'Eligibility Check';
        const basePayload: Record<string, any> = {
          title: 'Eligibility Check',
          message:
            `${memberName || 'Member'} — ${data.healthPlan} • ${memberCounty}\n` +
            `MRN: ${memberMrn} • DOB: ${memberDob} • County: ${memberCounty}\n` +
            `MCP: ${mcpName} • Pathway: ${pathway}\n` +
            `Requester: ${data.requesterEmail}`,
          type: 'eligibility_check',
          priority: 'Priority',
          status: 'Open',
          isRead: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          source: 'portal',
          actionUrl: `/admin/eligibility-checks?checkId=${encodeURIComponent(docRef.id)}`,
          eligibilityCheckId: docRef.id,
          memberName,
          memberMrn: memberMrn === '—' ? null : memberMrn,
          memberDob: memberDob === '—' ? null : memberDob,
          mcpName: mcpName === '—' ? null : mcpName,
          pathway,
          healthPlan: data.healthPlan,
          county: memberCounty === '—' ? null : memberCounty,
        };

        await Promise.all(
          recipientUids.map((uid) => {
            const meta = recipientMetaByUid.get(uid) || {};
            const recipientName = String(meta?.name || meta?.email || 'Staff').trim() || 'Staff';
            return firestore.collection('staff_notifications').add({
              ...basePayload,
              userId: uid,
              recipientName,
            });
          })
        );
      }
    } catch (notifyError) {
      console.error('🔔 Eligibility staff notification failed:', notifyError);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Eligibility check submitted successfully',
      checkId: docRef.id,
      estimatedResponse: '1 business day'
    });
    
  } catch (error: any) {
    console.error('❌ Error processing eligibility check:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to process eligibility check. Please try again.'
      },
      { status: 500 }
    );
  }
}

// GET endpoint for retrieving eligibility check status (for future use)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const checkId = searchParams.get('id');
  
  if (!checkId) {
    return NextResponse.json(
      { success: false, error: 'Check ID is required' },
      { status: 400 }
    );
  }
  
  // TODO: Implement status lookup from database
  
  return NextResponse.json({
    success: true,
    checkId,
    status: 'pending',
    message: 'Eligibility check is being processed. Results will be emailed within 1 business day.'
  });
}