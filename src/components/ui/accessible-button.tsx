'use client';

import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccessibleButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const AccessibleButton = React.forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  ({ 
    children, 
    loading = false, 
    loadingText, 
    icon, 
    iconPosition = 'left',
    disabled,
    className,
    ...props 
  }, ref) => {
    const isDisabled = disabled || loading;
    
    return (
      <Button
        ref={ref}
        disabled={isDisabled}
        className={cn(className)}
        aria-busy={loading}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {loadingText || 'Loading...'}
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <span className="mr-2" aria-hidden="true">{icon}</span>
            )}
            {children}
            {icon && iconPosition === 'right' && (
              <span className="ml-2" aria-hidden="true">{icon}</span>
            )}
          </>
        )}
      </Button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';