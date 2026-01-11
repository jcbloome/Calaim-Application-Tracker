'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '@/firebase';
import { Bell, TestTube, Volume2, VolumeX, Loader2 } from 'lucide-react';

interface NotificationSettings {
  noteNotifications: boolean;
  taskNotifications: boolean;
  soundEnabled: boolean;
  testMode: boolean;
}

export function StaffNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>({
    noteNotifications: true,
    taskNotifications: true,
    soundEnabled: true,
    testMode: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getSettings = httpsCallable(functions, 'getStaffNotificationSettings');
      
      const result = await getSettings();
      const data = result.data as any;
      
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const functions = getFunctions();
      const updateSettings = httpsCallable(functions, 'updateStaffNotificationSettings');
      
      const result = await updateSettings({ settings });
      const data = result.data as any;
      
      if (data.success) {
        toast({
          title: 'Settings Saved',
          description: 'Your notification preferences have been updated',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        throw new Error(data.message || 'Failed to save settings');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Failed to save notification settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testNotification = async () => {
    setIsTesting(true);
    try {
      const functions = getFunctions();
      const sendTestNotification = httpsCallable(functions, 'sendTestStaffNotification');
      
      const result = await sendTestNotification();
      const data = result.data as any;
      
      if (data.success) {
        // Show the test notification using the global function
        if ((window as any).showStaffNotification) {
          (window as any).showStaffNotification({
            title: 'Test Notification',
            message: 'This is a test notification to verify your settings are working correctly.',
            senderName: 'System Test',
            memberName: 'Test Member',
            type: 'note',
            priority: 'medium'
          });
        }
        
        toast({
          title: 'Test Sent',
          description: 'A test notification has been triggered',
          className: 'bg-blue-100 text-blue-900 border-blue-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Test Failed',
        description: error.message || 'Failed to send test notification',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading notification settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Staff Note Notifications
        </CardTitle>
        <CardDescription>
          Configure how you receive notifications when staff members send you notes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Note Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="note-notifications" className="text-base">
              Note Notifications
            </Label>
            <div className="text-sm text-muted-foreground">
              Receive popup notifications when staff send you notes
            </div>
          </div>
          <Switch
            id="note-notifications"
            checked={settings.noteNotifications}
            onCheckedChange={(checked) => updateSetting('noteNotifications', checked)}
          />
        </div>

        {/* Task Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="task-notifications" className="text-base">
              Task Notifications
            </Label>
            <div className="text-sm text-muted-foreground">
              Receive notifications for task assignments and updates
            </div>
          </div>
          <Switch
            id="task-notifications"
            checked={settings.taskNotifications}
            onCheckedChange={(checked) => updateSetting('taskNotifications', checked)}
          />
        </div>

        {/* Sound Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="sound-enabled" className="text-base flex items-center gap-2">
              {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Notification Sound
            </Label>
            <div className="text-sm text-muted-foreground">
              Play a sound when notifications appear
            </div>
          </div>
          <Switch
            id="sound-enabled"
            checked={settings.soundEnabled}
            onCheckedChange={(checked) => updateSetting('soundEnabled', checked)}
          />
        </div>

        {/* Notification Preview */}
        {settings.noteNotifications && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Notification Style Preview</h4>
            <div className="text-sm text-blue-700 space-y-1">
              <p>• Notifications appear as popup cards in the top-right corner</p>
              <p>• Similar to Cursor IDE notifications with smooth animations</p>
              <p>• Auto-dismiss after 8 seconds or click to dismiss manually</p>
              <p>• Click "View" to navigate directly to the application</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button 
            onClick={saveSettings} 
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={testNotification}
            disabled={isTesting || !settings.noteNotifications}
            className="flex items-center gap-2"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4" />
            )}
            Test Notification
          </Button>
        </div>

        {!settings.noteNotifications && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Enable note notifications to test the notification system
          </div>
        )}
      </CardContent>
    </Card>
  );
}