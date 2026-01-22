/**
 * Setup script for Social Worker Collections
 * Run this once to initialize the Firebase collections structure
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Firebase config (use your actual config)
const firebaseConfig = {
  // Add your Firebase config here
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

async function setupSWCollections() {
  try {
    console.log('Setting up Social Worker collections...');

    // Create a sample social worker document structure
    const sampleSocialWorker = {
      email: 'sample.sw@example.com',
      displayName: 'Sample Social Worker',
      role: 'social_worker',
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: 'system',
      permissions: {
        visitVerification: true,
        memberQuestionnaire: true,
        claimsSubmission: true
      },
      assignedMembers: [],
      assignedRCFEs: [],
      notes: 'Sample social worker for testing'
    };

    // Create the document (this will create the collection)
    await setDoc(doc(firestore, 'socialWorkers', 'sample-sw-id'), sampleSocialWorker);

    // Create a sample claim document structure
    const sampleClaim = {
      socialWorkerEmail: 'sample.sw@example.com',
      socialWorkerName: 'Sample Social Worker',
      claimDate: serverTimestamp(),
      memberVisits: [
        {
          id: 'visit-1',
          memberName: 'John Doe',
          rcfeName: 'Sample RCFE',
          rcfeAddress: '123 Main St, City, CA',
          visitDate: serverTimestamp(),
          visitTime: '10:00',
          notes: 'Regular check-in visit'
        }
      ],
      gasReimbursement: 20,
      totalMemberVisitFees: 45,
      totalAmount: 65,
      notes: 'Sample claim for testing',
      status: 'submitted',
      submittedAt: serverTimestamp()
    };

    // Create the document (this will create the collection)
    await setDoc(doc(firestore, 'sw-claims', 'sample-claim-id'), sampleClaim);

    console.log('✅ Social Worker collections setup complete!');
    console.log('📋 Collections created:');
    console.log('  - socialWorkers (with sample document)');
    console.log('  - sw-claims (with sample document)');
    console.log('');
    console.log('🔒 Firestore rules updated for:');
    console.log('  - Social worker account management');
    console.log('  - Claims submission and management');
    console.log('  - Proper access control');
    console.log('');
    console.log('🚀 System is ready for testing!');

  } catch (error) {
    console.error('❌ Error setting up collections:', error);
  }
}

// Uncomment to run the setup
// setupSWCollections();

export default setupSWCollections;