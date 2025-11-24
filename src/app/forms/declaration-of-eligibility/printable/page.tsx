
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const Field = ({ label, className = '', description }: { label: string; className?: string, description?: string }) => (
    <div className={`pt-2 ${className}`}>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="mt-1 h-5 border-b border-gray-400"></div>
      {description && <p className="text-xs text-gray-500 pt-1">{description}</p>}
    </div>
  );

const LongField = ({ className = '' }: { className?: string }) => (
  <div className={`pt-2 ${className}`}>
    <div className="mt-1 h-5 border-b border-gray-400"></div>
  </div>
);

export function PrintableDeclarationOfEligibilityContent() {
    return (
        <form className="page-break-after">
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Declaration of Eligibility</h1>
                <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">This form is for a Physician/AP to establish presumptive eligibility and must be signed by the member's Primary Care Provider (PCP) or a provider with an established relationship with the member.</p>
            </div>
            <div className="space-y-6 text-sm">
                <div>
                    <h3 className="text-base font-semibold">To be completed by the Primary Care Provider (PCP) or other physician/practitioner (practitioner).</h3>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-3 mt-3">
                        <p>
                            I, <span className="inline-block border-b border-gray-400 w-56"></span>, in the professional capacity as a <span className="inline-block border-b border-gray-400 w-56"></span>, affirm that Member <span className="inline-block border-b border-gray-400 w-56"></span> is currently receiving a medically necessary Skilled Nursing Facility Level of Care (SNF LOC) or meets the minimum criteria for receiving SNF LOC services and, in lieu of entering a facility, is choosing to remain in the community and continue receiving medically necessary SNF LOC services in an assisted living facility for the following reason(s):
                        </p>
                    </div>
                    <Field 
                        label="Medi-Cal Number (9 characters) or Medical Record Number" 
                        description="Medi-Cal Number for Health Net, Medical Record Number for Kaiser."
                    />

                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-700">1. Please provide a short narrative on why you believe the member is at risk for premature institutionalization and his/her need for the CS:</label>
                        <LongField />
                        <LongField />
                        <LongField />
                        <LongField />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-4">
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
    )
}

export default function PrintableDeclarationOfEligibilityPage() {

  const handlePrint = () => {
    window.print();
  };
  
  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
      <div className="container mx-auto py-8 px-4 print:p-0">
        <div className="bg-white p-4 sm:p-8 shadow-lg rounded-lg print:shadow-none print:p-4">
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
          
          <PrintableDeclarationOfEligibilityContent />
        </div>
      </div>
    </div>
  );
}
