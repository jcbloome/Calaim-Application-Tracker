
'use client';

import React, { useState, useEffect } from 'react';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { Loader2, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const { isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This effect handles redirection logic based on user status.
    const loading = isUserLoading || isAdminLoading;
    if (loading) {
      return; // Do nothing while loading.
    }

    if (!user) {
      router.push('/login'); // If no user, send to login.
    } else if (isAdmin || isSuperAdmin) {
      router.push('/admin'); // CRITICAL FIX: If user is an admin, redirect them away from this page.
    }
  }, [user, isUserLoading, isAdmin, isSuperAdmin, isAdminLoading, router]);

  useEffect(() => {
    if (user?.displayName) {
      const nameParts = user.displayName.split(' ');
      setFirstName(nameParts[0] || '');
      setLastName(nameParts.slice(1).join(' ') || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!user || !auth || !firestore) {
      const errorMsg = "Authentication services are not available.";
      setError(errorMsg);
      toast({ variant: 'destructive', title: 'Error', description: errorMsg });
      setIsLoading(false);
      return;
    }

    const formattedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    const formattedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
    
    const newDisplayName = `${formattedFirstName} ${formattedLastName}`.trim();
    if (!newDisplayName) {
        setError("First and last name cannot be empty.");
        setIsLoading(false);
        return;
    }

    try {
      // Update Firebase Auth display name
      await updateProfile(user, { displayName: newDisplayName });

      // Update Firestore user document
      const userDocRef = doc(firestore, 'users', user.uid);
      await setDoc(userDocRef, {
        firstName: formattedFirstName,
        lastName: formattedLastName,
        displayName: newDisplayName,
      }, { merge: true });

      toast({
        title: 'Profile Updated!',
        description: 'Your name has been successfully updated.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      
      // Force a reload of the user object to reflect changes everywhere
      await user.reload();

    } catch (err: any) {
      setError(err.message);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatAndSetFirstName = (value: string) => {
      const formatted = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      setFirstName(formatted);
  };

  const formatAndSetLastName = (value: string) => {
      const formatted = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      setLastName(formatted);
  };

  // This is the loading state / redirect guard.
  // It will show a loader until the user/admin status is confirmed,
  // at which point the useEffect above will trigger any necessary redirects.
  if (isUserLoading || isAdminLoading || !user || isAdmin || isSuperAdmin) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="ml-4">Loading Profile...</p>
        </div>
    );
  }

  // This JSX will only be rendered if the user is loaded, is not an admin, and exists.
  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <UserCog className="mx-auto h-12 w-12 text-primary mb-4" />
            <CardTitle className="text-3xl font-bold">My Profile</CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={user.email || ''} readOnly disabled className="bg-muted" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    required
                    value={firstName}
                    onChange={e => formatAndSetFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    required
                    value={lastName}
                    onChange={e => formatAndSetLastName(e.target.value)}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Updating...</>
                ) : (
                  'Update Profile'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
