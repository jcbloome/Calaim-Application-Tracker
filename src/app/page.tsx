
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import type { AuthError, User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { Eye, EyeOff, Loader2, LogIn, Mail, Heart, Shield, Users, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import Image from 'next/image';

async function trackLogin(firestore: any, user: User, role: 'Admin' | 'User') {
    if (!firestore || !user) return;
    try {
        await addDoc(collection(firestore, 'loginLogs'), {
            userId: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: role,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error tracking login:", error);
    }
}

export default function HomePage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const enhancedToast = useEnhancedToast();
  const { user, isUserLoading } = useAdmin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    if (isUserLoading) {
      return; 
    }
    if (user) {
      router.push('/applications');
    }
  }, [user, isUserLoading, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!auth || !firestore) {
      const errorMsg = 'Firebase services are not available.';
      setError(errorMsg);
      setIsLoading(false);
      return;
    }

    try {
      if (auth.currentUser) {
        await auth.signOut();
      }
      
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Track the login event
      await trackLogin(firestore, userCredential.user, 'User');
      
      enhancedToast.success('Successfully signed in!', 'Redirecting to your dashboard...');
    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'Invalid email or password. Please try again.';
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (authError.code === 'auth/too-many-requests') {
          errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      } else {
        errorMessage = `An unexpected error occurred: ${authError.message}`;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      enhancedToast.error('Email Required', 'Please enter your email address to reset your password.');
      return;
    }

    setIsResettingPassword(true);
    try {
      // Use our custom password reset API exclusively - no more ugly Firebase emails!
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        enhancedToast.success('Password Reset Email Sent', 'Check your email (including spam/junk folder) for a password reset link from the Connections CalAIM Application Portal.');
        setResetEmail('');
        return;
      } else {
        throw new Error(data.error || 'Failed to send password reset email');
      }
    } catch (error: any) {
      console.error('Password reset error:', error);
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many password reset attempts. Please try again later.';
      }
      
      enhancedToast.error('Password Reset Failed', errorMessage);
    } finally {
      setIsResettingPassword(false);
    }
  };
  
  if (isUserLoading || user) {
      return (
          <div className="flex items-center justify-center h-screen">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="ml-2">Loading session...</p>
          </div>
      );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="container mx-auto px-4 py-12 sm:py-16 lg:py-24">
            <div className="text-center space-y-6 sm:space-y-8">
              {/* CalAIM Wolf Mascot */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 rounded-full flex items-center justify-center shadow-xl overflow-hidden">
                    <Image
                      src="/wolf mascotsmall.jpg"
                      alt="CalAIM Wolf Mascot"
                      width={192}
                      height={192}
                      className="w-full h-full object-cover rounded-full"
                      priority
                    />
                  </div>
                </div>
              </div>

              {/* Main Heading */}
              <div className="space-y-3 sm:space-y-4">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 leading-tight px-2">
                  Welcome to <span className="text-blue-600">Connect CalAIM</span>
                </h1>
                <p className="text-lg sm:text-xl lg:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed px-4">
                  California Advancing and Innovating Medi-Cal
                </p>
              </div>

              {/* Program Description */}
              <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 px-4">
                <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                  CalAIM is Connections Care Home Consultants streamline application portal for the CalAIM Community Support for Assisted Transitions for Kaiser and Health Net.
                </p>
              </div>

              {/* Call to Action */}
              <div className="space-y-4 sm:space-y-6 pt-6 sm:pt-8">
                <div className="flex justify-center px-4">
                  <Link href="/info">
                    <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 sm:px-12 py-3 sm:py-4 text-lg sm:text-xl font-semibold rounded-full shadow-lg hover:shadow-xl transition-all w-full sm:w-auto min-w-[200px]">
                      Let's Go!
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>


      </main>
    </>
  );
}

    