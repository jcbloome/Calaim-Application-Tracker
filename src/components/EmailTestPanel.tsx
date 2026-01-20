'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Mail, Send, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function EmailTestPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('jason@carehomefinders.com');
  const [testResults, setTestResults] = useState<any[]>([]);
  const { toast } = useToast();

  // Test general email notification
  const testGeneralEmail = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendEmail = httpsCallable(functions, 'sendResendNotification');
      
      const result = await sendEmail({
        to: [testEmail],
        subject: '🧪 Test Email from CalAIM Tracker',
        htmlContent: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2563eb;">🧪 Test Email Successful!</h2>
                <p>This is a test email from your CalAIM Tracker system using Resend.</p>
                <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
                <div style="margin: 20px 0; padding: 15px; background-color: #ecfdf5; border-radius: 6px; border-left: 4px solid #059669;">
                  <p style="margin: 0; color: #065f46;"><strong>✅ Email system is working correctly!</strong></p>
                </div>
                <p>Your Resend integration is properly configured and ready for production use.</p>
              </div>
            </body>
          </html>
        `,
        textContent: `
🧪 TEST EMAIL SUCCESSFUL!

This is a test email from your CalAIM Tracker system using Resend.

Sent at: ${new Date().toLocaleString()}

✅ Email system is working correctly!

Your Resend integration is properly configured and ready for production use.
        `,
        memberName: 'Test Member',
        type: 'general'
      });

      const data = result.data as any;
      
      setTestResults(prev => [...prev, {
        type: 'General Email',
        success: data.success,
        message: data.message,
        resendId: data.resendId,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        title: 'Test Email Sent! 📧',
        description: `General test email sent successfully to ${testEmail}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

    } catch (error: any) {
      console.error('Error sending test email:', error);
      
      setTestResults(prev => [...prev, {
        type: 'General Email',
        success: false,
        message: error.message,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        variant: 'destructive',
        title: 'Test Email Failed',
        description: error.message || 'Could not send test email',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Test document upload notification
  const testDocumentNotification = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendDocNotification = httpsCallable(functions, 'sendDocumentUploadNotification');
      
      const result = await sendDocNotification({
        applicationId: 'test-app-123',
        memberName: 'Test Member A',
        uploaderName: 'Test Uploader',
        files: [
          { name: 'Medical_Records.pdf' },
          { name: 'Insurance_Card.jpg' },
          { name: 'ID_Document.pdf' }
        ]
      });

      const data = result.data as any;
      
      setTestResults(prev => [...prev, {
        type: 'Document Upload',
        success: data.success,
        message: data.message,
        resendId: data.resendId,
        recipients: data.recipients,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        title: 'Document Notification Sent! 📄',
        description: `Document upload notification sent to ${data.recipients} staff members`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

    } catch (error: any) {
      console.error('Error sending document notification:', error);
      
      setTestResults(prev => [...prev, {
        type: 'Document Upload',
        success: false,
        message: error.message,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        variant: 'destructive',
        title: 'Document Notification Failed',
        description: error.message || 'Could not send document notification',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Test CS Summary completion notification
  const testCsSummaryNotification = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendCsNotification = httpsCallable(functions, 'sendCsSummaryCompletionNotification');
      
      const result = await sendCsNotification({
        applicationId: 'test-app-456',
        memberName: 'Test Member B',
        referrerName: 'Test Referrer'
      });

      const data = result.data as any;
      
      setTestResults(prev => [...prev, {
        type: 'CS Summary Complete',
        success: data.success,
        message: data.message,
        resendId: data.resendId,
        recipients: data.recipients,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        title: 'CS Summary Notification Sent! 📋',
        description: `CS Summary completion notification sent to ${data.recipients} staff members`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

    } catch (error: any) {
      console.error('Error sending CS Summary notification:', error);
      
      setTestResults(prev => [...prev, {
        type: 'CS Summary Complete',
        success: false,
        message: error.message,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        variant: 'destructive',
        title: 'CS Summary Notification Failed',
        description: error.message || 'Could not send CS Summary notification',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Test Kaiser status update notification
  const testKaiserNotification = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendKaiserNotification = httpsCallable(functions, 'sendKaiserStatusUpdateNotification');
      
      const result = await sendKaiserNotification({
        applicationId: 'test-app-789',
        memberName: 'Robert Wilson',
        oldStatus: 'Pre-T2038',
        newStatus: 'T2038 Requested',
        updatedBy: 'Jason (Super Admin)'
      });

      const data = result.data as any;
      
      setTestResults(prev => [...prev, {
        type: 'Kaiser Status Update',
        success: data.success,
        message: data.message,
        resendId: data.resendId,
        recipients: data.recipients,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        title: 'Kaiser Notification Sent! 🏥',
        description: `Kaiser status update notification sent to ${data.recipients} staff members`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

    } catch (error: any) {
      console.error('Error sending Kaiser notification:', error);
      
      setTestResults(prev => [...prev, {
        type: 'Kaiser Status Update',
        success: false,
        message: error.message,
        timestamp: new Date().toLocaleString()
      }]);

      toast({
        variant: 'destructive',
        title: 'Kaiser Notification Failed',
        description: error.message || 'Could not send Kaiser notification',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email System Test Panel
          </h3>
          <p className="text-sm text-muted-foreground">
            Test your Resend email integration with different notification types
          </p>
        </div>
      </div>

      {/* Test Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
          <CardDescription>
            Configure test settings for email notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Test Email Address</label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter email address to receive test emails"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Test Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              General Email Test
            </CardTitle>
            <CardDescription>
              Test basic email functionality with a simple message
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testGeneralEmail} 
              disabled={isLoading || !testEmail}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send Test Email
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Document Upload Test
            </CardTitle>
            <CardDescription>
              Test document upload notification to staff members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testDocumentNotification} 
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
              Test Document Alert
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              CS Summary Test
            </CardTitle>
            <CardDescription>
              Test CS Summary completion notification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testCsSummaryNotification} 
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Test CS Summary Alert
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Kaiser Status Test
            </CardTitle>
            <CardDescription>
              Test Kaiser status update notification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testKaiserNotification} 
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Test Kaiser Alert
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Test Results</CardTitle>
                <CardDescription>
                  Results from email notification tests
                </CardDescription>
              </div>
              <Button onClick={clearResults} variant="outline" size="sm">
                Clear Results
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    result.success 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">{result.type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {result.timestamp}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{result.message}</p>
                  {result.resendId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Resend ID: {result.resendId}
                    </p>
                  )}
                  {result.recipients && (
                    <p className="text-xs text-muted-foreground">
                      Recipients: {result.recipients}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <p className="mb-3"><strong>Testing your email system:</strong></p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Enter your email address in the test configuration</li>
              <li>Click any of the test buttons to send different types of notifications</li>
              <li>Check your email inbox for the test messages</li>
              <li>Review the test results below for success/failure status</li>
            </ol>
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> The document, CS Summary, and Kaiser status tests will send notifications to all staff members with email notifications enabled, not just your test email address.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}