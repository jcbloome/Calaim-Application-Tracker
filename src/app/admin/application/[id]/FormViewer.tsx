

'use client';

import { PrintableProgramInfo } from '@/app/info/components/PrintableProgramInfo';
import { CsSummaryView } from './CsSummaryView';
import type { Application } from '@/lib/definitions';
import { ScrollArea } from '@/components/ui/scroll-area';

// Since the content components are not exported from their parent pages,
// we will redefine them here for use in the viewer. This is more direct.

const FormHeader = ({ application }: { application: Partial<Application> & { [key: string]: any } }) => (
    <div className="mb-6 space-y-2 p-4 border rounded-lg bg-muted/30 not-prose">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <h3 className="text-sm font-medium text-muted-foreground">Member Name</h3>
                <p className="font-semibold">{application.MemberFirstName} {application.MemberLastName}</p>
            </div>
            <div>
                <h3 className="text-sm font-medium text-muted-foreground">Medical Record Number</h3>
                <p className="font-semibold font-mono text-sm">{application.MemberMedicalRecordNumber}</p>
            </div>
        </div>
    </div>
);


const SignatureSection = ({ application }: { application: Partial<Application> & { [key: string]: any } }) => (
    <div className="mt-8 pt-6 border-t">
        <h3 className="text-base font-semibold text-gray-800">Signature</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4 text-sm">
            <div>
                <p className="text-gray-500">Signed by (Full Name)</p>
                <p className="font-semibold">{application.MemberFirstName} {application.MemberLastName}</p>
            </div>
            <div>
                <p className="text-gray-500">Date Signed</p>
                <p className="font-semibold">{new Date().toLocaleDateString()}</p>
            </div>
             <div>
                <p className="text-gray-500">Relationship to Member</p>
                <p className="font-semibold">Self</p>
            </div>
        </div>
    </div>
);


function PrintableHipaaFormContent({ application }: { application: Partial<Application> & { [key: string]: any } }) {
    return (
        <>
            <FormHeader application={application} />
            <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                <p>This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                <div>
                    <h3 className="font-semibold text-gray-800">Person(s) or organization(s) authorized to make the disclosure:</h3>
                    <p>any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions</p>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">Person(s) or organization(s) authorized to receive the information:</h3>
                    <p>Connections Care Home Consultants, LLC</p>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">Specific information to be disclosed:</h3>
                    <p>All medical records necessary for Community Supports (CS) application.</p>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">The information will be used for the following purpose:</h3>
                    <p>To determine eligibility and arrange services for CS for Assisted Living Transitions.</p>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">This authorization expires:</h3>
                    <p>One year from the date of signature.</p>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">My rights:</h3>
                    <p>I understand that I may refuse to sign this authorization. My healthcare treatment is not dependent on my signing this form. I may revoke this authorization at any time by writing to the disclosing party, but it will not affect any actions taken before the revocation was received. A copy of this authorization is as valid as the original. I understand that information disclosed pursuant to this authorization may be subject to re-disclosure by the recipient and may no longer be protected by federal privacy regulations.</p>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">Redisclosure:</h3>
                    <p>I understand that the person(s) or organization(s) I am authorizing to receive my information may not be required to protect it under federal privacy laws (HIPAA). Therefore, the information may be re-disclosed without my consent.</p>
                </div>
                <SignatureSection application={application} />
            </div>
        </>
    )
}

function PrintableLiabilityWaiverContent({ application }: { application: Partial<Application> & { [key: string]: any } }) {
  return (
      <>
        <FormHeader application={application} />
        <div className="prose prose-xs max-w-none text-gray-700 space-y-2">
            <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not limited to, negligence, fault, or breach of contract.</p>
            <p><strong>Release and Discharge.</strong> Resident does hereby release and forever discharge the Releasees from all liability, claims, demands, actions, and causes of action of any kind, arising from or related to any loss, damage, or injury, including death, that may be sustained by Resident or any property belonging to Resident, whether caused by the negligence of the Releasees or otherwise, while participating in the Program, or while in, on, or upon the premises where the Program is being conducted, or while in transit to or from the Program.</p>
            <p><strong>Assumption of Risk.</strong> Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
            <p><strong>Indemnification.</strong> Resident agrees to indemnify, defend, and hold harmless the Releasees from and against all liability, claims, actions, damages, costs, or expenses of any nature whatsoever for any injury, loss, or damage to persons or property that may arise out of or be related to Resident's participation in the Program. Resident agrees that this indemnification obligation survives the expiration or termination of this Agreement.</p>
            <p><strong>No Insurance.</strong> Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not limited to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
            <p><strong>Representations.</strong> Resident represents that they are in good health and in proper physical condition to safely participate in the Program. Resident further represents that they will participate safely and will not commit any act that will endanger their safety or the safety of others.</p>
            <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
            <SignatureSection application={application} />
        </div>
    </>
  );
}


function PrintableFreedomOfChoiceContent({ application }: { application: Partial<Application> & { [key: string]: any } }) {
  return (
    <>
        <FormHeader application={application} />
        <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
            <p>I understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I can choose to accept or decline these services.</p>
            <p>If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.</p>
            <p>If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.</p>
            <SignatureSection application={application} />
        </div>
    </>
  );
}


export function FormViewer({ formName, application }: { formName: string, application: Partial<Application> & { [key: string]: any } }) {
    const renderContent = () => {
        switch (formName) {
            case 'CS Member Summary':
                return <CsSummaryView application={application} />;
            case 'HIPAA Authorization':
                return <PrintableHipaaFormContent application={application} />;
            case 'Liability Waiver':
                return <PrintableLiabilityWaiverContent application={application} />;
            case 'Freedom of Choice Waiver':
                return <PrintableFreedomOfChoiceContent application={application} />;
            case 'Program Information':
                return <PrintableProgramInfo />;
            default:
                return <div className="text-center p-8">No view available for this form type.</div>;
        }
    };
    
    // The CS Summary View has its own internal ScrollArea, so we don't need a second one here.
    if (formName === 'CS Member Summary') {
        return renderContent();
    }

    return (
        <ScrollArea className="h-[75vh] pr-6">
            {renderContent()}
        </ScrollArea>
    );
}
