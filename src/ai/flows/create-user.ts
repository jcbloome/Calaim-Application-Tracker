
'use server';

/**
 * @fileOverview This AI flow is deprecated and no longer functional.
 * User creation is now handled on the client-side in /admin/super/page.tsx.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const CreateUserInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string(),
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
    // This flow is non-functional due to server-side auth issues.
    // It returns an error to be handled by the client, though the client
    // no longer calls this flow.
    return {
      error: 'Automatic user creation via AI flow is disabled.',
    };
  }
);
