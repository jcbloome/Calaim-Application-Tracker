'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { 
  Bell, 
  Smartphone, 
  Mail, 
  Settings, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Info,
  Volume2,
  VolumeX
} from 'lucide-react';
import { usePushNotifications } from '@/components/PushNotificationManager';

interface NotificationSettings {
  enablePushNotifications: boolean;
  enableEmailNotifications: boolean;
  enableSystemTray: boolean;
  notificationSound: boolean;
  urgentOnly: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    enablePushNotifications: true,
    enableEmailNotifications: false,
    enableSystemTray: true,
    notificationSound: true,
    urgentOnly: false,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  });
  const [loading, setLoading] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { isEnabled: pushEnabled, isSupported: pushSupported, requestPermission } = usePushNotifications();

  // Load user's notification settings
  useEffect(() => {
    if (user) {
      loadNotificationSettings();
    }
  }, [user]);

  const loadNotificationSettings = async () => {
    try {
      setLoading(true);
      // This would load from your backend/Firebase
      // For now, using localStorage as demo
      const savedSettings = localStorage.getItem(`notification-settings-${user?.uid}`);
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveNotificationSettings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Save to backend (this would be a real API call)
      localStorage.setItem(`notification-settings-${user.uid}`, JSON.stringify(settings));
      
      // If push notifications are enabled, ensure we have permission
      if (settings.enablePushNotifications && !pushEnabled) {
        const granted = await requestPermission();
        if (!granted) {
          setSettings(prev => ({ ...prev, enablePushNotifications: false }));
          toast({
            title: "Permission Required",
            description: "Push notifications require browser permission",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Settings Saved",
        description: "Your notification preferences have been updated",
      });
    } catch (error) {
      console.error('Error saving notification settings:', error);
      toast({
        title: "Error",
        description: "Failed to save notification settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const testNotification = async () => {
    if (!pushSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in this browser",
        variant: "destructive",
      });
      return;
    }

    if (!pushEnabled) {
      const granted = await requestPermission();
      if (!granted) {
        toast({
          title: "Permission Denied",
          description: "Please enable notifications to test",
          variant: "destructive",
        });
        return;
      }
    }

    // Show test notification
    const notification = new Notification('📝 CalAIM Test Notification', {
      body: 'This is a test notification for the CalAIM client notes system',
      icon: '/calaimlogopdf.png',
      badge: '/calaimlogopdf.png',
      tag: 'test-notification',
      requireInteraction: false
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    toast({
      title: "Test Notification Sent",
      description: "Check your system notifications",
    });
  };

  const getNotificationStatus = () => {
    if (!pushSupported) {
      return { status: 'unsupported', color: 'text-gray-500', icon: XCircle };
    }
    if (!pushEnabled) {
      return { status: 'disabled', color: 'text-red-500', icon: XCircle };
    }
    return { status: 'enabled', color: 'text-green-500', icon: CheckCircle };
  };

  const notificationStatus = getNotificationStatus();
  const StatusIcon = notificationStatus.icon;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">🔔 Notification Settings</h1>
          <p className="text-muted-foreground">
            Configure how you receive notifications for client note assignments
          </p>
        </div>
      </div>

      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Notification Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <StatusIcon className={`w-5 h-5 ${notificationStatus.color}`} />
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {notificationStatus.status}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Smartphone className="w-5 h-5 text-blue-500" />
              <div>
                <p className="font-medium">Device Support</p>
                <p className="text-sm text-muted-foreground">
                  {pushSupported ? 'Supported' : 'Not Supported'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Bell className="w-5 h-5 text-orange-500" />
              <div>
                <p className="font-medium">Active Notifications</p>
                <p className="text-sm text-muted-foreground">
                  {settings.enablePushNotifications ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </div>

          {!pushSupported && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your browser doesn't support push notifications. Please use a modern browser like Chrome, Firefox, or Safari.
              </AlertDescription>
            </Alert>
          )}

          {pushSupported && !pushEnabled && (
            <Alert className="mt-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Push notifications are disabled. Click "Request Permission" below to enable desktop notifications.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Desktop Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications even when the app is closed
              </p>
            </div>
            <Switch
              checked={settings.enablePushNotifications}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, enablePushNotifications: checked }))
              }
              disabled={!pushSupported}
            />
          </div>

          {/* System Tray */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">System Tray Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show notifications in your system tray
              </p>
            </div>
            <Switch
              checked={settings.enableSystemTray}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, enableSystemTray: checked }))
              }
            />
          </div>

          {/* Email Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive email alerts for important assignments
              </p>
            </div>
            <Switch
              checked={settings.enableEmailNotifications}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, enableEmailNotifications: checked }))
              }
            />
          </div>

          {/* Notification Sound */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Notification Sound</Label>
              <p className="text-sm text-muted-foreground">
                Play sound when receiving notifications
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {settings.notificationSound ? (
                <Volume2 className="w-4 h-4 text-green-600" />
              ) : (
                <VolumeX className="w-4 h-4 text-gray-400" />
              )}
              <Switch
                checked={settings.notificationSound}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, notificationSound: checked }))
                }
              />
            </div>
          </div>

          {/* Urgent Only */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Urgent Notifications Only</Label>
              <p className="text-sm text-muted-foreground">
                Only receive notifications for high-priority assignments
              </p>
            </div>
            <Switch
              checked={settings.urgentOnly}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, urgentOnly: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Test & Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Test & Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={testNotification}
              variant="outline"
              disabled={!pushSupported}
            >
              <Bell className="w-4 h-4 mr-2" />
              Test Notification
            </Button>

            {!pushEnabled && pushSupported && (
              <Button
                onClick={requestPermission}
                variant="outline"
              >
                <Smartphone className="w-4 h-4 mr-2" />
                Request Permission
              </Button>
            )}

            <Button
              onClick={saveNotificationSettings}
              disabled={loading}
            >
              <Settings className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>How it works:</strong> When a staff member assigns a note to you, you'll receive an instant 
              desktop notification even if the CalAIM app is closed. This replaces the unreliable Caspio email triggers 
              with a much more reliable push notification system.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Browser Compatibility */}
      <Card>
        <CardHeader>
          <CardTitle>Browser Compatibility</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">Chrome</Badge>
              <p className="text-sm text-green-600">✅ Full Support</p>
            </div>
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">Firefox</Badge>
              <p className="text-sm text-green-600">✅ Full Support</p>
            </div>
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">Safari</Badge>
              <p className="text-sm text-green-600">✅ Full Support</p>
            </div>
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">Edge</Badge>
              <p className="text-sm text-green-600">✅ Full Support</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}