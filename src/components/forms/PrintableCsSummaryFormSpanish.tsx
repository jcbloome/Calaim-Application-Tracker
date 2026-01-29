'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import {
  PrintableField,
  PrintableFormSection,
  PrintableFormRow
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
    React.createElement('div', {
      key: 'online-note',
      className: 'mb-6 p-4 border border-blue-200 bg-blue-50 text-sm text-blue-900 print:text-black print:border-black'
    }, [
      React.createElement('p', { key: 'note-title', className: 'font-semibold' }, 'Nota importante sobre solicitudes en línea'),
      React.createElement('p', { key: 'note-body' }, 'Para la experiencia más rápida y segura, recomendamos completar la solicitud a través de nuestro portal en línea. Incluso si se carga el Formulario de Resumen de CS, la información debe ingresarse en línea para un procesamiento más rápido y el seguimiento de la solicitud.')
    ]),
    buildSection('Sección 1: Información del Miembro', [
      buildField({ label: 'Nombre del Miembro', value: data.memberFirstName, required: true, width: 'half' }),
      buildField({ label: 'Apellido del Miembro', value: data.memberLastName, required: true, width: 'half' }),
      buildField({ label: 'Fecha de Nacimiento', value: data.memberDob, type: 'date', required: true, width: 'half' }),
      buildField({ label: 'Edad', value: data.memberAge?.toString(), width: 'half' }),
      buildField({ label: 'Sexo', value: data.sex, type: 'radio', options: ['Masculino', 'Femenino'], required: true, width: 'half' }),
      buildField({ label: 'Idioma Principal', value: data.memberLanguage, required: true, width: 'half' }),
      buildRow([
        buildField({ label: 'Número de Medi-Cal', value: data.memberMediCalNum, placeholder: '9XXXXXXXA', required: true, width: 'half' }),
        buildField({ label: 'Confirmar Número de Medi-Cal', value: data.confirmMemberMediCalNum, placeholder: '9XXXXXXXA', required: true, width: 'half' }),
      ]),
      buildRow([
        buildField({ label: 'Número de Registro Médico (MRN)', value: data.memberMrn, required: true, width: 'half' }),
        buildField({ label: 'Confirmar MRN', value: data.confirmMemberMrn, required: true, width: 'half' }),
      ]),
      React.createElement('div', {
        key: 'mrn-hint',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Health Net usa el número de Medi-Cal; Kaiser usa un MRN diferente (a menudo empieza con 0000).'),
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
        width: 'full',
        className: 'col-span-full'
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
      React.createElement('div', {
        key: 'current-location-examples',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Ejemplos: RCFE, SNF, Hogar, Sin vivienda, Hospital, Vida Asistida, Otro.'),
      buildField({ label: 'Dirección Actual', value: data.currentAddress, required: true, width: 'full' }),
      React.createElement('div', {
        key: 'current-address-examples',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Ejemplos: RCFE, SNF, Hogar, Sin vivienda, Hospital, Vida Asistida, Otro.'),
      buildRow([
        buildField({ label: 'Ciudad', value: data.currentCity, required: true, width: 'half' }),
        buildField({ label: 'Estado', value: data.currentState, required: true, width: 'half' }),
      ]),
      buildRow([
        buildField({ label: 'Código Postal', value: data.currentZip, required: true, width: 'half' }),
        buildField({ label: 'Condado', value: data.currentCounty, required: true, width: 'half' }),
      ]),
    ]),
    buildSection('Sección 6A: Residencia Habitual (Dirección Normal a Largo Plazo)', [
      buildField({
        label: 'Tipo de Residencia Habitual',
        value: data.customaryLocationType,
        type: 'select',
        options: ['Hogar', 'Hospital', 'Centro de Enfermería Especializada (SNF)', 'Vida Asistida', 'Otro'],
        required: true,
        width: 'full'
      }),
      React.createElement('div', {
        key: 'customary-same-as-current',
        className: 'col-span-full text-sm'
      }, React.createElement('span', { className: 'inline-flex items-center gap-2' }, [
        React.createElement('span', { key: 'box', className: 'w-4 h-4 border border-gray-400 print:border-black rounded-sm' }),
        React.createElement('span', { key: 'label' }, 'Igual que la ubicación actual')
      ])),
      buildField({ label: 'Dirección Habitual', value: data.customaryAddress, required: true, width: 'full' }),
      buildRow([
        buildField({ label: 'Ciudad', value: data.customaryCity, required: true, width: 'half' }),
        buildField({ label: 'Estado', value: data.customaryState, required: true, width: 'half' }),
      ]),
      buildRow([
        buildField({ label: 'Código Postal', value: data.customaryZip, required: true, width: 'half' }),
        buildField({ label: 'Condado', value: data.customaryCounty, required: true, width: 'half' }),
      ]),
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
        label: 'Si es Otro: nombre del plan de salud actual',
        value: data.existingHealthPlan,
        width: 'full'
      }),
      buildField({
        label: '¿Cambiará de plan al final del mes?',
        value: data.switchingHealthPlan,
        type: 'radio',
        options: ['Sí', 'No', 'N/A'],
        width: 'full'
      }),
      React.createElement('div', {
        key: 'health-plan-important',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'important-title', className: 'font-semibold' }, 'Importante'),
        React.createElement('p', { key: 'important-1' }, 'Para inscribirse en el programa CalAIM a través de Connections, debe ser miembro de Health Net o Kaiser. Si actualmente está en otro plan de atención administrada de Medi-Cal, deberá cambiar.'),
        React.createElement('p', { key: 'important-2' }, 'En California, los miembros inscritos en MCPs de Medi-Cal pueden cambiar de proveedor en cualquier momento. El cambio es efectivo al comienzo del próximo mes. Por ejemplo, si un miembro quiere cambiar de un MCP el 15 de enero, será inscrito en el nuevo MCP el 1 de febrero.'),
        React.createElement('p', { key: 'important-3' }, 'Puede cambiar su plan de salud contactando a California Health Care Options al 1-800-430-4263 o visitando su sitio web.')
      ]),
      buildField({
        label: 'Vía CalAIM',
        value: data.pathway,
        type: 'radio',
        options: ['Transición de SNF', 'Desviación de SNF'],
        required: true,
        width: 'full'
      }),
      React.createElement('div', {
        key: 'pathway-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-3'
      }, [
        React.createElement('div', { key: 'transition' }, [
          React.createElement('p', { className: 'font-semibold' }, 'Requisitos de Elegibilidad para Transición de SNF'),
          React.createElement('p', null, 'Permite que un residente actual de SNF se transfiera a un RCFE o ARF.'),
          React.createElement('ul', { className: 'list-disc pl-5 mt-2 space-y-1' }, [
            React.createElement('li', { key: 't1' }, 'Ha residido en un SNF por al menos 60 días consecutivos (puede incluir una combinación de días de Medicare y Medi-Cal y traslados SNF-hospital-SNF); y'),
            React.createElement('li', { key: 't2' }, 'Está dispuesto a vivir en un RCFE como alternativa a un SNF; y'),
            React.createElement('li', { key: 't3' }, 'Puede residir de manera segura en un RCFE con apoyos y servicios apropiados y rentables.'),
            React.createElement('li', { key: 't4' }, 'Miembros recientemente dados de alta de SNF con el requisito de 60 días consecutivos también deben considerarse como transición de SNF.')
          ])
        ]),
        React.createElement('div', { key: 'diversion' }, [
          React.createElement('p', { className: 'font-semibold' }, 'Requisitos de Elegibilidad para Desviación de SNF'),
          React.createElement('p', null, 'Transita a un miembro que, sin este apoyo, necesitaría residir en un SNF y en su lugar transiciona a un RCFE o ARF en la comunidad (por ejemplo, desde el hogar o desde el hospital).'),
          React.createElement('ul', { className: 'list-disc pl-5 mt-2 space-y-1' }, [
            React.createElement('li', { key: 'd1' }, 'Interesado en permanecer en la comunidad; y'),
            React.createElement('li', { key: 'd2' }, 'Puede residir de manera segura en un RCFE con apoyos y servicios apropiados y rentables; y'),
            React.createElement('li', { key: 'd3' }, 'Debe estar actualmente en nivel de atención SNF médicamente necesario: por ejemplo, requiere ayuda sustancial con actividades de la vida diaria (ayuda con vestirse, bañarse, incontinencia, etc.) o está en riesgo de institucionalización prematura; y cumple con los criterios para recibir esos servicios en RCFE o ARF.')
          ])
        ]),
        React.createElement('div', { key: 'confirm', className: 'flex items-start gap-2' }, [
          React.createElement('span', { key: 'box', className: 'w-4 h-4 border border-gray-400 print:border-black rounded-sm mt-0.5' }),
          React.createElement('span', { key: 'label' }, 'Confirmo que se han cumplido todos los criterios para la vía seleccionada.')
        ])
      ]),
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
      React.createElement('div', {
        key: 'isp-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'isp-1' }, 'Un Plan de Servicio Individual (ISP) es una evaluación integral realizada por el equipo clínico del Plan de Atención Administrada (MCP) para determinar las necesidades de atención del miembro y aprobarlos para el programa. La evaluación ISP es un paso crítico para obtener la autorización del MCP. El ISP se realiza virtualmente (Health Net) o en persona (Kaiser) por un MSW/RN de Connections para administrar una herramienta para determinar el nivel de atención (la cantidad que el MCP pagará por la porción de “vida asistida”). Para Health Net, el nivel escalonado es determinado por Connections. Para Kaiser, el nivel escalonado es determinado por Kaiser.'),
        React.createElement('p', { key: 'isp-2' }, 'Nuestro MSW/RN necesita saber a quién contactar para discutir las necesidades de atención del miembro, revisar el reporte del médico (602) y otras notas clínicas. ¿Quién es la mejor persona para contactar para el ISP? Tenga en cuenta que no es el médico de atención primaria, sino que podría ser un trabajador social de SNF, etc.')
      ]),
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
    ]),
    buildSection('Sección 8A: Pagos de Alojamiento y Comida', [
      React.createElement('div', {
        key: 'room-board-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'rb-1' }, 'El miembro del MCP es responsable de pagar al RCFE la porción de "alojamiento y comida" y el MCP es responsable de pagar al RCFE la porción de "vida asistida".'),
        React.createElement('p', { key: 'rb-2' }, 'Para miembros elegibles para SSI/SSP y el pago 2026 de Non-Medical Out of Home Care (NMOHC), el SSI/SSP sube a $1,626.07. El miembro normalmente conserva $182 para gastos personales y el RCFE recibe el saldo de $1,444.07 como pago por "alojamiento y comida". Además, los miembros elegibles para NMOHC pagarán al menos $1,447.00 al RCFE. Los miembros que reciben más pueden pagar más por "alojamiento y comida" para un cuarto privado o para abrir opciones en áreas más costosas.'),
        React.createElement('p', { key: 'rb-3' }, 'Los miembros no elegibles para NMOHC aún tendrán una obligación de "alojamiento y comida", pero el monto podría ser flexible según el RCFE y el nivel escalonado evaluado.'),
        React.createElement('p', { key: 'rb-4' }, 'Los miembros que no pueden pagar ninguna porción de alojamiento y comida generalmente no son elegibles para el CS, ya que los requisitos del programa exigen un pago de "alojamiento y comida" del miembro (o su familia).'),
        React.createElement('p', { key: 'rb-5' }, 'Trabajar con CalAIM es a discreción de los RCFEs. Los RCFEs, especialmente en áreas más costosas, podrían no participar en CalAIM. Las familias que buscan colocar a miembros en áreas de bienes raíces costosos deben tener la expectativa realista de que los RCFEs de CalAIM podrían estar ubicados en áreas más asequibles. Antes de aceptar miembros de CalAIM, los RCFEs necesitarán conocer el pago de "alojamiento y comida".')
      ]),
      buildField({ label: 'Ingresos Mensuales', value: data.monthlyIncome, placeholder: '$0.00', required: true, width: 'half' }),
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
      buildField({
        label: 'Ciudades Preferidas para RCFE',
        value: data.rcfePreferredCities,
        width: 'full'
      }),
      buildField({ label: 'Nombre del Administrador del RCFE', value: data.rcfeAdminFirstName, width: 'half' }),
      buildField({ label: 'Apellido del Administrador del RCFE', value: data.rcfeAdminLastName, width: 'half' }),
      buildField({ label: 'Teléfono del Administrador', value: data.rcfeAdminPhone, width: 'half' }),
      buildField({ label: 'Correo Electrónico del Administrador', value: data.rcfeAdminEmail, width: 'full' }),
    ]),
    null
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
