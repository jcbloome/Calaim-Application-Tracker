
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
    memberMediCalNum: z.string().regex(/^[9][0-9]{7}[A-Za-z]$/, { message: " " }),
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
    hasCapacity: z.enum(['Yes', 'No'], { errorMap: () => ({ message: ' ' }) }),
    hasLegalRep: z.enum(['sameAsPrimary', 'different', 'No'], { errorMap: () => ({ message: "Please make a selection."})}).optional().nullable(),
    repFirstName: optionalString,
    repLastName: optionalString,
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
    copyAddress: z.boolean().optional(),
    customaryLocationType: requiredString,
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
    meetsPathwayCriteria: z.boolean().refine(val => val === true, {
      message: " ",
    }),
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
    monthlyIncome: requiredString,
    ackRoomAndBoard: z.boolean().refine(val => val === true, {
      message: " ",
    }),
    hasPrefRCFE: z.enum(['Yes', 'No'], { errorMap: () => ({ message: ' ' }) }),
    rcfeName: optionalString,
    rcfeAddress: optionalString,
    rcfeAdminName: optionalString,
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

    if (data.hasCapacity === 'No' && !data.hasLegalRep) {
        ctx.addIssue({
            code: 'custom',
            message: ' ',
            path: ['hasLegalRep'],
        });
    }

    if (data.hasPrefRCFE === 'Yes') {
        if (!data.rcfeName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: " ", path: ["rcfeName"] });
        if (!data.rcfeAddress) ctx.addIssue({ code: z.ZodIssueCode.custom, message: " ", path: ["rcfeAddress"] });
        if (!data.rcfeAdminName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: " ", path: ["rcfeAdminName"] });
        if (!data.rcfeAdminPhone || !phoneRegex.test(data.rcfeAdminPhone)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: " ", path: ["rcfeAdminPhone"] });
        
        const rcfeEmailCheck = requiredEmail.safeParse(data.rcfeAdminEmail);
        if (!rcfeEmailCheck.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: " ", path: ["rcfeAdminEmail"] });
    }
  });


export type FormValues = z.infer<typeof formSchema>;
