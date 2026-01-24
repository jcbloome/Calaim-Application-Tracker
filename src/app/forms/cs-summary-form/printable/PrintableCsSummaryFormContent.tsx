
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
    <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-2 mt-4">{children}</h2>
);

const PageFooter = ({ pageNumber, totalPages }: { pageNumber: number, totalPages: number }) => (
  <div className="text-center text-xs text-gray-500 pt-4">
    Page {pageNumber} of {totalPages}
  </div>
);

export function PrintableCsSummaryFormContent() {
  return (
    <form>
        {/* Page 1 */}
        <div className="page-break-after">
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
                    description="This is a 9 character number starting with '9' and ending with a letter."
                    />
                    <Field label="Confirm Medi-Cal Number" />
                    <Field 
                    label="Medical Record Number (MRN)"
                    description="For Health Net use the same Medi-Cal number. For Kaiser this is not the Medi-Cal number but a distinct number oftentimes starting with some zeros."
                    />
                    <Field label="Confirm Medical Record Number (MRN)" />
                    <Field label="Preferred Language" description="e.g., English, Spanish"/>
                    <Field label="Sex" />
                </div>
                </div>

                <div>
                <SectionTitle>Your Information (Person Filling Out Form)</SectionTitle>
                 <p className="text-xs text-gray-600 my-2">This is the person that will receive email updates as to the application status, including any missing documents, etc.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    <Field label="First Name" />
                    <Field label="Last Name" />
                    <Field label="Your Phone" description="(xxx) xxx-xxxx" />
                    <Field label="Your Email" />
                    <Field label="Relationship to Member (e.g., Son, POA, Self, etc.)" />
                    <Field label="Agency (e.g., Bob's Referral Agency, Hospital Name, etc.)" description="If not applicable, leave blank."/>
                </div>
                </div>

                <div>
                <SectionTitle>Primary Contact Person</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="First Name" />
                    <Field label="Last Name" />
                    <Field label="Relationship to Member" />
                    <Field label="Preferred Language" />
                    <Field label="Phone" description="(xxx) xxx-xxxx" />
                    <Field label="Email" description='If no email, enter "N/A".' />
                    </div>
                </div>
                
                <div>
                <SectionTitle>Secondary Contact Person (Optional)</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="First Name" />
                    <Field label="Last Name" />
                    <Field label="Relationship to Member" />
                    <Field label="Preferred Language" />
                    <Field label="Phone" description="(xxx) xxx-xxxx" />
                    <Field label="Email" description='If no email, enter "N/A".'/>
                    </div>
                </div>

                <div>
                <SectionTitle>Legal Representative</SectionTitle>
                    <p className="text-xs text-gray-600 my-2">A legal representative (e.g., with Power of Attorney) might be distinct from a contact person. If the legal representative is also the primary or secondary contact, please enter their information again here to confirm their legal role.</p>
                    <div className="space-y-2 mt-3">
                        <p className="text-xs font-medium text-gray-700">Does member have a legal representative?</p>
                        <div className="flex flex-col space-y-1">
                            <CheckboxField label="N/A, member has capacity and does not need legal representative" />
                            <CheckboxField label="Yes, same as primary contact" />
                            <CheckboxField label="Yes, not same as primary contact (fill out below fields)" />
                            <CheckboxField label="Member does not have capacity and does not have legal representative" />
                        </div>
                    </div>
                    <h3 className="text-sm font-medium text-gray-800 mt-4">Representative's Contact Info</h3>
                    <p className="text-xs text-gray-500 pt-1">If the member does not have a legal representative, you can leave these fields blank.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="First Name" />
                    <Field label="Last Name" />
                    <Field label="Relationship to Member" />
                    <Field label="Phone" description="(xxx) xxx-xxxx" />
                    <Field label="Email" description='If no email, enter "N/A".'/>
                    </div>
                </div>
            </div>
            <PageFooter pageNumber={1} totalPages={3} />
        </div>

      {/* Page 2 */}
       <div className="page-break-after">
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">CS Member Summary</h1>
            </div>
             <div className="space-y-4">
                <div>
                <SectionTitle>Location Information</SectionTitle>
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Member's Current Location</p>
                </div>
                <h3 className="text-sm font-medium text-gray-800 mt-4">Current Address</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="Location Type" description='e.g., Home, Hospital, SNF' />
                    <Field label="Street Address" />
                    <Field label="City" />
                    <Field label="State" />
                    <Field label="ZIP Code" />
                    <Field label="County" />
                    </div>
                <h3 className="text-sm font-medium text-gray-800 mt-4">Customary Residence (where is the member's normal long term address)</h3>
                    <CheckboxField label="Same as current location" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="Location Type" description='e.g., Home, Hospital, SNF' />
                    <Field label="Street Address" />
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
                        <CheckboxField label="N/A" />
                    </div>
                    </div>
                <div className="mt-4 space-y-4 text-xs">
                    <div className="p-4 border rounded-md">
                        <h3 className="text-sm font-medium text-gray-800">SNF Transition Eligibility Requirements</h3>
                        <p className="text-gray-600">Enables a current SNF resident to transfer to a RCFE or ARF.</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
                            <li>Has resided in a SNF for at least 60 consecutive days (which can include a combination of Medicare and Medi-Cal days and back and forth from SNF-hospital-SNF); and</li>
                            <li>Is willing to live in RCFE as an alternative to a SNF; and</li>
                            <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services.</li>
                            <li>Members recently discharged from SNFs, with the 60-day consecutive stay requirement, should also be considered as SNF transition.</li>
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
                <p className="text-xs font-medium text-gray-700 mt-4">Pathway Selection</p>
                    <div className="flex gap-6">
                    <CheckboxField label="SNF Transition" />
                    <CheckboxField label="SNF Diversion" />
                </div>
                </div>
            </div>
            <PageFooter pageNumber={2} totalPages={3} />
      </div>

       {/* Page 3 */}
       <div>
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 tracking-tight">CS Member Summary</h1>
            </div>
             <div className="space-y-4">
                <div>
                <SectionTitle>ISP & Facility Information</SectionTitle>
                    <h3 className="text-sm font-medium text-gray-800 mt-4">Individual Service Plan (ISP) Contact</h3>
                    <p className="text-xs text-gray-600 my-2">An ISP is a comprehensive assessment by the Managed Care Plan's (MCP) clinical team to determine care needs and approve the member for the program. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN. For Health Net, the care level is determined by Connections; for Kaiser, it's determined by Kaiser.
                    <br/><br/>
                    Our MSW/RN needs to know who to contact to discuss the member's care needs, review the Physician's report (602), and other clinical notes. Who is the best person to contact for the ISP? This is not the primary care doctor but could be a SNF social worker, etc.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="First Name" />
                    <Field label="Last Name" />
                    <Field label="Relationship to Member" />
                    <Field label="Phone" description="(xxx) xxx-xxxx"/>
                    <Field label="Email" className="sm:col-span-2" description='If no email, enter "N/A".'/>
                    </div>
                    
                    <h3 className="text-sm font-medium text-gray-800 mt-4">ISP Assessment Location</h3>
                    <p className="text-xs text-gray-600 my-2">The street address for the ISP assessment is only required for Kaiser members (which requires an in-person visit). For Health Net members, please put N/A in the below boxes.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                        <Field label="Type of Location" />
                        <Field label="Facility Name" />
                    </div>
                    <Field label="Street Address" description="Street Address, City, State, ZIP." />
                    
                <h3 className="text-sm font-medium text-gray-800 mt-4">CalAIM vs. Assisted Living Waiver (ALW)</h3>
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
                <p className="text-xs text-gray-500 pt-1">If a facility has not been chosen, you can leave these fields blank.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="Facility Name" />
                    <Field label="Facility Address" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                    <Field label="Administrator Name" />
                    <Field label="Administrator Phone" description="(xxx) xxx-xxxx" />
                    <Field label="Administrator Email" className="sm:col-span-2" description='If no email, enter "N/A".'/>
                </div>
                </div>

                <div>
                    <SectionTitle>Room & Board Payments</SectionTitle>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-2 p-4 border rounded-lg bg-gray-50 text-xs mb-4">
                        <p><strong>Non-Medical Out-of-Home Care (NMOHC)</strong> is a payment supplement that boosts a person’s monthly SSI because they live in a licensed assisted living home (RCFE).</p>
                        <p>In California, if a person lives in an RCFE, the state recognizes higher costs and moves the person from the "Independent Living" rate to the "NMOHC" rate.</p>
                        <p><strong>1. Confirm Financial Eligibility (The "Paper" Test)</strong></p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Income: For 2026, total "countable" monthly income must be less than $1,626.07.</li>
                            <li>Assets: As of January 1, 2026, asset limits are reinstated. An individual must have less than $2,000 in countable resources ($3,000 for a couple).</li>
                            <li>Note: One car and the primary home are usually excluded.</li>
                        </ul>
                        <p><strong>2. Get a Medical Assessment (The "Care" Test)</strong></p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>SSP 22 Form: Authorization for Non-Medical Out-of-Home Care.</li>
                            <li>Physician/Social Worker Signature: Confirms assistance needs or protective supervision.</li>
                        </ul>
                        <p><strong>3. Verification with Social Security (The "Pre-Move" Call)</strong></p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Call SSA at 1-800-772-1213 or visit a local office for a living arrangement interview.</li>
                            <li>Tell them the person plans to move into a licensed RCFE.</li>
                            <li>Ask for the new SSI payment calculation based on the 2026 NMOHC rate.</li>
                            <li>Pro tip: Ask the RCFE for their License Number and a draft Admission Agreement.</li>
                        </ul>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-3 p-4 border rounded-lg bg-gray-50 text-xs">
                        <p>The MCP member is responsible for paying the RCFE the "room and board" portion and the MCP is responsible for paying the RCFE the "assisted living" portion.</p>
                        <p>For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for "room and board" for a private room or to open up RCFEs in more expensive areas.</p>
                        <p>For example, Mr. Johnson is eligible for NMOHC and receives $500/month. The NMOHC will bump up the payment to the RCFE to $1,444.07 for "room and board" and he will retain $182 for personal needs expenses.</p>
                        <p>Members not eligible for the NMOHC will still have a "room and board" obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.</p>
                        <p>Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a "room and board" payment from the member (or their family).</p>
                        <p>Working with CalAIM is at the discretion of the RCFEs. RCFEs, especially in more expensive areas, might not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas. Before accepting CalAIM members, RCFEs will need to know the "room and board" payment.</p>
                    </div>
                    <Field label="Total Monthly Income" />
                    <Field label="Expected \"Room and Board\" Portion (This amount will vary if the member receives the NMOHC payment, see above.)" />
                    <p className="text-xs text-gray-500 pt-1">Please note that proof of income (e.g., Social Security award letter) will need to be submitted later.</p>
                    <CheckboxField label="I have read and understood the financial obligation for Room and Board." />
                </div>
            </div>
             <PageFooter pageNumber={3} totalPages={3} />
       </div>
    </form>
  )
}

    