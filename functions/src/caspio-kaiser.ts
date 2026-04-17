import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { buildCaspioConfig, getCaspioAccessTokenFromConfig } from './caspio-auth';

const caspioBaseUrl = defineSecret('CASPIO_BASE_URL');
const caspioClientId = defineSecret('CASPIO_CLIENT_ID');
const caspioClientSecret = defineSecret('CASPIO_CLIENT_SECRET');

function normalizeCaspioBlankValue(value: any): any {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return value
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeCaspioBlankValue(entry));
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([k, v]) => {
      out[k] = normalizeCaspioBlankValue(v);
    });
    return out;
  }
  return value;
}

function getRuntimeCaspioConfig() {
  const fallback = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/integrations/rest/v3';
  const rawBase = (() => {
    try { return caspioBaseUrl.value() || fallback; } catch { return fallback; }
  })();
  const clientId = (() => {
    try { return caspioClientId.value() || process.env.CASPIO_CLIENT_ID || ''; } catch { return process.env.CASPIO_CLIENT_ID || ''; }
  })();
  const clientSecret = (() => {
    try { return caspioClientSecret.value() || process.env.CASPIO_CLIENT_SECRET || ''; } catch { return process.env.CASPIO_CLIENT_SECRET || ''; }
  })();
  const cfg = buildCaspioConfig(rawBase, clientId, clientSecret);
  return { ...cfg, clientId, clientSecret };
}

async function getRuntimeCaspioAccessToken(): Promise<string> {
  const cfg = getRuntimeCaspioConfig();
  return getCaspioAccessTokenFromConfig(cfg);
}

const KAISER_STATUS_NEXT: Record<string, string> = {
  'T2038 Request': 'T2038 Requested',
  'T2038 Requested': 'T2038 received',
  'T2038 received': 'T2038 Auth Onhold',
  'T2038 Auth Onhold': 'RN Visit Needed',
  'RN Visit Needed': 'RN/MSW Scheduled',
  'RN/MSW Scheduled': 'RN Visit Complete',
  'RN Visit Complete': 'Tier Level Requested',
  'Tier Level Requested': 'Tier Level Received',
  'Tier Level Received': 'Tier Level Appeal',
  'Tier Level Appeal': 'RCFE Needed',
  'RCFE Needed': 'RCFE_Located',
  'RCFE_Located': 'R&B Needed',
  'R&B Needed': 'R&B Requested',
  'R&B Requested': 'R&B Signed',
  'R&B Signed': 'ILS Contract Email',
  'ILS Contract Email': 'ILS Contracted',
  'ILS Contracted': 'ILS Confirmed Contract',
  'ILS Confirmed Contract': 'ILS Sent for Contract',
  'ILS Sent for Contract': 'ILS Contracted and Paid',
  'ILS Contracted and Paid': 'Complete',
  'Non-active': 'Review Status',
  'On-Hold': 'Review Status',
};

function getNextStepForStatus(status: string): string {
  return KAISER_STATUS_NEXT[status] || '';
}

const CORS_ORIGINS = [
  /localhost/,
  /\.vercel\.app$/,
  /\.netlify\.app$/,
  /\.firebaseapp\.com$/,
  /connectcalaim\.com$/,
];

