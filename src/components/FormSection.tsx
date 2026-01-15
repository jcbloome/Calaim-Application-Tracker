import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function FormSection({
  title,
  description,
  icon: Icon,
  badge,
  badgeVariant = 'outline',
  children,
  className = "",
  required = false,
  collapsible = false,
  defaultCollapsed = false
}: FormSectionProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  return (
    <Card className={cn("border-l-4 border-accent", className)}>
      <CardHeader 
        className={cn(
          "pb-4",
          collapsible && "cursor-pointer hover:bg-muted/50 transition-colors"
        )}
        onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="h-5 w-5 text-primary" />}
            <div>
              <CardTitle className="flex items-center gap-2">
                {title}
                {required && <span className="text-destructive">*</span>}
              </CardTitle>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {badge && (
              <Badge variant={badgeVariant} className="text-xs">
                {badge}
              </Badge>
            )}
            {collapsible && (
              <div className="text-muted-foreground">
                {isCollapsed ? '▶' : '▼'}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      {(!collapsible || !isCollapsed) && (
        <CardContent className="space-y-4">
          {children}
        </CardContent>
      )}
    </Card>
  );
}