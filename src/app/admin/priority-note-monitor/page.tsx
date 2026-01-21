'use client';

import React from 'react';
import { PriorityNoteMonitor } from '@/components/admin/PriorityNoteMonitor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BellRing, Shield, CheckCircle } from 'lucide-react';

export default function PriorityNoteMonitorPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <BellRing className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">Priority Note Monitor</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of high-priority notes from Caspio with safe, read-only operation
          </p>
        </div>
      </div>

      {/* Safety Notice */}
      <Alert className="border-green-200 bg-green-50">
        <Shield className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Safe Operation Mode:</strong> This system operates in READ-ONLY mode and will not interfere 
          with RCFE or Social Worker access to Caspio. It only monitors for new priority notes and sends 
          notifications to staff via Firebase Cloud Messaging.
        </AlertDescription>
      </Alert>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            How Priority Note Monitoring Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Automated Monitoring</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Checks Caspio every 15 minutes for new high-priority notes</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Only reads data - never writes or modifies anything in Caspio</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Filters for notes marked as "high" priority only</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Tracks last check time to avoid duplicate notifications</span>
                </li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Staff Notifications</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Sends push notifications to all admin staff devices</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Includes member name and note preview in notification</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Provides direct link to member page with note highlighted</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                  <span>Works even when the app is closed (background notifications)</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Monitor Component */}
      <PriorityNoteMonitor />
    </div>
  );
}