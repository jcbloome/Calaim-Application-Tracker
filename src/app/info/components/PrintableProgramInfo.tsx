
import React from 'react';
import { acronyms } from '@/lib/data';

const SectionTitle = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <h2 className={`text-2xl font-bold text-gray-800 mt-10 mb-4 ${className}`}>{children}</h2>
);

const SubTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xl font-semibold text-gray-700 mt-6 mb-2">{children}</h3>
);

const Acronym = ({ term, definition }: { term: string, definition: string }) => (
    <div>
        <p><strong className="font-semibold text-gray-700">{term}:</strong> {definition}</p>
    </div>
);

export function PrintableProgramInfo() {
    return (
        <article className="prose prose-lg max-w-none">
             <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Program Information & Acknowledgment</h1>
                <p className="mt-2 text-md text-gray-500">The Connect CalAIM application portal for the California Advancing and Innovating Medi-Cal (CalAIM) Community Support for Assisted Transitions (SNF Diversion/Transition) for Health Net and Kaiser.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-10 p-6 bg-gray-50 rounded-lg not-prose border-2 border-primary">
                {acronyms.map((acronym) => (
                    <Acronym key={acronym.term} term={acronym.term} definition={acronym.definition} />
                ))}
            </div>

            <SectionTitle>What is CalAIM?</SectionTitle>
            <p>California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and creating a more seamless and consistent system. It aims to achieve this through a focus on 'whole person care,' which includes addressing social determinants of health, integrating physical, mental, and social services, and launching new programs like Enhanced Care Management (ECM) and Community Supports (CS). ECM and CS are administered through managed care plans (MCPs).</p>
            
            <SectionTitle>Community Support for Assisted Living Transitions</SectionTitle>
            <p>There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration.</p>
            <p>The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings.</p>
            
            <SectionTitle>The Role of Connections Care Home Consultants</SectionTitle>
            <p>For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your MCP to request authorization for the CS.</p>
            <p>Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.</p>

            <SectionTitle>Types of Assisted Living (RCFEs/ARFs)</SectionTitle>
            <p>Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:</p>
            <ul className="list-disc pl-5 space-y-2">
                <li><strong>Small, Home-Like Settings:</strong> These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.</li>
                <li><strong>Large, Community Settings:</strong> These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support.</li>
            </ul>

            <SectionTitle>Medicare vs. Medi-Cal</SectionTitle>
            <p>Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit.</p>

            <SectionTitle>Managed Care Plans We Work With</SectionTitle>
            <p>Connections currently is only contracted with <strong>Health Net</strong> and <strong>Kaiser</strong> for the CS for Assisted Living Transitions.</p>
            <ul className="list-disc pl-5 space-y-2">
                <li><strong>Health Net:</strong> Serving members in <strong>Sacramento</strong> and <strong>Los Angeles</strong> counties.</li>
                <li><strong>Kaiser Permanente:</strong> Connections is contracted for the CS for Kaiser Permanente through a subcontract with Independent Living Systems (ILS), which manages the program for Kaiser. Kaiser is active in these counties: Alameda, Alpine, Amador, Butte, Calaveras, Colusa, Contra Costa, Del Norte, El Dorado, Fresno, Glenn, Humboldt, Imperial, Inyo, Kern, Kings, Lake, Lassen, Los Angeles, Madera, Marin, Mariposa, Mendocino, Merced, Modoc, Mono, Monterey, Napa, Nevada, Orange, Placer, Plumas, Riverside, Sacramento, San Benito, San Bernardino, San Diego, San Francisco, San Joaquin, San Luis Obispo, San Mateo, Santa Barbara, Santa Clara, Santa Cruz, Shasta, Sierra, Siskiyou, Solano, Sonoma, Stanislaus, Sutter, Tehama, Trinity, Tulare, Tuolumne, Ventura, Yolo, and Yuba.</li>
            </ul>

            <SectionTitle>Switching to Health Net or Kaiser</SectionTitle>
            <p>If you are in another Medi-Cal managed care plan and you would like to work with Connections, you will need to switch.</p>
            <p>You can change your health plan by contacting <a href="https://www.healthcareoptions.dhcs.ca.gov/en/enroll" target="_blank" rel="noopener noreferrer">California Health Care Options</a> at 1-800-430-4263 or visiting their website.</p>
            <p>Generally, changes made by the end of the month are effective on the first day of the following month.</p>

            <SectionTitle>Applying for Health Net (and being assigned to Molina)</SectionTitle>
            <p>When applying for Medi-Cal with Health Net sometimes people are automatically assigned to Molina instead, you will need to call Health Net (800-675-6110) and request to be switched to Health Net.</p>

            <SectionTitle>Expedited Disenrollment from Molina</SectionTitle>
            <p>If you were randomly assigned to Molina and need to switch to Health Net urgently (especially for SNF residents needing CalAIM transition services), here are two escalation options:</p>
            <ul className="list-disc pl-5 space-y-4">
                <li>
                    <strong>1. Call Health Net directly: 1-800-675-6110</strong><br />
                    Contact Health Net Member Services directly to request an expedited transfer from Molina to Health Net.
                </li>
                <li>
                    <strong>2. Contact the Medi-Cal Managed Care <a href="mailto:MMCDOmbudsmanOffice@dhcs.ca.gov">Ombudsman</a></strong><br />
                    If HCO says they cannot speed up the process, the Medi-Cal Managed Care Ombudsman is the "escalation" office. They have the authority to investigate enrollment errors and can sometimes manually override an assignment if it is preventing a member from receiving necessary care or a safe discharge.<br />
                    <strong>Phone:</strong> 1-888-452-8609<br />
                    <strong>Email:</strong> Available via link above<br />
                    <strong>What to say:</strong> "The member was randomly assigned to Molina despite requesting Health Net. This error is preventing access to CalAIM SNF-to-community transition services, effectively keeping the member institutionalized longer than necessary."
                </li>
            </ul>

            <SectionTitle>Share of Cost (SOC)</SectionTitle>
            <p>Members cannot apply for CalAIM with a SOC. It must be eliminated before becoming eligible to apply for CalAIM.</p>
            <p>A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay.</p>
            <p>This happens when your income is above the limit for free Medi-Cal but you still qualify for the program.</p>
            <div style={{ backgroundColor: '#dbeafe', padding: '12px', border: '1px solid #3b82f6', borderRadius: '6px', margin: '12px 0' }}>
              <p><strong>SOC is usually triggered if a member receives more than $1,800/month</strong>, although this number can vary by county and by particular circumstances.</p>
            </div>
            <p>Read more about eliminating share of cost at the <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer">California Advocates for Nursing Home Reform (CANHR)</a>.</p>

            <SubTitle>Eliminating Medi-Cal Share of Cost: The Key to CalAIM</SubTitle>
            <p>
              If you have Medi-Cal with a Share of Cost, you may be missing out on life-changing benefits. Programs like CalAIM
              (which provides care coordination and placement in residential care homes) generally require members to have{' '}
              <strong>Full-Scope, $0 Share of Cost</strong> Medi-Cal.
            </p>
            <p>
              For many seniors and disabled individuals, a monthly income above <strong>$1,856</strong> (the 2026 limit)
              triggers a high Share of Cost. However, California's <strong>250% Working Disabled Program (WDP)</strong> offers
              a legal way to eliminate that cost and keep more of your money.
            </p>

            <SubTitle>How the 250% Working Disabled Program Works</SubTitle>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Higher income allowed:</strong> up to <strong>$3,260</strong> per month with a <strong>$0 monthly premium</strong> and <strong>$0 Share of Cost</strong>.
              </li>
              <li>
                <strong>Broad definition of "work":</strong> no traditional full-time job required. "Working" can include part-time tasks like pet sitting, consulting for a neighbor, or even recycling. No minimum hours required.
              </li>
              <li>
                <strong>Income protection:</strong> most disability-related income (like SSDI or private disability) is not counted toward the limit. Even if SSDI converted to Social Security Retirement, it may still be exempt.
              </li>
              <li>
                <strong>CalAIM ready:</strong> once Share of Cost is $0, you can qualify for CalAIM services, including Enhanced Care Management and Community Supports for care home placement.
              </li>
            </ul>

            <SubTitle>Additional SOC Reduction Strategies (County Eligibility Process)</SubTitle>
            <div className="space-y-4">
              <div>
                <p><strong>1. The "Excess Income" Room and Board Adjustment</strong></p>
                <p>Under California law (and often reflected in RCFE Admission Agreements), there is a distinction between what an SSI recipient pays and what a private-pay or high-income resident pays.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>The SSI Rate Cap:</strong> For residents on SSI, the room and board rate is strictly capped (currently around $1,444.07 for 2026).</li>
                  <li><strong>The Non-SSI Exception:</strong> If a member has income other than SSI, the facility may charge the basic room and board rate plus an additional amount, depending on the admission agreement.</li>
                  <li><strong>The Strategy:</strong> Increasing room and board on the admission agreement to match available income (minus the $182 personal needs allowance) can reduce countable income.</li>
                </ul>
              </div>

              <div>
                <p><strong>2. The "Medical Expense" Spend-Down (Paperwork Fix)</strong></p>
                <p>When board-and-care deduction is not available because CalAIM is paying for care, a spend-down strategy can still reduce SOC by documenting incurred medical or remedial expenses.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Remedial care expenses:</strong> The RCFE amount above standard room and board may be treated as remedial care expense.</li>
                  <li><strong>How to report:</strong> Submit RCFE invoices to County Social Services (DPSS) as incurred medical expenses. Member out-of-pocket payments count toward SOC.</li>
                </ul>
              </div>

              <div>
                <p><strong>3. Purchase Supplemental Insurance (Often the Cleanest Fix)</strong></p>
                <p>Lower gross countable income before county SOC calculation by documenting deductible premiums and insurance deductions.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Dental/Vision/Health premiums:</strong> Monthly premium amounts are deductible by the county.</li>
                  <li><strong>Medicare Part B/D:</strong> Ensure all premiums are being captured by the county eligibility worker.</li>
                </ul>
              </div>
            </div>

            <SubTitle>Summary of Where to Go</SubTitle>
            <p>You must take the following to the <strong>County Social Services Eligibility Worker</strong> (not the health plan):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Revised admission agreement:</strong> showing higher room and board obligation up to available income.</li>
              <li><strong>Medical receipts:</strong> out-of-pocket costs (incontinence supplies, OTC meds, transportation, etc.).</li>
              <li><strong>Insurance proof:</strong> monthly supplemental premium documentation.</li>
            </ul>
            <div style={{ backgroundColor: '#ecfeff', padding: '12px', border: '1px solid #0891b2', borderRadius: '6px', margin: '12px 0' }}>
              <p><strong>Crucial note:</strong> Once county deductions are entered and the case reflects zero SOC, the CalAIM managed care plan typically sees eligibility updates in about 24-48 hours.</p>
            </div>

            <SubTitle>Who to Contact for Help</SubTitle>
            <p>1. <strong>HICAP (Health Insurance Counseling &amp; Advocacy Program)</strong><br />Free, unbiased counseling on Medicare and Medi-Cal. Experts at the Working Disabled Program.<br /><strong>Phone:</strong> <a href="tel:18004340222">1-800-434-0222</a><br /><strong>Website:</strong> <a href="https://aging.ca.gov/hicap" target="_blank" rel="noopener noreferrer">aging.ca.gov/hicap</a></p>
            <p>2. <strong>Health Consumer Alliance (HCA)</strong><br />Free legal assistance for Californians struggling with Medi-Cal eligibility or high Share of Cost.<br /><strong>Phone:</strong> <a href="tel:18888043536">1-888-804-3536</a><br /><strong>Website:</strong> <a href="https://healthconsumer.org" target="_blank" rel="noopener noreferrer">healthconsumer.org</a></p>
            <p>3. <strong>Your Local County Social Services (DPSS)</strong><br />Contact your local county eligibility worker and ask for an <strong>"evaluation for the 250% Working Disabled Program."</strong><br /><strong>Online Portal:</strong> <a href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer">BenefitsCal.com</a></p>

            <SectionTitle>Benefitscal.com</SectionTitle>
            <p>A one stop shop to apply and review Medi-Cal benefits including possible share of cost information and to add for the member an authorized representative/power of attorney.</p>
            <p>Visit <a href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer">www.benefitscal.com</a> for current SOC verification and more information.</p>

            <SectionTitle>Non-Medical Out-of-Home Care (NMOHC) Payment</SectionTitle>
            <p>NMOHC is a payment supplement that boosts a person's monthly SSI check because they live in a licensed assisted living home rather than an apartment or house.</p>
            <p>In California, if a person lives in a Residential Care Facility for the Elderly (RCFE), the state recognizes that costs are much higher than someone living independently. To help cover this, the person moves from the "Independent Living" rate to the "NMOHC" rate.</p>
            <p><strong>1. Confirm Financial Eligibility (The "Paper" Test)</strong></p>
            <p>Since NMOHC is part of the SSI program, you can verify the financial requirements now.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Income: For 2026, total "countable" monthly income must be less than $1,626.07.</li>
              <li>Assets: As of January 1, 2026, asset limits are reinstated. An individual must have less than $2,000 in countable resources ($3,000 for a couple).</li>
              <li>Note: One car and the primary home are usually excluded from this limit.</li>
            </ul>
            <p><strong>2. Verification with Social Security (The "Pre-Move" Call)</strong></p>
            <p>Visit a local Social Security office in person for a living arrangement interview to confirm NMOHC eligibility and the supplement amount.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tell them the person plans to move into a licensed RCFE.</li>
              <li>Ask for the new SSI payment calculation based on the 2026 NMOHC rate.</li>
            </ul>

            <SectionTitle>"Room and Board" and "Assisted Living" Payments</SectionTitle>
            <p>The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is responsible for paying the RCFE the 'assisted living' portion.</p>
            <p>For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for 'room and board' for a private room or to open up RCFEs in more expensive areas.</p>
            <p>Members not eligible for the NMOHC will still have a 'room and board' obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.</p>
            <p>Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family).</p>
            <p>Working with CalAIM is at the discretion of the RCFEs. Many RCFEs, especially in more expensive areas, most likely will not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas.</p>
            <p>The "assisted living" payment paid by the MCP is a fixed rate based on level of care but may not align with market rate in certain counties or for all RCFEs. Supplementing the "room and board" to arrive at market rate is at the discretion of the families.</p>

            <SectionTitle>Individual Service Plan (ISP)</SectionTitle>
            <p>An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the 'assisted living' portion). For Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is determined by Kaiser.</p>

            <SectionTitle>CalAIM Turnaround Time</SectionTitle>
            <SubTitle>For Health Net: 5-7 business days</SubTitle>
            <ol className="list-decimal pl-5 space-y-1">
                <li>We compile all the required documents, have a RN do a virtual ISP visit with appropriate party.</li>
                <li>We determine the tiered rate.</li>
                <li>We recommend RCFEs to the family (in many cases, the family already knows the RCFE they would like for their relative).</li>
                <li>We submit the authorization request and receive the determination (approval or denial) within 5-7 business days.</li>
            </ol>

            <SubTitle>For Kaiser: 4-8 weeks</SubTitle>
            <ol className="list-decimal pl-5 space-y-1">
                <li>Compile required documents &amp; Request Authorization.</li>
                <li>Receive authorization determination.</li>
                <li>If approved, send RN (or MSW with RN sign off) to do in-person visit with ISP tool.</li>
                <li>Send ISP tool to Kaiser for tier level.</li>
                <li>Receive tier level and recommend RCFEs to family.</li>
                <li>Once RCFE is selected sent RCFE to Kaiser for contracting and when RCFE receives Kaiser contract member can move into the RCFE.</li>
            </ol>

            <SectionTitle>Next Steps: The Application</SectionTitle>
            <p>The next section is for filling out the CS Summary Form. This is the core of your application.</p>
            <p>Kaiser turnaround is typically 4-8 weeks.</p>
            <p>Based on the selections you make in the summary form (like the pathway), a personalized list of other required documents will be generated for you to upload.</p>
            
        </article>
    );
}
