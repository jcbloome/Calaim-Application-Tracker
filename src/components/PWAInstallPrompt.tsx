'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  Monitor, 
  Bell, 
  X, 
  Smartphone,
  Laptop,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is already installed/running in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
                              (window.navigator as any).standalone ||
                              document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show install prompt if not already installed and user hasn't dismissed it recently
      const lastDismissed = localStorage.getItem('pwa-install-dismissed');
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      
      if (!lastDismissed || parseInt(lastDismissed) < oneDayAgo) {
        setShowInstallPrompt(true);
      }
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
      
      // Show success notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🎉 CalAIM Tracker Installed!', {
          body: 'The app is now available in your system tray and desktop.',
          icon: '/favicon.ico',
          tag: 'pwa-installed'
        });
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('🎉 PWA installation accepted');
      } else {
        console.log('❌ PWA installation dismissed');
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
      }
      
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Error during PWA installation:', error);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already in standalone mode or installed
  if (isStandalone || isInstalled || !showInstallPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50 mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-full">
              <Download className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-blue-800">Install CalAIM Tracker</CardTitle>
              <CardDescription className="text-blue-700">
                Add to your desktop and system tray for always-on notifications
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <Monitor className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-sm text-blue-800">Desktop App</p>
                <p className="text-xs text-blue-700">Runs like a native application</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Bell className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-sm text-blue-800">System Tray</p>
                <p className="text-xs text-blue-700">Always-on notifications</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-sm text-blue-800">Offline Ready</p>
                <p className="text-xs text-blue-700">Works without internet</p>
              </div>
            </div>
          </div>

          {/* Install Instructions */}
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-800 mb-2">What happens when you install:</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• App appears in your Start Menu / Applications folder</li>
              <li>• Desktop shortcut created for quick access</li>
              <li>• System tray integration for background notifications</li>
              <li>• Faster loading and offline capability</li>
              <li>• Dedicated window (no browser tabs needed)</li>
            </ul>
          </div>

          {/* Install Button */}
          <div className="flex space-x-3">
            <Button onClick={handleInstallClick} className="bg-blue-600 hover:bg-blue-700">
              <Download className="mr-2 h-4 w-4" />
              Install App
            </Button>
            <Button variant="outline" onClick={handleDismiss}>
              Maybe Later
            </Button>
          </div>

          {/* Platform Detection */}
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {navigator.userAgent.includes('Windows') ? (
                <>
                  <Laptop className="mr-1 h-3 w-3" />
                  Windows
                </>
              ) : navigator.userAgent.includes('Mac') ? (
                <>
                  <Laptop className="mr-1 h-3 w-3" />
                  macOS
                </>
              ) : navigator.userAgent.includes('Android') ? (
                <>
                  <Smartphone className="mr-1 h-3 w-3" />
                  Android
                </>
              ) : (
                <>
                  <Monitor className="mr-1 h-3 w-3" />
                  Desktop
                </>
              )}
            </Badge>
            <span className="text-xs text-blue-600">Compatible with your device</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Standalone status component for when app is installed
export function PWAStatusIndicator() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
                              (window.navigator as any).standalone ||
                              document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
  }, []);

  if (!isStandalone) return null;

  return (
    <Badge className="bg-green-100 text-green-800 border-green-200">
      <CheckCircle className="mr-1 h-3 w-3" />
      App Mode
    </Badge>
  );
}