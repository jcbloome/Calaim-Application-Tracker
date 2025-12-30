
'use server';
/**
 * @fileOverview A server-side flow to send test application data to a Make.com webhook.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

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

const TestWebhookInputSchema = z.object({
  user: z.any().describe('The authenticated Firebase user object.'),
  data: TestWebhookDataSchema,
});

export type TestWebhookInput = z.infer<typeof TestWebhookDataSchema>;

const WebhookResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;


const sendToMakeFlow = ai.defineFlow(
  {
    name: 'sendToMakeFlow',
    inputSchema: TestWebhookInputSchema,
    outputSchema: WebhookResponseSchema,
  },
  async ({ user, data }) => {
    if (!user || !user.uid) {
      throw new Error("User authentication is required to perform this action.");
    }

    console.log('[sendToMakeFlow] Received data for webhook.');

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error('[sendToMakeFlow] MAKE_WEBHOOK_URL is not set in environment variables.');
      throw new Error('Webhook URL is not configured. Please set MAKE_WEBHOOK_URL in your .env file.');
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        // Try to get more details from the response body
        const errorBody = await response.text();
        console.error(`[sendToMakeFlow] Webhook response not OK: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`Webhook failed with status ${response.status}: ${errorBody || response.statusText}`);
      }
      
      const responseBody = await response.text();
      console.log('[sendToMakeFlow] Webhook sent successfully. Response:', responseBody);

      return {
        success: true,
        message: `Successfully sent test data to Make.com. Response: ${responseBody}`,
      };

    } catch (error: any) {
      console.error('[sendToMakeFlow] Error sending to Make.com webhook:', error);
      throw new Error(`Failed to send webhook. Server error: ${error.message}`);
    }
  }
);

/**
 * Public function to be called from the client.
 */
export async function sendTestToMake(input: z.infer<typeof TestWebhookInputSchema>): Promise<WebhookResponse> {
  console.log(`[sendTestToMake] Starting flow.`);
  return sendToMakeFlow(input);
}
