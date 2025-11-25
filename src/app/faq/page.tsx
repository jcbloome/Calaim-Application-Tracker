
'use client';

import React from 'react';
import { Header } from '@/components/Header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlossaryDialog } from '@/components/GlossaryDialog';

const faqItems = [
  {
    question: "What is CalAIM?",
    answer: "CalAIM (California Advancing and Innovating Medi-Cal) is a long-term initiative by the state of California to transform the Medi-Cal program. Its goals are to improve health outcomes, reduce health disparities, and create a more integrated and seamless healthcare system. This portal focuses on one specific part of CalAIM: the Community Supports service for assisted living transitions."
  },
  {
    question: "What are the two pathways into this program?",
    answer: "There are two pathways: 1) SNF Transition, for members who are currently in a Skilled Nursing Facility (and have been for at least 60 days) and want to move into a community setting, and 2) SNF Diversion, for members who are at risk of being admitted to a SNF but can be safely cared for in the community with the right support."
  },
  {
      question: "How are the RCFE/ARF payments structured?",
      answer: "The payments are divided into two parts. The member is responsible for a 'Room and Board' portion, which is typically based on their monthly Social Security income. The CalAIM program, through the Managed Care Plan, pays for the 'assisted living' care services."
  },
  {
      question: "What is the CalAIM Pathfinder application portal?",
      answer: "This portal is a tool designed by Connections Care Home Consultants to simplify and streamline the application process for the CalAIM Community Supports program for assisted living transitions. It guides users through the required forms and information needed to build a complete application package for submission to the Managed Care Plan."
  },
  {
      question: "What is the role of Connections?",
      answer: "Connections Care Home Consultants is a Community Supports (CS) Provider. Our role is to assist with understanding the program, finding participating facilities, coordinating all the required paperwork and assessments, and liaising with the Managed Care Plan (Health Net or Kaiser) to request authorization for the services."
  },
  {
    question: "What is the difference between an ARF and an RCFE?",
    answer: "An Adult Residential Facility (ARF) is licensed for adults aged 18 to 59. A Residential Care Facility for the Elderly (RCFE) is licensed to care for individuals aged 60 and older. Both provide non-medical care and supervision in a community setting."
  },
  {
    question: "What is a Share of Cost (SOC)?",
    answer: "A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay. This happens when your income is above the limit for free Medi-Cal but you still qualify for the program."
  },
  {
    question: "How must a Share of Cost (SOC) be eliminated for the CalAIM program?",
    answer: "Members participating in the CalAIM Community Supports program are not permitted to have a SOC. It must be eliminated before the application can be approved. A common way to do this is by purchasing supplemental health, dental, or vision insurance, which can lower your 'countable' income and remove the SOC."
  },
  {
      question: "What is an Individual Service Plan (ISP) and why is it important?",
      answer: "An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization."
  },
   {
      question: "Can you tell me more about Connections Care Home Consultants?",
      answer: "Connections Care Home Consultants is a provider that specializes in helping members navigate the CalAIM Community Supports program for assisted living. We work closely with members, their families, and healthcare providers to ensure a smooth transition from a skilled nursing facility or home environment into a community-based RCFE or ARF."
  },
  {
    question: "Which MCPs does Connections work with?",
    answer: "We are contracted with Health Net (for members in Sacramento and Los Angeles counties) and Kaiser Permanente (for members in various counties across California). You must be enrolled in one of these plans to use our services for this program."
  },
  {
    question: "What do I need to do if I want to switch to Kaiser or Health Net to work with Connections?",
    answer: "You can switch your Medi-Cal Managed Care Plan by contacting California Health Care Options at 1-800-430-4263. Plan changes made by the end of the month are typically effective on the first day of the following month."
  },
    {
      question: "How long does it take to switch Medi-Cal MCPs?",
      answer: "Generally, if you make a request to switch your Managed Care Plan by the end of any given month, the change will become effective on the first day of the following month. For example, a change requested on January 20th would be effective February 1st."
  },
   {
      question: "What's the difference between Medicare and Medi-Cal?",
      answer: "Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit. While they are different, Medicare-covered days in a facility can count toward the 60-day stay requirement for the SNF Transition pathway."
  },
  {
      question: "What are the required forms and their purpose?",
      answer: "The required forms include the CS Member Summary (core application data), HIPAA Authorization (to share health info), Liability Waiver (legal protection), Freedom of Choice (confirming you want the service), and sometimes a Declaration of Eligibility (for the Diversion pathway). These forms gather all the necessary information for the Managed Care Plan to determine eligibility and authorize services."
  }
];

export default function FaqPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Frequently Asked Questions</h1>
                    <p className="text-muted-foreground mt-1">Answers to common questions about the CalAIM application process.</p>
                </div>
                <GlossaryDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Common Questions</CardTitle>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                        {faqItems.map((item, index) => (
                            <AccordionItem value={`item-${index}`} key={index}>
                                <AccordionTrigger>{item.question}</AccordionTrigger>
                                <AccordionContent>
                                    <p className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: item.answer }} />
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
