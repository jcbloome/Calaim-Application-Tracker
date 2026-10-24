'use client';

import { Button } from '@/components/ui/button';
import { Loader2, FileText, RotateCcw } from 'lucide-react';

export interface CreateApplicationSubmitBarProps {
  createApplicationForMember: (options?: { skipNavigate?: boolean | undefined; suppressSuccessToast?: boolean | undefined; } | undefined) => Promise<string | null>;
  isCreating: boolean;
  isFormValid: boolean;
  intakeType: "standard" | "kaiser_auth_received_via_ils";
  resetAllCreateFields: () => void;
}

export function CreateApplicationSubmitBar({
  createApplicationForMember,
  isCreating,
  isFormValid,
  intakeType,
  resetAllCreateFields,
}: CreateApplicationSubmitBarProps) {
  return (
    <div className="sticky bottom-3 z-20 space-y-2 rounded-lg border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <Button 
        onClick={() => createApplicationForMember()}
        disabled={isCreating || !isFormValid}
        className="w-full"
        size="lg"
      >
        {isCreating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating Application...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            {intakeType === 'kaiser_auth_received_via_ils'
              ? 'Create Kaiser Skeleton Application'
              : 'Create Application & Continue to CS Summary Form'}
          </>
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={resetAllCreateFields}
        disabled={isCreating}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Reset Form (Start Over)
      </Button>
      <p className="text-center text-xs text-muted-foreground">Shortcut: Ctrl/Cmd + S to create application</p>
    </div>
  );
}
