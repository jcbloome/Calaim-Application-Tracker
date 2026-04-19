import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { buildCaspioConfig, getCaspioAccessTokenFromConfig } from "./caspio-auth";

function getCaspioRuntimeConfig() {
  return buildCaspioConfig(
    process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/integrations/rest/v3',
    process.env.CASPIO_CLIENT_ID || '',
    process.env.CASPIO_CLIENT_SECRET || ''
  );
}

export const checkForDuplicateClients = onCall(async (request) => {
  try {
    const { firstName, lastName, email, phone, dob, currentClientId } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!firstName || !lastName) {
      throw new HttpsError('invalid-argument', 'First name and last name are required');
    }
    
    console.log(`🔍 Checking for duplicates: ${firstName} ${lastName}`);
    
    const matches: any[] = [];
    const recommendations: string[] = [];
    
    // Check Firestore for duplicates
    const db = admin.firestore();
    const firestoreQuery = db.collection('applications')
      .where('memberFirstName', '==', firstName)
      .where('memberLastName', '==', lastName);
    
    const firestoreResults = await firestoreQuery.get();
    
    firestoreResults.forEach(doc => {
      const data = doc.data();
      if (data.client_ID2 !== currentClientId) {
        const similarity = calculateSimilarity(
          { firstName, lastName, email, phone, dob },
          { 
            firstName: data.memberFirstName, 
            lastName: data.memberLastName, 
            email: data.memberEmail, 
            phone: data.memberPhone, 
            dob: data.memberDob 
          }
        );
        
        matches.push({
          id: doc.id,
          source: 'firestore',
          memberName: `${data.memberFirstName} ${data.memberLastName}`,
          clientId: data.client_ID2,
          email: data.memberEmail,
          phone: data.memberPhone,
          dob: data.memberDob,
          similarity,
          status: data.status
        });
      }
    });
    
    // Check Caspio for duplicates
    const { restBaseUrl: baseUrl } = getCaspioRuntimeConfig();
    
    try {
      const accessToken = await getCaspioAccessTokenFromConfig(getCaspioRuntimeConfig());
      
      const membersTable = 'CalAIM_tbl_Members';
      const searchUrl = `${baseUrl}/tables/${membersTable}/records?q.where=Senior_First='${firstName}' AND Senior_Last='${lastName}'`;
      
      const caspioResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (caspioResponse.ok) {
        const caspioResult = await caspioResponse.json();
        if (caspioResult.Result) {
          caspioResult.Result.forEach((record: any) => {
            if (record.client_ID2 !== currentClientId) {
              const similarity = calculateSimilarity(
                { firstName, lastName, email, phone, dob },
                { 
                  firstName: record.Senior_First, 
                  lastName: record.Senior_Last, 
                  email: record.Member_Email, 
                  phone: record.Member_Phone, 
                  dob: record.Member_DOB 
                }
              );
              
              matches.push({
                id: record.client_ID2 || 'unknown',
                source: 'caspio',
                memberName: `${record.Senior_First} ${record.Senior_Last}`,
                clientId: record.client_ID2,
                email: record.Member_Email,
                phone: record.Member_Phone,
                dob: record.Member_DOB,
                similarity,
                status: record.CalAIM_Status
              });
            }
          });
        }
      }
    } catch {
      // best effort duplicate lookup in Caspio
    }
    
    // Generate recommendations
    if (matches.length > 0) {
      const highSimilarity = matches.filter(m => m.similarity >= 0.9);
      const mediumSimilarity = matches.filter(m => m.similarity >= 0.7 && m.similarity < 0.9);
      
      if (highSimilarity.length > 0) {
        recommendations.push('High similarity matches found - likely the same person');
        recommendations.push('Consider merging records to avoid duplicates');
      }
      
      if (mediumSimilarity.length > 0) {
        recommendations.push('Medium similarity matches - verify if same person');
        recommendations.push('Check additional details like DOB and contact info');
      }
      
      recommendations.push('Ensure only one client_ID2 per person across all systems');
    }
    
    const duplicateCheck = {
      hasDuplicates: matches.length > 0,
      matches: matches.sort((a, b) => b.similarity - a.similarity),
      recommendations,
      canProceed: matches.filter(m => m.similarity >= 0.9).length === 0
    };
    
    console.log(`✅ Duplicate check completed: ${matches.length} potential duplicates found`);
    
    return {
      success: true,
      duplicateCheck
    };
    
  } catch (error: any) {
    console.error('❌ Error checking duplicates:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Duplicate check failed: ${error.message}`);
  }
});

