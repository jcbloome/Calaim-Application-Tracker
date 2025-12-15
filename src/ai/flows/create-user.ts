
'use server';

/**
 * @fileOverview An AI flow to create a user in Firebase Authentication and send a password reset email.
 * - createUser - A function that handles user creation.
 * - CreateUserInput - The input type for the createUser function.
 * - CreateUserOutput - The return type for the createUser function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeAdminApp } from '@/firebase/admin-init';
import { getAuth } from 'firebase-admin/auth';

const CreateUserInputSchema = z.object({
  email: z.string().email().describe('The email address for the new user.'),
  displayName: z.string().describe('The display name for the new user.'),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

const CreateUserOutputSchema = z.object({
  uid: z.string().optional().describe('The unique ID of the newly created user.'),
  error: z.string().optional().describe('An error message if the creation failed.'),
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
    // This flow is currently non-functional in the execution environment
    // due to server-side authentication issues.
    // It will return a specific error message to be handled by the client.
    return {
      error: 'Automatic user creation is currently unavailable. Please create the user manually in the Firebase console and then assign their role here.',
    };

    /*
    // The original implementation is commented out below.
    try {
      const adminApp = initializeAdminApp();
      const adminAuth = getAuth(adminApp);

      // 1. Create the user in Firebase Authentication
      const userRecord = await adminAuth.createUser({
        email: input.email,
        displayName: input.displayName,
        emailVerified: false, // User will verify by setting password
      });

      // 2. Generate and send password reset email so the user can set their password
      const link = await adminAuth.generatePasswordResetLink(input.email);
      // In a real app, you would use a service like Resend to email this link.
      // For this demo, we'll just log it to the server console.
      console.log(`Password reset link for ${input.email}: ${link}`);

      return { uid: userRecord.uid };
    } catch (error: any) {
      console.error("Error in createUserFlow:", error);
      // Firebase errors have a `code` property that's useful
      const errorMessage = error.code ? `Auth error (${error.code})` : error.message;
      return { error: errorMessage || 'An unknown error occurred during user creation.' };
    }
    */
  }
);
