
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { type FormValues } from '../schema';
import { GlossaryDialog } from '@/components/GlossaryDialog';

export default function Step4() {
  const { control } = useFormContext<FormValues>();

  return (
    <div className="flex flex-col gap-6">
      <div className="mb-3">
        <GlossaryDialog className="p-0 h-auto" />
      </div>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 8: Non-Medical Out-of-Home Care (NMOHC)</CardTitle>
          <CardDescription>Financial eligibility and NMOHC setup guidance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose prose-sm max-w-none text-gray-700 space-y-2 p-4 border rounded-lg bg-muted/30">
            <p>
              Non-Medical Out-of-Home Care (NMOHC) is a payment supplement that boosts a person's monthly SSI check
              because they live in a licensed assisted living home rather than an apartment or house.
            </p>
            <p>
              In California, if a person lives in a Residential Care Facility for the Elderly (RCFE), the state
              recognizes that costs are much higher than someone living independently. To help cover this, the person
              moves from the "Independent Living" rate to the "NMOHC" rate.
            </p>
            <div>
              <p className="font-semibold">1. Confirm Financial Eligibility (The "Paper" Test)</p>
              <p>Since NMOHC is part of the SSI program, you can verify the financial requirements now.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Income: For 2026, total "countable" monthly income must be less than $1,626.07.</li>
                <li>Assets: As of January 1, 2026, asset limits are reinstated. An individual must have less than $2,000 in countable resources ($3,000 for a couple).</li>
                <li>Note: One car and the primary home are usually excluded from this limit.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">2. Verification with Social Security (The "Pre-Move" Call)</p>
              <p>
                Visit a local Social Security office in person for a living arrangement interview to confirm NMOHC
                eligibility and the supplement amount.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Tell them the person plans to move into a licensed RCFE.</li>
                <li>Ask for the new SSI payment calculation based on the 2026 NMOHC rate.</li>
              </ul>
            </div>
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
              href="/info/eligibility"
              className="underline underline-offset-2 text-blue-700 hover:text-blue-800"
            >
              /info/eligibility
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

          <FormField
            control={control}
            name="ackRoomAndBoard"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-blue-700">
                    I have read and understood the financial obligation for Room and Board. <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}

    
    
    