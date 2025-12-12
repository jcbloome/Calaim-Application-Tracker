

'use client';

import type { Application } from '@/lib/definitions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parse } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Send, Loader2, ShieldAlert } from 'lucide-react';
import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

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
    if (typeof date === 'string') {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
            try {
                const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
                return format(parsedDate, 'PPP');
            } catch (e) {
                return date;
            }
        }
        try {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) {
                return format(parsedDate, 'PPP');
            }
        } catch (e) {
            // Fallthrough
        }
    }
    if (date && typeof date.toDate === 'function') {
        return format(date.toDate(), 'PPP');
    }
    if (date instanceof Date) {
        return format(date, 'PPP');
    }
    return 'Invalid Date';
};

const CaspioSender = ({ application }: { application: Partial<Application> & { [key: string]: any } }) => {
    const { toast } = useToast();
    const [isSending, setIsSending] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const { user } = useUser();
    const isSuperAdmin = user?.email === 'jason@carehomefinders.com';

    // Uniqueness check is disabled since we no longer have mock data
    const checkUniqueness = async (): Promise<{ isUnique: boolean, reason: string }> => {
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
            const payload = JSON.stringify(application, (key, value) => {
                if (value && typeof value === 'object' && value.toDate instanceof Function) {
                    return value.toDate().toISOString();
                }
                if (value instanceof Date) {
                    return value.toISOString();
                }
                return value;
            });
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Webhook server responded with status ${response.status}: ${errorText}`);
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
                description: err.message || 'Failed to send data to Caspio. See console for details.',
            });
            console.error("Caspio Webhook Error:", err);
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
  const dobFormatted = formatDate(data.memberDob);

  return (
    <ScrollArea className="h-[75vh] pr-6">
        <div className="space-y-8">
            <CaspioSender application={application} />

            <Section title="Member Information">
                <Field label="Member First Name" value={data.memberFirstName} />
                <Field label="Member Last Name" value={data.memberLastName} />
                <Field label="Member Date of Birth" value={dobFormatted} />
                <Field label="Member Age" value={data.memberAge} />
                <Field label="Member Medical Record Number" value={data.memberMrn} />
                <Field label="Member Preferred Language" value={data.memberLanguage} />
                <Field label="Member County" value={data.memberCounty} />
            </Section>

            <Section title="Referrer Information">
                <Field label="Referrer First Name" value={data.referrerFirstName} />
                <Field label="Referrer Last Name" value={data.referrerLastName} />
                <Field label="Referrer Email" value={data.referrerEmail} />
                <Field label="Referrer Phone" value={data.referrerPhone} />
                <Field label="Referrer Relationship to Member" value={data.referrerRelationship} />
                <Field label="Agency" value={data.agency} />
            </Section>
            
            <Section title="Primary Contact">
                <Field label="Primary Contact Type" value={data.bestContactType} />
                <Field label="Primary Contact First Name" value={data.bestContactFirstName} />
                <Field label="Primary Contact Last Name" value={data.bestContactLastName} />
                <Field label="Primary Contact Relationship" value={data.bestContactRelationship} />
                <Field label="Primary Contact Phone" value={data.bestContactPhone} />
                <Field label="Primary Contact Email" value={data.bestContactEmail} />
                <Field label="Primary Contact Language" value={data.bestContactLanguage} />
            </Section>
            
            <Section title="Secondary Contact">
                <Field label="Secondary Contact First Name" value={data.secondaryContactFirstName} />
                <Field label="Secondary Contact Last Name" value={data.secondaryContactLastName} />
                <Field label="Secondary Contact Relationship" value={data.secondaryContactRelationship} />
                <Field label="Secondary Contact Phone" value={data.secondaryContactPhone} />
                <Field label="Secondary Contact Email" value={data.secondaryContactEmail} />
                <Field label="Secondary Contact Language" value={data.secondaryContactLanguage} />
            </Section>

            <Section title="Legal Representative">
                <Field label="Member Has Capacity" value={data.hasCapacity} />
                <Field label="Has Legal Representative" value={data.hasLegalRep} />
                <Field label="Legal Representative Name" value={data.repName} />
                <Field label="Legal Representative Relationship" value={data.repRelationship} />
                <Field label="Legal Representative Phone" value={data.repPhone} />
                <Field label="Legal Representative Email" value={data.repEmail} />
            </Section>

            <Section title="Location Information">
                <Field label="Current Location Type" value={data.currentLocation} />
                <Field label="Current Address" value={`${data.currentAddress || ''}, ${data.currentCity || ''}, ${data.currentState || ''} ${data.currentZip || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '')} />
                <Field label="Current County" value={data.currentCounty} />
                <Field label="Customary Address" value={data.copyAddress ? 'Same as current' : `${data.customaryAddress || ''}, ${data.customaryCity || ''}, ${data.customaryState || ''} ${data.customaryZip || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '')} />
                <Field label="Customary County" value={data.customaryCounty} />
            </Section>

            <Section title="Health Plan & Pathway">
                <Field label="Health Plan" value={data.healthPlan} />
                <Field label="Is Switching Health Plan?" value={data.switchingHealthPlan} />
                <Field label="Pathway" value={data.pathway} />
                <Field label="Meets Pathway Criteria" value={data.meetsPathwayCriteria ? 'Yes' : 'No'} />
                <Field label="SNF Diversion Reason" value={data.snfDiversionReason} />
            </Section>

            <Section title="ISP Contact">
                <Field label="ISP Contact First Name" value={data.ispFirstName} />
                <Field label="ISP Contact Last Name" value={data.ispLastName} />
                <Field label="ISP Contact Relationship" value={data.ispRelationship} />
                <Field label="ISP Contact Facility Name" value={data.ispFacilityName} />
                <Field label="ISP Contact Phone" value={data.ispPhone} />
                <Field label="ISP Contact Email" value={data.ispEmail} />
                <Field label="ISP Address" value={data.ispAddress} />
            </Section>

             <Section title="RCFE & ALW">
                <Field label="Is on ALW Waitlist" value={data.onALWWaitlist} />
                <Field label="Has Preferred RCFE" value={data.hasPrefRCFE} />
                <Field label="RCFE Name" value={data.rcfeName} />
                <Field label="RCFE Address" value={data.rcfeAddress} />
                <Field label="RCFE Administrator Name" value={data.rcfeAdminName} />
                <Field label="RCFE Administrator Phone" value={data.rcfeAdminPhone} />
                <Field label="RCFE Administrator Email" value={data.rcfeAdminEmail} />
            </Section>
        </div>
    </ScrollArea>
  );
}
