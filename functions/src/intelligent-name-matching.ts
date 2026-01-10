import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Define secrets for Google Drive API
const googleDriveClientId = defineSecret("GOOGLE_DRIVE_CLIENT_ID");
const googleDriveClientSecret = defineSecret("GOOGLE_DRIVE_CLIENT_SECRET");

interface DriveFolder {
  id: string;
  name: string;
  extractedFirstName: string;
  extractedLastName: string;
  clientID?: string;
  hasClientID: boolean;
  fileCount?: number;
}

interface CaspioMember {
  Record_ID: string;
  client_ID2: string;
  Senior_First: string;
  Senior_Last: string;
  Member_County: string;
  CalAIM_Status: string;
  Kaiser_Status: string;
  CalAIM_MCP: string;
}

interface MatchResult {
  driveFolder: DriveFolder;
  caspioMatch?: CaspioMember;
  matchScore: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  confidence: 'high' | 'medium' | 'low';
  alternativeMatches?: Array<{
    member: CaspioMember;
    score: number;
  }>;
}

// Intelligent name matching with fuzzy logic
export const matchDriveFoldersWithCaspio = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    console.log('🧠 Starting intelligent name matching for Google Drive folders...');

    // Step 1: Get all CalAIM members from Caspio
    const caspioMembers = await getAllCaspioMembers();
    console.log(`📊 Retrieved ${caspioMembers.length} members from Caspio`);

    // Step 2: Get all folders from Google Drive (mock for now)
    const driveFolders = await getAllDriveFolders();
    console.log(`📁 Found ${driveFolders.length} folders in Google Drive`);

    // Step 3: Perform intelligent matching
    const matchResults: MatchResult[] = [];
    
    for (const folder of driveFolders) {
      const matchResult = await findBestMatch(folder, caspioMembers);
      matchResults.push(matchResult);
    }

    // Step 4: Categorize results
    const exactMatches = matchResults.filter(r => r.matchType === 'exact');
    const fuzzyMatches = matchResults.filter(r => r.matchType === 'fuzzy' && r.confidence === 'high');
    const partialMatches = matchResults.filter(r => r.matchType === 'partial' || r.confidence === 'medium');
    const noMatches = matchResults.filter(r => r.matchType === 'none');

    console.log(`✅ Matching complete: ${exactMatches.length} exact, ${fuzzyMatches.length} fuzzy, ${partialMatches.length} partial, ${noMatches.length} no match`);

    return {
      success: true,
      message: `Matched ${exactMatches.length + fuzzyMatches.length} folders with high confidence`,
      results: {
        exactMatches,
        fuzzyMatches,
        partialMatches,
        noMatches,
        summary: {
          totalFolders: driveFolders.length,
          totalMembers: caspioMembers.length,
          exactMatches: exactMatches.length,
          fuzzyMatches: fuzzyMatches.length,
          partialMatches: partialMatches.length,
          noMatches: noMatches.length,
          readyToImport: exactMatches.length + fuzzyMatches.length
        }
      }
    };

  } catch (error: any) {
    console.error('❌ Error in intelligent name matching:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Matching failed: ${error.message}`);
  }
});

// Auto-import high-confidence matches
export const autoImportHighConfidenceMatches = onCall({
  secrets: [googleDriveClientId, googleDriveClientSecret]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { matchResults } = request.data;

    if (!matchResults) {
      throw new HttpsError('invalid-argument', 'Match results are required');
    }

    console.log('🚀 Starting auto-import of high-confidence matches...');

    const importResults = [];
    let successCount = 0;
    let errorCount = 0;

    // Import exact matches and high-confidence fuzzy matches
    const highConfidenceMatches = matchResults.filter((result: MatchResult) => 
      (result.matchType === 'exact') || 
      (result.matchType === 'fuzzy' && result.confidence === 'high')
    );

    for (const match of highConfidenceMatches) {
      try {
        // Simulate file import process
        const importResult = await importFolderToFirebase(match);
        importResults.push({
          ...importResult,
          folderName: match.driveFolder.name,
          clientID: match.caspioMatch?.client_ID2,
          memberName: `${match.caspioMatch?.Senior_First} ${match.caspioMatch?.Senior_Last}`
        });
        successCount++;
        
        console.log(`✅ Imported: ${match.driveFolder.name} → ${match.caspioMatch?.client_ID2}`);
        
      } catch (importError) {
        console.error(`❌ Failed to import ${match.driveFolder.name}:`, importError);
        importResults.push({
          success: false,
          folderName: match.driveFolder.name,
          error: importError.message
        });
        errorCount++;
      }
    }

    console.log(`🎉 Auto-import complete: ${successCount} successful, ${errorCount} failed`);

    return {
      success: true,
      message: `Auto-imported ${successCount} folders successfully`,
      results: {
        importResults,
        summary: {
          attempted: highConfidenceMatches.length,
          successful: successCount,
          failed: errorCount
        }
      }
    };

  } catch (error: any) {
    console.error('❌ Error in auto-import:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Auto-import failed: ${error.message}`);
  }
});

