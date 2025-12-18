
'use server';
/**
 * @fileOverview A server-side flow to receive application data from a Make.com webhook.
 *
 * This flow is designed to be triggered by an HTTP request from a service like Make.com.
 * It takes a comprehensive JSON payload representing a CalAIM application, validates it,
 * and then creates or updates the corresponding application record in Firestore.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { firebaseConfig } from '@/firebase/config';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const firestore = admin.firestore();

// Define the comprehensive schema for the incoming webhook data.
// This should match all the fields collected in the CS Member Summary form.
const WebhookInputSchema = z.object({
  // Member Info
  memberFirstName: z.string(),
  memberLastName: z.string(),
  memberDob: z.string().describe("MM/DD/YYYY format"),
  memberAge: z.number().optional(),
  memberMediCalNum: z.string(),
  memberMrn: z.string(),
  memberLanguage: z.string(),
  memberCounty: z.string(),

  // Referrer Info
  referrerFirstName: z.string(),
  referrerLastName: z.string(),
  referrerEmail: z.string().email(),
  referrerPhone: z.string(),
  referrerRelationship: z.string(),
  agency: z.string().optional().nullable(),

  // Primary Contact
  bestContactFirstName: z.string(),
  bestContactLastName: z.string(),
  bestContactRelationship: z.string(),
  bestContactPhone: z.string(),
  bestContactEmail: z.string().email(),
  bestContactLanguage: z.string(),

  // Secondary Contact
  secondaryContactFirstName: z.string().optional().nullable(),
  secondaryContactLastName: z.string().optional().nullable(),
  secondaryContactRelationship: z.string().optional().nullable(),
  secondaryContactPhone: z.string().optional().nullable(),
  secondaryContactEmail: z.string().email().optional().nullable(),
  secondaryContactLanguage: z.string().optional().nullable(),
  
  // Legal Rep
  hasCapacity: z.enum(['Yes', 'No']),
  hasLegalRep: z.enum(['Yes', 'No']).optional().nullable(),
  repFirstName: z.string().optional().nullable(),
  repLastName: z.string().optional().nullable(),
  repRelationship: z.string().optional().nullable(),
  repPhone: z.string().optional().nullable(),
  repEmail: z.string().email().optional().nullable(),

  // Location
  currentLocation: z.string(),
  currentAddress: zूंstring(),
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

  // Health Plan & Pathway
  healthPlan: z.enum(['Kaiser', 'Health Net', 'Other']),
  existingHealthPlan: z.string().optional().nullable(),
  switchingHealthPlan: z.enum(['Yes', 'No', 'N/A']).optional().nullable(),
  pathway: z.enum(['SNF Transition', 'SNF Diversion']),
  meetsPathwayCriteria: z.boolean().optional(),
  snfDiversionReason: z.string().optional().nullable(),

  // ISP & RCFE
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

  // System Fields
  userId: z.string().describe("The Firebase UID of the user submitting the application."),
  applicationId: z.string().optional().describe("Provide if updating an existing application."),
});

export type WebhookInput = z.infer<typeof WebhookInputSchema>;

const WebhookOutputSchema = z.object({
  success: z.boolean(),
  applicationId: z.string(),
  message: z.string(),
});
export type WebhookOutput = z.infer<typeof WebhookOutputSchema>;


/**
 * Public function to be called from the client or an HTTP trigger.
 * This wraps the Genkit flow for external access.
 */
export async function processWebhook(input: WebhookInput): Promise<WebhookOutput> {
  console.log(`[processWebhook] Starting flow for user ${input.userId}.`);
  return makeWebhookFlow(input);
}


const makeWebhookFlow = ai.defineFlow(
  {
    name: 'makeWebhookFlow',
    inputSchema: WebhookInputSchema,
    outputSchema: WebhookOutputSchema,
  },
  async (data) => {
    console.log('[makeWebhookFlow] Received data for processing.');

    const { userId, applicationId, ...applicationData } = data;

    // Determine if we're creating a new application or updating an existing one
    const docId = applicationId || firestore.collection(`users/${userId}/applications`).doc().id;
    const docRef = firestore.doc(`users/${userId}/applications/${docId}`);

    try {
      const dataToSave = {
        ...applicationData,
        id: docId,
        userId: userId,
        status: 'In Progress', // Default status for new applications
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      // Use set with merge: true to handle both creation and updates
      await docRef.set(dataToSave, { merge: true });

      const message = applicationId
        ? `Successfully updated application ${docId}.`
        : `Successfully created new application ${docId}.`;

      console.log(`[makeWebhookFlow] Success: ${message}`);
      return {
        success: true,
        applicationId: docId,
        message,
      };
    } catch (error: any) {
      console.error('[makeWebhookFlow] Error saving to Firestore:', error);
      throw new Error(`Failed to save application data. Server error: ${error.message}`);
    }
  }
);
