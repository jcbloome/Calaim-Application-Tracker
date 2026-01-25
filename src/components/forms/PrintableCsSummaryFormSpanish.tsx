'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import {
  PrintableField,
  PrintableFormSection,
  PrintableFormRow,
  PrintableSignatureBlock
} from './PrintableFormFields';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableCsSummaryFormSpanishProps {
  data?: Partial<FormValues>;
  applicationId?: string;
  showPrintButton?: boolean;
}

type FieldProps = React.ComponentProps<typeof PrintableField>;

const buildField = (props: FieldProps) => React.createElement(PrintableField, props);

const buildRow = (children: React.ReactNode[]) =>
  React.createElement(PrintableFormRow, null, children);

const buildSection = (title: string, children: React.ReactNode[]) =>
  React.createElement(PrintableFormSection, { title }, children);

export function PrintableCsSummaryFormSpanish({
  data = {},
  applicationId,
  showPrintButton = true,
}: PrintableCsSummaryFormSpanishProps) {
  const layoutChildren: React.ReactNode[] = [
    buildSection('Sección 1: Información del Miembro', [
      buildField({ label: 'Nombre del Miembro', value: data.memberFirstName, required: true, width: 'half' }),
      buildField({ label: 'Apellido del Miembro', value: data.memberLastName, required: true, width: 'half' }),
      buildField({ label: 'Fecha de Nacimiento', value: data.memberDob, type: 'date', required: true, width: 'half' }),
      buildField({ label: 'Edad', value: data.memberAge?.toString(), width: 'half' }),
      buildField({ label: 'Sexo', value: data.sex, type: 'radio', options: ['Masculino', 'Femenino'], required: true, width: 'half' }),
      buildField({ label: 'Idioma Principal', value: data.memberLanguage, required: true, width: 'half' }),
      buildField({ label: 'Número de Medi-Cal', value: data.memberMediCalNum, placeholder: '9XXXXXXXA', required: true, width: 'half' }),
      buildField({ label: 'Confirmar Número de Medi-Cal', value: data.confirmMemberMediCalNum, placeholder: '9XXXXXXXA', required: true, width: 'half' }),
      buildField({ label: 'Número de Registro Médico (MRN)', value: data.memberMrn, required: true, width: 'half' }),
      buildField({ label: 'Confirmar MRN', value: data.confirmMemberMrn, required: true, width: 'half' }),
    ]),
    buildSection('Sección 2: Información del Referente', [
      buildField({ label: 'Nombre del Referente', value: data.referrerFirstName, width: 'half' }),
      buildField({ label: 'Apellido del Referente', value: data.referrerLastName, width: 'half' }),
      buildField({ label: 'Teléfono del Referente', value: data.referrerPhone, required: true, width: 'half' }),
      buildField({ label: 'Relación con el Miembro', value: data.referrerRelationship, required: true, width: 'half' }),
      buildField({ label: 'Agencia/Organización', value: data.agency, width: 'full' }),
    ]),
    buildSection('Sección 3: Persona de Contacto Principal', [
      buildField({ label: 'Nombre del Contacto', value: data.bestContactFirstName, required: true, width: 'half' }),
      buildField({ label: 'Apellido del Contacto', value: data.bestContactLastName, required: true, width: 'half' }),
      buildField({ label: 'Relación con el Miembro', value: data.bestContactRelationship, required: true, width: 'half' }),
      buildField({ label: 'Número de Teléfono', value: data.bestContactPhone, required: true, width: 'half' }),
      buildField({ label: 'Dirección de Correo Electrónico', value: data.bestContactEmail, required: true, width: 'half' }),
      buildField({ label: 'Idioma Preferido', value: data.bestContactLanguage, required: true, width: 'half' }),
    ]),
    buildSection('Sección 4: Persona de Contacto Secundario (Opcional)', [
      buildField({ label: 'Nombre del Contacto', value: data.secondaryContactFirstName, width: 'half' }),
      buildField({ label: 'Apellido del Contacto', value: data.secondaryContactLastName, width: 'half' }),
      buildField({ label: 'Relación con el Miembro', value: data.secondaryContactRelationship, width: 'half' }),
      buildField({ label: 'Número de Teléfono', value: data.secondaryContactPhone, width: 'half' }),
      buildField({ label: 'Dirección de Correo Electrónico', value: data.secondaryContactEmail, width: 'half' }),
      buildField({ label: 'Idioma Preferido', value: data.secondaryContactLanguage, width: 'half' }),
    ]),
    buildSection('Sección 5: Representante Legal', [
      buildField({
        label: 'Estado del Representante Legal',
        value: data.hasLegalRep,
        type: 'radio',
        options: [
          'No Aplica',
          'Mismo que el Contacto Principal',
          'Persona Diferente (completar abajo)',
          'El miembro no tiene representante legal'
        ],
        width: 'full'
      }),
      buildField({ label: 'Nombre del Representante', value: data.repFirstName, width: 'half' }),
      buildField({ label: 'Apellido del Representante', value: data.repLastName, width: 'half' }),
      buildField({ label: 'Relación con el Miembro', value: data.repRelationship, width: 'half' }),
      buildField({ label: 'Número de Teléfono', value: data.repPhone, width: 'half' }),
      buildField({ label: 'Dirección de Correo Electrónico', value: data.repEmail, width: 'full' }),
    ]),
    buildSection('Sección 6: Información de Ubicación Actual', [
      buildField({
        label: 'Tipo de Ubicación Actual',
        value: data.currentLocation,
        type: 'select',
        options: ['Hospital', 'Centro de Enfermería Especializada (SNF)', 'Hogar/Comunidad', 'Vida Asistida', 'Otro'],
        required: true,
        width: 'full'
      }),
      buildField({ label: 'Dirección Actual', value: data.currentAddress, required: true, width: 'full' }),
      buildRow([
        buildField({ label: 'Ciudad', value: data.currentCity, required: true, width: 'half' }),
        buildField({ label: 'Estado', value: data.currentState, required: true, width: 'quarter' }),
        buildField({ label: 'Código Postal', value: data.currentZip, required: true, width: 'quarter' }),
      ]),
      buildField({ label: 'Condado', value: data.currentCounty, required: true, width: 'half' }),
    ]),
    buildSection('Sección 7: Información del Plan de Salud y Vía', [
      buildField({
        label: 'Plan de Salud Actual',
        value: data.healthPlan,
        type: 'radio',
        options: ['Kaiser Permanente', 'Health Net', 'Otro'],
        required: true,
        width: 'full'
      }),
      buildField({
        label: 'Vía CalAIM',
        value: data.pathway,
        type: 'radio',
        options: ['Transición de SNF', 'Desviación de SNF'],
        required: true,
        width: 'full'
      }),
      buildField({
        label: 'El miembro cumple con los criterios de la vía',
        value: data.meetsPathwayCriteria ? 'Sí' : 'No',
        type: 'radio',
        options: ['Sí', 'No'],
        required: true,
        width: 'full'
      }),
      data.pathway === 'SNF Diversion'
        ? buildField({
            label: 'Razón para la Desviación de SNF',
            value: data.snfDiversionReason,
            type: 'textarea',
            width: 'full',
            rows: 3
          })
        : null,
    ].filter(Boolean)),
    buildSection('Sección 8: Persona de Apoyo Independiente (ISP) e Información de Instalación', [
      buildField({ label: 'Nombre del ISP', value: data.ispFirstName, required: true, width: 'half' }),
      buildField({ label: 'Apellido del ISP', value: data.ispLastName, required: true, width: 'half' }),
      buildField({ label: 'Relación del ISP con el Miembro', value: data.ispRelationship, required: true, width: 'half' }),
      buildField({ label: 'Número de Teléfono del ISP', value: data.ispPhone, required: true, width: 'half' }),
      buildField({ label: 'Correo Electrónico del ISP', value: data.ispEmail, width: 'half' }),
      buildField({ label: 'Nombre de la Instalación del ISP', value: data.ispFacilityName, width: 'half' }),
      buildField({
        label: 'CalAIM vs. Assisted Living Waiver (ALW): En lista de espera de ALW',
        value: data.onALWWaitlist,
        type: 'radio',
        options: ['Sí', 'No', 'Desconocido'],
        width: 'full'
      }),
      buildField({ label: 'Ingresos Mensuales', value: data.monthlyIncome, placeholder: '$0.00', required: true, width: 'half' }),
      buildField({
        label: 'Porción Esperada de "Room and Board" (Esta cantidad variará si el miembro recibe el pago de NMOHC, ver arriba.)',
        value: data.expectedRoomAndBoard,
        placeholder: '$0.00',
        required: true,
        width: 'half'
      }),
      buildField({
        label: 'Reconoce Responsabilidad de Alojamiento y Comida',
        value: data.ackRoomAndBoard ? 'Sí' : 'No',
        type: 'radio',
        options: ['Sí', 'No'],
        required: true,
        width: 'full'
      }),
    ]),
    buildSection('Sección 9: Centro de Cuidado Residencial Preferido (RCFE)', [
      buildField({
        label: 'Tiene RCFE Preferido',
        value: data.hasPrefRCFE ? 'Sí' : 'No',
        type: 'radio',
        options: ['Sí', 'No'],
        width: 'full'
      }),
      buildField({ label: 'Nombre del RCFE', value: data.rcfeName, width: 'full' }),
      buildField({ label: 'Dirección del RCFE', value: data.rcfeAddress, width: 'full' }),
      buildField({ label: 'Nombre del Administrador del RCFE', value: data.rcfeAdminName, width: 'half' }),
      buildField({ label: 'Teléfono del Administrador', value: data.rcfeAdminPhone, width: 'half' }),
      buildField({ label: 'Correo Electrónico del Administrador', value: data.rcfeAdminEmail, width: 'full' }),
    ]),
    React.createElement('div', { className: 'mt-12 print:mt-16 space-y-8' }, [
      React.createElement(PrintableSignatureBlock, {
        key: 'member-signature',
        title: 'Firma del Miembro/Representante Legal',
        subtitle: 'Certifico que la información proporcionada en este formulario es precisa y completa según mi conocimiento.'
      }),
      React.createElement(PrintableSignatureBlock, {
        key: 'referrer-signature',
        title: 'Firma del Referente/Personal',
        subtitle: 'He revisado esta información con el miembro/representante y confirmo su precisión.'
      })
    ]),
    React.createElement('div', {
      className: 'mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black text-center'
    }, [
      React.createElement('p', {
        key: 'office-only-title',
        className: 'text-sm print:text-xs text-gray-600 print:text-black mb-2'
      }, React.createElement('strong', null, 'Solo para Uso de la Oficina')),
      React.createElement('div', {
        key: 'office-only-fields',
        className: 'grid grid-cols-1 sm:grid-cols-3 gap-4 print:gap-6 text-left'
      }, [
        React.createElement('div', { key: 'office-date' }, [
          React.createElement('label', { className: 'block text-sm font-medium mb-2' }, 'Fecha Recibida:'),
          React.createElement('div', { className: 'h-8 border-b border-gray-300 print:border-black' })
        ]),
        React.createElement('div', { key: 'office-processed' }, [
          React.createElement('label', { className: 'block text-sm font-medium mb-2' }, 'Procesado Por:'),
          React.createElement('div', { className: 'h-8 border-b border-gray-300 print:border-black' })
        ]),
        React.createElement('div', { key: 'office-id' }, [
          React.createElement('label', { className: 'block text-sm font-medium mb-2' }, 'ID de Aplicación:'),
          React.createElement('div', { className: 'h-8 border-b border-gray-300 print:border-black' })
        ])
      ])
    ])
  ];

  return React.createElement(
    PrintableFormLayout,
    {
      title: 'Formulario de Resumen del Miembro de Apoyo Comunitario CalAIM',
      subtitle: 'Programa de Transiciones de Vida Asistida',
      formType: 'cs-summary',
      applicationData: { id: applicationId },
      showPrintButton,
    },
    layoutChildren
  );
}
