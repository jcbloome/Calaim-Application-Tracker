'use client';

import React from 'react';
import Link from 'next/link';
import {
  Info,
  HelpCircle,
  Users,
  Building,
  HeartHandshake,
  KeyRound,
  Home,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { PrintableProgramInfo } from './components/PrintableProgramInfo';
import { Button } from '@/components/ui/button';

const infoSections = [
    {
        icon: HelpCircle,
        title: "What is the California Assisted Living and Innovating Medi-Cal (CalAIM) Program?",
        content: "CalAIM is California's long-term initiative to transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and creating a more seamless and consistent system. It aims to achieve this through a focus on \"whole person care,\" which includes addressing social determinants of health, integrating physical, mental, and social services, and launching new programs like Enhanced Care Management (ECM) and Community Supports. Community Supports (CS) are administered through managed care plans (MCPs)."
    },
    {
        icon: Users,
        title: "Community Supports for Assisted Living Transitions",
        content: "There are 14 Community Supports (CS) and Assisted Living Transitions is one of them. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility, promoting greater independence and community integration."
    },
    {
        icon: HeartHandshake,
        title: "The Role of Connections Care Home Consultants",
        content: "Connections is a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS. Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination."
    },
    {
        icon: Building,
        title: "Managed Care Plans We Work With",
        content: "You must be a member of one of these plans to utilize our services for the CalAIM Community Support for Assisted Living Transitions. <ul class='list-disc pl-5 mt-2'><li><strong>Health Net:</strong> Serving members in Sacramento and Los Ángeles counties.</li><li><strong>Kaiser Permanente:</strong> Serving members in various counties throughout California.</li></ul>"
    },
    {
        icon: Home,
        title: "Types of Assisted Living (RCFEs/ARFs)",
        content: "Assisted living facilities in California (also known as residential care facilities for the elderly - RCFEs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs: <ul class='list-disc pl-5 mt-2'><li><strong>Small, Home-Like Settings:</strong> These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.</li><li><strong>Large, Community Settings:</strong> These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support.</li></ul>"
    },
    {
        icon: KeyRound,
        title: "ARF vs. RCFE: What's the Difference?",
        content: "In California, the key difference between an Adult Residential Facility (ARF) and a Residential Care Facility for the Elderly (RCFE) is the age of the residents they serve. ARFs provide non-medical care and supervision to adults aged 18 to 59, often with disabilities or other conditions. RCFEs, on the other hand, are specifically for individuals 60 years and older who need assistance with daily living activities."
    }
]

export default function ProgramInfoPage() {

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 print:bg-white">
      <Header />
      <main className="flex-grow flex items-center justify-center py-8 px-4 sm:px-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Main container for online view */}
          <div className="bg-card rounded-lg border shadow-sm p-6 sm:p-8 print:hidden">
             <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Program Information</h1>
                <p className="mt-2 text-md text-muted-foreground">
                    The Connections Care Home Consultants application portal for the California Advancing and Innovating Medi-Cal (CalAIM) Community Support for Assisted Transitions (SNF Diversion/Transition) for Health Net and Kaiser.
                </p>
             </div>
             <div className="flex justify-end mb-6">
                <GlossaryDialog />
             </div>

             <div className="space-y-4">
                {infoSections.map((section, index) => (
                    <Card key={index} className="bg-background/80">
                        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                            <div className="bg-primary/10 p-2 rounded-full">
                                <section.icon className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-lg text-gray-900">{section.title}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{__html: section.content }}/>
                        </CardContent>
                    </Card>
                ))}
             </div>
             <div className="mt-8 pt-5 border-t flex justify-between">
                <Button variant="outline" asChild>
                    <Link href="/">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                    </Link>
                </Button>
                <Button asChild>
                    <Link href="/applications">
                        Next <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
              </div>
          </div>

          {/* Content for print view */}
          <div className="hidden print:block">
            <PrintableProgramInfo />
          </div>
        </div>
      </main>
    </div>
  );
}
