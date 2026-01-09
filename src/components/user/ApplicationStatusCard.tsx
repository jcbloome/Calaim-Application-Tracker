'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Upload, 
  Eye,
  Edit,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import type { Application } from '@/lib/definitions';

interface ApplicationStatusCardProps {
  application: Application;
  showActions?: boolean;
}

export function ApplicationStatusCard({ application, showActions = true }: ApplicationStatusCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed & Submitted': return 'bg-green-500';
      case 'Approved': return 'bg-blue-500';
      case 'In Progress': return 'bg-yellow-500';
      case 'Requires Revision': return 'bg-red-500';
      case 'Incomplete': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed & Submitted': return <CheckCircle className="h-4 w-4" />;
      case 'Approved': return <CheckCircle className="h-4 w-4" />;
      case 'In Progress': return <Clock className="h-4 w-4" />;
      case 'Requires Revision': return <AlertTriangle className="h-4 w-4" />;
      case 'Incomplete': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const calculateProgress = () => {
    if (!application.forms) return 0;
    const completed = application.forms.filter(form => form.status === 'Completed').length;
    return Math.round((completed / application.forms.length) * 100);
  };

  const getNextSteps = () => {
    if (!application.forms) return [];
    return application.forms
      .filter(form => form.status === 'Pending')
      .slice(0, 3)
      .map(form => form.name);
  };

  const progress = calculateProgress();
  const nextSteps = getNextSteps();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-lg leading-tight">
            {application.memberFirstName} {application.memberLastName}
          </CardTitle>
          <Badge 
            variant="secondary" 
            className={`${getStatusColor(application.status)} text-white self-start sm:self-center shrink-0`}
          >
            <span className="flex items-center gap-1">
              {getStatusIcon(application.status)}
              <span className="hidden xs:inline">{application.status}</span>
              <span className="xs:hidden">{application.status.split(' ')[0]}</span>
            </span>
          </Badge>
        </div>
        <div className="flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {application.lastUpdated 
                ? format(application.lastUpdated.toDate(), 'MMM dd, yyyy')
                : 'Not updated'
              }
            </span>
          </span>
          <span className="truncate">Pathway: {application.pathway}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Next Steps */}
        {nextSteps.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Next Steps:</h4>
            <ul className="space-y-1">
              {nextSteps.map((step, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        {showActions && (
          <div className="flex flex-col xs:flex-row gap-2 pt-2">
            <Button asChild size="sm" variant="outline" className="flex-1 xs:flex-none">
              <Link href={`/pathway?applicationId=${application.id}`}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Link>
            </Button>
            
            {application.status === 'Incomplete' && (
              <Button asChild size="sm" className="flex-1 xs:flex-none">
                <Link href={`/forms/cs-summary-form?applicationId=${application.id}`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Continue Form
                </Link>
              </Button>
            )}

            {application.status === 'Requires Revision' && (
              <Button asChild size="sm" variant="destructive" className="flex-1 xs:flex-none">
                <Link href={`/forms/cs-summary-form?applicationId=${application.id}`}>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Fix Issues
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}