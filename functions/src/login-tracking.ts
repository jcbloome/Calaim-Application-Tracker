import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Login Tracking Functions

export const logUserActivity = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { 
      action, 
      ipAddress, 
      userAgent, 
      success = true, 
      failureReason,
      sessionDuration 
    } = request.data;

    if (!action) {
      throw new HttpsError('invalid-argument', 'Action is required');
    }

    const db = admin.firestore();
    
    // Get user info
    const userDoc = await db.collection('staff').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData) {
      throw new HttpsError('not-found', 'User data not found');
    }

    // Parse user agent for device info
    const deviceInfo = parseUserAgent(userAgent);
    
    // Get approximate location from IP (you could integrate with a geolocation service)
    const location = await getLocationFromIP(ipAddress);

    // Create login log entry
    const logEntry = {
      userId: request.auth.uid,
      userEmail: request.auth.token.email || userData.email,
      userName: `${userData.firstName} ${userData.lastName}`,
      userRole: userData.role || 'Staff',
      action,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress,
      userAgent,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      location,
      sessionDuration: sessionDuration || null,
      success,
      failureReason: failureReason || null
    };

    await db.collection('loginLogs').add(logEntry);

    // Update or create session info for login actions
    if (action === 'login' && success) {
      await db.collection('activeSessions').doc(request.auth.uid).set({
        userId: request.auth.uid,
        userEmail: request.auth.token.email || userData.email,
        userName: `${userData.firstName} ${userData.lastName}`,
        userRole: userData.role || 'Staff',
        loginTime: admin.firestore.FieldValue.serverTimestamp(),
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        ipAddress,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        isActive: true,
        sessionDuration: 0
      });
    }

    // Remove session for logout actions
    if (action === 'logout' || action === 'session_timeout' || action === 'forced_logout') {
      await db.collection('activeSessions').doc(request.auth.uid).delete();
    }

    console.log(`✅ Logged ${action} activity for user ${userData.firstName} ${userData.lastName}`);

    return {
      success: true,
      message: 'Activity logged successfully'
    };

  } catch (error: any) {
    console.error('❌ Error logging user activity:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const getLoginLogs = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user is Admin or Super Admin
    const db = admin.firestore();
    const userDoc = await db.collection('staff').doc(request.auth.uid).get();
    
    if (!userDoc.exists || !['Admin', 'Super Admin'].includes(userDoc.data()?.role)) {
      throw new HttpsError('permission-denied', 'Only Admins can view login logs');
    }

    const { startDate, endDate, userId, action } = request.data;

    let query = db.collection('loginLogs') as any;

    // Apply filters
    if (startDate && endDate) {
      query = query
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
    }

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (action) {
      query = query.where('action', '==', action);
    }

    // Order by timestamp descending and limit to prevent huge queries
    query = query.orderBy('timestamp', 'desc').limit(1000);

    const snapshot = await query.get();
    
    const logs = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp
      };
    });

    console.log(`✅ Retrieved ${logs.length} login logs`);

    return {
      success: true,
      logs
    };

  } catch (error: any) {
    console.error('❌ Error getting login logs:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const getActiveSessions = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user is Admin or Super Admin
    const db = admin.firestore();
    const userDoc = await db.collection('staff').doc(request.auth.uid).get();
    
    if (!userDoc.exists || !['Admin', 'Super Admin'].includes(userDoc.data()?.role)) {
      throw new HttpsError('permission-denied', 'Only Admins can view active sessions');
    }

    const snapshot = await db.collection('activeSessions').get();
    
    const sessions = await Promise.all(snapshot.docs.map(async (doc: any) => {
      const data = doc.data();
      
      // Calculate session duration
      const loginTime = data.loginTime?.toDate() || new Date();
      const now = new Date();
      const sessionDuration = Math.floor((now.getTime() - loginTime.getTime()) / (1000 * 60)); // in minutes
      
      // Update session duration in real-time
      await doc.ref.update({
        sessionDuration,
        lastActivity: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        ...data,
        sessionDuration,
        loginTime: loginTime.toISOString(),
        lastActivity: data.lastActivity?.toDate?.()?.toISOString() || new Date().toISOString()
      };
    }));

    console.log(`✅ Retrieved ${sessions.length} active sessions`);

    return {
      success: true,
      sessions
    };

  } catch (error: any) {
    console.error('❌ Error getting active sessions:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const forceUserLogout = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user is Super Admin
    const db = admin.firestore();
    const userDoc = await db.collection('staff').doc(request.auth.uid).get();
    
    if (!userDoc.exists || userDoc.data()?.role !== 'Super Admin') {
      throw new HttpsError('permission-denied', 'Only Super Admins can force logout users');
    }

    const { userId } = request.data;

    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    // Get target user info
    const targetUserDoc = await db.collection('staff').doc(userId).get();
    const targetUserData = targetUserDoc.data();
    
    if (!targetUserData) {
      throw new HttpsError('not-found', 'Target user not found');
    }

    // Get session info for duration calculation
    const sessionDoc = await db.collection('activeSessions').doc(userId).get();
    let sessionDuration = 0;
    
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      const loginTime = sessionData?.loginTime?.toDate() || new Date();
      sessionDuration = Math.floor((new Date().getTime() - loginTime.getTime()) / (1000 * 60));
    }

    // Log the forced logout
    await db.collection('loginLogs').add({
      userId,
      userEmail: targetUserData.email,
      userName: `${targetUserData.firstName} ${targetUserData.lastName}`,
      userRole: targetUserData.role || 'Staff',
      action: 'forced_logout',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionDuration,
      success: true,
      forcedBy: request.auth.uid
    });

    // Remove active session
    await db.collection('activeSessions').doc(userId).delete();

    // Revoke user's refresh tokens to force logout
    try {
      await admin.auth().revokeRefreshTokens(userId);
      console.log(`✅ Revoked refresh tokens for user ${userId}`);
    } catch (authError) {
      console.warn('⚠️ Could not revoke refresh tokens:', authError);
    }

    console.log(`✅ Forced logout for user ${targetUserData.firstName} ${targetUserData.lastName}`);

    return {
      success: true,
      message: `Successfully logged out ${targetUserData.firstName} ${targetUserData.lastName}`
    };

  } catch (error: any) {
    console.error('❌ Error forcing user logout:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const updateUserActivity = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const db = admin.firestore();
    
    // Update last activity timestamp for active session
    const sessionRef = db.collection('activeSessions').doc(request.auth.uid);
    const sessionDoc = await sessionRef.get();
    
    if (sessionDoc.exists) {
      await sessionRef.update({
        lastActivity: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return {
      success: true,
      message: 'Activity updated'
    };

  } catch (error: any) {
    console.error('❌ Error updating user activity:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Firestore trigger to clean up old login logs
export const cleanupOldLogs = onDocumentWritten('loginLogs/{logId}', async (event) => {
  try {
    const db = admin.firestore();
    
    // Delete logs older than 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const oldLogsQuery = db.collection('loginLogs')
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(cutoffDate))
      .limit(100); // Process in batches
    
    const snapshot = await oldLogsQuery.get();
    
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`🧹 Cleaned up ${snapshot.docs.length} old login logs`);
    }

  } catch (error) {
    console.error('❌ Error cleaning up old logs:', error);
  }
});

// Helper Functions

function parseUserAgent(userAgent?: string): { deviceType: string; browser: string } {
  if (!userAgent) {
    return { deviceType: 'desktop', browser: 'Unknown' };
  }

  const ua = userAgent.toLowerCase();
  
  // Detect device type
  let deviceType = 'desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'tablet';
  }

  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  } else if (ua.includes('opera')) {
    browser = 'Opera';
  }

  return { deviceType, browser };
}

async function getLocationFromIP(ipAddress?: string): Promise<string | null> {
  if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress.startsWith('192.168.')) {
    return 'Local Network';
  }

  // You could integrate with a geolocation service like:
  // - ipapi.co
  // - ipgeolocation.io
  // - MaxMind GeoIP
  
  // For now, just return a placeholder
  return 'Unknown Location';
  
  // Example integration with ipapi.co:
  /*
  try {
    const response = await fetch(`https://ipapi.co/${ipAddress}/json/`);
    const data = await response.json();
    
    if (data.city && data.region) {
      return `${data.city}, ${data.region}, ${data.country_name}`;
    }
    
    return data.country_name || 'Unknown Location';
  } catch (error) {
    console.error('Error getting location from IP:', error);
    return 'Unknown Location';
  }
  */
}