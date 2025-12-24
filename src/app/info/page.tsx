
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    ArrowRight,
    FileCheck2,
    Users,
    HeartHandshake,
    Home,
    Info,
    Shield,
    DollarSign,
    ClipboardList,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { useUser } from '@/firebase';

const allSections = [
    {
        icon: Info,
        title: "What is CalAIM?",
        content: ["CalAIM (California Advancing and Innovating Medi-Cal) is a long-term initiative by the state of California to transform the Medi-Cal program. Its goals are to improve health outcomes, reduce health disparities, and create a more integrated and seamless healthcare system. This portal focuses on one specific part of CalAIM: the Community Supports service for assisted living transitions."]
    },
    {
        icon: Users,
        title: "Community Support for Assisted Living Transitions",
        content: ["There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration.", "The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings."]
    },
    {
        icon: HeartHandshake,
        title: "The Role of Connections Care Home Consultants",
        content: ["For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS. Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination."]
    },
    {
        icon: Home,
        title: "Types of Assisted Living (RCFEs/ARFs)",
        content: ["Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:"],
        list: [
            "Small, Home-Like Settings: These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.",
            "Large, Community Settings: These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support."
        ]
    },
    {
        icon: Shield,
        title: "Managed Care Plans We Work With",
        content: ["You must be a member of one of these plans to utilize us for the CS for Assisted Transitions."],
        list: [
            "Health Net: Serving members in Sacramento and Los Ángeles counties.",
            "Kaiser Permanente: Serving members in various counties throughout California."
        ]
    },
    {
        icon: ArrowRight,
        title: "Switching to Health Net or Kaiser",
        content: ["To enroll in this CalAIM program through Connections, you must be a member of Health Net or Kaiser. If you are in another Medi-Cal managed care plan, you will need to switch.", "You can change your health plan by contacting California Health Care Options at 1-800-430-4263 or visiting their website. Generally, changes made by the end of the month are effective on the first day of the following month."],
        link: "https://www.healthcareoptions.dhcs.ca.gov/en/enroll"
    },
    {
        icon: Info,
        title: "What if I am assigned to Molina?",
        content: ["When applying for Medi-Cal in Los Angeles County, many people are automatically assigned to the Molina health plan. Since we are not contracted with Molina for this specific program, you will need to switch to either Health Net or Kaiser to work with us. You can do this by contacting Health Care Options at the number provided above."]
    },
    {
        icon: DollarSign,
        title: "Share of Cost (SOC)",
        content: ["A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay. This happens when your income is above the limit for free Medi-Cal but you still qualify for the program.", "Members participating in the CalAIM Community Supports program are not permitted to have a SOC. It must be eliminated before the application can be approved. A common way to do this is by purchasing supplemental health, dental, or vision insurance, which can lower your 'countable' income and remove the SOC."]
    },
    {
        icon: Home,
        title: "Room & Board Obligation",
        content: ["The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is responsible for paying the RCFE the 'assisted living' portion.", "For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for 'room and board'. Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for 'room and board' for a private room or to open up RCFEs in more expensive areas.", "Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family)."]
    },
    {
        icon: ClipboardList,
        title: "What is an Individual Service Plan (ISP)?",
        content: ["An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the 'assisted living' portion). For Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is determined by Kaiser."]
    },
    {
        icon: Shield,
        title: "Medicare vs. Medi-Cal",
        content: ["Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit. While they are different, Medicare-covered days in a facility can count toward the 60-day stay requirement for the SNF Transition pathway."]
    },
    {
        icon: FileCheck2,
        title: "Let's Get Started!",
        content: ["You've reviewed the program details. The next step is to begin the application for the member."],
        isAction: true,
    }
];

const sectionsByPage = [
    [allSections[0], allSections[1], allSections[2], allSections[3]], // Page 1
    [allSections[4], allSections[5], allSections[6]], // Page 2
    [allSections[7], allSections[8], allSections[9], allSections[10], allSections[11]], // Page 3
];


export default function ProgramInfoPage() {
  const [currentPage, setCurrentPage] = useState(0);
  const { user } = useUser();

  const handleNext = () => {
    if (currentPage < sectionsByPage.length - 1) {
      setCurrentPage(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 print:bg-white">
      <Header />
      <main className="flex-grow flex items-center justify-center py-8 px-4 sm:px-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Main container for online view */}
          <div className="bg-card rounded-lg border shadow-sm p-4 sm:p-8 print:hidden">

            <div className="mb-4 text-center">
              <h1 className="text-3xl font-bold tracking-tight">Program Information ({currentPage + 1}/{sectionsByPage.length})</h1>
              <p className="mt-2 text-md text-muted-foreground">
                An overview of the CalAIM program and our services. Please review before starting an application.
              </p>
               <div className="flex justify-center mt-4">
                 <GlossaryDialog className="shadow-sm" />
               </div>
            </div>

            <div className="space-y-4 md:space-y-6">
              {sectionsByPage[currentPage].map((section) => (
                  <Card key={section.title} className="bg-background/80 flex flex-col">
                      <CardHeader className="flex-row items-center gap-4 space-y-0">
                          <div className="bg-primary/10 p-2 rounded-lg">
                            <section.icon className="h-6 w-6 text-primary" />
                          </div>
                          <CardTitle className="text-lg text-gray-900">{section.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="prose prose-sm max-w-none text-gray-700 flex-grow flex flex-col">
                          {section.content.map((paragraph, pIndex) => (
                            <p key={pIndex} className="mb-4 last:mb-0">
                                {paragraph}
                            </p>
                          ))}
                          {section.list && (
                              <ul className="list-disc pl-5 mt-2 space-y-2">
                                  {section.list.map((item, lIndex) => <li key={lIndex}>{item}</li>)}
                              </ul>
                          )}
                           {section.link && (
                              <Button asChild variant="link" className="px-0 -mt-2">
                                <a href={section.link} target="_blank" rel="noopener noreferrer">
                                  Go to Health Care Options <ArrowRight className="ml-2 h-4 w-4" />
                                </a>
                              </Button>
                           )}
                           {section.isAction && (
                            <div className="mt-auto pt-4">
                                <Button asChild className="mt-4">
                                   <Link href={user ? "/applications" : "/login"}>
                                      Start Application <FileCheck2 className="ml-2 h-4 w-4" />
                                   </Link>
                                </Button>
                            </div>
                          )}
                      </CardContent>
                  </Card>
              ))}
            </div>
             
            <div className="mt-8 pt-5 border-t flex justify-between items-center">
              <Button variant="outline" onClick={handlePrev} disabled={currentPage === 0}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              {currentPage < sectionsByPage.length - 1 && (
                 <Button onClick={handleNext}>
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
