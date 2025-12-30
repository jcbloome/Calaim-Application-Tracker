
'use server';

/**
 * @fileOverview An AI tool to analyze submitted information and suggest relevant next steps or highlight missing information in the forms.
 *
 * - suggestNextSteps - A function that handles the suggestion of next steps based on submitted information.
 * - SuggestNextStepsInput - The input type for the suggestNextSteps function.
 * - SuggestNextStepsOutput - The return type for the suggestNextSteps function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { gemini15Pro } from '@genkit-ai/google-genai';

const SuggestNextStepsInputSchema = z.object({
  applicationData: z.record(z.any()).describe('The application data submitted by the user.'),
  currentStep: z.string().optional().describe('The current step the user is on in the application process.'),
});
export type SuggestNextStepsInput = z.infer<typeof SuggestNextStepsInputSchema>;

const SuggestNextStepsOutputSchema = z.object({
  nextSteps: z.array(z.string()).describe('A list of suggested next steps for the user.'),
  missingInformation: z.record(z.string(), z.string().array()).describe('A map of form field names to reasons why they are incomplete.'),
  priorityFields: z.array(z.string()).describe('A list of form fields that need immediate attention.'),
  requiresManualIntervention: z.boolean().describe('Whether the application requires manual intervention.'),
});
export type SuggestNextStepsOutput = z.infer<typeof SuggestNextStepsOutputSchema>;

export async function suggestNextSteps(input: SuggestNextStepsInput): Promise<SuggestNextStepsOutput> {
  return suggestNextStepsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestNextStepsPrompt',
  model: gemini15Pro,
  input: {schema: SuggestNextStepsInputSchema},
  output: {schema: SuggestNextStepsOutputSchema},
  prompt: `You are an AI assistant helping users complete their CalAIM application accurately and efficiently.

  Analyze the application data provided and suggest the next steps the user should take.
  Highlight any missing information in the forms and indicate which fields need immediate attention.
  Determine if the application requires manual intervention based on the completeness and accuracy of the information provided.

  Application Data: {{{JSON.stringify applicationData}}}
  Current Step: {{{currentStep}}}

  Output the next steps, missing information, priority fields, and manual intervention status in JSON format. Ensure that the JSON is parsable.
  The missingInformation should be a map where keys are form field names and values are arrays of reasons why those fields are incomplete.
`,
});

const suggestNextStepsFlow = ai.defineFlow(
  {
    name: 'suggestNextStepsFlow',
    inputSchema: SuggestNextStepsInputSchema,
    outputSchema: SuggestNextStepsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
