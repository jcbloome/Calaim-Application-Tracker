
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
import { ArrowRight } from 'lucide-react';

const infoSections = [
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
      "For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS.",
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
        "Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit. While they are different, Medicare-covered days in a facility can count toward the 60-day stay requirement for the SNF Transition pathway.",
    ],
  },
];


export default function InfoPage() {
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Program Information
          </h1>
          <p className="mt-2 text-md sm:text-lg text-muted-foreground max-w-3xl mx-auto">
            Understanding the CalAIM Community Supports program for Assisted Living Transitions.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
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
                </CardContent>
            </Card>
          ))}
            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 mt-4 border-t gap-4">
                <span className="text-sm text-muted-foreground">Page 1 of 3</span>
                <Button asChild>
                    <Link href="/info/details">
                        Next <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
      </main>
    </>
  );
}
