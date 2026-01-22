'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users,
  Mail,
  Lock,
  ArrowRight,
  Shield,
  MapPin,
  ClipboardCheck,
  AlertCircle
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSWLoginTracking } from '@/hooks/use-sw-login-tracking';

export default function SocialWorkerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { trackLogin } = useSWLoginTracking();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Here you would integrate with Firebase Auth for social workers
      // For now, allow any login to proceed for testing
      console.log('🔧 Social worker login attempt for:', email);
      
      // Track login event
      await trackLogin();
      
      router.push('/swvisit');
      return;

      // Here you would integrate with Firebase Auth
      // const result = await signInWithEmailAndPassword(auth, email, password);
      
      // For now, simulate login process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Redirect to SW portal
      router.push('/swvisit');
      
    } catch (error: any) {
      setError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          {/* Logo and Header */}
          <div className="text-center mb-8">
            <Image
              src="/calaimlogopdf.png"
              alt="Connect CalAIM Logo"
              width={240}
              height={67}
              className="mx-auto mb-6"
              priority
            />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Social Worker Portal
            </h1>
            <p className="text-gray-600 font-medium">🏥 Secure Field Representative Access 🏥</p>
          </div>

          {/* Login Form */}
          <Card className="shadow-xl border-0 bg-gradient-to-br from-white to-green-50">
            <CardHeader className="text-center pb-4">
              <div className="bg-gradient-to-r from-green-100 to-blue-100 rounded-full p-3 w-16 h-16 mx-auto mb-4">
                <Users className="h-10 w-10 text-green-600 mx-auto" />
              </div>
              <CardTitle className="text-green-700">🔐 Social Worker Access</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@connections.org"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 py-3 text-white font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Signing In...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              {/* Social Worker Notice */}
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Social Worker Portal</span>
                </div>
                <p className="text-xs text-green-700">
                  This portal is exclusively for authorized social workers. Use your assigned credentials to access member visit tools.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Features Preview */}
          <div className="mt-8 space-y-4">
            <h3 className="text-center font-semibold text-gray-900">What's Included</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
                <span className="text-sm">Mobile visit questionnaires</span>
              </div>
              <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                <MapPin className="h-5 w-5 text-green-600" />
                <span className="text-sm">Geolocation verification</span>
              </div>
              <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                <Users className="h-5 w-5 text-purple-600" />
                <span className="text-sm">RCFE staff sign-offs</span>
              </div>
            </div>
          </div>

          {/* Help Link */}
          <div className="text-center mt-8">
            <Link href="/contact" className="text-sm text-blue-600 hover:text-blue-700">
              Need help? Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}