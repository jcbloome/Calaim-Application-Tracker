'use server';
/**
 * @fileOverview A server-side flow to grant admin privileges to a user.
 *
 * This flow handles the logic for finding an existing user by email or creating a new one,
 * and then creating the necessary Firestore documents to grant them admin rights.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/firebase/admin-init';

// Ensure the admin app is initialized
initializeAdminApp();

const GrantAdminRoleInputSchema = z.object({
  email: z.string().email().describe('The email address of the user to be granted admin privileges.'),
  firstName: z.string().describe('The first name of the user.'),
  lastName: z.string().describe('The last name of the user.'),
});
export type GrantAdminRoleInput = z.infer<typeof GrantAdminRoleInputSchema>;

const GrantAdminRoleOutputSchema = z.object({
  uid: z.string().describe('The UID of the user who was granted admin privileges.'),
  email: z.string().describe('The email of the user.'),
  message: z.string().describe('A confirmation message.'),
});
export type GrantAdminRoleOutput = z.infer<typeof GrantAdminRoleOutputSchema>;


/**
 * Public function to be called from the client.
 * This wraps the Genkit flow.
 */
export async function grantAdminRole(input: GrantAdminRoleInput): Promise<GrantAdminRoleOutput> {
  return grantAdminRoleFlow(input);
}


const grantAdminRoleFlow = ai.defineFlow(
  {
    name: 'grantAdminRoleFlow',
    inputSchema: GrantAdminRoleInputSchema,
    outputSchema: GrantAdminRoleOutputSchema,
  },
  async (input) => {
    const auth = getAuth(initializeAdminApp());
    const firestore = getFirestore(initializeAdminApp());
    const { email, firstName, lastName } = input;
    const displayName = `${firstName} ${lastName}`.trim();

    let uid: string;
    let userExists = false;

    try {
      const userRecord = await auth.getUserByEmail(email);
      uid = userRecord.uid;
      userExists = true;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // User doesn't exist, so create them.
        const newUserRecord = await auth.createUser({
          email: email,
          displayName: displayName,
          // A secure temporary password. User will need to reset this.
          password: `temp_${new Date().getTime()}`,
        });
        uid = newUserRecord.uid;
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    // Now, with the UID, create the necessary Firestore documents in a batch
    const userDocRef = firestore.collection('users').doc(uid);
    const adminRoleRef = firestore.collection('roles_admin').doc(uid);

    const batch = firestore.batch();

    // Create/update the user profile document
    batch.set(userDocRef, {
      id: uid,
      email: email,
      firstName: firstName,
      lastName: lastName,
      displayName: displayName,
    }, { merge: true });

    // Assign the admin role
    batch.set(adminRoleRef, { grantedAt: new Date() });

    await batch.commit();

    return {
      uid,
      email,
      message: userExists 
        ? `Successfully granted admin role to existing user ${email}.`
        : `Successfully created new user ${email} and granted admin role.`,
    };
  }
);
