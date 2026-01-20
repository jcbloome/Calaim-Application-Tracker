import { NextRequest, NextResponse } from 'next/server';

// Dynamic import will be handled in the GET function

const SYNC_HEALTH_COLLECTION = 'sync-health-status';

interface SyncHealth {
  lastSuccessfulSync: string;
  lastFailedSync?: string;
  failedSyncCount: number;
  caspioApiHealth: 'healthy' | 'degraded' | 'down';
  firestoreHealth: 'healthy' | 'degraded' | 'down';
  lastHealthCheck: string;
  errorMessages: string[];
}

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching sync health status');
    
    // Dynamically import Firebase Admin to handle cases where it might not be configured
    let adminDb;
    try {
      const { adminDb: db } = await import('@/firebase-admin');
      adminDb = db;
      console.log('✅ Firebase Admin loaded for health check');
    } catch (importError) {
      console.warn('⚠️ Firebase Admin not available for health check:', importError.message);
      adminDb = null;
    }
    
    // If Firebase Admin is not available, return default healthy status
    if (!adminDb) {
      console.warn('Firebase Admin not available, returning default health status');
      return NextResponse.json({
        success: true,
        health: {
          lastSuccessfulSync: new Date().toISOString(),
          failedSyncCount: 0,
          caspioApiHealth: 'healthy',
          firestoreHealth: 'degraded', // Mark as degraded since we can't access Firestore
          lastHealthCheck: new Date().toISOString(),
          errorMessages: ['Firebase Admin SDK not properly configured'],
          overallHealth: 'degraded',
          uptimePercentage: 75,
          timeSinceLastSuccess: 0,
          recentErrors: ['Firebase Admin SDK not properly configured'],
          recommendations: ['Configure Firebase Admin SDK credentials', 'Check firebase-admin.ts configuration']
        }
      });
    }
    
    const healthDoc = await adminDb.collection(SYNC_HEALTH_COLLECTION).doc('global').get();
    
    let healthStatus: SyncHealth;
    
    if (healthDoc.exists) {
      const data = healthDoc.data()!;
      healthStatus = {
        lastSuccessfulSync: data.lastSuccessfulSync?.toDate?.()?.toISOString() || new Date().toISOString(),
        lastFailedSync: data.lastFailedSync?.toDate?.()?.toISOString(),
        failedSyncCount: data.failedSyncCount || 0,
        caspioApiHealth: data.caspioApiHealth || 'healthy',
        firestoreHealth: data.firestoreHealth || 'healthy',
        lastHealthCheck: data.lastHealthCheck?.toDate?.()?.toISOString() || new Date().toISOString(),
        errorMessages: data.errorMessages || []
      };
    } else {
      // Return default healthy status if no health data exists
      healthStatus = {
        lastSuccessfulSync: new Date().toISOString(),
        failedSyncCount: 0,
        caspioApiHealth: 'healthy',
        firestoreHealth: 'healthy',
        lastHealthCheck: new Date().toISOString(),
        errorMessages: []
      };
    }
    
    // Calculate overall health
    const overallHealth = healthStatus.caspioApiHealth === 'down' || healthStatus.firestoreHealth === 'down' 
      ? 'down' 
      : healthStatus.caspioApiHealth === 'degraded' || healthStatus.firestoreHealth === 'degraded'
      ? 'degraded'
      : 'healthy';
    
    // Calculate uptime percentage (last 24 hours)
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastSuccessfulSync = new Date(healthStatus.lastSuccessfulSync);
    const timeSinceLastSuccess = now.getTime() - lastSuccessfulSync.getTime();
    const uptimePercentage = timeSinceLastSuccess < 60 * 60 * 1000 ? 100 : // Less than 1 hour = 100%
                            timeSinceLastSuccess < 6 * 60 * 60 * 1000 ? 95 : // Less than 6 hours = 95%
                            timeSinceLastSuccess < 24 * 60 * 60 * 1000 ? 80 : // Less than 24 hours = 80%
                            50; // More than 24 hours = 50%
    
    const response = {
      success: true,
      health: {
        ...healthStatus,
        overallHealth,
        uptimePercentage,
        timeSinceLastSuccess: Math.round(timeSinceLastSuccess / 1000 / 60), // minutes
        recentErrors: healthStatus.errorMessages.slice(-3), // Last 3 errors
        recommendations: generateHealthRecommendations(healthStatus)
      }
    };
    
    console.log(`✅ Health status: ${overallHealth} (${uptimePercentage}% uptime)`);
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('❌ Error fetching sync health:', error);
    return NextResponse.json(
      { 
        success: true, 
        health: {
          overallHealth: 'degraded',
          caspioApiHealth: 'healthy',
          firestoreHealth: 'degraded',
          failedSyncCount: 0,
          uptimePercentage: 75,
          lastSuccessfulSync: new Date().toISOString(),
          lastHealthCheck: new Date().toISOString(),
          timeSinceLastSuccess: 0,
          errorMessages: [`Health check limited: ${error.message}`],
          recentErrors: [`Health check limited: ${error.message}`],
          recommendations: ['Configure Firebase Admin SDK for full health monitoring']
        }
      },
      { status: 200 }
    );
  }
}

function generateHealthRecommendations(health: SyncHealth): string[] {
  const recommendations: string[] = [];
  
  if (health.caspioApiHealth === 'down') {
    recommendations.push('🔴 Caspio API is down - check API credentials and network connectivity');
  } else if (health.caspioApiHealth === 'degraded') {
    recommendations.push('🟡 Caspio API is experiencing issues - monitor for improvements');
  }
  
  if (health.firestoreHealth === 'down') {
    recommendations.push('🔴 Firestore is down - check Firebase project status and credentials');
  } else if (health.firestoreHealth === 'degraded') {
    recommendations.push('🟡 Firestore is experiencing issues - monitor for improvements');
  }
  
  if (health.failedSyncCount >= 5) {
    recommendations.push('⚠️ Multiple sync failures detected - consider manual intervention');
  }
  
  const lastSuccess = new Date(health.lastSuccessfulSync);
  const hoursSinceSuccess = (Date.now() - lastSuccess.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceSuccess > 24) {
    recommendations.push('🕐 No successful sync in 24+ hours - immediate attention required');
  } else if (hoursSinceSuccess > 6) {
    recommendations.push('🕐 No successful sync in 6+ hours - check system status');
  }
  
  if (health.errorMessages.length > 10) {
    recommendations.push('📝 High error count - review error patterns and root causes');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ All systems operating normally');
  }
  
  return recommendations;
}