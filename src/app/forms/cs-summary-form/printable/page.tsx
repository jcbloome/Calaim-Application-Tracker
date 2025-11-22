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

const CheckboxField = ({ label }: { label: string }) => (
    <div className="flex items-center mt-4">
        <div className="h-5 w-5 border border-gray-400 rounded-sm"></div>
        <label className="ml-3 text-sm text-gray-700">{label}</label>
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
                  <Field label="Your Phone" />
                  <Field label="Your Email" />
                  <Field label="Relationship to Member (e.g., Family Member, Social Worker)" className="sm:col-span-2" />
                </div>
              </div>

              <div>
                <SectionTitle>Member Contact Information</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="Member Phone" />
                  <Field label="Member Email" />
                </div>
                <CheckboxField label="Member is the best contact person." />
                <h3 className="text-lg font-medium text-gray-800 mt-6">Best Contact Person (if not member)</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                    <Field label="Name" />
                    <Field label="Relationship to Member" />
                    <Field label="Phone" />
                    <Field label="Email" />
                    <Field label="Preferred Language" />
                 </div>
              </div>

              <div>
                <SectionTitle>Legal Representative</SectionTitle>
                 <div className="space-y-4">
                    <p className="text-sm font-medium text-gray-700">Does member have capacity to make their own decisions?</p>
                    <div className="flex gap-8">
                        <CheckboxField label="Yes" />
                        <CheckboxField label="No" />
                        <CheckboxField label="Unknown" />
                    </div>
                 </div>
                 <div className="space-y-4 mt-6">
                    <p className="text-sm font-medium text-gray-700">Does member have a legal representative? (e.g., power of attorney)</p>
                    <div className="flex gap-8">
                        <CheckboxField label="Yes" />
                        <CheckboxField label="No" />
                    </div>
                 </div>
                 <h3 className="text-lg font-medium text-gray-800 mt-6">Representative's Contact Info</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                    <Field label="Name" />
                    <Field label="Relationship to Member" />
                    <Field label="Phone" />
                    <Field label="Email" />
                    <Field label="Preferred Language" />
                 </div>
              </div>

              <div>
                <SectionTitle>Location & Health Plan</SectionTitle>
                <Field label="Member's Current Location (SNF, Hospital, Home, etc.)" className="sm:col-span-2" />
                <h3 className="text-lg font-medium text-gray-800 mt-6">Current Address</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                    <Field label="Street Address" className="sm:col-span-2"/>
                    <Field label="City" />
                    <Field label="State" />
                    <Field label="ZIP Code" />
                 </div>
                <CheckboxField label="Customary residence is the same as current location." />
                <h3 className="text-lg font-medium text-gray-800 mt-6">Customary Residence (if different)</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                    <Field label="Street Address" className="sm:col-span-2"/>
                    <Field label="City" />
                    <Field label="State" />
                    <Field label="ZIP Code" />
                 </div>
                 <div className="space-y-4 mt-6">
                    <p className="text-sm font-medium text-gray-700">Health Plan (Managed Care Plan)</p>
                    <div className="flex gap-8">
                        <CheckboxField label="Kaiser Permanente" />
                        <CheckboxField label="Health Net" />
                        <CheckboxField label="Other" />
                    </div>
                 </div>
              </div>

              <div>
                <SectionTitle>Pathway & Eligibility</SectionTitle>
                <p className="text-sm font-medium text-gray-700">Selected Pathway</p>
                 <div className="flex gap-8">
                    <CheckboxField label="SNF Transition" />
                    <CheckboxField label="SNF Diversion" />
                </div>
                
                <h3 className="text-lg font-medium text-gray-800 mt-6">Eligibility Screening Checklist</h3>
                <p className="text-sm text-muted-foreground">Check all that apply.</p>
                <div className="mt-2 space-y-2">
                    <CheckboxField label="Currently resides in an SNF (for Transition)" />
                    <CheckboxField label="Expresses a desire to move to the community (for Transition)" />
                    <CheckboxField label="At risk of SNF admission (for Diversion)" />
                    <CheckboxField label="Requires assistance with ADLs/IADLs" />
                    <CheckboxField label="Community-based care is a viable alternative" />
                </div>

                <h3 className="text-lg font-medium text-gray-800 mt-6">ISP Contact (Individual Service Plan)</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-2">
                    <Field label="Contact Name" />
                    <Field label="Agency" />
                    <Field label="Phone" />
                 </div>

                <div className="space-y-4 mt-6">
                    <p className="text-sm font-medium text-gray-700">Has a preferred assisted living facility (RCFE) been chosen?</p>
                    <div className="flex gap-8">
                        <CheckboxField label="Yes" />
                        <CheckboxField label="No" />
                    </div>
                 </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
