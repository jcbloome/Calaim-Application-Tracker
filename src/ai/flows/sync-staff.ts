
'use server';
/**
 * @fileOverview A server-side flow to sync all Firebase Auth users and grant them admin roles.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/firebase/admin-init';

// Ensure the admin app is initialized
try {
    initializeAdminApp();
} catch (e) {
    console.error("CRITICAL: Firebase Admin SDK failed to initialize in sync-staff flow.", e);
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
    const auth = getAuth();
    const firestore = getFirestore();
    let usersProcessed = 0;
    
    const SUPER_ADMIN_EMAIL = 'jason@carehomefinders.com';

    try {
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

    } catch (error) {
        console.error('[syncStaffFlow] An error occurred:', error);
        throw new Error('Failed to sync staff roles. Please check server logs.');
    }
  }
);
