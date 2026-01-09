'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { acronyms } from '@/lib/data';

interface PrintableGlossaryFormProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableGlossaryForm({ 
  applicationId,
  showPrintButton = true 
}: PrintableGlossaryFormProps) {
  return (
    <PrintableFormLayout
      title="CalAIM Acronym Glossary"
      subtitle="Common terms and abbreviations used in the CalAIM application process"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Introduction */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
        <p className="text-sm print:text-xs text-blue-800 print:text-black">
          <strong>About this glossary:</strong> This reference sheet contains common acronyms and 
          abbreviations you may encounter during the CalAIM Community Support application process. 
          Keep this handy while completing your forms or speaking with your care coordinator.
        </p>
      </div>

      {/* Glossary Table */}
      <div className="col-span-full">
        <div className="overflow-hidden border print:border-black rounded-lg print:rounded-none">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 print:bg-white border-b print:border-black">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 print:text-black border-r print:border-black">
                  Acronym
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 print:text-black">
                  Definition
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 print:divide-black">
              {acronyms.map((item, index) => (
                <tr key={item.term} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 print:bg-white'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 print:text-black border-r print:border-black">
                    {item.term}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 print:text-black">
                    {item.definition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Information */}
      <div className="col-span-full mt-8 space-y-6">
        <div className="p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Important Notes
          </h3>
          <ul className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black list-disc list-inside">
            <li>
              <strong>MRN (Medical Record Number):</strong> For Health Net members, use your Medi-Cal number 
              (starts with 9). For Kaiser members, use your specific Kaiser MRN.
            </li>
            <li>
              <strong>SNF vs. RCFE/ARF:</strong> SNF provides skilled nursing care, while RCFE/ARF provides 
              assisted living services with less intensive medical support.
            </li>
            <li>
              <strong>CalAIM Pathways:</strong> SNF Diversion helps avoid nursing facility placement, while 
              SNF Transition helps move from a nursing facility to community-based care.
            </li>
            <li>
              <strong>Community Supports (CS):</strong> Services designed to help members live independently 
              in the community rather than in institutional settings.
            </li>
          </ul>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Need Help?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm print:text-xs text-gray-700 print:text-black">
            <div>
              <p className="font-medium mb-2">For application assistance:</p>
              <ul className="space-y-1 list-disc list-inside ml-4">
                <li>Contact your assigned case worker</li>
                <li>Call the CalAIM support line</li>
                <li>Visit our website for resources</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2">For medical questions:</p>
              <ul className="space-y-1 list-disc list-inside ml-4">
                <li>Speak with your Primary Care Provider</li>
                <li>Contact your health plan directly</li>
                <li>Ask your facility's nursing staff</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Quick Reference Section */}
        <div className="p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Quick Reference - Key Contact Types
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 print:text-black mb-2">Health Plans:</h4>
              <ul className="text-sm print:text-xs text-gray-700 print:text-black space-y-1">
                <li><strong>Kaiser Permanente:</strong> Integrated health system</li>
                <li><strong>Health Net:</strong> Managed care organization</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 print:text-black mb-2">Care Levels:</h4>
              <ul className="text-sm print:text-xs text-gray-700 print:text-black space-y-1">
                <li><strong>SNF:</strong> 24/7 skilled nursing care</li>
                <li><strong>RCFE/ARF:</strong> Assisted living with support</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="col-span-full mt-8 text-center text-xs print:text-xs text-gray-500 print:text-black">
        <p>
          This glossary is provided as a reference tool. For the most current definitions and requirements, 
          please consult with your care coordinator or visit the official CalAIM resources.
        </p>
        <p className="mt-2">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </PrintableFormLayout>
  );
}