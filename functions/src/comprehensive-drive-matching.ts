import { onCall, HttpsError } from "firebase-functions/v2/https";
import { google } from 'googleapis';
import * as admin from "firebase-admin";

// Lazy initialization of Firestore
const getDb = () => admin.firestore();

interface DriveFolder {
  id: string;
  name: string;
  fullPath: string;
  parentId: string;
  parentName?: string;
  extractedFirstName?: string;
  extractedLastName?: string;
  extractedFullName?: string;
  hasClientId?: boolean;
  extractedClientId?: string;
  fileCount?: number;
  subfolderCount?: number;
  lastModified?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  folderId: string;
  folderPath: string;
}

interface CaspioMember {
  Client_ID2: string;
  First_Name: string;
  Last_Name: string;
  fullName: string;
  memberMrn?: string;
  memberCounty?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
}

interface MatchSuggestion {
  driveFolder: DriveFolder;
  caspioMember: CaspioMember;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'manual';
  reasons: string[];
  requiresManualReview: boolean;
}

interface ComprehensiveMatchResult {
  suggestions: MatchSuggestion[];
  unmatchedFolders: DriveFolder[];
  unmatchedMembers: CaspioMember[];
  stats: {
    totalFolders: number;
    totalMembers: number;
    exactMatches: number;
    fuzzyMatches: number;
    partialMatches: number;
    requiresReview: number;
    unmatchedFolders: number;
    unmatchedMembers: number;
  };
}

// Advanced name parsing and normalization
function parseNameFromFolder(folderName: string): {
  firstName: string;
  lastName: string;
  fullName: string;
  hasClientId: boolean;
  clientId?: string;
} {
  // Remove common prefixes and suffixes
  let cleanName = folderName
    .replace(/^(member|client|case|folder)\s*/i, '')
    .replace(/\s*(folder|files?|docs?|documents?)$/i, '')
    .trim();

  // Check for ClientID pattern and extract it
  const clientIdMatch = cleanName.match(/clientid:\s*(\d+)/i);
  const hasClientId = !!clientIdMatch;
  const clientId = clientIdMatch ? clientIdMatch[1] : undefined;
  
  // Remove ClientID from name for parsing
  if (hasClientId) {
    cleanName = cleanName.replace(/clientid:\s*\d+/i, '').trim();
  }

  // Handle various name formats
  let firstName = '';
  let lastName = '';
  let fullName = cleanName;

  // Try different parsing strategies
  if (cleanName.includes(',')) {
    // "Last, First" format
    const parts = cleanName.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      lastName = parts[0];
      firstName = parts[1];
      fullName = `${firstName} ${lastName}`;
    }
  } else if (cleanName.includes(' - ')) {
    // "First Last - Additional Info" format
    const mainPart = cleanName.split(' - ')[0].trim();
    const parts = mainPart.split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
      fullName = `${firstName} ${lastName}`;
    }
  } else {
    // Regular "First Last" format
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
      fullName = `${firstName} ${lastName}`;
    } else if (parts.length === 1) {
      // Single name - could be first or last
      firstName = parts[0];
      fullName = parts[0];
    }
  }

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    fullName: fullName.trim(),
    hasClientId,
    clientId
  };
}

// Enhanced similarity calculation
function calculateAdvancedSimilarity(str1: string, str2: string): number {
  const normalize = (str: string) => str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const norm1 = normalize(str1);
  const norm2 = normalize(str2);

  if (norm1 === norm2) return 1.0;

  // Levenshtein distance
  const levenshtein = (a: string, b: string): number => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    
    return matrix[b.length][a.length];
  };

  const maxLength = Math.max(norm1.length, norm2.length);
  if (maxLength === 0) return 1.0;

  const distance = levenshtein(norm1, norm2);
  const similarity = (maxLength - distance) / maxLength;

  // Bonus for exact word matches
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  const commonWords = words1.filter(word => words2.includes(word)).length;
  const totalWords = Math.max(words1.length, words2.length);
  const wordBonus = totalWords > 0 ? (commonWords / totalWords) * 0.2 : 0;

  return Math.min(similarity + wordBonus, 1.0);
}

