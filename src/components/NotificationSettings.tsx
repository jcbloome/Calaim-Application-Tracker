'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Bell, 
  Mail, 
  Volume2, 
  VolumeX, 
  Settings, 
  Target,
  Zap,
  Users,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Save,
  Loader2,
  Play,
  Pause
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface NotificationSettings {
  emailNotifications: {
    enabled: boolean;
    newNotes: boolean;
    taskAssignments: boolean;
    urgentPriority: boolean;
    dailyDigest: boolean;
  };
  browserNotifications: {
    enabled: boolean;
    newNotes: boolean;
    taskAssignments: boolean;
    urgentPriority: boolean;
    sound: boolean;
    soundType: 'arrow-target' | 'bell' | 'chime' | 'pop';
  };
  visualEffects: {
    enabled: boolean;
    animationType: 'bounce' | 'slide' | 'fade' | 'pulse';
    duration: number;
    showIcons: boolean;
  };
  globalControls: {
    masterSwitch: boolean;
    quietHours: {
      enabled: boolean;
      startTime: string;
      endTime: string;
    };
  };
}

const DEFAULT_SETTINGS: NotificationSettings = {
  emailNotifications: {
    enabled: true,
    newNotes: true,
    taskAssignments: true,
    urgentPriority: true,
    dailyDigest: false
  },
  browserNotifications: {
    enabled: true,
    newNotes: true,
    taskAssignments: true,
    urgentPriority: true,
    sound: true,
    soundType: 'arrow-target'
  },
  visualEffects: {
    enabled: true,
    animationType: 'bounce',
    duration: 3000,
    showIcons: true
  },
  globalControls: {
    masterSwitch: true,
    quietHours: {
      enabled: false,
      startTime: '18:00',
      endTime: '08:00'
    }
  }
};

const SOUND_OPTIONS = [
  { value: 'arrow-target', label: 'Arrow Hit Target 🎯', description: 'Satisfying target hit sound' },
  { value: 'bell', label: 'Bell Chime 🔔', description: 'Classic notification bell' },
  { value: 'chime', label: 'Soft Chime ✨', description: 'Gentle notification sound' },
  { value: 'pop', label: 'Pop Sound 💫', description: 'Quick pop notification' }
];

const ANIMATION_OPTIONS = [
  { value: 'bounce', label: 'Bounce', description: 'Bouncy entrance animation' },
  { value: 'slide', label: 'Slide', description: 'Slide in from right' },
  { value: 'fade', label: 'Fade', description: 'Smooth fade in' },
  { value: 'pulse', label: 'Pulse', description: 'Pulsing attention grabber' }
];