export const fetchKaiserMembersFromCaspio = onCall(
  {
    cors: CORS_ORIGINS,
    secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret],
  },
  async (request) => {
    const includeAllMembers = request.data?.includeAllMembers === true;
    try {
      const { restBaseUrl } = getRuntimeCaspioConfig();
      const accessToken = await getRuntimeCaspioAccessToken();

      const membersTable = 'CalAIM_tbl_Members';
      let allMembers: any[] = [];
      const pageSize = 1000;
      let pageNumber = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(
          `${restBaseUrl}/tables/${membersTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
          const err = await res.text();
          throw new HttpsError('internal', `Failed to fetch members page ${pageNumber}: ${res.status} ${err}`);
        }
        const json = await res.json();
        const page: any[] = json.Result || [];
        allMembers = allMembers.concat(page);
        pageNumber++;
        if (page.length < pageSize || pageNumber > 50) hasMore = false;
      }

      const membersToProcess = includeAllMembers
        ? allMembers
        : allMembers.filter(
            (m) =>
              m.CalAIM_MCP === 'Kaiser' ||
              m.CalAIM_MCO === 'Kaiser' ||
              m.HealthPlan === 'Kaiser' ||
              m.Kaiser_Status
          );

      const members = membersToProcess.map((rawMember: any, index: number) => {
        const member = normalizeCaspioBlankValue(rawMember || {});
        const id2 =
          member.client_ID2 || member.Client_ID2 || member.CLIENT_ID2 || member.clientID2 || member.ClientID2 || '';
        return {
          memberFirstName: member.Senior_First || '',
          memberLastName: member.Senior_Last || '',
          memberMediCalNum: member.MC || '',
          memberMrn: member.MCP_CIN || '',
          memberCounty: member.Member_County || '',
          client_ID2: id2,
          MCP_CIN: member.MCP_CIN || '',
          CalAIM_MCP: member.CalAIM_MCP || '',
          Kaiser_Status: member.Kaiser_Status || 'Pending',
          CalAIM_Status: member.CalAIM_Status || 'Pending',
          kaiser_user_assignment: member.Kaiser_User_Assignment || '',
          pathway: member.SNF_Diversion_or_Transition || '',
          HealthPlan: member.CalAIM_MCP || 'Kaiser',
          DateCreated: member.DateCreated || '',
          next_steps_date: member.next_steps_date || '',
          last_updated: member.LastUpdated || member.last_updated || '',
          Kaiser_T2038_Requested_Date: member.Kaiser_T038_Requested || member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date || '',
          Kaiser_T2038_Received_Date: member.Kaiser_T038_Received || member.Kaiser_T2038_Received || member.Kaiser_T2038_Received_Date || '',
          Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date || '',
          Kaiser_Tier_Level_Received_Date: member.Kaiser_Tier_Level_Received || member.Kaiser_Tier_Level_Received_Date || '',
          ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date || member.ILS_RCFE_Sent_For_Contract || '',
          ILS_RCFE_Received_Contract_Date: member.ILS_RCFE_Received_Contract_Date || member.ILS_RCFE_Received_Contract || '',
          authStartDateT2038: member.Authorization_Start_Date_T2038 || null,
          authEndDateT2038: member.Authorization_End_Date_T2038 || null,
          authStartDateH2022: member.Authorization_Start_Date_H2022 || null,
          authEndDateH2022: member.Authorization_End_Date_H2022 || null,
          authExtRequestDateT2038: member.Requested_Auth_Extension_T2038 || null,
          authExtRequestDateH2022: member.Requested_Auth_Extension_H2022 || null,
          caspio_id: id2 || member.id || `caspio-${index}`,
          source: 'caspio',
          id: `caspio-member-${index}-${id2 || 'unknown'}`,
          next_step: getNextStepForStatus(member.Kaiser_Status || ''),
        };
      });

      return {
        success: true,
        message: `Successfully fetched ${members.length} members from Caspio`,
        members,
        total: members.length,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Unexpected error: ${error.message}`);
    }
  }
);

export const updateKaiserMemberDates = onCall(
  { secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret] },
  async (request) => {
    const { memberId, updates } = request.data;

    if (!memberId) throw new HttpsError('invalid-argument', 'memberId is required');
    if (!updates || Object.keys(updates).length === 0)
      throw new HttpsError('invalid-argument', 'updates object is required');

    try {
      const { restBaseUrl } = getRuntimeCaspioConfig();
      const accessToken = await getRuntimeCaspioAccessToken();

      const updateData: any = { LastUpdated: new Date().toISOString() };
      const dateFields = [
        'Kaiser_T2038_Requested_Date',
        'Kaiser_T2038_Received_Date',
        'Kaiser_Tier_Level_Requested_Date',
        'Kaiser_Tier_Level_Received_Date',
        'ILS_RCFE_Sent_For_Contract_Date',
        'ILS_RCFE_Received_Contract_Date',
      ];
      for (const f of dateFields) {
        if (updates[f]) updateData[f] = updates[f];
      }

      const membersTable = 'CalAIM_tbl_Members';
      const whereClause = memberId.startsWith('CL')
        ? `client_ID2='${memberId}'`
        : `Record_ID='${memberId}'`;
      const updateUrl = `${restBaseUrl}/tables/${membersTable}/records?q.where=${whereClause}`;

      const res = await fetch(updateUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new HttpsError('internal', `Failed to update Caspio dates: ${res.status} ${err}`);
      }

      const result = await res.json();
      return {
        success: true,
        message: `Successfully updated Kaiser member dates for ${memberId}`,
        updatedFields: Object.keys(updateData).filter((k) => k !== 'LastUpdated'),
        caspioResult: result,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Unexpected error: ${error.message}`);
    }
  }
);
