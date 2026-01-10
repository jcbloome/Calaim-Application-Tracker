'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase';
import { 
  Shield, 
  Mail, 
  MessageSquare, 
  Loader2, 
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TwoFactorAuthProps {
  onVerificationComplete: () => void;
  required?: boolean;
}

interface TwoFactorStatus {
  isVerified: boolean;
  sessionExpiry?: string;
  requiresVerification: boolean;
  preferredMethod: 'email' | 'sms';
  email?: string;
  phone?: string;
}

export function TwoFactorAuth({ onVerificationComplete, required = false }: TwoFactorAuthProps) {
  const [step, setStep] = useState<'check' | 'method' | 'code' | 'verified'>('check');
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'email' | 'sms'>('email');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const { toast } = useToast();
  const { user } = useUser();

  // Check 2FA status on mount
  useEffect(() => {
    checkTwoFactorStatus();
  }, []);

  // Countdown timer for code expiry
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const checkTwoFactorStatus = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const check2FA = httpsCallable(functions, 'check2FAStatus');
      
      const result = await check2FA({});
      const data = result.data as any;
      
      if (data.success) {
        setStatus(data);
        setSelectedMethod(data.preferredMethod);
        setPhone(data.phone || '');
        
        if (data.isVerified) {
          setStep('verified');
          onVerificationComplete();
        } else if (data.requiresVerification) {
          setStep('method');
        }
      }
    } catch (error: any) {
      console.error('Error checking 2FA status:', error);
      toast({
        variant: 'destructive',
        title: '2FA Check Failed',
        description: 'Could not verify authentication status',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendVerificationCode = async () => {
    setIsSending(true);
    try {
      const functions = getFunctions();
      const send2FA = httpsCallable(functions, 'send2FACode');
      
      const contact = selectedMethod === 'email' ? status?.email : phone;
      
      if (!contact) {
        toast({
          variant: 'destructive',
          title: 'Contact Required',
          description: selectedMethod === 'email' ? 'Email address required' : 'Phone number required',
        });
        return;
      }
      
      const result = await send2FA({
        method: selectedMethod,
        contact: contact
      });
      
      const data = result.data as any;
      
      if (data.success) {
        setStep('code');
        setTimeLeft(data.expiresIn || 600);
        
        toast({
          title: 'Code Sent',
          description: `Verification code sent via ${selectedMethod}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error.message || 'Could not send verification code',
      });
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = async () => {
    if (!code || code.length !== 6) {
      toast({
        variant: 'destructive',
        title: 'Invalid Code',
        description: 'Please enter a 6-digit verification code',
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const verify2FA = httpsCallable(functions, 'verify2FACode');
      
      const result = await verify2FA({ code });
      const data = result.data as any;
      
      if (data.success) {
        setStep('verified');
        
        toast({
          title: 'Verification Successful',
          description: 'Two-factor authentication completed',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        onVerificationComplete();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: error.message || 'Invalid verification code',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = async () => {
    try {
      const functions = getFunctions();
      const updatePrefs = httpsCallable(functions, 'update2FAPreferences');
      
      await updatePrefs({
        preferredMethod: selectedMethod,
        phone: selectedMethod === 'sms' ? phone : undefined
      });
      
      toast({
        title: 'Preferences Updated',
        description: '2FA preferences saved successfully',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error updating preferences:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading && step === 'check') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking authentication status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'verified') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            Authentication Verified
          </CardTitle>
          <CardDescription>
            Your session is secure until {status?.sessionExpiry ? new Date(status.sessionExpiry).toLocaleString() : 'tomorrow'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-sm text-muted-foreground">
            You're all set! Two-factor authentication is active.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          {required ? 'Two-factor authentication is required to continue' : 'Secure your account with two-factor authentication'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'method' && (
          <>
            <div className="space-y-4">
              <Label>Choose verification method:</Label>
              <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as 'email' | 'sms')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer">
                    <Mail className="h-4 w-4" />
                    Email ({status?.email})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sms" id="sms" />
                  <Label htmlFor="sms" className="flex items-center gap-2 cursor-pointer">
                    <MessageSquare className="h-4 w-4" />
                    SMS
                  </Label>
                </div>
              </RadioGroup>
              
              {selectedMethod === 'sms' && (
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              )}
            </div>
            
            <Button 
              onClick={() => {
                updatePreferences();
                sendVerificationCode();
              }}
              disabled={isSending || (selectedMethod === 'sms' && !phone)}
              className="w-full"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Code...
                </>
              ) : (
                `Send Code via ${selectedMethod === 'email' ? 'Email' : 'SMS'}`
              )}
            </Button>
          </>
        )}

        {step === 'code' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="code">Enter 6-digit verification code</Label>
              <Input
                id="code"
                type="text"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-lg tracking-widest"
                maxLength={6}
              />
            </div>
            
            {timeLeft > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Code expires in {formatTime(timeLeft)}</span>
              </div>
            )}
            
            {timeLeft === 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Code has expired. Please request a new one.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={verifyCode}
                disabled={isLoading || !code || code.length !== 6 || timeLeft === 0}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => setStep('method')}
                disabled={isLoading}
              >
                Back
              </Button>
            </div>
            
            {timeLeft === 0 && (
              <Button 
                variant="outline"
                onClick={sendVerificationCode}
                disabled={isSending}
                className="w-full"
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send New Code'
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}