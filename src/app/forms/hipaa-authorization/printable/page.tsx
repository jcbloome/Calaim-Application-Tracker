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

const CheckboxField = ({ label }: { label: string }) => (
    <div className="flex items-center mt-4">
        <div className="h-5 w-5 border border-gray-400 rounded-sm"></div>
        <label className="ml-3 text-sm text-gray-700">{label}</label>
    </div>
);

export default function PrintableHipaaForm() {

  const handlePrint = () => {
    window.print();
  };
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-8 sm:p-12 shadow-lg rounded-lg print:shadow-none">
          <div className="flex justify-between items-start mb-8 print:hidden">
            <h1 className="text-3xl font-bold text-gray-900">Printable HIPAA Form</h1>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Form
            </Button>
          </div>
          
           <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">HIPAA Authorization Form</h1>
                <p className="mt-2 text-md text-gray-500 max-w-2xl mx-auto">Authorization for Use or Disclosure of Protected Health Information (PHI).</p>
            </div>

          <form>
            <div className="space-y-8">
              <div>
                <SectionTitle>Patient Information</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="Patient Name" />
                  <Field label="Medi-Cal Number" />
                </div>
              </div>

              <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
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
                <p className="text-sm text-gray-700">This includes information related to substance abuse, mental health conditions, and HIV/AIDS.</p>
                <h4 className="font-semibold mt-4 text-gray-800">Do you authorize the release of sensitive information?</h4>
                <CheckboxField label="Yes, I authorize the release of this information." />
              </div>
              
              <div>
                <SectionTitle>Signature</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4">
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
