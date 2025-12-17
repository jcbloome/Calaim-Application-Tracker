
'use server';
/**
 * @fileOverview A server-side flow to sync all Firebase Auth users and grant them admin roles.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const SyncStaffOutputSchema = z.object({
  message: z.string().describe('A confirmation message summarizing the operation.'),
});
export type SyncStaffOutput = z.infer<typeof SyncStaffOutputSchema>;


/**
 * Public function to be called from the client.
 * This wraps the Genkit flow.
 */
export async function syncStaff(): Promise<SyncStaffOutput> {
  console.log(`[syncStaff] Starting flow.`);
  return syncStaffFlow();
}


const syncStaffFlow = ai.defineFlow(
  {
    name: 'syncStaffFlow',
    outputSchema: SyncStaffOutputSchema,
  },
  async () => {
    console.log('[syncStaffFlow] Entered defineFlow execution.');
    
    try {
        const auth = admin.auth();
        const firestore = admin.firestore();
        
        let usersProcessed = 0;
        
        const SUPER_ADMIN_EMAIL = 'jason@carehomefinders.com';

        const listUsersResult = await auth.listUsers(1000); // Adjust page size if needed

        const batch = firestore.batch();

        for (const userRecord of listUsersResult.users) {
            const { uid, email, displayName } = userRecord;
            if (!email) continue;
            
            // Skip the super admin
            if (email === SUPER_ADMIN_EMAIL) {
                console.log(`[syncStaffFlow] Skipping super admin: ${email}`);
                continue;
            }
            
            console.log(`[syncStaffFlow] Processing user: ${email} (${uid})`);
            usersProcessed++;

            // 1. Ensure user profile exists in 'users' collection
            const userDocRef = firestore.collection('users').doc(uid);
            const nameParts = displayName?.split(' ') || [];
            const firstName = nameParts[0] || 'Unknown';
            const lastName = nameParts.slice(1).join(' ') || 'User';

            batch.set(userDocRef, {
                id: uid,
                email: email,
                firstName: firstName,
                lastName: lastName,
                displayName: displayName || `${firstName} ${lastName}`,
            }, { merge: true });

            // 2. Grant admin role in 'roles_admin' collection
            const adminRoleRef = firestore.collection('roles_admin').doc(uid);
            batch.set(adminRoleRef, { grantedAt: new Date(), uid: uid });
        }

        await batch.commit();
        console.log('[syncStaffFlow] Batch commit successful.');

        const message = `Successfully processed ${usersProcessed} users and assigned them the 'Admin' role.`;
        console.log(`[syncStaffFlow] Flow successful. ${message}`);
        return { message };

    } catch (error: any) {
        console.error('[syncStaffFlow] An error occurred during the sync process:', error);
        throw new Error(`Failed to sync staff roles. Server error: ${error.message}`);
    }
  }
);
