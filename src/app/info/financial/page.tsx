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
    ],
  },
  {
    title: 'Share of Cost (SOC)',
    content: [
      'Members cannot apply for CalAIM with a SOC. It must be eliminated before becoming eligible to apply for CalAIM.',
      "A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay.",
      'This happens when your income is above the limit for free Medi-Cal but you still qualify for the program.',
      <>Read more about eliminating share of cost at the <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">California Advocates for Nursing Home Reform (CANHR)</a>.</>,
      <div key="soc-wdp" className="mt-4 not-prose rounded-lg border border-border bg-slate-50 p-4">
        <div className="text-base font-semibold text-gray-900">
          Eliminating Medi-Cal Share of Cost: The Key to CalAIM
        </div>
        <div className="mt-2 space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            If you have Medi-Cal with a Share of Cost, you may be missing out on life-changing benefits. Programs like CalAIM
            (which provides care coordination and placement in residential care homes) generally require members to have{' '}
            <span className="font-semibold">Full-Scope, $0 Share of Cost</span> Medi-Cal.
          </p>
          <p>
            For many seniors and disabled individuals, a monthly income above <span className="font-semibold">$1,856</span> (the 2026 limit)
            triggers a high Share of Cost. However, California's <span className="font-semibold">250% Working Disabled Program (WDP)</span> offers
            a legal way to eliminate that cost and keep more of your money.
          </p>
        </div>

        <div className="mt-4 font-semibold text-gray-900">How the 250% Working Disabled Program Works</div>
        <ul className="mt-2 list-disc pl-5 space-y-2 text-sm text-gray-700">
          <li>
            <span className="font-semibold">Higher income allowed</span>: up to <span className="font-semibold">$3,260</span> per month with a{' '}
            <span className="font-semibold">$0 monthly premium</span> and <span className="font-semibold">$0 Share of Cost</span>.
          </li>
          <li>
            <span className="font-semibold">Broad definition of "work"</span>: no traditional full-time job required. "Working" can include
            part-time tasks like pet sitting, consulting for a neighbor, or even recycling. No minimum hours required.
          </li>
          <li>
            <span className="font-semibold">Income protection</span>: most disability-related income (like SSDI or private disability) is not
            counted toward the limit. Even if SSDI converted to Social Security Retirement, it may still be exempt.
          </li>
          <li>
            <span className="font-semibold">CalAIM ready</span>: once Share of Cost is $0, you can qualify for CalAIM services, including Enhanced
            Care Management and Community Supports for care home placement.
          </li>
        </ul>

        <div className="mt-5 font-semibold text-gray-900">Additional SOC Reduction Strategies (County Eligibility Process)</div>
        <div className="mt-2 space-y-3 text-sm text-gray-700 leading-relaxed">
          <div>
            <div className="font-semibold text-gray-900">1. The "Excess Income" Room and Board Adjustment</div>
            <div>
              Under California law (and often reflected in RCFE admission agreements), there is a distinction
              between what an SSI recipient pays and what a private-pay or high-income resident pays.
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold">The SSI Rate Cap:</span> for residents on SSI, room and board is
                strictly capped (around $1,444.07 for 2026).
              </li>
              <li>
                <span className="font-semibold">The Non-SSI Exception:</span> if a member has income other than
                SSI, the facility may charge the basic room and board amount plus additional contract-based charges.
              </li>
              <li>
                <span className="font-semibold">The Strategy:</span> increasing room and board obligations on the
                admission agreement (minus the $182 personal needs allowance) may reduce countable income.
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-gray-900">2. The "Medical Expense" Spend-Down (Paperwork Fix)</div>
            <div>
              When board-and-care deduction is unavailable because CalAIM is paying for care, a spend-down strategy
              can still reduce SOC by documenting incurred medical or remedial expenses.
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold">Remedial care expenses:</span> the RCFE amount above standard room
                and board may be treated as remedial care expense.
              </li>
              <li>
                <span className="font-semibold">How to report:</span> submit RCFE invoices to County Social Services
                (DPSS) as incurred medical expenses. Member out-of-pocket payments count toward SOC.
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-gray-900">3. Purchase Supplemental Insurance (Often the Cleanest Fix)</div>
            <div>
              Lower gross countable income before SOC calculation by documenting deductible premiums and insurance
              deductions.
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold">Dental/Vision/Health premiums:</span> monthly premiums are
                deductible by the county.
              </li>
              <li>
                <span className="font-semibold">Medicare Part B/D:</span> ensure all premiums are captured by the
                county eligibility worker.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4 font-semibold text-gray-900">Summary of Where to Go</div>
        <div className="mt-2 text-sm text-gray-700 leading-relaxed">
          Take the following to the <span className="font-semibold">County Social Services Eligibility Worker</span>{' '}
          (not the health plan):
        </div>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>
            <span className="font-semibold">Revised admission agreement:</span> showing higher room and board
            obligation up to available income.
          </li>
          <li>
            <span className="font-semibold">Medical receipts:</span> out-of-pocket costs (incontinence supplies,
            OTC meds, transportation, etc.).
          </li>
          <li>
            <span className="font-semibold">Insurance proof:</span> monthly supplemental premium documentation.
          </li>
        </ul>
        <div className="mt-3 rounded border border-cyan-300 bg-cyan-50 p-3 text-sm text-gray-700">
          <span className="font-semibold">Crucial note:</span> once county deductions are entered and the case
          reflects zero SOC, the CalAIM managed care plan typically sees eligibility updates in about 24-48 hours.
        </div>

        <div className="mt-4 font-semibold text-gray-900">Who to Contact for Help</div>
        <div className="mt-2 space-y-3 text-sm text-gray-700 leading-relaxed">
          <div>
            <div className="font-semibold text-gray-900">1. HICAP (Health Insurance Counseling &amp; Advocacy Program)</div>
            <div>Free, unbiased counseling on Medicare and Medi-Cal. Experts at the Working Disabled Program.</div>
            <div>
              <span className="font-semibold">Phone:</span>{' '}
              <a className="text-primary hover:underline" href="tel:18004340222">1-800-434-0222</a>
            </div>
            <div>
              <span className="font-semibold">Website:</span>{' '}
              <a className="text-primary hover:underline" href="https://aging.ca.gov/hicap" target="_blank" rel="noopener noreferrer">
                aging.ca.gov/hicap
              </a>
            </div>
          </div>

          <div>
            <div className="font-semibold text-gray-900">2. Health Consumer Alliance (HCA)</div>
            <div>Free legal assistance for Californians struggling with Medi-Cal eligibility or high Share of Cost.</div>
            <div>
              <span className="font-semibold">Phone:</span>{' '}
              <a className="text-primary hover:underline" href="tel:18888043536">1-888-804-3536</a>
            </div>
            <div>
              <span className="font-semibold">Website:</span>{' '}
              <a className="text-primary hover:underline" href="https://healthconsumer.org" target="_blank" rel="noopener noreferrer">
                healthconsumer.org
              </a>
            </div>
          </div>

          <div>
            <div className="font-semibold text-gray-900">3. Your Local County Social Services (DPSS)</div>
            <div>
              Contact your local county eligibility worker and ask for an{' '}
              <span className="font-semibold">"evaluation for the 250% Working Disabled Program."</span>
            </div>
            <div>
              <span className="font-semibold">Online Portal:</span>{' '}
              <a className="text-primary hover:underline" href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer">
                BenefitsCal.com
              </a>
            </div>
          </div>
        </div>
      </div>,
    ],
  },
  {
    title: 'Benefitscal.com',
    content: [
      'A one stop shop to apply and review Medi-Cal benefits including possible share of cost information and to add for the member an authorized representative/power of attorney.',
      <>Visit <a href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.benefitscal.com</a> for current SOC verification and more information.</>,
    ],
  },
];

export default function InfoFinancialPage() {
  const orderedInfoSections = [infoSections[2], infoSections[3], infoSections[0], infoSections[1]];

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
              <GlossaryDialog className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600" />
            </div>
          </div>

          {orderedInfoSections.map((section, index) => (
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
              <span className="text-sm text-muted-foreground">Page 3 of 4</span>
            </div>
            <div className="flex justify-between">
              <Link href="/info/details" className="text-sm font-medium text-primary hover:underline">
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
