
'use client';

import React from 'react';

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
    <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-3 mt-6">{children}</h2>
);

export function PrintableWaiversContent() {
    return (
        <form>
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Waivers & Authorizations</h1>
                <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">This document contains the HIPAA Authorization, Liability Waiver, and Freedom of Choice acknowledgments.</p>
            </div>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  <Field label="Member Name" />
                  <Field 
                    label="Medical Record Number (MRN)" 
                    description="For Health Net use the Medi-Cal number (starts with 9). For Kaiser use their specific MRN."
                  />
                </div>

                {/* HIPAA Section */}
                <div>
                    <SectionTitle>HIPAA Authorization</SectionTitle>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                        <p>This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                        <p><strong>Authorized to disclose:</strong> any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions</p>
                        <p><strong>Authorized to receive:</strong> Connections Care Home Consultants, LLC</p>
                        <p><strong>Information to be disclosed:</strong> All medical records necessary for Community Supports (CS) application.</p>
                        <p><strong>Purpose:</strong> To determine eligibility and arrange services for CS for Assisted Living Transitions.</p>
                        <p><strong>Expiration:</strong> One year from the date of signature.</p>
                        <p><strong>My Rights:</strong> Under my rights member (or POA) must sign document to move forward with the CS but can revoke this authorization at any time.</p>
                    </div>
                    <CheckboxField label="I have read and understood the HIPAA Authorization section." />
                </div>

                {/* Liability Waiver Section */}
                <div>
                    <SectionTitle>Liability Waiver & Hold Harmless Agreement</SectionTitle>
                     <div className="prose prose-xs max-w-none text-gray-700 space-y-2">
                        <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident (or POA) understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not to, negligence, fault, or breach of contract.</p>
                        <p><strong>Assumption of Risk.</strong> Resident (or POA) understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident (or POA) assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
                        <p><strong>No Insurance.</strong> Resident (or POA) understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not to medical, health, or disability insurance, in the event of injury or illness. Resident (or POA) understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
                        <p><strong>Acknowledgment.</strong> Resident (or POA) acknowledges that they have read this Agreement in its entirety and understands its content. Resident (or POA) is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
                    </div>
                    <CheckboxField label="I have read and understood the Liability Waiver section." />
                </div>

                {/* Freedom of Choice Section */}
                <div>
                    <SectionTitle>Freedom of Choice Waiver</SectionTitle>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                        <p>I (or my POA) understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I (or my POA) can choose to accept or decline these services.</p>
                        <p>If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.</p>
                        <p>If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.</p>
                    </div>
                     <CheckboxField label="I have read and understood the Freedom of Choice Waiver section." />
                    <h3 className="text-sm font-medium text-gray-800 mt-4">My Choice</h3>
                    <CheckboxField label="I choose to accept Community Supports services for community transition." />
                    <CheckboxField label="I choose to decline Community Supports services for community transition." />
                </div>
              
              <div>
                <SectionTitle>Signature for All Sections</SectionTitle>
                <p className="text-xs italic text-gray-600 my-2">By signing below, I acknowledge that under penalty of perjury, I am the member or an authorized representative (POA) legally empowered to sign on behalf of the member, and that I agree to all sections above.</p>
                <p className="text-xs font-medium text-gray-700 mt-2">I am the:</p>
                <div className="flex gap-6">
                    <CheckboxField label="Member" />
                    <CheckboxField label="Authorized Representative (POA)" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <Field label="Signature (Full Name)" />
                    <Field label="Date" />
                </div>
                <Field label="If authorized representative, what is relationship to member (if not A/R please put N/A)?" />
              </div>

            </div>
          </form>
    )
}
