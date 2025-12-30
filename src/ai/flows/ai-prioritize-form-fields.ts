
'use server';

/**
 * @fileOverview AI tool to prioritize form fields and flag manual intervention needs.
 *
 * - prioritizeFormFields - A function that prioritizes form fields.
 * - PrioritizeFormFieldsInput - The input type for the prioritizeFormFields function.
 * - PrioritizeFormFieldsOutput - The return type for the prioritizeFormFields function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { gemini15Pro } from '@genkit-ai/google-genai';

const PrioritizeFormFieldsInputSchema = z.object({
  formData: z.record(z.any()).describe('The form data to analyze.'),
  formSchema: z.record(z.any()).describe('The schema of the form.'),
});
export type PrioritizeFormFieldsInput = z.infer<typeof PrioritizeFormFieldsInputSchema>;

const PrioritizeFormFieldsOutputSchema = z.object({
  prioritizedFields: z.array(z.string()).describe('The list of fields that need attention, in order of priority.'),
  manualInterventionRequired: z.boolean().describe('Whether manual intervention is required.'),
  reason: z.string().optional().describe('Reasoning behind prioritization and manual intervention flag.'),
});
export type PrioritizeFormFieldsOutput = z.infer<typeof PrioritizeFormFieldsOutputSchema>;

export async function prioritizeFormFields(input: PrioritizeFormFieldsInput): Promise<PrioritizeFormFieldsOutput> {
  return prioritizeFormFieldsFlow(input);
}

const prioritizeFormFieldsPrompt = ai.definePrompt({
  name: 'prioritizeFormFieldsPrompt',
  model: gemini15Pro,
  input: {schema: PrioritizeFormFieldsInputSchema},
  output: {schema: PrioritizeFormFieldsOutputSchema},
  prompt: `You are an AI assistant designed to help users fill out forms correctly and efficiently.

  Analyze the provided form data and schema to determine which fields require the most attention.
  Consider factors such as missing required fields, potentially incorrect or inconsistent data, and fields that may require further clarification.

  Based on your analysis, provide a prioritized list of fields that the user should focus on, in order of importance.
  Also, determine whether manual intervention is required based on the complexity or sensitivity of the form or data.

  Form Data: {{{formData}}}
  Form Schema: {{{formSchema}}}

  Output should be a JSON object conforming to the following schema:
  ${JSON.stringify(PrioritizeFormFieldsOutputSchema.describe(''))}
`,
});

const prioritizeFormFieldsFlow = ai.defineFlow(
  {
    name: 'prioritizeFormFieldsFlow',
    inputSchema: PrioritizeFormFieldsInputSchema,
    outputSchema: PrioritizeFormFieldsOutputSchema,
  },
  async input => {
    const {output} = await prioritizeFormFieldsPrompt(input);
    return output!;
  }
);
