'use client';

import React, { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function ContinueInvitePageContent() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const invitedApplicationId = String(searchParams.get('applicationId') || '').trim();
  const [applicationIdInput, setApplicationIdInput] = useState(invitedApplicationId);
  const returnTo = invitedApplicationId ? `/invite/continue?applicationId=${encodeURIComponent(invitedApplicationId)}` : '/invite/continue';
  const [isLinking, setIsLinking] = useState(false);
  const [hasAutoLinked, setHasAutoLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laneError, setLaneError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(applicationIdInput.trim() && user && !laneError),
    [applicationIdInput, user, laneError]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!auth?.currentUser) {
        if (!cancelled) setLaneError(null);
        return;
      }
      try {
        const email = String(auth.currentUser.email || '').trim().toLowerCase();
        if (!email) {
          if (!cancelled) setLaneError(null);
          return;
        }
        const laneResponse = await fetch('/api/auth/email-lane', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const laneData = await laneResponse.json().catch(() => null);
        if (!cancelled) {
          if (laneData?.success && !Boolean(laneData.isUserLaneAllowed)) {
            const reservedLane = String(laneData.reservedLane || '').trim().toLowerCase();
            if (reservedLane === 'sw') {
              setLaneError('This account is assigned to Social Worker login. Use a dedicated user email to continue invite applications.');
            } else if (reservedLane === 'admin') {
              setLaneError('This account is assigned to Admin login. Use a dedicated user email to continue invite applications.');
            } else {
              setLaneError('This account is reserved for another portal role. Use a dedicated user email to continue.');
            }
            return;
          }
          setLaneError(null);
        }
      } catch {
        if (!cancelled) setLaneError(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [auth?.currentUser, user?.uid]);

  const onLink = useCallback(async () => {
    if (!auth?.currentUser || !applicationIdInput.trim()) return;
    setError(null);
    setIsLinking(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/applications/claim-admin-started', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId: applicationIdInput.trim(),
        }),
      });

      const result = await response.json().catch(() => null);
      const claimedCount = Number(result?.claimedCount || 0);
      if (!response.ok || claimedCount < 1) {
        throw new Error('Could not verify invite details. Please confirm Application ID, member last name, and DOB.');
      }

      toast({
        title: 'Application linked',
        description: 'You can now continue this application.',
      });
      router.push(`/forms/cs-summary-form?applicationId=${encodeURIComponent(applicationIdInput.trim())}`);
    } catch (linkError: any) {
      const message = String(linkError?.message || 'Unable to link application from invite.');
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Invite verification failed',
        description: message,
      });
    } finally {
      setIsLinking(false);
    }
  }, [auth?.currentUser, applicationIdInput, router, toast]);

  useEffect(() => {
    if (!user || !invitedApplicationId || laneError || isLinking || hasAutoLinked) return;
    setHasAutoLinked(true);
    void onLink();
  }, [user, invitedApplicationId, laneError, isLinking, hasAutoLinked, onLink]);

  return (
    <>
      <Header />
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <CardTitle>Continue Application Invite</CardTitle>
            <CardDescription>
              Sign in with the invited email to continue directly to your CS Summary application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <AlertTitle className="text-blue-900">Quick steps</AlertTitle>
              <AlertDescription className="space-y-1 text-blue-800">
                <div>1) Sign in or create account with the invited email.</div>
                <div>2) Click continue to open your assigned CS Summary application.</div>
              </AlertDescription>
            </Alert>
            {!invitedApplicationId && (
              <Alert variant="destructive">
                <AlertTitle>Invalid invite link</AlertTitle>
                <AlertDescription>No application ID detected in this link. Enter Application ID below to continue.</AlertDescription>
              </Alert>
            )}

            {!user && (
              <Alert>
                <AlertTitle>Sign in required</AlertTitle>
                <AlertDescription className="space-y-2">
                  <div>Please sign in or create an account using the invited email first.</div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/login?redirect=${encodeURIComponent(returnTo)}`}>Sign in</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/signup?redirect=${encodeURIComponent(returnTo)}`}>Create account</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/reset-password">Set/Reset password</Link>
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {user && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void onLink();
                }}
                className="space-y-4"
              >
                {laneError && (
                  <Alert variant="destructive">
                    <AlertTitle>Portal role mismatch</AlertTitle>
                    <AlertDescription>{laneError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="invite-application-id">Application ID</Label>
                  <Input
                    id="invite-application-id"
                    value={applicationIdInput}
                    onChange={(e) => setApplicationIdInput(e.target.value)}
                    placeholder="Enter application ID"
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Verification failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={!canSubmit || isLinking}>
                  {isLinking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening application...</> : 'Continue to CS Summary'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function ContinueInvitePage() {
  return (
    <Suspense
      fallback={
        <>
          <Header />
          <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-md shadow-xl">
              <CardContent className="py-8">
                <div className="flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading invite details...
                </div>
              </CardContent>
            </Card>
          </main>
        </>
      }
    >
      <ContinueInvitePageContent />
    </Suspense>
  );
}
