
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { DEFAULT_APP_BASE_URL } from '@/lib/app-urls';

const PROGRAM_INFO_PAYMENTS_URL = `${DEFAULT_APP_BASE_URL}/info/payments`;
const PROGRAM_INFO_ELIGIBILITY_URL = `${DEFAULT_APP_BASE_URL}/info/eligibility`;

export default function Step4() {
  return (
    <div className="flex flex-col gap-6">
      <div className="mb-3">
        <GlossaryDialog className="p-0 h-auto" />
      </div>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 8: Non-Medical Out-of-Home Care (NMOHC)</CardTitle>
          <CardDescription>Brief overview. Full details are in Program Information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose prose-sm max-w-none text-gray-700 p-4 border rounded-lg bg-muted/30">
            <p>
              Non-Medical Out-of-Home Care (NMOHC) is an SSI/SSP payment supplement for people who live in a licensed
              assisted living home (RCFE). In 2026 the NMOHC rate is about $1,626.07 a month; the member usually keeps
              about $182 for personal needs and the rest goes to the RCFE for room and board. Members on SSI, and some
              members on SSA or SSDI whose income is below the NMOHC rate, may qualify. For eligibility rules, how to
              verify with Social Security, and the SSI / SSA / SSDI pathways, see Program Information:{' '}
              <a
                href={PROGRAM_INFO_PAYMENTS_URL}
                className="underline underline-offset-2 text-blue-700 hover:text-blue-800 break-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                {PROGRAM_INFO_PAYMENTS_URL}
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 9: Share of Cost (SOC)</CardTitle>
          <CardDescription>SOC guidance and next steps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            Share of Cost (SOC) is like a monthly Medi-Cal deductible: the amount a member may need to pay each month
            before Medi-Cal-covered services begin paying.
          </p>
          <p>
            Members generally cannot apply for CalAIM with a SOC. SOC usually needs to be reduced to $0 first.
          </p>
          <p>
            For more details, see Program Information:{' '}
            <a
              href={PROGRAM_INFO_ELIGIBILITY_URL}
              className="underline underline-offset-2 text-blue-700 hover:text-blue-800 break-all"
              target="_blank"
              rel="noopener noreferrer"
            >
              {PROGRAM_INFO_ELIGIBILITY_URL}
            </a>
            .
          </p>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-semibold">Brief examples to help lower SOC:</div>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li>Submit supplemental insurance premiums (dental/vision/Part B/Part D) to county worker.</li>
              <li>Provide RCFE invoices and other allowable out-of-pocket medical/remedial expenses.</li>
              <li>Example: ask county to screen the member for the 250% Working Disabled Program if applicable.</li>
              <li>Ask county eligibility worker to review all deductions for a potential $0 SOC determination.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 10: Room & Board Payments</CardTitle>
          <CardDescription>Member room/board responsibility guidance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose prose-sm max-w-none text-gray-700 space-y-3 p-4 border rounded-lg bg-muted/30">
            <p>The MCP member is responsible for paying the RCFE the "room and board" portion and the MCP is responsible for paying the RCFE the "assisted living" portion.</p>
            <p>For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for "room and board" for a private room or to open up RCFEs in more expensive areas.</p>
            <p>Members not eligible for the NMOHC will still have a "room and board" obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.</p>
            <p>Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a "room and board" payment from the member (or their family).</p>
            <p>Working with CalAIM is at the discretion of the RCFEs. RCFEs, especially in more expensive areas, might not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas. Before accepting CalAIM members, RCFEs will need to know the "room and board" payment.</p>
          </div>

          <div className="rounded-md border border-gray-300 p-4 text-foreground">
            <p className="text-sm">
              Proof of income (annual award letter or 3 months of bank statements showing Social Security income) is
              required by some managed care plans.
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

    
    
    