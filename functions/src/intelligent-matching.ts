import { onCall, HttpsError } from "firebase-functions/v2/https";
import { google } from 'googleapis';
import * as admin from "firebase-admin";

// Lazy initialization of Firestore
const getDb = () => admin.firestore();

interface DriveFolder {
  id: string;
  name: string;
  fullPath: string;
  parentId?: string;
}

interface CaspioMember {
  Client_ID2: string;
  First_Name: string;
  Last_Name: string;
  fullName: string;
}

interface MatchSuggestion {
  driveFolder: DriveFolder;
  caspioMember: CaspioMember;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'manual';
  reasons: string[];
}

// Fuzzy matching utility functions
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // insertion
        matrix[j - 1][i] + 1,     // deletion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  if (normalized1 === normalized2) return 1.0;
  
  const maxLength = Math.max(normalized1.length, normalized2.length);
  if (maxLength === 0) return 1.0;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  return (maxLength - distance) / maxLength;
}

function extractNameFromFolder(folderName: string): { firstName: string; lastName: string; fullName: string } {
  // Remove common prefixes/suffixes and normalize
  let cleanName = folderName
    .replace(/^(member|client|case)\s*/i, '')
    .replace(/\s*(folder|files?|docs?|documents?)$/i, '')
    .replace(/clientid:\s*\d+$/i, '') // Remove ClientID: numbers
    .trim();
  
  // Try to split into first and last name
  const parts = cleanName.split(/\s+/);
  
  if (parts.length >= 2) {
    // Assume first part is first name, rest is last name
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`
    };
  } else if (parts.length === 1) {
    // Single name - could be first or last
    return {
      firstName: parts[0],
      lastName: '',
      fullName: parts[0]
    };
  }
  
  return {
    firstName: '',
    lastName: '',
    fullName: cleanName
  };
}

function calculateMatchConfidence(driveFolder: DriveFolder, caspioMember: CaspioMember): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 0;
  
  const driveName = extractNameFromFolder(driveFolder.name);
  
  // Full name match
  const fullNameSimilarity = calculateSimilarity(driveName.fullName, caspioMember.fullName);
  if (fullNameSimilarity >= 0.9) {
    confidence += 40;
    reasons.push(`Strong full name match (${(fullNameSimilarity * 100).toFixed(1)}%)`);
  } else if (fullNameSimilarity >= 0.7) {
    confidence += 25;
    reasons.push(`Good full name match (${(fullNameSimilarity * 100).toFixed(1)}%)`);
  }
  
  // First name match
  if (driveName.firstName && caspioMember.First_Name) {
    const firstNameSimilarity = calculateSimilarity(driveName.firstName, caspioMember.First_Name);
    if (firstNameSimilarity >= 0.8) {
      confidence += 20;
      reasons.push(`First name match (${(firstNameSimilarity * 100).toFixed(1)}%)`);
    }
  }
  
  // Last name match
  if (driveName.lastName && caspioMember.Last_Name) {
    const lastNameSimilarity = calculateSimilarity(driveName.lastName, caspioMember.Last_Name);
    if (lastNameSimilarity >= 0.8) {
      confidence += 20;
      reasons.push(`Last name match (${(lastNameSimilarity * 100).toFixed(1)}%)`);
    }
  }
  
  // Check for reversed names (Last, First format)
  const reversedName = `${caspioMember.Last_Name}, ${caspioMember.First_Name}`;
  const reversedSimilarity = calculateSimilarity(driveName.fullName, reversedName);
  if (reversedSimilarity >= 0.8) {
    confidence += 15;
    reasons.push(`Reversed name format match (${(reversedSimilarity * 100).toFixed(1)}%)`);
  }
  
  // Check for partial matches (first name in folder, last name in folder)
  const folderLower = driveFolder.name.toLowerCase();
  if (caspioMember.First_Name && folderLower.includes(caspioMember.First_Name.toLowerCase())) {
    confidence += 10;
    reasons.push('First name found in folder');
  }
  if (caspioMember.Last_Name && folderLower.includes(caspioMember.Last_Name.toLowerCase())) {
    confidence += 10;
    reasons.push('Last name found in folder');
  }
  
  return { confidence: Math.min(confidence, 100), reasons };
}

// Get all CalAIM member folders from Google Drive
export const getAllCalAIMFolders = onCall(async (request) => {
  try {
    console.log('🔍 Fetching all CalAIM member folders from Google Drive...');
    
    // Get stored credentials
    const credentialsDoc = await getDb().collection('system').doc('google-drive-credentials').get();
    if (!credentialsDoc.exists) {
      throw new HttpsError('failed-precondition', 'Google Drive not authenticated');
    }
    
    const credentials = credentialsDoc.data();
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    
    oauth2Client.setCredentials(credentials);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Find the CalAIM Members folder
    const calaimFoldersQuery = await drive.files.list({
      q: "name='CalAIM Members' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)',
    });
    
    if (!calaimFoldersQuery.data.files || calaimFoldersQuery.data.files.length === 0) {
      throw new HttpsError('not-found', 'CalAIM Members folder not found');
    }
    
    const calaimFolderId = calaimFoldersQuery.data.files[0].id!;
    console.log(`📁 Found CalAIM Members folder: ${calaimFolderId}`);
    
    // Get all subfolders (member folders)
    const memberFoldersQuery = await drive.files.list({
      q: `'${calaimFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, parents)',
      pageSize: 1000, // Get up to 1000 folders
    });
    
    const folders: DriveFolder[] = (memberFoldersQuery.data.files || []).map(file => ({
      id: file.id!,
      name: file.name!,
      fullPath: `CalAIM Members/${file.name}`,
      parentId: calaimFolderId
    }));
    
    // Sort alphabetically by name
    folders.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Found ${folders.length} member folders in Google Drive`);
    
    return {
      success: true,
      folders,
      count: folders.length,
      message: `Successfully retrieved ${folders.length} CalAIM member folders`
    };
    
  } catch (error: any) {
    console.error('❌ Error fetching CalAIM folders:', error);
    throw new HttpsError('internal', `Failed to fetch CalAIM folders: ${error.message}`);
  }
});

// Get all members from Caspio
export const getAllCaspioMembers = onCall(async (request) => {
  try {
    console.log('🔍 Fetching all members from Caspio...');
    
    // Get Caspio credentials
    const caspioDoc = await getDb().collection('system').doc('caspio-config').get();
    if (!caspioDoc.exists) {
      throw new HttpsError('failed-precondition', 'Caspio not configured');
    }
    
    const config = caspioDoc.data();
    
    // Get access token
    const tokenResponse = await fetch(`${config.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Caspio token: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Fetch all members from the CalAIM_Member_Table
    const membersResponse = await fetch(
      `${config.baseUrl}/rest/v2/tables/CalAIM_Member_Table/records?q.select=Client_ID2,First_Name,Last_Name&q.pageSize=1000`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!membersResponse.ok) {
      throw new Error(`Failed to fetch members: ${membersResponse.status}`);
    }
    
    const membersData = await membersResponse.json();
    
    const members: CaspioMember[] = (membersData.Result || [])
      .filter((member: any) => member.Client_ID2 && (member.First_Name || member.Last_Name))
      .map((member: any) => ({
        Client_ID2: member.Client_ID2,
        First_Name: member.First_Name || '',
        Last_Name: member.Last_Name || '',
        fullName: `${member.First_Name || ''} ${member.Last_Name || ''}`.trim()
      }));
    
    // Sort alphabetically by full name
    members.sort((a, b) => a.fullName.localeCompare(b.fullName));
    
    console.log(`✅ Found ${members.length} members in Caspio`);
    
    return {
      success: true,
      members,
      count: members.length,
      message: `Successfully retrieved ${members.length} Caspio members`
    };
    
  } catch (error: any) {
    console.error('❌ Error fetching Caspio members:', error);
    throw new HttpsError('internal', `Failed to fetch Caspio members: ${error.message}`);
  }
});

