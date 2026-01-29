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
            El Papel de los Consultores de Hogares de Cuidado de Connections
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Durante 35 años, Connections ha ayudado a familias de pago privado a encontrar hogares de cuidado. Estamos emocionados de ahora estar asociados con MCPs como proveedor de CS que ayuda con la comprensión del programa, encontrar instalaciones participantes, coordinar papeleo y evaluaciones, y enlazar con su MCP para solicitar autorización para el CS. Una vez que un miembro es colocado, también enviamos un MSW para visitar al miembro en el RCFE/ARF para controles de calidad mensuales y proporcionar coordinación de atención continua.
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Importancia del Contacto del ISP
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            El Plan de Servicio Individual (ISP) es una evaluación clínica requerida para determinar el
            nivel de atención del miembro y obtener la autorización del Plan de Atención Administrada (MCP).
            Connections necesita saber a quién contactar para revisar notas clínicas y coordinar el ISP
            (a menudo un trabajador social de SNF o coordinador de cuidados, no el médico de atención primaria).
          </p>
        </div>

        {/* Managed Care Plans We Work With */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Planes de Atención Administrada con los que Trabajamos
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
            Connections actualmente solo tiene contrato con <strong>Health Net</strong> y <strong>Kaiser</strong> para el CS para Transiciones de Vida Asistida. Debe cambiar a uno de estos planes si desea trabajar con Connections.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black">Health Net</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                Sirviendo a miembros en los condados de Sacramento y Los Ángeles.
              </p>
            </div>
            <div className="p-4 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black">Kaiser Permanente</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                Connections tiene contrato para el CS para Kaiser Permanente a través de un subcontrato con Independent Living Systems (ILS), que administra el programa para Kaiser.
              </p>
            </div>
          </div>
        </div>

        {/* Switching to Health Net or Kaiser */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Cambiar a Health Net o Kaiser
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <p>Si está en otro plan de atención administrada de Medi-Cal y desea trabajar con Connections, necesitará cambiar.</p>
            <p>En California, los miembros inscritos en MCPs de Medi-Cal pueden cambiar de proveedor en cualquier momento. El cambio es efectivo al comienzo del próximo mes. Por ejemplo, si un miembro quiere cambiar de un MCP el 15 de enero, será inscrito en el nuevo MCP el 1 de febrero.</p>
            <p>Puede cambiar su plan de salud contactando a California Health Care Options al 1-800-430-4263 o visitando su sitio web.</p>
          </div>
        </div>

        {/* Expedited Disenrollment from Molina */}
        <div className="p-4 print:p-6 bg-red-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Desinscripción Expedita de Molina
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
            Si fue asignado aleatoriamente a Molina y necesita cambiar a Health Net urgentemente (especialmente para residentes de SNF que necesitan servicios de transición CalAIM), aquí hay dos opciones de escalación:
          </p>
          <div className="space-y-4">
            <div className="p-3 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black mb-2">1. Llamar a Health Net directamente: 1-800-675-6110</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black mb-2">
                Contacte a Servicios para Miembros de Health Net directamente para solicitar una transferencia expedita de Molina a Health Net.
              </p>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                <strong>Qué decir:</strong> "El miembro fue asignado aleatoriamente a Molina a pesar de solicitar Health Net. Este error está impidiendo el acceso a los servicios de transición SNF-a-comunidad de CalAIM, manteniendo efectivamente al miembro institucionalizado más tiempo del necesario."
              </p>
            </div>
            <div className="p-3 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black mb-2">2. Contactar a California Health Care Options: 1-800-430-4263</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                Solicite una transferencia expedita debido a necesidades médicas urgentes y acceso a servicios especializados de CalAIM.
              </p>
            </div>
          </div>
        </div>

        {/* Types of Assisted Living */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Tipos de Vida Asistida (RCFEs/ARFs)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
            Las instalaciones de vida asistida (RCFEs o ARFs) vienen en varios tamaños, cada una ofreciendo un ambiente diferente. Connections puede ayudarle a encontrar un entorno que mejor se adapte a sus necesidades:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <li><strong>Entornos Pequeños, Como el Hogar:</strong> Estos son típicamente hogares de 4-6 camas que proporcionan una alta proporción de personal por residente. Este ambiente ofrece atención más personalizada y una experiencia de vida más tranquila e íntima.</li>
            <li><strong>Entornos Grandes, Comunitarios:</strong> Estos son a menudo instalaciones de 100+ camas que cuentan con comodidades como comedores grupales, una amplia variedad de actividades planificadas y oportunidades sociales. El personal está disponible según sea necesario para proporcionar cuidado y apoyo.</li>
          </ul>
        </div>

        {/* Medicare vs. Medi-Cal */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Medicare vs. Medi-Cal
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Medicare es un programa federal de seguro de salud principalmente para personas de 65 años o más. Medi-Cal es el programa Medicaid de California para individuos de bajos ingresos. El programa CalAIM es un beneficio de Medi-Cal.
          </p>
        </div>

        {/* Participación en el Costo (SOC) */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Participación en el Costo (SOC)
          </h3>
          <div className="mt-3 p-3 print:p-3 bg-yellow-50 print:bg-white border print:border-black">
            <h4 className="font-semibold text-gray-900 print:text-black mb-2">Información sobre Participación en el Costo (SOC):</h4>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              La Participación en el Costo generalmente se activa si un miembro recibe más de <strong>$1,800/mes</strong>, 
              aunque este número puede variar por condado y por circunstancias particulares. Los miembros en SNFs pueden no 
              mostrar un SOC ya que la instalación recibe la mayor parte de sus ingresos, pero esto puede cambiar al hacer 
              la transición a la vida comunitaria.
            </p>
          </div>
        </div>

        {/* Benefitscal.com */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Benefitscal.com
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-2">
            Una ventanilla única para solicitar y revisar beneficios de Medi-Cal incluyendo posible información de participación en costos y para agregar para el miembro un representante autorizado/poder notarial.
          </p>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mt-2">
            Visite <a href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-blue-800 hover:underline">www.benefitscal.com</a> para verificación actual de SOC y más información.
          </p>
        </div>

        {/* Individual Service Plan */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Plan de Servicio Individual (ISP)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Un Plan de Servicio Individual (ISP) es una evaluación integral realizada por el equipo clínico del Plan de Atención Administrada (MCP) para determinar las necesidades de atención del miembro y aprobarlos para el programa. La evaluación ISP es un paso crítico para obtener la autorización del MCP. El ISP se realiza virtualmente (Health Net) o en persona (Kaiser) por un MSW/RN de Connections para administrar una herramienta para determinar el nivel de atención (la cantidad que el MCP pagará por la porción de 'vida asistida'). Para Health Net, el nivel escalonado es determinado por Connections. Para Kaiser, el nivel escalonado es determinado por Kaiser.
          </p>
        </div>

        {/* CalAIM Turnaround Time */}
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Tiempo de Respuesta de CalAIM
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            El tiempo típico de procesamiento para las solicitudes de CalAIM varía según el plan de salud y la complejidad del caso. Health Net generalmente procesa las solicitudes dentro de 14-30 días hábiles, mientras que Kaiser puede tomar 30-45 días hábiles. Los casos urgentes pueden ser expeditados con documentación médica apropiada.
          </p>
        </div>

        {/* Room and Board / Assisted Living Payments */}
        <div className="p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Pagos de "Alojamiento y Comida" y "Vida Asistida"
          </h3>
          <div className="space-y-4 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              El miembro del MCP es responsable de pagar al RCFE la porción de 'alojamiento y comida' y el MCP es 
              responsable de pagar al RCFE la porción de 'vida asistida'.
            </p>
            <p>
              Para miembros elegibles para SSI/SSP y el pago de Atención No Médica Fuera del Hogar 2026 (NMOHC), SSI/SSP se aumenta a $1,626.07. El miembro generalmente retiene $182 para gastos de necesidades personales y el RCFE recibe el saldo de $1,444.07 como pago por "alojamiento y comida". Además, los miembros elegibles para el NMOHC pagarán al menos $1,447.00 al RCFE. Los miembros que reciben más de esta cantidad pueden pagar más por 'alojamiento y comida' para una habitación privada o para abrir RCFEs en áreas más caras.
            </p>
            <p>
              Los miembros no elegibles para el NMOHC aún tendrán una obligación de 'alojamiento y comida' pero la cantidad podría ser flexible dependiendo del RCFE y el nivel escalonado evaluado.
            </p>
            <p>
              Los miembros que no pueden pagar ninguna porción de alojamiento y comida generalmente no son elegibles para el CS ya que los requisitos del programa exigen un pago de 'alojamiento y comida' del miembro (o su familia).
            </p>
            <p>
              Trabajar con CalAIM está a discreción de los RCFEs. Muchos RCFEs, especialmente en áreas más caras, muy probablemente no participarán en CalAIM. Las familias que buscan colocar miembros en áreas de bienes raíces caros deben tener la expectativa realista de que los RCFEs de CalAIM podrían estar ubicados solo en áreas más asequibles.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-gray-900 print:text-black mb-2">Con SSI/SSP y NMOHC:</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>SSI/SSP aumentado a $1,626.07</li>
                  <li>El miembro retiene $182 para necesidades personales</li>
                  <li>RCFE recibe $1,444.07 para alojamiento y comida</li>
                  <li>Pago mínimo: $1,447.00</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 print:text-black mb-2">Sin NMOHC:</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>Aún tienen obligación de alojamiento y comida</li>
                  <li>La cantidad puede ser flexible</li>
                  <li>Depende del RCFE y nivel de nivel</li>
                  <li>No puede pagar = generalmente no elegible</li>
                </ul>
              </div>
            </div>
          </div>
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
            <p className="font-semibold text-blue-700 print:text-black mb-2">
              El SOC generalmente se activa si un miembro recibe más de $1,800/mes, aunque puede variar por condado y circunstancias.
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