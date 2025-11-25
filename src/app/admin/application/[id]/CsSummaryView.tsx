
'use client';

import type { Application } from '@/lib/definitions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Send, Loader2, ShieldAlert } from 'lucide-react';
import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { applications as mockApplications } from '@/lib/data';

const Field = ({ label, value }: { label: string; value: any }) => (
    <div>
        <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
        <p className="text-base font-semibold">{value || <span className="text-gray-400 font-normal">N/A</span>}</p>
    </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2 mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {children}
        </div>
    </div>
);

const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date instanceof Timestamp) {
        return format(date.toDate(), 'PPP');
    }
    if (date instanceof Date) {
        return format(date, 'PPP');
    }
    if (typeof date === 'string') {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
            return format(parsedDate, 'PPP');
        }
    }
    return 'Invalid Date';
};

const CaspioSender = ({ application }: { application: Partial<Application> & { [key: string]: any } }) => {
    const { toast } = useToast();
    const [isSending, setIsSending] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const { user } = useUser();
    const isSuperAdmin = user?.email === 'jason@carehomefinders.com';

    // This is a placeholder for the real logic
    const checkUniqueness = async (): Promise<{ isUnique: boolean, reason: string }> => {
        // In a real app, this would query a 'sentToCaspio' collection or check a flag.
        // For this demo, we'll simulate it by checking against other mock applications.
        // We'll pretend 'app-002' has a Medi-Cal number that was already sent.
        const duplicate = mockApplications.find(app => 
            app.id !== application.id && 
            (app as any).MemberMediCalNumber === application.MemberMediCalNumber &&
            (app as any).caspioSent // a hypothetical flag
        );
        
        if (duplicate) {
            return { isUnique: false, reason: `An application with Medi-Cal # ${application.MemberMediCalNumber} has already been sent to Caspio.` };
        }
        return { isUnique: true, reason: '' };
    };

    const handleSendToCaspio = async (overrideUniquenessCheck = false) => {
        const webhookUrl = 'https://hook.us2.make.com/mqif1rouo1wh762k2eze1y7568gwq6kx';
        
        setIsSending(true);

        if (!overrideUniquenessCheck) {
            const { isUnique, reason } = await checkUniqueness();
            if (!isUnique) {
                toast({
                    variant: 'destructive',
                    title: 'Duplicate Record Found',
                    description: reason + " A super admin can override this check after verifying the record in Caspio.",
                });
                setIsSending(false);
                return;
            }
        }

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(application),
            });

            if (!response.ok) {
                throw new Error(`Webhook server responded with status ${response.status}.`);
            }
            
            // In a real app, you would now update the application doc in Firestore
            // to set a flag like `caspioSent: true`.
            const appIndex = mockApplications.findIndex(a => a.id === application.id);
            if (appIndex !== -1) {
                (mockApplications[appIndex] as any).caspioSent = true;
            }

            toast({
                title: 'Success!',
                description: 'Application data has been sent to Caspio.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Webhook Error',
                description: err.message || 'Failed to send data to Caspio.',
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="p-4 border-2 border-dashed rounded-lg bg-muted/30 space-y-4 mb-6">
            <h3 className="text-base font-semibold">Caspio Integration</h3>
            <div className="flex items-center space-x-2">
                <Checkbox id="verified" checked={isVerified} onCheckedChange={(checked) => setIsVerified(!!checked)} />
                <Label htmlFor="verified" className="font-medium">I have verified this information is correct and ready for submission.</Label>
            </div>
            <div className="flex gap-2">
                 <Button onClick={() => handleSendToCaspio(false)} disabled={isSending || !isVerified}>
                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send to Caspio
                </Button>
                {isSuperAdmin && (
                    <Button onClick={() => handleSendToCaspio(true)} disabled={isSending || !isVerified} variant="secondary">
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                        Reset and Resend
                    </Button>
                )}
            </div>
        </div>
    );
};


