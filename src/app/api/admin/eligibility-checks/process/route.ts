import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { sendEligibilityCheckResultEmail } from '@/app/actions/send-email';

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
    const memberName = String((checkData as any)?.memberName || '').trim() || `${String((checkData as any)?.memberFirstName || '').trim()} ${String((checkData as any)?.memberLastName || '').trim()}`.trim();
    const requesterName = String((checkData as any)?.requesterName || '').trim() || `${String((checkData as any)?.requesterFirstName || '').trim()} ${String((checkData as any)?.requesterLastName || '').trim()}`.trim();
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
      const to = String((checkData as any)?.requesterEmail || '').trim();
      if (to) {
        await sendEligibilityCheckResultEmail({
          to,
          requesterName: requesterName || 'Requester',
          memberName: memberName || 'Member',
          healthPlan: String((checkData as any)?.healthPlan || '').trim() || '—',
          county: String((checkData as any)?.county || '').trim() || '—',
          checkId,
          result,
          resultMessage,
        });
      }
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