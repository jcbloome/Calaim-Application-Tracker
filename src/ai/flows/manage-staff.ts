
'use server';
/**
 * @fileOverview Server-side flows for managing staff users, including adding new users and updating roles.
 *
 * - addStaff: Creates a new Firebase user, assigns them an 'Admin' role, and creates a user profile.
 * - updateStaffRole: Toggles a user's 'Super Admin' status.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// ========== ADD STAFF FLOW ==========

const AddStaffInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});
export type AddStaffInput = z.infer<typeof AddStaffInputSchema>;

const AddStaffOutputSchema = z.object({
  uid: z.string(),
  message: z.string(),
});
export type AddStaffOutput = z.infer<typeof AddStaffOutputSchema>;


export async function addStaff(input: AddStaffInput): Promise<AddStaffOutput> {
  return addStaffFlow(input);
}


const addStaffFlow = ai.defineFlow(
  {
    name: 'addStaffFlow',
    inputSchema: AddStaffInputSchema,
    outputSchema: AddStaffOutputSchema,
  },
  async ({ email, firstName, lastName }) => {
    const auth = admin.auth();
    const firestore = admin.firestore();

    // Generate a temporary random password. User will need to reset it.
    const tempPassword = Math.random().toString(36).slice(-8);
    const displayName = `${firstName} ${lastName}`;

    try {
      // 1. Create Firebase Auth user
      const userRecord = await auth.createUser({
        email,
        password: tempPassword,
        displayName,
        emailVerified: false, // User must verify their email
      });
      const uid = userRecord.uid;

      const batch = firestore.batch();
      
      // 2. Create user profile in 'users' collection
      const userDocRef = firestore.collection('users').doc(uid);
      batch.set(userDocRef, {
        id: uid,
        email,
        firstName,
        lastName,
        displayName,
      });

      // 3. Grant 'Admin' role in 'roles_admin' collection
      const adminRoleRef = firestore.collection('roles_admin').doc(uid);
      batch.set(adminRoleRef, { grantedAt: admin.firestore.FieldValue.serverTimestamp() });

      await batch.commit();

      // Optionally, send a password reset email so they can set their own password
      try {
        await auth.generatePasswordResetLink(email);
      } catch (emailError) {
        console.warn(`[addStaffFlow] User ${email} created, but failed to send password reset email. They will need to use the 'forgot password' flow.`, emailError);
      }

      const message = `Successfully created user ${email} (${uid}) and assigned 'Admin' role. They will need to set their password.`;
      return { uid, message };

    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        throw new Error('A user with this email address already exists.');
      }
      console.error('[addStaffFlow] Error creating new staff member:', error);
      throw new Error(`Failed to create staff member. Server error: ${error.message}`);
    }
  }
);


// ========== UPDATE STAFF ROLE FLOW ==========

const UpdateStaffRoleInputSchema = z.object({
  uid: z.string().min(1),
  isSuperAdmin: z.boolean(),
});
export type UpdateStaffRoleInput = z.infer<typeof UpdateStaffRoleInputSchema>;

const UpdateStaffRoleOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type UpdateStaffRoleOutput = z.infer<typeof UpdateStaffRoleOutputSchema>;


export async function updateStaffRole(input: UpdateStaffRoleInput): Promise<UpdateStaffRoleOutput> {
  return updateStaffRoleFlow(input);
}


const updateStaffRoleFlow = ai.defineFlow(
  {
    name: 'updateStaffRoleFlow',
    inputSchema: UpdateStaffRoleInputSchema,
    outputSchema: UpdateStaffRoleOutputSchema,
  },
  async ({ uid, isSuperAdmin }) => {
    const firestore = admin.firestore();
    const superAdminRoleRef = firestore.collection('roles_super_admin').doc(uid);

    try {
      if (isSuperAdmin) {
        // Grant Super Admin role
        await superAdminRoleRef.set({ grantedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true, message: `User ${uid} has been promoted to Super Admin.` };
      } else {
        // Revoke Super Admin role
        await superAdminRoleRef.delete();
        return { success: true, message: `User ${uid} has been demoted to Admin.` };
      }
    } catch (error: any) {
      console.error('[updateStaffRoleFlow] Error updating role:', error);
      throw new Error(`Failed to update role for user ${uid}. Server error: ${error.message}`);
    }
  }
);
