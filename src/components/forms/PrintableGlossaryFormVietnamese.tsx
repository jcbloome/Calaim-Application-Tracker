'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { acronyms } from '@/lib/data';

interface PrintableGlossaryFormVietnameseProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableGlossaryFormVietnamese({
  applicationId,
  showPrintButton = true
}: PrintableGlossaryFormVietnameseProps) {
  return (
    <PrintableFormLayout
      title="Bang chu viet tat CalAIM"
      subtitle="Cac thuat ngu va chu viet tat thuong gap trong quy trinh nop ho so CalAIM"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="col-span-full mb-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
        <p className="text-sm print:text-xs text-blue-800 print:text-black">
          <strong>Ve bang thuat ngu nay:</strong> Tai lieu tham khao nay gom cac chu viet tat va
          thuat ngu pho bien ban co the gap trong qua trinh nop ho so Ho Tro Cong Dong CalAIM.
          Hay giu ben canh khi dien bieu mau hoac trao doi voi dieu phoi vien cham soc.
        </p>
      </div>

      <div className="col-span-full">
        <div className="overflow-hidden border print:border-black rounded-lg print:rounded-none">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 print:bg-white border-b print:border-black">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 print:text-black border-r print:border-black">
                  Viet tat
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 print:text-black">
                  Dinh nghia
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

      <div className="col-span-full mt-8 space-y-6">
        <div className="p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Luu y quan trong
          </h3>
          <ul className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black list-disc list-inside">
            <li>
              <strong>MRN (Ma ho so y te):</strong> Doi voi thanh vien Health Net, dung so Medi-Cal
              (bat dau bang so 9). Doi voi thanh vien Kaiser, dung MRN cua Kaiser.
            </li>
            <li>
              <strong>SNF va RCFE/ARF:</strong> SNF cung cap cham soc dieu duong chuyen sau, trong khi RCFE/ARF
              cung cap dich vu song ho tro voi muc do ho tro y te thap hon.
            </li>
            <li>
              <strong>Cac lo trinh CalAIM:</strong> Chuyen huong SNF giup tranh nhap co so dieu duong,
              con Chuyen tiep SNF giup chuyen tu co so dieu duong sang song tai cong dong.
            </li>
            <li>
              <strong>Ho Tro Cong Dong (CS):</strong> Dich vu duoc thiet ke de giup thanh vien song doc lap hon
              trong cong dong thay vi moi truong co tinh chat co so.
            </li>
          </ul>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            Can ho tro?
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <div className="p-3 bg-yellow-50 print:bg-gray-100 border border-yellow-200 print:border-gray-400 rounded print:rounded-none">
              <p className="font-bold mb-2">Lien he Connections Care Home Consultants:</p>
              <p className="font-semibold">Dien thoai: 800-330-5593</p>
              <p className="font-semibold">Email: calaim@carehomefinders.com</p>
              <p className="text-xs mt-2 font-medium">
                <strong>Luu y:</strong> Email nay chi de hoi thong tin chuong trinh.
                Vui long khong gui bieu mau ho so vao email nay, hay su dung cong tai tai lieu bao mat tai:
                <strong> connectcalaim.com/forms/printable-package</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-3">
            So dien thoai tham khao nhanh
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p><strong>Dich vu thanh vien Health Net:</strong> 800-675-6110</p>
            <p><strong>California Health Care Options:</strong> 800-430-4263</p>
            <p><strong>Dich vu thanh vien Kaiser:</strong> 1-800-464-4000</p>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}
