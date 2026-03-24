import { normalizeKaiserStatusName } from '@/lib/kaiser-status-progression';

export interface KaiserMember {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  birthDate?: string;
  Birth_Date?: string;
  memberCounty: string;
  memberPhone: string;
  memberEmail: string;
  client_ID2: string;
  pathway: string;
  Kaiser_Status: string;
  T2038_Auth_Email_Kaiser?: string;
  // Caspio field: tracks staff/user assignment for Kaiser
  Kaiser_User_Assignment?: string;
  CalAIM_Status: string;
  Staff_Assigned: string;
  Next_Step_Due_Date: string;
  Kaiser_Next_Step_Date: string;
  workflow_step: string;
  workflow_notes: string;
  last_updated: string;
  created_at: string;
  Kaiser_Tier_Level_Received_Date?: string;
  ILS_RCFE_Sent_For_Contract_Date?: string;
  RCFE_Name?: string;
  RCFE_Admin_Email?: string;
}

export const getMemberKey = (member: KaiserMember, index: number) =>
  `${member.id}-${member.client_ID2}-${member.memberFirstName}-${member.memberLastName}-${index}`;

export const hasMeaningfulValue = (value: unknown) => {
  const s = value != null ? String(value).trim() : '';
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower !== 'null' && lower !== 'undefined' && lower !== 'n/a' && lower !== 'no status';
};

export const getEffectiveKaiserStatus = (member: Partial<KaiserMember> & Record<string, any>): string => {
  // If Kaiser has authorized (email flag present) but official T2038 isn't received yet,
  // bucket these into "T2038 Auth Only Email" for summary/reporting.
  const hasAuthEmail = hasMeaningfulValue(member?.T2038_Auth_Email_Kaiser);
  const hasOfficialAuth =
    hasMeaningfulValue(member?.Kaiser_T2038_Received_Date) ||
    hasMeaningfulValue(member?.Kaiser_T038_Received) ||
    hasMeaningfulValue(member?.Kaiser_T2038_Received);

  if (hasAuthEmail && !hasOfficialAuth) return 'T2038 Auth Only Email';

  const raw =
    member?.Kaiser_Status ??
    member?.Kaiser_ID_Status ??
    member?.KaiserIdStatus ??
    member?.KaiserStatus ??
    '';
  if (!hasMeaningfulValue(raw)) return 'Unknown';

  return normalizeKaiserStatusName(String(raw));
};

export const getStatusColor = (status: string): string => {
  const normalized = normalizeKaiserStatusName(status);
  const statusColors: Record<string, string> = {
    'Complete': 'bg-green-50 text-green-700 border-green-200',
    'Active': 'bg-blue-50 text-blue-700 border-blue-200',
    'Pending': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'On-Hold': 'bg-orange-50 text-orange-700 border-orange-200',
    'Non-active': 'bg-gray-50 text-gray-700 border-gray-200',
    'Case Closed': 'bg-slate-100 text-slate-800 border-slate-300',
    'Denied': 'bg-red-50 text-red-700 border-red-200',
    'Expired': 'bg-red-50 text-red-700 border-red-200',
    'T2038 Requested': 'bg-purple-50 text-purple-700 border-purple-200',
    'RN Visit Complete': 'bg-teal-50 text-teal-700 border-teal-200',
    'RN Visit Complete, Pending Signatures': 'bg-cyan-50 text-cyan-800 border-cyan-200',
    'Tier Level Requested': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Tier Level Received': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'RN/MSW Scheduled': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'R&B Requested': 'bg-pink-50 text-pink-700 border-pink-200',
    'R&B Signed': 'bg-pink-50 text-pink-700 border-pink-200',
    'T2038 received, doc collection': 'bg-violet-50 text-violet-700 border-violet-200',
    'T2038 received, Need First Contact': 'bg-violet-50 text-violet-700 border-violet-200',
    'Tier Level Appeal': 'bg-amber-50 text-amber-700 border-amber-200',
    'Tier Level Request Needed': 'bg-slate-50 text-slate-700 border-slate-200',
    'T2038 Auth Only Email': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'T2038 Request Ready': 'bg-lime-50 text-lime-700 border-lime-200',
    'T2038, Not Requested, Doc Collection': 'bg-rose-50 text-rose-700 border-rose-200',
    'RCFE Needed': 'bg-sky-50 text-sky-700 border-sky-200',
    'ILS Sent for Contract': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    'R&B Needed': 'bg-orange-50 text-orange-700 border-orange-200',
    'RN Visit Needed': 'bg-red-50 text-red-700 border-red-200',
    'RCFE_Located': 'bg-green-50 text-green-700 border-green-200',
    'ILS Contract Email Needed': 'bg-blue-50 text-blue-700 border-blue-200',
    'ILS/RCFE_Member_At_RCFE_Need_Conf': 'bg-amber-50 text-amber-800 border-amber-200',
    'ILS/RCFE_Member_At_RCFE_Confirmed': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return statusColors[normalized] || statusColors[status] || 'bg-gray-50 text-gray-700 border-gray-200';
};

export const formatBirthDate = (member: any): string => {
  const raw = String(member?.birthDate || member?.Birth_Date || '').trim();
  if (!raw) return 'Not set';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString();
  } catch {
    return raw;
  }
};

