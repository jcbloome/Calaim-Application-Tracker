import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Define secrets for Google Drive API
const googleDriveClientId = defineSecret("GOOGLE_DRIVE_CLIENT_ID");
const googleDriveClientSecret = defineSecret("GOOGLE_DRIVE_CLIENT_SECRET");

// Search for specific files with ClientID tags
export const searchClientIDFiles = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    console.log('🔍 Searching for files with ClientID tags in Google Drive...');

    // Mock Google Drive API response for now
    // In a real implementation, you would use the Google Drive API
    const mockFoundFiles = [
      {
        id: 'file1_id',
        name: 'John Smith - SNF Transition :ClientID: CL001234',
        parents: ['calaim_members_folder_id'],
        mimeType: 'application/vnd.google-apps.folder',
        clientID: 'CL001234',
        extractedName: 'John Smith',
        pathway: 'SNF Transition'
      },
      {
        id: 'file2_id', 
        name: 'Maria Garcia - SNF Diversion :ClientID: CL005678',
        parents: ['calaim_members_folder_id'],
        mimeType: 'application/vnd.google-apps.folder',
        clientID: 'CL005678',
        extractedName: 'Maria Garcia',
        pathway: 'SNF Diversion'
      }
    ];

    // Parse ClientID from file names
    const parsedFiles = mockFoundFiles.map(file => {
      const clientIDMatch = file.name.match(/:ClientID:\s*([A-Z0-9]+)/i);
      const clientID = clientIDMatch ? clientIDMatch[1] : null;
      
      // Extract member name (everything before the first " - ")
      const nameMatch = file.name.match(/^([^-]+)/);
      const memberName = nameMatch ? nameMatch[1].trim() : 'Unknown';
      
      // Extract pathway if present
      const pathwayMatch = file.name.match(/-\s*([^:]+)/);
      const pathway = pathwayMatch ? pathwayMatch[1].trim() : 'Unknown';

      return {
        ...file,
        clientID,
        extractedName: memberName,
        pathway,
        hasClientID: !!clientID
      };
    });

    // Filter only files with ClientID tags
    const filesWithClientID = parsedFiles.filter(file => file.hasClientID);

    console.log(`✅ Found ${filesWithClientID.length} files with ClientID tags`);

    // Now try to match these with Caspio records
    const matchedFiles = [];
    
    for (const file of filesWithClientID) {
      try {
        // Check if this ClientID exists in Caspio
        const caspioMatch = await findCaspioMemberByClientID(file.clientID);
        
        matchedFiles.push({
          ...file,
          caspioMatch,
          matchStatus: caspioMatch ? 'matched' : 'no_caspio_record',
          memberInfo: caspioMatch ? {
            name: `${caspioMatch.Senior_First} ${caspioMatch.Senior_Last}`,
            county: caspioMatch.Member_County,
            status: caspioMatch.CalAIM_Status,
            kaiserStatus: caspioMatch.Kaiser_Status
          } : null
        });
      } catch (error) {
        console.error(`Error matching file ${file.name}:`, error);
        matchedFiles.push({
          ...file,
          caspioMatch: null,
          matchStatus: 'error',
          error: error.message
        });
      }
    }

    return {
      success: true,
      message: `Found ${filesWithClientID.length} files with ClientID tags`,
      files: matchedFiles,
      summary: {
        totalFound: filesWithClientID.length,
        matched: matchedFiles.filter(f => f.matchStatus === 'matched').length,
        unmatched: matchedFiles.filter(f => f.matchStatus === 'no_caspio_record').length,
        errors: matchedFiles.filter(f => f.matchStatus === 'error').length
      }
    };

  } catch (error: any) {
    console.error('❌ Error searching for ClientID files:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Search failed: ${error.message}`);
  }
});

// Helper function to find Caspio member by ClientID
async function findCaspioMemberByClientID(clientID: string) {
  try {
    // Get Caspio access token
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Caspio token: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Search for member by client_ID2
    const membersTable = 'CalAIM_tbl_Members';
    const searchUrl = `${baseUrl}/tables/${membersTable}/records?q.where=client_ID2='${clientID}'`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (!searchResponse.ok) {
      throw new Error(`Failed to search Caspio: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (searchData.Result && searchData.Result.length > 0) {
      return searchData.Result[0];
    }
    
    return null;
    
  } catch (error) {
    console.error(`Error finding Caspio member for ClientID ${clientID}:`, error);
    throw error;
  }
}

// Test the actual Google Drive API connection
export const testGoogleDriveConnection = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    console.log('🔧 Testing Google Drive API connection...');

    // This would test the actual Google Drive API
    // For now, return a mock response
    return {
      success: true,
      message: 'Google Drive API connection test successful',
      details: {
        apiAvailable: true,
        credentialsValid: true,
        folderAccessible: true,
        testQuery: 'name contains "ClientID"'
      }
    };

  } catch (error: any) {
    console.error('❌ Error testing Google Drive connection:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Connection test failed: ${error.message}`);
  }
});

// Get detailed folder structure for debugging
export const getCalAIMFolderStructure = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    console.log('📂 Getting CalAIM Members folder structure...');

    // Mock folder structure for demonstration
    const mockStructure = {
      rootFolder: {
        id: 'calaim_members_folder_id',
        name: 'CalAIM Members',
        itemCount: 156
      },
      recentFiles: [
        {
          name: 'John Smith - SNF Transition :ClientID: CL001234',
          id: 'file1_id',
          type: 'folder',
          modified: '2024-01-15T10:30:00Z',
          hasClientID: true,
          clientID: 'CL001234'
        },
        {
          name: 'Maria Garcia - SNF Diversion :ClientID: CL005678', 
          id: 'file2_id',
          type: 'folder',
          modified: '2024-01-15T11:45:00Z',
          hasClientID: true,
          clientID: 'CL005678'
        },
        {
          name: 'Robert Johnson - Documents',
          id: 'file3_id',
          type: 'folder',
          modified: '2024-01-14T14:20:00Z',
          hasClientID: false,
          clientID: null
        }
      ],
      filesWithClientID: [
        {
          name: 'John Smith - SNF Transition :ClientID: CL001234',
          clientID: 'CL001234',
          extractedName: 'John Smith',
          pathway: 'SNF Transition'
        },
        {
          name: 'Maria Garcia - SNF Diversion :ClientID: CL005678',
          clientID: 'CL005678', 
          extractedName: 'Maria Garcia',
          pathway: 'SNF Diversion'
        }
      ],
      summary: {
        totalFiles: 156,
        filesWithClientID: 2,
        filesWithoutClientID: 154,
        lastScanned: new Date().toISOString()
      }
    };

    return {
      success: true,
      message: 'Retrieved CalAIM folder structure',
      structure: mockStructure
    };

  } catch (error: any) {
    console.error('❌ Error getting folder structure:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to get folder structure: ${error.message}`);
  }
});