// Generate intelligent matching suggestions
export const generateMatchingSuggestions = onCall(async (request) => {
  try {
    console.log('🤖 Generating intelligent matching suggestions...');
    
    const { folders, members } = request.data;
    
    if (!folders || !members) {
      throw new HttpsError('invalid-argument', 'Both folders and members data required');
    }
    
    const suggestions: MatchSuggestion[] = [];
    const unmatchedFolders: DriveFolder[] = [];
    const unmatchedMembers: CaspioMember[] = [...members];
    
    // Generate suggestions for each folder
    for (const folder of folders) {
      const folderSuggestions: Array<{ member: CaspioMember; confidence: number; reasons: string[] }> = [];
      
      // Calculate confidence for each member
      for (const member of members) {
        const { confidence, reasons } = calculateMatchConfidence(folder, member);
        
        if (confidence > 30) { // Only consider matches above 30% confidence
          folderSuggestions.push({ member, confidence, reasons });
        }
      }
      
      // Sort by confidence (highest first)
      folderSuggestions.sort((a, b) => b.confidence - a.confidence);
      
      if (folderSuggestions.length > 0) {
        const bestMatch = folderSuggestions[0];
        
        let matchType: 'exact' | 'fuzzy' | 'partial' | 'manual' = 'manual';
        if (bestMatch.confidence >= 90) matchType = 'exact';
        else if (bestMatch.confidence >= 70) matchType = 'fuzzy';
        else if (bestMatch.confidence >= 50) matchType = 'partial';
        
        suggestions.push({
          driveFolder: folder,
          caspioMember: bestMatch.member,
          confidence: bestMatch.confidence,
          matchType,
          reasons: bestMatch.reasons
        });
        
        // Remove matched member from unmatched list
        const memberIndex = unmatchedMembers.findIndex(m => m.Client_ID2 === bestMatch.member.Client_ID2);
        if (memberIndex > -1) {
          unmatchedMembers.splice(memberIndex, 1);
        }
      } else {
        unmatchedFolders.push(folder);
      }
    }
    
    // Sort suggestions by confidence (highest first)
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    const stats = {
      totalFolders: folders.length,
      totalMembers: members.length,
      suggestedMatches: suggestions.length,
      unmatchedFolders: unmatchedFolders.length,
      unmatchedMembers: unmatchedMembers.length,
      exactMatches: suggestions.filter(s => s.matchType === 'exact').length,
      fuzzyMatches: suggestions.filter(s => s.matchType === 'fuzzy').length,
      partialMatches: suggestions.filter(s => s.matchType === 'partial').length,
    };
    
    console.log(`✅ Generated ${suggestions.length} matching suggestions`);
    console.log(`📊 Stats:`, stats);
    
    return {
      success: true,
      suggestions,
      unmatchedFolders,
      unmatchedMembers,
      stats,
      message: `Generated ${suggestions.length} matching suggestions with ${stats.exactMatches} exact matches`
    };
    
  } catch (error: any) {
    console.error('❌ Error generating matching suggestions:', error);
    throw new HttpsError('internal', `Failed to generate matching suggestions: ${error.message}`);
  }
});

