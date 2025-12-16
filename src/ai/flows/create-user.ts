
'use server';

/**
 * @fileOverview Creates a user in Firebase Auth and Firestore, and assigns an admin role.
 * This flow is designed to be called from a secure, admin-only context.
 *
 * - createUser - A function that handles the user creation and role assignment process.
 * - CreateUserInput - The input type for the createUser function.
 * - CreateUserOutput - The return type for the createUser function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeAdminApp } from '@/firebase/admin-init';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const CreateUserInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

const CreateUserOutputSchema = z.object({
  uid: z.string().optional(),
  error: z.string().optional(),
});
export type CreateUserOutput = z.infer<typeof CreateUserOutputSchema>;

export async function createUser(input: CreateUserInput): Promise<CreateUserOutput> {
  return createUserFlow(input);
}

const createUserFlow = ai.defineFlow(
  {
    name: 'createUserFlow',
    inputSchema: CreateUserInputSchema,
    outputSchema: CreateUserOutputSchema,
  },
  async (input) => {
    try {
      const adminApp = initializeAdminApp();
      const adminAuth = getAuth(adminApp);
      const adminFirestore = getFirestore(adminApp);

      let uid: string;
      const displayName = `${input.firstName} ${input.lastName}`.trim();

      // 1. Check if user already exists in Firebase Auth
      try {
        const userRecord = await adminAuth.getUserByEmail(input.email);
        uid = userRecord.uid;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          // 2. If user does not exist, create them
          const tempPassword = Math.random().toString(36).slice(-8); // Generate a temporary password
          const newUserRecord = await adminAuth.createUser({
            email: input.email,
            displayName: displayName,
            password: tempPassword,
          });
          uid = newUserRecord.uid;
        } else {
          // Re-throw other auth errors
          throw error;
        }
      }
      
      // 3. Create or update user profile in 'users' collection
      const userDocRef = adminFirestore.collection('users').doc(uid);
      await userDocRef.set({
        id: uid,
        email: input.email,
        displayName: displayName,
        firstName: input.firstName,
        lastName: input.lastName,
      }, { merge: true });

      // 4. Assign admin role in 'roles_admin' collection
      const roleDocRef = adminFirestore.collection('roles_admin').doc(uid);
      await roleDocRef.set({
        uid: uid,
        addedOn: new Date(),
        role: 'admin',
      });

      return { uid };

    } catch (error: any) {
      console.error('Create User Flow Error:', error);
      return {
        error: error.message || 'An unexpected error occurred during user creation.',
      };
    }
  }
);
