'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableProgramInfoFormVietnameseProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableProgramInfoFormVietnamese({
  applicationId,
  showPrintButton = true
}: PrintableProgramInfoFormVietnameseProps) {
  return (
    <PrintableFormLayout
      title="Thong tin chuong trinh CalAIM va xac nhan"
      subtitle="Ho tro cong dong cho chuyen tiep sang song ho tro"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Vai tro cua Connections Care Home Consultants
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Trong 35 nam qua, Connections da ho tro gia dinh tu chi tra tim co so cham soc phu hop. Hien nay,
            chung toi hop tac voi cac MCP voi vai tro nha cung cap CS, ho tro giai thich chuong trinh, tim co so tham gia,
            dieu phoi giay to va danh gia, va ket noi voi MCP de xin phe duyet CS. Sau khi thanh vien duoc tiep nhan,
            chung toi tiep tuc cu MSW den RCFE/ARF de kiem tra chat luong hang thang va dieu phoi cham soc lien tuc.
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Tam quan trong cua nguoi lien he ISP
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Ke hoach Dich vu Ca nhan (ISP) la danh gia lam sang bat buoc de xac dinh muc do cham soc cua thanh vien
            va xin phe duyet tu Chuong trinh Cham soc Quan ly (MCP). Connections can biet nguoi lien he phu hop de xem
            ghi chu lam sang va dieu phoi ISP (thuong la nhan vien xa hoi SNF hoac dieu phoi vien cham soc, khong phai PCP).
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Cac chuong trinh quan ly cham soc chung toi hop tac
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
            Connections hien co hop dong voi <strong>Health Net</strong> va <strong>Kaiser</strong> cho dich vu
            CS chuyen tiep sang song ho tro. Neu muon lam viec voi Connections, ban can tham gia mot trong hai chuong trinh nay.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black">Health Net</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                Phuc vu thanh vien tai quận Sacramento va Los Angeles.
              </p>
            </div>
            <div className="p-4 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black">Kaiser</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                Phuc vu thanh vien tai nhieu quận o California, bao gom <strong>Los Angeles</strong>, <strong>Sacramento</strong>,
                <strong> Riverside</strong>, <strong>San Bernardino</strong>, <strong>Ventura</strong>, <strong>San Diego</strong>
                va <strong>Orange</strong>, cung nhu cac quận khac trong tieu bang.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Chuyen sang Health Net hoac Kaiser
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <p>Neu ban dang o chuong trinh Medi-Cal quan ly khac va muon lam viec voi Connections, ban can doi chuong trinh.</p>
            <p>Tai California, thanh vien Medi-Cal co the thay doi MCP bat cu luc nao. Thay doi co hieu luc vao dau thang tiep theo.</p>
            <p>Ban co the doi chuong trinh bang cach lien he California Health Care Options theo so 1-800-430-4263.</p>
          </div>
        </div>

        <div className="p-4 print:p-6 bg-red-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Huy ghi danh khan cap khoi Molina
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
            Neu thanh vien bi xep ngau nhien vao Molina va can chuyen gap sang Health Net (dac biet voi truong hop SNF can dich vu CalAIM),
            ban co the thuc hien hai huong xu ly sau:
          </p>
          <div className="space-y-4">
            <div className="p-3 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black mb-2">1. Goi truc tiep Health Net: 1-800-675-6110</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black mb-2">
                Lien he bo phan dich vu thanh vien Health Net de yeu cau chuyen nhanh tu Molina sang Health Net.
              </p>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                <strong>Goi y noi dung:</strong> "Thanh vien bi gan ngau nhien vao Molina du da yeu cau Health Net.
                Sai sot nay dang ngan can tiep can dich vu chuyen tiep SNF-sang-cong-dong cua CalAIM."
              </p>
            </div>
            <div className="p-3 print:p-4 border print:border-black">
              <h4 className="font-semibold text-gray-900 print:text-black mb-2">2. Lien he California Health Care Options: 1-800-430-4263</h4>
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                Yeu cau chuyen nhanh do nhu cau y te cap bach va nhu cau tiep can dich vu CalAIM chuyen biet.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Cac loai hinh song ho tro (RCFE/ARF)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
            Song ho tro (RCFE/ARF) co nhieu quy mo khac nhau va moi noi co moi truong sinh hoat rieng.
            Connections se giup tim noi phu hop nhat voi nhu cau cua thanh vien:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <li><strong>Co so nho, giong gia dinh:</strong> Thuong 4-6 giuong, ty le nhan su/nguoi o cao hon, cham soc ca nhan hon.</li>
            <li><strong>Co so lon, tinh cong dong:</strong> Thuong 100+ giuong, co khu an chung, nhieu hoat dong va co hoi giao tiep.</li>
          </ul>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Medicare va Medi-Cal
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Medicare la bao hiem suc khoe lien bang chu yeu cho nguoi tu 65 tuoi tro len. Medi-Cal la chuong trinh Medicaid cua California
            cho nguoi co thu nhap thap. CalAIM la mot quyen loi thuoc Medi-Cal.
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Benefitscal.com
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mb-2">
            Cong thong tin mot cua de nop va xem cac quyen loi Medi-Cal, bao gom thong tin SOC va them dai dien duoc uy quyen/POA.
          </p>
          <p className="text-sm print:text-xs text-gray-700 print:text-black mt-2">
            Truy cap <a href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-blue-800 hover:underline">www.benefitscal.com</a> de kiem tra SOC hien tai va thong tin them.
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Ke hoach dich vu ca nhan (ISP)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            ISP la danh gia toan dien do doi ngu lam sang cua MCP thuc hien de xac dinh nhu cau cham soc va phe duyet tham gia chuong trinh.
            Danh gia ISP la buoc quan trong de duoc MCP chap thuan. ISP co the duoc thuc hien truc tuyen (Health Net) hoac truc tiep (Kaiser)
            boi MSW/RN cua Connections de xac dinh muc do cham soc thanh vien.
          </p>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Thoi gian xu ly CalAIM
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Thoi gian xu ly ho so CalAIM phu thuoc vao chuong trinh bao hiem va do phuc tap cua ca. Health Net thuong mat 14-30 ngay lam viec,
            trong khi Kaiser co the mat 30-45 ngay lam viec. Truong hop khan co the duoc uu tien neu co du ho so y te.
          </p>
        </div>

        <div className="p-4 print:p-6 bg-cyan-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Thanh toan Cham soc Ngoai nha Khong y te (NMOHC)
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <p>NMOHC la khoan bo sung giup tang muc SSI hang thang khi thanh vien song tai co so song ho tro co giay phep thay vi nha rieng/can ho.</p>
            <p>Neu song tai RCFE, tieu bang cong nhan chi phi sinh hoat cao hon va dieu chinh muc chi tra tu muc "doc lap" sang muc NMOHC.</p>
            <p><strong>1. Xac nhan dieu kien tai chinh (kiem tra giay to)</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Thu nhap: nam 2026, tong thu nhap "tinh vao" phai duoi $1,626.07/thang.</li>
              <li>Tai san: tu 01/01/2026, tai san tinh vao phai duoi $2,000 (ca nhan) hoac $3,000 (vo/chong).</li>
              <li>Luu y: thuong 1 xe hoi va nha chinh duoc loai tru khoi gioi han tai san.</li>
            </ul>
            <p><strong>2. Xac minh voi So An sinh Xa hoi (truoc khi chuyen)</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Den van phong SSA de phong van ve hinh thuc cu tru.</li>
              <li>Thong bao ke hoach chuyen vao RCFE co giay phep.</li>
              <li>Yeu cau tinh lai muc SSI theo NMOHC nam 2026.</li>
            </ul>
          </div>
        </div>

        <div className="p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Thanh toan "an o" va "song ho tro"
          </h3>
          <div className="space-y-4 text-sm print:text-xs text-gray-700 print:text-black">
            <p>Thanh vien MCP chiu trach nhiem chi tra phan "an o" cho RCFE, con MCP chi tra phan "song ho tro".</p>
            <p>Neu du dieu kien SSI/SSP va NMOHC 2026, muc chi tra SSI/SSP tang len $1,626.07; thanh vien thuong giu lai $182 cho chi phi ca nhan va RCFE nhan $1,444.07 cho phan an o.</p>
            <p>Neu khong du dieu kien NMOHC, thanh vien van co nghia vu dong gop an o, nhung muc co the linh hoat tuy RCFE va muc danh gia cham soc.</p>
            <p>Thanh vien khong co kha nang dong bat ky phan an o nao thuong se khong du dieu kien CS theo yeu cau chuong trinh.</p>
            <p>Viec RCFE tham gia CalAIM la tuy quyen tung co so; nhieu co so o khu vuc gia cao co the khong tham gia.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-gray-900 print:text-black mb-2">Co SSI/SSP va NMOHC:</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>SSI/SSP tang len $1,626.07</li>
                  <li>Thanh vien giu lai $182 cho chi phi ca nhan</li>
                  <li>RCFE nhan $1,444.07 cho an o</li>
                  <li>Muc dong toi thieu: $1,447.00</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 print:text-black mb-2">Khong co NMOHC:</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>Van co nghia vu dong gop an o</li>
                  <li>Muc dong co the linh hoat</li>
                  <li>Phu thuoc RCFE va muc danh gia</li>
                  <li>Khong dong duoc = thuong khong du dieu kien</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-6 bg-red-50 print:bg-white border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Quan trong: Phan dong gop chi phi (SOC)
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <p>SOC giong nhu khoan khau tru hang thang cua Medi-Cal: so tien thanh vien co the phai tu chi tra truoc khi Medi-Cal bat dau thanh toan.</p>
            <p className="font-semibold text-red-700 print:text-black">
              Thanh vien khong the nop ho so CalAIM khi con SOC. Can giam SOC ve $0 truoc khi du dieu kien.
            </p>
            <p>
              De tim hieu cach giam SOC, truy cap <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-blue-800 hover:underline">https://canhr.org/understanding-the-share-of-cost-for-medi-cal/</a> hoac lien he nhan vien phu trach ho so.
            </p>
            <div className="mt-3 rounded border border-zinc-300 bg-white p-3">
              <h4 className="font-semibold text-gray-900 print:text-black">Cac chien luoc bo sung giam SOC</h4>
              <div className="mt-2 space-y-3">
                <div>
                  <p className="font-semibold">1. Dieu chinh "thu nhap vuot muc" cho an o</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Tran SSI:</strong> nguoi nhan SSI co muc an o bi gioi han (khoang $1,444.07 nam 2026).</li>
                    <li><strong>Ngoai le khong-SSI:</strong> neu co thu nhap khac SSI, RCFE co the tinh muc co ban cong phi hop dong.</li>
                    <li><strong>Chien luoc:</strong> tang nghia vu an o trong hop dong (tru $182 chi phi ca nhan) co the giam thu nhap tinh SOC.</li>
                    <li><strong>Quy tac thuc te:</strong> dong khoang 90% thu nhap hang thang cho an o co the dua SOC ve 0; ap dung sau khi da chuyen vao co so song ho tro.</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold">2. Mua bao hiem bo sung</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Phi bao hiem nha khoa/thi luc/suc khoe co the duoc huyen khau tru.</li>
                    <li>Dam bao phi Medicare Part B/D duoc nhan vien xet duyet ghi nhan day du.</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold">3. Ap dung bao ve "spousal impoverishment" (HCBS)</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Loai tru thu nhap vo/chong song trong cong dong:</strong> SOC dua tren thu nhap tinh vao cua nguoi nop don.</li>
                    <li><strong>MMMNA:</strong> neu thu nhap vo/chong trong cong dong thap hon <strong>$4,066.50</strong> (MMMNA 2026), co the phan bo thu nhap de dat muc nay.</li>
                    <li><strong>Ket qua SOC:</strong> khi huyen ap dung dung quy dinh, SOC thuong giam manh va co the ve $0.</li>
                  </ul>
                </div>
              </div>
              <h4 className="mt-4 font-semibold text-gray-900 print:text-black">Tom tat ho so can nop</h4>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li><strong>Hop dong nhap co so da chinh sua:</strong> the hien nghia vu dong gop an o.</li>
                <li><strong>Chung tu bao hiem:</strong> tai lieu phi bao hiem bo sung hang thang.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Bieu mau can nop theo lo trinh
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-4 print:p-4 border print:border-black">
              <h3 className="font-semibold text-gray-900 print:text-black mb-3">Lo trinh Chuyen huong SNF</h3>
              <p className="text-sm print:text-xs text-gray-700 print:text-black mb-3">
                <em>Danh cho thanh vien co nguy co vao SNF va muon chuyen thang sang song ho tro</em>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm print:text-xs text-gray-700 print:text-black">
                <li>Don tom tat thanh vien CS</li>
                <li>Tuyen bo dieu kien duyet ho so (PCP ky)</li>
                <li>Danh sach thuoc hien tai</li>
                <li>Mien tru POA va giai tru trach nhiem</li>
                <li>Bieu mau quyen lua chon</li>
                <li>Bieu mau uy quyen HIPAA</li>
                <li>Mau 602 (don Medi-Cal)</li>
                <li>Cam ket chi phi an o (ghi ro thu nhap An sinh Xa hoi hang thang)</li>
                <li>Chung tu thu nhap (thu xac nhan An sinh Xa hoi hoac sao ke ngan hang 3 thang)</li>
              </ul>
            </div>

            <div className="p-4 print:p-4 border print:border-black">
              <h3 className="font-semibold text-gray-900 print:text-black mb-3">Lo trinh Chuyen tiep SNF</h3>
              <p className="text-sm print:text-xs text-gray-700 print:text-black mb-3">
                <em>Danh cho thanh vien dang o SNF va muon chuyen sang song ho tro</em>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm print:text-xs text-gray-700 print:text-black">
                <li>Don tom tat thanh vien CS</li>
                <li>Tuyen bo dieu kien duyet ho so (PCP ky)</li>
                <li>Ho so nhap SNF</li>
                <li>Danh sach thuoc hien tai</li>
                <li>Mien tru POA va giai tru trach nhiem</li>
                <li>Bieu mau quyen lua chon</li>
                <li>Bieu mau uy quyen HIPAA</li>
                <li>Mau 602 (don Medi-Cal)</li>
                <li>Cam ket chi phi an o (ghi ro thu nhap An sinh Xa hoi hang thang)</li>
                <li>Chung tu thu nhap (thu xac nhan An sinh Xa hoi hoac sao ke ngan hang 3 thang)</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 p-3 print:p-4 border print:border-black">
            <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
              <p><strong>Cam ket chi phi an o:</strong> Bieu mau nay xac nhan thanh vien co nghia vu thanh toan phan an o cho RCFE. Thanh vien phai dien muc thu nhap An sinh Xa hoi hang thang.</p>
              <p><strong>Luu y:</strong> Co the duoc yeu cau bo sung tai lieu tuy theo tinh huong va yeu cau cua MCP.</p>
            </div>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}
