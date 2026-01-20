import { NextRequest, NextResponse } from 'next/server';

// Try to import Firebase Admin, but handle gracefully if not available
let adminDb: any = null;
let Timestamp: any = null;
let FieldValue: any = null;

try {
  const firebaseAdmin = require('@/firebase-admin');
  adminDb = firebaseAdmin.adminDb;
  const { Timestamp: FirestoreTimestamp, FieldValue: FirestoreFieldValue } = require('firebase-admin/firestore');
  Timestamp = FirestoreTimestamp;
  FieldValue = FirestoreFieldValue;
  console.log('✅ Firebase Admin SDK loaded successfully');
} catch (error) {
  console.warn('⚠️ Firebase Admin SDK not available, using cache-only mode:', error.message);
}

interface CaspioNote {
  PK_ID: number;
  Client_ID2: number;
  Comments: string;
  User_ID: number;
  Time_Stamp: string;
  Follow_Up_Date?: string;
  Note_Status?: string;
  Follow_Up_Status?: string;
  User_Full_Name?: string;
  Senior_Full_Name?: string;
  Follow_Up_Assignment?: string;
  Assigned_First?: string;
}

interface CaspioILSNote {
  table_ID: number;
  User_ID: number;
  User_First: string;
  User_Last: string;
  Note_ID: number;
  Senior_First: string;
  Senior_Last: string;
  Note: string;
  Timestamp: string;
  Client_ID2: number;
  Senior__Last_First_ID2: string;
  User_First_Last: string;
  User_Role: string;
  Senior_First_Last: string;
}

interface MemberNote {
  id: string;
  clientId2: string;
  memberName: string;
  noteText: string;
  noteType: 'General' | 'Medical' | 'Social' | 'Administrative' | 'Follow-up' | 'Emergency';
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  source: 'Caspio' | 'ILS' | 'App' | 'Admin';
  isRead: boolean;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  followUpDate?: string;
  tags?: string[];
  isLegacy?: boolean; // Tag for notes imported from Caspio
  syncedAt?: string; // When this note was synced from Caspio
  isILSNote?: boolean; // Tag for ILS-specific notes
}

// Caspio configuration - hardcoded for development
const CASPIO_BASE_URL = 'https://c7ebl500.caspio.com';
const CASPIO_CLIENT_ID = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
const CASPIO_CLIENT_SECRET = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';

// Global note search function
async function handleGlobalNoteSearch(searchQuery: string) {
  try {
    if (searchQuery.length < SEARCH_MIN_LENGTH) {
      return NextResponse.json({
        success: false,
        error: `Search query must be at least ${SEARCH_MIN_LENGTH} characters long`
      }, { status: 400 });
    }

    console.log(`🔍 Performing global note search for: "${searchQuery}"`);

    const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.length >= SEARCH_MIN_LENGTH);
    
    if (!adminDb) {
      console.log(`⚠️ Firestore not available, searching in cache only`);
      // Search in cache across all members
      const allCachedNotes: MemberNote[] = [];
      Object.values(memberNotesCache).forEach(memberNotes => {
        allCachedNotes.push(...memberNotes);
      });
      
      const matchingNotes = allCachedNotes.filter(note => {
        const searchableText = [
          note.noteText,
          note.memberName,
          note.createdByName,
          note.assignedToName,
          note.noteType,
          note.tags?.join(' ')
        ].join(' ').toLowerCase();

        return searchTerms.some(term => searchableText.includes(term));
      });

      return NextResponse.json({
        success: true,
        query: searchQuery,
        totalResults: matchingNotes.length,
        memberCount: new Set(matchingNotes.map(n => n.clientId2)).size,
        results: matchingNotes.slice(0, SEARCH_RESULTS_LIMIT),
        searchTerms,
        note: 'Search performed on cached data only (Firestore not available)'
      });
    }
    
    // Search in note text, member names, and created by names
    const notesSnapshot = await adminDb
      .collection(MEMBER_NOTES_COLLECTION)
      .limit(SEARCH_RESULTS_LIMIT)
      .get();

    const allNotes: MemberNote[] = notesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        followUpDate: data.followUpDate?.toDate?.()?.toISOString() || data.followUpDate,
        syncedAt: data.syncedAt?.toDate?.()?.toISOString() || data.syncedAt
      } as MemberNote;
    });

    // Client-side filtering for full-text search
    const matchingNotes = allNotes.filter(note => {
      const searchableText = [
        note.noteText,
        note.memberName,
        note.createdByName,
        note.assignedToName,
        note.noteType,
        note.tags?.join(' ')
      ].join(' ').toLowerCase();

      return searchTerms.some(term => searchableText.includes(term));
    });

    // Sort by relevance (exact matches first, then partial matches)
    const sortedNotes = matchingNotes.sort((a, b) => {
      const aText = a.noteText.toLowerCase();
      const bText = b.noteText.toLowerCase();
      const queryLower = searchQuery.toLowerCase();
      
      const aExactMatch = aText.includes(queryLower);
      const bExactMatch = bText.includes(queryLower);
      
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;
      
      // Sort by creation date if relevance is equal
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Group results by member
    const resultsByMember = sortedNotes.reduce((acc, note) => {
      if (!acc[note.clientId2]) {
        acc[note.clientId2] = {
          clientId2: note.clientId2,
          memberName: note.memberName,
          notes: []
        };
      }
      acc[note.clientId2].notes.push(note);
      return acc;
    }, {} as Record<string, { clientId2: string; memberName: string; notes: MemberNote[] }>);

    console.log(`✅ Found ${sortedNotes.length} matching notes across ${Object.keys(resultsByMember).length} members`);

    return NextResponse.json({
      success: true,
      query: searchQuery,
      totalResults: sortedNotes.length,
      memberCount: Object.keys(resultsByMember).length,
      results: Object.values(resultsByMember),
      searchTerms
    });

  } catch (error: any) {
    console.error('❌ Error performing global note search:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to search notes' },
      { status: 500 }
    );
  }
}

