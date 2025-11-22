
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
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Declaration of Eligibility for Community Supports</h1>
                <p className="mt-2 text-md text-gray-500 max-w-2xl mx-auto">This form is required for the SNF Diversion/Transition program.</p>
            </div>

          <form>
            <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="Member Name" />
                  <Field label="Medi-Cal Number" />
                </div>

                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                    <p>I declare under penalty of perjury under the laws of the State of California that the following is true and correct:</p>
                    <p>I am an adult at risk for long-term care institutionalization who is choosing to reside in an approved Home and Community-Based setting as an alternative to a Skilled Nursing Facility (SNF).</p>
                    <p>My current annual income is not sufficient to pay for my cost of care in a Residential Care Facility for the Elderly (RCFE) or Adult Residential Facility (ARF) without assistance from the state.</p>
                    <p>My current assets do not exceed the asset limit for the Aged & Disabled Federal Poverty Level Program (A&DFPL), which is $130,000 for an individual or $195,000 for a couple.</p>
                </div>
              
              <div>
                <SectionTitle>Signature</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4">
                    <Field label="Signature of Member or Legal Representative" />
                    <Field label="Date" />
                </div>
              </div>

            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
