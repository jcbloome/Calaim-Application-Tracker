'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { 
  FileText, 
  Users, 
  BarChart3, 
  Calendar,
  Download,
  Eye,
  TrendingUp,
  MapPin,
  Building2,
  Stethoscope
} from 'lucide-react';

export default function ReportsPage() {
  const { isAdmin, isSuperAdmin, isLoading } = useAdmin();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You need admin access to view reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground">
          Generate and view comprehensive reports for CalAIM applications, members, and system activity.
        </p>
      </div>

      {/* Member & Application Reports */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              ILS Member Reports
            </CardTitle>
            <CardDescription>
              Generate reports for ILS (Independent Living Services) members with detailed status and contact information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/reports/ils">
                <Button className="w-full" variant="default">
                  <Eye className="h-4 w-4 mr-2" />
                  View ILS Reports
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Includes member status, Kaiser tracking, pathway information, and contact details.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Application Reports
            </CardTitle>
            <CardDescription>
              Comprehensive reports on application submissions, status, and processing times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/applications">
                <Button className="w-full" variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  View Applications
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Track application progress, completion rates, and member details.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Activity Analytics
            </CardTitle>
            <CardDescription>
              Detailed analytics on daily, weekly, and monthly activity patterns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/activity-log">
                <Button className="w-full" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Activity Log
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Running totals of applications, CS Summary completions, and document uploads.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Geographic Reports
            </CardTitle>
            <CardDescription>
              Location-based analytics for RCFEs, staff, and member distribution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/california-map-enhanced">
                <Button className="w-full" variant="outline">
                  <MapPin className="h-4 w-4 mr-2" />
                  Map Intelligence
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Interactive mapping with RCFE locations, staff assignments, and member visits.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              County Analysis
            </CardTitle>
            <CardDescription>
              County-by-county breakdown of CalAIM resources and member distribution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/california-counties">
                <Button className="w-full" variant="outline">
                  <MapPin className="h-4 w-4 mr-2" />
                  County Reports
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Analyze resource distribution and member coverage by California county.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Kaiser Tracking
            </CardTitle>
            <CardDescription>
              Specialized reports for Kaiser members with authorization tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/kaiser-tracker">
                <Button className="w-full" variant="outline">
                  <Stethoscope className="h-4 w-4 mr-2" />
                  Kaiser Reports
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Track Kaiser authorization status, T2038 requests, and member progression.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Quick Statistics Overview
          </CardTitle>
          <CardDescription>
            Key metrics and statistics across all reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">228</div>
              <div className="text-sm text-muted-foreground">RCFEs</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">21</div>
              <div className="text-sm text-muted-foreground">Social Workers</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-purple-600">13</div>
              <div className="text-sm text-muted-foreground">Registered Nurses</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">1155</div>
              <div className="text-sm text-muted-foreground">Authorized Members</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Super Admin Reports */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Super Admin Reports
            </CardTitle>
            <CardDescription>
              Advanced reporting tools available to Super Administrators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/admin/statistics">
                <Button className="w-full" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  System Statistics
                </Button>
              </Link>
              <Link href="/admin/progress-tracker">
                <Button className="w-full" variant="outline">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Progress Tracker
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}