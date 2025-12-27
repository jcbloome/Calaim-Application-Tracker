
'use server';

/**
 * @fileoverview A Genkit tool to securely retrieve the current user's
 * authentication details on the server-side.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAuthenticatedUser } from '@genkit-ai/next';

const UserSchema = z.object({
  uid: z.string(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * This tool securely retrieves the authenticated user's details on the server.
 * It's designed to be called at the beginning of other flows to ensure
 * that an operation is being performed by an authenticated user.
 */
export const getUser = ai.defineTool(
  {
    name: 'getUser',
    description: 'Gets the currently authenticated user.',
    outputSchema: UserSchema,
  },
  async () => {
    const user = getAuthenticatedUser();

    if (!user) {
      // This will automatically throw an unauthenticated error,
      // which is the correct behavior if no user is found.
      throw new Error('User not authenticated.');
    }

    return {
      uid: user.uid,
      email: user.email || undefined,
      name: user.displayName || undefined,
    };
  }
);
