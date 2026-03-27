'use client';

import React, { useMemo, useState } from 'react';
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

export default function ContinueInvitePage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const applicationId = String(searchParams.get('applicationId') || '').trim();
  const returnTo = applicationId ? `/invite/continue?applicationId=${encodeURIComponent(applicationId)}` : '/invite/continue';
  const [memberLastName, setMemberLastName] = useState('');
  const [memberDob, setMemberDob] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(applicationId && memberLastName.trim() && memberDob.trim() && user),
    [applicationId, memberLastName, memberDob, user]
  );

  const onLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth?.currentUser || !applicationId) return;
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
          applicationId,
          memberLastName: memberLastName.trim(),
          memberDob,
        }),
      });

      const result = await response.json().catch(() => null);
      const claimedCount = Number(result?.claimedCount || 0);
      if (!response.ok || claimedCount < 1) {
        throw new Error('Could not verify invite details. Please confirm member last name and date of birth.');
      }

      toast({
        title: 'Application linked',
        description: 'You can now continue this application.',
      });
      router.push(`/forms/cs-summary-form?applicationId=${encodeURIComponent(applicationId)}`);
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
  };

  return (
    <>
      <Header />
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <CardTitle>Continue Application Invite</CardTitle>
            <CardDescription>
              Verify member details to continue the CS Summary application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!applicationId && (
              <Alert variant="destructive">
                <AlertTitle>Invalid invite link</AlertTitle>
                <AlertDescription>This link is missing an application reference.</AlertDescription>
              </Alert>
            )}

            {!isUserLoading && !user && (
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
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {isUserLoading && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking account session...
              </div>
            )}

            {!isUserLoading && user && applicationId && (
              <form onSubmit={onLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-last-name">Member last name</Label>
                  <Input
                    id="invite-last-name"
                    value={memberLastName}
                    onChange={(e) => setMemberLastName(e.target.value)}
                    placeholder="Enter member last name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-dob">Member date of birth</Label>
                  <Input
                    id="invite-dob"
                    type="date"
                    value={memberDob}
                    onChange={(e) => setMemberDob(e.target.value)}
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
                  {isLinking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : 'Verify and continue CS Summary'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
