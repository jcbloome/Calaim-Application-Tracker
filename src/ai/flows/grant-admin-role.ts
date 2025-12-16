'use server';
/**
 * @fileOverview Grants admin role to a user, creating them if they don't exist.
 * This flow is designed to be called from a secure, super-admin-only context.
 * It uses the Firebase Admin SDK to handle all user creation and role assignment.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeAdminApp } from '@/firebase/admin-init';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

// --- Input and Output Schemas ---
const GrantAdminRoleInputSchema = z.object({
  email: z.string().email('A valid email is required.'),
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
});
export type GrantAdminRoleInput = z.infer<typeof GrantAdminRoleInputSchema>;

const GrantAdminRoleOutputSchema = z.object({
  uid: z.string(),
  email: z.string(),
  displayName: z.string(),
  error: z.string().optional(),
});
export type GrantAdminRoleOutput = z.infer<typeof GrantAdminRoleOutputSchema>;

// --- Exported Function for Client-Side Usage ---
export async function grantAdminRole(input: GrantAdminRoleInput): Promise<GrantAdminRoleOutput> {
  return grantAdminRoleFlow(input);
}


// --- The Genkit Flow Definition ---
const grantAdminRoleFlow = ai.defineFlow(
  {
    name: 'grantAdminRoleFlow',
    inputSchema: GrantAdminRoleInputSchema,
    outputSchema: GrantAdminRoleOutputSchema,
  },
  async ({ email, firstName, lastName }) => {
    try {
      const adminApp = initializeAdminApp();
      const adminAuth = getAuth(adminApp);
      const adminFirestore = getFirestore(adminApp);

      const displayName = `${firstName} ${lastName}`.trim();
      let userRecord: UserRecord;

      try {
        // 1. Check if the user already exists in Firebase Auth
        userRecord = await adminAuth.getUserByEmail(email);
        console.log(`User ${email} found in Auth with UID: ${userRecord.uid}`);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          console.log(`User ${email} not found in Auth. Creating a new user.`);
          // 2. If user doesn't exist, create them
          const tempPassword = randomBytes(16).toString('hex'); // Create a secure, random password
          userRecord = await adminAuth.createUser({
            email,
            displayName,
            password: tempPassword,
          });
          console.log(`Successfully created new user with UID: ${userRecord.uid}`);
        } else {
          // Re-throw other auth errors
          throw error;
        }
      }

      const uid = userRecord.uid;
      const batch = adminFirestore.batch();

      // 3. Create or update their profile in the 'users' collection
      const userDocRef = adminFirestore.collection('users').doc(uid);
      batch.set(userDocRef, {
        id: uid,
        email,
        firstName,
        lastName,
        displayName,
      }, { merge: true }); // Use merge to avoid overwriting existing data if any
      
      console.log(`Preparing to write user profile for UID: ${uid}`);

      // 4. Grant the 'admin' role in the 'roles_admin' collection
      const adminRoleDocRef = adminFirestore.collection('roles_admin').doc(uid);
      batch.set(adminRoleDocRef, {
        uid: uid,
        grantedBy: 'SuperAdminFlow',
        grantedAt: new Date().toISOString(),
      });
      console.log(`Preparing to grant admin role for UID: ${uid}`);

      // 5. Commit all database operations
      await batch.commit();
      console.log(`Successfully committed profile and role for UID: ${uid}`);

      return { uid, email, displayName };

    } catch (error: any)
       {
      console.error('grantAdminRoleFlow Error:', error);
      let errorMessage = error.message || 'An unexpected error occurred.';
       // Specifically catch the token error to provide a more helpful message
      if (error.message?.includes('Error fetching access token')) {
          errorMessage = `Credential setup failed on the server. Please ensure Application Default Credentials are configured correctly for the environment. Details: ${error.message}`;
      }
      return {
        uid: '',
        email: '',
        displayName: '',
        error: `Failed to grant admin role: ${errorMessage}`,
      };
    }
  }
);
