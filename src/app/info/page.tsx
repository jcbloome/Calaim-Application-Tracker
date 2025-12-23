
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    HelpCircle,
    Users,
    Building,
    HeartHandshake,
    Home,
    ArrowLeft,
    ArrowRight,
    FileCheck2,
    BookText,
    Network,
    Shuffle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { PrintableProgramInfo } from './components/PrintableProgramInfo';
import { Button } from '@/components/ui/button';
import { GlossaryDialog } from '@/components/GlossaryDialog';

const allSections = [
    {
        icon: HelpCircle,
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
        icon: Building,
        title: "Managed Care Plans We Work With",
        content: ["You must be a member of one of these plans to utilize us for the CS for Assisted Transitions."],
        list: [
            "Health Net: Serving members in Sacramento and Los Ángeles counties.",
            "Kaiser Permanente: Serving members in various counties throughout California."
        ]
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
        icon: BookText,
        title: "What is an Individual Service Plan (ISP)?",
        content: ["An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization."]
    },
    {
        icon: Network,
        title: "Medicare vs. Medi-Cal",
        content: ["Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit. While they are different, Medicare-covered days in a facility can count toward the 60-day stay requirement for the SNF Transition pathway."]
    },
    {
        icon: Shuffle,
        title: "Switching to Health Net or Kaiser",
        content: ["To enroll in this CalAIM program through Connections, you must be a member of Health Net or Kaiser. If you are in another Medi-Cal managed care plan, you will need to switch.", "You can change your health plan by contacting California Health Care Options at 1-800-430-4263. Generally, changes made by the end of the month are effective on the first day of the following month."]
    }
];

const sectionsByPage = [
    [allSections[0], allSections[1], allSections[2]],
    [allSections[3], allSections[4], allSections[5]],
    [allSections[6], allSections[7]],
];

export default function ProgramInfoPage() {
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < sectionsByPage.length - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev + 1);
    }
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 print:bg-white">
      <Header />
      <main className="flex-grow flex items-center justify-center py-8 px-4 sm:px-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Main container for online view */}
          <div className="bg-card rounded-lg border shadow-sm p-4 sm:p-8 print:hidden">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Program Information ({currentPage + 1}/{sectionsByPage.length})</h1>
                <p className="mt-2 text-md text-muted-foreground">
                    An overview of the CalAIM program and our services. Please review before starting an application.
                </p>
                 <GlossaryDialog className="p-0 h-auto" />
            </div>

            <div className="space-y-4">
              {sectionsByPage[currentPage].map((section) => (
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
             
            <div className="mt-8 pt-5 border-t flex justify-between items-center">
              <Button variant="outline" onClick={handlePrev} disabled={currentPage === 0}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              {currentPage < sectionsByPage.length - 1 ? (
                 <Button onClick={handleNext}>
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button asChild>
                    <Link href="/applications">
                        Start Application <FileCheck2 className="ml-2 h-4 w-4" />
                    </Link>
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
