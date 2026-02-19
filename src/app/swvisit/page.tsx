'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardCheck,
  MapPin,
  Users,
  Calendar,
  CheckCircle,
  ArrowRight,
  Shield,
  Clock,
  Star,
  Heart,
  Building
} from 'lucide-react';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useAutoTrackPortalAccess } from '@/hooks/use-sw-login-tracking';
import Image from 'next/image';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';

export default function SocialWorkerPortal() {
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const router = useRouter();
  
  // Track portal access
  useAutoTrackPortalAccess('portal-home');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="bg-white rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center shadow-lg">
              <Shield className="h-12 w-12 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
              <p className="text-gray-600 mb-6">
                This portal is exclusively for authorized social workers. Please contact your administrator if you need access.
              </p>
              <Link href="/login">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Return to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image
                src="/calaimlogopdf.png"
                alt="Connect CalAIM Logo"
                width={200}
                height={56}
                className="h-14 w-auto object-contain"
                priority
              />
              <div className="hidden md:block">
                <h1 className="text-xl font-semibold text-gray-900">Social Worker Portal</h1>
                <p className="text-sm text-gray-600">Member Visit Management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.displayName || 'Social Worker'}</p>
                <p className="text-xs text-gray-600">Field Representative</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    if (auth) await auth.signOut();
                  } catch {
                    // ignore
                  }
                  try {
                    await fetch('/api/auth/sw-session', { method: 'DELETE' });
                  } catch {
                    // ignore
                  }
                  router.push('/sw-login');
                }}
              >
                Logout
              </Button>
              <div className="bg-green-100 rounded-full p-2">
                <Users className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="bg-white rounded-full p-4 w-20 h-20 mx-auto mb-6 shadow-lg">
            <ClipboardCheck className="h-12 w-12 text-blue-600 mx-auto" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Your Visit Portal
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Streamlined member visit documentation with mobile-optimized questionnaires and electronic sign-offs
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Your RCFEs</p>
                  <p className="text-3xl font-bold">9</p>
                </div>
                <Building className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Assigned Members</p>
                  <p className="text-3xl font-bold">60</p>
                </div>
                <Users className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">This Month</p>
                  <p className="text-3xl font-bold">12</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm">Avg. Score</p>
                  <p className="text-3xl font-bold">58</p>
                </div>
                <Star className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Visit Verification */}
          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-100 rounded-lg p-3">
                  <ClipboardCheck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">Member Visit Verification</CardTitle>
                  <p className="text-sm text-gray-600">Mobile questionnaire system</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>6-step mobile-optimized questionnaire</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Automatic scoring and flagging system</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>RCFE staff electronic sign-off</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Geolocation verification for compliance</span>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Mobile Optimized</span>
                </div>
                <p className="text-xs text-blue-700">
                  Designed for field use on tablets and smartphones with offline form validation
                </p>
              </div>

              <Link href="/sw-visit-verification">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3">
                  Start Member Visits
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Quick Access */}
          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-green-100 rounded-lg p-3">
                  <Clock className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">Quick Access</CardTitle>
                  <p className="text-sm text-gray-600">Essential tools and information</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Link href="/test-billy">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="h-4 w-4 mr-3" />
                    View Your Assignments
                    <Badge variant="secondary" className="ml-auto">60 members</Badge>
                  </Button>
                </Link>
                
                <Link href="/sw-visit-verification">
                  <Button variant="outline" className="w-full justify-start">
                    <Calendar className="h-4 w-4 mr-3" />
                    Today's Schedule
                    <Badge variant="secondary" className="ml-auto">9 RCFEs</Badge>
                  </Button>
                </Link>
                
                <Button variant="outline" className="w-full justify-start" disabled>
                  <Heart className="h-4 w-4 mr-3" />
                  Member Care Notes
                  <Badge variant="outline" className="ml-auto">Coming Soon</Badge>
                </Button>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Compliance Ready</span>
                </div>
                <p className="text-xs text-green-700">
                  All visits include automatic audit trails and supervisor notifications for flagged cases
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features Overview */}
        <Card className="bg-white shadow-lg border-0">
          <CardHeader>
            <CardTitle className="text-center text-2xl">System Features</CardTitle>
            <p className="text-center text-gray-600">Everything you need for efficient member visit management</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center space-y-3">
                <div className="bg-blue-100 rounded-full p-4 w-16 h-16 mx-auto">
                  <ClipboardCheck className="h-8 w-8 text-blue-600 mx-auto" />
                </div>
                <h3 className="font-semibold">Smart Questionnaires</h3>
                <p className="text-sm text-gray-600">
                  Mobile-optimized forms with validation, scoring, and automatic flagging for quality assurance
                </p>
              </div>
              
              <div className="text-center space-y-3">
                <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto">
                  <MapPin className="h-8 w-8 text-green-600 mx-auto" />
                </div>
                <h3 className="font-semibold">Location Verification</h3>
                <p className="text-sm text-gray-600">
                  Geolocation capture ensures visit authenticity and provides complete audit trails for compliance
                </p>
              </div>
              
              <div className="text-center space-y-3">
                <div className="bg-purple-100 rounded-full p-4 w-16 h-16 mx-auto">
                  <Users className="h-8 w-8 text-purple-600 mx-auto" />
                </div>
                <h3 className="font-semibold">RCFE Integration</h3>
                <p className="text-sm text-gray-600">
                  Electronic sign-offs from RCFE staff with partial visit support and flexible scheduling
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-white border-t mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p className="text-sm">
              © 2026 Connect CalAIM • Social Worker Portal • 
              <span className="text-green-600 font-medium ml-1">System Status: Online</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}