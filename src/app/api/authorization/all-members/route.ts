import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchAllCalAIMMembers, 
  getCaspioCredentialsFromEnv,
  getCaspioToken,
} from '@/lib/caspio-api-utils';

export async function GET(req: NextRequest) {
  try {
    console.log('🚀 API ROUTE CALLED - Authorization Tracker ALL MEMBERS');
    console.log('🔍 Using MCO partitioning method for consistency and scalability...');
    
    // Use the same robust method as social worker assignments
    const credentials = getCaspioCredentialsFromEnv();

    // Fetch ALL members using the proven MCO partitioning approach, including raw data for authorization fields
    const result = await fetchAllCalAIMMembers(credentials, { includeRawData: true });
    console.log(`✅ Fetched ${result.count} total members using MCO partitioning method`);

    const normalizeValue = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' & ')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');
    const isKaiserTargetStatus = (status: unknown) => {
      const normalized = normalizeValue(status);
      return (
        normalized === 'final member at rcfe' ||
        normalized === 'r & b sent pending ils contract'
      );
    };
    const pickFirstNonEmpty = (...values: unknown[]) => {
      for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized) return normalized;
      }
      return '';
    };
    const normalizeTierKey = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[’']/g, "'");
    const parseMoneyValue = (value: unknown) => {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(numeric) ? String(numeric) : '';
    };
    const extractTierNumber = (value: unknown): string => {
      const match = String(value ?? '').match(/(\d+)/);
      return match?.[1] || '';
    };
    const hasAnyAuthData = (rawMember: any) =>
      Boolean(
        rawMember.Authorization_Start_Date_T2038 ||
          rawMember.Authorization_End_Date_T2038 ||
          rawMember.Next_Auth_Start_T2038 ||
          rawMember.Next_Auth_End_T2038 ||
          rawMember.Authorization_Start_Date_H2022 ||
          rawMember.Authorization_End_Date_H2022 ||
          rawMember.Authorization_End_Date_H222 ||
          rawMember.Next_Auth_Start_H2022 ||
          rawMember.Next_Auth_End_H2022 ||
          rawMember.Next_Auth_H2022_Number
      );
    const isKaiserMember = (rawMember: any) =>
      normalizeValue(rawMember.CalAIM_MCO).includes('kaiser');

    // Work directly with raw members to avoid mapping issues.
    // Include members with auth dates plus Kaiser members in target Kaiser_Status buckets
    // so missing-date members can be routed to ILS workflows.
    const rawMembersWithAuthData = result.rawMembers?.filter(rawMember => 
      hasAnyAuthData(rawMember) ||
      (isKaiserMember(rawMember) && isKaiserTargetStatus(rawMember.Kaiser_Status))
    ) || [];
    
    console.log(`📊 Total members: ${result.count}, Members with authorization data: ${rawMembersWithAuthData.length}`);

    // Pull MCO+Tier monthly rate lookup so SNF Diversion expenses can use real tiered rates.
    const tierMonthlyRateByMcoTier = new Map<string, string>();
    const healthNetMonthlyRateByTierNum = new Map<string, string>();
    try {
      const token = await getCaspioToken(credentials);
      const rateSelect = ['MCO', 'Tier', 'H2022_Monthly_Rate', 'Unit_Rate', 'Daily_Rate'].join(',');
      const rateUrl =
        `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_MCO_RCFE_Rates/records` +
        `?q.select=${encodeURIComponent(rateSelect)}` +
        `&q.limit=2000`;
      const rateRes = await fetch(rateUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (rateRes.ok) {
        const rateJson = (await rateRes.json().catch(() => ({}))) as any;
        const rateRows = Array.isArray(rateJson?.Result) ? rateJson.Result : [];
        for (const row of rateRows) {
          const mcoTierKey = normalizeTierKey(row?.MCO);
          const monthly = pickFirstNonEmpty(
            parseMoneyValue(row?.H2022_Monthly_Rate),
            parseMoneyValue(row?.Unit_Rate)
          );
          if (!monthly) continue;
          if (mcoTierKey) tierMonthlyRateByMcoTier.set(mcoTierKey, monthly);

          // Fallback for Health Net members when MCO_and_Tier string format differs from rates table.
          const mcoLabel = normalizeValue(row?.MCO);
          const isHealthNetRateRow = mcoLabel.includes('health net') || mcoLabel.includes('healthnet');
          const tierNum = extractTierNumber(row?.Tier || row?.MCO);
          if (isHealthNetRateRow && tierNum) {
            healthNetMonthlyRateByTierNum.set(tierNum, monthly);
          }
        }
      } else {
        const rateErr = await rateRes.text().catch(() => '');
        console.warn('[authorization/all-members] Could not load tier rates:', rateRes.status, rateErr);
      }
    } catch (rateError: any) {
      console.warn('[authorization/all-members] Tier-rate lookup failed:', rateError?.message || rateError);
    }

    // Transform data for Authorization Tracker (directly from raw members with auth data)
    const transformedMembers = rawMembersWithAuthData.map((rawMember: any, index: number) => {
      // Create a unique ID by combining multiple fields to handle duplicate client_ID2s
      const clientId = rawMember.client_ID2 || rawMember.Client_ID2 || '';
      const uniqueId = `${clientId}-${rawMember.Senior_First || ''}-${rawMember.Senior_Last || ''}-${index}`.replace(/\s+/g, '-');
      const memberTierLabel = rawMember.MCO_and_Tier || rawMember.Tier_Level || '';
      const memberTierNum = extractTierNumber(memberTierLabel);
      const memberPlanNormalized = normalizeValue(rawMember.CalAIM_MCO);
      const isHealthNetMember = memberPlanNormalized.includes('health net') || memberPlanNormalized.includes('healthnet');
      const fallbackHealthNetTierRate =
        isHealthNetMember && memberTierNum ? healthNetMonthlyRateByTierNum.get(memberTierNum) || '' : '';
      
      return {
        // Basic info (from raw Caspio data)
        recordId: uniqueId,
        seniorLastFirstId: clientId,
        clientId2: clientId,
        memberFirstName: rawMember.Senior_First || '',
        memberLastName: rawMember.Senior_Last || '',
        memberMediCalNum: rawMember.MC || '',
        memberMrn: pickFirstNonEmpty(
          rawMember.Member_MRN,
          rawMember.MRN,
          rawMember.Medical_Record_Number,
          rawMember.MCP_CIN
        ),
        memberDob: pickFirstNonEmpty(
          rawMember.Senior_DOB,
          rawMember.DOB,
          rawMember.Date_of_Birth,
          rawMember.Member_DOB,
          rawMember.Birth_Date
        ),
        memberCounty: rawMember.Member_County || 'Los Angeles',
        snfDiversionOrTransition:
          rawMember.SNF_Diversion_or_Transition ||
          rawMember.SNF_Diversion_Or_Transition ||
          rawMember.Pathway ||
          '',
        memberHealthPlan: rawMember.CalAIM_MCO || 'Unknown',
        memberStatus: rawMember.CalAIM_Status || '',
        calaimStatus: rawMember.CalAIM_Status || '',
        kaiserStatus: rawMember.Kaiser_Status || '',
        rcfeName: rawMember.RCFE_Name || '',
        rcfeAddress: [
          rawMember.RCFE_Address || rawMember.RCFE_Street || rawMember.RCFE_Street_Address || '',
          rawMember.RCFE_City || '',
          rawMember.RCFE_Zip || '',
        ]
          .map((value: string) => String(value || '').trim())
          .filter(Boolean)
          .join(', '),
        rcfeAdminName: rawMember.RCFE_Administrator || rawMember.RCFE_Admin_Name || '',
        rcfeCity: rawMember.RCFE_City || '',
        rcfeCounty:
          rawMember.RCFE_County ||
          rawMember.RCFE_County_Name ||
          rawMember.Facility_County ||
          rawMember.Member_County ||
          '',
        rcfePhone: pickFirstNonEmpty(
          rawMember.RCFE_Owner_Phone,
          rawMember.RCFE_Admin_RCFE_Owner_Phone,
          rawMember.RCFE_Administrator_Phone,
          rawMember.RCFE_Admin_Phone,
          rawMember.RCFE_Phone
        ),
        authorizationNumber:
          pickFirstNonEmpty(
            rawMember.Next_Auth_H2022_Number,
            rawMember.Authorization_Number_T038,
            rawMember.Authorization_Number_T2038,
            rawMember.Authorization_Number,
            rawMember.Authorization_Number_H2022
          ),
        tierLevel:
          rawMember.MCO_and_Tier ||
          rawMember.Tier_Level ||
          rawMember.Kaiser_Tier_Level_Received ||
          rawMember.Kaiser_Tier_Level_Requested ||
          '',
        tierMonthlyRate:
          pickFirstNonEmpty(
            tierMonthlyRateByMcoTier.get(normalizeTierKey(memberTierLabel)),
            fallbackHealthNetTierRate,
            parseMoneyValue(rawMember.Tier_Level_Monthly_Rate),
            parseMoneyValue(rawMember.Tier_Monthly_Rate),
            parseMoneyValue(rawMember.Monthly_Tier_Rate),
            parseMoneyValue(rawMember.Tier_Rate_Monthly),
            parseMoneyValue(rawMember.RCFE_Monthly_Rate),
            parseMoneyValue(rawMember.RCFE_Tier_Rate),
            parseMoneyValue(rawMember.Tier_Rate),
            parseMoneyValue(rawMember.Tier_Amount),
            parseMoneyValue(rawMember.SNF_Diversion_Monthly_Expense),
            parseMoneyValue(rawMember.New_Expense_Monthly)
          ),
        diversionMonthlyExpense:
          pickFirstNonEmpty(
            tierMonthlyRateByMcoTier.get(normalizeTierKey(memberTierLabel)),
            fallbackHealthNetTierRate,
            parseMoneyValue(rawMember.Tier_Level_Monthly_Rate),
            parseMoneyValue(rawMember.Tier_Monthly_Rate),
            parseMoneyValue(rawMember.Monthly_Tier_Rate),
            parseMoneyValue(rawMember.Tier_Rate_Monthly),
            parseMoneyValue(rawMember.RCFE_Monthly_Rate),
            parseMoneyValue(rawMember.RCFE_Tier_Rate),
            parseMoneyValue(rawMember.Tier_Rate),
            parseMoneyValue(rawMember.Tier_Amount),
            parseMoneyValue(rawMember.SNF_Diversion_Monthly_Expense),
            parseMoneyValue(rawMember.New_Expense_Monthly)
          ),
        
        // Authorization fields (from raw Caspio data)
        authStartDateT2038: rawMember.Authorization_Start_Date_T2038 || '',
        authEndDateT2038: rawMember.Authorization_End_Date_T2038 || '',
        nextAuthStartDateT2038: rawMember.Next_Auth_Start_T2038 || '',
        nextAuthEndDateT2038: rawMember.Next_Auth_End_T2038 || '',
        authStartDateH2022: pickFirstNonEmpty(
          rawMember.Next_Auth_Start_H2022,
          rawMember.Authorization_Start_Date_H2022
        ),
        authEndDateH2022: pickFirstNonEmpty(
          rawMember.Next_Auth_End_H2022,
          rawMember.Authorization_End_Date_H2022,
          rawMember.Authorization_End_Date_H222
        ),
        nextAuthStartDateH2022: rawMember.Next_Auth_Start_H2022 || '',
        nextAuthEndDateH2022: rawMember.Next_Auth_End_H2022 || '',
        nextAuthNumberH2022: rawMember.Next_Auth_H2022_Number || '',
        authExtRequestDateT2038: rawMember.Requested_Auth_Extension_T2038 || rawMember.Auth_Ext_Request_Date_T2038 || '',
        authExtRequestDateH2022: rawMember.Requested_Auth_Extension_H2022 || '',
        
        // Additional useful fields (from raw data)
        primaryContact: rawMember.Primary_Contact || '',
        contactPhone: rawMember.Contact_Phone || '',
        contactEmail: rawMember.Contact_Email || '',
      };
    });
    
    console.log(`✅ Transformed ${transformedMembers.length} members for authorization tracking`);
    
    return NextResponse.json({ 
      success: true, 
      members: transformedMembers,
      totalCount: transformedMembers.length 
    });
    
  } catch (error: any) {
    console.error('❌ Error in Authorization API:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch authorization data' 
    }, { status: 500 });
  }
}