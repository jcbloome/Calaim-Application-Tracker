
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
import { acronyms } from '@/lib/data';
import { Separator } from '@/components/ui/separator';

const faqItems = [
  {
    question: "What is CalAIM?",
    answer: "CalAIM (California Advancing and Innovating Medi-Cal) is a long-term initiative by the state of California to transform the Medi-Cal program. Its goals are to improve health outcomes, reduce health disparities, and create a more integrated and seamless healthcare system for all Medi-Cal members."
  },
  {
    question: "What are Community Supports (CS)?",
    answer: "Community Supports are a set of services provided under CalAIM to help Medi-Cal members with complex health and social needs. The 'Assisted Living Transitions' service, which we facilitate, is one of these supports, designed to help eligible members move from a skilled nursing facility (SNF) to a community-based setting like an RCFE or ARF."
  },
  {
    question: "What is the difference between an RCFE and an ARF?",
    answer: "A Residential Care Facility for the Elderly (RCFE) is licensed to care for individuals aged 60 and older. An Adult Residential Facility (ARF) is licensed for adults aged 18 to 59. Both provide non-medical care and supervision."
  },
  {
    question: "What is the difference between SNF Transition and SNF Diversion?",
    answer: "SNF Transition is for members who are currently in a Skilled Nursing Facility (and have been for at least 60 days) and want to move into the community. SNF Diversion is for members who are at risk of being admitted to a SNF but can be safely cared for in a community setting with the right support."
  },
  {
    question: "Which health plans do you work with?",
    answer: "We are contracted with Health Net (for members in Sacramento and Los Angeles counties) and Kaiser Permanente (for members in various counties across California). You must be enrolled in one of these plans to use our services for this program."
  },
  {
    question: "What if I'm not in Health Net or Kaiser?",
    answer: "You will need to switch your Medi-Cal Managed Care Plan. You can do this by contacting California Health Care Options at 1-800-430-4263. Plan changes made by the end of the month are typically effective on the first day of the following month."
  },
  {
    question: "What is a 'Share of Cost' (SOC) and can I have one?",
    answer: "A Share of Cost is like a monthly deductible for Medi-Cal when your income is over a certain limit. Members participating in the CalAIM Community Supports program for assisted living transitions are not permitted to have a Share of Cost. If you have one, it must be eliminated before the application can be approved."
  },
  {
    question: "How do I pay for 'Room and Board'?",
    answer: "The member is responsible for a 'Room and Board' portion, which is typically based on their monthly Social Security income. The CalAIM program pays for the 'assisted living' care services, but not the rent/food. We will help you complete a 'Room and Board Obligation Statement' during the application process."
  }
];

export default function FaqPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Frequently Asked Questions & Glossary</h1>
                <p className="text-muted-foreground mt-1">Answers to common questions about the CalAIM application process.</p>
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
                                    <p className="prose prose-sm max-w-none text-gray-700">{item.answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Acronym Glossary</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl>
                        {acronyms.map((item, index) => (
                            <div key={item.term}>
                                <div className="flex items-baseline gap-4 py-3">
                                <dt className="w-20 text-right font-bold text-primary shrink-0">{item.term}</dt>
                                <dd className="text-muted-foreground">{item.definition}</dd>
                                </div>
                                {index < acronyms.length - 1 && <Separator />}
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>

        </div>
      </main>
    </div>
  );
}
