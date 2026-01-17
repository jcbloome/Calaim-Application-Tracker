'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableGlossaryFormSpanishProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableGlossaryFormSpanish({
  applicationId,
  showPrintButton = true
}: PrintableGlossaryFormSpanishProps) {
  return (
    <PrintableFormLayout
      title="Glosario de Acrónimos CalAIM"
      subtitle="Términos y abreviaciones comunes utilizados en el proceso de solicitud CalAIM"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Glosario de Acrónimos (Versión en Español)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Esta hoja de referencia contiene acrónimos y abreviaciones comunes que puede encontrar durante 
            el proceso de solicitud de Apoyo Comunitario CalAIM.
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            ¿Necesita Ayuda?
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <div className="p-3 bg-yellow-50 print:bg-gray-100 border border-yellow-200 print:border-gray-400 rounded print:rounded-none">
              <p className="font-bold mb-2">Contacte a Connections Care Home Consultants:</p>
              <p className="font-semibold">Teléfono: 800-330-5593</p>
              <p className="font-semibold">Correo electrónico: calaim@carehomefinders.com</p>
              <p className="text-xs mt-2 font-medium">
                <strong>Importante:</strong> Este correo electrónico es solo para información sobre el programa. 
                Por favor no envíe ningún formulario de solicitud aquí y en su lugar use nuestro 
                portal seguro de carga de documentos en línea en: <strong>connectcalaim.com/forms/printable-package</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Números de Teléfono de Referencia Rápida
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p><strong>Servicios para Miembros de Health Net:</strong> 800-675-6110</p>
            <p><strong>Opciones de Atención Médica de California:</strong> 800-430-4263</p>
            <p><strong>Servicios para Miembros de Kaiser:</strong> 1-800-464-4000</p>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}