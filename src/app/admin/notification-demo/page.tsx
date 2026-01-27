'use client';

import { useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Volume2, 
  Bell, 
  MessageSquare, 
  Target, 
  Zap,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';
import { useWindowsNotifications } from '@/components/WindowsNotification';
import { useCursorNotifications, useTabNotifications } from '@/components/CursorStyleNotification';

const SOUND_OPTIONS = [
  { value: 'mellow-note', label: 'Mellow Note 🎵', description: 'Soft, calm notification tone' },
  { value: 'arrow-target', label: 'Arrow Hit Target 🎯', description: 'Satisfying target hit sound' },
  { value: 'bell', label: 'Bell Chime 🔔', description: 'Classic notification bell' },
  { value: 'chime', label: 'Soft Chime ✨', description: 'Gentle notification sound' },
  { value: 'pop', label: 'Pop Sound 💫', description: 'Quick pop notification' },
  { value: 'windows-default', label: 'Windows Default 🪟', description: 'Classic Windows notification' },
  { value: 'success-ding', label: 'Success Ding ✅', description: 'Achievement completion sound' },
  { value: 'message-swoosh', label: 'Message Swoosh 💨', description: 'Smooth message arrival' },
  { value: 'alert-beep', label: 'Alert Beep ⚠️', description: 'Attention-grabbing beep' },
  { value: 'coin-drop', label: 'Coin Drop 🪙', description: 'Satisfying coin sound' },
  { value: 'bubble-pop', label: 'Bubble Pop 🫧', description: 'Playful bubble burst' },
  { value: 'typewriter-ding', label: 'Typewriter Ding 📝', description: 'Vintage typewriter bell' },
  { value: 'glass-ping', label: 'Glass Ping 🥂', description: 'Crystal clear ping' },
  { value: 'wooden-knock', label: 'Wooden Knock 🚪', description: 'Gentle wooden tap' },
  { value: 'digital-blip', label: 'Digital Blip 🤖', description: 'Futuristic digital sound' },
  { value: 'water-drop', label: 'Water Drop 💧', description: 'Peaceful water droplet' },
  { value: 'silent', label: 'Silent Mode 🔇', description: 'Visual only, no sound' }
];

const NOTIFICATION_TYPES = [
  { value: 'success', label: 'Success', icon: CheckCircle2, color: 'text-green-600' },
  { value: 'error', label: 'Error', icon: AlertTriangle, color: 'text-red-600' },
  { value: 'warning', label: 'Warning', icon: AlertTriangle, color: 'text-yellow-600' },
  { value: 'info', label: 'Info', icon: Info, color: 'text-blue-600' },
  { value: 'message', label: 'Message', icon: MessageSquare, color: 'text-purple-600' },
  { value: 'task', label: 'Task', icon: Clock, color: 'text-orange-600' }
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const POSITIONS = [
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-center', label: 'Bottom Center' }
];

export default function NotificationDemoPage() {
  const { isAdmin, isUserLoading } = useAdmin();
  const { showNotification: showWindowsNotification } = useWindowsNotifications();
  const { showNotification: showCursorNotification } = useCursorNotifications();
  const { addNotification: addTabNotification } = useTabNotifications();

  // Demo settings
  const [demoSettings, setDemoSettings] = useState({
    title: 'Demo Notification',
    message: 'This is a sample notification to test the system!',
    type: 'success' as any,
    priority: 'Medium' as any,
    soundType: 'mellow-note' as any,
    position: 'top-right' as any,
    duration: 5000,
    author: 'Demo User',
    memberName: 'Demo Member'
  });

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need administrator privileges to access the notification demo.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const showWindowsDemo = () => {
    showWindowsNotification({
      type: demoSettings.type,
      title: demoSettings.title,
      message: demoSettings.message,
      author: demoSettings.author,
      memberName: demoSettings.memberName,
      priority: demoSettings.priority,
      duration: demoSettings.duration,
      sound: true,
      soundType: demoSettings.soundType,
      animation: 'bounce'
    });
  };

  const showCursorDemo = () => {
    showCursorNotification({
      type: demoSettings.type,
      title: demoSettings.title,
      message: demoSettings.message,
      author: demoSettings.author,
      memberName: demoSettings.memberName,
      priority: demoSettings.priority,
      duration: demoSettings.duration,
      position: demoSettings.position,
      showProgress: true
    });
  };

  const showTabDemo = () => {
    addTabNotification(demoSettings.priority === 'Urgent' ? 'urgent' : 'normal');
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Demo Center</h1>
          <p className="text-muted-foreground">
            Test all notification types, sounds, and styles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Interactive Demo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Customize your notification demo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={demoSettings.title}
                  onChange={(e) => setDemoSettings(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Notification title"
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={demoSettings.message}
                  onChange={(e) => setDemoSettings(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Notification message"
                  rows={3}
                />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label>Notification Type</Label>
                <Select 
                  value={demoSettings.type} 
                  onValueChange={(value) => setDemoSettings(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_TYPES.map((type) => {
                      const IconComponent = type.icon;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <IconComponent className={`h-4 w-4 ${type.color}`} />
                            <span>{type.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select 
                  value={demoSettings.priority} 
                  onValueChange={(value) => setDemoSettings(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sound Type */}
              <div className="space-y-2">
                <Label>Sound Effect</Label>
                <Select 
                  value={demoSettings.soundType} 
                  onValueChange={(value) => setDemoSettings(prev => ({ ...prev, soundType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_OPTIONS.map((sound) => (
                      <SelectItem key={sound.value} value={sound.value}>
                        <div className="space-y-1">
                          <div className="font-medium">{sound.label}</div>
                          <div className="text-xs text-muted-foreground">{sound.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Position (for Cursor-style) */}
              <div className="space-y-2">
                <Label>Position (Cursor-style)</Label>
                <Select 
                  value={demoSettings.position} 
                  onValueChange={(value) => setDemoSettings(prev => ({ ...prev, position: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((position) => (
                      <SelectItem key={position.value} value={position.value}>
                        {position.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (ms)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={demoSettings.duration}
                  onChange={(e) => setDemoSettings(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  min="1000"
                  max="10000"
                  step="500"
                />
              </div>

              {/* Author */}
              <div className="space-y-2">
                <Label htmlFor="author">Author (optional)</Label>
                <Input
                  id="author"
                  value={demoSettings.author}
                  onChange={(e) => setDemoSettings(prev => ({ ...prev, author: e.target.value }))}
                  placeholder="Notification author"
                />
              </div>

              {/* Member Name */}
              <div className="space-y-2">
                <Label htmlFor="member">Member Name (optional)</Label>
                <Input
                  id="member"
                  value={demoSettings.memberName}
                  onChange={(e) => setDemoSettings(prev => ({ ...prev, memberName: e.target.value }))}
                  placeholder="Related member name"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Demo Buttons */}
        <div className="space-y-6">
          {/* Windows-style Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Windows-style Notifications
              </CardTitle>
              <CardDescription>
                Large notification cards with custom sound effects
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={showWindowsDemo} className="w-full" size="lg">
                <Play className="mr-2 h-4 w-4" />
                Show Windows Notification
              </Button>
              
              <div className="text-sm text-muted-foreground">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Large notification cards</li>
                  <li>Custom sound effects</li>
                  <li>Priority badges</li>
                  <li>Author and member info</li>
                  <li>Smooth animations</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Cursor-style Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Cursor-style Notifications
              </CardTitle>
              <CardDescription>
                Compact notifications with progress bars like Cursor IDE
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={showCursorDemo} className="w-full" size="lg" variant="outline">
                <Target className="mr-2 h-4 w-4" />
                Show Cursor Notification
              </Button>
              
              <div className="text-sm text-muted-foreground">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Compact design</li>
                  <li>Progress bar animation</li>
                  <li>Multiple positions</li>
                  <li>Quick dismiss</li>
                  <li>Clean typography</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Tab Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Tab Notifications
              </CardTitle>
              <CardDescription>
                Browser tab title and favicon notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={showTabDemo} className="w-full" size="lg" variant="secondary">
                <Bell className="mr-2 h-4 w-4" />
                Add Tab Notification
              </Button>
              
              <div className="text-sm text-muted-foreground">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Updates browser tab title</li>
                  <li>Blinking favicon for urgent items</li>
                  <li>Notification count in title</li>
                  <li>Auto-clear when tab is focused</li>
                  <li>Persistent until viewed</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Sound Library */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5" />
                Sound Library
              </CardTitle>
              <CardDescription>
                16 different notification sounds to choose from
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {SOUND_OPTIONS.slice(0, 8).map((sound) => (
                  <Badge key={sound.value} variant="outline" className="justify-center py-2">
                    {sound.label}
                  </Badge>
                ))}
              </div>
              <Separator className="my-3" />
              <div className="grid grid-cols-2 gap-2">
                {SOUND_OPTIONS.slice(8).map((sound) => (
                  <Badge key={sound.value} variant="outline" className="justify-center py-2">
                    {sound.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}