
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword, setPersistence, browserSessionPersistence, User } from 'firebase/auth';
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
  const [log, setLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog(prev => [`${timestamp}: ${message}`, ...prev]);
  };
  
  // This effect will redirect a user if they are already logged in and are an admin.
  // It prevents a logged-in admin from seeing the login page again.
  useEffect(() => {
    if (!isUserLoading && user && firestore) {
      const checkAdminAndRedirect = async () => {
        addLog(`User detected: ${user.uid}. Checking roles...`);
        try {
          const adminDoc = await getDoc(doc(firestore, 'roles_admin', user.uid));
          const superAdminDoc = await getDoc(doc(firestore, 'roles_super_admin', user.uid));

          if (adminDoc.exists() || superAdminDoc.exists()) {
             addLog(`Role found. Redirecting to /admin/applications...`);
            router.push('/admin/applications');
          } else {
             addLog(`User is not an admin. Signing out and staying on login page.`);
            if(auth) await auth.signOut();
          }
        } catch(e: any) {
            addLog(`Error checking roles: ${e.message}`);
        }
      };
      checkAdminAndRedirect();
    }
  }, [user, isUserLoading, firestore, router, auth]);


  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    addLog(`Starting ${isSigningIn ? 'Sign In' : 'Sign Up'} process for ${email}...`);

    if (!auth || !firestore) {
      const errorMsg = "Firebase auth service is not available.";
      setError(errorMsg);
      addLog(errorMsg);
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
      addLog('Set session persistence.');
      let userCredential;

      if (isSigningIn) {
          userCredential = await signInWithEmailAndPassword(auth, email, password);
          addLog('signInWithEmailAndPassword successful.');
      } else {
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
          addLog('createUserWithEmailAndPassword successful.');
          const newUser = userCredential.user;

          await updateProfile(newUser, {
              displayName: `${firstName} ${lastName}`
          });
           addLog('Profile updated.');

          const userDocRef = doc(firestore, 'users', newUser.uid);
          await setDoc(userDocRef, {
              id: newUser.uid,
              firstName: firstName,
              lastName: lastName,
              email: newUser.email,
          });
          addLog('User document created.');
          
          const adminRoleRef = doc(firestore, 'roles_admin', newUser.uid);
          await setDoc(adminRoleRef, {
              email: newUser.email,
              role: 'admin'
          });
           addLog('Admin role document created.');
      }

      // After auth action, verify role before redirecting.
      const loggedInUser = userCredential.user;
      addLog(`Verifying roles for user ${loggedInUser.uid}...`);
      const adminDoc = await getDoc(doc(firestore, 'roles_admin', loggedInUser.uid));
      addLog(`Checked roles_admin: ${adminDoc.exists()}`);
      const superAdminDoc = await getDoc(doc(firestore, 'roles_super_admin', loggedInUser.uid));
      addLog(`Checked roles_super_admin: ${superAdminDoc.exists()}`);


      if (adminDoc.exists() || superAdminDoc.exists()) {
        addLog('Role verified. Navigating to applications page.');
        toast({ title: 'Admin sign-in successful!', duration: 2000 });
        router.push('/admin/applications');
      } else {
        addLog('Access Denied. Signing out.');
        await auth.signOut();
        setError("Access Denied. You do not have admin privileges.");
        toast({
          variant: 'destructive',
          title: 'Access Denied',
          description: 'This account does not have the required permissions.',
        });
      }

    } catch (err: any) {
        addLog(`Authentication failed: ${err.message}`);
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

            {log.length > 0 && (
            <div className="mt-6 p-4 border rounded-lg bg-muted/50 max-h-48 overflow-y-auto">
                <h4 className="text-sm font-semibold mb-2">Login Process Log:</h4>
                <div className="text-xs font-mono space-y-1">
                {log.map((entry, index) => (
                    <p key={index}>{entry}</p>
                ))}
                </div>
            </div>
            )}
        </CardContent>
      </Card>
    </main>
    </>
  );
}
