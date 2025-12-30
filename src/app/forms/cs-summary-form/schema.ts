
import { z } from 'zod';

const requiredString = z.string().min(1, { message: 'This field is required.' });
const optionalString = z.string().optional().nullable();
const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

const requiredPhone = z.string().regex(phoneRegex, { message: 'A valid phone number is required.' });
const optionalPhone = z.string().optional().nullable().transform(val => val ?? '').refine(val => val === '' || !val || phoneRegex.test(val), {
  message: "Phone number must be in (xxx) xxx-xxxx format or empty.",
});

const requiredEmail = z.string().email({ message: "Invalid email address." }).min(1, { message: 'This field is required.' });
const optionalEmail = z.string().email({ message: "Invalid email address." }).optional().nullable().or(z.literal(''));

const dateSchema = z.string().refine(val => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return false;
    const [month, day, year] = val.split('/').map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(year, month - 1, day);
    return !isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
}, { message: "Invalid date format. Use MM/DD/YYYY." });


export const formSchema = z.object({
    // Step 1 - Member Info
    memberFirstName: requiredString,
    memberLastName: requiredString,
    memberDob: dateSchema,
    sex: z.enum(['Male', 'Female'], { required_error: 'Please select the member\'s sex.' }),
    memberAge: z.number({ required_error: 'Age is required.'}).min(0).optional(),
    memberMediCalNum: z.string().regex(/^[9][0-9]{7}[A-Za-z]$/, { message: "Medi-Cal number must be 9 characters, start with '9', and end with a letter." }),
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
    hasCapacity: z.enum(['Yes', 'No'], { required_error: 'Please select an option for member capacity.' }),
    hasLegalRep: z.enum(['Yes', 'No']).optional().nullable(),
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
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.'}),
    existingHealthPlan: optionalString,
    switchingHealthPlan: z.enum(['Yes', 'No', 'N/A']).optional().nullable(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
    meetsPathwayCriteria: z.boolean().refine(val => val === true, {
      message: "You must confirm the criteria have been met.",
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
    onALWWaitlist: z.enum(['Yes', 'No', 'Unknown'], { required_error: 'Please select an option for ALW waitlist.' }),
    monthlyIncome: requiredString,
    ackRoomAndBoard: z.boolean().refine(val => val === true, {
      message: "You must acknowledge the room and board obligation.",
    }),
    hasPrefRCFE: z.enum(['Yes', 'No'], { required_error: 'Please select an option for preferred RCFE.' }),
    rcfeName: optionalString,
    rcfeAddress: optionalString,
    rcfeAdminName: optionalString,
    rcfeAdminPhone: optionalPhone,
    rcfeAdminEmail: optionalEmail,
  })
  .refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
    message: "Medi-Cal numbers don't match.",
    path: ["confirmMemberMediCalNum"],
  })
  .refine(data => data.memberMrn === data.confirmMemberMrn, {
    message: "MRN numbers don't match.",
    path: ["confirmMemberMrn"],
  })
  .superRefine((data, ctx) => {
    if (data.pathway === 'SNF Diversion' && (!data.snfDiversionReason || data.snfDiversionReason.trim() === '')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Reason for SNF Diversion must be provided or enter "N/A".',
        path: ['snfDiversionReason'],
      });
    }

    if (data.hasPrefRCFE === 'Yes') {
        if (!data.rcfeName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This field is required.", path: ["rcfeName"] });
        if (!data.rcfeAddress) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This field is required.", path: ["rcfeAddress"] });
        if (!data.rcfeAdminName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This field is required.", path: ["rcfeAdminName"] });
        if (!data.rcfeAdminPhone || !phoneRegex.test(data.rcfeAdminPhone)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid Administrator Phone is required.", path: ["rcfeAdminPhone"] });
        if (!data.rcfeAdminEmail || !z.string().email().safeParse(data.rcfeAdminEmail).success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid Administrator Email is required.", path: ["rcfeAdminEmail"] });
    }
  });


export type FormValues = z.infer<typeof formSchema>;
