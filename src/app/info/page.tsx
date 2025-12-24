
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Header } from '@/components/Header';
import React from 'react';

const infoSections = [
  {
    title: 'What is CalAIM?',
    content: [
        "California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and creating a more seamless and consistent system. It aims to achieve this through a focus on 'whole person care,' which includes addressing social determinants of health, integrating physical, mental, and social services, and launching new programs like Enhanced Care Management (ECM) and Community Supports (CS). ECM and CS are administered through managed care plans (MCPs).",
    ],
  },
  {
    title: 'Community Support for Assisted Living Transitions',
    content: [
      "There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration.",
      "The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings.",
    ],
  },
  {
    title: 'The Role of Connections Care Home Consultants',
    content: [
      "For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS.",
      "Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.",
    ],
  },
   {
    title: 'Types of Assisted Living (RCFEs/ARFs)',
    content: [
      'Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:',
    ],
    list: [
      'Small, Home-Like Settings: These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.',
      'Large, Community Settings: These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support.',
    ],
  },
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
    title: 'Medicare vs. Medi-Cal',
    content: [
        "Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit. While they are different, Medicare-covered days in a facility can count toward the 60-day stay requirement for the SNF Transition pathway.",
    ],
  },
];


export default function InfoPage() {
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight">
            Program Information
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-3xl mx-auto">
            Understanding the CalAIM Community Supports program for Assisted Living Transitions.
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
        </div>
      </main>
    </>
  );
}
