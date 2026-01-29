'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { notifyNotificationSettingsChanged } from '@/lib/notification-utils';
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
import { playNotificationSound, type NotificationSoundType } from '@/lib/notification-sounds';

interface NotificationSettings {
  enablePushNotifications: boolean;
  enableEmailNotifications: boolean;
  enableSystemTray: boolean;
  notificationSound: boolean;
  soundType: string;
  displayStyle: 'standard' | 'compact';
  urgentOnly: boolean;
  suppressWebWhenDesktopActive: boolean;
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
    soundType: 'mellow-note',
    displayStyle: 'standard',
    urgentOnly: false,
    suppressWebWhenDesktopActive: false,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  });
  const [loading, setLoading] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isTestingSound, setIsTestingSound] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { isEnabled: pushEnabled, isSupported: pushSupported, requestPermission } = usePushNotifications();
  const SOUND_OPTIONS = [
    { value: 'mellow-note', label: 'Mellow Note' },
    { value: 'arrow-target', label: 'Arrow Hit Target' },
    { value: 'bell', label: 'Bell Chime' },
    { value: 'chime', label: 'Soft Chime' },
    { value: 'pop', label: 'Pop' },
    { value: 'windows-default', label: 'Windows Default' },
    { value: 'success-ding', label: 'Success Ding' },
    { value: 'message-swoosh', label: 'Message Swoosh' },
    { value: 'alert-beep', label: 'Alert Beep' },
    { value: 'coin-drop', label: 'Coin Drop' },
    { value: 'bubble-pop', label: 'Bubble Pop' },
    { value: 'typewriter-ding', label: 'Typewriter Ding' },
    { value: 'glass-ping', label: 'Glass Ping' },
    { value: 'wooden-knock', label: 'Wooden Knock' },
    { value: 'digital-blip', label: 'Digital Blip' },
    { value: 'water-drop', label: 'Water Drop' },
    { value: 'silent', label: 'Silent' }
  ];

  // Load user's notification settings
  useEffect(() => {
    setIsClient(true);
    if (user) {
      loadNotificationSettings();
    }
  }, [user]);

  const loadNotificationSettings = async () => {
    try {
      setLoading(true);
      // This would load from your backend/Firebase
      // For now, using localStorage as demo
      if (typeof window !== 'undefined') {
        const savedSettings = localStorage.getItem(`notification-settings-${user?.uid}`);
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
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
      if (typeof window !== 'undefined') {
        localStorage.setItem(`notification-settings-${user.uid}`, JSON.stringify(settings));
        let existingGlobalControls: Record<string, any> | undefined;
        let existingUserControls: Record<string, any> | undefined;
        try {
          const raw = localStorage.getItem('notificationSettings');
          if (raw) {
            const parsed = JSON.parse(raw) as any;
            existingGlobalControls = parsed?.globalControls;
            existingUserControls = parsed?.userControls;
          }
        } catch {
          existingGlobalControls = undefined;
          existingUserControls = undefined;
        }
        localStorage.setItem('notificationSettings', JSON.stringify({
          browserNotifications: {
            enabled: settings.enableSystemTray,
            newNotes: true,
            taskAssignments: true,
            urgentPriority: !settings.urgentOnly,
            sound: settings.notificationSound,
            soundType: settings.soundType
          },
          globalControls: existingGlobalControls,
          userControls: {
            ...existingUserControls,
            suppressWebWhenDesktopActive: settings.suppressWebWhenDesktopActive
          }
        }));
        notifyNotificationSettingsChanged();
      }
      
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
    if (typeof window !== 'undefined' && 'Notification' in window) {
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
    }

    toast({
      title: "Test Notification Sent",
      description: "Check your system notifications",
    });
  };

  const handleTestSound = async () => {
    if (typeof window === 'undefined') return;
    if (!settings.notificationSound) {
      toast({
        title: "Sound Disabled",
        description: "Enable notification sound to test it.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingSound(true);
    await playNotificationSound(settings.soundType as NotificationSoundType);
    setIsTestingSound(false);
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
              {isClient ? (
                <>
                  <StatusIcon className={`w-5 h-5 ${notificationStatus.color}`} />
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {notificationStatus.status}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Info className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      loading
                    </p>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <Smartphone className="w-5 h-5 text-blue-500" />
              <div>
                <p className="font-medium">Device Support</p>
                <p className="text-sm text-muted-foreground">
                  {isClient ? (pushSupported ? 'Supported' : 'Not Supported') : 'Checking'}
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

          {isClient && !pushSupported && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your browser doesn't support push notifications. Please use a modern browser like Chrome, Firefox, or Safari.
              </AlertDescription>
            </Alert>
          )}

          {isClient && pushSupported && !pushEnabled && (
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

          {/* Suppress Web When Desktop Active */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Suppress In-App Alerts When Desktop Is Active</Label>
              <p className="text-sm text-muted-foreground">
                Prevent duplicate in-app alerts while the desktop app is running
              </p>
            </div>
            <Switch
              checked={settings.suppressWebWhenDesktopActive}
              onCheckedChange={(checked) =>
                setSettings(prev => ({ ...prev, suppressWebWhenDesktopActive: checked }))
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
          {settings.notificationSound && (
            <div className="space-y-2 pl-6">
              <Label className="text-sm font-medium">Sound Type</Label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Select
                  value={settings.soundType}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, soundType: value }))}
                >
                  <SelectTrigger className="sm:w-64">
                    <SelectValue placeholder="Select sound" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestSound}
                  disabled={isTestingSound || settings.soundType === 'silent'}
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  {isTestingSound ? 'Playing...' : 'Test Sound'}
                </Button>
              </div>
            </div>
          )}

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
          <div className="space-y-2">
            <Label className="text-base font-medium">Notification Style</Label>
            <Select
              value={settings.displayStyle}
              onValueChange={(value: 'standard' | 'compact') => setSettings(prev => ({ ...prev, displayStyle: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (full card)</SelectItem>
                <SelectItem value="compact">Compact (reduced)</SelectItem>
              </SelectContent>
            </Select>
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