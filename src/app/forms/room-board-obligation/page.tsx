'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, AlertCircle, FileCheck2, Loader2, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';

function RoomBoardObligationContent() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId');
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [ackRoomAndBoard, setAckRoomAndBoard] = useState(false);
  const [ackNmoHC, setAckNmoHC] = useState(false);
  const [signerType, setSignerType] = useState<'member' | 'representative' | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerRelationship, setSignerRelationship] = useState('');
  const [signatureDate, setSignatureDate] = useState('');

  const applicationDocRef = useMemoFirebase(() => {
    if (isUserLoading || !user || !firestore || !applicationId) return null;
    return doc(firestore, `users/${user.uid}/applications`, applicationId);
  }, [user, firestore, applicationId, isUserLoading]);

  const { data: application, isLoading: isLoadingApplication } = useDoc<Application>(applicationDocRef);
  const isReadOnly = application?.status === 'Completed & Submitted' || application?.status === 'Approved';

  useEffect(() => {
    if (application) {
      const form = application.forms?.find(f => f.name === 'Room and Board Commitment');
      if (form?.status === 'Completed') {
        setSignerType(form.signerType || null);
        setSignerName(form.signerName || '');
        setSignerRelationship(form.signerRelationship || '');
        setAckRoomAndBoard(!!form.ackRoomAndBoard);
        setAckNmoHC(!!form.ackNmoHC);
        setSignatureDate(
          form.dateCompleted
            ? new Date(form.dateCompleted.seconds * 1000).toLocaleDateString()
            : new Date().toLocaleDateString()
        );
      } else {
        setSignatureDate(new Date().toLocaleDateString());
      }

      setMonthlyIncome(application.monthlyIncome || '');
    } else {
      setSignatureDate(new Date().toLocaleDateString());
    }
  }, [application]);

  const isFormComplete = useMemo(() => {
    if (!monthlyIncome.trim()) return false;
    if (!ackRoomAndBoard) return false;
    if (!ackNmoHC) return false;
    if (!signerType || !signerName.trim() || !signerRelationship.trim()) return false;
    return true;
  }, [monthlyIncome, ackRoomAndBoard, ackNmoHC, signerType, signerName, signerRelationship]);

  const handleSubmit = async () => {
    if (!isFormComplete) {
      toast({
        variant: 'destructive',
        title: 'Incomplete Form',
        description: 'Please complete the monthly income, acknowledgment, and signature fields.',
      });
      return;
    }

    if (!applicationId || !applicationDocRef) {
      toast({ variant: 'destructive', title: 'Error', description: 'Application ID is missing.' });
      return;
    }

    setIsSubmitting(true);

    const existingForms = application?.forms || [];
    const formIndex = existingForms.findIndex(form => form.name === 'Room and Board Commitment');

    const newFormData: Partial<FormStatus> = {
      status: 'Completed',
      signerType,
      signerName,
      signerRelationship,
      ackRoomAndBoard: true,
      ackNmoHC: true,
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
        { name: 'Room and Board Commitment', type: 'online-form', href: '/forms/room-board-obligation', ...newFormData } as FormStatus,
      ];
    }

    try {
      await setDoc(
        applicationDocRef,
        {
          forms: updatedForms,
          monthlyIncome,
          lastUpdated: Timestamp.now(),
        },
        { merge: true }
      );
      toast({
        title: 'Room and Board Commitment Completed',
        description: 'Your acknowledgment has been recorded.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      router.push(`/pathway?applicationId=${applicationId}`);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: error.message || 'Could not save your Room and Board Commitment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingApplication || isUserLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading Application Data...</p>
      </div>
    );
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
              <CardTitle className="text-2xl">Room and Board Commitment</CardTitle>
              <CardDescription>Please review and complete this financial commitment form.</CardDescription>
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

              <div className="prose prose-sm max-w-none text-gray-700 space-y-3 p-4 border rounded-lg bg-muted/30">
                <p>The MCP member is responsible for paying the RCFE the "room and board" portion and the MCP is responsible for paying the RCFE the "assisted living" portion.</p>
                <p>For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for "room and board" for a private room or to open up RCFEs in more expensive areas.</p>
                <p>Members not eligible for the NMOHC will still have a "room and board" obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.</p>
                <p>Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a "room and board" payment from the member (or their family).</p>
                <p>Working with CalAIM is at the discretion of the RCFEs. RCFEs, especially in more expensive areas, might not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas. Before accepting CalAIM members, RCFEs will need to know the "room and board" payment.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="monthly-income">Member's current monthly Social Security income is <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">$</span>
                    <Input
                      id="monthly-income"
                      type="number"
                      inputMode="decimal"
                      className="pl-7"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      disabled={isReadOnly}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Please note that proof of income (e.g., Social Security award letter or 3 month's of bank statements showing Social Security income) will need to be submitted as part of this application package.
                  </p>
                </div>

                <div className="flex items-start space-x-3 rounded-md border p-4">
                  <Checkbox
                    id="ack-room-board"
                    checked={ackRoomAndBoard}
                    onCheckedChange={(checked) => setAckRoomAndBoard(!!checked)}
                    disabled={isReadOnly}
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="ack-room-board" className="text-blue-700">
                      I have read and understood the financial obligation for Room and Board. <span className="text-destructive">*</span>
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-3 rounded-md border p-4">
                  <Checkbox
                    id="ack-nmohc"
                    checked={ackNmoHC}
                    onCheckedChange={(checked) => setAckNmoHC(!!checked)}
                    disabled={isReadOnly}
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="ack-nmohc" className="text-blue-700">
                      If Member is eligible for NMOHC he/she agrees to pay the required NMOHC portion (while retaining the personal need expenses). <span className="text-destructive">*</span>
                    </Label>
                  </div>
                </div>
              </div>

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
                        <Label htmlFor="signer-rep">Authorized Representative (POA)</Label>
                      </div>
                    </div>
                  </RadioGroup>

                  <div className="space-y-2">
                    <Label htmlFor="signer-relationship">If authorized representative, what is relationship to member (if not A/R please put N/A)? <span className="text-destructive">*</span></Label>
                    <Input
                      id="signer-relationship"
                      value={signerRelationship}
                      onChange={e => setSignerRelationship(e.target.value)}
                      placeholder="e.g., Son, Daughter, Conservator, or N/A"
                      disabled={isReadOnly}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signer-name">Type Full Name to Sign <span className="text-destructive">*</span></Label>
                    <Input
                      id="signer-name"
                      value={signerName}
                      onChange={e => setSignerName(e.target.value)}
                      placeholder="Your full legal name"
                      disabled={isReadOnly}
                      required
                    />
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
                        By clicking the button below, I acknowledge that under penalty of perjury, I am the member or an authorized representative (POA) legally empowered to sign on behalf of the member.
                      </AlertDescription>
                    </Alert>
                  </div>

                  <Button onClick={handleSubmit} disabled={isSubmitting || !isFormComplete} className="w-full">
                    {isSubmitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                    ) : (
                      <><FileCheck2 className="mr-2 h-4 w-4" /> Acknowledge and Complete</>
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

export default function RoomBoardObligationPage() {
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
      <RoomBoardObligationContent />
    </Suspense>
  );
}
