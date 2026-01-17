'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableDeclarationFormSpanishProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableDeclarationFormSpanish({
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true
}: PrintableDeclarationFormSpanishProps) {
  return (
    <PrintableFormLayout
      title="Declaración de Elegibilidad"
      subtitle="Apoyo Comunitario CalAIM (CS) para Desviación de SNF a Vida Asistida"
      formType="declaration"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Declaración de Elegibilidad (Versión en Español)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Para ser completado por el proveedor de atención primaria (PCP): Por favor imprima.
          </p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}