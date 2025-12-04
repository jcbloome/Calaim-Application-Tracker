
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const Field = ({ label, className = '', description }: { label: string; className?: string; description?: string }) => (
    <div className={`pt-2 ${className}`}>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="mt-1 h-5 border-b border-gray-400"></div>
      {description && <p className="text-xs text-gray-500 pt-1">{description}</p>}
    </div>
  );

const CheckboxField = ({ label }: { label: string }) => (
    <div className="flex items-center mt-2">
        <div className="h-4 w-4 border border-gray-400 rounded-sm"></div>
        <label className="ml-2 text-xs text-gray-700">{label}</label>
    </div>
);


const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-2 mt-4">{children}</h2>
);

export function PrintableFreedomOfChoiceContent() {
    return (
        <form className="page-break-after">
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Freedom of Choice Waiver</h1>
                <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">Acknowledge your choice regarding Community Supports services.</p>
            </div>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  <Field label="Member Name" />
                  <Field 
                    label="Medical Record Number (MRN)" 
                    description="For Health Net use the Medi-Cal number (starts with 9). For Kaiser use their specific MRN."
                  />
                </div>

                <div className="prose prose-xs max-w-none text-gray-700 space-y-3">
                    <p>I understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I can choose to accept or decline these services.</p>
                    <p>If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.</p>
                    <p>If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.</p>
                </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-800 mt-4">My Choice</h3>
                <CheckboxField label="I choose to accept Community Supports services for community transition." />
                <CheckboxField label="I choose to decline Community Supports services for community transition." />
              </div>
              
              <div>
                <SectionTitle>Signature</SectionTitle>
                <p className="text-xs italic text-gray-600 my-2">By signing below, I acknowledge that under penalty of perjury, I am the member or an authorized representative legally empowered to sign on behalf of the member.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <Field label="Signature (Full Name)" />
                    <Field label="Date" />
                </div>
                <Field label="Relationship to Member" />
              </div>

            </div>
          </form>
    )
}

export default function PrintableFreedomOfChoiceWaiverPage() {

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
          
          <PrintableFreedomOfChoiceContent />
        </div>
      </div>
    </div>
  );
}
