

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
import * as Schema from '@/app/forms/cs-summary-form/schema';
import type { Application } from '@/lib/definitions';

const { formSchema, FormValues } = Schema;

// A "tolerant" schema for viewing that makes most fields optional
const viewSchema = formSchema.partial();

export function CsSummaryView({ application }: { application: Partial<Application> }) {
  const methods = useForm<Schema.FormValues>({
    resolver: zodResolver(viewSchema),
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
