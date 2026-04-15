
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PublicHeader } from '@/components/PublicHeader';
import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GlossaryDialog } from '@/components/GlossaryDialog';

interface InfoSection {
  title: string;
  content: string[];
  list?: string[];
  website?: string;
}

const infoSections: InfoSection[] = [
  {
    title: 'What is the California Advancing and Innovating Medi-Cal program?',
    content: [
      "California Advancing and Innovating Medi-Cal (CalAIM) is California's statewide effort to improve Medi-Cal by focusing on whole-person care, reducing health disparities, and better coordinating medical and social services through managed care plans.",
      "CalAIM has two components: Enhanced Care Management (ECM), which provides ongoing case management for members with complex care needs, and Community Supports (CS), optional Medi-Cal services that address needs affecting health outcomes. This portal is related to one CS service, Assisted Living Transitions, which helps eligible members in skilled nursing facilities or in the community who are at risk of premature institutionalization transition to assisted living settings.",
    ],
  },
  {
    title: 'The Role of Connections Care Home Consultants',
    content: [
      'For 35 years Connections has helped private paid families find care homes. We are excited to also help Medi-Cal members find care home placement as a Community Support partner with CalAIM MCPs. Our role is to assist with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your MCP to request authorization for the CS.',
    ],
  },
   {
    title: 'Types of Assisted Living (RCFEs/ARFs)',
    content: [
      'Assisted living--also known as residential care facilities for the elderly (RCFEs) or adult residential facilities (ARFs)--comes in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:',
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
 
];


export default function InfoPage() {
  return (
    <>
      <PublicHeader />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="mb-10">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Program Information
              </h1>
              <div className="mt-4">
                <GlossaryDialog />
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
                    <span className="text-sm text-muted-foreground">Page 1 of 4</span>
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