export const resolveDuplicateClients = onCall(async (request) => {
  try {
    const { action, currentMember, selectedMatch, allMatches } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!action || !currentMember) {
      throw new HttpsError('invalid-argument', 'Action and current member data required');
    }
    
    console.log(`🔄 Resolving duplicate: ${action}`);
    
    const db = admin.firestore();
    let resolvedClientId = currentMember.client_ID2;
    let message = '';
    
    if (action === 'merge' && selectedMatch) {
      // Merge records - use existing client_ID2 from selected match
      resolvedClientId = selectedMatch.clientId;
      
      // Update current application to use existing client_ID2
      if (currentMember.applicationId) {
        await db.collection('applications').doc(currentMember.applicationId).update({
          client_ID2: resolvedClientId,
          mergedFrom: currentMember.client_ID2,
          mergedAt: admin.firestore.FieldValue.serverTimestamp(),
          mergedBy: request.auth.uid
        });
      }
      
      // Log the merge for audit trail
      await db.collection('duplicate-resolutions').add({
        action: 'merge',
        fromClientId: currentMember.client_ID2,
        toClientId: resolvedClientId,
        memberName: `${currentMember.memberFirstName} ${currentMember.memberLastName}`,
        resolvedBy: request.auth.uid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        selectedMatch,
        allMatches
      });
      
      message = `Records merged successfully. Using existing client ID: ${resolvedClientId}`;
      
    } else if (action === 'keep_separate') {
      // Keep separate - generate new unique client_ID2 if needed
      if (!currentMember.client_ID2) {
        resolvedClientId = await generateUniqueClientId();
        
        if (currentMember.applicationId) {
          await db.collection('applications').doc(currentMember.applicationId).update({
            client_ID2: resolvedClientId,
            duplicateResolution: 'keep_separate',
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            resolvedBy: request.auth.uid
          });
        }
      }
      
      // Log the resolution
      await db.collection('duplicate-resolutions').add({
        action: 'keep_separate',
        clientId: resolvedClientId,
        memberName: `${currentMember.memberFirstName} ${currentMember.memberLastName}`,
        resolvedBy: request.auth.uid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        allMatches
      });
      
      message = `Keeping records separate. Client ID: ${resolvedClientId}`;
    }
    
    console.log(`✅ Duplicate resolved: ${action} - ${resolvedClientId}`);
    
    return {
      success: true,
      message,
      clientId: resolvedClientId,
      action
    };
    
  } catch (error: any) {
    console.error('❌ Error resolving duplicate:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Duplicate resolution failed: ${error.message}`);
  }
});

// Duplicate prevention helpers

function calculateSimilarity(person1: any, person2: any): number {
  let score = 0;
  let factors = 0;
  
  // Name similarity (most important)
  if (person1.firstName && person2.firstName) {
    score += person1.firstName.toLowerCase() === person2.firstName.toLowerCase() ? 0.4 : 0;
    factors += 0.4;
  }
  
  if (person1.lastName && person2.lastName) {
    score += person1.lastName.toLowerCase() === person2.lastName.toLowerCase() ? 0.4 : 0;
    factors += 0.4;
  }
  
  // Email similarity
  if (person1.email && person2.email) {
    score += person1.email.toLowerCase() === person2.email.toLowerCase() ? 0.1 : 0;
    factors += 0.1;
  }
  
  // Phone similarity
  if (person1.phone && person2.phone) {
    const phone1 = person1.phone.replace(/\D/g, '');
    const phone2 = person2.phone.replace(/\D/g, '');
    score += phone1 === phone2 ? 0.05 : 0;
    factors += 0.05;
  }
  
  // DOB similarity
  if (person1.dob && person2.dob) {
    score += person1.dob === person2.dob ? 0.05 : 0;
    factors += 0.05;
  }
  
  return factors > 0 ? score / factors : 0;
}

async function generateUniqueClientId(): Promise<string> {
  const db = admin.firestore();
  const year = new Date().getFullYear();
  let counter = 1;
  let clientId = '';
  let isUnique = false;
  
  while (!isUnique) {
    clientId = `CALAIM-${year}-${counter.toString().padStart(3, '0')}`;
    
    // Check Firestore
    const firestoreCheck = await db.collection('applications')
      .where('client_ID2', '==', clientId)
      .limit(1)
      .get();
    
    if (firestoreCheck.empty) {
      // Check Caspio
      const { restBaseUrl: baseUrl } = getCaspioRuntimeConfig();
      
      try {
        const accessToken = await getCaspioAccessTokenFromConfig(getCaspioRuntimeConfig());
          
        const membersTable = 'CalAIM_tbl_Members';
        const searchUrl = `${baseUrl}/tables/${membersTable}/records?q.where=client_ID2='${clientId}'`;
        
        const caspioResponse = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (caspioResponse.ok) {
          const caspioResult = await caspioResponse.json();
          if (!caspioResult.Result || caspioResult.Result.length === 0) {
            isUnique = true;
          }
        }
      } catch (error) {
        console.error('Error checking Caspio for unique ID:', error);
        // If Caspio check fails, assume unique for now
        isUnique = true;
      }
    }
    
    if (!isUnique) {
      counter++;
    }
  }
  
  return clientId;
}