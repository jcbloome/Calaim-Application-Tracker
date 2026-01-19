
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
          <div className="container mx-auto px-4 py-16 sm:py-24">
            <div className="text-center space-y-8">
              {/* Logo and Wolf Icon */}
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <Image
                    src="/calaimlogopdf.png"
                    alt="Connect CalAIM Logo"
                    width={400}
                    height={112}
                    className="w-96 h-auto object-contain"
                    priority
                  />
                </div>
                {/* CalAIM Wolf Mascot */}
                <div className="relative">
                  <Image
                    src="/wolf mascotsmall.jpg"
                    alt="CalAIM Wolf Mascot"
                    width={120}
                    height={120}
                    className="w-30 h-30 object-contain drop-shadow-lg"
                    priority
                  />
                </div>
              </div>

              {/* Main Heading */}
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                  Welcome to <span className="text-blue-600">CalAIM</span>
                </h1>
                <p className="text-xl sm:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                  California Advancing and Innovating Medi-Cal
                </p>
              </div>

              {/* Program Description */}
              <div className="max-w-4xl mx-auto space-y-6">
                <p className="text-lg text-gray-700 leading-relaxed">
                  CalAIM is California's comprehensive initiative to transform and strengthen Medi-Cal, 
                  providing enhanced care management and community-based services to improve health outcomes 
                  for our most vulnerable populations.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                      <Users className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">Enhanced Care Management</h3>
                    <p className="text-gray-600">
                      Coordinated, person-centered care management services for high-risk, high-utilizing Medi-Cal members.
                    </p>
                  </div>
                  
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <Shield className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">Community Supports</h3>
                    <p className="text-gray-600">
                      Community-based services that address social determinants of health and support member stability.
                    </p>
                  </div>
                  
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">Streamlined Applications</h3>
                    <p className="text-gray-600">
                      Simplified application and tracking system for CalAIM services and member enrollment.
                    </p>
                  </div>
                </div>
              </div>

              {/* Call to Action */}
              <div className="space-y-6 pt-8">
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <Link href="/login">
                    <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg">
                      <LogIn className="mr-2 h-5 w-5" />
                      Member Login
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button variant="outline" size="lg" className="border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-3 text-lg">
                      <Users className="mr-2 h-5 w-5" />
                      New Member Registration
                    </Button>
                  </Link>
                </div>
                
                <p className="text-sm text-gray-500">
                  For assistance, contact your care coordinator or call the CalAIM support line
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center space-y-12">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  How CalAIM Helps You
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Our comprehensive approach addresses your health and social needs through coordinated care and community support.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                  <CardContent className="space-y-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                      <Heart className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Health Services</h3>
                    <p className="text-sm text-gray-600">
                      Access to comprehensive healthcare services and care coordination.
                    </p>
                  </CardContent>
                </Card>

                <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                  <CardContent className="space-y-4">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <Shield className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Housing Support</h3>
                    <p className="text-sm text-gray-600">
                      Assistance with housing stability and community living support services.
                    </p>
                  </CardContent>
                </Card>

                <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                  <CardContent className="space-y-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                      <Users className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Care Coordination</h3>
                    <p className="text-sm text-gray-600">
                      Personalized care management and coordination across all your services.
                    </p>
                  </CardContent>
                </Card>

                <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                  <CardContent className="space-y-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-6 h-6 text-orange-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Easy Access</h3>
                    <p className="text-sm text-gray-600">
                      Streamlined application process and ongoing support throughout your journey.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-900 text-white py-12">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Image
                    src="/wolf mascotsmall.jpg"
                    alt="CalAIM Wolf Mascot"
                    width={60}
                    height={60}
                    className="w-15 h-15 object-contain"
                  />
                  <Image
                    src="/calaimlogopdf.png"
                    alt="Connect CalAIM Logo"
                    width={180}
                    height={50}
                    className="w-44 h-auto object-contain brightness-0 invert"
                  />
                </div>
                <p className="text-gray-300">
                  Transforming Medi-Cal to better serve California's most vulnerable populations.
                </p>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Quick Links</h4>
                <div className="space-y-2">
                  <Link href="/login" className="block text-gray-300 hover:text-white transition-colors">
                    Member Login
                  </Link>
                  <Link href="/signup" className="block text-gray-300 hover:text-white transition-colors">
                    New Registration
                  </Link>
                  <Link href="/faq" className="block text-gray-300 hover:text-white transition-colors">
                    FAQ
                  </Link>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Contact Support</h4>
                <div className="space-y-2 text-gray-300">
                  <p>For technical assistance or questions about your CalAIM services</p>
                  <p>Contact your assigned care coordinator</p>
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
              <p>&copy; 2026 Connections Care Home Consultants. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

    