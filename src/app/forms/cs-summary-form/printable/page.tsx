
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

export function PrintableCsSummaryFormContent() {
  return (
    <form className="page-break-after">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">CS Member Summary</h1>
        <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">This form gathers essential information about the member to determine eligibility for the CalAIM Community Supports program.</p>
      </div>
      <div className="space-y-4">
        <div>
          <SectionTitle>Member Information</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <Field label="First Name" />
            <Field label="Last Name" />
            <Field label="Date of Birth (MM/DD/YYYY)" />
            <Field label="Age" />
              <Field 
              label="Medi-Cal Number" 
              description="Format: 9 digits and a letter (e.g. 91234567A)."
            />
              <Field label="Confirm Medi-Cal Number" />
            <Field 
              label="Medical Record Number (MRN)"
              description="Medical Record Number for Kaiser. If Health Net, repeat Medi-Cal Number."
            />
            <Field label="Confirm Medical Record Number (MRN)" />
            <Field label="Preferred Language" description="e.g., English, Spanish"/>
          </div>
        </div>

        <div>
          <SectionTitle>Your Information (Person Filling Out Form)</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <Field label="First Name" />
            <Field label="Last Name" />
            <Field label="Your Phone" description="(xxx) xxx-xxxx" />
            <Field label="Your Email" />
            <Field label="Relationship to Member (e.g., Family Member, Social Worker)" />
            <Field label="Agency (e.g., Bob's Referral Agency, Hospital Name, etc.)" description="If not applicable, enter N/A"/>
          </div>
        </div>

        <div>
          <SectionTitle>Primary Contact Person</SectionTitle>
          <p className="text-xs font-medium text-gray-700 mt-2">Who is the primary contact person?</p>
            <div className="flex gap-6">
              <CheckboxField label="The Member" />
              <CheckboxField label="Another Contact Person" />
          </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="First Name" />
              <Field label="Last Name" />
              <Field label="Relationship to Member" />
              <Field label="Phone" description="(xxx) xxx-xxxx" />
              <Field label="Email" />
              <Field label="Preferred Language" />
            </div>
        </div>
        
        <div>
          <SectionTitle>Secondary Contact Person (Optional)</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="First Name" />
              <Field label="Last Name" />
              <Field label="Relationship to Member" />
              <Field label="Phone" description="(xxx) xxx-xxxx" />
              <Field label="Email" />
              <Field label="Preferred Language" />
            </div>
        </div>

        <div>
          <SectionTitle>Legal Representative</SectionTitle>
            <p className="text-xs text-gray-600 my-2">A legal representative (e.g., with Power of Attorney) is distinct from a contact person. If the legal representative is also the primary or secondary contact, please enter their information again here to confirm their legal role.</p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Does member have capacity to make their own decisions?</p>
              <div className="flex gap-6">
                  <CheckboxField label="Yes" />
                  <CheckboxField label="No" />
              </div>
            </div>
            <div className="space-y-2 mt-3">
              <p className="text-xs font-medium text-gray-700">Does member have a legal representative? (e.g., power of attorney)</p>
              <div className="flex gap-6">
                  <CheckboxField label="Yes" />
                  <CheckboxField label="No" />
                  <CheckboxField label="Unknown" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-800 mt-4">Representative's Contact Info</h3>
            <p className="text-xs text-gray-500 pt-1">If the member does not have a legal representative, please enter N/A in the following fields.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="Name" />
              <Field label="Relationship to Member" />
              <Field label="Phone" description="(xxx) xxx-xxxx" />
              <Field label="Email" />
            </div>
            <CheckboxField label="Is the Legal Representative also the Primary Contact Person?" />
        </div>

        <div>
          <SectionTitle>Location Information</SectionTitle>
          <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Member's Current Location</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <CheckboxField label="Skilled Nursing Facility" />
                  <CheckboxField label="Home" />
                  <CheckboxField label="Hospital" />
                  <CheckboxField label="Sub-Acute" />
                  <CheckboxField label="Recuperative Care" />
                  <CheckboxField label="Unhoused" />
                  <CheckboxField label="RCFE/ARF" />
                  <CheckboxField label="Other" />
              </div>
          </div>
          <h3 className="text-sm font-medium text-gray-800 mt-4">Current Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="Street Address" className="sm:col-span-2"/>
              <Field label="City" />
              <Field label="State" />
              <Field label="ZIP Code" />
              <Field label="County" />
            </div>
          <h3 className="text-sm font-medium text-gray-800 mt-4">Customary Residence (where is the member's normal long term address)</h3>
            <CheckboxField label="Same as current location" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="Street Address" className="sm:col-span-2"/>
              <Field label="City" />
              <Field label="State" />
              <Field label="ZIP Code" />
              <Field label="County" />
            </div>
        </div>

        <div>
          <SectionTitle>Health Plan & Pathway</SectionTitle>
            <div className="space-y-2 mt-3">
              <p className="text-xs font-medium text-gray-700">Health Plan (Managed Care Plan)</p>
              <div className="flex gap-6">
                  <CheckboxField label="Kaiser Permanente" />
                  <CheckboxField label="Health Net" />
                  <CheckboxField label="Other" />
              </div>
              <Field label="If Other, what is existing health plan?" />
              <p className="text-xs font-medium text-gray-700 mt-2">Will member be switching Health Plan by end of month?</p>
                <div className="flex gap-6">
                  <CheckboxField label="Yes" />
                  <CheckboxField label="No" />
              </div>
            </div>
          <p className="text-xs font-medium text-gray-700 mt-4">Pathway Selection</p>
            <div className="flex gap-6">
              <CheckboxField label="SNF Transition" />
              <CheckboxField label="SNF Diversion" />
          </div>
          
          <div className="mt-4 space-y-4 text-xs">
              <div className="p-4 border rounded-md">
                  <h3 className="text-sm font-medium text-gray-800">SNF Transition Eligibility Requirements</h3>
                  <p className="text-gray-600">Enables a current SNF resident to transfer to a RCFE or ARF.</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
                      <li>Has resided in a SNF for at least 60 consecutive days (which can include a combination of Medicare and Medi-Cal days and back and forth from SNF-hospital-SNF); and</li>
                      <li>Is willing to live in RCFE as an alternative to a SNF; and</li>
                      <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services.</li>
                  </ul>
              </div>
              <div className="p-4 border rounded-md">
                  <h3 className="text-sm font-medium text-gray-800">SNF Diversion Eligibility Requirements</h3>
                  <p className="text-gray-600">Transition a member who, without this support, would need to reside in a SNF and instead transitions him/her to RCFE or ARF.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
                      <li>Interested in remaining in the community; and</li>
                      <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services; and</li>
                      <li>Must be currently at medically necessary SNF level of care: e.g., require substantial help with activities of daily living (help with dressing, bathing, incontinence, etc.) or at risk of premature institutionalization; and meet the criteria to receive those services in RCFE or ARF.</li>
                  </ul>
                    <Field label="Reason for SNF Diversion (if applicable)" className="sm:col-span-2 mt-2" />
              </div>
              <CheckboxField label="All criteria for the selected pathway (SNF Diversion/Transition) have been met." />
          </div>
        </div>

        <div>
          <SectionTitle>ISP & Facility Information</SectionTitle>
            <h3 className="text-sm font-medium text-gray-800 mt-4">Individual Service Plan (ISP) Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="First Name" />
              <Field label="Last Name" />
              <Field label="Relationship to Member" />
              <Field label="Facility Name" />
              <Field label="Phone" description="(xxx) xxx-xxxx"/>
              <Field label="Email" />
            </div>
            
            <h3 className="text-sm font-medium text-gray-800 mt-4">ISP Assessment Location</h3>
            <div className="space-y-2 mt-2">
              <p className="text-xs font-medium text-gray-700">Type of Location</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <CheckboxField label="Skilled Nursing Facility" />
                  <CheckboxField label="Home" />
                  <CheckboxField label="Hospital" />
                  <CheckboxField label="Sub-Acute" />
                  <CheckboxField label="Recuperative Care" />
                  <CheckboxField label="Unhoused" />
                  <CheckboxField label="RCFE/ARF" />
                  <CheckboxField label="Other" />
              </div>
          </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="Street Address" className="sm:col-span-2"/>
              <Field label="City" />
              <Field label="State" />
              <Field label="ZIP Code" />
              <Field label="County" />
            </div>

          <h3 className="text-sm font-medium text-gray-800 mt-4">Assisted Living Waiver (ALW) Status</h3>
          <p className="text-xs text-gray-700 mt-1">Is the member currently on the ALW waitlist?</p>
          <div className="flex gap-6">
              <CheckboxField label="Yes" />
              <CheckboxField label="No" />
              <CheckboxField label="Unknown" />
          </div>

          <h3 className="text-sm font-medium text-gray-800 mt-4">RCFE Selection</h3>
          <div className="space-y-2 mt-3">
              <p className="text-xs font-medium text-gray-700">Has a preferred assisted living facility (RCFE) been chosen?</p>
              <div className="flex gap-6">
                  <CheckboxField label="Yes" />
                  <CheckboxField label="No" />
              </div>
          </div>
          <h4 className="text-xs font-medium text-gray-800 mt-4">Preferred Facility Details</h4>
          <p className="text-xs text-gray-500 pt-1">If a facility has not been chosen, please enter N/A in the following fields.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
              <Field label="Facility Name" className="sm:col-span-2"/>
              <Field label="Facility Address" className="sm:col-span-2"/>
              <Field label="Administrator Name" />
              <Field label="Administrator Phone" description="(xxx) xxx-xxxx" />
              <Field label="Administrator Email" />
          </div>
        </div>
      </div>
    </form>
  )
}

export default function PrintableCsSummaryForm() {

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
          
          <PrintableCsSummaryFormContent />
        </div>
      </div>
    </div>
  );
}
