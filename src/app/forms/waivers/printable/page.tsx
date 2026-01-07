
'use client'; 

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const CheckboxField = ({ label }: { label: string }) => (
    <div className="flex items-center mt-2">
        <div className="h-4 w-4 border border-gray-500 rounded-sm"></div>
        <label className="ml-2 text-sm text-gray-700">{label}</label>
    </div>
);

export default function WaiverFormPage() {
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-black print:bg-white">
      <header className="print:hidden sticky top-0 bg-white/80 backdrop-blur-sm border-b z-10">
        <div className="container mx-auto py-4 px-4">
            <div className="flex justify-between items-center">
                <Button variant="outline" asChild>
                    <Link href="/forms/printable-package" target="_blank">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Printable Forms
                    </Link>
                </Button>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Form
                </Button>
            </div>
        </div>
      </header>
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto border p-8 shadow-sm bg-white print:border-none print:shadow-none print:p-0">
            <div className="text-center mb-8">
            <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">
                Waivers & Authorizations
            </h1>
            <p className="text-slate-600 mt-2 text-sm">
                This document contains the HIPAA Authorization, Liability Waiver, Freedom of Choice, and Room & Board acknowledgments.
            </p>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                Member Name
                </label>
                <div className="border-b border-slate-400 h-8"></div>
            </div>
            <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                Medical Record Number (MRN)
                </label>
                <div className="border-b border-slate-400 h-8"></div>
                <p className="text-[10px] text-slate-500 mt-1">
                For Health Net use the Medi-Cal number. For Kaiser use their specific MRN.
                </p>
            </div>
            </div>

            <div className="space-y-6 text-sm leading-relaxed text-slate-800">
            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                HIPAA Authorization
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                    <p>This form, when completed and signed by you (member or POA), authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                    <p><strong>Authorized to disclose:</strong> Any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions</p>
                    <p><strong>Authorized to receive:</strong> Connections Care Home Consultants, LLC</p>
                    
                    <p className="font-bold">Description of Information to be Disclosed</p>
                    <p>The information to be disclosed includes, but is not limited to:</p>
                    <ul className="list-disc pl-5">
                        <li>Demographic information (Name, DOB, Social Security Number, Medi-Cal ID).</li>
                        <li>Medical history and physical examination reports.</li>
                        <li>Individual Service Plans (ISP) and Functional Assessments.</li>
                        <li>Level of Care (LOC) Tier determinations.</li>
                        <li>Physician orders and medication lists.</li>
                    </ul>

                    <p className="font-bold mt-4">Purpose of Disclosure</p>
                    <p>This information will be used specifically for:</p>
                    <ul className="list-disc pl-5">
                        <li>Determining eligibility for CalAIM Community Supports.</li>
                        <li>Conducting clinical assessments for tier-level placement.</li>
                        <li>Facilitating transition and admission into a contracted RCFE/ARF.</li>
                        <li>Coordinating billing and claims processing between the Facility, Connections, and the MCP.</li>
                    </ul>

                    <p><strong>Expiration:</strong> This authorization expires one year from the date of signature.</p>
                    <p><strong>My Rights:</strong> Under my rights member (or POA) must sign document to move forward with the CS but can revoke this authorization at any time.</p>
                </div>
                <CheckboxField label="I have read and understood the HIPAA Authorization section." />
            </section>
            
            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                Member/POA Waiver and Release of Liability
                </h2>
                <div className="space-y-2 text-xs">
                    <p><strong>1. Acknowledgment of Independent Entities</strong> The undersigned (Member or Power of Attorney/Legal Authorized Representative) acknowledges that Connections Care Home Consultants LLC ("CONNECTIONS") is a referral and administrative consultant. I understand that the Residential Care Facilities for the Elderly (RCFE) or Adult Residential Facilities (ARF) referred by CONNECTIONS are independent businesses. They are not owned, operated, managed, or supervised by CONNECTIONS.</p>
                    <p><strong>2. Assumption of Risk</strong> I understand that placement in a care facility involves inherent risks, including but not limited to medical emergencies, physical injuries, falls, or complications from care. I voluntarily assume all risks associated with the Member’s residency and care at any facility selected, whether or not referred by CONNECTIONS.</p>
                    <p><strong>3. Release and Waiver of Liability</strong> To the maximum extent permitted by law, I, on behalf of myself, the Member, and our heirs or estate, hereby release, forever discharge, and hold harmless Connections Care Home Consultants LLC, its officers, employees, and agents from any and all liability, claims, and demands of whatever kind or nature, either in law or in equity, which arise or may hereafter arise from the Member’s placement at a facility. This includes, but is not limited to, liability for: Physical Injury or Death, Clinical Care, Safety Issues, or Infections/Illness.</p>
                    <p><strong>4. Covenant Not to Sue</strong> I agree that I will not initiate any legal action, lawsuit, or administrative claim against CONNECTIONS for damages, injuries, or losses caused by the acts, omissions, or conditions of a third-party care facility. I acknowledge that my sole legal recourse for matters involving the quality of care or physical safety resides against the facility providing the direct care.</p>
                    <p><strong>5. RN Assessment (ISP) Disclosure</strong> I understand that while a CONNECTIONS RN may perform an Individual Service Plan (ISP) for the purpose of CalAIM tier-level determination, this assessment does not constitute the "management of care." The facility is solely responsible for creating its own care plan and ensuring the Member’s daily needs and safety are met.</p>
                </div>
                <CheckboxField label="I have read and understood the Waiver and Release of Liability section." />
            </section>

            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                Freedom of Choice Waiver
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                    <p>I (or my POA) understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I (or my POA) can choose to accept or decline these services.</p>
                    <p>If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.</p>
                    <p>If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.</p>
                </div>
                 <CheckboxField label="I have read and understood the Freedom of Choice Waiver section." />
                <h3 className="text-base font-semibold mt-4">My Choice:</h3>
                <div className="flex gap-8 mt-2">
                    <CheckboxField label="I choose to accept services." />
                    <CheckboxField label="I choose to decline services." />
                </div>
            </section>

            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                Room & Board Payments
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                    <p>
                        I have read and understood that the member (or POA) is required to pay a "Room and Board" portion to the care facility. This was explained in the application form.
                    </p>
                </div>
                 <CheckboxField label='I have read and understood the member is responsible for a "room and board" payment to the facility.' />
            </section>

            <div className="mt-12 pt-8 border-t">
                <h2 className="text-lg font-bold text-slate-900 mb-2">Signature for All Sections</h2>
                <p className="text-xs italic text-gray-600 my-2">By signing below, I acknowledge that under penalty of perjury, I am the member or an authorized representative (POA) legally empowered to sign on behalf of the member, and that I agree to all sections above.</p>
                
                <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700">I am the:</p>
                    <div className="flex gap-6">
                        <CheckboxField label="Member" />
                        <CheckboxField label="Authorized Representative (POA)" />
                    </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                    If authorized representative, what is relationship to member (if not A/R please put N/A)?
                  </label>
                  <div className="border-b border-slate-400 h-8"></div>
                </div>

                <div className="grid grid-cols-2 gap-8 mt-6">
                <div>
                    <div className="border-b border-slate-400 h-8"></div>
                    <p className="text-xs uppercase font-bold text-slate-500 mt-1">Signature (Full Name)</p>
                </div>
                <div>
                    <div className="border-b border-slate-400 h-8"></div>
                    <p className="text-xs uppercase font-bold text-slate-500 mt-1">Date</p>
                </div>
                </div>
            </div>
            </div>
        </div>
      </main>
    </div>
  );
}
