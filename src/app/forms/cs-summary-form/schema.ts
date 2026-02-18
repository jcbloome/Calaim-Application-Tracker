
import { z } from 'zod';

const requiredString = z.string().min(1, { message: ' ' });
const optionalString = z.string().optional().nullable();
const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

const requiredPhone = z.string().regex(phoneRegex, { message: ' ' });
const optionalPhone = z.string().optional().nullable().transform(val => val ?? '').refine(val => val === '' || !val || phoneRegex.test(val), {
  message: " ",
});

const requiredEmail = z.string().refine(value => {
    if (!value) return false; // Must not be empty
    if (value.trim().toUpperCase() === 'N/A') return true; // Allow 'N/A'
    return z.string().email().safeParse(value).success; // Check for valid email format
}, { message: " " });

const optionalEmail = z.string().optional().nullable().refine(value => {
    if (!value) return true; // Allow empty, null, or undefined
    if (value.trim().toUpperCase() === 'N/A') return true; // Allow 'N/A'
    return z.string().email().safeParse(value).success; // Check for valid email format
}, { message: " " });


const dateSchema = z.string().refine(val => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return false;
    const [month, day, year] = val.split('/').map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(year, month - 1, day);
    return !isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
}, { message: " " });


export const formSchema = z.object({
    // Step 1 - Member Info
    memberFirstName: requiredString,
    memberLastName: requiredString,
    memberDob: dateSchema,
    sex: z.enum(['Male', 'Female'], { errorMap: () => ({ message: ' ' }) }),
    memberAge: z.number({ required_error: ' '}).min(0).optional(),
    memberMediCalNum: z.string().regex(/^[9][0-9]{7}[A-Za-z]$/, { message: "Must start with 9 and end with a letter." }),
    confirmMemberMediCalNum: requiredString,
    memberMrn: requiredString,
    confirmMemberMrn: requiredString,
    memberLanguage: requiredString,
    
    // Step 1 - Referrer Info
    referrerFirstName: optionalString,
    referrerLastName: optionalString,
    referrerEmail: optionalString,
    referrerPhone: requiredPhone,
    referrerRelationship: requiredString,
    agency: optionalString,

    // Step 1 - Primary Contact Person
    isPrimaryContactSameAsReferrer: z.boolean().optional().nullable().transform(val => val === true),
    bestContactFirstName: requiredString,
    bestContactLastName: requiredString,
    bestContactRelationship: requiredString,
    bestContactPhone: requiredPhone,
    bestContactEmail: requiredEmail,
    bestContactLanguage: requiredString,

    // Secondary Contact
    secondaryContactFirstName: optionalString,
    secondaryContactLastName: optionalString,
    secondaryContactRelationship: optionalString,
    secondaryContactPhone: optionalPhone,
    secondaryContactEmail: optionalEmail,
    secondaryContactLanguage: optionalString,

    // Step 1 - Legal Rep
    hasLegalRep: z.enum(['notApplicable', 'same_as_primary', 'different', 'no_has_rep'], { errorMap: () => ({ message: "Please make a selection."})}),
    repFirstName: optionalString,
    repLastName: optionalString,
    repRelationship: optionalString,
    repPhone: optionalPhone,
    repEmail: optionalEmail,

    // Step 2 - Location
    currentLocation: requiredString,
    currentLocationName: optionalString,
    currentAddress: requiredString,
    currentCity: requiredString,
    currentState: requiredString,
    currentZip: requiredString,
    currentCounty: requiredString,
    copyAddress: z.boolean().optional(),
    customaryLocationType: requiredString,
    customaryLocationName: optionalString,
    customaryAddress: requiredString,
    customaryCity: requiredString,
    customaryState: requiredString,
    customaryZip: requiredString,
    customaryCounty: requiredString,

    // Step 3 - Health Plan & Pathway
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { errorMap: () => ({ message: ' ' })}),
    existingHealthPlan: optionalString,
    switchingHealthPlan: z.enum(['Yes', 'No', 'N/A']).optional().nullable(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion'], { errorMap: () => ({ message: ' ' }) }),
    snfDiversionReason: optionalString,

    // Step 4 - ISP & RCFE
    ispFirstName: requiredString,
    ispLastName: requiredString,
    ispRelationship: requiredString,
    ispPhone: requiredPhone,
    ispEmail: requiredEmail,
    ispLocationType: requiredString,
    ispAddress: requiredString,
    ispFacilityName: requiredString,
    onALWWaitlist: z.enum(['Yes', 'No', 'Unknown'], { errorMap: () => ({ message: ' ' }) }),
    ackRoomAndBoard: z.boolean().refine(val => val === true, {
      message: " ",
    }),
    hasPrefRCFE: z.enum(['Yes', 'No'], { errorMap: () => ({ message: ' ' }) }),
    rcfeName: optionalString,
    rcfeAddress: optionalString,
    rcfePreferredCities: optionalString,
    rcfeAdminFirstName: optionalString,
    rcfeAdminLastName: optionalString,
    rcfeAdminPhone: optionalPhone,
    rcfeAdminEmail: optionalEmail,
  })
  .refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
    message: " ",
    path: ["confirmMemberMediCalNum"],
  })
  .refine(data => data.memberMrn === data.confirmMemberMrn, {
    message: " ",
    path: ["confirmMemberMrn"],
  })
  .superRefine((data, ctx) => {
    if (data.pathway === 'SNF Diversion' && (!data.snfDiversionReason || data.snfDiversionReason.trim() === '')) {
      ctx.addIssue({
        code: 'custom',
        message: ' ',
        path: ['snfDiversionReason'],
      });
    }

    if (data.hasLegalRep === 'different') {
        if (!data.repFirstName) ctx.addIssue({ code: 'custom', message: ' ', path: ['repFirstName'] });
        if (!data.repLastName) ctx.addIssue({ code: 'custom', message: ' ', path: ['repLastName'] });
        if (!data.repRelationship) ctx.addIssue({ code: 'custom', message: ' ', path: ['repRelationship'] });
        if (!data.repPhone) ctx.addIssue({ code: 'custom', message: ' ', path: ['repPhone'] });
        if (!data.repEmail) ctx.addIssue({ code: 'custom', message: ' ', path: ['repEmail'] });
    }
  });


export type FormValues = z.infer<typeof formSchema>;
