
import { z } from 'zod';

const requiredString = z.string().min(1, { message: 'This field is required.' });
const optionalString = z.string().optional().nullable();
const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

const requiredPhone = z.string().regex(phoneRegex, { message: 'A valid phone number is required.' });
const optionalPhone = z.string().optional().nullable().refine(val => val === '' || !val || phoneRegex.test(val), {
  message: "Phone number must be in (xxx) xxx-xxxx format or empty.",
});

const requiredEmail = z.string().email({ message: "Invalid email address." }).min(1, { message: 'This field is required.' });
const optionalEmail = z.string().email({ message: "Invalid email address." }).optional().nullable().or(z.literal(''));


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
    agency: optionalString,

    // Step 1 - Primary Contact Person
    bestContactType: z.enum(['member', 'other'], { required_error: 'Please select a primary contact type.' }),
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
    hasCapacity: z.enum(['Yes', 'No'], { required_error: 'Please select an option for member capacity.' }),
    hasLegalRep: z.enum(['Yes', 'No', 'Unknown']).optional().nullable(),
    repName: optionalString,
    repRelationship: optionalString,
    repPhone: optionalPhone,
    repEmail: optionalEmail,

    // Step 2 - Location
    currentLocation: requiredString,
    currentAddress: requiredString,
    currentCity: requiredString,
    currentState: requiredString,
    currentZip: requiredString,
    currentCounty: requiredString,
    customaryAddress: requiredString,
    customaryCity: requiredString,
    customaryState: requiredString,
    customaryZip: requiredString,
    customaryCounty: requiredString,

    // Step 3 - Health Plan & Pathway
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.'}),
    existingHealthPlan: optionalString,
    switchingHealthPlan: z.enum(['Yes', 'No', 'N/A']).optional().nullable(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
    meetsPathwayCriteria: z.boolean(),
    snfDiversionReason: optionalString,
  })
  .refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
    message: "Medi-Cal numbers don't match.",
    path: ["confirmMemberMediCalNum"],
  })
  .refine(data => data.memberMrn === data.confirmMemberMrn, {
    message: "MRN numbers don't match.",
    path: ["confirmMemberMrn"],
  })
  .refine(data => {
    if (data.pathway) {
        return data.meetsPathwayCriteria;
    }
    return true;
  }, {
    message: "You must confirm the criteria have been met.",
    path: ["meetsPathwayCriteria"],
  })
  .superRefine((data, ctx) => {
    // Primary Contact conditional validation
    if (data.bestContactType === 'other') {
      if (!data.bestContactFirstName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "First name is required.", path: ["bestContactFirstName"] });
      if (!data.bestContactLastName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Last name is required.", path: ["bestContactLastName"] });
      if (!data.bestContactRelationship) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Relationship is required.", path: ["bestContactRelationship"] });
      if (!data.bestContactPhone || !phoneRegex.test(data.bestContactPhone)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid phone number is required.", path: ["bestContactPhone"] });
      if (!data.bestContactEmail) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Email is required.", path: ["bestContactEmail"] });
      else if (!z.string().email().safeParse(data.bestContactEmail).success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid email address.", path: ["bestContactEmail"] });
      if (!data.bestContactLanguage) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Language is required.", path: ["bestContactLanguage"] });
    }

    // Health Plan conditional validation
    if (data.healthPlan === 'Other') {
      if (!data.existingHealthPlan) {
        ctx.addIssue({
          code: 'custom',
          message: 'Please specify the existing health plan or enter "N/A".',
          path: ['existingHealthPlan'],
        });
      }
      if (!data.switchingHealthPlan) {
        ctx.addIssue({
          code: 'custom',
          message: 'Please select if the member will be switching plans.',
          path: ['switchingHealthPlan'],
        });
      }
    }
    
    // SNF Diversion conditional validation
    if (data.pathway === 'SNF Diversion' && !data.snfDiversionReason) {
      ctx.addIssue({
        code: 'custom',
        message: 'Reason for SNF Diversion must be provided or enter "N/A".',
        path: ['snfDiversionReason'],
      });
    }
  });


export type FormValues = z.infer<typeof formSchema>;
