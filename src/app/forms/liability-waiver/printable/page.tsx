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


export default function PrintableLiabilityWaiverPage() {

  const handlePrint = () => {
    window.print();
  };
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-8 sm:p-12 shadow-lg rounded-lg print:shadow-none">
          <div className="flex justify-between items-start mb-8 print:hidden">
            <h1 className="text-3xl font-bold text-gray-900">Printable Liability Waiver</h1>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Form
            </Button>
          </div>
          
           <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Participant Liability Waiver & Hold Harmless Agreement</h1>
                <p className="mt-2 text-md text-gray-500 max-w-2xl mx-auto">Please carefully review the following liability waiver and sign below.</p>
            </div>

          <form>
            <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="Member Name" />
                  <Field label="Medi-Cal Number" />
                </div>

                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                    <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not limited to, negligence, fault, or breach of contract.</p>
                    <p><strong>Release and Discharge.</strong> Resident does hereby release and forever discharge the Releasees from all liability, claims, demands, actions, and causes of action of any kind, arising from or related to any loss, damage, or injury, including death, that may be sustained by Resident or any property belonging to Resident, whether caused by the negligence of the Releasees or otherwise, while participating in the Program, or while in, on, or upon the premises where the Program is being conducted, or while in transit to or from the Program.</p>
                    <p><strong>Assumption of Risk.</strong> Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
                    <p><strong>Indemnification.</strong> Resident agrees to indemnify, defend, and hold harmless the Releasees from and against all liability, claims, actions, damages, costs, or expenses of any nature whatsoever for any injury, loss, or damage to persons or property that may arise out of or be related to Resident's participation in the Program. Resident agrees that this indemnification obligation survives the expiration or termination of this Agreement.</p>
                    <p><strong>No Insurance.</strong> Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not limited to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
                    <p><strong>Representations.</strong> Resident represents that they are in good health and in proper physical condition to safely participate in the Program. Resident further represents that they will participate safely and will not commit any act that will endanger their safety or the safety of others.</p>
                    <p><strong>Governing Law.</strong> This Agreement shall be governed by and construed in accordance with the laws of the State of California, without giving effect to any choice or conflict of law provision or rule.</p>
                    <p><strong>Severability.</strong> If any provision of this Agreement is held to be invalid or unenforceable by a court of competent jurisdiction, the remainder of this Agreement shall not be affected and shall remain in full force and effect.</p>
                    <p><strong>Entire Agreement.</strong> This Agreement constitutes the entire agreement between the parties and supersedes all prior or contemporaneous agreements, understandings, and negotiations, both oral and written.</p>
                    <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
                    <p><strong>Electronic Signature.</strong> Each party agrees that the electronic signatures, whether digital or encrypted, of the parties included in this Agreement are intended to authenticate this writing and to have the same force and effect as manual signatures.</p>
                </div>
              
              <div>
                <SectionTitle>Signature</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4">
                    <Field label="Signature (Full Name)" />
                    <Field label="Date" />
                </div>
                <Field label="Relationship to Resident" />
                 <CheckboxField label="I have read, understand, and agree to the terms of this Participant Liability Waiver & Hold Harmless Agreement." />
              </div>

            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
