'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

const Field = ({ label, className = '' }: { label: string; className?: string }) => (
  <div className={`pt-4 ${className}`}>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <div className="mt-1 h-6 border-b border-gray-400"></div>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 mb-4 mt-8">{children}</h2>
);


export default function PrintableCsSummaryForm() {

  const handlePrint = () => {
    window.print();
  };
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-8 sm:p-12 shadow-lg rounded-lg print:shadow-none">
          <div className="flex justify-between items-start mb-8 print:hidden">
            <h1 className="text-3xl font-bold text-gray-900">Printable CS Summary Form</h1>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Form
            </Button>
          </div>
          
           <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">CS Member Summary</h1>
                <p className="mt-2 text-md text-gray-500 max-w-2xl mx-auto">This form gathers essential information about the member to determine eligibility for the CalAIM Community Supports program.</p>
            </div>

          <form>
            <div className="space-y-8">
              <div>
                <SectionTitle>Member Information</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="First Name" />
                  <Field label="Last Name" />
                  <Field label="Date of Birth (MM/DD/YYYY)" />
                  <Field label="Age" />
                  <Field label="Medi-Cal Number" />
                  <Field label="Confirm Medi-Cal Number" />
                  <Field label="Medical Record Number (MRN)" />
                  <Field label="Confirm Medical Record Number" />
                  <Field label="Preferred Language" />
                </div>
              </div>

              <div>
                <SectionTitle>Your Information (Person Filling Out Form)</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="First Name" />
                  <Field label="Last Name" />
                  <Field label="Relationship to Member (e.g., Self, Social Worker)" />
                  <Field label="Referral Source Name (e.g., Hospital Name)" />
                  <Field label="Your Phone" />
                  <Field label="Your Email" />
                </div>
              </div>

              <div>
                <SectionTitle>Member Contact Information</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="Member Phone" />
                  <Field label="Member Email" />
                </div>
                <div className="mt-6 flex items-center">
                    <div className="h-5 w-5 border border-gray-400 rounded-sm"></div>
                    <label className="ml-3 text-sm text-gray-700">Member is the best contact person.</label>
                </div>
              </div>

              <div>
                 <h3 className="text-lg font-medium text-gray-800 mt-6">Best Contact Person</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                    <Field label="First Name" />
                    <Field label="Last Name" />
                    <Field label="Relationship to Member" />
                    <div className="grid grid-cols-3 gap-x-4">
                        <Field label="Phone" className="col-span-2" />
                        <Field label="Ext." />
                    </div>
                    <Field label="Email" />
                    <Field label="Best Contact's Preferred Language" />
                 </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
