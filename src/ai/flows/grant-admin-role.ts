
'use server';
/**
 * @fileOverview A server-side flow to grant admin privileges to a user.
 * It securely handles user lookup, creation, and role assignment.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeAdminApp } from '@/firebase/admin-init';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const GrantAdminRoleInputSchema = z.object({
  email: z.string().email().describe('The email address of the user to grant admin privileges to.'),
  firstName: z.string().describe("The user's first name."),
  lastName: z.string().describe("The user's last name."),
});
export type GrantAdminRoleInput = z.infer<typeof GrantAdminRoleInputSchema>;

const GrantAdminRoleOutputSchema = z.object({
  success: z.boolean(),
  uid: z.string().optional(),
  displayName: z.string().optional(),
  error: z.string().optional(),
});
export type GrantAdminRoleOutput = z.infer<typeof GrantAdminRoleOutputSchema>;


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
    try {
        const adminApp = initializeAdminApp();
        const adminAuth = getAuth(adminApp);
        const adminFirestore = getFirestore(adminApp);
        const { email, firstName, lastName } = input;
        const displayName = `${firstName} ${lastName}`.trim();
        let uid: string;

        // 1. Look up user by email
        try {
            const userRecord = await adminAuth.getUserByEmail(email);
            uid = userRecord.uid;
            console.log(`Found existing user: ${email} with UID: ${uid}`);
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                // 2. If user doesn't exist, create them
                console.log(`User ${email} not found. Creating a new user.`);
                const newUserRecord = await adminAuth.createUser({
                    email,
                    displayName,
                    // Note: A temporary or no password is set. The user must use
                    // the "Forgot Password" flow to set their password to log in.
                    password: `temp-password-${Date.now()}` 
                });
                uid = newUserRecord.uid;
            } else {
                // For other errors (e.g., network issues), re-throw
                throw error;
            }
        }

        // 3. Create or update user profile in Firestore
        const userDocRef = adminFirestore.collection('users').doc(uid);
        await userDocRef.set({
            id: uid,
            email,
            firstName,
            lastName,
            displayName,
        }, { merge: true });

        // 4. Grant admin role in Firestore
        const adminRoleRef = adminFirestore.collection('roles_admin').doc(uid);
        await adminRoleRef.set({ grantedAt: Timestamp.now() });

        console.log(`Successfully granted admin role to ${email}`);

        return {
            success: true,
            uid,
            displayName,
        };

    } catch (error: any) {
        console.error("grantAdminRoleFlow failed:", error);
        return {
            success: false,
            error: error.message || 'An unexpected server error occurred.',
        };
    }
  }
);
