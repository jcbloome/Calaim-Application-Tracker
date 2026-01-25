'use client';

import React from 'react';
import { PrintableCsSummaryForm } from './PrintableCsSummaryForm';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableCsSummaryFormSpanishProps {
  data?: Partial<FormValues>;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableCsSummaryFormSpanish(props: PrintableCsSummaryFormSpanishProps) {
  return React.createElement(PrintableCsSummaryForm, props as any);
}
