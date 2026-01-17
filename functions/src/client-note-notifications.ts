import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

interface NotificationData {
  noteId: string;
  clientId2: string;
  clientName: string;
  assignedUserId: string;
  assignedUserName: string;
  comments: string;
  followUpDate?: string;
  createdBy: string;
  createdAt: string;
}

interface StaffNotificationPreferences {
  userId: string;
  email?: string;
  enableEmailNotifications?: boolean;
  enablePushNotifications?: boolean;
  enableSystemTray?: boolean;
}

/**
 * Send notification when a new note is assigned to staff
 */
export const sendNoteNotification = onCall(
  { cors: true },
  async (request) => {
    try {
      const { noteData, notificationType = 'assignment' } = request.data as {
        noteData: NotificationData;
        notificationType?: 'assignment' | 'followup' | 'mention';
      };

      if (!noteData || !noteData.assignedUserId) {
        throw new HttpsError('invalid-argument', 'Note data and assigned user ID are required');
      }

      logger.info('📧 Sending note notification', { 
        noteId: noteData.noteId,
        assignedUserId: noteData.assignedUserId,
        type: notificationType 
      });

      const firestore = admin.firestore();
      
      // Get staff notification preferences
      const staffDoc = await firestore
        .collection('staff-preferences')
        .doc(noteData.assignedUserId)
        .get();

      const staffPrefs = staffDoc.exists ? staffDoc.data() as StaffNotificationPreferences : {
        userId: noteData.assignedUserId,
        enableEmailNotifications: true,
        enablePushNotifications: true,
        enableSystemTray: true
      };

      // Create notification record in Firestore
      const notificationRef = firestore.collection('notifications').doc();
      const notification = {
        id: notificationRef.id,
        type: 'client_note',
        subType: notificationType,
        title: getNotificationTitle(notificationType, noteData.clientName),
        message: getNotificationMessage(notificationType, noteData),
        data: {
          noteId: noteData.noteId,
          clientId2: noteData.clientId2,
          clientName: noteData.clientName,
          assignedUserId: noteData.assignedUserId,
          createdBy: noteData.createdBy
        },
        recipientUserId: noteData.assignedUserId,
        recipientUserName: noteData.assignedUserName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        dismissed: false,
        priority: notificationType === 'followup' ? 'high' : 'normal',
        expiresAt: admin.firestore.FieldValue.serverTimestamp() // Add 7 days
      };

      await notificationRef.set(notification);
      logger.info('✅ Notification saved to Firestore', { notificationId: notificationRef.id });

      // Send push notification via FCM if enabled (works even when app is closed)
      if (staffPrefs.enablePushNotifications) {
        try {
          // Get user's FCM tokens
          const userTokensDoc = await firestore
            .collection('user-fcm-tokens')
            .doc(noteData.assignedUserId)
            .get();

          if (userTokensDoc.exists) {
            const tokens = userTokensDoc.data()?.tokens || [];
            
            if (tokens.length > 0) {
              // Enhanced push notification message
              const pushMessage = {
                notification: {
                  title: notification.title,
                  body: notification.message,
                  icon: '/calaimlogopdf.png',
                  badge: '/calaimlogopdf.png'
                },
                data: {
                  type: 'client_note',
                  subType: notificationType,
                  noteId: noteData.noteId,
                  clientId2: noteData.clientId2,
                  clientName: noteData.clientName,
                  notificationId: notificationRef.id,
                  priority: notificationType === 'followup' ? 'high' : 'normal',
                  url: `/admin/client-notes?client=${noteData.clientId2}`,
                  timestamp: new Date().toISOString()
                },
                android: {
                  notification: {
                    sound: 'default',
                    priority: 'high',
                    defaultSound: true,
                    channelId: 'calaim_notes'
                  }
                },
                apns: {
                  payload: {
                    aps: {
                      sound: 'default',
                      badge: 1,
                      alert: {
                        title: notification.title,
                        body: notification.message
                      }
                    }
                  }
                },
                webpush: {
                  notification: {
                    title: notification.title,
                    body: notification.message,
                    icon: '/calaimlogopdf.png',
                    badge: '/calaimlogopdf.png',
                    tag: `note-${noteData.noteId}`,
                    requireInteraction: notificationType === 'followup',
                    silent: false,
                    vibrate: [200, 100, 200],
                    actions: [
                      {
                        action: 'view',
                        title: 'View Note'
                      },
                      {
                        action: 'dismiss',
                        title: 'Dismiss'
                      }
                    ]
                  },
                  fcmOptions: {
                    link: `/admin/client-notes?client=${noteData.clientId2}`
                  }
                },
                tokens: tokens
              };

              const response = await admin.messaging().sendEachForMulticast(pushMessage);
              logger.info('📱 Push notifications sent to all devices', { 
                successCount: response.successCount,
                failureCount: response.failureCount,
                totalTokens: tokens.length
              });

              // Clean up invalid tokens
              if (response.failureCount > 0) {
                const validTokens: string[] = [];
                response.responses.forEach((resp, index) => {
                  if (resp.success) {
                    validTokens.push(tokens[index]);
                  } else {
                    logger.warn('❌ Invalid FCM token removed', { 
                      error: resp.error?.message,
                      token: tokens[index].substring(0, 20) + '...'
                    });
                  }
                });
                
                await userTokensDoc.ref.update({ 
                  tokens: validTokens,
                  lastCleaned: admin.firestore.FieldValue.serverTimestamp()
                });
              }
            } else {
              logger.warn('⚠️ No FCM tokens found for user', { userId: noteData.assignedUserId });
            }
          } else {
            logger.warn('⚠️ No FCM token document found for user', { userId: noteData.assignedUserId });
          }
        } catch (fcmError) {
          logger.error('❌ Push notification failed', fcmError);
          // Don't throw - continue with other notification methods
        }
      }

      // Send email notification if enabled
      if (staffPrefs.enableEmailNotifications && staffPrefs.email) {
        try {
          // Call email service function
          await admin.functions().httpsCallable('sendNoteEmailNotification')({
            to: staffPrefs.email,
            staffName: noteData.assignedUserName,
            clientName: noteData.clientName,
            noteContent: noteData.comments,
            followUpDate: noteData.followUpDate,
            createdBy: noteData.createdBy,
            notificationType
          });
          
          logger.info('📧 Email notification sent', { email: staffPrefs.email });
        } catch (emailError) {
          logger.error('❌ Email notification failed', emailError);
          // Don't throw - notification was still saved to Firestore
        }
      }

      // Update user's notification count
      const userStatsRef = firestore.collection('user-stats').doc(noteData.assignedUserId);
      await userStatsRef.set({
        unreadNotifications: admin.firestore.FieldValue.increment(1),
        lastNotificationAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return {
        success: true,
        notificationId: notificationRef.id,
        message: 'Notification sent successfully'
      };

    } catch (error: any) {
      logger.error('❌ Error sending note notification:', error);
      throw new HttpsError('internal', `Failed to send notification: ${error.message}`);
    }
  }
);

/**
 * Get unread notifications for a user
 */
export const getUserNotifications = onCall(
  { cors: true },
  async (request) => {
    try {
      const { userId, limit = 50, includeRead = false } = request.data;

      if (!userId) {
        throw new HttpsError('invalid-argument', 'User ID is required');
      }

      logger.info('📬 Getting user notifications', { userId, limit, includeRead });

      const firestore = admin.firestore();
      let query = firestore
        .collection('notifications')
        .where('recipientUserId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (!includeRead) {
        query = query.where('read', '==', false);
      }

      const snapshot = await query.get();
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null
      }));

      logger.info('📬 Retrieved notifications', { count: notifications.length });

      return {
        success: true,
        notifications,
        count: notifications.length
      };

    } catch (error: any) {
      logger.error('❌ Error getting user notifications:', error);
      throw new HttpsError('internal', `Failed to get notifications: ${error.message}`);
    }
  }
);

