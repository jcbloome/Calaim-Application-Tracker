'use client';

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Eye, 
  Edit,
  Users,
  BarChart3,
  Bell
} from 'lucide-react';

export function CaspioModeNotice() {
  return (
    <div className="space-y-4">
      {/* Main Notice */}
      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Caspio Safety Mode Active:</strong> The app is now operating in a hybrid mode to prevent 
          interference with RCFE and Social Worker access while maintaining core functionality.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enabled Features */}
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              ✅ ENABLED Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">New Application Submissions</div>
                  <div className="text-sm text-muted-foreground">
                    Submit new CalAIM applications to Caspio (core app purpose)
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Eye className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">All Data Viewing</div>
                  <div className="text-sm text-muted-foreground">
                    View all member data, statuses, and information from Caspio
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <BarChart3 className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">Analytics & Reports</div>
                  <div className="text-sm text-muted-foreground">
                    Kaiser Tracker, Authorization Tracker, ILS Reports, Map Intelligence
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">Priority Note Monitoring</div>
                  <div className="text-sm text-muted-foreground">
                    Real-time notifications for high-priority notes (read-only)
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disabled Features */}
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              🚫 DISABLED Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Edit className="h-4 w-4 text-red-600" />
                <div>
                  <div className="font-medium">Member Status Updates</div>
                  <div className="text-sm text-muted-foreground">
                    Kaiser status changes, CalAIM status updates
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-red-600" />
                <div>
                  <div className="font-medium">Staff Reassignments</div>
                  <div className="text-sm text-muted-foreground">
                    Changing staff assignments on existing members
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-red-600" />
                <div>
                  <div className="font-medium">Member Record Updates</div>
                  <div className="text-sm text-muted-foreground">
                    Authorization updates, note creation/editing
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-red-600" />
                <div>
                  <div className="font-medium">Any Existing Record Modifications</div>
                  <div className="text-sm text-muted-foreground">
                    All operations that modify existing Caspio records
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Why This Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Why This Mode is Active
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                Problem Solved
              </Badge>
              <p>
                <strong>RCFE & Social Worker Access:</strong> Prevents interference with external users 
                who need uninterrupted access to view and manage their assigned members.
              </p>
            </div>
            
            <div className="space-y-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Core Function Preserved
              </Badge>
              <p>
                <strong>Application Submissions:</strong> The primary purpose of this app - submitting 
                new CalAIM applications - continues to work perfectly.
              </p>
            </div>
            
            <div className="space-y-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                Data Access Maintained
              </Badge>
              <p>
                <strong>Full Visibility:</strong> All dashboards, reports, and analytics remain 
                fully functional with real-time data from Caspio.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}