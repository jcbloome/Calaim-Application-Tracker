
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useFirebase } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Eye, EyeOff } from 'lucide-react';
import { Header } from '@/components/Header';
import { ScrollArea } from '@/components/ui/scroll-area';

// Simple on-screen logger for debugging
const DebugLog = ({ logs }: { logs: string[] }) => (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Login Debug Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40 w-full rounded-md border p-4">
          {logs.map((log, index) => (
            <p key={index} className="text-xs font-mono">
              {`[${new Date().toLocaleTimeString()}] ${log}`}
            </p>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
);

export default function LoginPage() {
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [isSigningIn, setIsSigningIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (message: string) => {
    setLogs(prev => [message, ...prev.slice(0, 19)]); // Keep last 20 logs
  };

  const logo = PlaceHolderImages.find(p => p.id === 'calaim-logo');
  
  useEffect(() => {
    addLog("Login page mounted.");
  }, []);

  useEffect(() => {
    addLog(`Firebase services check: auth is ${auth ? 'available' : 'null'}, firestore is ${firestore ? 'available' : 'null'}`);
  }, [auth, firestore]);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog("Auth action initiated.");
    setError(null);
    
    if (!auth || !firestore) {
      const errorMsg = "Firebase services are not available.";
      addLog(`ERROR: ${errorMsg}`);
      setError(errorMsg);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not connect to Firebase. Please try again later.',
      });
      return;
    }

    addLog(`Attempting to ${isSigningIn ? 'sign in' : 'sign up'} with email: ${email}`);

    try {
      if (isSigningIn) {
        await signInWithEmailAndPassword(auth, email, password);
        addLog("Sign in successful.");
      } else {
        addLog("Creating new user...");
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        addLog(`User created with UID: ${user.uid}`);
        
        addLog("Updating profile...");
        await updateProfile(user, {
          displayName: `${firstName} ${lastName}`
        });
        addLog("Profile updated.");

        addLog("Creating user document in Firestore...");
        const userDocRef = doc(firestore, 'users', user.uid);
        await setDoc(userDocRef, {
          id: user.uid,
          firstName: firstName,
          lastName: lastName,
          email: user.email,
        });
        addLog("Firestore document created.");
      }
      toast({
        title: `Successfully ${isSigningIn ? 'signed in' : 'signed up'}!`,
      });
      addLog("Redirecting to /applications...");
      router.push('/applications');
    } catch (err: any) {
      addLog(`Auth ERROR: ${err.code} - ${err.message}`);
      setError(err.message);
      toast({
        variant: 'destructive',
        title: 'Authentication Failed',
        description: err.message,
      });
    }
  };

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md">
            <Card className="shadow-2xl">
            <CardHeader className="items-center text-center p-6">
                {logo && (
                <Image
                    src={logo.imageUrl}
                    alt={logo.description}
                    width={250}
                    height={50}
                    className="object-contain mb-4"
                />
                )}
                <CardTitle className="text-3xl font-bold">
                {isSigningIn ? 'Welcome Back' : 'Create an Account'}
                </CardTitle>
                <CardDescription className="text-base">
                {isSigningIn ? 'Sign in to access your applications.' : 'Sign up to start your CalAIM journey.'}
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
                    placeholder="m@example.com"
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
                    minLength={6}
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
                <Button type="submit" className="w-full">
                    {isSigningIn ? 'Sign In' : 'Sign Up'}
                </Button>
                </form>
                <div className="mt-4 text-center text-sm">
                {isSigningIn ? "Don't have an account?" : 'Already have an account?'}
                <Button variant="link" onClick={() => setIsSigningIn(!isSigningIn)} className="pl-1">
                    {isSigningIn ? 'Sign Up' : 'Sign In'}
                </Button>
                </div>
            </CardContent>
            </Card>
            <DebugLog logs={logs} />
        </div>
      </main>
    </>
  );
}
