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
    title: 'Non-Medical Out-of-Home Care (NMOHC) Payment',
    content: [
      "NMOHC is a payment supplement that boosts a person's monthly SSI check because they live in a licensed assisted living home rather than an apartment or house.",
      'In California, if a person lives in a Residential Care Facility for the Elderly (RCFE), the state recognizes that costs are much higher than someone living independently. To help cover this, the person moves from the "Independent Living" rate to the "NMOHC" rate.',
      <div key="nmohc-1">
        <strong>1. Confirm Financial Eligibility (The "Paper" Test)</strong>
        <p>Since NMOHC is part of the SSI program, you can verify the financial requirements now.</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Income: For 2026, total "countable" monthly income must be less than $1,626.07.</li>
          <li>Assets: As of January 1, 2026, asset limits are reinstated. An individual must have less than $2,000 in countable resources ($3,000 for a couple).</li>
          <li>Note: One car and the primary home are usually excluded from this limit.</li>
        </ul>
      </div>,
      <div key="nmohc-2" className="mt-4">
        <strong>2. Verification with Social Security (The "Pre-Move" Call)</strong>
        <p>Visit a local Social Security office in person for a living arrangement interview to confirm NMOHC eligibility and the supplement amount.</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Tell them the person plans to move into a licensed RCFE.</li>
          <li>Ask for the new SSI payment calculation based on the 2026 NMOHC rate.</li>
        </ul>
      </div>,
    ],
  },
  {
    title: '"Room and Board" and "Assisted Living" Payments',
    content: [
      "The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is responsible for paying the RCFE the 'assisted living' portion.",
      `For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for 'room and board' for a private room or to open up RCFEs in more expensive areas.`,
      "Members not eligible for the NMOHC will still have a 'room and board' obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.",
      "Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family).",
      'Working with CalAIM is at the discretion of the RCFEs. Many RCFEs, especially in more expensive areas, most likely will not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas.',
      `The "assisted living" payment paid by the MCP is a fixed rate based on level of care but may not align with market rate in certain counties or for all RCFEs. Supplementing the "room and board" to arrive at market rate is at the discretion of the families.`,
    ],
  },
];

export default function InfoPaymentsPage() {
  return (
    <>
      <PublicHeader />
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
                  <div key={pIndex} className="mb-4 last:mb-0">
                    {paragraph}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <div className="mt-8 w-full border-t pt-4">
            <div className="text-left mb-2">
              <span className="text-sm text-muted-foreground">Page 3 of 5</span>
            </div>
            <div className="flex items-center justify-between">
              <Link href="/info/details" className="text-sm font-medium text-primary hover:underline">
                <ArrowLeft className="mr-1 h-4 w-4 inline" /> Previous
              </Link>
              <Link href="/info/financial" className="text-sm font-medium text-primary hover:underline">
                Next <ArrowRight className="ml-1 h-4 w-4 inline" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
