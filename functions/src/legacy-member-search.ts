import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';

// Define secrets for Google Drive API
const googleDriveClientId = defineSecret("GOOGLE_DRIVE_CLIENT_ID");
const googleDriveClientSecret = defineSecret("GOOGLE_DRIVE_CLIENT_SECRET");

// Lazy initialization of Firestore
let _db: admin.firestore.Firestore | null = null;
const getDb = () => {
  if (!_db) {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    _db = getFirestore();
  }
  return _db;
};

interface LegacyMember {
  id: string;
  folderName: string;
  extractedFirstName: string;
  extractedLastName: string;
  extractedFullName: string;
  driveUrl: string;
  fileCount: number;
  subfolderCount: number;
  lastModified?: string;
  folderPath: string;
  hasKaiserFolder: boolean;
  hasHealthNetFolder: boolean;
  extractedClientId?: string;
  hasClientId: boolean;
  importedAt: string;
}

// Helper function to parse member name from folder name
function parseNameFromFolder(folderName: string): {
  firstName: string;
  lastName: string;
  fullName: string;
  clientId?: string;
  hasClientId: boolean;
} {
  // Remove common prefixes and clean the name
  let cleanName = folderName
    .replace(/^(Member|Client|Patient)\s*[-:]?\s*/i, '')
    .replace(/\s*[-:]\s*ClientID\s*[-:]?\s*\d+$/i, '')
    .replace(/\s*ClientID\s*[-:]?\s*\d+/i, '')
    .trim();

  // Extract Client ID if present
  const clientIdMatch = folderName.match(/ClientID\s*[-:]?\s*(\d+)/i);
  const clientId = clientIdMatch ? clientIdMatch[1] : undefined;

  // Try different name parsing patterns
  let firstName = '';
  let lastName = '';

  // Pattern 1: "Last, First" or "Last,First"
  const commaPattern = cleanName.match(/^([^,]+),\s*(.+)$/);
  if (commaPattern) {
    lastName = commaPattern[1].trim();
    firstName = commaPattern[2].trim();
  } else {
    // Pattern 2: "First Last" (space separated)
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else if (parts.length === 1) {
      // Single name - treat as last name
      lastName = parts[0];
      firstName = '';
    }
  }

  // Clean up names
  firstName = firstName.replace(/[^\w\s'-]/g, '').trim();
  lastName = lastName.replace(/[^\w\s'-]/g, '').trim();

  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  return {
    firstName,
    lastName,
    fullName: fullName || folderName,
    clientId,
    hasClientId: !!clientId
  };
}

// Function to get authenticated Google Drive service
async function getDriveService() {
  try {
    console.log('🔑 Setting up Google Drive service...');
    
    // Try service account authentication first (simpler and more reliable)
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      
      const authClient = await auth.getClient();
      const drive = google.drive({ version: 'v3', auth: authClient });
      
      console.log('✅ Using service account authentication');
      return drive;
    } catch (serviceAccountError) {
      console.log('⚠️ Service account auth failed, trying OAuth2:', serviceAccountError);
    }
    
    // Fallback to OAuth2 with stored credentials
    const db = getDb();
    const credentialsDoc = await db.collection('system').doc('google-drive-credentials').get();
    
    if (!credentialsDoc.exists) {
      throw new HttpsError('unauthenticated', 'Google Drive credentials not found. Please authenticate Google Drive access in the admin panel first.');
    }
    
    const credentials = credentialsDoc.data();
    const oauth2Client = new google.auth.OAuth2(
      googleDriveClientId.value(),
      googleDriveClientSecret.value(),
      'urn:ietf:wg:oauth:2.0:oob'
    );
    
    oauth2Client.setCredentials(credentials);
    console.log('✅ Using OAuth2 authentication');
    return google.drive({ version: 'v3', auth: oauth2Client });
    
  } catch (error: any) {
    console.error('❌ Error setting up Google Drive service:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to authenticate with Google Drive: ${error.message}`);
  }
}

// Import all legacy members from Google Drive
export const importLegacyMembersFromDrive = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    console.log('🔍 Starting legacy member import from Google Drive...');
    
    // Test authentication first
    console.log('🔑 Testing Google Drive authentication...');
    const drive = await getDriveService();
    console.log('✅ Google Drive authentication successful');
    
    const db = getDb();

    // Find the CalAIM Members folder
    const calaimFolderQuery = await drive.files.list({
      q: "name='CalAIM Members' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)',
      pageSize: 10,
    });

    if (!calaimFolderQuery.data.files || calaimFolderQuery.data.files.length === 0) {
      throw new HttpsError('not-found', 'CalAIM Members folder not found in Google Drive');
    }

    const calaimFolderId = calaimFolderQuery.data.files[0].id!;
    console.log(`📁 Found CalAIM Members folder: ${calaimFolderId}`);

    // Get all member folders
    const memberFoldersQuery = await drive.files.list({
      q: `'${calaimFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, parents, modifiedTime, webViewLink)',
      pageSize: 1000,
    });

    const legacyMembers: LegacyMember[] = [];
    const memberFolders = memberFoldersQuery.data.files || [];

    console.log(`👥 Found ${memberFolders.length} member folders to process`);

    // Process each member folder
    for (const folder of memberFolders) {
      try {
        const parsedName = parseNameFromFolder(folder.name!);
        
        // Get folder contents to count files and check for plan subfolders
        const contentsQuery = await drive.files.list({
          q: `'${folder.id}' in parents`,
          fields: 'files(id, name, mimeType)',
          pageSize: 1000,
        });

        const contents = contentsQuery.data.files || [];
        const files = contents.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        const subfolders = contents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

        // Check for Kaiser and Health Net subfolders
        const hasKaiserFolder = subfolders.some(sf => 
          sf.name?.toLowerCase().includes('kaiser')
        );
        const hasHealthNetFolder = subfolders.some(sf => 
          sf.name?.toLowerCase().includes('health') || sf.name?.toLowerCase().includes('net')
        );

        // Count files in subfolders too
        let totalFileCount = files.length;
        for (const subfolder of subfolders) {
          try {
            const subfolderContents = await drive.files.list({
              q: `'${subfolder.id}' in parents and mimeType!='application/vnd.google-apps.folder'`,
              fields: 'files(id)',
              pageSize: 1000,
            });
            totalFileCount += (subfolderContents.data.files || []).length;
          } catch (error) {
            console.warn(`Failed to count files in subfolder ${subfolder.name}:`, error);
          }
        }

        const legacyMember: LegacyMember = {
          id: folder.id!,
          folderName: folder.name!,
          extractedFirstName: parsedName.firstName,
          extractedLastName: parsedName.lastName,
          extractedFullName: parsedName.fullName,
          driveUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
          fileCount: totalFileCount,
          subfolderCount: subfolders.length,
          lastModified: folder.modifiedTime || undefined,
          folderPath: `CalAIM Members/${folder.name}`,
          hasKaiserFolder,
          hasHealthNetFolder,
          extractedClientId: parsedName.clientId,
          hasClientId: parsedName.hasClientId,
          importedAt: new Date().toISOString()
        };

        legacyMembers.push(legacyMember);
      } catch (error) {
        console.error(`Error processing folder ${folder.name}:`, error);
        // Continue with other folders
      }
    }

    // Store in Firestore for caching and faster searches
    const batch = db.batch();
    const legacyMembersRef = db.collection('legacyMembers');

    // Clear existing data
    const existingDocs = await legacyMembersRef.get();
    existingDocs.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Add new data
    legacyMembers.forEach(member => {
      const docRef = legacyMembersRef.doc(member.id);
      batch.set(docRef, member);
    });

    await batch.commit();

    console.log(`✅ Successfully imported ${legacyMembers.length} legacy members`);

    return {
      success: true,
      members: legacyMembers,
      message: `Successfully imported ${legacyMembers.length} legacy CalAIM members from Google Drive`
    };

  } catch (error: any) {
    console.error('❌ Error importing legacy members:', error);
    
    // Provide more specific error messages
    if (error.code === 'unauthenticated') {
      throw new HttpsError('unauthenticated', 'Google Drive authentication failed. Please ensure Google Drive credentials are properly configured.');
    } else if (error.code === 'not-found') {
      throw error; // Re-throw as-is
    } else if (error.message?.includes('quota')) {
      throw new HttpsError('resource-exhausted', 'Google Drive API quota exceeded. Please try again later.');
    } else if (error.message?.includes('permission')) {
      throw new HttpsError('permission-denied', 'Insufficient permissions to access Google Drive. Please check folder sharing settings.');
    } else {
      throw new HttpsError('internal', `Failed to import legacy members: ${error.message || 'Unknown error'}`);
    }
  }
});

// Refresh legacy member data from Firestore
export const refreshLegacyMemberData = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    const db = getDb();
    const legacyMembersRef = db.collection('legacyMembers');
    
    const snapshot = await legacyMembersRef.orderBy('extractedFullName').get();
    const members = snapshot.docs.map(doc => doc.data() as LegacyMember);

    console.log(`📊 Retrieved ${members.length} legacy members from cache`);

    return {
      success: true,
      members,
      message: `Retrieved ${members.length} legacy members from database`
    };

  } catch (error: any) {
    console.error('❌ Error refreshing legacy member data:', error);
    throw new HttpsError('internal', `Failed to refresh legacy member data: ${error.message}`);
  }
});

// Test Google Drive connection
export const testGoogleDriveConnection = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    console.log('🔍 Testing Google Drive connection...');
    
    const drive = await getDriveService();
    
    // Try to list the root folder to test connection
    const testQuery = await drive.files.list({
      q: "name='CalAIM Members' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const foundFolders = testQuery.data.files || [];
    
    return {
      success: true,
      connected: true,
      calaimFolderFound: foundFolders.length > 0,
      calaimFolderId: foundFolders.length > 0 ? foundFolders[0].id : null,
      message: foundFolders.length > 0 
        ? 'Google Drive connected successfully and CalAIM Members folder found'
        : 'Google Drive connected but CalAIM Members folder not found'
    };

  } catch (error: any) {
    console.error('❌ Google Drive connection test failed:', error);
    return {
      success: false,
      connected: false,
      error: error.message,
      message: `Connection failed: ${error.message}`
    };
  }
});

// Search legacy members by name or client ID
export const searchLegacyMembers = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    const { searchTerm, filterBy, limit = 100 } = request.data;
    const db = getDb();
    const legacyMembersRef = db.collection('legacyMembers');
    
    let query = legacyMembersRef.orderBy('extractedFullName');

    // Apply filters
    if (filterBy === 'kaiser') {
      query = query.where('hasKaiserFolder', '==', true);
    } else if (filterBy === 'healthnet') {
      query = query.where('hasHealthNetFolder', '==', true);
    } else if (filterBy === 'clientid') {
      query = query.where('hasClientId', '==', true);
    } else if (filterBy === 'noclientid') {
      query = query.where('hasClientId', '==', false);
    }

    query = query.limit(limit);
    
    const snapshot = await query.get();
    let members = snapshot.docs.map(doc => doc.data() as LegacyMember);

    // Apply text search filter (Firestore doesn't support full-text search)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      members = members.filter(member => 
        member.extractedFirstName.toLowerCase().includes(search) ||
        member.extractedLastName.toLowerCase().includes(search) ||
        member.extractedFullName.toLowerCase().includes(search) ||
        member.folderName.toLowerCase().includes(search) ||
        (member.extractedClientId && member.extractedClientId.includes(search))
      );
    }

    return {
      success: true,
      members,
      total: members.length,
      message: `Found ${members.length} matching legacy members`
    };

  } catch (error: any) {
    console.error('❌ Error searching legacy members:', error);
    throw new HttpsError('internal', `Failed to search legacy members: ${error.message}`);
  }
});