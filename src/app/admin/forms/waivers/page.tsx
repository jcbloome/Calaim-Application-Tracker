
'use client';

import React, { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileCheck2, AlertCircle, Lock, ShieldCheck, FileText, HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

function Section({ title, icon: Icon, children }: { title: string, icon: React.ElementType, children: React.ReactNode }) {
  return (
    <div className="space-y-4 pt-6 border-t first:pt-0 first:border-t-0">
        <div className="flex items-center gap-3">
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">{title}</h3>
        </div>
        <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
            {children}
        </div>
    </div>
  );
}

function WaiversFormComponent() {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const applicationId = searchParams.get('applicationId');
    const appUserId = searchParams.get('userId'); // For admins
    const firestore = useFirestore();

    const [signerType, setSignerType] = useState<'member' | 'representative' | null>(null);
    const [signerName, setSignerName] = useState('');
    const [signerRelationship, setSignerRelationship] = useState('');
    const [signatureDate, setSignatureDate] = useState('');

    const [ackHipaa, setAckHipaa] = useState(false);
    const [ackLiability, setAckLiability] = useState(false);
    const [ackFoc, setAckFoc] = useState(false);
    const [focChoice, setFocChoice] = useState<'accept' | 'decline' | ''>('');

    const applicationDocRef = useMemo(() => {
        if (appUserId && firestore && applicationId) {
            return doc(firestore, `users/${appUserId}/applications`, applicationId);
        }
        return null;
    }, [appUserId, firestore, applicationId]);

    const { data: application, isLoading: isLoadingApplication } = useDoc<Application>(applicationDocRef);
    const isReadOnly = application?.status === 'Completed & Submitted' || application?.status === 'Approved';
    const backLink = `/admin/applications/${applicationId}?userId=${appUserId}`;

    useEffect(() => {
        if (application) {
            const form = application.forms?.find(f => f.name === 'Waivers & Authorizations');
            if (form?.status === 'Completed') {
                setSignerType(form.signerType || null);
                setSignerName(form.signerName || '');
                setSignerRelationship(form.signerRelationship || '');
                setFocChoice(form.choice || '');
                setAckHipaa(true);
                setAckLiability(true);
                setAckFoc(true);
                setSignatureDate(form.dateCompleted ? new Date(form.dateCompleted.seconds * 1000).toLocaleDateString() : new Date().toLocaleDateString());
            } else {
                 setSignatureDate(new Date().toLocaleDateString());
            }
        } else {
            setSignatureDate(new Date().toLocaleDateString());
        }
    }, [application]);

    const isFormComplete = () => {
        if (!signerType || !signerName || !focChoice || !ackHipaa || !ackLiability || !ackFoc) return false;
        if (signerType === 'representative' && !signerRelationship) return false;
        return true;
    };

    const handleSubmit = async () => {
        // This function is for user-facing form, admins will not submit.
        // We can leave this logic as it won't be triggered in the admin view.
    };
    
    if (isLoadingApplication) {
        return (
             <div className="flex-grow flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading Application Data...</p>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto">
             <div className="mb-6">
                 <Button variant="outline" asChild>
                    <Link href={backLink}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Application Details
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Waivers & Authorizations</CardTitle>
                    <CardDescription>Viewing authorizations for {application?.memberFirstName} {application?.memberLastName}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Member Name</h3>
                                <p className="font-semibold">{application?.memberFirstName} {application?.memberLastName}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Medical Record Number</h3>
                                <p className="font-semibold font-mono text-sm">{application?.memberMrn}</p>
                            </div>
                        </div>
                    </div>
                    
                    <Section title="HIPAA Authorization" icon={ShieldCheck}>
                        <p>This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
                        <p><strong>Authorized to disclose:</strong> Any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions.</p>
                        <p><strong>Authorized to receive:</strong> Connections Care Home Consultants, LLC.</p>
                        
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

                        <p><strong>Expiration:</strong> This authorization expires one year from the date of signature.</p>
                        <p><strong>My Rights:</strong> Under my rights member must sign document to move forward with the CS but can revoke this authorization at any time.</p>
                        <Alert variant="warning" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Acknowledgment</AlertTitle>
                            <AlertDescription>
                                <div className="flex items-start space-x-2 mt-2">
                                    <Checkbox id="ack-hipaa" checked={ackHipaa} disabled />
                                    <label htmlFor="ack-hipaa" className="text-sm font-medium leading-none">
                                        I have read and understood the HIPAA Authorization section.
                                    </label>
                                </div>
                            </AlertDescription>
                        </Alert>
                    </Section>

                    <Section title="Liability Waiver & Hold Harmless Agreement" icon={FileText}>
                        <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not to, negligence, fault, or breach of contract.</p>
                        <p><strong>Assumption of Risk.</strong> Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
                        <p><strong>No Insurance.</strong> Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
                        <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
                         <Alert variant="warning" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Acknowledgment</AlertTitle>
                            <AlertDescription>
                                <div className="flex items-start space-x-2 mt-2">
                                    <Checkbox id="ack-liability" checked={ackLiability} disabled />
                                    <label htmlFor="ack-liability" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                       I have read and understood the Liability Waiver section.
                                    </label>
                                </div>
                            </AlertDescription>
                        </Alert>
                    </Section>

                    <Section title="Freedom of Choice Waiver" icon={HeartHandshake}>
                        <p>I understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I can choose to accept or decline these services.</p>
                        <p>If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.</p>
                        <p>If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.</p>
                        <div className="p-4 border rounded-md space-y-3 mt-4 bg-background">
                            <h3 className="font-medium text-base text-amber-700">My Choice</h3>
                             <RadioGroup value={focChoice} disabled>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="accept" id="accept" />
                                    <Label htmlFor="accept">I choose to accept Community Supports services.</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="decline" id="decline" />
                                    <Label htmlFor="decline">I choose to decline Community Supports services.</Label>
                                </div>
                            </RadioGroup>
                        </div>
                        <Alert variant="warning" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Acknowledgment</AlertTitle>
                            <AlertDescription>
                                <div className="flex items-start space-x-2 mt-2">
                                    <Checkbox id="ack-foc" checked={ackFoc} disabled />
                                    <label htmlFor="ack-foc" className="text-sm font-medium leading-none">
                                       I have read and understood the Freedom of Choice Waiver section.
                                    </label>
                                </div>
                            </AlertDescription>
                        </Alert>
                    </Section>

                    
                    <div className="mt-8 pt-6 border-t">
                        <h3 className="text-base font-semibold text-gray-800">Electronic Signature</h3>
                        <div className="space-y-4 mt-4">
                            <RadioGroup value={signerType ?? ''} disabled>
                                <Label>Signed By:</Label>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="member" id="signer-member" />
                                        <Label htmlFor="signer-member">Member</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="representative" id="signer-rep" />
                                        <Label htmlFor="signer-rep">Authorized Representative</Label>
                                    </div>
                                </div>
                            </RadioGroup>
                            
                            <div className="space-y-2">
                                <Label htmlFor="signer-relationship">If authorized representative, what is relationship to member (if not A/R please put N/A)?</Label>
                                <Input id="signer-relationship" value={signerRelationship} disabled />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="signer-name">Signature</Label>
                                <Input id="signer-name" value={signerName} disabled />
                            </div>
                             <div>
                                <Label>Date Signed</Label>
                                <Input value={signatureDate} readOnly disabled />
                            </div>
                        </div>
                    </div>

                     {application?.status === 'Requires Revision' && (
                         <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
                            <FileCheck2 className="mr-2 h-4 w-4" /> Re-submit Waiver
                        </Button>
                     )}
                </CardContent>
            </Card>
        </div>
    );
}


export default function AdminWaiversPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
            <WaiversFormComponent />
        </Suspense>
    );
}

    