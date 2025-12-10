
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

const allSections = [
    // Page 1
    {
        page: 1,
        icon: HelpCircle,
        title: "What is CalAIM?",
        content: ["CalAIM (California Advancing and Innovating Medi-Cal) is a long-term initiative by the state of California to transform the Medi-Cal program. Its goals are to improve health outcomes, reduce health disparities, and create a more integrated and seamless healthcare system. This portal focuses on one specific part of CalAIM: the Community Supports service for assisted living transitions."]
    },
    {
        page: 1,
        icon: Users,
        title: "Community Support for Assisted Living Transitions",
        content: ["There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration.", "The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings."]
    },
    {
        page: 1,
        icon: HeartHandshake,
        title: "The Role of Connections Care Home Consultants",
        content: ["For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS. Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination."]
    },
    {
        page: 1,
        icon: Building,
        title: "Managed Care Plans We Work With",
        content: ["You must be a member of one of these plans to utilize us for the CS for Assisted Transitions."],
        list: [
            "Health Net: Serving members in Sacramento and Los Ángeles counties.",
            "Kaiser Permanente: Serving members in various counties throughout California."
        ]
    },
    {
        page: 1,
        icon: Home,
        title: "Types of Assisted Living (RCFEs/ARFs)",
        content: ["Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:"],
        list: [
            "Small, Home-Like Settings: These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.",
            "Large, Community Settings: These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support."
        ]
    },
    {
        page: 1,
        icon: KeyRound,
        title: "ARF vs. RCFE: What's the Difference?",
        content: ["In California, the key difference between an Adult Residential Facility (ARF) and a Residential Care Facility for the Elderly (RCFE) is the age of the residents they serve. ARFs provide non-medical care and supervision to adults aged 18 to 59, often with disabilities or other conditions. RCFEs, on the other hand, are specifically for individuals 60 years and older who need assistance with daily living activities."]
    },
    // Page 2
    {
        page: 2,
        icon: HelpCircle,
        title: "Medicare vs. Medi-Cal: A Quick Guide",
        content: [
            "Medicare is a federal health insurance program primarily for people aged 65 or older and some younger people with disabilities. It typically covers doctor visits, hospital stays, and rehabilitation days in a Skilled Nursing Facility (usually 20 days at 100% and the next 80 days at 80%).",
            "Medi-Cal (California's Medicaid program) is a state and federal program providing health coverage to low-income individuals. CalAIM is a Medi-Cal program administered by Medi-Cal Managed Care Plans (MCPs) and is not related to Medicare. However, Medicare-covered days in a hospital or SNF do count towards the 60-day continuous stay requirement for the SNF Transition pathway.",
            "If a member has a Medicare plan that also offers CalAIM (e.g., Kaiser), they might need to have both components with the same MCP."
        ]
    },
    {
        page: 2,
        icon: DollarSign,
        title: "'Room and Board' and 'Assisted Living' Payments",
        content: [
            'The member pays a "Room and Board" portion (usually dependent on a member\'s social security income). Members who receive more than $1,599/month, usually pay $1,420 to the RCFE/ARF and the member retains $179 for personal need expenses. Members who receive less this amount may be eligible for a Non Medical Out of Home Care (NMOCH) payment up to $1,599 (in 2025, but this amount is subject to change annually). For more information see the California Assisted Living Association website.',
            'For members who receive less than $1,420 and who are not eligible for the NMOHC, the amount of "Room and Board" payment might be negotiable with the RCFE/ARF administrator (usually based on tiered level of care and market rate for a private-paid member with the similar care needs). The majority of CalAIM members are given shared rooms for the program. Members who receive more than $1,599 or who have family members willing to contribute more for "room and board" might have the option for private rooms.',
            'As part of the application process a Room and Board Obligation Statement is signed between the member/A.R. and RCFE/ARF that the parties agree to pay their respective "Room and Board" and "Assisted Living" portions. This form is generated prior to the application being submitted to the MCP.'
        ]
    },
    {
        page: 2,
        icon: DollarSign,
        title: "Medi-Cal Share of Cost (SOC)",
        content: [
            'Members participating in CalAIM are not allowed to have a Medi-Cal SOC.',
            'When you apply for Medi-Cal and are over the income limit for free Medi-Cal, you may still qualify for Medi-Cal with a share of cost. A share of cost (SOC) is the amount of money you must pay each month towards medical related services, supplies, or equipment before your Medi-Cal insurance pays anything, similar to a deductible.',
            'The most common way to reduce or avoid a SOC is to purchase supplemental health insurance policies to lower countable income, such as supplemental dental, vision, or a Medicare Part D prescription drug plan.',
            'Members can also eliminate SOC by paying more for the "room and board" portion and providing this information but this might only be viable once the member moves into the RCFE/ARF and can present a signed contract to Medi-Cal. For more Medi-Cal SOC information see the California Association of Nursing Home Reform (CANHR) website: https://canhr.org/understanding-the-share-of-cost-for-medi-cal/.'
        ]
    },
    {
        page: 2,
        icon: Building,
        title: "BenefitsCal Resource",
        content: [
            'BenefitsCal is a one-stop online portal to manage Medi-Cal benefits. This would include, for example, checking Medi-Cal eligibility, determining if there is any share of cost and, if necessary, uploading documents to eliminate share of cost (for example, RCFE/ARF admission agreement showing monthly rent). Visit BenefitsCal.com.',
        ]
    },
    {
        page: 2,
        icon: AlertTriangle,
        title: "Important Note on Switching to Health Net",
        content: [
            'To enroll in the CalAIM program through Connections, you must be a member of Health Net or Kaiser. If you are currently in another Medi-Cal managed care plan, you will need to switch. You can change your health plan by contacting California Health Care Options at 1-800-430-4263 or visiting their website at www.healthcareoptions.dhcs.ca.gov. Changes must be made by the end of the month to be effective on the first day of the following month.',
        ]
    },
    {
        page: 2,
        icon: AlertTriangle,
        title: "Important Note on Switching to Health Net (when randomly assigned to Molina)",
        content: [
            'In California, Health Net and Molina co-share the managed Medi-Cal market. Sometimes, individuals who request to switch from another health plan to Health Net are randomly assigned to Molina. If this happens, you or the family/member will need to call Health Net Member Services at 800-675-6110 and specifically request to be switched to the Health Net full Medi-Cal managed care plan in order to access the CalAIM Community Supports.',
        ]
    },
    // Page 3
    {
        page: 3,
        icon: FileCheck2,
        title: "Next Steps: Starting the Application",
        content: ["Once you have reviewed all the program information, the next step is to begin the application process. You can start a new application or continue an existing one from your dashboard. Our portal will guide you through each required form and document upload. If you have any questions along the way, please don't hesitate to contact us. We are here to help you navigate the process and find the best care setting for your needs."]
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
      const sections = allSections.filter(section => section.page === currentPage);
      return (
          <div className="space-y-4">
              {sections.map((section) => (
                  <Card key={section.title} className="bg-background/80">
                      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                          <div className="bg-primary/10 p-2 rounded-full">
                              <section.icon className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                              <CardTitle className="text-lg text-gray-900">{section.title}</CardTitle>
                          </div>
                      </CardHeader>
                      <CardContent className="prose prose-sm max-w-none text-gray-700">
                          {section.content.map((paragraph, pIndex) => (
                            <p key={pIndex} className="mb-4 last:mb-0">
                                {paragraph}
                            </p>
                          ))}
                          {section.list && (
                              <ul className="list-disc pl-5 mt-2">
                                  {section.list.map((item, lIndex) => <li key={lIndex}>{item}</li>)}
                              </ul>
                          )}
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
            <div className="mb-8 flex justify-between items-center gap-4">
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

    
