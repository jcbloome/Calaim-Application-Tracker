'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import QRCode from 'qrcode';
import { 
  Shield, 
  Mail, 
  KeyRound, 
  Loader2, 
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy
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
  pendingCode?: boolean;
  pendingCodeExpiresAt?: string;
  preferredMethod: 'email' | 'totp';
  totpEnabled?: boolean;
  email?: string;
}

interface TotpSetupState {
  secret: string;
  otpauthUrl: string;
  alreadyEnabled: boolean;
}

export function TwoFactorAuth({ onVerificationComplete, required = false }: TwoFactorAuthProps) {
  const [step, setStep] = useState<'check' | 'method' | 'code' | 'verified'>('check');
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'email' | 'totp'>('email');
  const [totpSetup, setTotpSetup] = useState<TotpSetupState | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpQrError, setTotpQrError] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const { toast } = useToast();

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

  // Build a scannable QR code for authenticator setup.
  useEffect(() => {
    let cancelled = false;
    const buildQr = async () => {
      const url = String(totpSetup?.otpauthUrl || '').trim();
      if (!url) {
        setTotpQrDataUrl('');
        setTotpQrError('');
        return;
      }
      try {
        const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
        if (cancelled) return;
        setTotpQrDataUrl(dataUrl);
        setTotpQrError('');
      } catch {
        if (cancelled) return;
        setTotpQrDataUrl('');
        setTotpQrError('Could not generate QR code. Use the manual key below.');
      }
    };
    void buildQr();
    return () => {
      cancelled = true;
    };
  }, [totpSetup?.otpauthUrl]);

  const checkTwoFactorStatus = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const check2FA = httpsCallable(functions, 'check2FAStatus');
      
      const result = await check2FA({});
      const data = result.data as any;
      
      if (data.success) {
        setStatus(data);
        setSelectedMethod(data.preferredMethod === 'totp' ? 'totp' : 'email');
        
        if (data.isVerified) {
          setStep('verified');
          onVerificationComplete();
        } else if (data.pendingCode) {
          setStep('code');
          const expiryIso = String(data.pendingCodeExpiresAt || '').trim();
          if (expiryIso) {
            const remaining = Math.max(0, Math.floor((new Date(expiryIso).getTime() - Date.now()) / 1000));
            setTimeLeft(remaining);
          } else {
            setTimeLeft(0);
          }
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

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copied`,
        description: `The ${label.toLowerCase()} is ready to paste.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: `Please copy the ${label.toLowerCase()} manually.`,
      });
    }
  };

  const openAuthenticatorApp = (otpauthUrl: string) => {
    const url = String(otpauthUrl || '').trim();
    if (!url) {
      toast({
        variant: 'destructive',
        title: 'Missing setup link',
        description: 'Use the manual key if the setup link is unavailable.',
      });
      return;
    }
    window.location.href = url;
  };

  const startAuthenticatorSetup = async (): Promise<boolean> => {
    setIsSending(true);
    try {
      const functions = getFunctions();
      const setupTotp = httpsCallable(functions, 'setup2FATOTP');
      const result = await setupTotp({});
      const data = result.data as any;

      if (!data?.success || !data.secret || !data.otpauthUrl) {
        toast({
          variant: 'destructive',
          title: 'Setup Failed',
          description: 'Could not initialize Google Authenticator setup.',
        });
        return false;
      }

      setTotpSetup({
        secret: String(data.secret),
        otpauthUrl: String(data.otpauthUrl),
        alreadyEnabled: Boolean(data.alreadyEnabled),
      });
      setStep('code');
      setTimeLeft(0);
      return true;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Setup Failed',
        description: String(error?.details || error?.message || 'Unable to start Authenticator setup'),
      });
      return false;
    } finally {
      setIsSending(false);
    }
  };

  const sendVerificationCode = async () => {
    setIsSending(true);
    try {
      const functions = getFunctions();
      const send2FA = httpsCallable(functions, 'send2FACode');
      const contact = status?.email;
      
      if (!contact) {
        toast({
          variant: 'destructive',
          title: 'Contact Required',
          description: 'Email address required',
        });
        return;
      }
      
      const result = await send2FA({
        method: 'email',
        contact: contact
      });
      
      const data = result.data as any;
      
      if (data.success) {
        setStep('code');
        setTimeLeft(data.expiresIn || 600);
        
        toast({
          title: 'Code Sent',
          description: 'Verification code sent via email',
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
      
      const result = await verify2FA({ code, method: selectedMethod });
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
      const details = String(error?.details || '').trim();
      const message = String(error?.message || '').trim();
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: details || message || 'Invalid verification code',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = async (): Promise<boolean> => {
    try {
      const functions = getFunctions();
      const updatePrefs = httpsCallable(functions, 'update2FAPreferences');
      
      await updatePrefs({
        preferredMethod: selectedMethod
      });
      
      toast({
        title: 'Preferences Updated',
        description: '2FA preferences saved successfully',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      return true;
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      toast({
        variant: 'destructive',
        title: 'Preferences failed',
        description: String(error?.details || error?.message || 'Could not save 2FA preferences'),
      });
      return false;
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
              <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as 'email' | 'totp')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer">
                    <Mail className="h-4 w-4" />
                    Email ({status?.email})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="totp" id="totp" />
                  <Label htmlFor="totp" className="flex items-center gap-2 cursor-pointer">
                    <KeyRound className="h-4 w-4" />
                    Google Authenticator App
                  </Label>
                </div>
              </RadioGroup>
              {selectedMethod === 'totp' && (
                <p className="text-xs text-muted-foreground">
                  Use a free authenticator app like Google Authenticator for rotating 6-digit codes.
                </p>
              )}
            </div>
            
            <Button 
              onClick={async () => {
                const ok = await updatePreferences();
                if (!ok) return;
                if (selectedMethod === 'email') {
                  await sendVerificationCode();
                } else {
                  await startAuthenticatorSetup();
                }
              }}
              disabled={isSending}
              className="w-full"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Code...
                </>
              ) : (
                selectedMethod === 'email' ? 'Send Code via Email' : 'Continue with Google Authenticator'
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

            {selectedMethod === 'totp' && totpSetup && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p>
                      {totpSetup.alreadyEnabled
                        ? 'Enter the current code from Google Authenticator.'
                        : 'Add this account in Google Authenticator, then enter the current code.'}
                    </p>
                    {!totpSetup.alreadyEnabled && (
                      <>
                        {totpQrDataUrl ? (
                          <div className="rounded border bg-white p-2 w-fit">
                            <img src={totpQrDataUrl} alt="Authenticator setup QR code" className="h-[180px] w-[180px]" />
                          </div>
                        ) : null}
                        {totpQrError ? (
                          <p className="text-xs text-amber-700">{totpQrError}</p>
                        ) : null}
                        <div className="rounded border bg-background p-2 text-xs break-all">
                          <strong>Manual key:</strong> {totpSetup.secret}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openAuthenticatorApp(totpSetup.otpauthUrl)}
                          >
                            Open in Authenticator
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => copyToClipboard(totpSetup.secret, 'Manual key')}>
                            <Copy className="mr-1 h-3 w-3" />
                            Copy Key
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => copyToClipboard(totpSetup.otpauthUrl, 'Setup URL')}>
                            <Copy className="mr-1 h-3 w-3" />
                            Copy Setup URL
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            {selectedMethod === 'email' && timeLeft > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Code expires in {formatTime(timeLeft)}</span>
              </div>
            )}
            
            {selectedMethod === 'email' && timeLeft === 0 && (
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
                disabled={isLoading || !code || code.length !== 6 || (selectedMethod === 'email' && timeLeft === 0)}
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
            
            {selectedMethod === 'email' && timeLeft === 0 && (
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