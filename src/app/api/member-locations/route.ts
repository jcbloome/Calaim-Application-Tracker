import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Types for CalAIM Member data
interface CalAIMMember {
  id: string;
  recordId?: string;
  seniorLastFirstId?: string;
  clientId2?: string;
  firstName: string;
  lastName: string;
  county: string;
  city?: string;
  currentLocation?: string;
  customaryCounty?: string;
  customaryCity?: string;
  healthPlan?: string;
  pathway?: string;
  mco?: string;
  diversionOrTransition?: string;
  status?: string;
  kaiserStatus?: string;
  calaimStatus?: string;
  assignedStaff?: string;
  socialWorkerAssigned?: string;
  rcfeRegisteredId?: string;
  rcfeName?: string;
  rcfeAddress?: string;
  rcfeCity?: string;
  rcfeState?: string;
  rcfeZip?: string;
  rcfeCounty?: string;
}

export async function GET(request: NextRequest) {
  try {
    const debugMode = request.nextUrl.searchParams.get('debug') === '1';
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';
    console.log('👥 Fetching CalAIM member locations from Caspio...');
    
    let allMembers: any[] = [];

    // Default: load from Firestore cache (no Caspio calls).
    if (!(forceRefresh || debugMode)) {
      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const snapshot = await adminDb
        .collection('caspio_members_cache')
        .limit(5000)
        .get();
      allMembers = snapshot.docs.map((doc) => doc.data());
      if (allMembers.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Members cache is empty. Click "Sync from Caspio" to load data.',
            data: {
              membersByCounty: {},
              membersByCity: {},
              membersByRCFE: {},
              totalMembers: 0,
              counties: 0,
              cities: 0,
              rcfesWithMembers: 0,
              breakdown: { active: 0, kaiser: 0, healthNet: 0, snfTransition: 0, snfDiversion: 0 },
              sourceTable: 'firestore-cache-empty',
            },
          },
          { status: 409 }
        );
      }
      console.log(`✅ Loaded ${allMembers.length} members from Firestore cache`);
    } else {
      const credentials = getCaspioCredentialsFromEnv();
      console.log('🔄 Refresh/debug: Fetching ALL CalAIM members with partition strategy...');
      const result = await fetchAllCalAIMMembers(credentials, {
        includeRawData: true,
        forceRefresh: true,
        cacheTtlMs: 0,
      });
      allMembers = result.rawMembers || [];
      console.log(`✅ Partition fetch complete: ${allMembers.length} total CalAIM members`);
    }

    if (debugMode) {
      const statusKeyCounts: Record<string, Record<string, number>> = {};
      const statusKeys = new Set<string>();

      if (allMembers.length > 0) {
        Object.keys(allMembers[0]).forEach((key) => {
          if (key.toLowerCase().includes('status')) statusKeys.add(key);
        });
      }

      allMembers.forEach((record) => {
        statusKeys.forEach((key) => {
          const value = record[key];
          const normalized = value == null ? 'null' : String(value).trim() || '(empty)';
          if (!statusKeyCounts[key]) statusKeyCounts[key] = {};
          statusKeyCounts[key][normalized] = (statusKeyCounts[key][normalized] || 0) + 1;
        });
      });

      const topStatusValues: Record<string, Array<{ value: string; count: number }>> = {};
      Object.entries(statusKeyCounts).forEach(([key, counts]) => {
        topStatusValues[key] = Object.entries(counts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      });

      const firstRecord = allMembers[0] || {};
      const statusSamples: Record<string, any> = {};
      Array.from(statusKeys).forEach((key) => {
        statusSamples[key] = firstRecord[key];
      });

      return NextResponse.json({
        success: true,
        debug: {
          totalRecordsFetched: allMembers.length,
          statusKeys: Array.from(statusKeys),
          topStatusValues,
          statusSamples,
          firstRecordKeys: Object.keys(firstRecord)
        }
      });
    }
    
    // Show total status breakdown before filtering
    const totalStatuses = allMembers.reduce((acc: any, member: any) => {
      const status = member.CalAIM_Status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 TOTAL STATUS BREAKDOWN (before filtering):', totalStatuses);
    
    // Debug: Show available fields in the first record
    if (allMembers.length > 0) {
      console.log('🔍 Available member fields:', Object.keys(allMembers[0]));
      console.log('📋 Sample member record:', allMembers[0]);
      
      // Use EXACT same debugging as authorization tracker with unique ID fields
      console.log('🔍 First 5 members CalAIM_Status values with unique IDs:');
      allMembers.slice(0, 5).forEach((member, index) => {
        console.log(`Member ${index + 1}:`, {
          Name: `${member.Senior_First} ${member.Senior_Last}`,
          Record_ID: member.Record_ID,
          Senior_Last_First_ID: member.Senior_Last_First_ID,
          Client_ID2: member.Client_ID2,
          CalAIM_Status: member.CalAIM_Status,
          statusType: typeof member.CalAIM_Status,
          statusLength: member.CalAIM_Status ? member.CalAIM_Status.length : 0
        });
      });
      
      const uniqueStatuses = [...new Set(allMembers.map(m => m.CalAIM_Status).filter(Boolean))];
      console.log('📊 Unique CalAIM_Status values in member data:', uniqueStatuses);
      console.log('📊 Status value counts:');
      uniqueStatuses.forEach(status => {
        const count = allMembers.filter(m => m.CalAIM_Status === status).length;
        console.log(`  "${status}": ${count} members`);
      });
      
      // Check for any status that might be "Authorized" with different casing or spaces
      const allStatusValues = allMembers.map(m => m.CalAIM_Status).filter(Boolean);
      const authorizedVariations = allStatusValues.filter(status => 
        status && (
          status.toLowerCase().includes('auth') ||
          status.toLowerCase().includes('approve') ||
          status.toLowerCase().includes('active')
        )
      );
      console.log('🔍 Status values containing "auth", "approve", or "active":', [...new Set(authorizedVariations)]);
      
      // Show raw status values for first 10 members
      console.log('🔍 Raw CalAIM_Status values for first 10 members:');
      allMembers.slice(0, 10).forEach((member, index) => {
        console.log(`  ${index + 1}. "${member.CalAIM_Status}" (length: ${member.CalAIM_Status?.length || 0}, type: ${typeof member.CalAIM_Status})`);
      });
    }

    const getStatusValue = (record: any) => {
      const preferred =
        record.CalAIM_Status ??
        record.Calaim_Status ??
        record.calaim_status ??
        record.Status ??
        record.status;

      if (preferred) return preferred;

      const statusKeys = Object.keys(record).filter((key) =>
        key.toLowerCase().includes('status') && key.toLowerCase().includes('calaim')
      );
      for (const key of statusKeys) {
        const value = record[key];
        if (value) return value;
      }

      const genericStatusKeys = Object.keys(record).filter((key) =>
        key.toLowerCase().includes('status')
      );
      for (const key of genericStatusKeys) {
        const value = record[key];
        if (value) return value;
      }

      return 'Unknown';
    };
    const isAuthorizedStatus = (status: any) => {
      if (!status) return false;
      const normalized = String(status).trim().toLowerCase();
      return normalized === 'authorized' || normalized.startsWith('authorized ');
    };

    // Filter to authorized members only (do not require valid names)
    const authorizedMembers = allMembers.filter((record) =>
      isAuthorizedStatus(getStatusValue(record))
    );

    console.log(`📊 Total members: ${allMembers.length}, Authorized members: ${authorizedMembers.length}`);

    // Map member data using same field mapping as authorization tracker (authorized members)
    const members: CalAIMMember[] = authorizedMembers.map((record: any) => {
      // Use EXACT same field names as authorization tracker
      const firstName = record.Senior_First || record.MemberFirstName || record.FirstName || 'Unknown';
      const lastName = record.Senior_Last || record.MemberLastName || record.LastName || 'Unknown';
      const county = record.Member_County || record.MemberCounty || record.County || 'Unknown';
      const city = record.MemberCity || record.City || record.CurrentCity || '';
      const currentLocation = record.CurrentLocation || record.current_location || '';
      const customaryCounty = record.CustomaryCounty || record.customary_county || '';
      const customaryCity = record.CustomaryCity || record.customary_city || '';
      
      const mco =
        record.CalAIM_MCO ||
        record.CalAIM_MCP ||
        record.HealthPlan ||
        record.MC_Plan ||
        record.Health_Plan ||
        record.MCP ||
        record.MCO ||
        record.Plan_Name ||
        'Unknown';
      const diversionOrTransition =
        record.SNF_Diversion_or_Transition ||
        record.Snf_Diversion_or_Transition ||
        record.snf_diversion_or_transition ||
        '';
      // Keep compatibility for existing downstream fields, but prefer the requested SNF_Diversion_or_Transition.
      const healthPlan = mco;
      const pathway = diversionOrTransition || record.Pathway || record.pathway || '';
      
      // Use EXACT same CalAIM_Status field as authorization tracker
      const status = getStatusValue(record) || 'Unknown';
      const kaiserStatus = record.Kaiser_Status || record.kaiser_status || '';
      const assignedStaff =
        record.Social_Worker_Assigned ||
        record.social_worker_assigned ||
        record.kaiser_user_assignment ||
        record.assigned_staff ||
        '';
      
      // RCFE Information using the registered ID and related fields
      const rcfeRegisteredId = record.RCFE_Registered_ID || record.rcfe_registered_id || '';
      const rcfeName = record.RCFEName || record.rcfe_name || record.RCFE_Name || '';
      const rcfeAddress = record.RCFE_Address || record.RCFEAddress || record.rcfe_address || '';
      const rcfeCity = record.RCFE_City || record.rcfe_city || '';
      const rcfeState = record.RCFE_State || record.rcfe_state || 'CA';
      const rcfeZip = record.RCFE_Zip || record.rcfe_zip || '';
      const rcfeCounty = record.RCFE_County || record.rcfe_county || '';

      return {
        id: record.Record_ID || record.ID || record.id || Math.random().toString(36),
        recordId: record.Record_ID || '',
        seniorLastFirstId: record.Senior_Last_First_ID || '',
        clientId2: record.Client_ID2 || '',
        firstName,
        lastName,
        county,
        city,
        currentLocation,
        customaryCounty,
        customaryCity,
        healthPlan,
        pathway,
        mco,
        diversionOrTransition,
        status,
        kaiserStatus,
        calaimStatus: status,
        assignedStaff,
        socialWorkerAssigned: assignedStaff,
        rcfeRegisteredId,
        rcfeName,
        rcfeAddress,
        rcfeCity,
        rcfeState,
        rcfeZip,
        rcfeCounty
      };
    });

    console.log(`📊 Total processed authorized members: ${members.length}`);

    const filteredMembers = members;

    const cleanKey = (value: unknown, fallback: string) => {
      const s = String(value ?? '').trim();
      return s || fallback;
    };

    const toTopList = (counts: Map<string, number>) =>
      Array.from(counts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const byHealthPlanMap = new Map<string, number>();
    const byPathwayMap = new Map<string, number>();
    filteredMembers.forEach((m) => {
      const plan = cleanKey((m as any)?.mco || (m as any)?.healthPlan, 'Unknown');
      const path = cleanKey((m as any)?.diversionOrTransition || (m as any)?.pathway, 'Unknown');
      byHealthPlanMap.set(plan, (byHealthPlanMap.get(plan) || 0) + 1);
      byPathwayMap.set(path, (byPathwayMap.get(path) || 0) + 1);
    });

    // Show some examples of authorized members
    if (filteredMembers.length > 0) {
      console.log('✅ Sample authorized members with unique IDs:');
      filteredMembers.slice(0, 3).forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.firstName} ${member.lastName} - ${member.county} County`, {
          Status: member.calaimStatus,
          Record_ID: member.recordId,
          Senior_Last_First_ID: member.seniorLastFirstId,
          Client_ID2: member.clientId2,
          RCFE_ID: member.rcfeRegisteredId
        });
      });
    }

    console.log(`✅ Processed ${members.length} authorized CalAIM members`);
    
    // Debug: Show members with RCFE assignments
    const membersWithRCFE = filteredMembers.filter(m => m.rcfeRegisteredId && String(m.rcfeRegisteredId).trim() !== '');
    console.log(`🏠 Authorized members with RCFE assignments: ${membersWithRCFE.length}`);
    
    if (membersWithRCFE.length > 0) {
      console.log('📋 Sample members with RCFE assignments:');
      membersWithRCFE.slice(0, 5).forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.firstName} ${member.lastName} → RCFE ID: ${member.rcfeRegisteredId} (${member.rcfeName})`);
      });
    }

    // Group by county
    const membersByCounty = filteredMembers.reduce((acc: any, member) => {
      if (!acc[member.county]) {
        acc[member.county] = {
          county: member.county,
          members: [],
          totalMembers: 0,
          activeMembers: 0,
          kaiserMembers: 0,
          healthNetMembers: 0,
          snfTransition: 0,
          snfDiversion: 0
        };
      }

      acc[member.county].members.push(member);
      acc[member.county].totalMembers++;
      
      if (member.status === 'Active' || member.calaimStatus === 'Active') {
        acc[member.county].activeMembers++;
      }
      
      if (member.healthPlan === 'Kaiser') {
        acc[member.county].kaiserMembers++;
      } else if (member.healthPlan === 'Health Net') {
        acc[member.county].healthNetMembers++;
      }
      
      if (member.pathway === 'SNF Transition') {
        acc[member.county].snfTransition++;
      } else if (member.pathway === 'SNF Diversion') {
        acc[member.county].snfDiversion++;
      }

      return acc;
    }, {});

    const byCountyList = Object.values(membersByCounty)
      .map((c: any) => ({
        name: cleanKey(c?.county, 'Unknown'),
        value: Number(c?.totalMembers || 0),
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    // Also group by city for more granular data
    const membersByCity = filteredMembers.reduce((acc: any, member) => {
      const cityKey = member.city ? `${member.city}, ${member.county}` : member.county;
      
      if (!acc[cityKey]) {
        acc[cityKey] = {
          city: member.city || 'County-wide',
          county: member.county,
          members: [],
          totalMembers: 0
        };
      }

      acc[cityKey].members.push(member);
      acc[cityKey].totalMembers++;

      return acc;
    }, {});

    // Group by RCFE facility using Registered ID for accurate matching
    const membersByRCFE = filteredMembers
      .filter(member => member.rcfeRegisteredId && String(member.rcfeRegisteredId).trim() !== '')
      .reduce((acc: any, member) => {
        const rcfeKey = member.rcfeRegisteredId; // Use registered ID as unique key
        
        if (!acc[rcfeKey]) {
          acc[rcfeKey] = {
            rcfeRegisteredId: member.rcfeRegisteredId,
            rcfeName: member.rcfeName,
            rcfeAddress: member.rcfeAddress,
            rcfeCity: member.rcfeCity,
            rcfeState: member.rcfeState,
            rcfeZip: member.rcfeZip,
            rcfeCounty: member.rcfeCounty || member.county, // Use RCFE county or member county
            county: member.county, // Member's county for location
            members: [],
            totalMembers: 0,
            uniqueMembers: new Set() // Track unique members by ID
          };
        }

        // Use unique ID to avoid duplicates
        const memberUniqueId = member.seniorLastFirstId || member.clientId2 || member.recordId || member.id;
        if (!acc[rcfeKey].uniqueMembers.has(memberUniqueId)) {
          acc[rcfeKey].uniqueMembers.add(memberUniqueId);
          acc[rcfeKey].members.push(member);
          acc[rcfeKey].totalMembers++;
        }

        return acc;
      }, {});

    // Clean up the uniqueMembers Set from the final data (not serializable)
    Object.values(membersByRCFE).forEach((rcfe: any) => {
      delete rcfe.uniqueMembers;
    });

    console.log(`🏠 RCFEs with members: ${Object.keys(membersByRCFE).length}`);
    if (Object.keys(membersByRCFE).length > 0) {
      console.log('📋 RCFE facilities with member counts:');
      Object.entries(membersByRCFE).forEach(([rcfeId, data]: [string, any]) => {
        console.log(`  RCFE ID: ${rcfeId} → ${data.rcfeName} (${data.totalMembers} members)`);
      });
    }

    const response = {
      success: true,
      data: {
        membersByCounty,
        membersByCity,
        membersByRCFE,
        members: filteredMembers,
        totalMembers: filteredMembers.length,
        counties: Object.keys(membersByCounty).length,
        cities: Object.keys(membersByCity).length,
        rcfesWithMembers: Object.keys(membersByRCFE).length,
        byCounty: byCountyList,
        byHealthPlan: toTopList(byHealthPlanMap),
        byPathway: toTopList(byPathwayMap),
        breakdown: {
          active: filteredMembers.filter(m => m.status === 'Active' || m.calaimStatus === 'Active').length,
          kaiser: filteredMembers.filter(m => m.healthPlan === 'Kaiser').length,
          healthNet: filteredMembers.filter(m => m.healthPlan === 'Health Net').length,
          snfTransition: filteredMembers.filter(m => m.pathway === 'SNF Transition').length,
          snfDiversion: filteredMembers.filter(m => m.pathway === 'SNF Diversion').length,
        },
        sourceTable: 'CalAIM_tbl_Members'
      }
    };

    console.log('👥 CalAIM members summary:', response.data);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Error fetching CalAIM member locations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch CalAIM member locations',
        data: { 
          membersByCounty: {}, 
          membersByCity: {},
          membersByRCFE: {},
          totalMembers: 0, 
          counties: 0,
          cities: 0,
          rcfesWithMembers: 0,
          breakdown: { active: 0, kaiser: 0, healthNet: 0, snfTransition: 0, snfDiversion: 0 },
          sourceTable: 'none'
        }
      },
      { status: 500 }
    );
  }
}