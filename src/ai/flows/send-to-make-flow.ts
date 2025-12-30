
'use server';
/**
 * @fileOverview A server-side flow to send test application data to a Make.com webhook.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// This is the schema for the data payload we will send TO the webhook.
const TestWebhookDataSchema = z.object({
  memberFirstName: z.string(),
  memberLastName: z.string(),
  memberDob: z.string(),
  memberAge: z.number().optional(),
  memberMediCalNum: z.string(),
  memberMrn: z.string(),
  memberLanguage: z.string(),
  memberCounty: z.string(),
  referrerFirstName: z.string(),
  referrerLastName: z.string(),
  referrerEmail: z.string().email(),
  referrerPhone: z.string(),
  referrerRelationship: z.string(),
  agency: z.string().optional().nullable(),
  bestContactFirstName: z.string(),
  bestContactLastName: z.string(),
  bestContactRelationship: z.string(),
  bestContactPhone: z.string(),
  bestContactEmail: z.string().email(),
  bestContactLanguage: z.string(),
  hasCapacity: z.enum(['Yes', 'No']),
  hasLegalRep: z.enum(['Yes', 'No']).optional().nullable(),
  currentLocation: z.string(),
  currentAddress: z.string(),
  currentCity: z.string(),
  currentState: z.string(),
  currentZip: z.string(),
  currentCounty: z.string(),
  customaryLocationType: z.string(),
  customaryAddress: z.string(),
  customaryCity: z.string(),
  customaryState: z.string(),
  customaryZip: z.string(),
  customaryCounty: z.string(),
  healthPlan: z.enum(['Kaiser', 'Health Net', 'Other']),
  pathway: z.enum(['SNF Transition', 'SNF Diversion']),
  meetsPathwayCriteria: z.boolean().optional(),
  snfDiversionReason: z.string().optional().nullable(),
  ispFirstName: z.string(),
  ispLastName: z.string(),
  ispRelationship: z.string(),
  ispPhone: z.string(),
  ispEmail: z.string().email(),
  ispLocationType: z.string(),
  ispAddress: z.string(),
  ispFacilityName: z.string(),
  onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']),
  hasPrefRCFE: z.enum(['Yes', 'No']),
  rcfeName: z.string().optional().nullable(),
  rcfeAddress: z.string().optional().nullable(),
  rcfeAdminName: z.string().optional().nullable(),
  rcfeAdminPhone: z.string().optional().nullable(),
  rcfeAdminEmail: z.string().email().optional().nullable(),
  userId: z.string(),
});

// This is the input schema for the FLOW itself. It includes the user and the data.
const SendToMakeInputSchema = z.object({
  user: z.any().describe('The authenticated Firebase user object.'),
  data: TestWebhookDataSchema,
});
export type SendToMakeInput = z.infer<typeof SendToMakeInputSchema>;


// This is the expected response from our flow.
const WebhookResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;


// Define the Genkit flow. This is the core server-side logic.
const sendToMakeFlow = ai.defineFlow(
  {
    name: 'sendToMakeFlow',
    inputSchema: SendToMakeInputSchema,
    outputSchema: WebhookResponseSchema,
  },
  async ({ user, data }) => {
    // Auth check
    if (!user || !user.uid) {
      throw new Error("User authentication is required to perform this action.");
    }
    console.log('[sendToMakeFlow] User authenticated. Preparing to send webhook.');

    // Get webhook URL from environment variables
    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('[sendToMakeFlow] MAKE_WEBHOOK_URL is not set in environment variables.');
      throw new Error('Webhook URL is not configured. Please set MAKE_WEBHOOK_URL in your .env file.');
    }

    try {
      // Make the actual HTTP request to Make.com
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const responseBody = await response.text(); // Read body once

      if (!response.ok) {
        console.error(`[sendToMakeFlow] Webhook response not OK: ${response.status} ${response.statusText}`, responseBody);
        throw new Error(`Webhook failed with status ${response.status}: ${responseBody || response.statusText}`);
      }
      
      console.log('[sendToMakeFlow] Webhook sent successfully. Response:', responseBody);

      return {
        success: true,
        message: `Successfully sent test data to Make.com. Response: ${responseBody}`,
      };

    } catch (error: any) {
      console.error('[sendToMakeFlow] Error sending to Make.com webhook:', error);
      // Re-throw a clean error to be caught by the client
      throw new Error(`Failed to send webhook. Server error: ${error.message}`);
    }
  }
);


/**
 * EXPORTED FUNCTION FOR CLIENT-SIDE USE.
 * This is the function that the frontend will call. It takes the same input as the flow
 * and simply invokes the Genkit flow. This is the correct pattern to avoid recursion.
 */
export async function sendTestToMake(input: SendToMakeInput): Promise<WebhookResponse> {
  console.log(`[sendTestToMake] Client-side trigger for sendToMakeFlow.`);
  // Correctly call the Genkit flow object.
  return await sendToMakeFlow(input);
}
