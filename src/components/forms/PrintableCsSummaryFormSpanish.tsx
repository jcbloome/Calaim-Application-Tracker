'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableCsSummaryFormSpanishProps {
  data?: any;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableCsSummaryFormSpanish({
  data = {},
  applicationId,
  showPrintButton = true
}: PrintableCsSummaryFormSpanishProps) {
  return (
    <PrintableFormLayout
      title="Formulario de Resumen del Miembro CS"
      subtitle="Apoyo Comunitario CalAIM para Transiciones de Vida Asistida"
      formType="cs-summary"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Formulario de Resumen del Miembro CS (Versión en Español)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Este formulario debe completarse en línea en el portal de aplicaciones para un procesamiento más rápido.
            Esta versión imprimible es solo para referencia.
          </p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}