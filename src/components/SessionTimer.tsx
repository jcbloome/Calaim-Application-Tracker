'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/firebase';
import { usePathname } from 'next/navigation';
import { Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SessionTimerProps {
  className?: string;
  compact?: boolean;
}

export function SessionTimer({ className = '', compact = false }: SessionTimerProps) {
  const auth = useAuth();
  const pathname = usePathname();
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Different timeout settings based on user type
  const isAdminArea = pathname.startsWith('/admin');
  const timeoutMinutes = isAdminArea ? 30 : 60; // Match AutoLogoutProvider settings
  const warningThreshold = isAdminArea ? 5 : 10; // When to show warning

  // Update activity tracker
  useEffect(() => {
    const updateActivity = () => {
      setLastActivity(Date.now());
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click', 'keydown'];
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, []);

  // Update remaining time every second
  useEffect(() => {
    if (!auth?.currentUser) {
      setRemainingTime(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivity;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const remaining = Math.max(0, timeoutMs - elapsed);
      setRemainingTime(Math.floor(remaining / 1000 / 60)); // Convert to minutes
    }, 1000);

    return () => clearInterval(interval);
  }, [auth?.currentUser, lastActivity, timeoutMinutes]);

  // Don't show if user is not logged in
  if (!auth?.currentUser) {
    return null;
  }

  const isWarning = remainingTime <= warningThreshold;
  const isCritical = remainingTime <= 2;

  const extendSession = () => {
    setLastActivity(Date.now());
  };

  const formatTime = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
    return `${minutes}m`;
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <Clock className="h-4 w-4" />
        <Badge 
          variant={isCritical ? "destructive" : isWarning ? "secondary" : "outline"}
          className="font-mono"
        >
          {formatTime(remainingTime)}
        </Badge>
        {isWarning && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={extendSession}
            className="h-6 px-2 text-xs"
          >
            Extend
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={`${className} ${isWarning ? 'border-orange-200 bg-orange-50' : ''} ${isCritical ? 'border-red-200 bg-red-50' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isWarning ? (
              <AlertTriangle className={`h-4 w-4 ${isCritical ? 'text-red-500' : 'text-orange-500'}`} />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              Session: {formatTime(remainingTime)}
            </span>
          </div>
          
          {isWarning && (
            <Button 
              size="sm" 
              variant={isCritical ? "destructive" : "secondary"}
              onClick={extendSession}
              className="h-7 px-3 text-xs"
            >
              Extend Session
            </Button>
          )}
        </div>
        
        {isWarning && (
          <p className="text-xs text-muted-foreground mt-1">
            {isCritical 
              ? "Your session will expire very soon due to inactivity!"
              : `Your session will expire in ${remainingTime} minutes due to inactivity.`
            }
          </p>
        )}
      </CardContent>
    </Card>
  );
}