// Advanced matching algorithm
function calculateMatchConfidence(
  driveFolder: DriveFolder, 
  caspioMember: CaspioMember
): { confidence: number; reasons: string[]; requiresManualReview: boolean } {
  const reasons: string[] = [];
  let confidence = 0;
  let requiresManualReview = false;

  const parsedName = parseNameFromFolder(driveFolder.name);

  // Client ID exact match (highest priority)
  if (parsedName.hasClientId && parsedName.clientId === caspioMember.Client_ID2) {
    confidence += 50;
    reasons.push(`Exact Client ID match: ${parsedName.clientId}`);
  }

  // Full name similarity
  const fullNameSim = calculateAdvancedSimilarity(parsedName.fullName, caspioMember.fullName);
  if (fullNameSim >= 0.95) {
    confidence += 35;
    reasons.push(`Exact name match (${(fullNameSim * 100).toFixed(1)}%)`);
  } else if (fullNameSim >= 0.8) {
    confidence += 25;
    reasons.push(`Strong name match (${(fullNameSim * 100).toFixed(1)}%)`);
    if (fullNameSim < 0.9) requiresManualReview = true;
  } else if (fullNameSim >= 0.6) {
    confidence += 15;
    reasons.push(`Moderate name match (${(fullNameSim * 100).toFixed(1)}%)`);
    requiresManualReview = true;
  }

  // Individual name component matches
  if (parsedName.firstName && caspioMember.First_Name) {
    const firstNameSim = calculateAdvancedSimilarity(parsedName.firstName, caspioMember.First_Name);
    if (firstNameSim >= 0.9) {
      confidence += 15;
      reasons.push(`First name match (${(firstNameSim * 100).toFixed(1)}%)`);
    } else if (firstNameSim >= 0.7) {
      confidence += 8;
      reasons.push(`Partial first name match (${(firstNameSim * 100).toFixed(1)}%)`);
      requiresManualReview = true;
    }
  }

  if (parsedName.lastName && caspioMember.Last_Name) {
    const lastNameSim = calculateAdvancedSimilarity(parsedName.lastName, caspioMember.Last_Name);
    if (lastNameSim >= 0.9) {
      confidence += 15;
      reasons.push(`Last name match (${(lastNameSim * 100).toFixed(1)}%)`);
    } else if (lastNameSim >= 0.7) {
      confidence += 8;
      reasons.push(`Partial last name match (${(lastNameSim * 100).toFixed(1)}%)`);
      requiresManualReview = true;
    }
  }

  // Check for name reversals
  const reversedName = `${caspioMember.Last_Name}, ${caspioMember.First_Name}`;
  const reversedSim = calculateAdvancedSimilarity(parsedName.fullName, reversedName);
  if (reversedSim >= 0.8) {
    confidence += 10;
    reasons.push(`Reversed name format match (${(reversedSim * 100).toFixed(1)}%)`);
  }

  // Partial name presence checks
  const folderLower = driveFolder.name.toLowerCase();
  if (caspioMember.First_Name && folderLower.includes(caspioMember.First_Name.toLowerCase())) {
    confidence += 5;
    reasons.push('First name found in folder');
  }
  if (caspioMember.Last_Name && folderLower.includes(caspioMember.Last_Name.toLowerCase())) {
    confidence += 5;
    reasons.push('Last name found in folder');
  }

  // Confidence thresholds for manual review
  if (confidence < 70 && confidence > 30) {
    requiresManualReview = true;
  }

  return { 
    confidence: Math.min(confidence, 100), 
    reasons,
    requiresManualReview: requiresManualReview || confidence < 80
  };
}

