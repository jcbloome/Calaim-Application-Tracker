
import React from 'react';

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
                <p className="mt-2 text-md text-gray-500">The Connections Care Home Consultants application portal for the California Advancing and Innovating Medi-Cal (CalAIM) Community Support for Assisted Transitions (SNF Diversion/Transition) for Health Net and Kaiser.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-10 p-6 bg-gray-50 rounded-lg not-prose">
                <Acronym term="MCP" definition="Managed Care Plan" />
                <Acronym term="RCFE" definition="Residential Care Facility for the Elderly" />
                <Acronym term="ARF" definition="Adult Residential Facility" />
                <Acronym term="CalAIM" definition="California Advancing and Innovating Medi-Cal" />
                <Acronym term="SNF" definition="Skilled Nursing Facility" />
                <Acronym term="ISP" definition="Individual Service Plan" />
                <Acronym term="CS" definition="Community Supports" />
                <Acronym term="SOC" definition="Share of Cost" />
            </div>

            <SectionTitle>What is CalAIM?</SectionTitle>
            <p>California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and creating a more seamless and consistent system. It aims to achieve this through a focus on "whole person care," which includes addressing social determinants of health, integrating physical, mental, and social services, and launching new programs like Enhanced Care Management (ECM) and Community Supports. CS and ECM are administered through managed care plans (MCPs).</p>
            
            <SectionTitle>Community Support for Assisted Living Transitions</SectionTitle>
            <p>There are 14 Community Supports (CS), and this application portal is for one of them, called Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted living setting—such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential Facility (ARF)—as a safe alternative to a skilled nursing facility (SNF), promoting greater independence and community integration. The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing in SNFs) eligible to reside in assisted living settings.</p>
            
            <SectionTitle>The Role of Connections Care Home Consultants</SectionTitle>
            <p>For 35 years Connections has helped private paid families find care homes. We are excited to now be partnered with MCPs as a CS Provider that assists with understanding the program, finding participating facilities, coordinating paperwork and assessments, and liaising with your Managed Care Plan to request authorization for the CS. Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.</p>

            <SectionTitle>Managed Care Plans We Work With</SectionTitle>
            <ul className="list-disc pl-5">
                <li><strong>Health Net:</strong> Serving members in Sacramento and Los Ángeles counties.</li>
                <li><strong>Kaiser Permanente:</strong> Serving members in various counties throughout California.</li>
            </ul>
            <p>You must be a member of one of these plans to utilize us for the CS for Assisted Transitions.</p>
            
            <SectionTitle>Types of Assisted Living (RCFEs/ARFs)</SectionTitle>
             <p>Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different environment. Connections can help you find a setting that best suits your needs:</p>
            <ul className="list-disc pl-5">
                <li><strong>Small, Home-Like Settings:</strong> These are typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers more personalized attention and a quieter, more intimate living experience.</li>
                <li><strong>Large, Community Settings:</strong> These are often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of planned activities, and social opportunities. Staff is available as needed to provide care and support.</li>
            </ul>

            <SectionTitle>ARF vs. RCFE: What's the Difference?</SectionTitle>
            <p>In California, the key difference between an Adult Residential Facility (ARF) and a Residential Care Facility for the Elderly (RCFE) is the age of the residents they serve. ARFs provide non-medical care and supervision to adults aged 18 to 59, often with disabilities or other conditions. RCFEs, on the other hand, are specifically for individuals 60 years and older who need assistance with daily living activities.</p>
        </article>
    );
}
