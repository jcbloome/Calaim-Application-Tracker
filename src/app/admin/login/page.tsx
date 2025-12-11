
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

function LoginProcessLog({ logs }: { logs: string[] }) {
    return (
        <div className="mt-6 w-full bg-gray-900 text-white font-mono text-xs rounded-md p-4 h-48 overflow-y-auto">
            <p className="font-bold mb-2">Login Process Log:</p>
            {logs.map((log, index) => (
            <p key={index} className="whitespace-pre-wrap">{log}</p>
            ))}
        </div>
    );
}


export default function AdminLoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const [email, setEmail] = useState('jason@carehomefinders.com');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(true);
  
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `${timestamp}: ${message}`]);
  };


  useEffect(() => {
    addLog(`Initial check: isUserLoading=${isUserLoading}, user=${user?.uid || null}`);
    
    if (isUserLoading || !firestore) {
      addLog('Waiting for user/firestore to initialize...');
      return;
    }

    if (user) {
        addLog(`User detected: ${user.uid}. Checking roles...`);
        const checkAdminRole = async () => {
            try {
                const adminDoc = await getDoc(doc(firestore, 'roles_admin', user.uid));
                const superAdminDoc = await getDoc(doc(firestore, 'roles_super_admin', user.uid));

                if (adminDoc.exists() || superAdminDoc.exists()) {
                    addLog('User is an admin. Redirecting to /admin/applications.');
                    router.push('/admin/applications');
                } else {
                    addLog('User is not an admin. Signing out and staying on login page.');
                    if (auth) await auth.signOut();
                }
            } catch (err: any) {
                addLog(`Error checking roles: ${err.message}`);
                 if (auth) await auth.signOut();
            }
        };
        checkAdminRole();
    } else {
        addLog('No user detected or firestore not ready. Waiting for auth state change.');
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
      addLog(`Error: ${errorMsg}`);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to Firebase. Please try again later.',
      });
      setIsLoading(false);
      return;
    }

    try {
        addLog('Set session persistence.');
        await setPersistence(auth, browserSessionPersistence);
        if (isSigningIn) {
            await signInWithEmailAndPassword(auth, email, password);
            addLog('signInWithEmailAndPassword successful.');
            toast({ title: 'Admin sign-in successful!', duration: 2000 });
            // The useEffect will now handle the redirect after role check
        } else {
            addLog('Creating new user with email and password...');
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;
            addLog(`New user created: ${newUser.uid}`);

            await updateProfile(newUser, {
                displayName: `${firstName} ${lastName}`
            });
            addLog(`User profile updated with display name.`);

            const userDocRef = doc(firestore, 'users', newUser.uid);
            await setDoc(userDocRef, {
                id: newUser.uid,
                firstName: firstName,
                lastName: lastName,
                email: newUser.email,
            });
            addLog(`User document created in 'users' collection.`);
            
            const adminRoleRef = doc(firestore, 'roles_admin', newUser.uid);
            await setDoc(adminRoleRef, {
                email: newUser.email,
                role: 'admin'
            });
            addLog(`Admin role document created in 'roles_admin' collection.`);

            toast({ title: 'Admin account created and signed in successfully!', duration: 2000 });
            // The useEffect will handle the redirect
        }
    } catch (err: any) {
        setError(err.message);
        addLog(`Authentication failed: ${err.message}`);
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
            <LoginProcessLog logs={logs} />
        </CardContent>
      </Card>
    </main>
    </>
  );
}

    