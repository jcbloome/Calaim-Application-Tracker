
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
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { GlossaryDialog } from '@/components/GlossaryDialog';

const infoSections = [
   {
    title: 'Room & Board Payments',
    content: [
        "The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is responsible for paying the RCFE the 'assisted living' portion. Also, many RCFEs might choose not to work with CalAIM.",
        "For members eligible for the Non-Medical Out-of-Home Care (NMOHC) payment, their SSI/SSP benefit is used to cover the cost of 'room and board' at the facility. From this benefit, the member retains a portion for personal needs, and the remaining balance is paid directly to the RCFE. Members with higher incomes may be required to contribute more, which can also provide access to private rooms or facilities in more expensive areas.",
        "Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family).",
    ],
  },
  {
    title: 'Share of Cost (SOC)',
    content: [
        "A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay.",
        "This happens when your income is above the limit for free Medi-Cal but you still qualify for the program.",
        "Members participating in the CalAIM Community Supports program are not permitted to have a SOC. It must be eliminated before the application can be approved. A common way to do this is by purchasing supplemental health, dental, or vision insurance, which can lower your 'countable' income and remove the SOC.",
        <>Read more about eliminating share of cost at the California Advocates for Nursing Home Reform (CANHR): <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://canhr.org/understanding-the-share-of-cost-for-medi-cal/</a>.</>
    ],
  },
  {
    title: 'What is an Individual Service Plan (ISP)?',
    content: [
        "An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the 'assisted living' portion). For Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is determined by Kaiser.",
    ],
  },
  {
    title: 'Next Steps: The Application',
    content: [
        "The next section is for filling out the CS Summary Form. This is the core of your application.",
        "Based on the selections you make in the summary form (like the pathway), a personalized list of other required documents will be generated for you to upload.",
    ],
  }
];


export default function InfoEligibilityPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
            <div className="mb-10">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Program Information Page 3
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
                </CardContent>
            </Card>
          ))}
           <div className="mt-8 w-full border-t pt-4">
                <div className="text-left mb-2">
                    <span className="text-sm text-muted-foreground">Page 3 of 3</span>
                </div>
                <div className="flex justify-between">
                    <Link href="/info/details" className="text-sm font-medium text-primary hover:underline">
                        <ArrowLeft className="mr-1 h-4 w-4 inline" /> Previous
                    </Link>
                    <Link href="/applications" className="text-sm font-medium text-primary hover:underline">
                        Next <ArrowRight className="ml-1 h-4 w-4 inline" />
                    </Link>
                </div>
            </div>
        </div>
      </main>
    </>
  );
}
