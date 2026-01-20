import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const checkId = formData.get('checkId') as string;
    const result = formData.get('result') as 'eligible' | 'not-eligible';
    const resultMessage = formData.get('resultMessage') as string;
    const screenshot = formData.get('screenshot') as File | null;

    if (!checkId || !result || !resultMessage) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields' 
      }, { status: 400 });
    }

    const firestore = admin.firestore();
    const checkRef = firestore.collection('eligibilityChecks').doc(checkId);
    
    // Get the eligibility check document
    const checkDoc = await checkRef.get();
    if (!checkDoc.exists) {
      return NextResponse.json({ 
        success: false, 
        message: 'Eligibility check not found' 
      }, { status: 404 });
    }

    const checkData = checkDoc.data();
    let screenshotUrl = '';

    // Handle screenshot upload if provided
    if (screenshot) {
      try {
        const bucket = getStorage().bucket();
        const fileName = `eligibility-screenshots/${checkId}-${Date.now()}-${screenshot.name}`;
        const file = bucket.file(fileName);
        
        const buffer = Buffer.from(await screenshot.arrayBuffer());
        
        await file.save(buffer, {
          metadata: {
            contentType: screenshot.type,
          },
        });

        // Make the file publicly accessible
        await file.makePublic();
        
        screenshotUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      } catch (uploadError) {
        console.error('Error uploading screenshot:', uploadError);
        // Continue without screenshot if upload fails
      }
    }

    // Update the eligibility check document
    const updateData: any = {
      status: 'completed',
      result,
      resultMessage,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: 'admin' // You could get this from auth context
    };

    if (screenshotUrl) {
      updateData.screenshotUrl = screenshotUrl;
    }

    await checkRef.update(updateData);

    // Send email to requester
    try {
      await sendResultEmail({
        requesterName: checkData.requesterName,
        requesterEmail: checkData.requesterEmail,
        memberName: checkData.memberName,
        healthPlan: checkData.healthPlan,
        relationshipToMember: checkData.relationshipToMember,
        result,
        resultMessage
        // Note: screenshotUrl removed for HIPAA compliance - screenshots kept internal only
      });
    } catch (emailError) {
      console.error('Error sending result email:', emailError);
      // Continue even if email fails - the result is still saved
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Eligibility check processed successfully' 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error processing eligibility check:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}

async function sendResultEmail({
  requesterName,
  requesterEmail,
  memberName,
  healthPlan,
  relationshipToMember,
  result,
  resultMessage
}: {
  requesterName: string;
  requesterEmail: string;
  memberName: string;
  healthPlan: string;
  relationshipToMember: string;
  result: 'eligible' | 'not-eligible';
  resultMessage: string;
}) {
  // This is a placeholder for email functionality
  // You would integrate with your email service (SendGrid, AWS SES, etc.)
  
  const emailContent = {
    to: requesterEmail,
    subject: `CalAIM Eligibility Check Results for ${memberName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937;">CalAIM Eligibility Check Results</h2>
        
        <p>Dear ${requesterName},</p>
        
        <p>We have completed the CalAIM eligibility check for <strong>${memberName}</strong> (${healthPlan}).</p>
        
        <p style="font-size: 14px; color: #6b7280; margin: 10px 0;">
          <em>Relationship to member: ${relationshipToMember.replace('-', ' ')}${
            relationshipToMember === 'other' && checkData.otherRelationshipSpecification 
              ? ` (${checkData.otherRelationshipSpecification})` 
              : ''
          }</em>
        </p>
        
        <div style="background-color: ${result === 'eligible' ? '#dcfce7' : '#fee2e2'}; 
                    border: 1px solid ${result === 'eligible' ? '#16a34a' : '#dc2626'}; 
                    border-radius: 8px; 
                    padding: 16px; 
                    margin: 20px 0;">
          <h3 style="margin: 0; color: ${result === 'eligible' ? '#16a34a' : '#dc2626'};">
            Result: ${result === 'eligible' ? 'ELIGIBLE for CalAIM' : 'NOT ELIGIBLE for CalAIM'}
          </h3>
        </div>
        
        <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0;">Details:</h4>
          <p style="white-space: pre-wrap;">${resultMessage}</p>
        </div>
        
        <!-- Screenshots removed for HIPAA compliance - kept internal only -->
        
        <div style="background-color: #eff6ff; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0;">Additional Resources:</h4>
          <ul>
            <li>For share of cost information, visit: <a href="https://benefitscal.com" target="_blank">BenefitsCal.com</a></li>
            <li>If you have questions about this result, please contact our team</li>
          </ul>
        </div>
        
        <p>Thank you for using our CalAIM eligibility verification service.</p>
        
        <p>Best regards,<br>CalAIM Support Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #6b7280;">
          This email contains confidential information. If you received this in error, please delete it immediately.
        </p>
      </div>
    `
  };

  // Log the email content for now (replace with actual email service)
  console.log('Email to be sent:', emailContent);
  
  // TODO: Integrate with actual email service
  // Example with SendGrid:
  // await sgMail.send(emailContent);
  
  // For now, we'll just log it
  return Promise.resolve();
}