
'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Header } from '@/components/Header';
import { acronyms } from '@/lib/data';
import { Separator } from '@/components/ui/separator';

const faqs = [
  {
    question: "What is CalAIM?",
    answer: "California Advancing and Innovating Medi-Cal (CalAIM) is a long-term commitment to transform and strengthen Medi-Cal, offering Californians a more equitable, coordinated, and person-centered approach to maximizing their health and life trajectory."
  },
  {
    question: "What are Community Supports?",
    answer: "Community Supports are an optional set of 14 services for eligible Medi-Cal members. These services are designed to address social drivers of health and help individuals with complex needs remain in their communities. This application portal focuses on one specific service: Assisted Living Transitions."
  },
  {
    question: "What is the role of Connections Care Home Consultants?",
    answer: "For 35 years Connections has helped private paid families find care homes. We are now partnered with Managed Care Plans (MCPs) as a Community Supports (CS) Provider. We assist with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your MCP to request authorization for the CS. Once a member is placed, we also send a MSW to visit for monthly quality control checks and provide ongoing care coordination."
  },
  {
    question: "Individual Service Plan (ISP)",
    answer: "An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the 'assisted living' portion)."
  },
  {
    question: "What is the difference between SNF Diversion and SNF Transition?",
    answer: "SNF Diversion is for members at risk of being admitted to a Skilled Nursing Facility (SNF) who can instead be cared for in the community. SNF Transition is for members who are currently in a SNF and wish to move to a community-based setting like an RCFE or ARF."
  },
  {
    question: "What is a Share of Cost (SOC) and can I have one?",
    answer: <>A Share of Cost is a monthly amount you may have to pay for medical services if your income is above the limit for free Medi-Cal. Members participating in this program cannot have a SOC. It must be eliminated, often by purchasing supplemental insurance to lower your countable income. For detailed information on eliminating share of cost, visit the <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">California Advocates for Nursing Home Reform (CANHR)</a> website.</>
  },
  {
    question: "What is the Room & Board Obligation?",
    answer: "Members are responsible for paying for their 'room and board' at the assisted living facility. The Managed Care Plan (MCP) pays for the 'assisted living' care services. For those on SSI/SSP, the payment is typically adjusted to cover this cost while leaving a personal needs allowance. Members who cannot pay any room and board portion are generally not eligible."
  },
  {
    question: "What if I am not a member of Health Net or Kaiser Permanente?",
    answer: "To use Connections for this service, you must be a member of Health Net or Kaiser. You can switch your health plan by contacting California Health Care Options at 1-800-430-4263. Changes made by the end of the month are typically effective on the first of the following month."
  }
];


export default function FaqPage() {
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight">
            FAQ & Glossary
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-3xl mx-auto">
            Find answers to common questions and definitions for key terms.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
                 <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="glossary">
                        <AccordionTrigger>Acronym Glossary</AccordionTrigger>
                        <AccordionContent>
                            <dl className="p-4">
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
                        </AccordionContent>
                    </AccordionItem>
                    {faqs.map((faq, index) => (
                    <AccordionItem value={`item-${index}`} key={index}>
                        <AccordionTrigger>{faq.question}</AccordionTrigger>
                        <AccordionContent>{faq.answer}</AccordionContent>
                    </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </div>
      </main>
    </>
  );
}
