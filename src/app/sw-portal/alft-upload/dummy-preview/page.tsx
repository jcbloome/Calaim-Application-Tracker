'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const section = (title: string, lines: string[]) => ({ title, lines });

const DUMMY_SECTIONS = [
  section('HEADER INFORMATION', [
    'Agency: ILS Health',
    'Assessment Date: 2026-03-04',
    'Plan ID: PLAN-ALFT-1022',
    'Member Name: Leo Lara',
    'Assessor/CM Name: Social Worker Example',
    'Purpose: Initial',
  ]),
  section('DEMOGRAPHIC', [
    'First / Middle / Last: Leo A Lara',
    'MRN Number: 000045678',
    'Phone Number: (555) 555-1212',
    'Date of Birth / Sex: 1950-07-21 / Male',
    'Primary Language: English',
    'Marital Status: Married',
  ]),
  section('CURRENT PHYSICAL LOCATION', [
    'Street: 123 Main St',
    'City / State / Zip: Los Angeles / CA / 90012',
    'Type: Assisted Living Facility (ALF)',
    'Facility Name: Example RCFE',
  ]),
  section('MEMORY / COGNITIVE SCREEN', [
    'Memory diagnosis reported: Yes',
    '3-word repeat score: Two',
    'Orientation: Missed by one month',
    'Cognitive problems present: Yes',
  ]),
  section('GENERAL HEALTH / ADL / IADL', [
    'Falls (6 months): 1',
    'ER visits: 0, Hospital admissions: 0',
    'ADL bathing: Needs supervision',
    'IADL medication management: Needs assistance',
  ]),
  section('HEALTH CONDITIONS / THERAPIES / MENTAL HEALTH', [
    'Diabetes, Hypertension, Arthritis',
    'Physical Therapy: Weekly',
    'Supervision needed: Yes',
    'Behavior frequency concerns: Several days',
  ]),
  section('NUTRITION / MEDICATION / DIRECTIVES / ENVIRONMENT', [
    'Special diet: Low sodium',
    '3+ meds/day: Yes',
    'Advance Directive: Living Will, POA',
    'Environment free of clutter: Yes',
  ]),
  section('PAGE 13 MEDICATION GRID (SAMPLE)', [
    'Amlodipine | 5mg | Daily | Y | Oral | Dr. Nguyen',
    'Metformin | 500mg | BID | Y | Oral | Dr. Nguyen',
    'Vitamin D | 1000 IU | Daily | Y | Oral | Dr. Patel',
  ]),
  section('PAGE 14 RN/MSW COMMENTARY + SIGNATURE', [
    'Additional RN Commentary: Member appropriate for transition support plan.',
    'Print Name: RN Example',
    'Date: 2026-03-04',
    'License Number: RN-123456',
    'Role: RN',
  ]),
];

export default function AlftDummyPreviewPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-4 alft-dummy-preview">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-center tracking-wide">ALF TRANSITION ASSESSMENT (DUMMY PREVIEW - LEO LARA)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex justify-end print:hidden">
            <Button onClick={() => window.print()} variant="outline">
              Print / Save PDF
            </Button>
          </div>

          {DUMMY_SECTIONS.map((s, idx) => (
            <section key={s.title} className="border rounded-md p-3 break-inside-avoid">
              <h2 className="font-semibold text-sm uppercase tracking-wide mb-2">
                {idx + 1}. {s.title}
              </h2>
              <div className="space-y-1 text-sm">
                {s.lines.map((line) => (
                  <div key={line} className="border-b border-dashed pb-1">
                    {line}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          .alft-dummy-preview {
            max-width: none !important;
          }
          .alft-dummy-preview .card,
          .alft-dummy-preview section {
            box-shadow: none !important;
            border-color: #d4d4d8 !important;
          }
        }
      `}</style>
    </div>
  );
}