// Helper function to get all Caspio members
async function getAllCaspioMembers(): Promise<CaspioMember[]> {
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
    
    // Get all members with pagination
    const membersTable = 'CalAIM_tbl_Members';
    let allMembers: CaspioMember[] = [];
    let pageNumber = 1;
    const pageSize = 1000;
    let hasMoreData = true;
    
    while (hasMoreData) {
      const fetchUrl = `${baseUrl}/tables/${membersTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      
      const membersResponse = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (!membersResponse.ok) {
        throw new Error(`Failed to fetch members: ${membersResponse.status}`);
      }
      
      const membersData = await membersResponse.json();
      const members = membersData.Result || [];
      
      if (members.length === 0) {
        hasMoreData = false;
      } else {
        allMembers = allMembers.concat(members);
        pageNumber++;
        
        // Safety limit
        if (pageNumber > 50) {
          console.warn('⚠️ Reached maximum page limit (50), stopping pagination');
          hasMoreData = false;
        }
      }
    }
    
    return allMembers;
    
  } catch (error) {
    console.error('Error fetching Caspio members:', error);
    throw error;
  }
}

// Helper function to get all Drive folders (mock implementation)
async function getAllDriveFolders(): Promise<DriveFolder[]> {
  // Mock Google Drive folders for demonstration
  // In real implementation, this would use Google Drive API
  const mockFolders = [
    'John Smith - SNF Transition',
    'Maria Garcia - SNF Diversion', 
    'Robert Johnson - Documents',
    'Jennifer Williams - CalAIM',
    'Michael Brown - Transition Planning',
    'Sarah Davis - SNF Diversion',
    'David Miller - Health Net',
    'Lisa Wilson - Kaiser Transition',
    'James Moore - SNF Planning',
    'Patricia Taylor - CalAIM Documents',
    'Christopher Anderson - Discharge Planning',
    'Nancy Thomas - SNF Transition',
    'Daniel Jackson - Kaiser Documents',
    'Betty White - Health Planning',
    'Mark Harris - Transition Services',
    'Helen Martin - SNF Diversion',
    'Steven Thompson - CalAIM Planning',
    'Dorothy Garcia - Kaiser Services',
    'Paul Martinez - SNF Documents',
    'Ruth Robinson - Transition Planning',
    // Some with ClientID tags
    'William Clark - SNF Transition ClientID: 2001',
    'Mary Rodriguez - CalAIM Planning ClientID: 2002',
    'Charles Lewis - Kaiser Documents ClientID: 2003'
  ];

  return mockFolders.map((name, index) => {
    const clientIDMatch = name.match(/ClientID:\s*(\d+)/i);
    const clientID = clientIDMatch ? `CL${clientIDMatch[1].padStart(6, '0')}` : undefined;
    
    // Remove ClientID from name for parsing
    const cleanName = name.replace(/\s*ClientID:\s*\d+/i, '').trim();
    
    // Extract first and last name (everything before the first " - ")
    const nameMatch = cleanName.match(/^([^-]+)/);
    const fullName = nameMatch ? nameMatch[1].trim() : 'Unknown Unknown';
    const nameParts = fullName.split(' ');
    
    return {
      id: `folder_${index}`,
      name,
      extractedFirstName: nameParts[0] || 'Unknown',
      extractedLastName: nameParts[nameParts.length - 1] || 'Unknown',
      clientID,
      hasClientID: !!clientID,
      fileCount: Math.floor(Math.random() * 50) + 5
    };
  });
}

// Intelligent matching algorithm with fuzzy logic
async function findBestMatch(folder: DriveFolder, members: CaspioMember[]): Promise<MatchResult> {
  const scores: Array<{ member: CaspioMember; score: number; reasons: string[] }> = [];
  
  for (const member of members) {
    const score = calculateMatchScore(folder, member);
    if (score.total > 0) {
      scores.push({
        member,
        score: score.total,
        reasons: score.reasons
      });
    }
  }
  
  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  
  const bestMatch = scores[0];
  const alternativeMatches = scores.slice(1, 4); // Top 3 alternatives
  
  if (!bestMatch) {
    return {
      driveFolder: folder,
      matchScore: 0,
      matchType: 'none',
      confidence: 'low'
    };
  }
  
  // Determine match type and confidence
  let matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  let confidence: 'high' | 'medium' | 'low';
  
  if (bestMatch.score >= 100) {
    matchType = 'exact';
    confidence = 'high';
  } else if (bestMatch.score >= 80) {
    matchType = 'fuzzy';
    confidence = 'high';
  } else if (bestMatch.score >= 60) {
    matchType = 'fuzzy';
    confidence = 'medium';
  } else if (bestMatch.score >= 40) {
    matchType = 'partial';
    confidence = 'medium';
  } else {
    matchType = 'partial';
    confidence = 'low';
  }
  
  return {
    driveFolder: folder,
    caspioMatch: bestMatch.member,
    matchScore: bestMatch.score,
    matchType,
    confidence,
    alternativeMatches: alternativeMatches.map(alt => ({
      member: alt.member,
      score: alt.score
    }))
  };
}

// Advanced scoring algorithm
function calculateMatchScore(folder: DriveFolder, member: CaspioMember): { total: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  const folderFirst = normalizeString(folder.extractedFirstName);
  const folderLast = normalizeString(folder.extractedLastName);
  const memberFirst = normalizeString(member.Senior_First || '');
  const memberLast = normalizeString(member.Senior_Last || '');
  
  // Exact name matches (highest score)
  if (folderFirst === memberFirst && folderLast === memberLast) {
    score += 100;
    reasons.push('Exact name match');
    return { total: score, reasons };
  }
  
  // First name matching
  if (folderFirst === memberFirst) {
    score += 40;
    reasons.push('Exact first name match');
  } else if (isNickname(folderFirst, memberFirst)) {
    score += 35;
    reasons.push('Nickname match for first name');
  } else if (levenshteinDistance(folderFirst, memberFirst) <= 2) {
    score += 25;
    reasons.push('Similar first name (fuzzy match)');
  } else if (folderFirst.includes(memberFirst) || memberFirst.includes(folderFirst)) {
    score += 20;
    reasons.push('Partial first name match');
  }
  
  // Last name matching
  if (folderLast === memberLast) {
    score += 40;
    reasons.push('Exact last name match');
  } else if (levenshteinDistance(folderLast, memberLast) <= 2) {
    score += 30;
    reasons.push('Similar last name (fuzzy match)');
  } else if (folderLast.includes(memberLast) || memberLast.includes(folderLast)) {
    score += 25;
    reasons.push('Partial last name match');
  }
  
  // Bonus for existing ClientID match
  if (folder.hasClientID && folder.clientID === member.client_ID2) {
    score += 50;
    reasons.push('ClientID match');
  }
  
  // Penalty for very common names without strong matches
  if (isCommonName(folderFirst) && isCommonName(folderLast) && score < 60) {
    score -= 10;
    reasons.push('Common name penalty');
  }
  
  return { total: Math.max(0, score), reasons };
}

// Helper functions
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z]/g, '');
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

function isNickname(name1: string, name2: string): boolean {
  const nicknames: Record<string, string[]> = {
    'william': ['bill', 'billy', 'will', 'willie'],
    'robert': ['bob', 'bobby', 'rob', 'robbie'],
    'richard': ['rick', 'ricky', 'dick', 'rich'],
    'james': ['jim', 'jimmy', 'jamie'],
    'john': ['jack', 'johnny', 'jon'],
    'michael': ['mike', 'mickey', 'mick'],
    'david': ['dave', 'davy'],
    'daniel': ['dan', 'danny'],
    'christopher': ['chris', 'christie'],
    'matthew': ['matt', 'matty'],
    'anthony': ['tony'],
    'elizabeth': ['liz', 'beth', 'betty', 'eliza'],
    'patricia': ['pat', 'patty', 'tricia'],
    'jennifer': ['jen', 'jenny', 'jenn'],
    'maria': ['mary'],
    'susan': ['sue', 'susie', 'suzy'],
    'margaret': ['maggie', 'meg', 'peggy'],
    'dorothy': ['dot', 'dotty'],
    'catherine': ['cathy', 'kate', 'katie']
  };
  
  const n1 = normalizeString(name1);
  const n2 = normalizeString(name2);
  
  return (nicknames[n1] && nicknames[n1].includes(n2)) ||
         (nicknames[n2] && nicknames[n2].includes(n1));
}

function isCommonName(name: string): boolean {
  const commonNames = [
    'john', 'mary', 'james', 'patricia', 'robert', 'jennifer', 'michael', 'linda',
    'william', 'elizabeth', 'david', 'barbara', 'richard', 'susan', 'joseph', 'jessica'
  ];
  return commonNames.includes(normalizeString(name));
}

// Mock import function
async function importFolderToFirebase(match: MatchResult): Promise<any> {
  // Simulate import process
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Mock success/failure
  if (Math.random() > 0.1) { // 90% success rate
    return {
      success: true,
      filesImported: match.driveFolder.fileCount || 0,
      clientID: match.caspioMatch?.client_ID2,
      firebasePath: `members/${match.caspioMatch?.client_ID2}/documents/`
    };
  } else {
    throw new Error('Mock import failure for testing');
  }
}