
'use client';

import React, { useState } from 'react';
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
  DollarSign,
  FileCheck2,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { PrintableProgramInfo } from './components/PrintableProgramInfo';
import { Button } from '@/components/ui/button';

const page1Sections = [
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
];

const page2Sections = [
    {
        icon: HelpCircle,
        title: "Medicare vs. Medi-Cal: A Quick Guide",
        content: "<p><strong>Medicare</strong> is a federal health insurance program primarily for people aged 65 or older and some younger people with disabilities. It typically covers doctor visits, hospital stays, and rehabilitation days in a Skilled Nursing Facility (usually 20 days at 100% and the next 80 days at 80%).</p><p class='mt-2'><strong>Medi-Cal</strong> (California's Medicaid program) is a state and federal program providing health coverage to low-income individuals. <strong>CalAIM is a Medi-Cal program administered by Medi-Cal Managed Care Plans (MCPs) and is not related to Medicare.</strong> However, Medicare-covered days in a hospital or SNF do count towards the 60-day continuous stay requirement for the SNF Transition pathway.</p><p class='mt-2'>If a member has a Medicare plan that also offers CalAIM (e.g., Kaiser), they might need to have both components with the same MCP.</p>"
    },
    {
        icon: DollarSign,
        title: "'Room and Board' and 'Assisted Living' Payments",
        content: `
            <p>The member pays a "Room and Board" portion (usually dependent on a member's social security income). Members who receive more than $1,599/month, usually pay $1,420 to the RCFE/ARF and the member retains $179 for personal need expenses. Members who receive less this amount may be eligible for a Non Medical Out of Home Care (NMOCH) payment up to $1,599 (in 2025, but this amount is subject to change annually). For more information see the California Assisted Living Association <a href='#' class='text-primary underline'>website</a>.</p>
            <p class='mt-2'>For members who receive less than $1,420 and who are not eligible for the NMOHC, the amount of "Room and Board" payment might be negotiable with the RCFE/ARF administrator (usually based on tiered level of care and market rate for a private-paid member with the similar care needs). The majority of CalAIM members are given shared rooms for the program. Members who receive more than $1,599 or who have family members willing to contribute more for "room and board" might have the option for private rooms.</p>
            <p class='mt-2'>As part of the application process a Room and Board Obligation Statement is signed between the member/A.R. and RCFE/ARF that the parties agree to pay their respective "Room and Board" and "Assisted Living" portions. This form is generated prior to the application being submitted to the MCP.</p>
        `
    },
    {
        icon: DollarSign,
        title: "Medi-Cal Share of Cost (SOC)",
        content: `
            <p>Members participating in CalAIM are not allowed to have a Medi-Cal SOC.</p>
            <p class='mt-2'>When you apply for Medi-Cal and are over the income limit for free Medi-Cal, you may still qualify for Medi-Cal with a share of cost. A share of cost (SOC) is the amount of money you must pay each month towards medical related services, supplies, or equipment before your Medi-Cal insurance pays anything, similar to a deductible.</p>
            <p class='mt-2'>The most common way to reduce or avoid a SOC is to purchase supplemental health insurance policies to lower countable income, such as supplemental dental, vision, or a Medicare Part D prescription drug plan.</p>
            <p class='mt-2'>Members can also eliminate SOC by paying more for the "room and board" portion and providing this information but this might only be viable once the member moves into the RCFE/ARF and can present a signed contract to Medi-Cal. For more Medi-Cal SOC information see the California Association of Nursing Home Reform (CANHR) website: <a href='https://canhr.org/understanding-the-share-of-cost-for-medi-cal/' target='_blank' rel='noopener noreferrer' class='text-primary underline'>https://canhr.org/understanding-the-share-of-cost-for-medi-cal/</a>.</p>
        `
    },
    {
        icon: Building,
        title: "BenefitsCal Resource",
        content: `
            <p>BenefitsCal is a one-stop online portal to manage Medi-Cal benefits. This would include, for example, checking Medi-Cal eligibility, determining if there is any share of cost and, if necessary, uploading documents to eliminate share of cost (for example, RCFE/ARF admission agreement showing monthly rent). <a href='https://benefitscal.com/' target='_blank' rel='noopener noreferrer' class='text-primary underline'>Visit BenefitsCal.com</a>.</p>
        `
    },
    {
        icon: AlertTriangle,
        title: "Important Note on Switching to Health Net",
        content: `
            <p>To enroll in the CalAIM program through Connections, you must be a member of Health Net or Kaiser. If you are currently in another Medi-Cal managed care plan, you will need to switch. You can change your health plan by contacting <strong>California Health Care Options at 1-800-430-4263</strong> or visiting their website at <a href='https://www.healthcareoptions.dhcs.ca.gov' target='_blank' rel='noopener noreferrer' class='text-primary underline'>www.healthcareoptions.dhcs.ca.gov</a>. Changes must be made by the end of the month to be effective on the first day of the following month.</p>
        `
    },
    {
        icon: AlertTriangle,
        title: "Important Note on Switching to Health Net (when randomly assigned to Molina)",
        content: `
            <p>In California, Health Net and Molina co-share the managed Medi-Cal market. Sometimes, individuals who request to switch from another health plan to Health Net are randomly assigned to Molina. If this happens, you or the family/member will need to call <strong>Health Net Member Services at 800-675-6110</strong> and specifically request to be switched to the <strong>Health Net full Medi-Cal managed care plan</strong> in order to access the CalAIM Community Supports.</p>
        `
    }
];

const page3Sections = [
    {
        icon: FileCheck2,
        title: "Next Steps: Starting the Application",
        content: "<p>Once you have reviewed all the program information, the next step is to begin the application process. You can start a new application or continue an existing one from your dashboard.</p><p class='mt-2'>Our portal will guide you through each required form and document upload. If you have any questions along the way, please don't hesitate to contact us. We are here to help you navigate the process and find the best care setting for your needs.</p>"
    }
];

export default function ProgramInfoPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 3;

  const handleNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(p => p + 1);
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    if (currentPage > 1) {
      setCurrentPage(p => p - 1);
      window.scrollTo(0, 0);
    }
  };
  
  const renderPageContent = () => {
      let sections;
      switch (currentPage) {
          case 1:
              sections = page1Sections;
              break;
          case 2:
              sections = page2Sections;
              break;
          case 3:
              sections = page3Sections;
              break;
          default:
              sections = page1Sections;
              break;
      }

      return (
          <div className="space-y-4">
              {sections.map((section, index) => (
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
                          <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{__html: section.content }}/>
                      </CardContent>
                  </Card>
              ))}
          </div>
      );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 print:bg-white">
      <Header />
      <main className="flex-grow flex items-center justify-center py-8 px-4 sm:px-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Main container for online view */}
          <div className="bg-card rounded-lg border shadow-sm p-6 sm:p-8 print:hidden">
             <div className="mb-6 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Program Information</h1>
                    <p className="mt-2 text-md text-muted-foreground">
                        An overview of the CalAIM program and our services.
                    </p>
                </div>
                <GlossaryDialog />
             </div>

             {renderPageContent()}
             
             <div className="mt-8 pt-5 border-t flex justify-between items-center">
                
                {currentPage === 1 ? (
                    <Button variant="outline" asChild>
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Link>
                    </Button>
                ) : (
                    <Button variant="outline" onClick={handleBack}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                )}

                <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                </div>

                {currentPage === totalPages ? (
                     <Button asChild>
                        <Link href="/applications">
                            Start Application <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                ) : (
                    <Button onClick={handleNext}>
                        Continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                )}
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
