
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
    description: "Gets the currently authenticated user's details.",
    inputSchema: z.void(),
    outputSchema: UserSchema,
  },
  async (input, context) => {
    // The 'context' argument contains execution details, including auth.
    const user = context?.auth;

    if (!user) {
      // This will automatically throw an unauthenticated error if no user is found in the context.
      throw new Error('User not authenticated.');
    }

    // The user object from context already contains uid, email, etc.
    return {
      uid: user.uid,
      email: user.email || undefined,
      name: user.displayName || undefined,
    };
  }
);
