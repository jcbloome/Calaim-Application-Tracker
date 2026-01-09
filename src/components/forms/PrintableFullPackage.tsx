'use client';

import React from 'react';
import { PrintableCsSummaryForm } from './PrintableCsSummaryForm';
import { PrintableWaiversForm } from './PrintableWaiversForm';
import { PrintableDeclarationForm } from './PrintableDeclarationForm';
import { PrintableGlossaryForm } from './PrintableGlossaryForm';
import { PrintableProgramInfoForm } from './PrintableProgramInfoForm';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableFullPackageProps {
  applicationData?: Partial<FormValues>;
  applicationId?: string;
  pathway?: 'SNF Transition' | 'SNF Diversion';
  showPrintButton?: boolean;
}

export function PrintableFullPackage({ 
  applicationData = {},
  applicationId,
  pathway,
  showPrintButton = true 
}: PrintableFullPackageProps) {
  return (
    <div className="space-y-12 print:space-y-16">
      {/* Package Cover Page */}
      <div className="bg-white shadow-lg print:shadow-none print:bg-white">
        <div className="p-8 print:p-6 text-center border-b print:border-b-2 print:border-black">
          <h1 className="text-4xl print:text-3xl font-bold text-gray-900 print:text-black mb-4">
            CalAIM Application Package
          </h1>
          <h2 className="text-2xl print:text-xl font-semibold text-gray-700 print:text-black mb-6">
            Community Support for Assisted Living Transitions
          </h2>
          
          <div className="max-w-2xl mx-auto space-y-4 text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm print:text-xs">
              <div>
                <strong>Application ID:</strong> {applicationId || '_________________'}
              </div>
              <div>
                <strong>Date Prepared:</strong> {new Date().toLocaleDateString()}
              </div>
              <div>
                <strong>Member Name:</strong> {applicationData.memberFirstName && applicationData.memberLastName 
                  ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
                  : '_________________'}
              </div>
              <div>
                <strong>Pathway:</strong> {pathway || applicationData.pathway || '_________________'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 print:p-6">
          <h3 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
            Package Contents
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-900 print:text-black mb-2">Required Forms:</h4>
              <ul className="text-sm print:text-xs text-gray-700 print:text-black space-y-1 list-disc list-inside">
                <li>Program Information & Acknowledgment</li>
                <li>CS Member Summary Form</li>
                <li>Waivers & Authorizations</li>
                {pathway === 'SNF Diversion' && <li>Declaration of Eligibility</li>}
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 print:text-black mb-2">Reference Materials:</h4>
              <ul className="text-sm print:text-xs text-gray-700 print:text-black space-y-1 list-disc list-inside">
                <li>Acronym Glossary</li>
                <li>Program Information Guide</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
            <h4 className="font-medium text-gray-900 print:text-black mb-2">Instructions:</h4>
            <ol className="text-sm print:text-xs text-gray-700 print:text-black space-y-1 list-decimal list-inside">
              <li>Print all pages of this package</li>
              <li>Complete all required forms using black or blue ink</li>
              <li>Sign and date where indicated</li>
              <li>Scan or photograph completed forms clearly</li>
              <li>Upload completed forms through your online application portal</li>
              <li>Keep copies for your records</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Program Information */}
      <PrintableProgramInfoForm 
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* CS Summary Form */}
      <PrintableCsSummaryForm 
        data={applicationData}
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Waivers & Authorizations */}
      <PrintableWaiversForm 
        memberName={applicationData.memberFirstName && applicationData.memberLastName 
          ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
          : ''}
        memberMrn={applicationData.memberMrn || ''}
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Declaration of Eligibility (only for SNF Diversion) */}
      {(pathway === 'SNF Diversion' || applicationData.pathway === 'SNF Diversion') && (
        <>
          <div className="page-break print:page-break-before"></div>
          <PrintableDeclarationForm 
            memberName={applicationData.memberFirstName && applicationData.memberLastName 
              ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
              : ''}
            memberMrn={applicationData.memberMrn || ''}
            applicationId={applicationId}
            showPrintButton={false}
          />
        </>
      )}

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Acronym Glossary */}
      <PrintableGlossaryForm 
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Package Footer */}
      <div className="mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black text-center">
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-2">
          <strong>End of CalAIM Application Package</strong>
        </p>
        <p className="text-xs print:text-xs text-gray-500 print:text-black">
          For questions or assistance, please contact your assigned case worker or visit our website.
        </p>
        <div className="mt-4 pt-4 border-t print:border-t print:border-gray-300">
          <p className="text-xs print:text-xs text-gray-500 print:text-black">
            Package generated on {new Date().toLocaleDateString()} • Application ID: {applicationId || 'N/A'}
          </p>
        </div>
      </div>

      {/* Print Controls - Only show if enabled */}
      {showPrintButton && (
        <div className="fixed bottom-4 right-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 font-medium"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Complete Package
          </button>
        </div>
      )}
    </div>
  );
}