export function CsSummaryView({ application }: { application: Partial<Application> & { [key: string]: any } }) {
  if (!application) {
    return <div>Loading application data...</div>;
  }
  
  const data = application;
  const dobFormatted = formatDate(data.MemberDateOfBirth);

  return (
    <ScrollArea className="h-[75vh] pr-6">
        <div className="space-y-8">
            <CaspioSender application={application} />

            <Section title="Member Information">
                <Field label="Member First Name" value={data.MemberFirstName} />
                <Field label="Member Last Name" value={data.MemberLastName} />
                <Field label="Member Date of Birth" value={dobFormatted} />
                <Field label="Member Age" value={data.MemberAge} />
                <Field label="Member Medi-Cal Number" value={data.MemberMediCalNumber} />
                <Field label="Member Medical Record Number" value={data.MemberMedicalRecordNumber} />
                <Field label="Member Preferred Language" value={data.MemberPreferredLanguage} />
                <Field label="Member County" value={data.MemberCounty} />
            </Section>

            <Section title="Referrer Information">
                <Field label="Referrer First Name" value={data.ReferrerFirstName} />
                <Field label="Referrer Last Name" value={data.ReferrerLastName} />
                <Field label="Referrer Email" value={data.ReferrerEmail} />
                <Field label="Referrer Phone" value={data.ReferrerPhone} />
                <Field label="Referrer Relationship to Member" value={data.ReferrerRelationship} />
                <Field label="Agency" value={data.Agency} />
            </Section>
            
            <Section title="Primary Contact">
                <Field label="Primary Contact Type" value={data.PrimaryContactType} />
                <Field label="Primary Contact First Name" value={data.PrimaryContactFirstName} />
                <Field label="Primary Contact Last Name" value={data.PrimaryContactLastName} />
                <Field label="Primary Contact Relationship" value={data.PrimaryContactRelationship} />
                <Field label="Primary Contact Phone" value={data.PrimaryContactPhone} />
                <Field label="Primary Contact Email" value={data.PrimaryContactEmail} />
                <Field label="Primary Contact Language" value={data.PrimaryContactLanguage} />
            </Section>
            
            <Section title="Secondary Contact">
                <Field label="Secondary Contact First Name" value={data.SecondaryContactFirstName} />
                <Field label="Secondary Contact Last Name" value={data.SecondaryContactLastName} />
                <Field label="Secondary Contact Relationship" value={data.SecondaryContactRelationship} />
                <Field label="Secondary Contact Phone" value={data.SecondaryContactPhone} />
                <Field label="Secondary Contact Email" value={data.SecondaryContactEmail} />
                <Field label="Secondary Contact Language" value={data.SecondaryContactLanguage} />
            </Section>

            <Section title="Legal Representative">
                <Field label="Member Has Capacity" value={data.MemberHasCapacity} />
                <Field label="Has Legal Representative" value={data.HasLegalRepresentative} />
                <Field label="Legal Representative Name" value={data.LegalRepresentativeName} />
                <Field label="Legal Representative Relationship" value={data.LegalRepresentativeRelationship} />
                <Field label="Legal Representative Phone" value={data.LegalRepresentativePhone} />
                <Field label="Legal Representative Email" value={data.LegalRepresentativeEmail} />
            </Section>

            <Section title="Location Information">
                <Field label="Current Location Type" value={data.CurrentLocationType} />
                <Field label="Current Address" value={`${data.CurrentAddress || ''}, ${data.CurrentCity || ''}, ${data.CurrentState || ''} ${data.CurrentZipCode || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '')} />
                <Field label="Current County" value={data.CurrentCounty} />
                <Field label="Customary Address" value={data.IsCustomaryAddressSameAsCurrent ? 'Same as current' : `${data.CustomaryAddress || ''}, ${data.CustomaryCity || ''}, ${data.CustomaryState || ''} ${data.CustomaryZipCode || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '')} />
                <Field label="Customary County" value={data.CustomaryCounty} />
            </Section>

            <Section title="Health Plan & Pathway">
                <Field label="Health Plan" value={data.HealthPlan} />
                <Field label="Is Switching Health Plan?" value={data.IsSwitchingHealthPlan} />
                <Field label="Pathway" value={data.Pathway} />
                <Field label="Meets Pathway Criteria" value={data.MeetsPathwayCriteria} />
                <Field label="SNF Diversion Reason" value={data.SNFDiversionReason} />
            </Section>

            <Section title="ISP Contact">
                <Field label="ISP Contact First Name" value={data.ISPContactFirstName} />
                <Field label="ISP Contact Last Name" value={data.ISPContactLastName} />
                <Field label="ISP Contact Relationship" value={data.ISPContactRelationship} />
                <Field label="ISP Contact Facility Name" value={data.ISPContactFacilityName} />
                <Field label="ISP Contact Phone" value={data.ISPContactPhone} />
                <Field label="ISP Contact Email" value={data.ISPContactEmail} />
                <Field label="ISP Address" value={data.ISPAddress} />
                <Field label="ISP County" value={data.ISPCounty} />
            </Section>

             <Section title="RCFE & ALW">
                <Field label="Is on ALW Waitlist" value={data.IsOnALWWaitlist} />
                <Field label="Has Preferred RCFE" value={data.HasPreferredRCFE} />
                <Field label="RCFE Name" value={data.RCFEName} />
                <Field label="RCFE Address" value={data.RCFEAddress} />
                <Field label="RCFE Administrator Name" value={data.RCFEAdministratorName} />
                <Field label="RCFE Administrator Phone" value={data.RCFEAdministratorPhone} />
                <Field label="RCFE Administrator Email" value={data.RCFEAdministratorEmail} />
            </Section>
        </div>
    </ScrollArea>
  );
}
