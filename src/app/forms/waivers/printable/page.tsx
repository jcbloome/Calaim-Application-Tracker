
'use client'; // 👈 THIS IS CRITICAL. Without it, onClick will not work.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function WaiverFormPage() {
  
  // This function triggers the browser's print dialog
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-black p-8 print:bg-white print:p-0">
      {/* --- TOP CONTROLS (Hidden when printing) --- */}
      <div className="max-w-4xl mx-auto mb-8 flex justify-between items-center print:hidden">
        <Link href="/forms/printable-package">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Return to Printable Forms
          </Button>
        </Link>

        <Button 
          onClick={handlePrint} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Printer className="h-4 w-4" />
          Print Form
        </Button>
      </div>

      {/* --- PRINTABLE CONTENT --- */}
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
            <p className="mb-4">
              This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. 
              The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.
            </p>
            <ul className="space-y-3 list-disc pl-5">
              <li><span className="font-bold">Authorized to disclose:</span> any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions.</li>
              <li><span className="font-bold">Authorized to receive:</span> Connections Care Home Consultants, LLC</li>
              <li><span className="font-bold">Information to be disclosed:</span> All medical records necessary for Community Supports (CS) application.</li>
              <li><span className="font-bold">Purpose:</span> To determine eligibility and arrange services for CS for Assisted Living Transitions.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
              Liability Waiver & Hold Harmless Agreement
            </h2>
            <div className="space-y-2 text-xs">
                <p><strong>Intention.</strong> The purpose of this agreement is to forever release and discharge Connections Care Home Consultants, LLC and its agents from all liability for injury or damages that may arise out of the resident/client's participation in the Community Supports program.</p>
                <p><strong>Assumption of Risk.</strong> Resident assumes all possible risks of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, or damage.</p>
                <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety, understands its content, and signs it of their own free will.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2 border-b pb-1">
              Freedom of Choice Waiver
            </h2>
            <p>I understand I have a choice to receive services in the community. If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting. If I decline, I will not receive the transition support services offered by this program at this time.</p>
            <div className="flex gap-8 mt-4">
                <div className="flex items-center gap-2"><div className="w-4 h-4 border border-slate-600 rounded-sm"></div><span>I choose to accept services.</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 border border-slate-600 rounded-sm"></div><span>I choose to decline services.</span></div>
            </div>
          </section>

          {/* Signature Area */}
          <div className="mt-12 pt-8">
             <div className="grid grid-cols-2 gap-8">
               <div>
                 <div className="border-b border-slate-400 h-8"></div>
                 <p className="text-xs uppercase font-bold text-slate-500 mt-1">Signature</p>
               </div>
               <div>
                 <div className="border-b border-slate-400 h-8"></div>
                 <p className="text-xs uppercase font-bold text-slate-500 mt-1">Date</p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
