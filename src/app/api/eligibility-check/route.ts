import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Validation schema for eligibility check submission
const eligibilityCheckSchema = z.object({
  // Member Information
  memberName: z.string().min(2, 'Member name must be at least 2 characters'),
  memberBirthday: z.string().min(1, 'Member birthday is required'),
  memberMrn: z.string().min(1, 'Medical Record Number (MRN) is required'),
  healthPlan: z.enum(['Kaiser', 'Health Net']),
  county: z.string().min(1, 'County is required'),
  
  // Requester Information
  requesterName: z.string().min(2, 'Requester name is required'),
  requesterEmail: z.string().email('Valid email is required'),
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
    
    // Validate service area for Health Net
    if (data.healthPlan === 'Health Net') {
      const supportedCounties = ['Los Angeles', 'Sacramento'];
      if (!supportedCounties.includes(data.county)) {
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
    
    // Save to Firestore
    const firestore = admin.firestore();
    const docRef = await firestore.collection('eligibilityChecks').add({
      ...data,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });
    
    console.log('📋 Eligibility Check Submitted:', {
      id: docRef.id,
      memberName: data.memberName,
      healthPlan: data.healthPlan,
      county: data.county,
      requesterEmail: data.requesterEmail
    });
    
    // Send confirmation email (placeholder)
    await sendConfirmationEmail(data);
    
    // Send staff notification (placeholder)
    await sendStaffNotification({ id: docRef.id, ...data });
    
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

// Placeholder function for sending confirmation email
async function sendConfirmationEmail(data: any) {
  console.log('📧 Sending confirmation email to:', data.requesterEmail);
  
  // TODO: Implement email sending
  // This would integrate with your email service (Resend, SendGrid, etc.)
  
  const emailContent = {
    to: data.requesterEmail,
    subject: 'CalAIM Eligibility Check - Confirmation',
    html: `
      <h2>Eligibility Check Submitted</h2>
      <p>Dear ${data.requesterName},</p>
      <p>We have received your CalAIM eligibility check request for:</p>
      <ul>
        <li><strong>Member:</strong> ${data.memberName}</li>
        <li><strong>Health Plan:</strong> ${data.healthPlan}</li>
        <li><strong>County:</strong> ${data.county}</li>
        <li><strong>Date of Birth:</strong> ${data.memberBirthday}</li>
        <li><strong>Your Relationship:</strong> ${data.relationshipToMember.replace('-', ' ')}${
          data.relationshipToMember === 'other' && data.otherRelationshipSpecification 
            ? ` (${data.otherRelationshipSpecification})` 
            : ''
        }</li>
      </ul>
      <p>We will email you the eligibility results within 1 business day.</p>
      <p>Thank you for using our CalAIM eligibility check service.</p>
      <p>Best regards,<br>CalAIM Support Team</p>
    `
  };
  
  // Simulate email sending delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return { success: true, emailContent };
}

// Placeholder function for sending staff notification
async function sendStaffNotification(eligibilityCheck: any) {
  console.log('🔔 Sending staff notification for eligibility check:', eligibilityCheck.id);
  
  // TODO: Implement staff notification
  // This would notify staff members about the new eligibility check request
  
  const staffNotification = {
    type: 'eligibility_check',
    title: 'New Eligibility Check Request',
    message: `New eligibility check for ${eligibilityCheck.memberName} (${eligibilityCheck.healthPlan} - ${eligibilityCheck.county})`,
    data: eligibilityCheck,
    timestamp: new Date().toISOString()
  };
  
  // Simulate notification processing
  await new Promise(resolve => setTimeout(resolve, 50));
  
  return { success: true, notification: staffNotification };
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