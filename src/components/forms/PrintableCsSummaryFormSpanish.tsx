'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection, PrintableFormRow, PrintableSignatureBlock } from './PrintableFormFields';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableCsSummaryFormSpanishProps {
  data?: Partial<FormValues>;
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
      title="Formulario de Resumen del Miembro de Apoyo Comunitario CalAIM"
      subtitle="Programa de Transiciones de Vida Asistida"
      formType="cs-summary"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Sección 1: Información del Miembro */}
      <PrintableFormSection title="Sección 1: Información del Miembro">
        <PrintableField
          label="Nombre del Miembro"
          value={data.memberFirstName}
          required
          width="half"
        />
        <PrintableField
          label="Apellido del Miembro"
          value={data.memberLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="Fecha de Nacimiento"
          value={data.memberDob}
          type="date"
          required
          width="half"
        />
        <PrintableField
          label="Edad"
          value={data.memberAge?.toString()}
          width="half"
        />
        
        <PrintableField
          label="Sexo"
          value={data.sex}
          type="radio"
          options={['Masculino', 'Femenino']}
          required
          width="half"
        />
        <PrintableField
          label="Idioma Principal"
          value={data.memberLanguage}
          required
          width="half"
        />
        
        <PrintableField
          label="Número de Medi-Cal"
          value={data.memberMediCalNum}
          placeholder="9XXXXXXXA"
          required
          width="half"
        />
        <PrintableField
          label="Confirmar Número de Medi-Cal"
          value={data.confirmMemberMediCalNum}
          placeholder="9XXXXXXXA"
          required
          width="half"
        />
        
        <PrintableField
          label="Número de Registro Médico (MRN)"
          value={data.memberMrn}
          required
          width="half"
        />
        <PrintableField
          label="Confirmar MRN"
          value={data.confirmMemberMrn}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* Información del Referente */}
      <PrintableFormSection title="Sección 2: Información del Referente">
        <PrintableField
          label="Nombre del Referente"
          value={data.referrerFirstName}
          width="half"
        />
        <PrintableField
          label="Apellido del Referente"
          value={data.referrerLastName}
          width="half"
        />
        
        <PrintableField
          label="Teléfono del Referente"
          value={data.referrerPhone}
          required
          width="half"
        />
        <PrintableField
          label="Relación con el Miembro"
          value={data.referrerRelationship}
          required
          width="half"
        />
        
        <PrintableField
          label="Agencia/Organización"
          value={data.agency}
          width="full"
        />
      </PrintableFormSection>

      {/* Persona de Contacto Principal */}
      <PrintableFormSection title="Sección 3: Persona de Contacto Principal">
        <PrintableField
          label="Nombre del Contacto"
          value={data.bestContactFirstName}
          required
          width="half"
        />
        <PrintableField
          label="Apellido del Contacto"
          value={data.bestContactLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="Relación con el Miembro"
          value={data.bestContactRelationship}
          required
          width="half"
        />
        <PrintableField
          label="Número de Teléfono"
          value={data.bestContactPhone}
          required
          width="half"
        />
        
        <PrintableField
          label="Dirección de Correo Electrónico"
          value={data.bestContactEmail}
          required
          width="half"
        />
        <PrintableField
          label="Idioma Preferido"
          value={data.bestContactLanguage}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* Contacto Secundario (Opcional) */}
      <PrintableFormSection title="Sección 4: Persona de Contacto Secundario (Opcional)">
        <PrintableField
          label="Nombre del Contacto"
          value={data.secondaryContactFirstName}
          width="half"
        />
        <PrintableField
          label="Apellido del Contacto"
          value={data.secondaryContactLastName}
          width="half"
        />
        
        <PrintableField
          label="Relación con el Miembro"
          value={data.secondaryContactRelationship}
          width="half"
        />
        <PrintableField
          label="Número de Teléfono"
          value={data.secondaryContactPhone}
          width="half"
        />
        
        <PrintableField
          label="Dirección de Correo Electrónico"
          value={data.secondaryContactEmail}
          width="half"
        />
        <PrintableField
          label="Idioma Preferido"
          value={data.secondaryContactLanguage}
          width="half"
        />
      </PrintableFormSection>

      {/* Representante Legal */}
      <PrintableFormSection title="Sección 5: Representante Legal">
        <PrintableField
          label="Estado del Representante Legal"
          value={data.hasLegalRep}
          type="radio"
          options={[
            'No Aplica',
            'Mismo que el Contacto Principal',
            'Persona Diferente (completar abajo)',
            'El miembro no tiene representante legal'
          ]}
          width="full"
        />
        
        <PrintableField
          label="Nombre del Representante"
          value={data.repFirstName}
          width="half"
        />
        <PrintableField
          label="Apellido del Representante"
          value={data.repLastName}
          width="half"
        />
        
        <PrintableField
          label="Relación con el Miembro"
          value={data.repRelationship}
          width="half"
        />
        <PrintableField
          label="Número de Teléfono"
          value={data.repPhone}
          width="half"
        />
        
        <PrintableField
          label="Dirección de Correo Electrónico"
          value={data.repEmail}
          width="full"
        />
      </PrintableFormSection>

      {/* Ubicación Actual */}
      <PrintableFormSection title="Sección 6: Información de Ubicación Actual">
        <PrintableField
          label="Tipo de Ubicación Actual"
          value={data.currentLocation}
          type="select"
          options={[
            'Hospital',
            'Centro de Enfermería Especializada (SNF)',
            'Hogar/Comunidad',
            'Vida Asistida',
            'Otro'
          ]}
          required
          width="full"
        />
        
        <PrintableField
          label="Dirección Actual"
          value={data.currentAddress}
          required
          width="full"
        />
        
        <PrintableFormRow>
          <PrintableField
            label="Ciudad"
            value={data.currentCity}
            required
            width="half"
          />
          <PrintableField
            label="Estado"
            value={data.currentState}
            required
            width="quarter"
          />
          <PrintableField
            label="Código Postal"
            value={data.currentZip}
            required
            width="quarter"
          />
        </PrintableFormRow>
        
        <PrintableField
          label="Condado"
          value={data.currentCounty}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* Plan de Salud y Vía */}
      <PrintableFormSection title="Sección 7: Información del Plan de Salud y Vía">
        <PrintableField
          label="Plan de Salud Actual"
          value={data.healthPlan}
          type="radio"
          options={['Kaiser Permanente', 'Health Net', 'Otro']}
          required
          width="full"
        />
        
        <PrintableField
          label="Vía CalAIM"
          value={data.pathway}
          type="radio"
          options={['Transición de SNF', 'Desviación de SNF']}
          required
          width="full"
        />
        
        <PrintableField
          label="El miembro cumple con los criterios de la vía"
          value={data.meetsPathwayCriteria ? 'Sí' : 'No'}
          type="radio"
          options={['Sí', 'No']}
          required
          width="full"
        />
        
        {data.pathway === 'SNF Diversion' && (
          <PrintableField
            label="Razón para la Desviación de SNF"
            value={data.snfDiversionReason}
            type="textarea"
            width="full"
            rows={3}
          />
        )}
      </PrintableFormSection>

      {/* Información de ISP y Instalación */}
      <PrintableFormSection title="Sección 8: Persona de Apoyo Independiente (ISP) e Información de Instalación">
        <PrintableField
          label="Nombre del ISP"
          value={data.ispFirstName}
          required
          width="half"
        />
        <PrintableField
          label="Apellido del ISP"
          value={data.ispLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="Relación del ISP con el Miembro"
          value={data.ispRelationship}
          required
          width="half"
        />
        <PrintableField
          label="Número de Teléfono del ISP"
          value={data.ispPhone}
          required
          width="half"
        />
        
        <PrintableField
          label="Correo Electrónico del ISP"
          value={data.ispEmail}
          width="half"
        />
        <PrintableField
          label="Nombre de la Instalación del ISP"
          value={data.ispFacilityName}
          width="half"
        />

        <PrintableField
          label="CalAIM vs. Assisted Living Waiver (ALW): En lista de espera de ALW"
          value={data.onALWWaitlist}
          type="radio"
          options={['Sí', 'No', 'Desconocido']}
          width="full"
        />
        
        <PrintableField
          label="Ingresos Mensuales"
          value={data.monthlyIncome}
          placeholder="$0.00"
          required
          width="half"
        />

        <PrintableField
          label="Porción Esperada de \"Room and Board\" (Esta cantidad variará si el miembro recibe el pago de NMOHC, ver arriba.)"
          value={data.expectedRoomAndBoard}
          placeholder="$0.00"
          required
          width="half"
        />
        
        <PrintableField
          label="Reconoce Responsabilidad de Alojamiento y Comida"
          value={data.ackRoomAndBoard ? 'Sí' : 'No'}
          type="radio"
          options={['Sí', 'No']}
          required
          width="full"
        />
      </PrintableFormSection>

      {/* RCFE Preferido */}
      <PrintableFormSection title="Sección 9: Centro de Cuidado Residencial Preferido (RCFE)">
        <PrintableField
          label="Tiene RCFE Preferido"
          value={data.hasPrefRCFE ? 'Sí' : 'No'}
          type="radio"
          options={['Sí', 'No']}
          width="full"
        />
        
        <PrintableField
          label="Nombre del RCFE"
          value={data.rcfeName}
          width="full"
        />
        
        <PrintableField
          label="Dirección del RCFE"
          value={data.rcfeAddress}
          width="full"
        />
        
        <PrintableField
          label="Nombre del Administrador del RCFE"
          value={data.rcfeAdminName}
          width="half"
        />
        <PrintableField
          label="Teléfono del Administrador"
          value={data.rcfeAdminPhone}
          width="half"
        />
        
        <PrintableField
          label="Correo Electrónico del Administrador"
          value={data.rcfeAdminEmail}
          width="full"
        />
      </PrintableFormSection>

      {/* Bloques de Firma */}
      <div className="mt-12 print:mt-16 space-y-8">
        <PrintableSignatureBlock
          title="Firma del Miembro/Representante Legal"
          subtitle="Certifico que la información proporcionada en este formulario es precisa y completa según mi conocimiento."
        />
        
        <PrintableSignatureBlock
          title="Firma del Referente/Personal"
          subtitle="He revisado esta información con el miembro/representante y confirmo su precisión."
        />
      </div>

      {/* Pie del Formulario */}
      <div className="mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black text-center">
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-2">
          <strong>Solo para Uso de la Oficina</strong>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:gap-6 text-left">
          <div>
            <label className="block text-sm font-medium mb-2">Fecha Recibida:</label>
            <div className="h-8 border-b border-gray-300 print:border-black"></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Procesado Por:</label>
            <div className="h-8 border-b border-gray-300 print:border-black"></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">ID de Aplicación:</label>
            <div className="h-8 border-b border-gray-300 print:border-black"></div>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}