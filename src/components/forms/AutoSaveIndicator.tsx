'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface AutoSaveIndicatorProps {
  status: SaveStatus;
  lastSaved?: Date;
  className?: string;
}

export function AutoSaveIndicator({ status, lastSaved, className }: AutoSaveIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="h-3 w-3" />,
        text: 'Offline',
        variant: 'secondary' as const,
        className: 'bg-gray-500 text-white'
      };
    }

    switch (status) {
      case 'saving':
        return {
          icon: <Clock className="h-3 w-3 animate-spin" />,
          text: 'Saving...',
          variant: 'secondary' as const,
          className: 'bg-blue-500 text-white'
        };
      case 'saved':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          text: lastSaved ? `Saved ${formatTime(lastSaved)}` : 'Saved',
          variant: 'secondary' as const,
          className: 'bg-green-500 text-white'
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Save failed',
          variant: 'destructive' as const,
          className: 'bg-red-500 text-white'
        };
      default:
        return {
          icon: <Wifi className="h-3 w-3" />,
          text: 'Ready',
          variant: 'outline' as const,
          className: ''
        };
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const config = getStatusConfig();

  return (
    <Badge 
      variant={config.variant}
      className={cn(
        'flex items-center gap-1 text-xs font-medium transition-all duration-200',
        config.className,
        className
      )}
    >
      {config.icon}
      {config.text}
    </Badge>
  );
}

/**
 * Hook for managing auto-save functionality
 */
export function useAutoSave<T>(
  data: T,
  saveFunction: (data: T) => Promise<void>,
  options: {
    delay?: number;
    enabled?: boolean;
  } = {}
) {
  const { delay = 2000, enabled = true } = options;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date>();

  useEffect(() => {
    if (!enabled || !data) return;

    const timeoutId = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await saveFunction(data);
        setSaveStatus('saved');
        setLastSaved(new Date());
      } catch (error) {
        setSaveStatus('error');
        console.error('Auto-save failed:', error);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [data, saveFunction, delay, enabled]);

  return { saveStatus, lastSaved };
}