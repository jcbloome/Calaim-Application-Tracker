
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const Field = ({ label, className = '' }: { label: string; className?: string }) => (
  <div className={`pt-4 ${className}`}>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <div className="mt-1 h-6 border-b border-gray-400"></div>
  </div>
);

const LongField = ({ className = '' }: { className?: string }) => (
  <div className={`pt-4 ${className}`}>
    <div className="mt-1 h-6 border-b border-gray-400"></div>
  </div>
);


const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 mb-4 mt-8">{children}</h2>
);


export default function PrintableDeclarationOfEligibilityPage() {

  const handlePrint = () => {
    window.print();
  };
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-8 sm:p-12 shadow-lg rounded-lg print:shadow-none">
          <div className="flex justify-between items-start mb-8 print:hidden">
            <Button variant="outline" asChild>
                <Link href="/forms/printable-package">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Printable Forms
                </Link>
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Form
            </Button>
          </div>
          
           <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Declaration of Eligibility</h1>
                <p className="mt-2 text-md text-gray-500 max-w-2xl mx-auto">This form is for a Physician/AP to establish presumptive eligibility and must be signed by the member's Primary Care Provider (PCP) or a provider with an established relationship with the member.</p>
            </div>

          <form>
            <div className="space-y-8">
                <div>
                    <h3 className="text-lg font-semibold">To be completed by the Primary Care Provider (PCP) or other physician/practitioner (practitioner).</h3>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-4 mt-4">
                        <p>
                            I, <span className="inline-block border-b border-gray-400 w-64"></span>, in the professional capacity as a <span className="inline-block border-b border-gray-400 w-64"></span>, affirm that Member <span className="inline-block border-b border-gray-400 w-64"></span> is currently receiving a medically necessary Skilled Nursing Facility Level of Care (SNF LOC) or meets the minimum criteria for receiving SNF LOC services and, in lieu of entering a facility, is choosing to remain in the community and continue receiving medically necessary SNF LOC services in an assisted living facility for the following reason(s):
                        </p>
                    </div>
                    <Field label="Medical Record Number (MRN)" />

                    <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700">1. Please provide a short narrative on why you believe the member is at risk for premature institutionalization and his/her need for the CS:</label>
                        <LongField />
                        <LongField />
                        <LongField />
                        <LongField />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-6">
                        <Field label="Provider's Title" />
                        <Field label="Provider's NPI #" />
                        <Field label="Provider's Phone" />
                        <Field label="Provider's Email" />
                    </div>
                     <Field label="Provider's Organization" />
                     <Field label="Provider's Signature (Full Name)" />
                     <Field label="Signature Date" />
                </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
