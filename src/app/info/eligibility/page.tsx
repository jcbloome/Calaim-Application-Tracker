
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
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { GlossaryDialog } from '@/components/GlossaryDialog';

const infoSections = [
  {
    title: 'Individual Service Plan (ISP)',
    content: [
        "An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the 'assisted living' portion). For Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is determined by Kaiser.",
    ],
  },
   {
    title: 'CalAIM Turnaround Time',
    content: [
      <div>
        <strong>For Health Net (5-7 business days):</strong>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>We compile all the required documents, have a RN do a virtual ISP visit with appropriate party.</li>
          <li>We determine the tiered rate.</li>
          <li>We recommend RCFEs to the family (in many cases, the family already knows the RCFE they would like for their relative).</li>
          <li>We submit the authorization request and receive the determination (approval or denial) within 5-7 business days.</li>
        </ol>
      </div>,
      <div className="mt-4">
        <strong>For Kaiser (4-8 weeks):</strong>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>Compile required documents &amp; Request Authorization.</li>
            <li>Receive authorization determination.</li>
            <li>If approved, send RN (or MSW with RN sign off) to do in-person visit with ISP tool.</li>
            <li>Send ISP tool to Kaiser for tier level.</li>
            <li>Receive tier level and recommend RCFEs to family.</li>
            <li>Once RCFE is selected sent RCFE to Kaiser for contracting and when RCFE receives Kaiser contract member can move into the RCFE.</li>
        </ol>
      </div>
    ],
  },
  {
    title: 'Next Steps: The Application',
    content: [
        "The next section is for filling out the CS Summary Form. This is the core of your application.",
        "Kaiser turnaround is typically 4-8 weeks.",
        "Based on the selections you make in the summary form (like the pathway), a personalized list of other required documents will be generated for you to upload.",
    ],
  }
];


export default function InfoEligibilityPage() {
  return (
    <>
      <PublicHeader />
      <main className="flex-grow">
        <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
            <div className="mb-10">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Program Information Page 4
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
                    <div key={pIndex} className="mb-4 last:mb-0">
                        {paragraph}
                    </div>
                    ))}
                </CardContent>
            </Card>
          ))}
           <div className="mt-8 w-full border-t pt-4">
                <div className="text-left mb-2">
                    <span className="text-sm text-muted-foreground">Page 4 of 4</span>
                </div>
                <div className="flex justify-between">
                    <Link href="/info/financial" className="text-sm font-medium text-primary hover:underline">
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
