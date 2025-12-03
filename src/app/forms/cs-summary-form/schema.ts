
import { z } from 'zod';

const requiredString = z.string().min(1, { message: 'This field is required.' });
const optionalString = z.string().optional().nullable();
const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
const requiredPhone = z.string().regex(phoneRegex, { message: 'Phone number must be in (xxx) xxx-xxxx format.' });
const optionalPhone = z.string().optional().nullable(); // Simplified to remove faulty regex logic
const optionalEmail = z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal(''));

export const formSchema = z.object({
    // Step 1 - Member Info
    memberFirstName: requiredString,
    memberLastName: requiredString,
    memberDob: z.date({ required_error: 'Date of birth is required.' }),
    memberAge: z.number().optional(),
    memberMediCalNum: z.string().regex(/^[a-zA-Z0-9]{9}$/, { message: 'Medi-Cal number must be 9 characters.' }),
    confirmMemberMediCalNum: requiredString,
    memberMrn: requiredString,
    confirmMemberMrn: requiredString,
    memberLanguage: requiredString,
    memberCounty: requiredString,
    
    // Step 1 - Referrer Info
    referrerFirstName: optionalString,
    referrerLastName: optionalString,
    referrerEmail: optionalString,
    referrerPhone: requiredPhone,
    referrerRelationship: requiredString,
    agency: optionalString.nullable(),

    // Step 1 - Primary Contact Person
    bestContactType: z.enum(['member', 'other']).optional().nullable(),
    bestContactFirstName: optionalString,
    bestContactLastName: optionalString,
    bestContactRelationship: optionalString,
    bestContactPhone: optionalPhone,
    bestContactEmail: optionalEmail,
    bestContactLanguage: optionalString,

    // Secondary Contact
    secondaryContactFirstName: optionalString,
    secondaryContactLastName: optionalString,
    secondaryContactRelationship: optionalString,
    secondaryContactPhone: optionalPhone,
    secondaryContactEmail: optionalEmail,
    secondaryContactLanguage: optionalString,

    // Step 1 - Legal Rep
    hasCapacity: z.enum(['Yes', 'No']).optional().nullable(),
    hasLegalRep: z.enum(['Yes', 'No', 'Unknown']).optional().nullable(),
    repName: optionalString,
    repRelationship: optionalString,
    repPhone: optionalPhone,
    repEmail: optionalEmail,
    isRepPrimaryContact: z.boolean().optional().default(false),

    // Step 2 - Location
    currentLocation: optionalString,
    currentAddress: optionalString,
    currentCity: optionalString,
    currentState: optionalString,
    currentZip: optionalString,
    currentCounty: optionalString,
    copyAddress: z.boolean().optional(),
    customaryAddress: optionalString,
    customaryCity: optionalString,
    customaryState: optionalString,
    customaryZip: optionalString,
    customaryCounty: optionalString,

    // Step 3 - Health Plan & Pathway
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other']).optional().nullable(),
    existingHealthPlan: optionalString,
    switchingHealthPlan: z.enum(['Yes', 'No']).optional().nullable(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion']).optional().nullable(),
    meetsPathwayCriteria: z.boolean().optional(),
    snfDiversionReason: optionalString,

    // Step 4 - ISP & RCFE
    ispFirstName: optionalString,
    ispLastName: optionalString,
    ispRelationship: optionalString,
    ispFacilityName: optionalString,
    ispPhone: optionalPhone,
    ispEmail: optionalEmail,
    ispCopyCurrent: z.boolean().optional(),
    ispLocationType: optionalString,
    ispAddress: optionalString,
    ispCity: optionalString,
    ispState: optionalString,
    ispZip: optionalString,
    ispCounty: optionalString,
    onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']).optional().nullable(),
    hasPrefRCFE: z.enum(['Yes', 'No']).optional().nullable(),
    rcfeName: optionalString,
    rcfeAdminName: optionalString,
    rcfeAdminPhone: optionalPhone,
    rcfeAdminEmail: optionalEmail,
    rcfeAddress: optionalString,
  });


export type FormValues = z.infer<typeof formSchema>;
