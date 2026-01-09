'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { acronyms } from '@/lib/data';

interface PrintableProgramInfoFormProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableProgramInfoForm({ 
  applicationId,
  showPrintButton = true 
}: PrintableProgramInfoFormProps) {
  return (
    <PrintableFormLayout
      title="CalAIM Program Information & Acknowledgment"
      subtitle="Community Support for Assisted Living Transitions"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Acronym Reference */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
        <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
          Quick Reference - Key Terms
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {acronyms.map((acronym) => (
            <div key={acronym.term} className="text-sm print:text-xs">
              <strong className="text-gray-900 print:text-black">{acronym.term}:</strong>{' '}
              <span className="text-gray-700 print:text-black">{acronym.definition}</span>
            </div>
          ))}
        </div>
      </div>

      {/* What is CalAIM */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          What is CalAIM?
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to 
          transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and 
          creating a more seamless and consistent system. It aims to achieve this through a focus on 
          "whole person care," which includes addressing social determinants of health, integrating physical, 
          mental, and social services, and launching new programs like Enhanced Care Management (ECM) and 
          Community Supports. CS and ECM are administered through managed care plans (MCPs).
        </p>
      </div>

      {/* Community Support for Assisted Living Transitions */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Community Support for Assisted Living Transitions
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          There are 14 Community Supports (CS), and this application portal is for one of them, called 
          Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted 
          living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential 
          Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater 
          independence and community integration. The CS is either for SNF Diversion (for members coming 
          from a community-based setting at risk of premature institutionalization) or SNF Transitions 
          (for members residing in SNFs eligible to reside in assisted living settings).
        </p>
      </div>

      {/* The Role of Connections */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          The Role of Connections Care Home Consultants
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          For 35 years Connections has helped private paid families find care homes. We are excited to now 
          be partnered with MCPs as a CS Provider that assists with understanding the program, finding 
          participating facilities, coordinating paperwork and assessments, and liaising with your Managed 
          Care Plan to request authorization for the CS. Once a member is placed, we also send a MSW to 
          visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.
        </p>
      </div>

      {/* Types of Assisted Living */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Types of Assisted Living (RCFEs/ARFs)
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed mb-4">
          Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different 
          environment. Connections can help you find a setting that best suits your needs:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-4 print:p-4 bg-gray-50 print:bg-white border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-2">Small, Home-Like Settings</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers 
              more personalized attention and a quieter, more intimate living experience.
            </p>
          </div>
          <div className="p-4 print:p-4 bg-gray-50 print:bg-white border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-2">Large, Community Settings</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of 
              planned activities, and social opportunities. Staff is available as needed to provide care and support.
            </p>
          </div>
        </div>
      </div>

      {/* Managed Care Plans */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Managed Care Plans We Work With
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed mb-4">
          You must be a member of one of these plans to utilize us for the CS for Assisted Transitions:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black">Health Net</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Serving members in Sacramento and Los Angeles counties.
            </p>
          </div>
          <div className="p-4 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black">Kaiser Permanente</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Serving members in various counties throughout California.
            </p>
          </div>
        </div>
      </div>

      {/* Room & Board Payments */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Important: Room & Board Payments
        </h2>
        <div className="space-y-4 text-sm print:text-xs text-gray-700 print:text-black">
          <p>
            The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is 
            responsible for paying the RCFE the 'assisted living' portion.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-gray-900 print:text-black mb-2">With SSI/SSP & NMOHC:</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>SSI/SSP bumped up to $1,626.07</li>
                <li>Member retains $182 for personal needs</li>
                <li>RCFE receives $1,444.07 for room and board</li>
                <li>Minimum payment: $1,447.00</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 print:text-black mb-2">Without NMOHC:</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Still have room and board obligation</li>
                <li>Amount may be flexible</li>
                <li>Depends on RCFE and tier level</li>
                <li>Cannot pay = usually not eligible</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* CalAIM Turnaround Time */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          CalAIM Turnaround Time
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-4 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-3">
              Health Net: 5-7 Business Days
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
              <li>Compile required documents, RN does virtual ISP visit</li>
              <li>Determine tiered rate</li>
              <li>Recommend RCFEs to family</li>
              <li>Submit authorization request and receive determination</li>
            </ol>
          </div>
          <div className="p-4 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-3">
              Kaiser: 2-4 Weeks
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
              <li>Compile documents & request authorization</li>
              <li>Receive authorization determination</li>
              <li>If approved, RN does in-person ISP visit</li>
              <li>Send ISP to Kaiser for tier level</li>
              <li>Receive tier level, recommend RCFEs</li>
              <li>RCFE contracts with Kaiser, member moves in</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Share of Cost */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-red-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Important: Share of Cost (SOC)
        </h2>
        <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
          <p>
            A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you 
            may have to pay each month towards medical-related services before your Medi-Cal coverage begins to pay.
          </p>
          <p className="font-semibold text-red-700 print:text-black">
            Members cannot apply for CalAIM with a SOC. It must be eliminated before becoming eligible to apply.
          </p>
          <p>
            For information on eliminating share of cost, visit the California Advocates for Nursing Home 
            Reform (CANHR) website or contact your case worker.
          </p>
        </div>
      </div>

      {/* Individual Service Plan */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          What is an Individual Service Plan (ISP)?
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's 
          (MCP) clinical team to determine the member's care needs and to approve them for the program. The 
          ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done 
          virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to 
          determine level of care (the amount the MCP will pay for the 'assisted living' portion). For 
          Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is 
          determined by Kaiser.
        </p>
      </div>

      {/* Acknowledgment Section */}
      <div className="col-span-full mt-12 print:mt-16 p-4 print:p-6 border-2 print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Program Information Acknowledgment
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black mb-6">
          By signing below, I acknowledge that I have read and understood the CalAIM Program Information 
          provided above. I understand the requirements, processes, and my responsibilities as outlined in this document.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Member/Representative Signature *
            </label>
            <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Date *
            </label>
            <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>
        
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
            Print Name
          </label>
          <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}