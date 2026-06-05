'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection } from './PrintableFormFields';

interface PrintableWaiversFormVietnameseProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableWaiversFormVietnamese({
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true
}: PrintableWaiversFormVietnameseProps) {
  return (
    <PrintableFormLayout
      title="Mien tru va uy quyen"
      subtitle="Uy quyen HIPAA, mien tru trach nhiem va quyen tu do lua chon"
      formType="waivers"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <PrintableFormSection title="Thong tin thanh vien">
        <PrintableField
          label="Ho va ten thanh vien"
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

      <div className="mb-6 p-4 bg-blue-50 print:bg-gray-50 border border-blue-200 print:border-gray-400 rounded-lg print:rounded-none">
        <div className="flex items-start gap-3">
          <div className="text-blue-600 print:text-black text-lg">💡</div>
          <div>
            <h4 className="font-semibold text-blue-900 print:text-black text-sm mb-2">Huong dan MRN:</h4>
            <div className="text-xs text-blue-800 print:text-black space-y-1">
              <div><strong>Health Net:</strong> Dung so Medi-Cal (dinh dang: 9XXXXXXXA)</div>
              <div><strong>Kaiser:</strong> Dung MRN rieng cua Kaiser (thuong bat dau bang so 0)</div>
            </div>
          </div>
        </div>
      </div>

      <PrintableFormSection title="Uy quyen HIPAA">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <p>
            Bieu mau nay, khi duoc dien va ky boi quy vi (thanh vien hoac POA), cho phep su dung va/hoac
            tiet lo thong tin suc khoe duoc bao mat cua quy vi. Thong tin duoc phep tiet lo co the bao gom
            thong tin lien quan den HIV/AIDS, suc khoe tam than va su dung chat kich thich, tru khi co quy dinh khac.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-6">
            <div>
              <p className="font-semibold">Don vi duoc phep cung cap:</p>
              <p>Bat ky co quan hoac ca nhan lien quan den cham soc y te cung cap thong tin phuc vu muc dich xin
                CS CalAIM cho chuong trinh chuyen tiep sang song ho tro</p>
            </div>
            <div>
              <p className="font-semibold">Don vi duoc phep nhan:</p>
              <p>Connections Care Home Consultants, LLC</p>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2">Mo ta thong tin duoc tiet lo</p>
            <p className="mb-2">Thong tin tiet lo bao gom nhung khong gioi han:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Thong tin nhan khau hoc (Ho ten, ngay sinh, SSN, ID Medi-Cal)</li>
              <li>Tien su benh va bao cao kham suc khoe</li>
              <li>Ke hoach Dich vu Ca nhan (ISP) va danh gia chuc nang</li>
              <li>Danh gia muc do cham soc (LOC)</li>
              <li>Y lenh va danh sach thuoc</li>
            </ul>
          </div>

          <div>
            <p className="font-semibold mb-2">Muc dich tiet lo thong tin</p>
            <p className="mb-2">Thong tin nay duoc su dung de:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Xac dinh dieu kien tham gia Ho Tro Cong Dong CalAIM</li>
              <li>Thuc hien danh gia lam sang de xep muc do cham soc</li>
              <li>Ho tro qua trinh chuyen tiep va tiep nhan vao RCFE/ARF co hop dong</li>
              <li>Dieu phoi thanh toan va xu ly boi thuong giua co so, Connections va MCP</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-semibold">Thoi han:</p>
              <p>Mot nam ke tu ngay ky</p>
            </div>
            <div>
              <p className="font-semibold">Quyen cua toi:</p>
              <p>Thanh vien (hoac POA) phai ky de tiep tuc CS, va co the thu hoi uy quyen nay bat cu luc nao</p>
            </div>
          </div>

          <PrintableField
            label="Toi da doc va hieu phan Uy quyen HIPAA"
            type="checkbox"
            options={['Co, toi da hieu va dong y']}
            width="full"
          />
        </div>
      </PrintableFormSection>

      <PrintableFormSection title="Mien tru va giai tru trach nhiem cua thanh vien/POA">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <div>
            <p className="font-semibold mb-2">1. Xac nhan tinh doc lap cua cac ben</p>
            <p>
              Nguoi ky ten (Thanh vien hoac Dai dien phap ly duoc uy quyen/POA) xac nhan Connections Care Home Consultants LLC
              ("CONNECTIONS") la don vi tu van gioi thieu va hanh chinh. Cac co so RCFE/ARF do CONNECTIONS gioi thieu la
              cac don vi kinh doanh doc lap, khong thuoc so huu, quan ly hay giam sat boi CONNECTIONS.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">2. Chap nhan rui ro</p>
            <p>
              Toi hieu rang viec sap xep vao co so cham soc co cac rui ro von co, bao gom nhung khong gioi han:
              cap cuu y te, chan thuong, te nga, hoac bien chung cham soc. Toi tu nguyen chap nhan moi rui ro lien quan den
              viec cu tru va cham soc cua Thanh vien tai bat ky co so nao duoc lua chon.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">3. Giai tru va mien tru trach nhiem</p>
            <p>
              Trong pham vi phap luat cho phep, toi, thay mat ban than, Thanh vien va nguoi thua ke/tai san cua chung toi,
              mien tru va giai tru cho Connections Care Home Consultants LLC, nhan su va dai dien cua ho, khoi moi trach nhiem,
              khieu nai va yeu cau phat sinh tu viec dat cho Thanh vien vao co so cham soc.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">4. Cam ket khong khoi kien</p>
            <p>
              Toi dong y khong thuc hien khoi kien dan su hoac khieu nai hanh chinh doi voi CONNECTIONS ve thiet hai, chan thuong,
              hoac ton that phat sinh tu hanh vi, thieu sot hoac dieu kien cua co so cham soc ben thu ba.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">5. Cong bo ve danh gia RN (ISP)</p>
            <p>
              Toi hieu rang du RN cua CONNECTIONS co the thuc hien ISP de xac dinh muc CalAIM, danh gia nay khong phai la
              "quan ly cham soc". Co so noi cu tru moi la ben chiu trach nhiem lap ke hoach cham soc rieng va dam bao an toan hang ngay.
            </p>
          </div>

          <PrintableField
            label="Toi da doc va hieu phan Mien tru va giai tru trach nhiem"
            type="checkbox"
            options={['Co, toi da hieu va dong y']}
            width="full"
          />
        </div>
      </PrintableFormSection>

      <PrintableFormSection title="Mien tru quyen tu do lua chon">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <p>
            Toi (hoac POA cua toi) hieu rang toi co quyen lua chon nhan dich vu tai cong dong.
            Cac dich vu Ho Tro Cong Dong cho chuyen tiep cong dong san co de ho tro toi.
            Toi co quyen chap nhan hoac tu choi cac dich vu nay.
          </p>

          <p>
            Neu chap nhan, toi se nhan ho tro tu Connections Care Home Consultants de chuyen den moi truong
            song tai cong dong nhu co so song ho tro. Connections se ho tro tim noi o, dieu phoi ho so va dam bao
            qua trinh tiep nhan dien ra suon se. Dich vu nay do MCP phe duyet va chi tra.
          </p>

          <p>
            Neu tu choi, toi chon tiep tuc o noi hien tai va khong nhan cac dich vu ho tro chuyen tiep cua chuong trinh nay vao luc nay.
          </p>

          <PrintableField
            label="Toi da doc va hieu phan Mien tru quyen tu do lua chon"
            type="checkbox"
            options={['Co, toi da hieu']}
            width="full"
          />

          <div className="mt-6">
            <h4 className="font-semibold mb-3">Lua chon cua toi:</h4>
            <PrintableField
              label=""
              type="radio"
              options={[
                'Toi chon chap nhan dich vu Ho Tro Cong Dong cho chuyen tiep cong dong',
                'Toi chon tu choi dich vu Ho Tro Cong Dong cho chuyen tiep cong dong'
              ]}
              width="full"
            />
          </div>
        </div>
      </PrintableFormSection>

      <div className="mt-12 print:mt-16">
        <h3 className="text-lg font-semibold mb-4">Chu ky cho tat ca cac phan</h3>
        <p className="text-sm print:text-xs italic text-gray-600 print:text-black mb-4">
          Bang viec ky ben duoi, toi xac nhan (duoi hinh thuc khai trung thuc) rang toi la thanh vien hoac
          dai dien duoc uy quyen hop phap (POA) de ky thay thanh vien, va toi dong y voi tat ca noi dung tren.
        </p>

        <PrintableField
          label="Toi la:"
          type="radio"
          options={['Thanh vien', 'Dai dien duoc uy quyen (POA)']}
          width="full"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Chu ky (Ho ten day du) *
            </label>
            <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Ngay *
            </label>
            <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
            Neu la dai dien duoc uy quyen, moi quan he voi thanh vien la gi? (neu khong phai dai dien, vui long ghi N/A)
          </label>
          <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}
