
'use client';

import React, { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileCheck2, AlertCircle, Lock, ShieldCheck, FileText, HeartHandshake, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
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
    const { user } = useUser();
    const firestore = useFirestore();

    const [signerType, setSignerType] = useState<'member' | 'representative' | null>(null);
    const [signerName, setSignerName] = useState('');
    const [signerRelationship, setSignerRelationship] = useState('');
    const [signatureDate, setSignatureDate] = useState('');

    const [ackHipaa, setAckHipaa] = useState(false);
    const [ackLiability, setAckLiability] = useState(false);
    const [ackFoc, setAckFoc] = useState(false);
    const [ackRoomAndBoard, setAckRoomAndBoard] = useState(false);
    const [focChoice, setFocChoice] = useState<'accept' | 'decline' | undefined>(undefined);


    const applicationDocRef = useMemo(() => {
        if (user && firestore && applicationId) {
            return doc(firestore, `users/${user.uid}/applications`, applicationId);
        }
        return null;
    }, [user, firestore, applicationId]);

    const { data: application, isLoading: isLoadingApplication } = useDoc<Application>(applicationDocRef);
    const isReadOnly = application?.status === 'Completed & Submitted' || application?.status === 'Approved';

    useEffect(() => {
        if (application) {
            const form = application.forms?.find(f => f.name === 'Waivers & Authorizations');
            if (form?.status === 'Completed') {
                setSignerType(form.signerType || null);
                setSignerName(form.signerName || '');
                setSignerRelationship(form.signerRelationship || '');
                setFocChoice(form.choice || undefined);
                setAckHipaa(form.ackHipaa || false);
                setAckLiability(form.ackLiability || false);
                setAckFoc(form.ackFoc || false);
                setAckRoomAndBoard(form.ackRoomAndBoard || false);
                setSignatureDate(form.dateCompleted ? new Date(form.dateCompleted.seconds * 1000).toLocaleDateString() : new Date().toLocaleDateString());
            } else {
                 setSignatureDate(new Date().toLocaleDateString());
            }
        } else {
            setSignatureDate(new Date().toLocaleDateString());
        }
    }, [application]);

    const isFormComplete = () => {
        if (!signerType || !signerName.trim() || !signerRelationship.trim() || !focChoice || !ackHipaa || !ackLiability || !ackFoc || !ackRoomAndBoard) return false;
        return true;
    };

    const handleSubmit = async () => {
        if (!isFormComplete()) {
            toast({
                variant: 'destructive',
                title: 'Incomplete Form',
                description: 'Please complete all acknowledgments, choices, and signature fields to continue.',
            });
            return;
        }

        if (!applicationId || !applicationDocRef) {
            toast({ variant: 'destructive', title: 'Error', description: 'Application ID is missing.' });
            return;
        }

        setIsLoading(true);

        const existingForms = application?.forms || [];
        const formIndex = existingForms.findIndex(form => form.name === 'Waivers & Authorizations');
        
        const newFormData: Partial<FormStatus> = {
            status: 'Completed',
            choice: focChoice,
            signerType,
            signerName,
            signerRelationship: signerRelationship,
            ackHipaa: ackHipaa,
            ackLiability: ackLiability,
            ackFoc: ackFoc,
            ackRoomAndBoard: ackRoomAndBoard,
            dateCompleted: Timestamp.now(),
        };

        let updatedForms: FormStatus[];

        if (formIndex > -1) {
            updatedForms = [
                ...existingForms.slice(0, formIndex),
                { ...existingForms[formIndex], ...newFormData } as FormStatus,
                ...existingForms.slice(formIndex + 1),
            ];
        } else {
            updatedForms = [
                ...existingForms,
                { name: 'Waivers & Authorizations', type: 'online-form', href: '/forms/waivers', ...newFormData } as FormStatus
            ];
        }

        try {
            await setDoc(applicationDocRef, { forms: updatedForms, lastUpdated: Timestamp.now() }, { merge: true });
            toast({ title: 'Waivers Completed', description: 'Your authorizations have been recorded.', className: 'bg-green-100 text-green-900 border-green-200' });
            router.push(`/pathway?applicationId=${applicationId}`);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Error', description: error.message || 'Could not save your authorizations.' });
        } finally {
            setIsLoading(false);
        }
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
        <>
            <Header />
            <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
                <div className="max-w-3xl mx-auto">
                     <div className="mb-6">
                         <Button variant="outline" asChild>
                            <Link href={`/pathway?applicationId=${applicationId}`}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Pathway
                            </Link>
                        </Button>
                    </div>

                     {isReadOnly && (
                        <Alert variant="default" className="mb-6 bg-blue-50 border-blue-200 text-blue-800">
                            <Lock className="h-4 w-4 !text-blue-800" />
                            <AlertTitle>Form Locked</AlertTitle>
                            <AlertDescription>
                                This form is part of a submitted application and is now read-only.
                            </AlertDescription>
                        </Alert>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">Waivers & Authorizations</CardTitle>
                            <CardDescription>Please review and acknowledge the following sections.</CardDescription>
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
                                            <Checkbox id="ack-hipaa" checked={ackHipaa} onCheckedChange={(c) => setAckHipaa(!!c)} disabled={isReadOnly} />
                                            <label htmlFor="ack-hipaa" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
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
                                            <Checkbox id="ack-liability" checked={ackLiability} onCheckedChange={(c) => setAckLiability(!!c)} disabled={isReadOnly} />
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
                                    <h3 className="font-medium text-base">My Choice <span className="text-destructive">*</span></h3>
                                     <RadioGroup onValueChange={(value) => setFocChoice(value as 'accept' | 'decline')} value={focChoice} disabled={isReadOnly}>
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
                                            <Checkbox id="ack-foc" checked={ackFoc} onCheckedChange={(c) => setAckFoc(!!c)} disabled={isReadOnly} />
                                            <label htmlFor="ack-foc" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                               I have read and understood the Freedom of Choice Waiver section.
                                            </label>
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            </Section>

                            <Section title="Room & Board Obligation" icon={Home}>
                                <div className="prose prose-sm max-w-none text-gray-700 space-y-3 p-4 border rounded-lg bg-muted/30">
                                    <p>The MCP member is responsible for paying the RCFE the “room and board” and the MCP is responsible for paying the RCFE the “assisted living” portion.</p>
                                    <p>For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for “room and board”. Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for "room and board" for a private room or to open up RCFEs in more expensive areas.</p>
                                    <p>For example, Mr. Johnson is eligible for NMOHC and receives $500/month. The NMOHC will bump up the payment to the RCFE to $1,444.07 for “room and board” and he will retain $182 for personal needs expenses.</p>
                                    <p>Members not eligible for the NMOHC will still have a “room and board” obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.</p>
                                    <p>Members who cannot pay any “room and board” portion or who do not have families who could pay this portion are not eligible for the CS since program requirements mandate a "room and board” payment from the member (or their family).</p>
                                </div>
                                <Alert variant="warning" className="mt-4">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Acknowledgment of Financial Responsibility</AlertTitle>
                                    <AlertDescription>
                                        <div className="flex items-start space-x-2 mt-2">
                                            <Checkbox id="ack-room-and-board" checked={ackRoomAndBoard} onCheckedChange={(c) => setAckRoomAndBoard(!!c)} disabled={isReadOnly} />
                                            <label htmlFor="ack-room-and-board" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                               I have read and understood that the member is required to pay a "Room and Board" portion to the care facility. This was explained in the application form.
                                            </label>
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            </Section>
                            
                            <div className="mt-8 pt-6 border-t">
                                <h3 className="text-base font-semibold text-gray-800">Electronic Signature</h3>
                                <div className="space-y-4 mt-4">
                                    <RadioGroup onValueChange={(v) => setSignerType(v as any)} value={signerType ?? ''} disabled={isReadOnly}>
                                        <Label>I am the: <span className="text-destructive">*</span></Label>
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
                                        <Label htmlFor="signer-relationship">If authorized representative, what is relationship to member (if not A/R please put N/A)? <span className="text-destructive">*</span></Label>
                                        <Input id="signer-relationship" value={signerRelationship} onChange={e => setSignerRelationship(e.target.value)} placeholder="e.g., Son, Daughter, Conservator, or N/A" disabled={isReadOnly} required />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="signer-name">Type Full Name to Sign <span className="text-destructive">*</span></Label>
                                        <Input id="signer-name" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Your full legal name" disabled={isReadOnly} required />
                                    </div>
                                     <div>
                                        <Label>Date Signed</Label>
                                        <Input value={signatureDate} readOnly disabled className="bg-muted" />
                                    </div>
                                </div>
                            </div>

                             {!isReadOnly && (
                                <>
                                <div className="p-4 border-t mt-6 space-y-4">
                                    <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Legal Attestation</AlertTitle>
                                        <AlertDescription>
                                            By clicking the button below, I acknowledge that under penalty of perjury, I am the member or an authorized representative legally empowered to sign on behalf of the member.
                                        </AlertDescription>
                                    </Alert>
                                </div>

                                <Button onClick={handleSubmit} disabled={isLoading || !isFormComplete()} className="w-full">
                                    {isLoading ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                                    ) : (
                                        <><FileCheck2 className="mr-2 h-4 w-4" /> Acknowledge and Complete All Waivers</>
                                    )}
                                </Button>
                                </>
                             )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}


export default function WaiversPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col min-h-screen">
                <Header />
                <div className="flex-grow flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-4">Loading...</p>
                </div>
            </div>
        }>
            <WaiversFormComponent />
        </Suspense>
    );
}

    