// Apply matching suggestions (batch update)
export const applyMatchingSuggestions = onCall(async (request) => {
  try {
    console.log('💾 Applying matching suggestions...');
    
    const { suggestions, autoApplyThreshold = 90 } = request.data;
    
    if (!suggestions || !Array.isArray(suggestions)) {
      throw new HttpsError('invalid-argument', 'Suggestions array required');
    }
    
    const results = {
      applied: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[]
    };
    
    // Get Caspio credentials for updates
    const caspioDoc = await getDb().collection('system').doc('caspio-config').get();
    if (!caspioDoc.exists) {
      throw new HttpsError('failed-precondition', 'Caspio not configured');
    }
    
    const config = caspioDoc.data();
    
    // Get access token
    const tokenResponse = await fetch(`${config.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Caspio token: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Process each suggestion
    for (const suggestion of suggestions) {
      try {
        // Only auto-apply high-confidence matches
        if (suggestion.confidence < autoApplyThreshold) {
          results.skipped++;
          results.details.push({
            folderId: suggestion.driveFolder.id,
            folderName: suggestion.driveFolder.name,
            clientId: suggestion.caspioMember.Client_ID2,
            status: 'skipped',
            reason: `Confidence ${suggestion.confidence}% below threshold ${autoApplyThreshold}%`
          });
          continue;
        }
        
        // Update Caspio record with Google Drive folder ID
        const updateResponse = await fetch(
          `${config.baseUrl}/rest/v2/tables/CalAIM_Member_Table/records?q.where=Client_ID2='${suggestion.caspioMember.Client_ID2}'`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              Google_Drive_Folder_ID: suggestion.driveFolder.id,
              Google_Drive_Folder_Name: suggestion.driveFolder.name,
              Drive_Sync_Status: 'Matched',
              Drive_Sync_Date: new Date().toISOString(),
              Drive_Match_Confidence: suggestion.confidence,
              Drive_Match_Type: suggestion.matchType
            }),
          }
        );
        
        if (updateResponse.ok) {
          results.applied++;
          results.details.push({
            folderId: suggestion.driveFolder.id,
            folderName: suggestion.driveFolder.name,
            clientId: suggestion.caspioMember.Client_ID2,
            memberName: suggestion.caspioMember.fullName,
            confidence: suggestion.confidence,
            matchType: suggestion.matchType,
            status: 'applied',
            reasons: suggestion.reasons
          });
        } else {
          results.errors++;
          results.details.push({
            folderId: suggestion.driveFolder.id,
            folderName: suggestion.driveFolder.name,
            clientId: suggestion.caspioMember.Client_ID2,
            status: 'error',
            reason: `Caspio update failed: ${updateResponse.status}`
          });
        }
        
      } catch (error: any) {
        results.errors++;
        results.details.push({
          folderId: suggestion.driveFolder?.id,
          folderName: suggestion.driveFolder?.name,
          clientId: suggestion.caspioMember?.Client_ID2,
          status: 'error',
          reason: error.message
        });
      }
    }
    
    console.log(`✅ Applied ${results.applied} matches, skipped ${results.skipped}, errors ${results.errors}`);
    
    return {
      success: true,
      results,
      message: `Applied ${results.applied} matches successfully`
    };
    
  } catch (error: any) {
    console.error('❌ Error applying matching suggestions:', error);
    throw new HttpsError('internal', `Failed to apply matching suggestions: ${error.message}`);
  }
});