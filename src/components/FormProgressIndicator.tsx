import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  name: string;
  fields?: string[];
}

interface FormProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps?: number[];
  className?: string;
}

export function FormProgressIndicator({ 
  steps, 
  currentStep, 
  completedSteps = [], 
  className = "" 
}: FormProgressIndicatorProps) {
  return (
    <div className={cn("w-full", className)}>
      {/* Mobile Progress Bar */}
      <div className="md:hidden mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">
            Step {currentStep} of {steps.length}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {Math.round((currentStep / steps.length) * 100)}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          />
        </div>
        <p className="text-sm font-medium mt-2">
          {steps.find(step => step.id === currentStep)?.name}
        </p>
      </div>

      {/* Desktop Step Indicator */}
      <div className="hidden md:block">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {steps.map((step, stepIdx) => {
              const isCompleted = completedSteps.includes(step.id) || step.id < currentStep;
              const isCurrent = step.id === currentStep;
              
              return (
                <li key={step.id} className="flex-1">
                  <div className="flex items-center">
                    <div className="flex items-center">
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border-2",
                        isCompleted 
                          ? "bg-primary border-primary text-primary-foreground" 
                          : isCurrent 
                          ? "border-primary text-primary bg-primary/10" 
                          : "border-muted-foreground text-muted-foreground"
                      )}>
                        {isCompleted ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <span className="text-sm font-semibold">{step.id}</span>
                        )}
                      </div>
                      <div className="ml-3 min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-medium",
                          isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {step.name}
                        </p>
                      </div>
                    </div>
                    {stepIdx < steps.length - 1 && (
                      <div className="flex-1 mx-4">
                        <div className={cn(
                          "h-0.5 w-full",
                          isCompleted ? "bg-primary" : "bg-muted"
                        )} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}