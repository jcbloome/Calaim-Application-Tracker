
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

const infoSections = [
   {
    title: 'Room & Board Obligation',
    content: [
        "The MCP member is responsible for paying the RCFE the 'room and board' and the MCP is responsible for paying the RCFE the 'assisted living' portion.",
        "For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for 'room and board'. Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for 'room and board' for a private room or to open up RCFEs in more expensive areas.",
        "Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family).",
    ],
  },
  {
    title: 'Share of Cost (SOC)',
    content: [
        "A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay.",
        "This happens when your income is above the limit for free Medi-Cal but you still qualify for the program.",
        "Members participating in the CalAIM Community Supports program are not permitted to have a SOC. It must be eliminated before the application can be approved. A common way to do this is by purchasing supplemental health, dental, or vision insurance, which can lower your 'countable' income and remove the SOC.",
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
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Program Information (3 of 3)
          </h1>
          <p className="mt-2 text-md sm:text-lg text-muted-foreground max-w-3xl mx-auto">
            Financial obligations and other key program details.
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
                </CardContent>
            </Card>
          ))}
           <div className="flex justify-between pt-4">
                <Button asChild variant="outline">
                    <Link href="/info/details">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                    </Link>
                </Button>
                 <Button asChild>
                    <Link href="/applications">
                        Go to My Applications <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
      </main>
    </>
  );
}
