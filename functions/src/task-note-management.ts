import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

// Define secrets for email notifications (temporarily commented out for deployment)
// const emailUser = defineSecret("EMAIL_USER");
// const emailPass = defineSecret("EMAIL_PASS");

// Task Management Functions

export const createMemberTask = onCall(async (request) => {
  try {
    const { 
      memberId, 
      memberName, 
      currentStep, 
      nextStep, 
      followUpDate, 
      assignedTo, 
      priority, 
      notes 
    } = request.data;

    if (!memberId || !currentStep || !nextStep || !followUpDate || !assignedTo) {
      throw new HttpsError('invalid-argument', 'Missing required task fields');
    }

    const db = admin.firestore();
    const taskRef = db.collection('memberTasks').doc();
    
    const taskData = {
      id: taskRef.id,
      memberId,
      memberName,
      currentStep,
      nextStep,
      followUpDate: admin.firestore.Timestamp.fromDate(new Date(followUpDate)),
      assignedTo,
      priority: priority || 'Medium',
      status: 'Pending',
      notes: notes || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth?.uid || 'system'
    };

    await taskRef.set(taskData);

    console.log(`✅ Created task for member ${memberName} assigned to ${assignedTo}`);

    // Send notification to assigned staff member
    try {
      await sendTaskNotification(assignedTo, {
        type: 'task_assigned',
        memberName,
        currentStep,
        nextStep,
        followUpDate: new Date(followUpDate),
        priority
      });
    } catch (notificationError) {
      console.warn('⚠️ Failed to send task notification:', notificationError);
    }

    return {
      success: true,
      task: {
        ...taskData,
        followUpDate: followUpDate,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

  } catch (error: any) {
    console.error('❌ Error creating member task:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const getMemberTasks = onCall({
  cors: [
    /localhost/,
    /\.vercel\.app$/,
    /\.netlify\.app$/,
    /\.firebaseapp\.com$/,
    /connectcalaim\.com$/
  ]
}, async (request) => {
  try {
    const { memberId } = request.data;

    if (!memberId) {
      throw new HttpsError('invalid-argument', 'memberId is required');
    }

    const db = admin.firestore();
    const tasksSnapshot = await db.collection('memberTasks')
      .where('memberId', '==', memberId)
      .orderBy('createdAt', 'desc')
      .get();

    const tasks = tasksSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        followUpDate: data.followUpDate?.toDate?.()?.toISOString() || data.followUpDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      };
    });

    return {
      success: true,
      tasks
    };

  } catch (error: any) {
    console.error('❌ Error getting member tasks:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const updateMemberTask = onCall(async (request) => {
  try {
    const { taskId, updates } = request.data;

    if (!taskId || !updates) {
      throw new HttpsError('invalid-argument', 'taskId and updates are required');
    }

    const db = admin.firestore();
    const taskRef = db.collection('memberTasks').doc(taskId);
    
    const updateData = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth?.uid || 'system'
    };

    await taskRef.update(updateData);

    console.log(`✅ Updated task ${taskId}`);

    return {
      success: true,
      message: 'Task updated successfully'
    };

  } catch (error: any) {
    console.error('❌ Error updating member task:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const getDailyTasks = onCall(async (request) => {
  try {
    const { staffFilter, dateFilter, startDate, endDate } = request.data;

    const db = admin.firestore();
    let query = db.collection('memberTasks') as any;

    // Filter by staff if specified
    if (staffFilter && staffFilter !== 'all') {
      query = query.where('assignedTo', '==', staffFilter);
    }

    // Filter by date range
    if (startDate && endDate) {
      query = query
        .where('followUpDate', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)))
        .where('followUpDate', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
    }

    const tasksSnapshot = await query.orderBy('followUpDate', 'asc').get();

    const tasks = tasksSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      const followUpDate = data.followUpDate?.toDate() || new Date(data.followUpDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Calculate status based on date and current status
      let status = data.status;
      if (status !== 'Completed') {
        const taskDate = new Date(followUpDate);
        taskDate.setHours(0, 0, 0, 0);
        
        if (taskDate < today) {
          status = 'Overdue';
          const timeDiff = today.getTime() - taskDate.getTime();
          data.daysOverdue = Math.ceil(timeDiff / (1000 * 3600 * 24));
        } else if (taskDate.getTime() === today.getTime()) {
          status = 'In Progress';
        }
      }

      return {
        ...data,
        status,
        followUpDate: followUpDate.toISOString(),
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      };
    });

    return {
      success: true,
      tasks
    };

  } catch (error: any) {
    console.error('❌ Error getting daily tasks:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Note Management Functions

export const createMemberNote = onCall(async (request) => {
  try {
    const { 
      memberId, 
      memberName, 
      content, 
      category, 
      priority, 
      isPrivate, 
      recipientIds, 
      sendNotification,
      authorId,
      authorName
    } = request.data;

    if (!memberId || !content || !authorId || !authorName) {
      throw new HttpsError('invalid-argument', 'Missing required note fields');
    }

    const db = admin.firestore();
    const noteRef = db.collection('memberNotes').doc();
    
    // Get recipient names
    let recipientNames: string[] = [];
    if (recipientIds && recipientIds.length > 0) {
      const staffSnapshot = await db.collection('staff').where('id', 'in', recipientIds).get();
      recipientNames = staffSnapshot.docs.map(doc => doc.data().name);
    }

    // Get author role
    const authorDoc = await db.collection('staff').where('id', '==', authorId).get();
    const authorRole = authorDoc.docs[0]?.data()?.role || 'Staff';

    const noteData = {
      id: noteRef.id,
      memberId,
      memberName,
      content,
      category: category || 'General',
      priority: priority || 'Medium',
      isPrivate: isPrivate || false,
      isPinned: false,
      isArchived: false,
      authorId,
      authorName,
      authorRole,
      recipientIds: recipientIds || [],
      recipientNames,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: []
    };

    await noteRef.set(noteData);

    console.log(`✅ Created note for member ${memberName} by ${authorName}`);

    // Send notifications to recipients
    if (sendNotification && recipientIds && recipientIds.length > 0) {
      try {
        await sendNoteNotifications(recipientIds, {
          type: 'new_note',
          memberName,
          authorName,
          category,
          priority,
          content: content.substring(0, 100) + (content.length > 100 ? '...' : '')
        });
      } catch (notificationError) {
        console.warn('⚠️ Failed to send note notifications:', notificationError);
      }
    }

    return {
      success: true,
      note: {
        ...noteData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

  } catch (error: any) {
    console.error('❌ Error creating member note:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const getMemberNotes = onCall({
  cors: [
    /localhost/,
    /\.vercel\.app$/,
    /\.netlify\.app$/,
    /\.firebaseapp\.com$/,
    /connectcalaim\.com$/
  ]
}, async (request) => {
  try {
    const { memberId, includeArchived } = request.data;

    if (!memberId) {
      throw new HttpsError('invalid-argument', 'memberId is required');
    }

    const db = admin.firestore();
    let query = db.collection('memberNotes')
      .where('memberId', '==', memberId) as any;

    if (!includeArchived) {
      query = query.where('isArchived', '==', false);
    }

    const notesSnapshot = await query.orderBy('createdAt', 'desc').get();

    const notes = await Promise.all(notesSnapshot.docs.map(async (doc: any) => {
      const data = doc.data();
      
      // Get replies
      const repliesSnapshot = await db.collection('noteReplies')
        .where('noteId', '==', doc.id)
        .orderBy('createdAt', 'asc')
        .get();
      
      const replies = repliesSnapshot.docs.map((replyDoc: any) => {
        const replyData = replyDoc.data();
        return {
          ...replyData,
          createdAt: replyData.createdAt?.toDate?.()?.toISOString() || replyData.createdAt
        };
      });

      return {
        ...data,
        replies,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      };
    }));

    return {
      success: true,
      notes
    };

  } catch (error: any) {
    console.error('❌ Error getting member notes:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const createNoteReply = onCall(async (request) => {
  try {
    const { noteId, content, authorId, authorName } = request.data;

    if (!noteId || !content || !authorId || !authorName) {
      throw new HttpsError('invalid-argument', 'Missing required reply fields');
    }

    const db = admin.firestore();
    const replyRef = db.collection('noteReplies').doc();
    
    // Get author role
    const authorDoc = await db.collection('staff').where('id', '==', authorId).get();
    const authorRole = authorDoc.docs[0]?.data()?.role || 'Staff';

    const replyData = {
      id: replyRef.id,
      noteId,
      content,
      authorId,
      authorName,
      authorRole,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: []
    };

    await replyRef.set(replyData);

    // Update the parent note's updatedAt timestamp
    await db.collection('memberNotes').doc(noteId).update({
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Created reply for note ${noteId} by ${authorName}`);

    return {
      success: true,
      reply: {
        ...replyData,
        createdAt: new Date()
      }
    };

  } catch (error: any) {
    console.error('❌ Error creating note reply:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const updateMemberNote = onCall(async (request) => {
  try {
    const { noteId, updates } = request.data;

    if (!noteId || !updates) {
      throw new HttpsError('invalid-argument', 'noteId and updates are required');
    }

    const db = admin.firestore();
    const noteRef = db.collection('memberNotes').doc(noteId);
    
    const updateData = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await noteRef.update(updateData);

    console.log(`✅ Updated note ${noteId}`);

    return {
      success: true,
      message: 'Note updated successfully'
    };

  } catch (error: any) {
    console.error('❌ Error updating member note:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

export const markNotesAsRead = onCall(async (request) => {
  try {
    const { noteIds, userId, userName } = request.data;

    if (!noteIds || !userId || !userName) {
      throw new HttpsError('invalid-argument', 'noteIds, userId, and userName are required');
    }

    const db = admin.firestore();
    const batch = db.batch();
    
    const readEntry = {
      userId,
      userName,
      readAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Mark notes as read
    for (const noteId of noteIds) {
      const noteRef = db.collection('memberNotes').doc(noteId);
      batch.update(noteRef, {
        readBy: admin.firestore.FieldValue.arrayUnion(readEntry)
      });
    }

    await batch.commit();

    console.log(`✅ Marked ${noteIds.length} notes as read for ${userName}`);

    return {
      success: true,
      message: 'Notes marked as read'
    };

  } catch (error: any) {
    console.error('❌ Error marking notes as read:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Helper Functions

async function sendTaskNotification(assignedTo: string, taskInfo: any) {
  // Implementation would depend on your notification system
  // This could send email, SMS, or in-app notifications
  console.log(`📧 Sending task notification to ${assignedTo}:`, taskInfo);
  
  // Example email notification (requires nodemailer setup)
  // const nodemailer = require('nodemailer');
  // ... email sending logic
}

async function sendNoteNotifications(recipientIds: string[], noteInfo: any) {
  // Implementation would depend on your notification system
  console.log(`📧 Sending note notifications to ${recipientIds.length} recipients:`, noteInfo);
  
  // Example email notification (requires nodemailer setup)
  // ... email sending logic
}