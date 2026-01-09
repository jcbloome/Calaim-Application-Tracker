'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  HelpCircle, 
  Save,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { AutoSaveIndicator, useAutoSave } from './AutoSaveIndicator';
import { cn } from '@/lib/utils';

interface FormStep {
  id: number;
  name: string;
  fields: string[];
  description?: string;
  helpText?: string;
}

interface SmartFormStepProps {
  step: FormStep;
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
  errors: Record<string, any>;
  values: Record<string, any>;
  onNext: () => void;
  onPrevious: () => void;
  onSave: (data: any) => Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export function SmartFormStep({
  step,
  currentStep,
  totalSteps,
  children,
  errors,
  values,
  onNext,
  onPrevious,
  onSave,
  isSubmitting = false,
  className
}: SmartFormStepProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [completedFields, setCompletedFields] = useState<string[]>([]);

  // Auto-save functionality
  const { saveStatus, lastSaved } = useAutoSave(values, onSave, {
    delay: 3000,
    enabled: true
  });

  // Calculate step completion
  useEffect(() => {
    const completed = step.fields.filter(field => {
      const value = values[field];
      return value !== undefined && value !== null && value !== '';
    });
    setCompletedFields(completed);
  }, [values, step.fields]);

  const completionPercentage = Math.round((completedFields.length / step.fields.length) * 100);
  const hasErrors = step.fields.some(field => errors[field]);
  const isComplete = completionPercentage === 100 && !hasErrors;

  const getStepStatus = () => {
    if (hasErrors) return 'error';
    if (isComplete) return 'complete';
    if (completedFields.length > 0) return 'in-progress';
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-green-600 bg-green-50 border-green-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'in-progress': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const status = getStepStatus();

  return (
    <Card className={cn('relative', className)}>
      {/* Step Header */}
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2 rounded-full ${getStatusColor(status)} shrink-0`}>
              {status === 'complete' && <CheckCircle className="h-5 w-5" />}
              {status === 'error' && <AlertTriangle className="h-5 w-5" />}
              {status === 'in-progress' && <div className="h-5 w-5 rounded-full bg-current opacity-60" />}
              {status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-current" />}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg sm:text-xl leading-tight">
                <span className="block sm:hidden">Step {currentStep}/{totalSteps}</span>
                <span className="hidden sm:block">Step {currentStep} of {totalSteps}: {step.name}</span>
                <span className="block sm:hidden text-base font-medium mt-1">{step.name}</span>
              </CardTitle>
              {step.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 sm:line-clamp-none">
                  {step.description}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-start sm:self-center">
            <AutoSaveIndicator status={saveStatus} lastSaved={lastSaved} />
            {step.helpText && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(!showHelp)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="ml-1 hidden xs:inline">Help</span>
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Step Progress</span>
            <span>{completedFields.length}/{step.fields.length} fields completed</span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </div>

        {/* Help Text */}
        {showHelp && step.helpText && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{step.helpText}</AlertDescription>
          </Alert>
        )}

        {/* Error Summary */}
        {hasErrors && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Please correct the errors below before proceeding.
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>

      {/* Step Content */}
      <CardContent className="space-y-6">
        {children}
      </CardContent>

      {/* Step Navigation */}
      <div className="border-t p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <Button
            variant="outline"
            onClick={onPrevious}
            disabled={currentStep === 1}
            className="order-2 sm:order-1 w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="flex flex-col xs:flex-row items-center gap-3 order-1 sm:order-2">
            <Badge variant="outline" className="shrink-0">
              {completionPercentage}% Complete
            </Badge>
            
            {currentStep < totalSteps ? (
              <Button
                onClick={onNext}
                disabled={hasErrors}
                className="w-full xs:w-auto min-w-24"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={onNext}
                disabled={hasErrors || isSubmitting}
                className="w-full xs:w-auto min-w-32"
              >
                {isSubmitting ? (
                  <>
                    <Save className="h-4 w-4 mr-2 animate-spin" />
                    <span className="hidden xs:inline">Submitting...</span>
                    <span className="xs:hidden">Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Complete Application</span>
                    <span className="sm:hidden">Complete</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}