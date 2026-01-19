'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection } from './PrintableFormFields';

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
      subtitle="Autorización HIPAA, Exención de Responsabilidad y Libertad de Elección"
      formType="waivers"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Información del Miembro */}
      <PrintableFormSection title="Información del Miembro">
        <PrintableField
          label="Nombre del Miembro"
          value={memberName}
          required
          width="half"
        />
        <PrintableField
          label="MRN"
          value={memberMrn}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* Pautas de MRN */}
      <div className="mb-6 p-4 bg-blue-50 print:bg-gray-50 border border-blue-200 print:border-gray-400 rounded-lg print:rounded-none">
        <div className="flex items-start gap-3">
          <div className="text-blue-600 print:text-black text-lg">💡</div>
          <div>
            <h4 className="font-semibold text-blue-900 print:text-black text-sm mb-2">Pautas de MRN:</h4>
            <div className="text-xs text-blue-800 print:text-black space-y-1">
              <div><strong>Health Net:</strong> Use su número de Medi-Cal (formato: 9XXXXXXXA)</div>
              <div><strong>Kaiser:</strong> Use su MRN específico de Kaiser (a menudo comienza con ceros)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Autorización HIPAA */}
      <PrintableFormSection title="Autorización HIPAA">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <p>
            Este formulario, cuando sea completado y firmado por usted (miembro o POA), autoriza el uso y/o 
            divulgación de su información de salud protegida. La información autorizada para divulgación puede 
            incluir información relacionada con VIH/SIDA, salud mental y uso de sustancias, a menos que se especifique lo contrario.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-6">
            <div>
              <p className="font-semibold">Autorizado para divulgar:</p>
              <p>Cualquier agencia o persona relacionada con atención médica que proporcione información para el propósito de solicitar 
              el CS CalAIM para Transiciones de Vida Asistida</p>
            </div>
            <div>
              <p className="font-semibold">Autorizado para recibir:</p>
              <p>Connections Care Home Consultants, LLC</p>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2">Descripción de la Información a Divulgar</p>
            <p className="mb-2">La información a divulgar incluye, pero no se limita a:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Información demográfica (Nombre, Fecha de Nacimiento, Número de Seguro Social, ID de Medi-Cal)</li>
              <li>Historia médica y reportes de examen físico</li>
              <li>Planes de Servicio Individual (ISP) y Evaluaciones Funcionales</li>
              <li>Determinaciones de Nivel de Atención (LOC) por niveles</li>
              <li>Órdenes médicas y listas de medicamentos</li>
            </ul>
          </div>

          <div>
            <p className="font-semibold mb-2">Propósito de la Divulgación</p>
            <p className="mb-2">Esta información será utilizada específicamente para:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Determinar elegibilidad para Apoyos Comunitarios CalAIM</li>
              <li>Realizar evaluaciones clínicas para colocación por niveles</li>
              <li>Facilitar la transición y admisión a un RCFE/ARF contratado</li>
              <li>Coordinar facturación y procesamiento de reclamaciones entre la Instalación, Connections y el MCP</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-semibold">Expiración:</p>
              <p>Un año desde la fecha de firma</p>
            </div>
            <div>
              <p className="font-semibold">Mis Derechos:</p>
              <p>El miembro (o POA) debe firmar el documento para proceder con el CS pero puede revocar esta autorización en cualquier momento</p>
            </div>
          </div>

          <PrintableField
            label="He leído y entendido la sección de Autorización HIPAA"
            type="checkbox"
            options={['Sí, entiendo y acepto']}
            width="full"
          />
        </div>
      </PrintableFormSection>

      {/* Exención de Responsabilidad */}
      <PrintableFormSection title="Exención y Liberación de Responsabilidad del Miembro/POA">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <div>
            <p className="font-semibold mb-2">1. Reconocimiento de Entidades Independientes</p>
            <p>
              El suscrito (Miembro o Poder Notarial/Representante Legal Autorizado) reconoce que 
              Connections Care Home Consultants LLC ("CONNECTIONS") es un consultor de referencia y administrativo. 
              Entiendo que las Instalaciones de Cuidado Residencial para Ancianos (RCFE) o Instalaciones 
              Residenciales para Adultos (ARF) referidas por CONNECTIONS son negocios independientes. No son 
              propiedad, operadas, administradas o supervisadas por CONNECTIONS.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">2. Asunción de Riesgo</p>
            <p>
              Entiendo que la colocación en una instalación de cuidado involucra riesgos inherentes, incluyendo 
              pero no limitado a emergencias médicas, lesiones físicas, caídas o complicaciones del cuidado. 
              Voluntariamente asumo todos los riesgos asociados con la residencia y cuidado del Miembro en 
              cualquier instalación seleccionada, ya sea referida por CONNECTIONS o no.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">3. Liberación y Exención de Responsabilidad</p>
            <p>
              Hasta el máximo permitido por la ley, yo, en nombre de mí mismo, el Miembro y nuestros herederos 
              o patrimonio, por la presente libero, descargo para siempre y mantengo libre de daños a Connections 
              Care Home Consultants LLC, sus oficiales, empleados y agentes de toda responsabilidad, reclamos y 
              demandas de cualquier tipo o naturaleza, ya sea en derecho o equidad, que surjan o puedan surgir 
              de la colocación del Miembro en una instalación. Esto incluye, pero no se limita a, responsabilidad 
              por: Lesión Física o Muerte, Cuidado Clínico, Problemas de Seguridad o Infecciones/Enfermedades.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">4. Compromiso de No Demandar</p>
            <p>
              Acepto que no iniciaré ninguna acción legal, demanda o reclamo administrativo contra CONNECTIONS 
              por daños, lesiones o pérdidas causadas por los actos, omisiones o condiciones de una instalación 
              de cuidado de terceros. Reconozco que mi único recurso legal para asuntos que involucren la calidad 
              del cuidado o seguridad física reside contra la instalación que proporciona el cuidado directo.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">5. Divulgación de Evaluación RN (ISP)</p>
            <p>
              Entiendo que aunque un RN de CONNECTIONS puede realizar un Plan de Servicio Individual (ISP) para 
              el propósito de determinación de nivel CalAIM, esta evaluación no constituye el "manejo del cuidado." 
              La instalación es únicamente responsable de crear su propio plan de cuidado y asegurar que las 
              necesidades diarias y seguridad del Miembro sean satisfechas.
            </p>
          </div>

          <PrintableField
            label="He leído y entendido la sección de Exención y Liberación de Responsabilidad"
            type="checkbox"
            options={['Sí, entiendo y acepto']}
            width="full"
          />
        </div>
      </PrintableFormSection>

      {/* Libertad de Elección */}
      <PrintableFormSection title="Exención de Libertad de Elección">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <p>
            Yo (o mi POA) entiendo que tengo la opción de recibir servicios en la comunidad. Los Apoyos 
            Comunitarios para Transición Comunitaria están disponibles para ayudarme. Yo (o mi POA) puedo 
            elegir aceptar o rechazar estos servicios.
          </p>
          
          <p>
            Si acepto estos servicios, recibiré asistencia de Connections Care Home Consultants para 
            mudarme a un entorno basado en la comunidad como una instalación de vida asistida. Me ayudarán 
            a encontrar un lugar, coordinar el papeleo y asegurar que esté establecido. Esto será autorizado 
            y pagado por mi Plan de Atención Administrada.
          </p>
          
          <p>
            Si rechazo estos servicios, estoy eligiendo permanecer donde estoy, y no recibiré los servicios 
            de apoyo de transición ofrecidos por este programa en este momento.
          </p>

          <PrintableField
            label="He leído y entendido la sección de Exención de Libertad de Elección"
            type="checkbox"
            options={['Sí, entiendo']}
            width="full"
          />

          <div className="mt-6">
            <h4 className="font-semibold mb-3">Mi Elección:</h4>
            <PrintableField
              label=""
              type="radio"
              options={[
                'Elijo aceptar los servicios de Apoyos Comunitarios para transición comunitaria',
                'Elijo rechazar los servicios de Apoyos Comunitarios para transición comunitaria'
              ]}
              width="full"
            />
          </div>
        </div>
      </PrintableFormSection>

      {/* Sección de Firma */}
      <div className="mt-12 print:mt-16">
        <h3 className="text-lg font-semibold mb-4">Firma para Todas las Secciones</h3>
        <p className="text-sm print:text-xs italic text-gray-600 print:text-black mb-4">
          Al firmar abajo, reconozco que bajo pena de perjurio, soy el miembro o un representante autorizado 
          (POA) legalmente facultado para firmar en nombre del miembro, y que acepto todas las secciones anteriores.
        </p>

        <PrintableField
          label="Soy el/la:"
          type="radio"
          options={['Miembro', 'Representante Autorizado (POA)']}
          width="full"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Firma (Nombre Completo) *
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

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
            Si es representante autorizado, ¿cuál es la relación con el miembro? (si no es R/A por favor ponga N/A)
          </label>
          <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}