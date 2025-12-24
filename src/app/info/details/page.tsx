
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
    title: 'Managed Care Plans We Work With',
    content: [
      'You must be a member of one of these plans to utilize us for the CS for Assisted Transitions.',
    ],
    list: [
      'Health Net: Serving members in Sacramento and Los Ángeles counties.',
      'Kaiser Permanente: Serving members in various counties throughout California.',
    ],
  },
  {
    title: 'Switching to Health Net or Kaiser',
    content: [
      'To enroll in this CalAIM program through Connections, you must be a member of Health Net or Kaiser. If you are in another Medi-Cal managed care plan, you will need to switch.',
      'You can change your health plan by contacting California Health Care Options at 1-800-430-4263 or visiting their website. Generally, changes made by the end of the month are effective on the first day of the following month.',
    ],
    link: 'https://www.healthcareoptions.dhcs.ca.gov/en/enroll',
  },
   {
    title: 'What if I am assigned to Molina?',
    content: [
        "When applying for Medi-Cal in Los Angeles County, many people are automatically assigned to the Molina health plan. Since we are not contracted with Molina for this specific program, you will need to switch to either Health Net or Kaiser to work with us. You can do this by contacting Health Care Options at the number provided above.",
    ],
  },
];


export default function InfoDetailsPage() {
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight">
            Program Information (2 of 3)
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-3xl mx-auto">
            Details on Health Plan requirements for program eligibility.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          {infoSections.map((section, index) => (
            <Card key={index} className="shadow-sm">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
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
                    {section.link && (
                    <a href={section.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Visit Website
                    </a>
                    )}
                </CardContent>
            </Card>
          ))}
           <div className="flex justify-between pt-4">
                <Button asChild variant="outline">
                    <Link href="/info">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Previous: Program Overview
                    </Link>
                </Button>
                <Button asChild>
                    <Link href="/info/eligibility">
                        Next: Financial & Other Info <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
      </main>
    </>
  );
}