// Comprehensive Drive folder scanning
export const scanAllCalAIMFolders = onCall(async (request) => {
  try {
    console.log('🔍 Starting comprehensive CalAIM folder scan...');
    
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
    
    // Find CalAIM Members folder
    const calaimFoldersQuery = await drive.files.list({
      q: "name='CalAIM Members' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)',
    });
    
    if (!calaimFoldersQuery.data.files || calaimFoldersQuery.data.files.length === 0) {
      throw new HttpsError('not-found', 'CalAIM Members folder not found');
    }
    
    const calaimFolderId = calaimFoldersQuery.data.files[0].id!;
    console.log(`📁 Found CalAIM Members folder: ${calaimFolderId}`);
    
    // Get all member folders with detailed information
    const memberFoldersQuery = await drive.files.list({
      q: `'${calaimFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, parents, modifiedTime)',
      pageSize: 1000,
    });
    
    const folders: DriveFolder[] = [];
    
    for (const file of memberFoldersQuery.data.files || []) {
      const parsedName = parseNameFromFolder(file.name!);
      
      // Get folder contents count
      const contentsQuery = await drive.files.list({
        q: `'${file.id}' in parents`,
        fields: 'files(id, mimeType)',
        pageSize: 1000,
      });
      
      const contents = contentsQuery.data.files || [];
      const fileCount = contents.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length;
      const subfolderCount = contents.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
      
      folders.push({
        id: file.id!,
        name: file.name!,
        fullPath: `CalAIM Members/${file.name}`,
        parentId: calaimFolderId,
        parentName: 'CalAIM Members',
        extractedFirstName: parsedName.firstName,
        extractedLastName: parsedName.lastName,
        extractedFullName: parsedName.fullName,
        hasClientId: parsedName.hasClientId,
        extractedClientId: parsedName.clientId,
        fileCount,
        subfolderCount,
        lastModified: file.modifiedTime || undefined
      });
    }
    
    // Sort by name for easier review
    folders.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Scanned ${folders.length} member folders`);
    
    // Store results for later use
    await getDb().collection('system').doc('drive-scan-results').set({
      folders,
      scanDate: admin.firestore.FieldValue.serverTimestamp(),
      totalFolders: folders.length,
      foldersWithClientId: folders.filter(f => f.hasClientId).length,
      foldersWithoutClientId: folders.filter(f => !f.hasClientId).length
    });
    
    return {
      success: true,
      folders,
      stats: {
        totalFolders: folders.length,
        foldersWithClientId: folders.filter(f => f.hasClientId).length,
        foldersWithoutClientId: folders.filter(f => !f.hasClientId).length,
        totalFiles: folders.reduce((sum, f) => sum + (f.fileCount || 0), 0),
        totalSubfolders: folders.reduce((sum, f) => sum + (f.subfolderCount || 0), 0)
      },
      message: `Successfully scanned ${folders.length} CalAIM member folders`
    };
    
  } catch (error: any) {
    console.error('❌ Error scanning CalAIM folders:', error);
    throw new HttpsError('internal', `Failed to scan CalAIM folders: ${error.message}`);
  }
});

// Get all Caspio members with comprehensive data
export const getAllCaspioMembersComprehensive = onCall(async (request) => {
  try {
    console.log('🔍 Fetching comprehensive Caspio member data...');
    
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
    
    // Fetch all members with comprehensive fields
    const membersResponse = await fetch(
      `${config.baseUrl}/rest/v2/tables/CalAIM_Member_Table/records?q.select=Client_ID2,First_Name,Last_Name,memberMrn,memberCounty,Kaiser_Status,CalAIM_Status&q.pageSize=1000`,
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
        fullName: `${member.First_Name || ''} ${member.Last_Name || ''}`.trim(),
        memberMrn: member.memberMrn,
        memberCounty: member.memberCounty,
        Kaiser_Status: member.Kaiser_Status,
        CalAIM_Status: member.CalAIM_Status
      }));
    
    // Sort alphabetically by full name
    members.sort((a, b) => a.fullName.localeCompare(b.fullName));
    
    console.log(`✅ Found ${members.length} members in Caspio`);
    
    // Store results for later use
    await getDb().collection('system').doc('caspio-members-results').set({
      members,
      scanDate: admin.firestore.FieldValue.serverTimestamp(),
      totalMembers: members.length
    });
    
    return {
      success: true,
      members,
      stats: {
        totalMembers: members.length,
        membersWithMrn: members.filter(m => m.memberMrn).length,
        membersWithCounty: members.filter(m => m.memberCounty).length,
        kaiserMembers: members.filter(m => m.Kaiser_Status).length
      },
      message: `Successfully retrieved ${members.length} Caspio members`
    };
    
  } catch (error: any) {
    console.error('❌ Error fetching Caspio members:', error);
    throw new HttpsError('internal', `Failed to fetch Caspio members: ${error.message}`);
  }
});

