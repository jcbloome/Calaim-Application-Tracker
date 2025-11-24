

'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import Step1 from '@/app/forms/cs-summary-form/components/Step1';
import Step2 from '@/app/forms/cs-summary-form/components/Step2';
import Step3 from '@/app/forms/cs-summary-form/components/Step3';
import Step4 from '@/app/forms/cs-summary-form/components/Step4';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Application } from '@/lib/definitions';

// Define the schema directly in this file to avoid module resolution issues
const requiredString = z.string().min(1, { message: 'This field is required.' });
const optionalString = z.string().optional().nullable();
const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
const optionalPhone = z.string().refine(val => val === '' || !val || phoneRegex.test(val), {
    message: 'Invalid phone number format. Expected (xxx) xxx-xxxx.',
}).optional().nullable();
const requiredPhone = z.string().regex(phoneRegex, { message: 'Phone number must be in (xxx) xxx-xxxx format.' });
const optionalEmail = z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')).nullable();

const formSchema = z.object({
    // Step 1 - Member Info
    memberFirstName: requiredString,
    memberLastName: requiredString,
    memberDob: z.date({ required_error: 'Date of birth is required.' }),
    memberAge: z.number().optional(),
    memberMediCalNum: z.string().regex(/^9[0-9]{7}[a-zA-Z]$/, { message: 'Invalid Medi-Cal number format. Must be 9, followed by 7 digits, then a letter.'}).max(9, "Medi-Cal number cannot exceed 9 characters."),
    confirmMemberMediCalNum: z.string().max(9, "Medi-Cal number cannot exceed 9 characters."),
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
    bestContactType: z.enum(['member', 'other'], { required_error: 'Please select a primary contact type.'}),
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
    hasCapacity: z.enum(['Yes', 'No'], { required_error: 'This field is required.' }),
    hasLegalRep: optionalString,
    repName: optionalString,
    repRelationship: optionalString,
    repPhone: optionalPhone,
    repEmail: optionalEmail,
    isRepPrimaryContact: z.boolean().optional(),

    // Step 2 - Location
    currentLocation: requiredString,
    currentAddress: requiredString,
    currentCity: requiredString,
    currentState: requiredString,
    currentZip: requiredString,
    currentCounty: requiredString,
    copyAddress: z.boolean().optional(),
    customaryAddress: optionalString,
    customaryCity: optionalString,
    customaryState: optionalString,
    customaryZip: optionalString,
    customaryCounty: optionalString,

    // Step 3 - Health Plan & Pathway
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.' }),
    existingHealthPlan: optionalString,
    switchingHealthPlan: z.enum(['Yes', 'No']).optional().nullable(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
    meetsPathwayCriteria: z.boolean().refine(val => val === true, { message: "You must confirm the criteria are met." }),
    snfDiversionReason: optionalString,

    // Step 4 - ISP & RCFE
    ispFirstName: optionalString,
    ispLastName: optionalString,
    ispRelationship: optionalString,
    ispFacilityName: optionalString,
    ispPhone: optionalPhone,
    ispEmail: optionalEmail,
    ispAddress: optionalString,
    ispCity: optionalString,
    ispState: optionalString,
    ispZip: optionalString,
    ispCounty: optionalString,
    onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']).optional().nullable(),
    hasPrefRCFE: optionalString,
    rcfeName: optionalString,
    rcfeAdminName: optionalString,
    rcfeAdminPhone: optionalPhone,
    rcfeAdminEmail: optionalEmail,
    rcfeAddress: optionalString,
  })
  .refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
    message: "Medi-Cal numbers don't match",
    path: ["confirmMemberMediCalNum"],
  })
  .refine(data => data.memberMrn === data.confirmMemberMrn, {
      message: "Medical Record Numbers don't match",
      path: ["confirmMemberMrn"],
  });

type FormValues = z.infer<typeof formSchema>;
const viewSchema = () => formSchema.partial();


export function CsSummaryView({ application }: { application: Partial<Application> }) {
  const methods = useForm<FormValues>({
    resolver: zodResolver(viewSchema()),
    defaultValues: application,
    mode: 'onBlur',
  });

  const { reset } = methods;

  useEffect(() => {
    // Transform and load the application data into the form
    const data = { ...application };
    if (data.memberDob && typeof data.memberDob === 'string') {
        data.memberDob = new Date(data.memberDob);
    } else if (data.memberDob && typeof data.memberDob.toDate === 'function') {
        data.memberDob = data.memberDob.toDate();
    }
    reset(data);
  }, [application, reset]);

  // Disable all fields
  useEffect(() => {
    const form = methods.control.owner?._form;
    if (form) {
      const elements = form.elements;
      for (let i = 0; i < elements.length; i++) {
        (elements[i] as HTMLElement & { disabled: boolean }).disabled = true;
      }
    }
  }, [methods.control]);
  
  return (
    <ScrollArea className="h-[70vh] pr-6">
        <FormProvider {...methods}>
            <form>
                <Accordion type="multiple" defaultValue={['step1', 'step2', 'step3', 'step4']} className="w-full">
                    <AccordionItem value="step1">
                        <AccordionTrigger>Step 1: Member & Contact Info</AccordionTrigger>
                        <AccordionContent><Step1 /></AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="step2">
                        <AccordionTrigger>Step 2: Location Information</AccordionTrigger>
                        <AccordionContent><Step2 /></AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="step3">
                        <AccordionTrigger>Step 3: Health Plan & Pathway</AccordionTrigger>
                        <AccordionContent><Step3 /></AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="step4">
                        <AccordionTrigger>Step 4: ISP & Facility Selection</AccordionTrigger>
                        <AccordionContent><Step4 /></AccordionContent>
                    </AccordionItem>
                </Accordion>
            </form>
        </FormProvider>
    </ScrollArea>
  );
}
