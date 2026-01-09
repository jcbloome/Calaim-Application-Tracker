'use client';

import { useToast } from '@/hooks/use-toast';
import { CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface EnhancedToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

export function useEnhancedToast() {
  const { toast } = useToast();

  const showToast = ({ title, description, type = 'info', duration }: EnhancedToastOptions) => {
    const icons = {
      success: CheckCircle,
      error: AlertCircle,
      warning: AlertTriangle,
      info: Info,
    };

    const variants = {
      success: 'default' as const,
      error: 'destructive' as const,
      warning: 'default' as const,
      info: 'default' as const,
    };

    const Icon = icons[type];

    toast({
      title: (
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${
            type === 'success' ? 'text-green-500' :
            type === 'error' ? 'text-destructive' :
            type === 'warning' ? 'text-yellow-500' :
            'text-blue-500'
          }`} />
          {title}
        </div>
      ),
      description,
      variant: variants[type],
      duration,
    });
  };

  return {
    success: (title: string, description?: string, duration?: number) =>
      showToast({ title, description, type: 'success', duration }),
    error: (title: string, description?: string, duration?: number) =>
      showToast({ title, description, type: 'error', duration }),
    warning: (title: string, description?: string, duration?: number) =>
      showToast({ title, description, type: 'warning', duration }),
    info: (title: string, description?: string, duration?: number) =>
      showToast({ title, description, type: 'info', duration }),
  };
}