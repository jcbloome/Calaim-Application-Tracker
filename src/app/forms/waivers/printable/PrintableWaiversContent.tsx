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
                        
                        <p><strong>Expiration:</strong> One year from the date of signature.</p>
                        <p><strong>My Rights:</strong> Under my rights member (or POA) must sign document to move forward with the CS but can revoke this authorization at any time.</p>
                    </div>
                    <CheckboxField label="I have read and understood the HIPAA Authorization section." />
                </div>

                {/* Liability Waiver Section */}
                <div>
                    <SectionTitle>Member/POA Waiver and Release of Liability</SectionTitle>
                     <div className="prose prose-xs max-w-none text-gray-700 space-y-2">
                        <p><strong>1. Acknowledgment of Independent Entities</strong> The undersigned (Member or Power of Attorney/Legal Authorized Representative) acknowledges that Connections Care Home Consultants LLC ("CONNECTIONS") is a referral and administrative consultant. I understand that the Residential Care Facilities for the Elderly (RCFE) or Adult Residential Facilities (ARF) referred by CONNECTIONS are independent businesses. They are not owned, operated, managed, or supervised by CONNECTIONS.</p>
                        <p><strong>2. Assumption of Risk</strong> I understand that placement in a care facility involves inherent risks, including but not limited to medical emergencies, physical injuries, falls, or complications from care. I voluntarily assume all risks associated with the Member’s residency and care at any facility selected, whether or not referred by CONNECTIONS.</p>
                        <p><strong>3. Release and Waiver of Liability</strong> To the maximum extent permitted by law, I, on behalf of myself, the Member, and our heirs or estate, hereby release, forever discharge, and hold harmless Connections Care Home Consultants LLC, its officers, employees, and agents from any and all liability, claims, and demands of whatever kind or nature, either in law or in equity, which arise or may hereafter arise from the Member’s placement at a facility. This includes, but is not limited to, liability for: Physical Injury or Death, Clinical Care, Safety Issues, or Infections/Illness.</p>
                        <p><strong>4. Covenant Not to Sue</strong> I agree that I will not initiate any legal action, lawsuit, or administrative claim against CONNECTIONS for damages, injuries, or losses caused by the acts, omissions, or conditions of a third-party care facility. I acknowledge that my sole legal recourse for matters involving the quality of care or physical safety resides against the facility providing the direct care.</p>
                        <p><strong>5. RN Assessment (ISP) Disclosure</strong> I understand that while a CONNECTIONS RN may perform an Individual Service Plan (ISP) for the purpose of CalAIM tier-level determination, this assessment does not constitute the "management of care." The facility is solely responsible for creating its own care plan and ensuring the Member’s daily needs and safety are met.</p>
                    </div>
                    <CheckboxField label="I have read and understood the Waiver and Release of Liability section." />
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
