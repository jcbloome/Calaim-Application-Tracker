'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableWaiversFormSpanishProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableWaiversFormSpanish({
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true
}: PrintableWaiversFormSpanishProps) {
  return (
    <PrintableFormLayout
      title="Exenciones y Autorizaciones"
      subtitle="HIPAA, Responsabilidad Civil y Libertad de Elección"
      formType="waivers"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Formulario de Exenciones y Autorizaciones (Versión en Español)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Este formulario incluye las exenciones consolidadas de HIPAA, Responsabilidad Civil y Libertad de Elección.
          </p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}