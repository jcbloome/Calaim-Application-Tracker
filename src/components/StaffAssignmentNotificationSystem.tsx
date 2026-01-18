'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  Settings, 
  Users, 
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useWindowsNotifications } from '@/components/WindowsNotification';

interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  systemTrayEnabled: boolean;
  bellNotificationEnabled: boolean;
  autoAssignmentEnabled: boolean;
}

interface StaffMember {
  name: string;
  email: string;
  id: string;
  isActive: boolean;
  assignmentCount: number;
}

export default function StaffAssignmentNotificationSystem() {
  const { toast } = useToast();
  const { showNotification } = useWindowsNotifications();
  
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    soundEnabled: true,
    systemTrayEnabled: true,
    bellNotificationEnabled: true,
    autoAssignmentEnabled: true
  });

  const [staffMembers] = useState<StaffMember[]>([
    { name: 'Nick', email: 'nick@carehomefinders.com', id: 'nick-staff', isActive: true, assignmentCount: 0 },
    { name: 'John', email: 'john@carehomefinders.com', id: 'john-staff', isActive: true, assignmentCount: 0 },
    { name: 'Jessie', email: 'jessie@carehomefinders.com', id: 'jessie-staff', isActive: true, assignmentCount: 0 }
  ]);

  const [isUpdating, setIsUpdating] = useState(false);
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  const handleSettingChange = async (key: keyof NotificationSettings, value: boolean) => {
    setIsUpdating(true);
    try {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      
      // Here you would save to database/localStorage
      localStorage.setItem('staffAssignmentNotificationSettings', JSON.stringify(newSettings));
      
      toast({
        title: "Settings Updated",
        description: `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} ${value ? 'enabled' : 'disabled'}`,
        className: "bg-green-100 text-green-900 border-green-200",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update notification settings.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const sendTestNotification = async () => {
    setTestNotificationSent(true);
    
    try {
      // Bell notification
      if (settings.bellNotificationEnabled) {
        toast({
          title: "🔔 New Application Assignment",
          description: "Test Member has been assigned to Nick (nick@carehomefinders.com)",
          className: "bg-blue-100 text-blue-900 border-blue-200",
        });
      }

      // System tray notification
      if (settings.systemTrayEnabled) {
        showNotification({
          type: 'assignment',
          title: 'New Application Assignment! 📋',
          message: 'Test Member (Kaiser - SNF Transition) has been assigned to you.',
          author: 'CalAIM System',
          memberName: 'Test Member',
          duration: 5000,
          sound: settings.soundEnabled,
          soundType: 'notification',
          animation: 'bounce'
        });
      }

      toast({
        title: "Test Notification Sent",
        description: "Check your system tray and bell notifications!",
        className: "bg-green-100 text-green-900 border-green-200",
      });

    } catch (error) {
      toast({
        variant: "destructive",
        title: "Test Failed",
        description: "Could not send test notification.",
      });
    }

    setTimeout(() => setTestNotificationSent(false), 3000);
  };

  // Load settings on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('staffAssignmentNotificationSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Error loading notification settings:', error);
      }
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Main Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Staff Assignment Notification System
              </CardTitle>
              <CardDescription>
                Configure automatic staff assignment and notification settings for new applications
              </CardDescription>
            </div>
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Enable/Disable */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${settings.enabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {settings.enabled ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              </div>
              <div>
                <Label className="text-base font-medium">Enable Notification System</Label>
                <p className="text-sm text-muted-foreground">
                  Master switch for all staff assignment notifications
                </p>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Individual Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Notification Types</h4>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <Label>Bell Notifications</Label>
                </div>
                <Switch
                  checked={settings.bellNotificationEnabled}
                  onCheckedChange={(checked) => handleSettingChange('bellNotificationEnabled', checked)}
                  disabled={!settings.enabled || isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <Label>System Tray Popups</Label>
                </div>
                <Switch
                  checked={settings.systemTrayEnabled}
                  onCheckedChange={(checked) => handleSettingChange('systemTrayEnabled', checked)}
                  disabled={!settings.enabled || isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {settings.soundEnabled ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                  <Label>Sound Notifications</Label>
                </div>
                <Switch
                  checked={settings.soundEnabled}
                  onCheckedChange={(checked) => handleSettingChange('soundEnabled', checked)}
                  disabled={!settings.enabled || isUpdating}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Assignment Settings</h4>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Label>Auto-Assignment</Label>
                </div>
                <Switch
                  checked={settings.autoAssignmentEnabled}
                  onCheckedChange={(checked) => handleSettingChange('autoAssignmentEnabled', checked)}
                  disabled={!settings.enabled || isUpdating}
                />
              </div>
            </div>
          </div>

          {/* Test Notification */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Test Notifications</Label>
                <p className="text-xs text-muted-foreground">Send a test notification to verify settings</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={sendTestNotification}
                disabled={!settings.enabled || testNotificationSent}
              >
                {testNotificationSent ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Sent!
                  </>
                ) : (
                  <>
                    <Bell className="h-3 w-3 mr-1" />
                    Send Test
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Rotation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Rotation Order
          </CardTitle>
          <CardDescription>
            Applications are assigned to staff in this order: Nick → John → Jessie → repeat
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {staffMembers.map((staff, index) => (
              <div key={staff.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{staff.name}</div>
                    <div className="text-sm text-muted-foreground">{staff.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {staff.assignmentCount} assignments
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}