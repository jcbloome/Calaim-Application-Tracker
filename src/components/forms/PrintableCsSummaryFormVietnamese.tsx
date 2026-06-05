'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import {
  PrintableField,
  PrintableFormSection,
  PrintableFormRow
} from './PrintableFormFields';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableCsSummaryFormVietnameseProps {
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

export function PrintableCsSummaryFormVietnamese({
  data = {},
  applicationId,
  showPrintButton = true,
}: PrintableCsSummaryFormVietnameseProps) {
  const layoutChildren: React.ReactNode[] = [
    React.createElement('div', {
      key: 'online-note',
      className: 'mb-6 p-4 border border-blue-200 bg-blue-50 text-sm text-blue-900 print:text-black print:border-black'
    }, [
      React.createElement('p', { key: 'note-title', className: 'font-semibold' }, 'Luu y quan trong ve nop ho so truc tuyen'),
      React.createElement('p', { key: 'note-body' }, 'De nhanh va an toan nhat, chung toi khuyen nghi hoan tat ho so qua cong nop truc tuyen. Ke ca khi tai len mau tom tat CS, thong tin van can duoc nhap truc tuyen de xu ly nhanh hon va theo doi tien do de dang hon.')
    ]),
    buildSection('Phan 1: Thong tin thanh vien', [
      buildField({ label: 'Ten thanh vien', value: data.memberFirstName, required: true, width: 'half' }),
      buildField({ label: 'Ho thanh vien', value: data.memberLastName, required: true, width: 'half' }),
      buildField({ label: 'Ngay sinh', value: data.memberDob, type: 'date', required: true, width: 'half' }),
      buildField({ label: 'Tuoi', value: data.memberAge?.toString(), width: 'half' }),
      buildField({ label: 'Gioi tinh', value: data.sex, type: 'radio', options: ['Nam', 'Nu'], required: true, width: 'half' }),
      buildField({ label: 'Ngon ngu chinh', value: data.memberLanguage, required: true, width: 'half' }),
      buildField({ label: 'Dien thoai thanh vien', value: data.memberPhone, width: 'half' }),
      buildField({ label: 'Email thanh vien', value: data.memberEmail, width: 'half' }),
      buildRow([
        buildField({ label: 'So Medi-Cal', value: data.memberMediCalNum, placeholder: '9XXXXXXXA', required: true, width: 'half' }),
        buildField({ label: 'Xac nhan so Medi-Cal', value: data.confirmMemberMediCalNum, placeholder: '9XXXXXXXA', required: true, width: 'half' }),
      ]),
      buildRow([
        buildField({ label: 'Ma ho so y te (MRN)', value: data.memberMrn, required: true, width: 'half' }),
        buildField({ label: 'Xac nhan MRN', value: data.confirmMemberMrn, required: true, width: 'half' }),
      ]),
      React.createElement('div', {
        key: 'mrn-hint',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Health Net dung so Medi-Cal; Kaiser dung MRN rieng (thuong bat dau bang 0000).'),
    ]),
    buildSection('Phan 2: Thong tin nguoi gioi thieu', [
      buildField({ label: 'Ten nguoi gioi thieu', value: data.referrerFirstName, width: 'half' }),
      buildField({ label: 'Ho nguoi gioi thieu', value: data.referrerLastName, width: 'half' }),
      buildField({ label: 'Dien thoai nguoi gioi thieu', value: data.referrerPhone, required: true, width: 'half' }),
      buildField({ label: 'Moi quan he voi thanh vien', value: data.referrerRelationship, required: true, width: 'half' }),
      buildField({ label: 'Co quan/to chuc', value: data.agency, width: 'full' }),
    ]),
    buildSection('Phan 3: Nguoi lien he chinh', [
      buildField({ label: 'Ten nguoi lien he', value: data.bestContactFirstName, required: true, width: 'half' }),
      buildField({ label: 'Ho nguoi lien he', value: data.bestContactLastName, required: true, width: 'half' }),
      buildField({ label: 'Moi quan he voi thanh vien', value: data.bestContactRelationship, required: true, width: 'half' }),
      buildField({ label: 'So dien thoai', value: data.bestContactPhone, required: true, width: 'half' }),
      buildField({ label: 'Dia chi email', value: data.bestContactEmail, required: true, width: 'half' }),
      buildField({ label: 'Ngon ngu uu tien', value: data.bestContactLanguage, required: true, width: 'half' }),
    ]),
    buildSection('Phan 4: Nguoi lien he phu (tuy chon)', [
      buildField({ label: 'Ten nguoi lien he', value: data.secondaryContactFirstName, width: 'half' }),
      buildField({ label: 'Ho nguoi lien he', value: data.secondaryContactLastName, width: 'half' }),
      buildField({ label: 'Moi quan he voi thanh vien', value: data.secondaryContactRelationship, width: 'half' }),
      buildField({ label: 'So dien thoai', value: data.secondaryContactPhone, width: 'half' }),
      buildField({ label: 'Dia chi email', value: data.secondaryContactEmail, width: 'half' }),
      buildField({ label: 'Ngon ngu uu tien', value: data.secondaryContactLanguage, width: 'half' }),
    ]),
    buildSection('Phan 5: Dai dien phap ly', [
      buildField({
        label: 'Tinh trang dai dien phap ly',
        value: data.hasLegalRep,
        type: 'radio',
        options: [
          'Khong ap dung',
          'Trung voi nguoi lien he chinh',
          'Nguoi khac (dien ben duoi)',
          'Thanh vien khong du nang luc va can dai dien phap ly',
          'Thanh vien khong co dai dien phap ly'
        ],
        width: 'full',
        className: 'col-span-full'
      }),
      buildField({ label: 'Ten dai dien', value: data.repFirstName, width: 'half' }),
      buildField({ label: 'Ho dai dien', value: data.repLastName, width: 'half' }),
      buildField({ label: 'Moi quan he voi thanh vien', value: data.repRelationship, width: 'half' }),
      buildField({ label: 'So dien thoai', value: data.repPhone, width: 'half' }),
      buildField({ label: 'Dia chi email', value: data.repEmail, width: 'full' }),
    ]),
    buildSection('Phan 6: Thong tin noi o hien tai', [
      buildField({
        label: 'Loai noi o hien tai',
        value: data.currentLocation,
        type: 'select',
        options: ['Benh vien', 'Co so dieu duong chuyen sau (SNF)', 'Nha/Cong dong', 'Song ho tro', 'Khac'],
        required: true,
        width: 'full'
      }),
      React.createElement('div', {
        key: 'current-location-type-examples',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Vi du: RCFE, SNF, Nha, Khong nha o, Benh vien, Song ho tro, Khac.'),
      buildField({
        label: 'Ten dia diem hien tai (neu co)',
        value: data.currentLocationName,
        width: 'full'
      }),
      buildField({ label: 'Dia chi hien tai', value: data.currentAddress, required: true, width: 'full' }),
      React.createElement('div', {
        key: 'current-address-examples',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Vi du: RCFE, SNF, Nha, Khong nha o, Benh vien, Song ho tro, Khac.'),
      buildRow([
        buildField({ label: 'Thanh pho', value: data.currentCity, required: true, width: 'half' }),
        buildField({ label: 'Tieu bang', value: data.currentState, required: true, width: 'half' }),
      ]),
      buildRow([
        buildField({ label: 'Ma buu dien', value: data.currentZip, required: true, width: 'half' }),
        buildField({ label: 'Quan hạt', value: data.currentCounty, required: true, width: 'half' }),
      ]),
    ]),
    buildSection('Phan 6A: Noi o thuong tru (dia chi lau dai thong thuong)', [
      buildField({
        label: 'Loai noi o thuong tru',
        value: data.customaryLocationType,
        type: 'select',
        options: ['Nha', 'Benh vien', 'Co so dieu duong chuyen sau (SNF)', 'Song ho tro', 'Khac'],
        required: true,
        width: 'full'
      }),
      React.createElement('div', {
        key: 'customary-location-type-examples',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Vi du: RCFE, SNF, Nha, Khong nha o, Benh vien, Song ho tro, Khac.'),
      buildField({
        label: 'Ten noi o thuong tru (neu co)',
        value: data.customaryLocationName,
        width: 'full'
      }),
      React.createElement('div', {
        key: 'customary-same-as-current',
        className: 'col-span-full text-sm'
      }, React.createElement('span', { className: 'inline-flex items-center gap-2' }, [
        React.createElement('span', { key: 'box', className: 'w-4 h-4 border border-gray-400 print:border-black rounded-sm' }),
        React.createElement('span', { key: 'label' }, 'Giong noi o hien tai')
      ])),
      buildField({ label: 'Dia chi thuong tru', value: data.customaryAddress, required: true, width: 'full' }),
      buildRow([
        buildField({ label: 'Thanh pho', value: data.customaryCity, required: true, width: 'half' }),
        buildField({ label: 'Tieu bang', value: data.customaryState, required: true, width: 'half' }),
      ]),
      buildRow([
        buildField({ label: 'Ma buu dien', value: data.customaryZip, required: true, width: 'half' }),
        buildField({ label: 'Quan hạt', value: data.customaryCounty, required: true, width: 'half' }),
      ]),
    ]),
    buildSection('Phan 7: Thong tin bao hiem va lo trinh', [
      React.createElement('div', {
        key: 'health-plan-important',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'important-title', className: 'font-semibold' }, 'Quan trong'),
        React.createElement('p', { key: 'important-1' }, 'De dang ky chuong trinh CalAIM qua Connections, thanh vien can thuoc Health Net hoac Kaiser. Neu dang o MCP khac, thanh vien se can doi chuong trinh.'),
        React.createElement('p', { key: 'important-2' }, 'Tai California, thanh vien Medi-Cal co the doi MCP bat cu luc nao. Thay doi co hieu luc vao dau thang tiep theo.'),
        React.createElement('p', { key: 'important-3' }, 'Ban co the doi chuong trinh bang cach lien he California Health Care Options theo so 1-800-430-4263 hoac truy cap website cua ho.')
      ]),
      buildField({
        label: 'Chuong trinh bao hiem hien tai',
        value: data.healthPlan,
        type: 'radio',
        options: ['Kaiser Permanente', 'Health Net', 'Khac'],
        required: true,
        width: 'full'
      }),
      buildField({
        label: 'Neu la Khac: ten chuong trinh bao hiem hien tai',
        value: data.existingHealthPlan,
        width: 'full'
      }),
      buildField({
        label: 'Co doi chuong trinh vao cuoi thang nay khong?',
        value: data.switchingHealthPlan,
        type: 'radio',
        options: ['Co', 'Khong', 'N/A'],
        width: 'full'
      }),
      React.createElement('div', {
        key: 'pathway-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-3'
      }, [
        React.createElement('div', { key: 'transition' }, [
          React.createElement('p', { className: 'font-semibold' }, 'Dieu kien du dieu kien: Chuyen tiep SNF'),
          React.createElement('p', null, 'Cho phep nguoi dang o SNF chuyen sang RCFE hoac ARF.'),
          React.createElement('ul', { className: 'list-disc pl-5 mt-2 space-y-1' }, [
            React.createElement('li', { key: 't1' }, 'Da o SNF it nhat 60 ngay lien tuc (co the gom ngay Medicare + Medi-Cal, ke ca chuyen SNF-benh vien-SNF); va'),
            React.createElement('li', { key: 't2' }, 'Dong y song tai RCFE thay cho SNF; va'),
            React.createElement('li', { key: 't3' }, 'Co the song an toan tai RCFE voi dich vu ho tro phu hop, hieu qua chi phi.'),
            React.createElement('li', { key: 't4' }, 'Thanh vien moi xuat vien SNF nhung dap ung yeu cau 60 ngay van duoc xem la Chuyen tiep SNF.')
          ])
        ]),
        React.createElement('div', { key: 'diversion' }, [
          React.createElement('p', { className: 'font-semibold' }, 'Dieu kien du dieu kien: Chuyen huong SNF'),
          React.createElement('p', null, 'Ho tro thanh vien co nguy co phai vao SNF nhung duoc chuyen sang RCFE/ARF trong cong dong (vi du: tu nha hoac benh vien).'),
          React.createElement('ul', { className: 'list-disc pl-5 mt-2 space-y-1' }, [
            React.createElement('li', { key: 'd1' }, 'Muon tiep tuc song trong cong dong; va'),
            React.createElement('li', { key: 'd2' }, 'Co the song an toan tai RCFE voi ho tro phu hop, hieu qua chi phi; va'),
            React.createElement('li', { key: 'd3' }, 'Hien dang o muc cham soc SNF can thiet ve y khoa (can tro giup dang ke voi sinh hoat hang ngay, hoac co nguy co cao bi the che hoa som) va dap ung tieu chi nhan dich vu tai RCFE/ARF.')
          ])
        ]),
        React.createElement('div', { key: 'confirm', className: 'flex items-start gap-2' }, [
          React.createElement('span', { key: 'box', className: 'w-4 h-4 border border-gray-400 print:border-black rounded-sm mt-0.5' }),
          React.createElement('span', { key: 'label' }, 'Toi xac nhan da dap ung day du tieu chi cua lo trinh duoc chon.')
        ])
      ]),
      buildField({
        label: 'Lo trinh CalAIM',
        value: data.pathway,
        type: 'radio',
        options: ['Chuyen tiep SNF', 'Chuyen huong SNF'],
        required: true,
        width: 'full'
      }),
      React.createElement('div', {
        key: 'snf-diversion-reason-lines',
        className: 'col-span-full mb-4 print:mb-6'
      }, [
        React.createElement('label', {
          key: 'snf-diversion-reason-label',
          className: 'mb-2 block text-sm font-medium text-gray-700 print:text-black'
        }, 'Ly do Chuyen huong SNF (dien khi chon Chuyen huong SNF)'),
        React.createElement('div', { key: 'snf-diversion-reason-lines-wrap', className: 'space-y-2' },
          Array.from({ length: 5 }).map((_, idx) =>
            React.createElement('div', {
              key: `snf-diversion-line-${idx}`,
              className: 'h-5 border-b-2 border-gray-400 print:border-black'
            })
          )
        )
      ]),
    ].filter(Boolean)),
    buildSection('Phan 11: Ke hoach dich vu ca nhan (ISP)', [
      React.createElement('div', {
        key: 'isp-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'isp-1' }, 'Ke hoach Dich vu Ca nhan (ISP) la danh gia toan dien do doi ngu lam sang cua MCP thuc hien de xac dinh nhu cau cham soc va phe duyet chuong trinh. ISP la buoc quan trong de duoc MCP phe duyet. ISP duoc thuc hien truc tuyen (Health Net) hoac truc tiep (Kaiser) boi MSW/RN cua Connections de xac dinh muc do cham soc (muc MCP chi tra cho phan "song ho tro").'),
        React.createElement('p', { key: 'isp-2' }, 'MSW/RN cua chung toi can biet nguoi nao phu hop de trao doi ve nhu cau cham soc cua thanh vien, xem bao cao bac si (602) va ghi chu lam sang khac. Ai la nguoi lien he phu hop nhat cho ISP? Thuong khong phai PCP, co the la nhan vien xa hoi SNF, v.v.')
      ]),
      buildField({ label: 'Ten nguoi lien he ISP', value: data.ispFirstName, required: true, width: 'half' }),
      buildField({ label: 'Ho nguoi lien he ISP', value: data.ispLastName, required: true, width: 'half' }),
      buildField({ label: 'Moi quan he voi thanh vien', value: data.ispRelationship, required: true, width: 'half' }),
      buildField({ label: 'Dien thoai nguoi lien he ISP', value: data.ispPhone, required: true, width: 'half' }),
      buildField({ label: 'Email nguoi lien he ISP', value: data.ispEmail, width: 'half' }),
      React.createElement('div', {
        key: 'isp-assessment-note',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'isp-assess-title', className: 'font-semibold' }, 'Dia diem danh gia ISP'),
        React.createElement('p', { key: 'isp-assess-body' }, 'Dia chi danh gia ISP chi bat buoc voi thanh vien Kaiser (can tham dinh truc tiep). Voi thanh vien Health Net, vui long dien N/A vao cac o ben duoi.')
      ]),
      buildField({
        label: 'Loai dia diem danh gia ISP',
        value: data.ispLocationType,
        type: 'select',
        options: ['Nha', 'Benh vien', 'Co so dieu duong chuyen sau (SNF)', 'Song ho tro', 'Khac'],
        required: true,
        width: 'half'
      }),
      React.createElement('div', {
        key: 'isp-location-type-examples',
        className: 'col-span-full text-xs text-gray-500 print:text-black'
      }, 'Vi du: RCFE, SNF, Nha, Benh vien, Song ho tro, Khac.'),
      buildField({ label: 'Ten co so danh gia ISP', value: data.ispFacilityName, width: 'half' }),
      buildField({ label: 'Dia chi danh gia ISP', value: data.ispAddress, required: true, width: 'half' }),
      buildField({ label: 'Thanh pho (ISP)', value: data.ispCity, required: true, width: 'half' }),
      buildField({ label: 'Tieu bang (ISP)', value: data.ispState, required: true, width: 'half' }),
      buildField({ label: 'Ma buu dien (ISP)', value: data.ispZip, required: true, width: 'half' }),
    ]),
    buildSection('Phan 12: CalAIM so voi Assisted Living Waiver (ALW)', [
      React.createElement('div', {
        key: 'alw-dup-note',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black'
      }, 'CalAIM va ALW la hai dich vu trung lap; thanh vien da tham gia mot chuong trinh se khong duoc tai tro boi chuong trinh con lai.'),
      buildField({
        label: 'Dang trong danh sach cho ALW',
        value: data.onALWWaitlist,
        type: 'radio',
        options: ['Co', 'Khong', 'Khong ro'],
        width: 'full'
      }),
    ]),
    buildSection('Phan 8 va 10: NMOHC va chi phi an o', [
      React.createElement('div', {
        key: 'nmohc-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'nmohc-1' }, 'Non-Medical Out of Home Care (NMOHC) la khoan bo sung vao tro cap SSI hang thang khi mot nguoi song tai co so song ho tro co cap phep thay vi nha/apartment rieng.'),
        React.createElement('p', { key: 'nmohc-2' }, 'Tai California, neu song tai RCFE, tieu bang cong nhan chi phi cao hon dang ke so voi song doc lap. Vi vay, muc tro cap co the chuyen tu "Song doc lap" sang muc "NMOHC".'),
        React.createElement('div', { key: 'nmohc-3' }, [
          React.createElement('p', { className: 'font-semibold' }, '1. Xac nhan dieu kien tai chinh (kiem tra giay to)'),
          React.createElement('p', null, 'Vi NMOHC thuoc chuong trinh SSI, co the kiem tra dieu kien tai chinh ngay tu bay gio.'),
          React.createElement('ul', { className: 'list-disc pl-5 mt-2 space-y-1' }, [
            React.createElement('li', { key: 'nmohc-3a' }, 'Thu nhap: Nam 2026, tong thu nhap "duoc tinh" phai thap hon $1,626.07/thang.'),
            React.createElement('li', { key: 'nmohc-3b' }, 'Tai san: Tu 01/01/2026, gioi han tai san duoc ap dung lai: duoi $2,000 cho ca nhan ($3,000 cho cap vo chong).'),
            React.createElement('li', { key: 'nmohc-3c' }, 'Luu y: Mot xe hoi va nha o chinh thuong duoc mien tinh vao gioi han nay.')
          ])
        ]),
        React.createElement('div', { key: 'nmohc-4' }, [
          React.createElement('p', { className: 'font-semibold' }, '2. Xac minh voi So An Sinh Xa Hoi (goi "truoc khi chuyen vao o")'),
          React.createElement('p', null, 'Den truc tiep van phong An Sinh Xa Hoi de phong van ve sap xep noi o va xac nhan dieu kien NMOHC cung muc bo sung.'),
          React.createElement('ul', { className: 'list-disc pl-5 mt-2 space-y-1' }, [
            React.createElement('li', { key: 'nmohc-4a' }, 'Thong bao rang thanh vien du kien chuyen vao RCFE co cap phep.'),
            React.createElement('li', { key: 'nmohc-4b' }, 'Yeu cau tinh lai muc SSI dua tren muc NMOHC 2026.'),
            React.createElement('li', { key: 'nmohc-4c' }, 'Meo: Xin RCFE cung cap so giay phep va ban nhap cua hop dong tiep nhan; SSA can ban da ky de cap nhat tro cap.')
          ])
        ])
      ]),
      React.createElement('div', {
        key: 'room-board-info',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'rb-1' }, 'Thanh vien MCP chiu trach nhiem thanh toan phan "an o", va MCP thanh toan phan "song ho tro" cho RCFE.'),
        React.createElement('p', { key: 'rb-2' }, 'Voi thanh vien du dieu kien SSI/SSP va NMOHC 2026, muc SSI/SSP la $1,626.07. Thanh vien thuong giu $182 cho chi phi ca nhan; RCFE nhan $1,444.07 cho "an o". Thu nhap vuot $1,444.07 co the dong them cho khu vuc gia cao hoac phong rieng neu RCFE/ARF dong y.'),
        React.createElement('p', { key: 'rb-3' }, 'Thanh vien khong du dieu kien NMOHC van co nghia vu dong gop an o, nhung muc co the linh hoat theo RCFE va muc danh gia cham soc.'),
        React.createElement('p', { key: 'rb-4' }, 'Thanh vien khong the dong bat ky phan an o nao thuong khong du dieu kien CS, vi chuong trinh yeu cau co dong gop an o tu thanh vien (hoac gia dinh).'),
        React.createElement('p', { key: 'rb-5' }, 'RCFE tham gia CalAIM theo quyet dinh rieng cua tung co so. Dac biet o khu vuc dat do, co the it co so tham gia. Gia dinh nen ky vong thuc te rang co so CalAIM co the nam o khu vuc chi phi hop ly hon.')
      ]),
    ]),
    buildSection('Phan 9: Share of Cost (SOC)', [
      React.createElement('div', {
        key: 'soc-note-section',
        className: 'col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2'
      }, [
        React.createElement('p', { key: 'soc-what-is' }, 'Share of Cost (SOC) giong nhu khoan khau tru Medi-Cal hang thang: so tien thanh vien co the can tu chi tra truoc khi Medi-Cal bat dau chi tra dich vu.'),
        React.createElement('p', { key: 'soc-note', className: 'mt-2' }, 'Thong thuong, thanh vien khong the nop CalAIM khi con SOC. SOC thuong can duoc giam ve $0 de du dieu kien.'),
        React.createElement('p', { key: 'soc-link' }, 'Lien ket thong tin chuong trinh: https://connectcalaim.com/info/eligibility'),
        React.createElement('p', { key: 'soc-examples-title', className: 'font-semibold' }, 'Vi du ngan giup giam SOC:'),
        React.createElement('ul', { key: 'soc-examples-list', className: 'list-disc pl-5 space-y-1' }, [
          React.createElement('li', { key: 'soc-example-1' }, 'Nop hoa don bao hiem bo sung (nha khoa/thi luc/Part B/Part D) cho nhan vien quan hạt.'),
          React.createElement('li', { key: 'soc-example-2' }, 'Nop hoa don RCFE va chi phi y te/ho tro hop le do thanh vien tu chi tra.'),
          React.createElement('li', { key: 'soc-example-250' }, 'Vi du: De nghi quan hạt xem xet chuong trinh 250% Working Disabled Program.'),
          React.createElement('li', { key: 'soc-example-3' }, 'Yeu cau nhan vien duyet ho so xem lai toan bo khoan khau tru de co the giam SOC ve $0.'),
        ]),
        React.createElement('p', { key: 'income-note', className: 'mt-2' }, 'O phan sau cua don, nguoi nop se can cung cap chung tu thu nhap An sinh Xa hoi (thu xac nhan hang nam hoac sao ke ngan hang 3 thang the hien thu nhap An sinh Xa hoi).'),
      ]),
    ]),
    buildSection('Phan 13: Co so RCFE mong muon', [
      buildField({
        label: 'Co RCFE uu tien',
        value: data.hasPrefRCFE ? 'Co' : 'Khong',
        type: 'radio',
        options: ['Co', 'Khong'],
        width: 'full'
      }),
      buildField({ label: 'Ten RCFE', value: data.rcfeName, width: 'full' }),
      buildField({ label: 'Dia chi RCFE', value: data.rcfeAddress, width: 'full' }),
      buildField({
        label: 'Cac thanh pho uu tien cho RCFE',
        value: data.rcfePreferredCities,
        width: 'full'
      }),
      buildField({ label: 'Ten quan tri RCFE', value: data.rcfeAdminFirstName, width: 'half' }),
      buildField({ label: 'Ho quan tri RCFE', value: data.rcfeAdminLastName, width: 'half' }),
      buildField({ label: 'Dien thoai quan tri', value: data.rcfeAdminPhone, width: 'half' }),
      buildField({ label: 'Email quan tri', value: data.rcfeAdminEmail, width: 'half' }),
    ]),
    null
  ];

  return React.createElement(
    PrintableFormLayout,
    {
      title: 'Don tom tat thanh vien ho tro cong dong CalAIM',
      subtitle: 'Chuong trinh chuyen tiep song ho tro',
      formType: 'cs-summary',
      applicationData: { id: applicationId },
      showPrintButton,
    },
    layoutChildren
  );
}
