import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const signOffData = await request.json();
    
    console.log('📋 SW Visit Sign-Off Submission:', {
      rcfeName: signOffData.rcfeName,
      socialWorkerId: signOffData.socialWorkerId,
      completedVisits: signOffData.completedVisits?.length || 0,
      staffName: signOffData.signOffData?.rcfeStaffName,
      hasGeolocation: !!signOffData.signOffData?.geolocation,
      submittedAt: signOffData.submittedAt
    });

    // Validate required fields
    if (!signOffData.rcfeId || !signOffData.socialWorkerId || !signOffData.completedVisits?.length) {
      return NextResponse.json({
        success: false,
        error: 'Missing required sign-off data'
      }, { status: 400 });
    }

    // Validate RCFE staff signature
    if (!signOffData.signOffData?.signature || !signOffData.signOffData?.rcfeStaffName) {
      return NextResponse.json({
        success: false,
        error: 'RCFE staff signature and name required'
      }, { status: 400 });
    }

    const locationVerified = !!signOffData.signOffData?.geolocation;

    // Here you would typically:
    // 1. Save the sign-off record to Firestore
    // 2. Update the visit records with sign-off confirmation
    // 3. Generate compliance reports
    // 4. Send notifications to supervisors if any visits were flagged
    
    const signOffRecord = {
      id: `signoff-${Date.now()}`,
      rcfeId: signOffData.rcfeId,
      rcfeName: signOffData.rcfeName,
      socialWorkerId: signOffData.socialWorkerId,
      visitDate: new Date().toISOString().split('T')[0],
      completedVisits: signOffData.completedVisits,
      rcfeStaff: {
        name: signOffData.signOffData.rcfeStaffName,
        title: signOffData.signOffData.rcfeStaffTitle,
        signature: signOffData.signOffData.signature,
        signedAt: signOffData.signOffData.signedAt,
        geolocation: signOffData.signOffData.geolocation
      },
      submittedAt: signOffData.submittedAt,
      status: 'completed',
      flaggedVisits: signOffData.completedVisits.filter((visit: any) => visit.flagged).length
    };

    // Simulate saving to database
    console.log('💾 Sign-off record created:', signOffRecord);

    // Check for flagged visits and send notifications
    const flaggedVisits = signOffData.completedVisits.filter((visit: any) => visit.flagged);
    if (flaggedVisits.length > 0) {
      console.log('🚨 Flagged visits detected, notifying supervisors:', {
        count: flaggedVisits.length,
        visits: flaggedVisits.map((v: any) => v.memberName)
      });
      
      // Here you would send notifications to John Amber and Jason Bloome
      // about the flagged visits requiring immediate attention
    }

    return NextResponse.json({
      success: true,
      message: `Sign-off completed successfully for ${signOffData.completedVisits.length} visits`,
      signOffId: signOffRecord.id,
      flaggedVisits: flaggedVisits.length,
      locationVerified,
      data: {
        rcfeName: signOffData.rcfeName,
        totalVisits: signOffData.completedVisits.length,
        flaggedCount: flaggedVisits.length,
        staffVerification: {
          name: signOffData.signOffData.rcfeStaffName,
          title: signOffData.signOffData.rcfeStaffTitle,
          verifiedAt: signOffData.signOffData.signedAt,
          locationVerified
        }
      }
    });

  } catch (error) {
    console.error('❌ Sign-off submission error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process sign-off submission'
    }, { status: 500 });
  }
}