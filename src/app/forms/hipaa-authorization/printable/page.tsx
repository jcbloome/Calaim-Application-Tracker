
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

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-2 mt-4">{children}</h2>
);

const CheckboxField = ({ label }: { label: string }) => (
    <div className="flex items-center mt-2">
        <div className="h-4 w-4 border border-gray-400 rounded-sm"></div>
        <label className="ml-2 text-xs text-gray-700">{label}</label>
    </div>
);

export default function PrintableHipaaForm() {

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
          
           <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">HIPAA Authorization Form</h1>
                <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">Authorization for Use or Disclosure of Protected Health Information (PHI).</p>
            </div>

          <form>
            <div className="space-y-4">
              <div>
                <SectionTitle>Patient Information</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  <Field label="Patient Name" />
                  <Field 
                    label="Medi-Cal Number (9 characters) or Medical Record Number" 
                    description="Medi-Cal Number for Health Net, Medical Record Number for Kaiser."
                  />
                </div>
              </div>

              <div className="prose prose-xs max-w-none text-gray-700 space-y-3">
                  <p>This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                  
                  <div>
                      <h3 className="font-semibold text-gray-800">Person(s) or organization(s) authorized to make the disclosure:</h3>
                      <p>any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions</p>
                  </div>

                  <div>
                      <h3 className="font-semibold text-gray-800">Person(s) or organization(s) authorized to receive the information:</h3>
                      <p>Connections Care Home Consultants, LLC</p>
                  </div>
                  
                  <div>
                      <h3 className="font-semibold text-gray-800">Specific information to be disclosed:</h3>
                      <p>All medical records necessary for Community Supports (CS) application.</p>
                  </div>

                  <div>
                      <h3 className="font-semibold text-gray-800">The information will be used for the following purpose:</h3>
                      <p>To determine eligibility and arrange services for CS for Assisted Living Transitions.</p>
                  </div>

                  <div>
                      <h3 className="font-semibold text-gray-800">This authorization expires:</h3>
                      <p>One year from the date of signature.</p>
                  </div>

                  <div>
                      <h3 className="font-semibold text-gray-800">My rights:</h3>
                      <p>I understand that I may refuse to sign this authorization. My healthcare treatment is not dependent on my signing this form. I may revoke this authorization at any time by writing to the disclosing party, but it will not affect any actions taken before the revocation was received. A copy of this authorization is as valid as the original. I understand that information disclosed pursuant to this authorization may be subject to re-disclosure by the recipient and may no longer be protected by federal privacy regulations.</p>
                  </div>

                  <div>
                      <h3 className="font-semibold text-gray-800">Redisclosure:</h3>
                      <p>I understand that the person(s) or organization(s) I am authorizing to receive my information may not be required to protect it under federal privacy laws (HIPAA). Therefore, the information may be re-disclosed without my consent.</p>
                  </div>
              </div>

              <div>
                <SectionTitle>Sensitive Information</SectionTitle>
                <p className="text-xs text-gray-700">This includes information related to substance abuse, mental health conditions, and HIV/AIDS.</p>
                <h4 className="font-semibold mt-2 text-xs text-gray-800">Do you authorize the release of sensitive information?</h4>
                <CheckboxField label="Yes, I authorize the release of this information." />
              </div>
              
              <div>
                <SectionTitle>Signature</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <Field label="Signature (Full Name)" />
                    <Field label="Date" />
                </div>
                <Field label="Relationship to Member" />
              </div>

            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