export default function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const { toast } = useToast();

  // Load notification settings
  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getSettings = httpsCallable(functions, 'getNotificationSettings');
      
      const result = await getSettings({});
      const data = result.data as any;
      
      if (data.success && data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch (error: any) {
      console.error('Error loading notification settings:', error);
      // Use default settings if loading fails
    } finally {
      setIsLoading(false);
    }
  };

  // Save notification settings
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const functions = getFunctions();
      const updateSettings = httpsCallable(functions, 'updateNotificationSettings');
      
      const result = await updateSettings({ settings });
      const data = result.data as any;
      
      if (data.success) {
        toast({
          title: 'Settings Saved',
          description: 'Notification preferences updated successfully',
          className: 'bg-green-100 text-green-900 border-green-200',
        });

        // Show test notification
        if (settings.browserNotifications.enabled) {
          showTestNotification();
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not save notification settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Test sound notification
  const testSound = async () => {
    setTestingSound(true);
    try {
      await playNotificationSound(settings.browserNotifications.soundType);
      
      toast({
        title: 'Sound Test',
        description: `Playing ${SOUND_OPTIONS.find(s => s.value === settings.browserNotifications.soundType)?.label}`,
        className: 'bg-blue-100 text-blue-900 border-blue-200',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sound Test Failed',
        description: 'Could not play notification sound',
      });
    } finally {
      setTestingSound(false);
    }
  };

  // Show test notification
  const showTestNotification = () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        const notification = new Notification('CalAIM Tracker', {
          body: 'This is a test notification! Your settings are working perfectly.',
          icon: '/calaimlogopdf.png',
          tag: 'test-notification'
        });

        if (settings.browserNotifications.sound) {
          playNotificationSound(settings.browserNotifications.soundType);
        }

        setTimeout(() => notification.close(), settings.visualEffects.duration);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            showTestNotification();
          }
        });
      }
    }
  };

  // Play notification sound
  const playNotificationSound = async (soundType: string) => {
    try {
      // Create audio context for better browser support
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      let audioBuffer: AudioBuffer;
      
      switch (soundType) {
        case 'arrow-target':
          // Generate arrow hit target sound
          audioBuffer = generateArrowTargetSound(audioContext);
          break;
        case 'bell':
          audioBuffer = generateBellSound(audioContext);
          break;
        case 'chime':
          audioBuffer = generateChimeSound(audioContext);
          break;
        case 'pop':
          audioBuffer = generatePopSound(audioContext);
          break;
        default:
          audioBuffer = generateArrowTargetSound(audioContext);
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  };

  // Generate arrow hit target sound
  const generateArrowTargetSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.3;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Create a satisfying "thunk" sound with quick attack and decay
      const envelope = Math.exp(-t * 8);
      const frequency = 200 * (1 + envelope * 2);
      data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.3;
    }
    
    return buffer;
  };

  // Generate bell sound
  const generateBellSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.5;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 3);
      data[i] = envelope * (
        Math.sin(2 * Math.PI * 800 * t) * 0.3 +
        Math.sin(2 * Math.PI * 1200 * t) * 0.2
      );
    }
    
    return buffer;
  };

  // Generate chime sound
  const generateChimeSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.4;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 4);
      data[i] = envelope * Math.sin(2 * Math.PI * 600 * t) * 0.25;
    }
    
    return buffer;
  };

  // Generate pop sound
  const generatePopSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.1;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 20);
      data[i] = envelope * Math.sin(2 * Math.PI * 1000 * t) * 0.4;
    }
    
    return buffer;
  };

  // Update settings helper
  const updateSettings = (path: string[], value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      let current: any = newSettings;
      
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      
      current[path[path.length - 1]] = value;
      return newSettings;
    });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Notification Settings
          </h3>
          <p className="text-sm text-muted-foreground">
            Control email notifications, browser alerts, and sound effects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Settings
          </Button>
        </div>
      </div>

      {/* Master Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Master Controls
          </CardTitle>
          <CardDescription>
            Global notification controls and quiet hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Master Notification Switch</Label>
              <p className="text-sm text-muted-foreground">
                Turn off all notifications system-wide
              </p>
            </div>
            <Switch
              checked={settings.globalControls.masterSwitch}
              onCheckedChange={(checked) => updateSettings(['globalControls', 'masterSwitch'], checked)}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Quiet Hours</Label>
              <Switch
                checked={settings.globalControls.quietHours.enabled}
                onCheckedChange={(checked) => updateSettings(['globalControls', 'quietHours', 'enabled'], checked)}
              />
            </div>
            
            {settings.globalControls.quietHours.enabled && (
              <div className="grid grid-cols-2 gap-4 pl-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Start Time</Label>
                  <input
                    id="start-time"
                    type="time"
                    value={settings.globalControls.quietHours.startTime}
                    onChange={(e) => updateSettings(['globalControls', 'quietHours', 'startTime'], e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">End Time</Label>
                  <input
                    id="end-time"
                    type="time"
                    value={settings.globalControls.quietHours.endTime}
                    onChange={(e) => updateSettings(['globalControls', 'quietHours', 'endTime'], e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Configure when to send email notifications to staff
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Enable Email Notifications</Label>
            <Switch
              checked={settings.emailNotifications.enabled}
              onCheckedChange={(checked) => updateSettings(['emailNotifications', 'enabled'], checked)}
            />
          </div>

          {settings.emailNotifications.enabled && (
            <div className="space-y-3 pl-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>New Notes & Replies</Label>
                  <p className="text-xs text-muted-foreground">Email when staff receive new notes</p>
                </div>
                <Switch
                  checked={settings.emailNotifications.newNotes}
                  onCheckedChange={(checked) => updateSettings(['emailNotifications', 'newNotes'], checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Task Assignments</Label>
                  <p className="text-xs text-muted-foreground">Email when tasks are assigned</p>
                </div>
                <Switch
                  checked={settings.emailNotifications.taskAssignments}
                  onCheckedChange={(checked) => updateSettings(['emailNotifications', 'taskAssignments'], checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Urgent Priority Items</Label>
                  <p className="text-xs text-muted-foreground">Always email urgent priority notifications</p>
                </div>
                <Switch
                  checked={settings.emailNotifications.urgentPriority}
                  onCheckedChange={(checked) => updateSettings(['emailNotifications', 'urgentPriority'], checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Daily Digest</Label>
                  <p className="text-xs text-muted-foreground">Send daily summary emails</p>
                </div>
                <Switch
                  checked={settings.emailNotifications.dailyDigest}
                  onCheckedChange={(checked) => updateSettings(['emailNotifications', 'dailyDigest'], checked)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Browser Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Browser Notifications
          </CardTitle>
          <CardDescription>
            Windows-style notifications with sound effects
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Enable Browser Notifications</Label>
            <Switch
              checked={settings.browserNotifications.enabled}
              onCheckedChange={(checked) => updateSettings(['browserNotifications', 'enabled'], checked)}
            />
          </div>

          {settings.browserNotifications.enabled && (
            <div className="space-y-4 pl-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>New Notes & Replies</Label>
                    <p className="text-xs text-muted-foreground">Show browser notifications for new notes</p>
                  </div>
                  <Switch
                    checked={settings.browserNotifications.newNotes}
                    onCheckedChange={(checked) => updateSettings(['browserNotifications', 'newNotes'], checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Task Assignments</Label>
                    <p className="text-xs text-muted-foreground">Show notifications for new tasks</p>
                  </div>
                  <Switch
                    checked={settings.browserNotifications.taskAssignments}
                    onCheckedChange={(checked) => updateSettings(['browserNotifications', 'taskAssignments'], checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Urgent Priority Items</Label>
                    <p className="text-xs text-muted-foreground">Always show urgent notifications</p>
                  </div>
                  <Switch
                    checked={settings.browserNotifications.urgentPriority}
                    onCheckedChange={(checked) => updateSettings(['browserNotifications', 'urgentPriority'], checked)}
                  />
                </div>
              </div>

              <Separator />

              {/* Sound Settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Sound Effects</Label>
                  <Switch
                    checked={settings.browserNotifications.sound}
                    onCheckedChange={(checked) => updateSettings(['browserNotifications', 'sound'], checked)}
                  />
                </div>

                {settings.browserNotifications.sound && (
                  <div className="space-y-3 pl-4">
                    <div className="space-y-2">
                      <Label>Sound Type</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={settings.browserNotifications.soundType}
                          onValueChange={(value) => updateSettings(['browserNotifications', 'soundType'], value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SOUND_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="space-y-1">
                                  <div className="font-medium">{option.label}</div>
                                  <div className="text-xs text-muted-foreground">{option.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={testSound}
                          disabled={testingSound}
                          size="sm"
                          variant="outline"
                        >
                          {testingSound ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Effects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Visual Effects
          </CardTitle>
          <CardDescription>
            Customize notification animations and visual feedback
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Enable Visual Effects</Label>
            <Switch
              checked={settings.visualEffects.enabled}
              onCheckedChange={(checked) => updateSettings(['visualEffects', 'enabled'], checked)}
            />
          </div>

          {settings.visualEffects.enabled && (
            <div className="space-y-4 pl-4">
              <div className="space-y-2">
                <Label>Animation Type</Label>
                <Select
                  value={settings.visualEffects.animationType}
                  onValueChange={(value) => updateSettings(['visualEffects', 'animationType'], value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIMATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="space-y-1">
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Display Duration (ms)</Label>
                <Select
                  value={settings.visualEffects.duration.toString()}
                  onValueChange={(value) => updateSettings(['visualEffects', 'duration'], parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2000">2 seconds</SelectItem>
                    <SelectItem value="3000">3 seconds</SelectItem>
                    <SelectItem value="5000">5 seconds</SelectItem>
                    <SelectItem value="10000">10 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Show Icons</Label>
                  <p className="text-xs text-muted-foreground">Display notification type icons</p>
                </div>
                <Switch
                  checked={settings.visualEffects.showIcons}
                  onCheckedChange={(checked) => updateSettings(['visualEffects', 'showIcons'], checked)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Notification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Test Notifications
          </CardTitle>
          <CardDescription>
            Test your notification settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button onClick={showTestNotification} variant="outline">
              <Bell className="mr-2 h-4 w-4" />
              Test Browser Notification
            </Button>
            <Button onClick={testSound} disabled={testingSound} variant="outline">
              {testingSound ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="mr-2 h-4 w-4" />
              )}
              Test Sound
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}