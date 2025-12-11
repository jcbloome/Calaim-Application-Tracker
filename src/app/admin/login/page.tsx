'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

function AdminLoginHeader() {
  return (
    <header className="bg-card/80 backdrop-blur-sm border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-20 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary">
          <Image
            src="/calaimlogopdf.png"
            alt="CalAIM Pathfinder Logo"
            width={180}
            height={50}
            className="w-48 h-auto object-contain"
            priority
          />
        </Link>
        {/* No navigation links in the admin header */}
      </div>
    </header>
  );
}

export default function AdminLoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(true);

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (user && firestore) {
        const adminDocRef = doc(firestore, 'roles_admin', user.uid);
        const adminDocSnap = await getDoc(adminDocRef);
        const superAdminDocRef = doc(firestore, 'roles_super_admin', user.uid);
        const superAdminDocSnap = await getDoc(superAdminDocRef);
        
        if (adminDocSnap.exists() || superAdminDocSnap.exists()) {
          router.push('/admin/applications');
        }
      }
    };
    if (!isUserLoading) {
        checkAndRedirect();
    }
  }, [user, isUserLoading, firestore, router]);


  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!auth || !firestore) {
      setError("Firebase auth service is not available.");
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to Firebase. Please try again later.',
      });
      setIsLoading(false);
      return;
    }

    try {
        await setPersistence(auth, browserSessionPersistence);
        if (isSigningIn) {
            await signInWithEmailAndPassword(auth, email, password);
            toast({ title: 'Admin sign-in successful!' });
            router.push('/admin/applications');
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await updateProfile(user, {
                displayName: `${firstName} ${lastName}`
            });

            const userDocRef = doc(firestore, 'users', user.uid);
            await setDoc(userDocRef, {
                id: user.uid,
                firstName: firstName,
                lastName: lastName,
                email: user.email,
            });
            
            const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
            await setDoc(adminRoleRef, {
                email: user.email,
                role: 'admin'
            });

            toast({ title: 'Admin account created and signed in successfully!' });
            router.push('/admin/applications');
        }
    } catch (err: any) {
        setError(err.message);
        toast({
            variant: 'destructive',
            title: 'Authentication Failed',
            description: err.message,
        });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <>
    <AdminLoginHeader />
    <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-8">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="items-center text-center p-6">
          <CardTitle className="text-3xl font-bold">
            {isSigningIn ? 'Admin Portal' : 'Create Admin Account'}
          </CardTitle>
          <CardDescription className="text-base">
            {isSigningIn ? 'Sign in to manage applications.' : 'Create a new administrative account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleAuthAction} className="space-y-4">
             {!isSigningIn && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
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
                    onChange={e => setLastName(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2 relative">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
               <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-7 h-7 w-7"
                onClick={() => setShowPassword(prev => !prev)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
              ) : (
                isSigningIn ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>
           <div className="mt-4 text-center text-sm">
              {isSigningIn ? "Need to create an admin account?" : 'Already have an admin account?'}
              <Button variant="link" onClick={() => setIsSigningIn(!isSigningIn)} className="pl-1">
                  {isSigningIn ? 'Sign Up' : 'Sign In'}
              </Button>
            </div>
        </CardContent>
      </Card>
    </main>
    </>
  );
}
