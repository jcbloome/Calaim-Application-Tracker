'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection } from './PrintableFormFields';

interface PrintableRoomBoardObligationFormSpanishProps {
  memberName?: string;
  memberMrn?: string;
  memberDob?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableRoomBoardObligationFormSpanish({
  memberName = '',
  memberMrn = '',
  memberDob = '',
  applicationId,
  showPrintButton = true
}: PrintableRoomBoardObligationFormSpanishProps) {
  return (
    <PrintableFormLayout
      title="Compromiso de Alojamiento y Comida"
      subtitle=""
      formType="room-board-obligation"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-4 text-sm print:text-xs">
        {/* Member Information */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
          <PrintableField label="Nombre del Miembro" value={memberName} width="full" />
          <PrintableField label="MRN" value={memberMrn} width="full" />
          <PrintableField label="Fecha de Nacimiento" value={memberDob} type="date" width="full" />
        </div>

        {/* Room and Board Explanation */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Resumen de Alojamiento y Comida
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              <strong>Importante:</strong> Como participante del Apoyo Comunitario CalAIM, usted es responsable de pagar 
              la porción de "alojamiento y comida" de sus costos de vida asistida. El Plan de Atención Administrada (MCP) pagará 
              por la porción de "servicios de vida asistida".
            </p>
            <p>
              <strong>Alojamiento y Comida</strong> incluye: vivienda, comidas, servicios públicos y servicios básicos de la instalación.
            </p>
            <p><strong>Servicios de Vida Asistida</strong> incluyen cuidado personal, medicamentos y servicios cubiertos.</p>
          </div>
        </div>

        {/* NMOHC Information */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Resumen de NMOHC
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              NMOHC aumenta el SSI cuando la persona vive en un RCFE con licencia. La tarifa cambia de
              "Vida Independiente" a "NMOHC".
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Ingresos (2026): menos de $1,626.07/mes.</li>
              <li>Activos: $2,000 individual ($3,000 pareja).</li>
              <li>Llame a SSA (1-800-772-1213) para confirmar el nuevo pago.</li>
            </ul>
          </div>
        </div>

        {/* Income Information */}
        <PrintableFormSection title="Ingresos Mensuales">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Mis ingresos mensuales actuales del Seguro Social son: *
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold">$</span>
                <div className="flex-1 h-12 border-b-2 border-gray-400 print:border-black"></div>
                <span className="text-sm text-gray-600 print:text-black">por mes</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Pago esperado de "alojamiento y comida" (Esta cantidad variará si el miembro recibe el pago de NMOHC): *
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold">$</span>
                <div className="flex-1 h-12 border-b-2 border-gray-400 print:border-black"></div>
                <span className="text-sm text-gray-600 print:text-black">por mes</span>
              </div>
            </div>

            <div className="mt-3 p-3 print:p-4 border print:border-black bg-gray-50 print:bg-white">
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                <strong>Nota:</strong> Comprobante de ingresos (3 meses de estados de cuenta bancarios que muestren ingresos del Seguro Social O carta anual de adjudicación del Seguro Social) deberá ser cargado con su solicitud.
              </p>
            </div>
          </div>
        </PrintableFormSection>

        {/* Payment Commitment */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Compromiso
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>Entiendo y reconozco que:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Debo pagar la porción de alojamiento y comida directamente a la instalación.</li>
              <li>SSI/SSP + NMOHC puede aumentar el pago a alojamiento y comida.</li>
              <li>Si no puedo pagar, podría no ser elegible.</li>
            </ul>
          </div>
        </div>

        {/* Acknowledgment and Signature */}
        <div className="mt-6 p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Reconocimiento y Firma
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>Al firmar abajo, reconozco este Compromiso de Alojamiento y Comida.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Firma del Miembro/Representante *
              </label>
              <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Fecha *
              </label>
              <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Nombre en Letra de Molde
            </label>
            <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500 print:text-gray-700">
          <p>Para preguntas sobre los Apoyos Comunitarios CalAIM, por favor contacte a Connections al (800) 993-1778.</p>
          <p>Más información disponible en <a href="https://www.connections.com/calaim" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-blue-800 hover:underline">www.connections.com/calaim</a></p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}
