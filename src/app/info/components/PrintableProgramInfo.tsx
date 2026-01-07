
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
            <p>California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and creating a more seamless and consistent system. It aims to achieve this through a focus on "whole person care," which includes addressing social determinants of health, integrating physical, mental, and social services, and launching new programs like Enhanced Care Management (ECM) and Community Supports. CS and ECM are administered through managed care plans (MCPs).</p>
            
            <SectionTitle>Community Support for Assisted Living Transitions</SectionTitle>
            <p>There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration. The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings.</p>
            
            <SectionTitle>The Role of Connections Care Home Consultants</SectionTitle>
            <p>For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS. Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.</p>

            <SectionTitle>Types of Assisted Living (RCFEs/ARFs)</SectionTitle>
             <p>Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:</p>
            <ul className="list-disc pl-5 space-y-2">
                <li><strong>Small, Home-Like Settings:</strong> These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.</li>
                <li><strong>Large, Community Settings:</strong> These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support.</li>
            </ul>

            <SectionTitle>Medicare vs. Medi-Cal</SectionTitle>
            <p>Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit. While they are different, Medicare-covered days in a facility can count toward the 60-day stay requirement for the SNF Transition pathway.</p>

            <SectionTitle>Managed Care Plans We Work With</SectionTitle>
            <p>You must be a member of one of these plans to utilize us for the CS for Assisted Transitions.</p>
            <ul className="list-disc pl-5">
                <li><strong>Health Net:</strong> Serving members in Sacramento and Los Ángeles counties.</li>
                <li><strong>Kaiser Permanente:</strong> Serving members in various counties throughout California.</li>
            </ul>
            
            <SectionTitle>Switching to Health Net or Kaiser</SectionTitle>
            <p>If you are in another Medi-Cal managed care plan and you would like to work with Connections, you will need to switch.</p>
            <p>You can change your health plan by contacting <a href="https://www.healthcareoptions.dhcs.ca.gov/en/enroll" target="_blank" rel="noopener noreferrer">California Health Care Options</a> at 1-800-430-4263 or visiting their website: https://www.healthcareoptions.dhcs.ca.gov/en/enroll. Generally, changes made by the end of the month are effective on the first day of the following month.</p>
            
            <SectionTitle>Applying for Health Net (and being assigned to Molina)</SectionTitle>
            <p>When applying for Medi-Cal with Health Net sometimes people are automatically assigned to Molina instead, you will need to call Health Net (800-675-6110) and request to be switched to Health Net.</p>
            
            <SectionTitle>Share of Cost (SOC)</SectionTitle>
            <p>A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It's the amount of money you may have to pay each month towards medical-related services or supplies before your Medi-Cal coverage begins to pay. This happens when your income is above the limit for free Medi-Cal but you still qualify for the program.</p>
            <p>Members participating in the CalAIM Community Supports program are not permitted to have a SOC. It must be eliminated before the application can be approved. A common way to do this is by purchasing supplemental health, dental, or vision insurance, which can lower your 'countable' income and remove the SOC.</p>
            <p>Read more about eliminating share of cost at the California Advocates for Nursing Home Reform (CANHR): <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer">https://canhr.org/understanding-the-share-of-cost-for-medi-cal/</a>.</p>
            
            <SectionTitle>Room &amp; Board Payments</SectionTitle>
            <p>The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is responsible for paying the RCFE the 'assisted living' portion. Also, many RCFEs might choose not to work with CalAIM.</p>
            <p>For members eligible for the Non-Medical Out-of-Home Care (NMOHC) payment, their SSI/SSP benefit is used to cover the cost of 'room and board' at the facility. From this benefit, the member retains a portion for personal needs, and the remaining balance is paid directly to the RCFE. Members with higher incomes may be required to contribute more, which can also provide access to private rooms or facilities in more expensive areas.</p>
            <p>Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family).</p>
            
            <SectionTitle>What is an Individual Service Plan (ISP)?</SectionTitle>
            <p>An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the 'assisted living' portion). For Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is determined by Kaiser.</p>
            
        </article>
    );
}
