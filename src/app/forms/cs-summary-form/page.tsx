'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';
import { Header } from '@/components/Header';

const formSchema = z.object({
  // Step 1
  memberFirstName: z.string().min(1, 'First name is required'),
  memberLastName: z.string().min(1, 'Last name is required'),
  memberDob: z.date({ required_error: 'Date of birth is required' }),
  memberAge: z.number().optional(),
  memberMediCalNum: z.string().min(1, 'Medi-Cal number is required'),
  confirmMemberMediCalNum: z.string(),
  memberMrn: z.string().min(1, 'MRN is required'),
  confirmMemberMrn: z.string(),
  memberLanguage: z.string().min(1, 'Preferred language is required'),
  referrerFirstName: z.string().min(1, 'First name is required'),
  referrerLastName: z.string().min(1, 'Last name is required'),
  referrerEmail: z.string().email(),
  referrerPhone: z.string().min(1, 'Phone number is required'),
  referrerRelationship: z.string().min(1, 'Relationship is required'),

  // Step 2
  memberPhone: z.string().optional(),
  memberEmail: z.string().email().optional(),
  isBestContact: z.boolean().default(false),
  bestContactName: z.string().optional(),
  bestContactRelationship: z.string().optional(),
  bestContactPhone: z.string().optional(),
  bestContactEmail: z.string().email().optional(),
  bestContactLanguage: z.string().optional(),
  hasCapacity: z.enum(['Yes', 'No', 'Unknown']),
  hasLegalRep: z.enum(['Yes', 'No']).optional(),
  repName: z.string().optional(),
  repRelationship: z.string().optional(),
  repPhone: z.string().optional(),
  repEmail: z.string().email().optional(),
  repLanguage: z.string().optional(),

  // Step 3
  currentLocation: z.string().min(1, 'Current location is required'),
  currentAddress: z.string().min(1, 'Address is required'),
  currentCity: z.string().min(1, 'City is required'),
  currentState: z.string().min(1, 'State is required'),
  currentZip: z.string().min(1, 'ZIP code is required'),
  copyAddress: z.boolean().default(false),
  customaryAddress: z.string().optional(),
  customaryCity: z.string().optional(),
  customaryState: z.string().optional(),
  customaryZip: z.string().optional(),
  healthPlan: z.enum(['Kaiser', 'Health Net', 'Other']),

  // Step 4
  pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
  eligibilityCriteria: z.array(z.string()).refine(value => value.some(item => item), {
    message: "You must select at least one eligibility criterion.",
  }),
  ispContactName: z.string().min(1, 'ISP contact name is required'),
  ispContactAgency: z.string().min(1, 'Agency is required'),
  ispContactPhone: z.string().min(1, 'Phone is required'),
  hasPrefRCFE: z.enum(['Yes', 'No']),
})
.refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
  message: "Medi-Cal numbers don't match",
  path: ["confirmMemberMediCalNum"],
})
.refine(data => data.memberMrn === data.confirmMemberMrn, {
    message: "MRNs don't match",
    path: ["confirmMemberMrn"],
});

export type FormValues = z.infer<typeof formSchema>;

const steps = [
  { id: 1, name: 'Member & Referrer Info' },
  { id: 2, name: 'Contact & Legal Info' },
  { id: 3, name: 'Location & Health Plan' },
  { id: 4, name: 'Pathway & Eligibility' },
];

export default function CsSummaryFormPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();
  const { toast } = useToast();

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberFirstName: '',
      memberLastName: '',
      memberMediCalNum: '',
      confirmMemberMediCalNum: '',
      memberMrn: '',
      confirmMemberMrn: '',
      memberLanguage: '',
      referrerFirstName: '',
      referrerLastName: '',
      referrerEmail: '',
      referrerPhone: '',
      referrerRelationship: '',
      eligibilityCriteria: [],
      memberPhone: '',
      memberEmail: '',
      bestContactName: '',
      bestContactRelationship: '',
      bestContactPhone: '',
      bestContactEmail: '',
      bestContactLanguage: '',
      repName: '',
      repRelationship: '',
      repPhone: '',
      repEmail: '',
      repLanguage: '',
      currentLocation: '',
      currentAddress: '',
      currentCity: '',
      currentState: '',
      currentZip: '',
      customaryAddress: '',
      customaryCity: '',
      customaryState: '',
      customaryZip: '',
      ispContactName: '',
      ispContactAgency: '',
      ispContactPhone: '',
    }
  });

  const { trigger, handleSubmit } = methods;

  const nextStep = async () => {
    const isValid = await trigger(); // You can pass field names for the current step
    if (isValid) {
      if (currentStep < steps.length) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = (data: FormValues) => {
    console.log(data);
    toast({
      title: 'Application Submitted!',
      description: 'Your CS Member Summary has been received.',
      className: 'bg-green-100 text-green-900 border-green-200',
    });
    router.push('/pathway?applicationId=new-app-123');
  };

  const progress = (currentStep / steps.length) * 100;

  return (
    <>
      <Header />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex-grow">
          <div className="container mx-auto px-4 py-8 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold">CS Member Summary</h1>
                    <span className="text-sm font-medium text-muted-foreground">
                        Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
                    </span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>

              <div className="min-h-[450px]">
                {currentStep === 1 && <Step1 />}
                {currentStep === 2 && <Step2 />}
                {currentStep === 3 && <Step3 />}
                {currentStep === 4 && <Step4 />}
              </div>

              <div className="mt-8 pt-5 border-t flex justify-between">
                <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Previous Step
                </Button>
                {currentStep < steps.length ? (
                  <Button type="button" onClick={nextStep}>
                    Next Step
                  </Button>
                ) : (
                  <Button type="submit">Submit Application</Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </FormProvider>
    </>
  );
}
