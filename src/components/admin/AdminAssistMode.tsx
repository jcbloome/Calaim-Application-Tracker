'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  UserCheck, 
  LogOut, 
  Shield, 
  User, 
  AlertTriangle,
  Info,
  Phone,
  Monitor
} from 'lucide-react';
import { useSessionIsolation } from '@/hooks/use-session-isolation';
import { useAdmin } from '@/hooks/use-admin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface AdminAssistModeProps {
  onStartAssisting: (memberInfo: { name: string; email: string }) => void;
  isAssisting: boolean;
  assistingMember?: { name: string; email: string };
}

export function AdminAssistMode({ onStartAssisting, isAssisting, assistingMember }: AdminAssistModeProps) {
  const [showAssistDialog, setShowAssistDialog] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const { switchToUserMode, switchToAdminMode } = useSessionIsolation('admin');
  const { user } = useAdmin();

  const handleStartAssisting = () => {
    if (memberName && memberEmail) {
      onStartAssisting({ name: memberName, email: memberEmail });
      setShowAssistDialog(false);
      // Switch to user mode for form filling
      switchToUserMode();
    }
  };

  const handleStopAssisting = () => {
    // This would typically save any progress and return to admin mode
    switchToAdminMode();
  };

  return (
    <div className="space-y-4">
      {/* Current Mode Indicator */}
      <Card className={isAssisting ? 'border-blue-500 bg-blue-50' : 'border-green-500 bg-green-50'}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isAssisting ? (
                <>
                  <User className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Assisting Member</p>
                    <p className="text-sm text-blue-700">
                      Helping {assistingMember?.name} with their application
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Admin Mode</p>
                    <p className="text-sm text-green-700">
                      Logged in as {user?.displayName || 'Administrator'}
                    </p>
                  </div>
                </>
              )}
            </div>
            
            <Badge variant={isAssisting ? 'default' : 'secondary'}>
              {isAssisting ? 'User Assist Mode' : 'Admin Mode'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Session Isolation Warning */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Session Isolation Active:</strong> Switching between admin and user modes will 
          automatically sign you out to prevent session crossover. Your progress will be saved.
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!isAssisting ? (
          <Dialog open={showAssistDialog} onOpenChange={setShowAssistDialog}>
            <DialogTrigger asChild>
              <Button className="flex-1">
                <UserCheck className="h-4 w-4 mr-2" />
                Assist Member with Application
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start Member Assistance</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    You'll be switched to user mode to help fill out the CS Summary Form. 
                    Your admin session will be safely terminated.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Member Name</label>
                    <input
                      type="text"
                      className="w-full mt-1 p-2 border rounded-md"
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      placeholder="Enter member's full name"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Member Email (Optional)</label>
                    <input
                      type="email"
                      className="w-full mt-1 p-2 border rounded-md"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder="member@example.com"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAssistDialog(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleStartAssisting}
                    disabled={!memberName}
                    className="flex-1"
                  >
                    Start Assistance
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Button onClick={handleStopAssisting} variant="outline" className="flex-1">
            <LogOut className="h-4 w-4 mr-2" />
            Return to Admin Mode
          </Button>
        )}
      </div>

      {/* Help Text */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Member Assistance Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Always verify member identity before starting assistance</li>
            <li>Explain each step of the form as you fill it out together</li>
            <li>Let the member provide all information - don't assume details</li>
            <li>Save progress frequently in case of technical issues</li>
            <li>Review all information with the member before submitting</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}