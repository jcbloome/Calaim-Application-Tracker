
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Header } from '@/components/Header';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { GlossaryDialog } from '@/components/GlossaryDialog';

interface InfoSection {
  title: string;
  content: string[];
  list?: string[];
  website?: string;
}

const infoSections: InfoSection[] = [
  {
    title: 'What is CalAIM?',
    content: [
        "California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and creating a more seamless and consistent system. It aims to achieve this through a focus on 'whole person care,' which includes addressing social determinants of health, integrating physical, mental, and social services, and launching new programs like Enhanced Care Management (ECM) and Community Supports (CS). ECM and CS are administered through managed care plans (MCPs).",
    ],
  },
  {
    title: 'Community Support for Assisted Living Transitions',
    content: [
      "There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration.",
      "The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings.",
    ],
  },
  {
    title: 'The Role of Connections Care Home Consultants',
    content: [
      "For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your MCP to request authorization for the CS.",
      "Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.",
    ],
  },
   {
    title: 'Types of Assisted Living (RCFEs/ARFs)',
    content: [
      'Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:',
    ],
    list: [
      'Small, Home-Like Settings: These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.',
      'Large, Community Settings: These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support.',
    ],
  },
    {
    title: 'Medicare vs. Medi-Cal',
    content: [
        "Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit.",
    ],
  },
  {
    title: 'Benefitscal.com & Share of Cost (SOC)',
    content: [
        "A one stop shop to apply and review Medi-Cal benefits including possible share of cost information and to add for the member an authorized representative/power of attorney.",
        "Share of Cost (SOC) is usually triggered if a member receives more than $1,800/month, although this number can vary by county and by particular circumstances. Members in SNFs may not show a SOC since the facility receives most of their income, but this may change when transitioning to community living.",
    ],
    website: 'www.benefitscal.com',
  },
];


export default function InfoPage() {
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="mb-10">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Program Information
              </h1>
              <div className="mt-4">
                <GlossaryDialog className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600" />
              </div>
            </div>

            {infoSections.map((section, index) => (
                <Card key={index} className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl sm:text-2xl">{section.title}</CardTitle>
                </CardHeader>
                    <CardContent className="prose prose-sm max-w-none text-gray-700">
                        {section.content.map((paragraph, pIndex) => (
                        <p key={pIndex} className="mb-4 last:mb-0">
                            {paragraph}
                        </p>
                        ))}
                        {section.list && (
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            {section.list.map((item, i) => (
                            <li key={i}>{item}</li>
                            ))}
                        </ul>
                        )}
                        {section.website && (
                        <p className="mt-4 text-sm text-gray-700">
                            Visit <a 
                                href={`https://${section.website}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                                {section.website}
                            </a> for more information.
                        </p>
                        )}
                    </CardContent>
                </Card>
            ))}
            <div className="mt-8 w-full border-t pt-4">
                <div className="text-left mb-2">
                    <span className="text-sm text-muted-foreground">Page 1 of 3</span>
                </div>
                <div className="flex justify-end">
                    <Link href="/info/details" className="text-sm font-medium text-primary hover:underline">
                        Next <ArrowRight className="ml-1 h-4 w-4 inline" />
                    </Link>
                </div>
            </div>
        </div>
      </main>
    </>
  );
}