// Firestore helper functions
async function getNotesFromFirestore(clientId2: string): Promise<MemberNote[]> {
  try {
    if (!adminDb) {
      console.log(`⚠️ Firestore not available, using cache for Client_ID2: ${clientId2}`);
      return memberNotesCache[clientId2] || [];
    }
    
    console.log(`🔍 Fetching notes from Firestore for Client_ID2: ${clientId2}`);
    
    const notesSnapshot = await adminDb
      .collection(MEMBER_NOTES_COLLECTION)
      .where('clientId2', '==', clientId2)
      .orderBy('createdAt', 'desc')
      .get();

    const notes: MemberNote[] = notesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        followUpDate: data.followUpDate?.toDate?.()?.toISOString() || data.followUpDate,
        syncedAt: data.syncedAt?.toDate?.()?.toISOString() || data.syncedAt
      } as MemberNote;
    });

    console.log(`✅ Retrieved ${notes.length} notes from Firestore for Client_ID2: ${clientId2}`);
    
    // Update cache
    memberNotesCache[clientId2] = notes;
    
    return notes;
  } catch (error) {
    console.error('❌ Error fetching notes from Firestore, falling back to cache:', error);
    return memberNotesCache[clientId2] || [];
  }
}

async function getSyncStatusFromFirestore(clientId2: string): Promise<any> {
  try {
    if (!adminDb) {
      console.log(`⚠️ Firestore not available, using cache for sync status: ${clientId2}`);
      return syncStatusCache[clientId2] || null;
    }
    
    const syncDoc = await adminDb
      .collection(SYNC_STATUS_COLLECTION)
      .doc(clientId2)
      .get();

    if (syncDoc.exists) {
      const data = syncDoc.data();
      const syncStatus = {
        ...data,
        lastSyncAt: data?.lastSyncAt?.toDate?.()?.toISOString() || data?.lastSyncAt,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt
      };
      
      // Update cache
      syncStatusCache[clientId2] = syncStatus;
      return syncStatus;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching sync status from Firestore, falling back to cache:', error);
    return syncStatusCache[clientId2] || null;
  }
}

async function saveNotesToFirestore(notes: MemberNote[]): Promise<void> {
  try {
    if (notes.length === 0) return;
    
    if (!adminDb || !Timestamp) {
      console.log(`⚠️ Firestore not available, notes saved to cache only (${notes.length} notes)`);
      return;
    }
    
    console.log(`💾 Saving ${notes.length} notes to Firestore`);
    
    const batch = adminDb.batch();
    
    notes.forEach(note => {
      const noteRef = adminDb.collection(MEMBER_NOTES_COLLECTION).doc(note.id);
      const noteData = {
        ...note,
        createdAt: note.createdAt ? Timestamp.fromDate(new Date(note.createdAt)) : Timestamp.now(),
        updatedAt: note.updatedAt ? Timestamp.fromDate(new Date(note.updatedAt)) : Timestamp.now(),
        followUpDate: note.followUpDate ? Timestamp.fromDate(new Date(note.followUpDate)) : null,
        syncedAt: note.syncedAt ? Timestamp.fromDate(new Date(note.syncedAt)) : Timestamp.now()
      };
      
      batch.set(noteRef, noteData, { merge: true });
    });
    
    await batch.commit();
    console.log(`✅ Successfully saved ${notes.length} notes to Firestore`);
    
  } catch (error) {
    console.error('❌ Error saving notes to Firestore:', error);
    // Don't throw - notes are still in cache
  }
}

async function saveSyncStatusToFirestore(clientId2: string, syncStatus: any): Promise<void> {
  try {
    if (!adminDb || !Timestamp) {
      console.log(`⚠️ Firestore not available, sync status saved to cache only for Client_ID2: ${clientId2}`);
      return;
    }
    
    console.log(`💾 Saving sync status to Firestore for Client_ID2: ${clientId2}`);
    
    const syncData = {
      ...syncStatus,
      lastSyncAt: syncStatus.lastSyncAt ? Timestamp.fromDate(new Date(syncStatus.lastSyncAt)) : null,
      updatedAt: Timestamp.now()
    };
    
    await adminDb
      .collection(SYNC_STATUS_COLLECTION)
      .doc(clientId2)
      .set(syncData, { merge: true });
      
    console.log(`✅ Sync status saved to Firestore for Client_ID2: ${clientId2}`);
    
    // Update health status on successful sync
    await updateSyncHealth('success', clientId2);
    
  } catch (error) {
    console.error('❌ Error saving sync status to Firestore:', error);
    await updateSyncHealth('firestore_error', clientId2, error.message);
    // Don't throw - status is still in cache
  }
}

// Health monitoring functions
async function updateSyncHealth(
  status: 'success' | 'caspio_error' | 'firestore_error' | 'general_error',
  clientId2?: string,
  errorMessage?: string
): Promise<void> {
  try {
    if (!adminDb || !Timestamp) {
      console.log(`⚠️ Firestore not available, health status not updated: ${status}`);
      return;
    }
    
    const healthDoc = adminDb.collection(SYNC_HEALTH_COLLECTION).doc('global');
    const currentHealth = await getSyncHealth();
    
    const now = new Date().toISOString();
    let updatedHealth: SyncHealth;
    
    if (status === 'success') {
      updatedHealth = {
        ...currentHealth,
        lastSuccessfulSync: now,
        failedSyncCount: 0,
        caspioApiHealth: 'healthy',
        firestoreHealth: 'healthy',
        lastHealthCheck: now,
        errorMessages: [] // Clear errors on success
      };
    } else {
      const newFailedCount = currentHealth.failedSyncCount + 1;
      updatedHealth = {
        ...currentHealth,
        lastFailedSync: now,
        failedSyncCount: newFailedCount,
        lastHealthCheck: now,
        errorMessages: [
          ...currentHealth.errorMessages.slice(-4), // Keep last 5 errors
          `${now}: ${errorMessage || 'Unknown error'} (Client: ${clientId2 || 'N/A'})`
        ]
      };
      
      // Update specific service health
      if (status === 'caspio_error') {
        updatedHealth.caspioApiHealth = newFailedCount >= MAX_FAILED_SYNCS ? 'down' : 'degraded';
      } else if (status === 'firestore_error') {
        updatedHealth.firestoreHealth = newFailedCount >= MAX_FAILED_SYNCS ? 'down' : 'degraded';
      }
    }
    
    await healthDoc.set({
      ...updatedHealth,
      lastSuccessfulSync: Timestamp.fromDate(new Date(updatedHealth.lastSuccessfulSync)),
      lastFailedSync: updatedHealth.lastFailedSync ? Timestamp.fromDate(new Date(updatedHealth.lastFailedSync)) : null,
      lastHealthCheck: Timestamp.fromDate(new Date(updatedHealth.lastHealthCheck))
    }, { merge: true });
    
  } catch (error) {
    console.error('❌ Error updating sync health:', error);
    // Don't throw - this is monitoring only
  }
}

async function getSyncHealth(): Promise<SyncHealth> {
  try {
    if (!adminDb) {
      console.log(`⚠️ Firestore not available, returning default health status`);
      return {
        lastSuccessfulSync: new Date().toISOString(),
        failedSyncCount: 0,
        caspioApiHealth: 'healthy',
        firestoreHealth: 'degraded',
        lastHealthCheck: new Date().toISOString(),
        errorMessages: ['Firebase Admin SDK not available']
      };
    }
    
    const healthDoc = await adminDb.collection(SYNC_HEALTH_COLLECTION).doc('global').get();
    
    if (healthDoc.exists) {
      const data = healthDoc.data()!;
      return {
        lastSuccessfulSync: data.lastSuccessfulSync?.toDate?.()?.toISOString() || new Date().toISOString(),
        lastFailedSync: data.lastFailedSync?.toDate?.()?.toISOString(),
        failedSyncCount: data.failedSyncCount || 0,
        caspioApiHealth: data.caspioApiHealth || 'healthy',
        firestoreHealth: data.firestoreHealth || 'healthy',
        lastHealthCheck: data.lastHealthCheck?.toDate?.()?.toISOString() || new Date().toISOString(),
        errorMessages: data.errorMessages || []
      };
    }
    
    // Return default healthy status
    return {
      lastSuccessfulSync: new Date().toISOString(),
      failedSyncCount: 0,
      caspioApiHealth: 'healthy',
      firestoreHealth: 'healthy',
      lastHealthCheck: new Date().toISOString(),
      errorMessages: []
    };
    
  } catch (error) {
    console.error('❌ Error getting sync health:', error);
    return {
      lastSuccessfulSync: new Date().toISOString(),
      failedSyncCount: 0,
      caspioApiHealth: 'degraded',
      firestoreHealth: 'degraded',
      lastHealthCheck: new Date().toISOString(),
      errorMessages: [`Failed to retrieve health status: ${error.message}`]
    };
  }
}

// Smart retry logic
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempting ${operationName} (attempt ${attempt}/${maxRetries})`);
      const result = await operation();
      
      if (attempt > 1) {
        console.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ ${operationName} failed on attempt ${attempt}:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`💥 ${operationName} failed after ${maxRetries} attempts`);
        break;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Get Caspio access token
async function getCaspioToken() {
  const tokenUrl = `${CASPIO_BASE_URL}/oauth/token`;
  const credentials = Buffer.from(`${CASPIO_CLIENT_ID}:${CASPIO_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get Caspio token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Temporary in-memory storage as fallback
let memberNotesCache: { [clientId2: string]: MemberNote[] } = {};
let syncStatusCache: { [clientId2: string]: any } = {};

// Firestore collection names
const MEMBER_NOTES_COLLECTION = 'member-notes';
const SYNC_STATUS_COLLECTION = 'member-notes-sync-status';

// Search configuration
const SEARCH_RESULTS_LIMIT = 50;
const SEARCH_MIN_LENGTH = 2;

// Health monitoring configuration
const SYNC_HEALTH_COLLECTION = 'sync-health-status';
const MAX_FAILED_SYNCS = 3;
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface SyncHealth {
  lastSuccessfulSync: string;
  lastFailedSync?: string;
  failedSyncCount: number;
  caspioApiHealth: 'healthy' | 'degraded' | 'down';
  firestoreHealth: 'healthy' | 'degraded' | 'down';
  lastHealthCheck: string;
  errorMessages: string[];
}

// Data validation functions
function isValidDate(dateString: any): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

function sanitizeText(text: any): string {
  if (typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ').substring(0, 10000); // Limit length
}

function validateAndCleanNote(rawNote: any): MemberNote {
  const now = new Date().toISOString();
  
  return {
    id: rawNote.id || `generated_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    clientId2: String(rawNote.clientId2 || rawNote.Client_ID2 || '').trim(),
    memberName: sanitizeText(rawNote.memberName || rawNote.Senior_Full_Name || rawNote.Senior_First_Last) || 'Unknown Member',
    noteText: sanitizeText(rawNote.noteText || rawNote.Comments || rawNote.Note) || '',
    noteType: validateNoteType(rawNote.noteType || rawNote.Note_Status),
    createdBy: String(rawNote.createdBy || rawNote.User_ID || 'unknown').trim(),
    createdByName: sanitizeText(rawNote.createdByName || rawNote.User_Full_Name || rawNote.User_First_Last) || 'Unknown User',
    assignedTo: rawNote.assignedTo ? String(rawNote.assignedTo).trim() : undefined,
    assignedToName: rawNote.assignedToName ? sanitizeText(rawNote.assignedToName) : undefined,
    createdAt: isValidDate(rawNote.createdAt || rawNote.Time_Stamp || rawNote.Timestamp) 
      ? new Date(rawNote.createdAt || rawNote.Time_Stamp || rawNote.Timestamp).toISOString() 
      : now,
    updatedAt: isValidDate(rawNote.updatedAt) ? new Date(rawNote.updatedAt).toISOString() : now,
    source: validateSource(rawNote.source),
    isRead: Boolean(rawNote.isRead),
    priority: validatePriority(rawNote.priority || rawNote.Follow_Up_Status),
    followUpDate: isValidDate(rawNote.followUpDate || rawNote.Follow_Up_Date) 
      ? new Date(rawNote.followUpDate || rawNote.Follow_Up_Date).toISOString() 
      : undefined,
    tags: Array.isArray(rawNote.tags) ? rawNote.tags.filter(tag => typeof tag === 'string') : [],
    isLegacy: Boolean(rawNote.isLegacy),
    syncedAt: isValidDate(rawNote.syncedAt) ? new Date(rawNote.syncedAt).toISOString() : now,
    isILSNote: Boolean(rawNote.isILSNote)
  };
}

function validateNoteType(type: any): MemberNote['noteType'] {
  const validTypes: MemberNote['noteType'][] = ['General', 'Medical', 'Social', 'Administrative', 'Follow-up', 'Emergency'];
  return validTypes.includes(type) ? type : 'General';
}

function validateSource(source: any): MemberNote['source'] {
  const validSources: MemberNote['source'][] = ['Caspio', 'ILS', 'App', 'Admin'];
  return validSources.includes(source) ? source : 'App';
}

function validatePriority(priority: any): MemberNote['priority'] {
  const validPriorities: MemberNote['priority'][] = ['Low', 'Medium', 'High', 'Urgent'];
  
  if (validPriorities.includes(priority)) return priority;
  
  // Handle Caspio priority formats
  if (typeof priority === 'string') {
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes('urgent') || priorityLower.includes('🔴')) return 'Urgent';
    if (priorityLower.includes('high')) return 'High';
    if (priorityLower.includes('medium') || priorityLower.includes('🟡')) return 'Medium';
    if (priorityLower.includes('low') || priorityLower.includes('🟢')) return 'Low';
  }
  
  return 'Medium'; // Default
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId2 = searchParams.get('clientId2');
    const forceSync = searchParams.get('forceSync') === 'true';
    const searchQuery = searchParams.get('search');

    // Handle full-text search across all notes
    if (searchQuery && !clientId2) {
      return await handleGlobalNoteSearch(searchQuery);
    }

    if (!clientId2) {
      return NextResponse.json(
        { success: false, error: 'Client ID is required for member-specific notes' },
        { status: 400 }
      );
    }

    console.log(`📥 Fetching notes for member: ${clientId2} (forceSync: ${forceSync})`);

    // Get sync status from Firestore (with cache fallback)
    const syncStatus = await getSyncStatusFromFirestore(clientId2);

    const isFirstSync = !syncStatus || !syncStatus.lastSyncAt;
    let newNotesCount = 0;

    if (forceSync) {
      if (isFirstSync) {
        console.log(`🆕 First time sync for member ${clientId2} - importing all legacy notes`);
        newNotesCount = await syncAllNotesFromCaspio(clientId2);
      } else {
        console.log(`🔄 Incremental sync for member ${clientId2} - checking for new notes`);
        newNotesCount = await syncNewNotesFromCaspio(clientId2, syncStatus.lastSyncAt);
      }
    }

    // Get notes from Firestore (with cache fallback)
    const notes = await getNotesFromFirestore(clientId2);
    
    // Sort notes by creation date (newest first)
    notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    console.log(`📋 Returning ${notes.length} notes for member ${clientId2}`);

    return NextResponse.json({
      success: true,
      notes,
      isFirstSync,
      newNotesCount,
      totalNotes: notes.length,
      legacyNotes: notes.filter(n => n.isLegacy).length,
      regularNotes: notes.filter(n => n.source === 'Caspio').length,
      ilsNotes: notes.filter(n => n.source === 'ILS').length,
      appNotes: notes.filter(n => n.source === 'App' || n.source === 'Admin').length
    });

  } catch (error: any) {
    console.error('Error fetching member notes:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch member notes' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      clientId2, 
      noteText, 
      noteType, 
      priority, 
      assignedTo, 
      assignedToName, 
      followUpDate, 
      createdBy, 
      createdByName,
      recipientIds,
      sendNotification,
      authorId,
      authorName,
      memberName,
      category
    } = body;

    if (!clientId2 || !noteText || !authorId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`📝 Creating new note for Client_ID2: ${clientId2}`);

    const timestamp = new Date().toISOString();
    const newNote: MemberNote = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      clientId2,
      memberName: memberName || 'Unknown Member',
      noteText,
      noteType: category || noteType || 'General',
      createdBy: authorId || createdBy,
      createdByName: authorName || createdByName || 'Unknown User',
      assignedTo,
      assignedToName: assignedToName || (assignedTo ? getStaffDisplayName(assignedTo) : undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'App',
      isRead: !assignedTo && (!recipientIds || recipientIds.length === 0), // Unread if assigned to someone else
      priority: priority || 'Medium',
      followUpDate,
      tags: body.tags || []
    };

    // Add to cache
    if (!memberNotesCache[clientId2]) {
      memberNotesCache[clientId2] = [];
    }
    memberNotesCache[clientId2].unshift(newNote);

    // Save to Firestore for persistence
    await saveNotesToFirestore([newNote]);

    // Sync to Caspio
    await syncNoteToCaspio(newNote);

    // Send notifications
    if (sendNotification && recipientIds && recipientIds.length > 0) {
      for (const recipientId of recipientIds) {
        const noteForRecipient = {
          ...newNote,
          assignedTo: recipientId,
          assignedToName: `Staff Member ${recipientId}`
        };
        await sendNoteNotification(noteForRecipient);
      }
    }

    if (assignedTo && assignedToName) {
      await sendNoteNotification(newNote);
    }

    return NextResponse.json({
      success: true,
      note: newNote,
      message: 'Note created successfully'
    });

  } catch (error: any) {
    console.error('Error creating member note:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create note' },
      { status: 500 }
    );
  }
}

// Sync ALL notes from both Caspio tables for a member (first time sync)
async function syncAllNotesFromCaspio(clientId2: string): Promise<number> {
  return await withRetry(async () => {
    console.log(`🔄 First-time sync: importing all legacy notes for Client_ID2: ${clientId2}`);
    
    const token = await getCaspioToken();
    
    // Fetch from regular notes table
    const regularNotesUrl = `${CASPIO_BASE_URL}/rest/v2/tables/connect_tbl_clientnotes/records?q.where=Client_ID2='${clientId2}'&q.orderBy=Time_Stamp DESC&q.limit=1000`;
    
    // Fetch from ILS notes table
    const ilsNotesUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_Member_Notes_ILS/records?q.where=Client_ID2='${clientId2}'&q.orderBy=Timestamp DESC&q.limit=1000`;
    
    const [regularResponse, ilsResponse] = await Promise.all([
      fetch(regularNotesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }),
      fetch(ilsNotesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
    ]);

    if (!regularResponse.ok) {
      throw new Error(`Caspio API error (regular notes): ${regularResponse.status} ${regularResponse.statusText}`);
    }
    if (!ilsResponse.ok) {
      throw new Error(`Caspio API error (ILS notes): ${ilsResponse.status} ${ilsResponse.statusText}`);
    }

    const regularData = await regularResponse.json();
    const ilsData = await ilsResponse.json();
    
    const caspioNotes: CaspioNote[] = regularData.Result || [];
    const ilsNotes: CaspioILSNote[] = ilsData.Result || [];
    
    console.log(`📥 Retrieved ${caspioNotes.length} regular notes + ${ilsNotes.length} ILS notes for Client_ID2: ${clientId2}`);

    const syncTime = new Date().toISOString();
    let importedCount = 0;

    // Transform regular Caspio notes with validation
    const transformedRegularNotes: MemberNote[] = caspioNotes.map(caspioNote => 
      validateAndCleanNote({
        ...caspioNote,
        id: `caspio_${caspioNote.PK_ID}`,
        source: 'Caspio',
        isRead: true, // Legacy notes are considered read
        isLegacy: true,
        syncedAt: syncTime,
        isILSNote: false
      })
    );

    // Transform ILS notes with validation
    const transformedILSNotes: MemberNote[] = ilsNotes.map(ilsNote => 
      validateAndCleanNote({
        ...ilsNote,
        id: `ils_${ilsNote.table_ID}`,
        noteType: 'Administrative', // ILS notes are administrative
        source: 'ILS',
        isRead: true, // Legacy notes are considered read
        priority: 'Medium',
        tags: ['ILS', 'JHernandez@ilshealth.com'],
        isLegacy: true,
        syncedAt: syncTime,
        isILSNote: true
      })
    );

    // Combine all notes and sort by timestamp
    const allTransformedNotes = [...transformedRegularNotes, ...transformedILSNotes];
    allTransformedNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Store in cache and Firestore
    memberNotesCache[clientId2] = allTransformedNotes;
    importedCount = allTransformedNotes.length;

    // Save notes to Firestore
    await saveNotesToFirestore(allTransformedNotes);

    // Update sync status
    const syncStatus = {
      clientId2,
      lastSyncAt: syncTime,
      totalLegacyNotes: importedCount,
      regularNotes: transformedRegularNotes.length,
      ilsNotes: transformedILSNotes.length,
      firstSyncCompleted: true,
      updatedAt: syncTime
    };
    
    syncStatusCache[clientId2] = syncStatus;
    await saveSyncStatusToFirestore(clientId2, syncStatus);

    console.log(`✅ Imported ${importedCount} total notes (${transformedRegularNotes.length} regular + ${transformedILSNotes.length} ILS) for Client_ID2: ${clientId2}`);
    return importedCount;

  }, 3, 2000, `sync all notes for ${clientId2}`).catch(error => {
    console.error('❌ Error importing legacy notes from Caspio after retries:', error);
    updateSyncHealth('caspio_error', clientId2, error.message);
    throw error;
  });
}

// Sync only NEW notes since last sync from both tables (incremental sync)
async function syncNewNotesFromCaspio(clientId2: string, lastSyncAt: string): Promise<number> {
  return await withRetry(async () => {
    console.log(`🔄 Incremental sync: checking for new notes since ${lastSyncAt} for Client_ID2: ${clientId2}`);
    
    const token = await getCaspioToken();
    
    // Query for new regular notes
    const regularNotesUrl = `${CASPIO_BASE_URL}/rest/v2/tables/connect_tbl_clientnotes/records?q.where=Client_ID2='${clientId2}' AND Time_Stamp>'${lastSyncAt}'&q.orderBy=Time_Stamp DESC`;
    
    // Query for new ILS notes
    const ilsNotesUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_Member_Notes_ILS/records?q.where=Client_ID2='${clientId2}' AND Timestamp>'${lastSyncAt}'&q.orderBy=Timestamp DESC`;
    
    const [regularResponse, ilsResponse] = await Promise.all([
      fetch(regularNotesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }),
      fetch(ilsNotesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
    ]);

    if (!regularResponse.ok) {
      throw new Error(`Caspio API error (regular notes): ${regularResponse.status} ${regularResponse.statusText}`);
    }
    if (!ilsResponse.ok) {
      throw new Error(`Caspio API error (ILS notes): ${ilsResponse.status} ${ilsResponse.statusText}`);
    }

    const regularData = await regularResponse.json();
    const ilsData = await ilsResponse.json();
    
    const newCaspioNotes: CaspioNote[] = regularData.Result || [];
    const newILSNotes: CaspioILSNote[] = ilsData.Result || [];
    
    console.log(`📥 Found ${newCaspioNotes.length} new regular notes + ${newILSNotes.length} new ILS notes since last sync for Client_ID2: ${clientId2}`);

    if (newCaspioNotes.length === 0 && newILSNotes.length === 0) {
      return 0; // No new notes
    }

    const syncTime = new Date().toISOString();
    let importedCount = 0;

    // Transform new regular notes
    const newTransformedRegularNotes: MemberNote[] = newCaspioNotes.map(caspioNote => ({
      id: `caspio_${caspioNote.PK_ID}`,
      clientId2: caspioNote.Client_ID2.toString(),
      memberName: caspioNote.Senior_Full_Name || 'Unknown Member',
      noteText: caspioNote.Comments || '',
      noteType: 'General',
      createdBy: caspioNote.User_ID.toString(),
      createdByName: caspioNote.User_Full_Name || `User ${caspioNote.User_ID}`,
      assignedTo: caspioNote.Follow_Up_Assignment || undefined,
      assignedToName: caspioNote.Assigned_First || undefined,
      createdAt: caspioNote.Time_Stamp || syncTime,
      updatedAt: caspioNote.Time_Stamp || syncTime,
      source: 'Caspio',
      isRead: false, // New notes are unread
      priority: caspioNote.Follow_Up_Status?.includes('🟢') ? 'Medium' : 'Low',
      followUpDate: caspioNote.Follow_Up_Date,
      tags: [],
      isLegacy: false, // These are new notes, not legacy
      syncedAt: syncTime,
      isILSNote: false
    }));

    // Transform new ILS notes
    const newTransformedILSNotes: MemberNote[] = newILSNotes.map(ilsNote => ({
      id: `ils_${ilsNote.table_ID}`,
      clientId2: ilsNote.Client_ID2.toString(),
      memberName: ilsNote.Senior_First_Last || `${ilsNote.Senior_First} ${ilsNote.Senior_Last}` || 'Unknown Member',
      noteText: ilsNote.Note || '',
      noteType: 'Administrative',
      createdBy: ilsNote.User_ID.toString(),
      createdByName: ilsNote.User_First_Last || `${ilsNote.User_First} ${ilsNote.User_Last}` || `User ${ilsNote.User_ID}`,
      assignedTo: undefined,
      assignedToName: undefined,
      createdAt: ilsNote.Timestamp || syncTime,
      updatedAt: ilsNote.Timestamp || syncTime,
      source: 'ILS',
      isRead: false, // New notes are unread
      priority: 'Medium',
      followUpDate: undefined,
      tags: ['ILS', 'JHernandez@ilshealth.com'],
      isLegacy: false, // These are new notes, not legacy
      syncedAt: syncTime,
      isILSNote: true
    }));

    // Combine new notes
    const allNewNotes = [...newTransformedRegularNotes, ...newTransformedILSNotes];
    
    // Add new notes to existing cache and sort
    const existingNotes = memberNotesCache[clientId2] || [];
    const combinedNotes = [...existingNotes, ...allNewNotes];
    combinedNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    memberNotesCache[clientId2] = combinedNotes;
    importedCount = allNewNotes.length;

    // Save new notes to Firestore
    await saveNotesToFirestore(allNewNotes);

    // Update sync status
    if (syncStatusCache[clientId2]) {
      syncStatusCache[clientId2].lastSyncAt = syncTime;
      syncStatusCache[clientId2].updatedAt = syncTime;
      await saveSyncStatusToFirestore(clientId2, syncStatusCache[clientId2]);
    }

    console.log(`✅ Imported ${importedCount} new notes (${newTransformedRegularNotes.length} regular + ${newTransformedILSNotes.length} ILS) for Client_ID2: ${clientId2}`);
    return importedCount;

  }, 3, 1500, `sync new notes for ${clientId2}`).catch(error => {
    console.error('❌ Error syncing new notes from Caspio after retries:', error);
    updateSyncHealth('caspio_error', clientId2, error.message);
    throw error;
  });
}

async function syncNoteToCaspio(note: MemberNote): Promise<void> {
  try {
    console.log(`📤 Syncing new note to connect_tbl_clientnotes: ${note.id}`);
    
    const token = await getCaspioToken();
    
    // Create new record in connect_tbl_clientnotes
    const caspioData = {
      Client_ID2: parseInt(note.clientId2),
      Comments: note.noteText,
      User_ID: parseInt(note.createdBy),
      Time_Stamp: note.createdAt,
      Follow_Up_Date: note.followUpDate || null,
      Note_Status: note.noteType,
      Follow_Up_Status: note.priority === 'High' ? '🔴 Urgent' : '🟢 Open',
      User_Full_Name: note.createdByName,
      Follow_Up_Assignment: note.assignedTo || null,
      Assigned_First: note.assignedToName || null
    };

    const apiUrl = `${CASPIO_BASE_URL}/rest/v2/tables/connect_tbl_clientnotes/records`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(caspioData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create note in Caspio: ${response.status} ${errorText}`);
    }

    // Handle empty 201 response
    let result = null;
    const responseText = await response.text();
    if (responseText.trim()) {
      result = JSON.parse(responseText);
    }
    
    console.log(`✅ Note synced to Caspio connect_tbl_clientnotes: ${note.id}`);

  } catch (error) {
    console.error('❌ Error syncing note to Caspio:', error);
    // Don't throw error - note is still saved locally
  }
}


async function sendNoteNotification(note: MemberNote): Promise<void> {
  try {
    if (!note.assignedTo || !note.assignedToName) return;

    console.log(`🔔 Sending notification to ${note.assignedToName} for note: ${note.id}`);
    
    if (!adminDb || !Timestamp) {
      console.log(`⚠️ Firestore not available, notification not saved for note: ${note.id}`);
      return;
    }
    
    // Create a notification record in Firestore for real-time notifications
    const notification = {
      recipientId: note.assignedTo, // Single recipient for staff-notifications collection
      title: `Priority Note: ${note.memberName}`,
      content: note.noteText.substring(0, 200) + (note.noteText.length > 200 ? '...' : ''),
      memberName: note.memberName,
      priority: note.priority,
      type: 'member_note',
      isRead: false,
      requiresStaffAction: note.priority === 'High' || note.priority === 'Urgent',
      createdAt: Timestamp.now(),
      actionUrl: `/admin/member-notes?clientId2=${note.clientId2}`,
      metadata: {
        noteId: note.id,
        clientId2: note.clientId2,
        assignedBy: note.createdByName,
        noteType: note.noteType
      }
    };

    // Save to Firestore staff-notifications collection for real-time updates
    await adminDb.collection('staff-notifications').add(notification);
    
    console.log(`🔔 Real-time notification created for ${note.assignedToName} (Priority: ${note.priority})`);
    
    // Send email notification
    try {
      // Get staff email (in production, this would be a database lookup)
      const staffEmail = getStaffEmail(note.assignedTo);
      
      if (staffEmail) {
        // Import email function if it exists
        try {
          const { sendNoteAssignmentEmail } = await import('@/app/actions/send-email');
          
          await sendNoteAssignmentEmail({
            to: staffEmail,
            staffName: note.assignedToName,
            memberName: note.memberName,
            noteContent: note.noteText,
            priority: note.priority.toLowerCase() as 'low' | 'medium' | 'high',
            assignedBy: note.createdByName,
            noteType: note.noteType,
            source: 'portal',
            clientId2: note.clientId2
          });
          
          console.log(`📧 Email sent to ${staffEmail} for note assignment`);
        } catch (importError) {
          console.warn('⚠️ Email function not available, skipping email notification');
        }
      } else {
        console.warn(`⚠️ No email found for staff ID: ${note.assignedTo}`);
      }
    } catch (emailError) {
      console.error('❌ Failed to send email notification:', emailError);
      // Don't throw error - notification was still saved to Firestore
    }
    
    console.log(`✅ Notification saved to Firestore for ${note.assignedToName}`);

  } catch (error) {
    console.error('Error sending note notification:', error);
  }
}

function getStaffEmail(staffId: string): string | null {
  // Staff email mapping (in production, this would be a database lookup)
  const staffEmailMap: { [key: string]: string } = {
    'nick-staff': 'nick@carehomefinders.com',
    'john-staff': 'john@carehomefinders.com',
    'jessie-staff': 'jessie@carehomefinders.com',
    'jason-admin': 'jason@carehomefinders.com',
    'monica-staff': 'monica@carehomefinders.com',
    'leidy-staff': 'leidy@carehomefinders.com'
  };
  
  return staffEmailMap[staffId] || null;
}

function getUserDisplayName(userId: string): string {
  // In production, this would lookup user details from the database
  const userMap: { [key: string]: string } = {
    'sarah_johnson': 'Sarah Johnson, MSW',
    'mike_wilson': 'Dr. Mike Wilson, RN',
    'emily_davis': 'Emily Davis, MSW',
    'david_chen': 'David Chen, RN'
  };
  
  return userMap[userId] || userId;
}

function getStaffDisplayName(staffId: string): string {
  // Staff display name mapping (in production, this would be a database lookup)
  const staffNameMap: { [key: string]: string } = {
    'nick-staff': 'Nick Rodriguez',
    'john-staff': 'John Smith',
    'jessie-staff': 'Jessie Martinez',
    'jason-admin': 'Jason Bloome',
    'monica-staff': 'Monica Garcia',
    'leidy-staff': 'Leidy Kanjanapitak'
  };
  
  return staffNameMap[staffId] || staffId;
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, clientId2, ...updates } = body;

    if (!id || !clientId2) {
      return NextResponse.json(
        { success: false, error: 'Note ID and Client ID are required' },
        { status: 400 }
      );
    }

    console.log(`📝 Updating note: ${id} for member: ${clientId2}`);

    const memberNotes = memberNotesCache[clientId2] || [];
    const noteIndex = memberNotes.findIndex(note => note.id === id);

    if (noteIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Note not found' },
        { status: 404 }
      );
    }

    // Update the note
    memberNotes[noteIndex] = {
      ...memberNotes[noteIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // In production, also sync update to Caspio if it's a Caspio note
    if (memberNotes[noteIndex].source === 'Caspio') {
      await syncNoteToCaspio(memberNotes[noteIndex]);
    }

    return NextResponse.json({
      success: true,
      note: memberNotes[noteIndex],
      message: 'Note updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating member note:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update note' },
      { status: 500 }
    );
  }
}