/**
 * Mark notification as read
 */
export const markNotificationRead = onCall(
  { cors: true },
  async (request) => {
    try {
      const { notificationId, userId } = request.data;

      if (!notificationId || !userId) {
        throw new HttpsError('invalid-argument', 'Notification ID and User ID are required');
      }

      const firestore = admin.firestore();
      const notificationRef = firestore.collection('notifications').doc(notificationId);
      
      // Verify the notification belongs to the user
      const notificationDoc = await notificationRef.get();
      if (!notificationDoc.exists) {
        throw new HttpsError('not-found', 'Notification not found');
      }

      const notification = notificationDoc.data();
      if (notification?.recipientUserId !== userId) {
        throw new HttpsError('permission-denied', 'Not authorized to modify this notification');
      }

      // Mark as read
      await notificationRef.update({
        read: true,
        readAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update user's notification count
      const userStatsRef = firestore.collection('user-stats').doc(userId);
      await userStatsRef.set({
        unreadNotifications: admin.firestore.FieldValue.increment(-1)
      }, { merge: true });

      logger.info('✅ Notification marked as read', { notificationId, userId });

      return {
        success: true,
        message: 'Notification marked as read'
      };

    } catch (error: any) {
      logger.error('❌ Error marking notification as read:', error);
      throw new HttpsError('internal', `Failed to mark notification as read: ${error.message}`);
    }
  }
);

/**
 * Register FCM token for push notifications
 */
export const registerFCMToken = onCall(
  { cors: true },
  async (request) => {
    try {
      const { userId, token, deviceInfo } = request.data;

      if (!userId || !token) {
        throw new HttpsError('invalid-argument', 'User ID and FCM token are required');
      }

      const firestore = admin.firestore();
      const userTokensRef = firestore.collection('user-fcm-tokens').doc(userId);
      
      // Get existing tokens
      const userTokensDoc = await userTokensRef.get();
      const existingData = userTokensDoc.exists ? userTokensDoc.data() : { tokens: [] };
      const existingTokens = existingData.tokens || [];

      // Add new token if not already present
      if (!existingTokens.includes(token)) {
        existingTokens.push(token);
        
        await userTokensRef.set({
          tokens: existingTokens,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          deviceInfo: deviceInfo || null
        }, { merge: true });

        logger.info('📱 FCM token registered', { userId, tokenCount: existingTokens.length });
      }

      return {
        success: true,
        message: 'FCM token registered successfully'
      };

    } catch (error: any) {
      logger.error('❌ Error registering FCM token:', error);
      throw new HttpsError('internal', `Failed to register FCM token: ${error.message}`);
    }
  }
);

// Helper functions
function getNotificationTitle(type: string, clientName: string): string {
  switch (type) {
    case 'assignment':
      return `📝 New Note Assignment - ${clientName}`;
    case 'followup':
      return `⏰ Follow-up Required - ${clientName}`;
    case 'mention':
      return `💬 You were mentioned - ${clientName}`;
    default:
      return `📋 Client Note - ${clientName}`;
  }
}

function getNotificationMessage(type: string, noteData: NotificationData): string {
  const preview = noteData.comments.length > 100 
    ? noteData.comments.substring(0, 100) + '...' 
    : noteData.comments;

  switch (type) {
    case 'assignment':
      return `${noteData.createdBy} assigned you a note for ${noteData.clientName}: "${preview}"`;
    case 'followup':
      return `Follow-up required${noteData.followUpDate ? ` by ${noteData.followUpDate}` : ''}: "${preview}"`;
    case 'mention':
      return `${noteData.createdBy} mentioned you in a note for ${noteData.clientName}: "${preview}"`;
    default:
      return `New note from ${noteData.createdBy}: "${preview}"`;
  }
}