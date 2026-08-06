import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { adminDb, default as admin } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RcfeDirectoryStatusDoc = {
  rcfeRegisteredId: string;
  lastUpdatedAt?: any;
  lastUpdatedByUid?: string | null;
  lastUpdatedByEmail?: string | null;
  lastNumberOfBeds?: string | null;
  lastCounty?: string | null;
  lastRcfeName?: string | null;
  lastNpiNumber?: string | null;
  lastLicenseNumber?: string | null;
  lastAdminName?: string | null;
  lastAdminEmail?: string | null;
  lastAdminPhone?: string | null;
  lastStreet?: string | null;
  lastCity?: string | null;
  lastState?: string | null;
  lastZip?: string | null;
  lastAddress?: string | null;
};

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const getDateMs = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.getTime() : 0;
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
};

const normalizeCompositeKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .split('|')
    .map((segment) => segment.replace(/[^a-z0-9]/g, ''))
    .join('|');

type RcfeRegistryRow = {
  rcfeRegisteredId: string;
  rcfeName: string;
  numberOfBeds: string | null;
  county: string | null;
  npiNumber: string | null;
  registrationTimestamp: string | null;
};

async function fetchRcfeRegistryBedMaps() {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const byRegisteredId: Record<string, RcfeRegistryRow> = {};
  const byName: Record<string, RcfeRegistryRow> = {};

  const pageSize = 1000;
  const maxPages = 250;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const buildUrl = (fields: string[]) =>
      `${credentials.baseUrl}/integrations/rest/v3/tables/${encodeURIComponent(
        'CalAIM_tbl_New_RCFE_Registration'
      )}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}&q.select=${encodeURIComponent(fields.join(','))}`;

    // Caspio environments sometimes differ by column availability. Try the most complete
    // query first, then progressively fallback to variants that still let us fetch NPI.
    const fieldCandidates: string[][] = [
      ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County', 'NPI', 'NPI_RCFE_Owner', 'NPI_Number', 'Timestamp'],
      ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County', 'NPI', 'NPI_RCFE_Owner', 'NPI_Number'],
      ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County', 'NPI'],
      ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County', 'NPI_RCFE_Owner'],
      ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County', 'NPI_Number'],
      ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County'],
    ];

    let res: Response | null = null;
    let lastErrText = '';
    for (const fields of fieldCandidates) {
      const candidateRes = await fetch(buildUrl(fields), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (candidateRes.ok) {
        res = candidateRes;
        break;
      }
      lastErrText = await candidateRes.text().catch(() => '');
      if (!/invalid column name/i.test(lastErrText)) {
        // Non-schema error: stop trying more select variations for this page.
        res = candidateRes;
        break;
      }
    }
    if (!res) break;
    if (!res.ok) {
      console.warn('RCFE registry fetch failed:', {
        pageNumber,
        status: res.status,
        errorPreview: String(lastErrText || '').slice(0, 300),
      });
      break;
    }
    const data = (await res.json().catch(() => ({}))) as any;
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    if (rows.length === 0) break;

    rows.forEach((r: any) => {
      const rcfeRegisteredId = String(r?.RCFE_Registered_ID || r?.ID || r?.id || '').trim();
      const rcfeName = String(r?.RCFE_Name || '').trim();
      const numberOfBeds = String(r?.Number_of_Beds || '').trim() || null;
      const county = String(r?.RCFE_County || '').trim() || null;
      const npiNumber = String(r?.NPI || r?.NPI_RCFE_Owner || r?.NPI_Number || '').trim() || null;
      const registrationTimestamp = String(r?.Timestamp || '').trim() || null;
      const payload: RcfeRegistryRow = { rcfeRegisteredId, rcfeName, numberOfBeds, county, npiNumber, registrationTimestamp };
      if (rcfeRegisteredId && !byRegisteredId[rcfeRegisteredId]) {
        byRegisteredId[rcfeRegisteredId] = payload;
      }
      const normalizedName = normalizeLookupToken(rcfeName);
      if (normalizedName && !byName[normalizedName]) {
        byName[normalizedName] = payload;
      }
    });

    if (rows.length < pageSize) break;
  }

  return { byRegisteredId, byName };
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const snapshot = await adminDb.collection('rcfe_directory_status').limit(5000).get();
    const statuses = snapshot.docs.map((docSnap) => {
      const data = (docSnap.data() || {}) as RcfeDirectoryStatusDoc;
      return {
        rcfeRegisteredId: String(data.rcfeRegisteredId || docSnap.id || '').trim(),
        lastUpdatedAt:
          typeof (data as any)?.lastUpdatedAt?.toDate === 'function'
            ? (data as any).lastUpdatedAt.toDate().toISOString()
            : (data as any)?.lastUpdatedAt || null,
        lastUpdatedByUid: String(data.lastUpdatedByUid || '').trim() || null,
        lastUpdatedByEmail: String(data.lastUpdatedByEmail || '').trim() || null,
        lastNumberOfBeds: String(data.lastNumberOfBeds || '').trim() || null,
        lastCounty: String(data.lastCounty || '').trim() || null,
        lastRcfeName: String(data.lastRcfeName || '').trim() || null,
        lastNpiNumber: String(data.lastNpiNumber || '').trim() || null,
        lastLicenseNumber: String(data.lastLicenseNumber || '').trim() || null,
        lastAdminName: String(data.lastAdminName || '').trim() || null,
        lastAdminEmail: String(data.lastAdminEmail || '').trim() || null,
        lastAdminPhone: String(data.lastAdminPhone || '').trim() || null,
        lastStreet: String(data.lastStreet || '').trim() || null,
        lastCity: String(data.lastCity || '').trim() || null,
        lastState: String(data.lastState || '').trim() || null,
        lastZip: String(data.lastZip || '').trim() || null,
        lastAddress: String(data.lastAddress || '').trim() || null,
      };
    });

    const historyBySignature: Record<
      string,
      {
        lastNumberOfBeds: string | null;
        lastCounty: string | null;
        lastRcfeName: string | null;
        lastNpiNumber: string | null;
        lastLicenseNumber: string | null;
        lastAdminName: string | null;
        lastAdminEmail: string | null;
        lastAdminPhone: string | null;
        lastAddress: string | null;
        lastCity: string | null;
        lastState: string | null;
        lastZip: string | null;
        lastUpdatedAt: string | null;
        lastUpdatedByEmail: string | null;
      }
    > = {};
    const historyByName: Record<
      string,
      {
        lastNumberOfBeds: string | null;
        lastCounty: string | null;
        lastRcfeName: string | null;
        lastNpiNumber: string | null;
        lastLicenseNumber: string | null;
        lastAdminName: string | null;
        lastAdminEmail: string | null;
        lastAdminPhone: string | null;
        lastAddress: string | null;
        lastCity: string | null;
        lastState: string | null;
        lastZip: string | null;
        lastUpdatedAt: string | null;
        lastUpdatedByEmail: string | null;
      }
    > = {};
    let progressOverrides: Record<
      string,
      {
        Number_of_Beds?: string | null;
        RCFE_County?: string | null;
        RCFE_Name?: string | null;
        NPI?: string | null;
        NPI_Number?: string | null;
        NPI_RCFE_Owner?: string | null;
        RCFE_License_Number?: string | null;
        RCFE_Admin_Name?: string | null;
        RCFE_Admin_Email?: string | null;
        RCFE_Admin_RCFE_Owner_Phone?: string | null;
        RCFE_Address?: string | null;
        RCFE_City?: string | null;
        RCFE_State?: string | null;
        RCFE_Zip?: string | null;
      }
    > = {};
    const progressBySignature: Record<
      string,
      {
        Number_of_Beds?: string | null;
        RCFE_County?: string | null;
        RCFE_Name?: string | null;
        NPI?: string | null;
        NPI_Number?: string | null;
        NPI_RCFE_Owner?: string | null;
        RCFE_License_Number?: string | null;
        RCFE_Admin_Name?: string | null;
        RCFE_Admin_Email?: string | null;
        RCFE_Admin_RCFE_Owner_Phone?: string | null;
        RCFE_Address?: string | null;
        RCFE_City?: string | null;
        RCFE_State?: string | null;
        RCFE_Zip?: string | null;
      }
    > = {};
    let rcfeRegistryByRegisteredId: Record<string, RcfeRegistryRow> = {};
    let rcfeRegistryByName: Record<string, RcfeRegistryRow> = {};
    try {
      const logsSnap = await adminDb
        .collection('system_note_log')
        .where('type', '==', 'rcfe_directory_update')
        .limit(5000)
        .get();
      const ordered = logsSnap.docs
        .map((docSnap) => ({ docSnap, ms: getDateMs((docSnap.data() as any)?.createdAt) }))
        .sort((a, b) => b.ms - a.ms);
      ordered.forEach(({ docSnap }) => {
        const data = (docSnap.data() || {}) as any;
        const updates = (data?.updates || {}) as Record<string, unknown>;
        const nameRaw = String(updates.RCFE_Name || '').trim();
        const addressRaw = String(updates.RCFE_Address || updates.RCFE_Street || '').trim();
        const cityRaw = String(updates.RCFE_City || '').trim();
        const stateRaw = String(updates.RCFE_State || '').trim();
        const zipRaw = String(updates.RCFE_Zip || '').trim();
        const name = normalizeLookupToken(nameRaw);
        const address = normalizeLookupToken(addressRaw);
        const city = normalizeLookupToken(cityRaw);
        const zip = normalizeLookupToken(zipRaw);
        const signature = [name, address, city, zip].join('|');
        if (!name) return;
        const beds = String(updates.Number_of_Beds || '').trim() || null;
        const county = String(updates.RCFE_County || '').trim() || null;
        const rcfeName = nameRaw || null;
        const npiNumber = String(updates.NPI || updates.NPI_RCFE_Owner || updates.NPI_Number || '').trim() || null;
        const licenseNumber = String(updates.RCFE_License_Number || '').trim() || null;
        const adminName = String(updates.RCFE_Admin_Name || updates.RCFE_Administrator || '').trim() || null;
        const adminEmail =
          String(updates.RCFE_Admin_Email || updates.RCFE_Administrator_Email || '')
            .trim()
            .toLowerCase() || null;
        const adminPhone = String(updates.RCFE_Admin_RCFE_Owner_Phone || updates.RCFE_Administrator_Phone || '').trim() || null;
        const rowAddress = addressRaw || null;
        const rowCity = cityRaw || null;
        const rowState = stateRaw || null;
        const rowZip = zipRaw || null;
        const createdAt =
          typeof (data as any)?.createdAt?.toDate === 'function'
            ? (data as any).createdAt.toDate().toISOString()
            : String((data as any)?.createdAt || '').trim() || null;
        const actorEmail = String((data as any)?.actorEmail || '').trim() || null;
        const payload = {
          lastNumberOfBeds: beds,
          lastCounty: county,
          lastRcfeName: rcfeName,
          lastNpiNumber: npiNumber,
          lastLicenseNumber: licenseNumber,
          lastAdminName: adminName,
          lastAdminEmail: adminEmail,
          lastAdminPhone: adminPhone,
          lastAddress: rowAddress,
          lastCity: rowCity,
          lastState: rowState,
          lastZip: rowZip,
          lastUpdatedAt: createdAt,
          lastUpdatedByEmail: actorEmail,
        };
        if (!historyBySignature[signature]) historyBySignature[signature] = payload;
        if (!historyByName[name]) historyByName[name] = payload;
      });
    } catch {
      // best effort only
    }

    try {
      const progressSnap = await adminDb.collection('admin_tool_state').doc('rcfe_data_progress').get();
      const progressData = (progressSnap.data() || {}) as any;
      const rawOverrides = (progressData?.rcfeFieldOverrides || {}) as Record<string, any>;
      const next: Record<
        string,
        {
          Number_of_Beds?: string | null;
          RCFE_County?: string | null;
          RCFE_Name?: string | null;
          RCFE_License_Number?: string | null;
          RCFE_Admin_Name?: string | null;
          RCFE_Admin_Email?: string | null;
          RCFE_Admin_RCFE_Owner_Phone?: string | null;
          RCFE_Address?: string | null;
          RCFE_City?: string | null;
          RCFE_State?: string | null;
          RCFE_Zip?: string | null;
        }
      > = {};
      Object.entries(rawOverrides).forEach(([key, value]) => {
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (!normalizedKey) return;
        const payload = {
          Number_of_Beds: String(value?.Number_of_Beds || '').trim() || null,
          RCFE_County: String(value?.RCFE_County || '').trim() || null,
          RCFE_Name: String(value?.RCFE_Name || '').trim() || null,
          NPI: String(value?.NPI || '').trim() || null,
          NPI_Number: String(value?.NPI_Number || '').trim() || null,
          NPI_RCFE_Owner: String(value?.NPI_RCFE_Owner || '').trim() || null,
          RCFE_License_Number: String(value?.RCFE_License_Number || '').trim() || null,
          RCFE_Admin_Name: String(value?.RCFE_Admin_Name || '').trim() || null,
          RCFE_Admin_Email: String(value?.RCFE_Admin_Email || '').trim().toLowerCase() || null,
          RCFE_Admin_RCFE_Owner_Phone: String(value?.RCFE_Admin_RCFE_Owner_Phone || '').trim() || null,
          RCFE_Address: String(value?.RCFE_Address || '').trim() || null,
          RCFE_City: String(value?.RCFE_City || '').trim() || null,
          RCFE_State: String(value?.RCFE_State || '').trim() || null,
          RCFE_Zip: String(value?.RCFE_Zip || '').trim() || null,
        };
        next[normalizedKey] = payload;
        const signature = normalizeCompositeKey(key);
        if (signature && !progressBySignature[signature]) {
          progressBySignature[signature] = payload;
        }
      });
      progressOverrides = next;
    } catch {
      // best effort only
    }

    try {
      const maps = await fetchRcfeRegistryBedMaps();
      rcfeRegistryByRegisteredId = maps.byRegisteredId;
      rcfeRegistryByName = maps.byName;
    } catch {
      // best effort only
    }

    return NextResponse.json({
      success: true,
      statuses,
      historyBySignature,
      historyByName,
      progressOverrides,
      progressBySignature,
      rcfeRegistryByRegisteredId,
      rcfeRegistryByName,
      count: statuses.length,
    });
  } catch (error: any) {
    console.error('Error loading RCFE directory status:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load RCFE status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 423 });
    }

    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const memberIds = Array.isArray(body?.memberIds)
      ? body.memberIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
      : [];
    const rcfeRegisteredIds = Array.isArray(body?.rcfeRegisteredIds)
      ? body.rcfeRegisteredIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
      : [];
    if (memberIds.length === 0 && rcfeRegisteredIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Either memberIds or rcfeRegisteredIds is required' },
        { status: 400 }
      );
    }

    const rawUpdates = (body?.updates || {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    const allowedFields = [
      'RCFE_Name',
      'RCFE_Administrator',
      'RCFE_Administrator_Email',
      'RCFE_Administrator_Phone',
      'RCFE_Admin_Name',
      'RCFE_Admin_Email',
      'RCFE_Admin_RCFE_Owner_Phone',
      'Number_of_Beds',
      'NPI',
      'NPI_Number',
      'NPI_RCFE_Owner',
      'RCFE_Street',
      'RCFE_City',
      'RCFE_State',
      'RCFE_Zip',
      'RCFE_County',
      'RCFE_Address',
      'RCFE_License_Number',
    ] as const;

    allowedFields.forEach((field) => {
      if (rawUpdates[field] !== undefined) {
        updates[field] = String(rawUpdates[field] ?? '').trim();
      }
    });

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No supported fields to update' }, { status: 400 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);

    const adminName = String(updates.RCFE_Admin_Name || updates.RCFE_Administrator || '').trim();
    const adminEmail = String(updates.RCFE_Admin_Email || updates.RCFE_Administrator_Email || '').trim();
    const adminPhone = String(updates.RCFE_Admin_RCFE_Owner_Phone || updates.RCFE_Administrator_Phone || '').trim();

    const memberUpdates: Record<string, string> = {};
    const assignMemberUpdate = (field: string, value: unknown) => {
      const normalized = String(value ?? '').trim();
      if (normalized) memberUpdates[field] = normalized;
    };
    assignMemberUpdate('RCFE_Name', updates.RCFE_Name);
    assignMemberUpdate('RCFE_Administrator', adminName);
    assignMemberUpdate('RCFE_Administrator_Email', adminEmail);
    assignMemberUpdate('RCFE_Administrator_Phone', adminPhone);
    assignMemberUpdate('Number_of_Beds', updates.Number_of_Beds);
    const npiOwner = String(updates.NPI || updates.NPI_RCFE_Owner || updates.NPI_Number || '').trim();
    assignMemberUpdate('NPI_RCFE_Owner', npiOwner);
    assignMemberUpdate('RCFE_Street', updates.RCFE_Street);
    assignMemberUpdate('RCFE_City', updates.RCFE_City);
    assignMemberUpdate('RCFE_State', updates.RCFE_State);
    assignMemberUpdate('RCFE_Zip', updates.RCFE_Zip);
    assignMemberUpdate('RCFE_County', updates.RCFE_County);
    assignMemberUpdate('RCFE_Address', updates.RCFE_Address);
    assignMemberUpdate('RCFE_License_Number', updates.RCFE_License_Number);

    const results =
      memberIds.length > 0 && Object.keys(memberUpdates).length > 0
        ? await Promise.all(
            memberIds.map(async (memberId) => {
              const escapedClientId2 = memberId.replace(/'/g, "''");
              const whereClause = `Client_ID2='${escapedClientId2}'`;
              const apiUrl = `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(whereClause)}`;
              const caspioRes = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(memberUpdates),
              });
              if (!caspioRes.ok) {
                const err = await caspioRes.text().catch(() => '');
                return { memberId, ok: false, error: `Caspio ${caspioRes.status}: ${err}` };
              }

              await adminDb.collection('caspio_members_cache').doc(memberId).set(
                {
                  ...memberUpdates,
                  cachedAt: new Date().toISOString(),
                  Date_Modified: new Date().toISOString(),
                },
                { merge: true }
              );

              return { memberId, ok: true };
            })
          )
        : [];

    const failed = results.filter((r) => !r.ok);
    const uniqueRcfeRegisteredIds = Array.from(new Set(rcfeRegisteredIds));
    const rcfeRegistrationUpdates: Record<string, string> = {};
    const assignRcfeRegistrationUpdate = (field: string, value: unknown) => {
      const normalized = String(value ?? '').trim();
      if (normalized) rcfeRegistrationUpdates[field] = normalized;
    };
    assignRcfeRegistrationUpdate('RCFE_Name', updates.RCFE_Name);
    assignRcfeRegistrationUpdate('RCFE_Admin_Name', adminName);
    assignRcfeRegistrationUpdate('RCFE_Admin_Email', adminEmail.toLowerCase());
    assignRcfeRegistrationUpdate('RCFE_Admin_RCFE_Owner_Phone', adminPhone);
    assignRcfeRegistrationUpdate('NPI', npiOwner);
    assignRcfeRegistrationUpdate('RCFE_License_Number', updates.RCFE_License_Number);
    assignRcfeRegistrationUpdate('RCFE_Address', updates.RCFE_Address);
    assignRcfeRegistrationUpdate('RCFE_City', updates.RCFE_City);
    assignRcfeRegistrationUpdate('RCFE_State', updates.RCFE_State);
    assignRcfeRegistrationUpdate('RCFE_Zip', updates.RCFE_Zip);
    assignRcfeRegistrationUpdate('RCFE_County', updates.RCFE_County);
    assignRcfeRegistrationUpdate('Number_of_Beds', updates.Number_of_Beds);

    const rcfeTableUpdate = { attempted: 0, updated: 0, failed: 0 };
    if (Object.keys(rcfeRegistrationUpdates).length > 0 && uniqueRcfeRegisteredIds.length > 0) {
      rcfeTableUpdate.attempted = uniqueRcfeRegisteredIds.length;
      for (const rcfeRegisteredId of uniqueRcfeRegisteredIds) {
        const escapedRcfeRegisteredId = rcfeRegisteredId.replace(/'/g, "''");
        const whereClause = `RCFE_Registered_ID='${escapedRcfeRegisteredId}'`;
        const rcfeApiUrl = `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_New_RCFE_Registration/records?q.where=${encodeURIComponent(whereClause)}`;
        const rcfeRes = await fetch(rcfeApiUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(rcfeRegistrationUpdates),
        });
        if (rcfeRes.ok) {
          rcfeTableUpdate.updated += 1;
        } else {
          rcfeTableUpdate.failed += 1;
        }
      }
    }

    await adminDb.collection('system_note_log').add({
      type: 'rcfe_directory_update',
      actorUid: authz.uid,
      actorEmail: authz.email,
      memberIds,
      rcfeRegisteredIds: uniqueRcfeRegisteredIds,
      updates,
      rcfeTableUpdate,
      failedCount: failed.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (uniqueRcfeRegisteredIds.length > 0) {
      const beds = String(updates.Number_of_Beds || '').trim();
      const county = String(updates.RCFE_County || '').trim();
      const rcfeName = String(updates.RCFE_Name || '').trim();
      const npiNumber = String(updates.NPI || updates.NPI_RCFE_Owner || updates.NPI_Number || '').trim();
      const licenseNumber = String(updates.RCFE_License_Number || '').trim();
      const adminNameForStatus = String(updates.RCFE_Admin_Name || updates.RCFE_Administrator || '').trim();
      const adminEmailForStatus =
        String(updates.RCFE_Admin_Email || updates.RCFE_Administrator_Email || '')
          .trim()
          .toLowerCase();
      const adminPhoneForStatus =
        String(updates.RCFE_Admin_RCFE_Owner_Phone || updates.RCFE_Administrator_Phone || '').trim();
      const street = String(updates.RCFE_Street || '').trim();
      const city = String(updates.RCFE_City || '').trim();
      const state = String(updates.RCFE_State || '').trim();
      const zip = String(updates.RCFE_Zip || '').trim();
      const address = String(updates.RCFE_Address || '').trim();

      await Promise.all(
        uniqueRcfeRegisteredIds.map(async (rid) => {
          const statusRef = adminDb.collection('rcfe_directory_status').doc(rid);
          const payload: RcfeDirectoryStatusDoc = {
            rcfeRegisteredId: rid,
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedByUid: authz.uid,
            lastUpdatedByEmail: authz.email || null,
          };
          if (beds) payload.lastNumberOfBeds = beds;
          if (county) payload.lastCounty = county;
          if (rcfeName) payload.lastRcfeName = rcfeName;
          if (npiNumber) payload.lastNpiNumber = npiNumber;
          if (licenseNumber) payload.lastLicenseNumber = licenseNumber;
          if (adminNameForStatus) payload.lastAdminName = adminNameForStatus;
          if (adminEmailForStatus) payload.lastAdminEmail = adminEmailForStatus;
          if (adminPhoneForStatus) payload.lastAdminPhone = adminPhoneForStatus;
          if (street) payload.lastStreet = street;
          if (city) payload.lastCity = city;
          if (state) payload.lastState = state;
          if (zip) payload.lastZip = zip;
          if (address) payload.lastAddress = address;
          await statusRef.set(payload, { merge: true });
        })
      );
    }

    if (failed.length > 0) {
      return NextResponse.json(
        {
          success: true,
          partial: true,
          error: `Updated ${results.length - failed.length}/${results.length} records; some updates failed.`,
          updatedCount: results.length - failed.length,
          rcfeTableUpdate,
          failed,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: results.length,
      updates,
      rcfeTableUpdate,
    });
  } catch (error: any) {
    console.error('Error updating RCFE directory fields:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update RCFE fields' }, { status: 500 });
  }
}
