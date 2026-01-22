import { NextRequest, NextResponse } from 'next/server';

interface LoginEvent {
  socialWorkerId: string;
  socialWorkerName: string;
  loginTime: string;
  userAgent: string;
  ipAddress: string;
  sessionId: string;
  portalSection: 'login' | 'portal-home' | 'visit-verification' | 'assignments';
}

// In-memory storage for demo purposes
// In production, this would be stored in Firestore or another database
let loginEvents: LoginEvent[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📝 Login tracking request body:', body);
    
    const { socialWorkerId, socialWorkerName, portalSection } = body;

    if (!socialWorkerId || !socialWorkerName) {
      return NextResponse.json(
        { error: 'Missing required fields: socialWorkerId, socialWorkerName' },
        { status: 400 }
      );
    }

    // Extract request metadata
    const userAgent = request.headers.get('user-agent') || 'Unknown';
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 
                      request.headers.get('x-real-ip') || 
                      'localhost';

    // Create login event
    const loginEvent: LoginEvent = {
      socialWorkerId,
      socialWorkerName,
      loginTime: new Date().toISOString(),
      userAgent,
      ipAddress,
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      portalSection: portalSection || 'portal-home'
    };

    // Store the event
    loginEvents.push(loginEvent);

    // Keep only last 1000 events to prevent memory issues
    if (loginEvents.length > 1000) {
      loginEvents = loginEvents.slice(-1000);
    }

    console.log('🔐 SW Portal Access Logged:', {
      socialWorker: socialWorkerName,
      section: portalSection,
      time: loginEvent.loginTime,
      ip: ipAddress
    });

    return NextResponse.json({
      success: true,
      message: 'Login event logged successfully',
      sessionId: loginEvent.sessionId,
      timestamp: loginEvent.loginTime
    });

  } catch (error) {
    console.error('❌ Error logging SW portal access:', error);
    return NextResponse.json(
      { error: 'Failed to log portal access' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const socialWorkerId = searchParams.get('socialWorkerId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const days = parseInt(searchParams.get('days') || '30');

    // Filter events by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let filteredEvents = loginEvents.filter(event => 
      new Date(event.loginTime) >= cutoffDate
    );

    // Filter by social worker if specified
    if (socialWorkerId) {
      filteredEvents = filteredEvents.filter(event => 
        event.socialWorkerId === socialWorkerId
      );
    }

    // Sort by most recent first and limit results
    const sortedEvents = filteredEvents
      .sort((a, b) => new Date(b.loginTime).getTime() - new Date(a.loginTime).getTime())
      .slice(0, limit);

    // Generate analytics
    const analytics = {
      totalLogins: filteredEvents.length,
      uniqueSocialWorkers: [...new Set(filteredEvents.map(e => e.socialWorkerId))].length,
      loginsBySection: filteredEvents.reduce((acc, event) => {
        acc[event.portalSection] = (acc[event.portalSection] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      loginsByDay: filteredEvents.reduce((acc, event) => {
        const day = new Date(event.loginTime).toISOString().split('T')[0];
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      mostActiveWorkers: Object.entries(
        filteredEvents.reduce((acc, event) => {
          acc[event.socialWorkerName] = (acc[event.socialWorkerName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      )
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, loginCount: count }))
    };

    return NextResponse.json({
      success: true,
      events: sortedEvents,
      analytics,
      totalEvents: loginEvents.length,
      filteredCount: filteredEvents.length
    });

  } catch (error) {
    console.error('❌ Error fetching SW login events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch login events' },
      { status: 500 }
    );
  }
}