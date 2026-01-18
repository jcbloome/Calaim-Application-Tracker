'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, 
  TestTube, 
  Volume2, 
  VolumeX, 
  Zap, 
  Mail,
  Monitor,
  Smartphone,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Info
} from 'lucide-react';
import { useSystemNotifications } from '@/hooks/use-system-notifications';
import { NotificationManager } from '@/components/SystemTrayNotification';
import { useToast } from '@/hooks/use-toast';

export default function TestNotificationsPage() {
  const { 
    notifications, 
    removeNotification, 
    showSuccess, 
    showError, 
    showWarning, 
    showInfo,
    requestPermission,
    clearAllNotifications
  } = useSystemNotifications();
  
  const { toast } = useToast();

  // Form state
  const [notificationType, setNotificationType] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const [title, setTitle] = useState('Test Notification');
  const [message, setMessage] = useState('This is a test notification message to verify the system tray popup functionality.');
  const [duration, setDuration] = useState(5000);
  const [playSound, setPlaySound] = useState(true);
  const [showAction, setShowAction] = useState(false);
  const [actionLabel, setActionLabel] = useState('View Details');

  const handleTestNotification = () => {
    const options = {
      duration: duration,
      playSound: playSound,
      actionButton: showAction ? {
        label: actionLabel,
        onClick: () => {
          toast({
            title: "Action Clicked!",
            description: "The notification action button was clicked.",
          });
        }
      } : undefined,
      onClick: (id: string) => {
        console.log('Notification clicked:', id);
        toast({
          title: "Notification Clicked",
          description: "You clicked on the system tray notification.",
        });
      }
    };

    switch (notificationType) {
      case 'success':
        showSuccess(title, message, options);
        break;
      case 'error':
        showError(title, message, options);
        break;
      case 'warning':
        showWarning(title, message, options);
        break;
      case 'info':
        showInfo(title, message, options);
        break;
    }
  };

  const handleTestHealthNetNotification = async () => {
    try {
      const testData = {
        memberName: 'John Doe',
        memberClientId: 'HN-12345',
        applicationId: `TEST-${Date.now()}`,
        submittedBy: 'Test User',
        submittedDate: new Date().toLocaleDateString(),
        pathway: 'SNF Transition',
        currentLocation: 'Los Angeles, CA',
        healthPlan: 'Health Net',
        applicationUrl: `${window.location.origin}/admin/applications/test-123`,
      };

      // Show system tray notification first
      showInfo(
        '🏥 Health Net Application Test',
        `Testing notification system for ${testData.memberName}`,
        {
          duration: 8000,
          playSound: true,
          actionButton: {
            label: 'View Application',
            onClick: () => {
              toast({
                title: "Application Opened",
                description: "This would normally open the application details.",
              });
            }
          }
        }
      );

      // Test the API endpoint
      const response = await fetch('/api/notifications/health-net', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      });

      const result = await response.json();

      if (response.ok) {
        showSuccess(
          'Test Completed',
          `Health Net notification test successful! Emails sent: ${result.summary?.emailsSent || 0}`,
          { duration: 6000 }
        );
      } else {
        showError(
          'Test Failed',
          result.error || 'Health Net notification test failed',
          { duration: 0 }
        );
      }

    } catch (error) {
      showError(
        'Test Error',
        'Failed to test Health Net notification system',
        { duration: 0 }
      );
    }
  };

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      showSuccess(
        'Permission Granted',
        'Browser notifications are now enabled!',
        { duration: 3000 }
      );
    } else {
      showWarning(
        'Permission Denied',
        'Browser notifications are not available. System tray notifications will still work.',
        { duration: 5000 }
      );
    }
  };

  const presetNotifications = [
    {
      type: 'success' as const,
      title: 'Application Approved',
      message: 'John Doe\'s CalAIM application has been approved and processed successfully.',
      icon: CheckCircle
    },
    {
      type: 'error' as const,
      title: 'System Error',
      message: 'Failed to sync with Caspio database. Please check your connection and try again.',
      icon: AlertCircle
    },
    {
      type: 'warning' as const,
      title: 'Pending Review',
      message: 'Jane Smith\'s application requires additional documentation before approval.',
      icon: AlertTriangle
    },
    {
      type: 'info' as const,
      title: 'New Health Net Application',
      message: 'Robert Johnson submitted a new Health Net CalAIM application for review.',
      icon: Info
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TestTube className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">System Tray Notification Test</h1>
            <p className="text-muted-foreground">
              Test and preview system tray notifications similar to Cursor's notification system
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Bell className="h-3 w-3" />
            {notifications.length} Active
          </Badge>
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAllNotifications}>
              Clear All
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Custom Notification Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Custom Notification Test
            </CardTitle>
            <CardDescription>
              Create and test custom system tray notifications with various options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Notification Type */}
            <div className="space-y-2">
              <Label>Notification Type</Label>
              <Select value={notificationType} onValueChange={(value: any) => setNotificationType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Success
                    </div>
                  </SelectItem>
                  <SelectItem value="error">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      Error
                    </div>
                  </SelectItem>
                  <SelectItem value="warning">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      Warning
                    </div>
                  </SelectItem>
                  <SelectItem value="info">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-blue-600" />
                      Info
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Notification title"
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Notification message"
                rows={3}
              />
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration (ms) - 0 for persistent</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                placeholder="5000"
              />
            </div>

            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {playSound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  <Label>Play Sound</Label>
                </div>
                <Switch checked={playSound} onCheckedChange={setPlaySound} />
              </div>

              <div className="flex items-center justify-between">
                <Label>Show Action Button</Label>
                <Switch checked={showAction} onCheckedChange={setShowAction} />
              </div>

              {showAction && (
                <div className="space-y-2">
                  <Label>Action Button Label</Label>
                  <Input
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    placeholder="View Details"
                  />
                </div>
              )}
            </div>

            <Button onClick={handleTestNotification} className="w-full">
              <Zap className="mr-2 h-4 w-4" />
              Test Notification
            </Button>
          </CardContent>
        </Card>

        {/* Preset Tests & Health Net Test */}
        <div className="space-y-6">
          {/* Preset Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Preset Notifications
              </CardTitle>
              <CardDescription>
                Quick test with common notification scenarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {presetNotifications.map((preset, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    const showFn = preset.type === 'success' ? showSuccess :
                                   preset.type === 'error' ? showError :
                                   preset.type === 'warning' ? showWarning : showInfo;
                    
                    showFn(preset.title, preset.message, {
                      playSound: true,
                      duration: preset.type === 'error' ? 0 : 5000,
                    });
                  }}
                >
                  <preset.icon className={`mr-2 h-4 w-4 ${
                    preset.type === 'success' ? 'text-green-600' :
                    preset.type === 'error' ? 'text-red-600' :
                    preset.type === 'warning' ? 'text-yellow-600' : 'text-blue-600'
                  }`} />
                  {preset.title}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Health Net Test */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Health Net Integration Test
              </CardTitle>
              <CardDescription>
                Test the complete Health Net notification system (emails + system tray + bell)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Test Recipients:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• monica@carehomefinders.com</li>
                  <li>• leidy@carehomefinders.com</li>
                </ul>
              </div>

              <Button onClick={handleTestHealthNetNotification} className="w-full">
                <Mail className="mr-2 h-4 w-4" />
                Test Health Net Notifications
              </Button>

              <Button variant="outline" onClick={handleRequestPermission} className="w-full">
                <Bell className="mr-2 h-4 w-4" />
                Enable Browser Notifications
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notification Manager */}
      <NotificationManager
        notifications={notifications}
        onRemove={removeNotification}
      />
    </div>
  );
}