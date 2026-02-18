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

        {/* Room and Board Payment Summary */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Resumen de Pago de Alojamiento y Comida
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              El miembro del MCP es responsable de pagar al RCFE la porción de "alojamiento y comida" y el MCP es
              responsable de pagar al RCFE la porción de "servicios de vida asistida".
            </p>
            <p>
              Para miembros elegibles para SSI/SSP y el pago 2026 de Non-Medical Out of Home Care (NMOHC), el SSI/SSP sube
              a $1,626.07. El miembro normalmente conserva $182 para gastos personales y el RCFE recibe el saldo de
              $1,444.07 como pago por "alojamiento y comida". Cualquier ingreso por encima de $1,444.07 no se paga como
              "alojamiento y comida" a menos que el miembro quiera pagar más para acceder a áreas geográficas más costosas
              o que el RCFE/ARF acepte una cantidad mayor por un cuarto privado (ya que el programa no exige cuartos privados).
            </p>
            <p>
              Los miembros no elegibles para NMOHC aún tendrán una obligación de "alojamiento y comida", pero el monto
              podría ser flexible según el RCFE y el nivel escalonado evaluado.
            </p>
            <p>
              Los miembros que no pueden pagar ninguna porción de alojamiento y comida generalmente no son elegibles para
              el CS, ya que los requisitos del programa exigen un pago de "alojamiento y comida" del miembro (o su familia).
            </p>
            <p>
              Trabajar con CalAIM es a discreción de los RCFEs. Los RCFEs, especialmente en áreas más costosas, podrían no
              participar en CalAIM. Las familias que buscan colocar a miembros en áreas de bienes raíces costosos deben
              tener la expectativa realista de que los RCFEs de CalAIM podrían estar ubicados en áreas más asequibles. Antes
              de aceptar miembros de CalAIM, los RCFEs necesitarán conocer el pago de "alojamiento y comida".
            </p>
            <p>
              El RCFE también puede requerir que el miembro/familia firme un acuerdo de admisión o contrato por separado
              que confirme la obligación de "alojamiento y comida".
            </p>
            <p>
              Si el miembro solicita un cuarto privado, o si las tarifas del RCFE seleccionado superan el "alojamiento y
              comida" estándar más el pago de "vida asistida" del MCP, el RCFE puede requerir un acuerdo por separado para
              que el miembro/familia pague una cantidad adicional. Cualquier cantidad adicional no se refleja en este
              formulario de compromiso.
            </p>
          </div>
        </div>

        {/* Income Information */}
        <PrintableFormSection title="Ingresos y Alojamiento y Comida">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Ingreso mensual actual del miembro: *
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold">$</span>
                <div className="flex-1 h-12 border-b-2 border-gray-400 print:border-black"></div>
                <span className="text-sm text-gray-600 print:text-black">por mes</span>
              </div>
            </div>

            <div className="mt-3 p-3 print:p-4 border print:border-black bg-gray-50 print:bg-white">
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                <strong>Nota:</strong> Tenga en cuenta que se deberá presentar comprobante de ingresos (por ejemplo, carta de adjudicación del Seguro Social o 3 meses de estados de cuenta bancarios que muestren ingresos del Seguro Social) como parte de este paquete de solicitud. Si los ingresos son superiores a aproximadamente $1,800, esto podría activar el Share of Cost de Medi-Cal que debe resolverse antes de solicitar CalAIM. Consulte las páginas de información del programa para más detalles.
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
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 border border-gray-400 print:border-black mt-0.5" />
              <p>
                El miembro (o representante autorizado) reconoce el compromiso de "alojamiento y comida" para participar
                en el programa CalAIM.
              </p>
            </div>
          </div>
        </div>

        {/* Acknowledgment and Signature */}
        <div className="mt-6 p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Reconocimiento y Firma
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              Al firmar abajo, reconozco que soy el miembro o un representante autorizado (POA) legalmente facultado para
              firmar en nombre del miembro.
            </p>
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
      </div>
    </PrintableFormLayout>
  );
}
