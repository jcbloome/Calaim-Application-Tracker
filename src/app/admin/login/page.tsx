
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

  useEffect(() => {
    if (user && !isUserLoading && firestore) {
      addLog(`User detected: ${user.uid}. Checking roles...`);
      const verifyAdminAndRedirect = async (user: User) => {
        const adminDocRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminDocRef = doc(firestore, 'roles_super_admin', user.uid);
        
        try {
          addLog(`Checking admin role at path: ${adminDocRef.path}`);
          const adminDoc = await getDoc(adminDocRef);
          addLog(`Admin role exists: ${adminDoc.exists()}`);

          addLog(`Checking super admin role at path: ${superAdminDocRef.path}`);
          const superAdminDoc = await getDoc(superAdminDocRef);
          addLog(`Super admin role exists: ${superAdminDoc.exists()}`);

          if (adminDoc.exists() || superAdminDoc.exists()) {
            addLog('Role verified. Redirecting to /admin/applications');
            router.push('/admin/applications');
          } else {
            addLog('User is not an admin. Signing out.');
            if(auth) await auth.signOut();
            setError("Access Denied. You do not have admin privileges.");
          }
        } catch (e: any) {
          addLog(`Error checking roles: ${e.message}`);
          setError(`Error during role verification: ${e.message}`);
           if(auth) await auth.signOut();
        }
      };
      verifyAdminAndRedirect(user);
    } else if (!user && !isUserLoading) {
        addLog("No user logged in.");
    }
  }, [user, isUserLoading, firestore, auth, router]);


  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLog([]); // Clear log on new attempt
    addLog(`Starting ${isSigningIn ? 'Sign In' : 'Sign Up'} process for ${email}...`);
    setIsLoading(true);

    if (!auth || !firestore) {
      const errorMsg = "Firebase auth service is not available.";
      addLog(errorMsg);
      setError(errorMsg);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to Firebase. Please try again later.',
      });
      setIsLoading(false);
      return;
    }

    try {
      addLog("Setting session persistence.");
      await setPersistence(auth, browserSessionPersistence);

      if (isSigningIn) {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          addLog("signInWithEmailAndPassword successful.");
          // The useEffect will now handle role checking and redirection.
      } else { // Signing Up
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          addLog("createUserWithEmailAndPassword successful.");
          const newUser = userCredential.user;

          addLog("Updating user profile...");
          await updateProfile(newUser, {
              displayName: `${firstName} ${lastName}`.trim()
          });

          addLog(`Creating user document in 'users/${newUser.uid}'...`);
          const userDocRef = doc(firestore, 'users', newUser.uid);
          await setDoc(userDocRef, {
              id: newUser.uid,
              firstName: firstName,
              lastName: lastName,
              displayName: `${firstName} ${lastName}`.trim(),
              email: newUser.email,
          });
          
          addLog(`Creating admin role document in 'roles_admin/${newUser.uid}'...`);
          const adminRoleRef = doc(firestore, 'roles_admin', newUser.uid);
          await setDoc(adminRoleRef, {
              email: newUser.email,
              role: 'admin'
          });

          addLog("Sign up complete. Redirecting...");
          // The useEffect will handle the redirection after the user state changes.
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
            <div className="mt-6 p-4 border bg-muted/50 rounded-lg max-h-48 overflow-y-auto">
              <h4 className="text-sm font-semibold mb-2">Login Process Log:</h4>
              <div className="text-xs font-mono space-y-1">
                {log.map((entry, i) => <p key={i}>{entry}</p>)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
    </>
  );
}
