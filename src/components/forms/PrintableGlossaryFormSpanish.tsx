'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { acronyms } from '@/lib/data';

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
      {/* Introduction */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
        <p className="text-sm print:text-xs text-blue-800 print:text-black">
          <strong>Acerca de este glosario:</strong> Esta hoja de referencia contiene acrónimos y 
          abreviaciones comunes que puede encontrar durante el proceso de solicitud de Apoyo Comunitario CalAIM. 
          Mantenga esto a mano mientras completa sus formularios o habla con su coordinador de atención.
        </p>
      </div>

      {/* Glossary Table */}
      <div className="col-span-full">
        <div className="overflow-hidden border print:border-black rounded-lg print:rounded-none">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 print:bg-white border-b print:border-black">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 print:text-black border-r print:border-black">
                  Acrónimo
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 print:text-black">
                  Definición
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 print:divide-black">
              {acronyms.map((item, index) => (
                <tr key={item.term} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 print:bg-white'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 print:text-black border-r print:border-black">
                    {item.term}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 print:text-black">
                    {item.definition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Information */}
      <div className="col-span-full mt-8 space-y-6">
        <div className="p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Notas Importantes
          </h3>
          <ul className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black list-disc list-inside">
            <li>
              <strong>MRN (Número de Registro Médico):</strong> Para miembros de Health Net, use su número de Medi-Cal 
              (comienza con 9). Para miembros de Kaiser, use su MRN específico de Kaiser.
            </li>
            <li>
              <strong>SNF vs. RCFE/ARF:</strong> SNF proporciona atención de enfermería especializada, mientras que RCFE/ARF proporciona 
              servicios de vida asistida con apoyo médico menos intensivo.
            </li>
            <li>
              <strong>Vías de CalAIM:</strong> La Desviación de SNF ayuda a evitar la colocación en instalaciones de enfermería, mientras que 
              la Transición de SNF ayuda a mudarse de una instalación de enfermería a atención basada en la comunidad.
            </li>
            <li>
              <strong>Apoyos Comunitarios (CS):</strong> Servicios diseñados para ayudar a los miembros a vivir independientemente 
              en la comunidad en lugar de en entornos institucionales.
            </li>
          </ul>
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