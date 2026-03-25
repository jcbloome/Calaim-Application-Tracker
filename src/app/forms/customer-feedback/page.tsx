'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquareHeart } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';

function CustomerFeedbackPageContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const applicationId = String(searchParams.get('applicationId') || '').trim();

  const [rating, setRating] = useState<string>('');
  const [comments, setComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const applicationDocRef = useMemoFirebase(() => {
    if (isUserLoading || !user?.uid || !firestore || !applicationId) return null;
    return doc(firestore, `users/${user.uid}/applications`, applicationId);
  }, [applicationId, firestore, isUserLoading, user?.uid]);

  const { data: application, isLoading } = useDoc<Application>(applicationDocRef);

  useEffect(() => {
    if (!application) return;
    const feedbackForm = (application.forms || []).find((f) => String(f.name || '').trim() === 'Customer Feedback Survey');
    const existingRating = Number((feedbackForm as any)?.feedbackRating ?? (application as any)?.customerFeedbackRating ?? 0);
    const existingComments = String((feedbackForm as any)?.feedbackComments ?? (application as any)?.customerFeedbackComments ?? '').trim();

    setRating(existingRating > 0 ? String(existingRating) : '');
    setComments(existingComments);
  }, [application]);

  const isComplete = useMemo(() => {
    const parsedRating = Number.parseInt(rating, 10);
    return parsedRating >= 1 && parsedRating <= 5 && comments.trim().length > 0;
  }, [rating, comments]);

  const handleSave = async () => {
    if (!applicationDocRef || !application) return;
    if (!isComplete) {
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: 'Please provide a rating and tell us how we can improve the site.',
      });
      return;
    }

    const parsedRating = Number.parseInt(rating, 10);
    const existingForms = Array.isArray(application.forms) ? application.forms : [];
    const formIndex = existingForms.findIndex((f) => String(f.name || '').trim() === 'Customer Feedback Survey');
    const feedbackFormPatch: Partial<FormStatus> = {
      name: 'Customer Feedback Survey',
      type: 'online-form',
      href: '/forms/customer-feedback',
      status: 'Completed',
      feedbackRating: parsedRating,
      feedbackComments: comments.trim(),
      dateCompleted: Timestamp.now(),
    };
    const updatedForms =
      formIndex > -1
        ? [
            ...existingForms.slice(0, formIndex),
            { ...existingForms[formIndex], ...feedbackFormPatch } as FormStatus,
            ...existingForms.slice(formIndex + 1),
          ]
        : [...existingForms, feedbackFormPatch as FormStatus];

    setIsSaving(true);
    try {
      await setDoc(
        applicationDocRef,
        {
          forms: updatedForms,
          customerFeedbackRating: parsedRating,
          customerFeedbackComments: comments.trim(),
          customerFeedbackSubmittedAt: new Date().toISOString(),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      toast({
        title: 'Feedback submitted',
        description: 'Thank you for helping us improve the application experience.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not submit feedback',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading feedback survey...</p>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
          <Button variant="outline" asChild>
            <Link href={`/pathway?applicationId=${encodeURIComponent(applicationId)}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Pathway
            </Link>
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareHeart className="h-5 w-5 text-primary" />
                Customer Feedback Survey (Optional)
              </CardTitle>
              <CardDescription>
                Share your experience with the application process. This does not affect eligibility or processing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert className="bg-blue-50 border-blue-200">
                <AlertTitle>Thank you for your feedback</AlertTitle>
                <AlertDescription>
                  A quick response helps us improve support for future applicants and families.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Overall experience with the application process (required)</Label>
                <RadioGroup value={rating} onValueChange={setRating} className="flex flex-wrap gap-3">
                  {['1', '2', '3', '4', '5'].map((value) => (
                    <div key={value} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <RadioGroupItem id={`rating-${value}`} value={value} />
                      <Label htmlFor={`rating-${value}`}>{value}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-comments">How can we improve this site? (required)</Label>
                <Textarea
                  id="feedback-comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Tell us what would make the site easier or better for you."
                  className="min-h-[130px]"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit Feedback
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

export default function CustomerFeedbackPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <CustomerFeedbackPageContent />
    </Suspense>
  );
}

