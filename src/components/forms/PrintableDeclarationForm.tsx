'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableDeclarationFormProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableDeclarationForm({ 
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true 
}: PrintableDeclarationFormProps) {
  return (
    <PrintableFormLayout
      title="CalAIM Community Support (CS) for SNF Diversion to Assisted Living Declaration of Eligibility"
      subtitle=""
      formType="declaration"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Header Instructions */}
      <div className="col-span-full mb-6">
        <p className="text-sm print:text-xs font-semibold">
          To be filled out by primary care provider (PCP):
        </p>
        <p className="text-sm print:text-xs mt-2">
          Please print:
        </p>
      </div>

      {/* Main Declaration */}
      <div className="col-span-full space-y-4 text-sm print:text-xs">
        <div className="space-y-4">
          <p>
            I, <span className="inline-block border-b border-gray-400 print:border-black w-64 mx-1"></span>, in the professional capacity as a primary care physician (PCP)
          </p>
          
          <p>
            affirm Member's Name: <span className="inline-block border-b border-gray-400 print:border-black w-64 mx-1"></span>
          </p>
          
          <p>
            Member's Medical Record Number: <span className="inline-block border-b border-gray-400 print:border-black w-48 mx-1"></span> Date of Birth: <span className="inline-block border-b border-gray-400 print:border-black w-48 mx-1"></span>
          </p>
          
          <p className="leading-relaxed">
            Is currently receiving medically necessary Skilled Nursing Facility Level of Care (SNF LOC) or meets the 
            minimum criteria to receive SNF LOC services and, in lieu of going into a facility, is choosing to remain in the 
            community and continue to receive medically necessary SNF LOC services at an assisted living facility for the 
            following reasons:
          </p>
        </div>

        {/* Narrative Section */}
        <div className="mt-6">
          <p className="font-medium mb-3">
            1. Please provide a short narrative about why you consider the member is at risk of pre-mature 
            institutionalization and his/her need for the CS:
          </p>
          
          <div className="space-y-2">
            <div className="h-6 border-b border-gray-400 print:border-black"></div>
            <div className="h-6 border-b border-gray-400 print:border-black"></div>
            <div className="h-6 border-b border-gray-400 print:border-black"></div>
            <div className="h-6 border-b border-gray-400 print:border-black"></div>
            <div className="h-6 border-b border-gray-400 print:border-black"></div>
          </div>
        </div>

        {/* Provider Information */}
        <div className="mt-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span>Date: </span>
              <span className="inline-block border-b border-gray-400 print:border-black w-32"></span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span>Professional Title: </span>
              <span className="inline-block border-b border-gray-400 print:border-black w-20"></span>
              <span className="ml-2">(e.g., Dr.)</span>
            </div>
            <div>
              <span>Name: </span>
              <span className="inline-block border-b border-gray-400 print:border-black w-48"></span>
            </div>
            <div>
              <span>NPI: </span>
              <span className="inline-block border-b border-gray-400 print:border-black w-32"></span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span>Contact Phone Number: </span>
              <span className="inline-block border-b border-gray-400 print:border-black w-32"></span>
            </div>
            <div>
              <span>E-mail: </span>
              <span className="inline-block border-b border-gray-400 print:border-black w-48"></span>
            </div>
          </div>
          
          <div>
            <span>Hospital/Clinic Name/Organization: </span>
            <span className="inline-block border-b border-gray-400 print:border-black w-64"></span>
          </div>
          
          <div className="mt-6">
            <span>Signature: </span>
            <span className="inline-block border-b border-gray-400 print:border-black w-64"></span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 print:border-black">
          <p className="text-xs">
            CS Information at: <a href="https://www.carehomefinders.com/calaimreferralpackage" className="text-blue-600 print:text-black underline">www.carehomefinders.com/calaimreferralpackage</a> or 800-330-5993.
          </p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}