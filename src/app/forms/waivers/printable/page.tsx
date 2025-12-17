
'use client'; // 👈 THIS IS CRITICAL. Without it, onClick will not work.

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
  
  // This function triggers the browser's print dialog
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-black print:bg-white">
      {/* --- TOP CONTROLS (Hidden when printing) --- */}
      <header className="print:hidden sticky top-0 bg-white/80 backdrop-blur-sm border-b z-10">
        <div className="container mx-auto py-4 px-4">
            <div className="flex justify-between items-center">
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
        </div>
      </header>
      
      {/* --- PRINTABLE CONTENT --- */}
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto border p-8 shadow-sm bg-white print:border-none print:shadow-none print:p-0">
            {/* Header */}
            <div className="text-center mb-8">
            <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">
                Waivers & Authorizations
            </h1>
            <p className="text-slate-600 mt-2 text-sm">
                This document contains the HIPAA Authorization, Liability Waiver, and Freedom of Choice acknowledgments.
            </p>
            </div>

            {/* Input Fields Row */}
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

            {/* Content Body */}
            <div className="space-y-6 text-sm leading-relaxed text-slate-800">
            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                HIPAA Authorization
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                <p>This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                <p><strong>Authorized to disclose:</strong> Any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions.</p>
                <p><strong>Authorized to receive:</strong> Connections Care Home Consultants, LLC.</p>
                <p><strong>Information to be disclosed:</strong> All medical records necessary for Community Supports (CS) application.</p>
                <p><strong>Purpose:</strong> To determine eligibility and arrange services for CS for Assisted Living Transitions.</p>
                <p><strong>Expiration:</strong> This authorization expires one year from the date of signature.</p>
                <p><strong>My Rights:</strong> I understand that I may refuse to sign this authorization. My healthcare treatment is not dependent on my signing this form. I may revoke this authorization at any time by writing to the disclosing party, but it will not affect any actions taken before the revocation was received. A copy of this authorization is as valid as the original. I understand that information disclosed may be subject to re-disclosure by the recipient and may no longer be protected by federal privacy regulations (HIPAA).</p>
                </div>
                <CheckboxField label="I have read and understood the HIPAA Authorization section." />
            </section>
            
            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                Liability Waiver & Hold Harmless Agreement
                </h2>
                <div className="space-y-2 text-xs">
                    <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not to, negligence, fault, or breach of contract.</p>
                    <p><strong>Assumption of Risk.</strong> Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
                    <p><strong>No Insurance.</strong> Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
                    <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
                </div>
                <CheckboxField label="I have read and understood the Liability Waiver section." />
            </section>

            <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
                Freedom of Choice Waiver
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                    <p>I understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I can choose to accept or decline these services.</p>
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

            {/* Signature Area */}
            <div className="mt-12 pt-8 border-t">
                <h2 className="text-lg font-bold text-slate-900 mb-2">Signature for All Sections</h2>
                <p className="text-xs italic text-gray-600 my-2">By signing below, I acknowledge that under penalty of perjury, I am the member or an authorized representative legally empowered to sign on behalf of the member, and that I agree to all sections above.</p>
                
                <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700">I am the:</p>
                    <div className="flex gap-6">
                        <CheckboxField label="Member" />
                        <CheckboxField label="Authorized Representative" />
                    </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                    If Authorized Representative, relationship to member:
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

