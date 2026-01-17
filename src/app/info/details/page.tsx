
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
    title: 'Managed Care Plans We Work With',
    content: [
      'Connections currently is only contracted with Kaiser and Health Net for the CS for Assisted Living Transitions. You must switch to one of these plans if you would like to work with Connections.',
    ],
    list: [
      'Health Net: Serving members in Sacramento and Los Ángeles counties.',
      <>Connections is contracted for the CS for Kaiser Permanente through a subcontract with Independent Living Systems (ILS), which manages the program for Kaiser.</>,
    ],
  },
  {
    title: 'Switching to Health Net or Kaiser',
    content: [
      'If you are in another Medi-Cal managed care plan and you would like to work with Connections, you will need to switch.',
      <>You can change your health plan by contacting <a href="https://www.healthcareoptions.dhcs.ca.gov/en/enroll" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">California Health Care Options</a> at 1-800-430-4263 or visiting their website.</>,
      'Generally, changes made by the end of the month are effective on the first day of the following month.',
    ],
  },
   {
    title: 'Applying for Health Net (and being assigned to Molina)',
    content: [
        "When applying for Medi-Cal with Health Net sometimes people are automatically assigned to Molina instead, you will need to call Health Net (800-675-6110) and request to be switched to Health Net.",
    ],
  },
  {
    title: 'Expedited Disenrollment from Molina',
    content: [
      'If you were randomly assigned to Molina and need to switch to Health Net urgently (especially for SNF residents needing CalAIM transition services), here are three escalation options:',
    ],
    list: [
      <>
        <strong>1. Call Health Net directly: 1-800-675-6110</strong><br />
        Contact Health Net Member Services directly to request an expedited transfer from Molina to Health Net.
      </>,
      <>
        <strong>2. Contact the Medi-Cal Managed Care <a href="mailto:MMCDOmbudsmanOffice@dhcs.ca.gov" className="text-primary hover:underline">Ombudsman</a></strong><br />
        If HCO says they cannot speed up the process, the Medi-Cal Managed Care Ombudsman is the "escalation" office. They have the authority to investigate enrollment errors and can sometimes manually override an assignment if it is preventing a member from receiving necessary care or a safe discharge.<br />
        <strong>Phone:</strong> 1-888-452-8609<br />
        <strong>Email:</strong> Available via link above<br />
        <strong>What to say:</strong> "The member was randomly assigned to Molina despite requesting Health Net. This error is preventing access to CalAIM SNF-to-community transition services, effectively keeping the member institutionalized longer than necessary."
      </>,
      <>
        <strong>3. File an "Expedited Grievance" with Molina</strong><br />
        Since the member is currently assigned to Molina, Molina is technically responsible for their care. You can call Molina's Member Services and file an Expedited Grievance.<br />
        <strong>The Goal:</strong> Request that Molina either provide the equivalent CalAIM transition services immediately or, if they cannot, that they "concur" with an immediate plan transfer to Health Net.<br />
        <strong>Note:</strong> If Molina cannot meet the member's needs (i.e., they don't have the specific CalAIM Enhanced Care Management or Community Supports contract), they are legally required to help resolve the access issue.
      </>,
    ],
  },
];


export default function InfoDetailsPage() {
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="mb-10">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Program Information Page 2
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
                    </CardContent>
                </Card>
            ))}
            <div className="mt-8 w-full border-t pt-4">
                    <div className="text-left mb-2">
                        <span className="text-sm text-muted-foreground">Page 2 of 3</span>
                    </div>
                    <div className="flex justify-between">
                        <Link href="/info" className="text-sm font-medium text-primary hover:underline">
                            <ArrowLeft className="mr-1 h-4 w-4 inline" /> Previous
                        </Link>
                        <Link href="/info/eligibility" className="text-sm font-medium text-primary hover:underline">
                            Next <ArrowRight className="ml-1 h-4 w-4 inline" />
                        </Link>
                    </div>
                </div>
        </div>
      </main>
    </>
  );
}
