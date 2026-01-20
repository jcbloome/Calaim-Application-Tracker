'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Coffee, 
  Sun, 
  Bell, 
  CheckCircle, 
  AlertTriangle,
  Calendar,
  Users,
  MessageSquare,
  Activity,
  Settings
} from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';

export default function MorningDashboardPage() {
  const { isAdmin, user } = useAdmin();
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    // Check current notification permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        // Show a test notification
        new Notification('🎉 Notifications Enabled!', {
          body: 'You\'ll now receive real-time alerts for priority member notes.',
          icon: '/favicon.ico',
          tag: 'permission-granted'
        });
      }
    }
  };

  const enableAlwaysOnMode = () => {
    // Store preference in localStorage
    localStorage.setItem('calaim-always-on', 'true');
    
    // Show confirmation
    if (notificationPermission === 'granted') {
      new Notification('🔔 Always-On Mode Enabled', {
        body: 'You\'ll receive real-time notifications throughout the day.',
        icon: '/favicon.ico',
        tag: 'always-on-enabled'
      });
    }
  };

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('🎉 PWA installation accepted');
        setShowInstallButton(false);
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error during PWA installation:', error);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                You need admin permissions to access the morning dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-orange-400 to-pink-400 rounded-lg">
            <Sun className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Morning Dashboard</h1>
            <p className="text-muted-foreground">
              Your daily command center for CalAIM member management
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Coffee className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Ready to start your day?</span>
        </div>
      </div>

      {/* Always-On Setup Card */}
      {notificationPermission !== 'granted' && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-orange-800">
              <Bell className="h-5 w-5" />
              <span>Enable Always-On Notifications</span>
            </CardTitle>
            <CardDescription className="text-orange-700">
              Get real-time alerts for priority member notes throughout your workday
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 rounded-full">
                    <Bell className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">System Tray Alerts</p>
                    <p className="text-xs text-muted-foreground">Desktop notifications</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 rounded-full">
                    <Activity className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Real-Time Updates</p>
                    <p className="text-xs text-muted-foreground">Instant bell notifications</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 rounded-full">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Priority Filtering</p>
                    <p className="text-xs text-muted-foreground">Only urgent/high alerts</p>
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <Button onClick={requestNotificationPermission} className="bg-orange-600 hover:bg-orange-700">
                  <Bell className="mr-2 h-4 w-4" />
                  Enable Notifications
                </Button>
                <Button variant="outline" onClick={enableAlwaysOnMode}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configure Always-On Mode
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Card - Notifications Enabled */}
      {notificationPermission === 'granted' && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Always-On Notifications Enabled</p>
                <p className="text-sm text-green-700">
                  You'll receive real-time alerts for priority member notes throughout the day.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/member-notes'}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <MessageSquare className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">Member Notes</p>
                <p className="text-xs text-muted-foreground">View & manage notes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/my-notes'}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Bell className="h-8 w-8 text-purple-600" />
              <div>
                <p className="font-medium">My Notifications</p>
                <p className="text-xs text-muted-foreground">Personal alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/applications'}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Users className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium">Applications</p>
                <p className="text-xs text-muted-foreground">Manage applications</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/activity-dashboard'}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Activity className="h-8 w-8 text-orange-600" />
              <div>
                <p className="font-medium">Activity Dashboard</p>
                <p className="text-xs text-muted-foreground">System overview</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Simplified Morning Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Morning Dashboard</CardTitle>
          <CardDescription>
            Your daily command center - PWA functionality is ready to test!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <Bell className="h-8 w-8 text-blue-600 mb-2" />
              <h3 className="font-medium">Notifications</h3>
              <p className="text-sm text-muted-foreground">Real-time alerts</p>
            </div>
            <div className="p-4 border rounded-lg">
              <Users className="h-8 w-8 text-green-600 mb-2" />
              <h3 className="font-medium">Member Notes</h3>
              <p className="text-sm text-muted-foreground">View & manage</p>
            </div>
            <div className="p-4 border rounded-lg">
              <Activity className="h-8 w-8 text-purple-600 mb-2" />
              <h3 className="font-medium">Applications</h3>
              <p className="text-sm text-muted-foreground">Track progress</p>
            </div>
            <div className="p-4 border rounded-lg">
              <Settings className="h-8 w-8 text-orange-600 mb-2" />
              <h3 className="font-medium">System Status</h3>
              <p className="text-sm text-muted-foreground">All systems operational</p>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium text-green-800">PWA Ready for Testing!</h4>
                </div>
                <p className="text-sm text-green-700 mt-2">
                  Install this app to your desktop for system tray notifications and always-on functionality.
                </p>
              </div>
              {showInstallButton && (
                <Button onClick={handleInstallPWA} className="bg-green-600 hover:bg-green-700">
                  <Activity className="mr-2 h-4 w-4" />
                  Install App
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}