// Generate comprehensive matching suggestions
export const generateComprehensiveMatching = onCall(async (request) => {
  try {
    console.log('🤖 Generating comprehensive matching suggestions...');
    
    const { folders, members, confidenceThreshold = 30 } = request.data;
    
    if (!folders || !members) {
      throw new HttpsError('invalid-argument', 'Both folders and members data required');
    }
    
    const suggestions: MatchSuggestion[] = [];
    const unmatchedFolders: DriveFolder[] = [];
    const unmatchedMembers: CaspioMember[] = [...members];
    
    // Track used members to prevent duplicate matches
    const usedMemberIds = new Set<string>();
    
    // Generate suggestions for each folder
    for (const folder of folders) {
      const folderSuggestions: Array<{
        member: CaspioMember;
        confidence: number;
        reasons: string[];
        requiresManualReview: boolean;
      }> = [];
      
      // Calculate confidence for each available member
      for (const member of members) {
        if (usedMemberIds.has(member.Client_ID2)) continue;
        
        const { confidence, reasons, requiresManualReview } = calculateMatchConfidence(folder, member);
        
        if (confidence >= confidenceThreshold) {
          folderSuggestions.push({ member, confidence, reasons, requiresManualReview });
        }
      }
      
      // Sort by confidence (highest first)
      folderSuggestions.sort((a, b) => b.confidence - a.confidence);
      
      if (folderSuggestions.length > 0) {
        const bestMatch = folderSuggestions[0];
        
        let matchType: 'exact' | 'fuzzy' | 'partial' | 'manual' = 'manual';
        if (bestMatch.confidence >= 95) matchType = 'exact';
        else if (bestMatch.confidence >= 80) matchType = 'fuzzy';
        else if (bestMatch.confidence >= 60) matchType = 'partial';
        
        suggestions.push({
          driveFolder: folder,
          caspioMember: bestMatch.member,
          confidence: bestMatch.confidence,
          matchType,
          reasons: bestMatch.reasons,
          requiresManualReview: bestMatch.requiresManualReview
        });
        
        // Mark member as used
        usedMemberIds.add(bestMatch.member.Client_ID2);
        
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
      exactMatches: suggestions.filter(s => s.matchType === 'exact').length,
      fuzzyMatches: suggestions.filter(s => s.matchType === 'fuzzy').length,
      partialMatches: suggestions.filter(s => s.matchType === 'partial').length,
      requiresReview: suggestions.filter(s => s.requiresManualReview).length,
      unmatchedFolders: unmatchedFolders.length,
      unmatchedMembers: unmatchedMembers.length
    };
    
    console.log(`✅ Generated ${suggestions.length} matching suggestions`);
    console.log(`📊 Stats:`, stats);
    
    // Store comprehensive results
    await getDb().collection('system').doc('matching-results').set({
      suggestions,
      unmatchedFolders,
      unmatchedMembers,
      stats,
      generatedDate: admin.firestore.FieldValue.serverTimestamp(),
      confidenceThreshold
    });
    
    return {
      success: true,
      suggestions,
      unmatchedFolders,
      unmatchedMembers,
      stats,
      message: `Generated ${suggestions.length} matching suggestions with ${stats.exactMatches} exact matches`
    };
    
  } catch (error: any) {
    console.error('❌ Error generating comprehensive matching:', error);
    throw new HttpsError('internal', `Failed to generate comprehensive matching: ${error.message}`);
  }
});

// Apply confirmed matches and update Caspio
export const applyConfirmedMatches = onCall(async (request) => {
  try {
    console.log('💾 Applying confirmed matches...');
    
    const { confirmedMatches } = request.data;
    
    if (!confirmedMatches || !Array.isArray(confirmedMatches)) {
      throw new HttpsError('invalid-argument', 'Confirmed matches array required');
    }
    
    const results = {
      applied: 0,
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
    
    // Process each confirmed match
    for (const match of confirmedMatches) {
      try {
        // Update Caspio record with Google Drive information
        const updateResponse = await fetch(
          `${config.baseUrl}/rest/v2/tables/CalAIM_Member_Table/records?q.where=Client_ID2='${match.caspioMember.Client_ID2}'`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              Google_Drive_Folder_ID: match.driveFolder.id,
              Google_Drive_Folder_Name: match.driveFolder.name,
              Drive_Sync_Status: 'Matched',
              Drive_Sync_Date: new Date().toISOString(),
              Drive_Match_Confidence: match.confidence,
              Drive_Match_Type: match.matchType,
              Drive_File_Count: match.driveFolder.fileCount || 0,
              Drive_Subfolder_Count: match.driveFolder.subfolderCount || 0
            }),
          }
        );
        
        if (updateResponse.ok) {
          results.applied++;
          results.details.push({
            folderId: match.driveFolder.id,
            folderName: match.driveFolder.name,
            clientId: match.caspioMember.Client_ID2,
            memberName: match.caspioMember.fullName,
            confidence: match.confidence,
            matchType: match.matchType,
            status: 'applied',
            fileCount: match.driveFolder.fileCount || 0
          });
        } else {
          results.errors++;
          results.details.push({
            folderId: match.driveFolder.id,
            folderName: match.driveFolder.name,
            clientId: match.caspioMember.Client_ID2,
            status: 'error',
            reason: `Caspio update failed: ${updateResponse.status}`
          });
        }
        
      } catch (error: any) {
        results.errors++;
        results.details.push({
          folderId: match.driveFolder?.id,
          folderName: match.driveFolder?.name,
          clientId: match.caspioMember?.Client_ID2,
          status: 'error',
          reason: error.message
        });
      }
    }
    
    console.log(`✅ Applied ${results.applied} matches, errors: ${results.errors}`);
    
    return {
      success: true,
      results,
      message: `Applied ${results.applied} matches successfully`
    };
    
  } catch (error: any) {
    console.error('❌ Error applying confirmed matches:', error);
    throw new HttpsError('internal', `Failed to apply confirmed matches: ${error.message}`);
  }
});