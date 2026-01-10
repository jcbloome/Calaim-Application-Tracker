'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { 
  Bell, 
  Mail, 
  FileText, 
  Upload, 
  Users,
  Settings,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';

interface NotificationLog {
  id: string;
  type: 'document_upload' | 'cs_summary_complete';
  applicationId: string;
  memberName: string;
  recipients: string[];
  timestamp: Date;
  success: boolean;
  error?: string;
  manual?: boolean;
  triggeredBy?: string;
}

interface NotificationSettings {
  emailNotifications: boolean;
  documentUploadNotifications: boolean;
  csSummaryNotifications: boolean;
  emailAddress: string;
}

export function NotificationManager() {
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    documentUploadNotifications: true,
    csSummaryNotifications: true,
    emailAddress: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  // Load notification logs
  useEffect(() => {
    if (!firestore) return;

    const logsQuery = query(
      collection(firestore, 'notification-logs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const logs: NotificationLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        logs.push({
          id: doc.id,
          type: data.type,
          applicationId: data.applicationId,
          memberName: data.memberName,
          recipients: data.recipients || [],
          timestamp: data.timestamp?.toDate() || new Date(),
          success: data.success,
          error: data.error,
          manual: data.manual,
          triggeredBy: data.triggeredBy
        });
      });
      setNotificationLogs(logs);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  // Load user notification settings
  useEffect(() => {
    if (!firestore || !user) return;

    const userDocRef = doc(firestore, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        setSettings({
          emailNotifications: userData.emailNotifications ?? true,
          documentUploadNotifications: userData.documentUploadNotifications ?? true,
          csSummaryNotifications: userData.csSummaryNotifications ?? true,
          emailAddress: userData.email || user.email || ''
        });
      }
    });

    return () => unsubscribe();
  }, [firestore, user]);

  const saveSettings = async () => {
    if (!firestore || !user) return;

    setIsSaving(true);
    try {
      const userDocRef = doc(firestore, 'users', user.uid);
      await updateDoc(userDocRef, {
        emailNotifications: settings.emailNotifications,
        documentUploadNotifications: settings.documentUploadNotifications,
        csSummaryNotifications: settings.csSummaryNotifications,
        email: settings.emailAddress
      });

      toast({
        title: 'Settings Saved',
        description: 'Your notification preferences have been updated',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Could not save notification settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestNotification = async () => {
    setIsSendingTest(true);
    try {
      const functions = getFunctions();
      const sendTest = httpsCallable(functions, 'sendManualNotification');
      
      const result = await sendTest({
        type: 'cs_summary_complete',
        applicationId: 'test-application',
        recipients: [settings.emailAddress]
      });

      toast({
        title: 'Test Email Sent',
        description: 'Check your email for the test notification',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Test Failed',
        description: error.message || 'Could not send test notification',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'document_upload': return <Upload className="h-4 w-4 text-blue-600" />;
      case 'cs_summary_complete': return <FileText className="h-4 w-4 text-green-600" />;
      default: return <Bell className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-red-600" />
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading notifications...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Configure your email notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Address */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <input
              type="email"
              value={settings.emailAddress}
              onChange={(e) => setSettings(prev => ({ ...prev, emailAddress: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your.email@example.com"
            />
          </div>

          {/* Notification Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Email Notifications</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Receive email notifications for application updates
                </p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, emailNotifications: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Document Upload Alerts</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Get notified when new documents are uploaded
                </p>
              </div>
              <Switch
                checked={settings.documentUploadNotifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, documentUploadNotifications: checked }))}
                disabled={!settings.emailNotifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="font-medium">CS Summary Completion</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Get notified when CS Summary forms are completed
                </p>
              </div>
              <Switch
                checked={settings.csSummaryNotifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, csSummaryNotifications: checked }))}
                disabled={!settings.emailNotifications}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={saveSettings}
              disabled={isSaving}
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
              onClick={sendTestNotification}
              disabled={isSendingTest || !settings.emailAddress}
            >
              {isSendingTest ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Test Email
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Notifications
          </CardTitle>
          <CardDescription>
            History of sent email notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notificationLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notificationLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {getNotificationIcon(log.type)}
                    {getStatusIcon(log.success)}
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{log.memberName}</span>
                      <Badge variant="outline" className="text-xs">
                        {log.type.replace('_', ' ')}
                      </Badge>
                      {log.manual && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                          Manual
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {log.recipients.length} recipient(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(log.timestamp, 'MMM dd, yyyy HH:mm')}
                      </span>
                    </div>
                    
                    {log.error && (
                      <Alert className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          {log.error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}