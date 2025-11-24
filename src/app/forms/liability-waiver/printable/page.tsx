
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

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-2 mt-4">{children}</h2>
);


export default function PrintableLiabilityWaiverPage() {

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
          
           <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Participant Liability Waiver & Hold Harmless Agreement</h1>
                <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">Please carefully review the following liability waiver and sign below.</p>
            </div>

          <form>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  <Field label="Member Name" />
                  <Field 
                    label="Medi-Cal Number (9 characters) or Medical Record Number" 
                    description="Medi-Cal Number for Health Net, Medical Record Number for Kaiser."
                  />
                </div>

                <div className="prose prose-xs max-w-none text-gray-700 space-y-2">
                    <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not limited to, negligence, fault, or breach of contract.</p>
                    <p><strong>Release and Discharge.</strong> Resident does hereby release and forever discharge the Releasees from all liability, claims, demands, actions, and causes of action of any kind, arising from or related to any loss, damage, or injury, including death, that may be sustained by Resident or any property belonging to Resident, whether caused by the negligence of the Releasees or otherwise, while participating in the Program, or while in, on, or upon the premises where the Program is being conducted, or while in transit to or from the Program.</p>
                    <p><strong>Assumption of Risk.</strong> Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
                    <p><strong>Indemnification.</strong> Resident agrees to indemnify, defend, and hold harmless the Releasees from and against all liability, claims, actions, damages, costs, or expenses of any nature whatsoever for any injury, loss, or damage to persons or property that may arise out of or be related to Resident's participation in the Program. Resident agrees that this indemnification obligation survives the expiration or termination of this Agreement.</p>
                    <p><strong>No Insurance.</strong> Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not limited to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
                    <p><strong>Representations.</strong> Resident represents that they are in good health and in proper physical condition to safely participate in the Program. Resident further represents that they will participate safely and will not commit any act that will endanger their safety or the safety of others.</p>
                    <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
                </div>
              
              <div>
                <SectionTitle>Signature</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <Field label="Signature (Full Name)" />
                    <Field label="Date" />
                </div>
                <Field label="Relationship to Resident" />
              </div>

            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
