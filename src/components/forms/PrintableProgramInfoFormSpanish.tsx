'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableProgramInfoFormSpanishProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableProgramInfoFormSpanish({
  applicationId,
  showPrintButton = true
}: PrintableProgramInfoFormSpanishProps) {
  return (
    <PrintableFormLayout
      title="Información del Programa CalAIM y Reconocimiento"
      subtitle="Apoyo Comunitario para Transiciones de Vida Asistida"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Información del Programa (Versión en Español)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Esta información del programa incluye detalles sobre CalAIM, Apoyos Comunitarios, 
            y los requisitos para las transiciones de vida asistida.
          </p>
        </div>

        {/* Share of Cost */}
        <div className="p-4 print:p-6 bg-red-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Importante: Participación en el Costo (SOC)
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              Una Participación en el Costo (SOC) es como un deducible mensual para Medi-Cal. Es la cantidad de dinero que 
              puede tener que pagar cada mes hacia servicios médicos antes de que su cobertura de Medi-Cal comience a pagar.
            </p>
            <p className="font-semibold text-red-700 print:text-black">
              Los miembros no pueden aplicar para CalAIM con un SOC. Debe ser eliminado antes de ser elegible para aplicar.
            </p>
            <p>
              Para información sobre cómo eliminar la participación en el costo, visite el sitio web de California Advocates for Nursing Home 
              Reform (CANHR) en <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-blue-800 hover:underline">https://canhr.org/understanding-the-share-of-cost-for-medi-cal/</a> o contacte a su trabajador de caso.
            </p>
          </div>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Formularios Requeridos por Vía
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* SNF Diversion Pathway */}
            <div className="p-4 print:p-4 border print:border-black">
              <h3 className="font-semibold text-gray-900 print:text-black mb-3">Vía de Desviación de SNF</h3>
              <p className="text-sm print:text-xs text-gray-700 print:text-black mb-3">
                <em>Para miembros en riesgo de colocación en SNF que quieren ir directamente a vida asistida</em>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm print:text-xs text-gray-700 print:text-black">
                <li>Formulario de Resumen del Miembro CS</li>
                <li>Declaración de Elegibilidad (firmada por PCP)</li>
                <li>Lista de Medicamentos Actual</li>
                <li>Exención de POA y Liberación de Responsabilidad</li>
                <li>Formulario de Libertad de Elección</li>
                <li>Formulario de Autorización HIPAA</li>
                <li>Formulario 602 (Solicitud de Medi-Cal)</li>
                <li>Compromiso de Alojamiento y Comida (debe incluir cantidad de ingresos mensuales del Seguro Social)</li>
                <li>Comprobante de Ingresos (Carta anual de adjudicación del Seguro Social O 3 meses de estados de cuenta bancarios que muestren ingresos del Seguro Social)</li>
              </ul>
            </div>

            {/* SNF Transition Pathway */}
            <div className="p-4 print:p-4 border print:border-black">
              <h3 className="font-semibold text-gray-900 print:text-black mb-3">Vía de Transición de SNF</h3>
              <p className="text-sm print:text-xs text-gray-700 print:text-black mb-3">
                <em>Para miembros actualmente en un SNF que quieren hacer la transición a vida asistida</em>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm print:text-xs text-gray-700 print:text-black">
                <li>Formulario de Resumen del Miembro CS</li>
                <li>Declaración de Elegibilidad (firmada por PCP)</li>
                <li>Documentación de Admisión a SNF</li>
                <li>Lista de Medicamentos Actual</li>
                <li>Exención de POA y Liberación de Responsabilidad</li>
                <li>Formulario de Libertad de Elección</li>
                <li>Formulario de Autorización HIPAA</li>
                <li>Formulario 602 (Solicitud de Medi-Cal)</li>
                <li>Compromiso de Alojamiento y Comida (debe incluir cantidad de ingresos mensuales del Seguro Social)</li>
                <li>Comprobante de Ingresos (Carta anual de adjudicación del Seguro Social O 3 meses de estados de cuenta bancarios que muestren ingresos del Seguro Social)</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 p-3 print:p-4 border print:border-black">
            <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
              <p><strong>Compromiso de Alojamiento y Comida:</strong> Este formulario explica que el miembro está obligado a pagar la porción de alojamiento y comida al RCFE. El miembro debe completar la cantidad de sus ingresos mensuales del Seguro Social en este formulario.</p>
              <p><strong>Nota:</strong> Documentos adicionales pueden ser solicitados basados en su situación específica y los requisitos del plan de atención administrada.</p>
            </div>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}