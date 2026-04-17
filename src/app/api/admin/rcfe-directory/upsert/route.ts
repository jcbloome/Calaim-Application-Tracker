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
  lastStreet?: string | null;
  lastCity?: string | null;
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
  registrationTimestamp: string | null;
};

async function fetchRcfeRegistryBedMaps() {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const byRegisteredId: Record<string, RcfeRegistryRow> = {};
  const byName: Record<string, RcfeRegistryRow> = {};

  const pageSize = 1000;
  const maxPages = 20;
  let includeRegistrationTimestamp = true;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const selectFields = includeRegistrationTimestamp
      ? ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County', 'Timestamp'].join(',')
      : ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County'].join(',');
    const buildUrl = (fields: string) =>
      `${credentials.baseUrl}/integrations/rest/v3/tables/${encodeURIComponent(
        'CalAIM_tbl_New_RCFE_Registration'
      )}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}&q.select=${encodeURIComponent(fields)}`;

    let res = await fetch(buildUrl(selectFields), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok && includeRegistrationTimestamp) {
      const errText = await res.text().catch(() => '');
      if (/invalid column name/i.test(errText) && /timestamp/i.test(errText)) {
        includeRegistrationTimestamp = false;
        const fallbackFields = ['RCFE_Registered_ID', 'RCFE_Name', 'Number_of_Beds', 'RCFE_County'].join(',');
        res = await fetch(buildUrl(fallbackFields), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });
      }
    }
    if (!res.ok) break;
    const data = (await res.json().catch(() => ({}))) as any;
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    if (rows.length === 0) break;

    rows.forEach((r: any) => {
      const rcfeRegisteredId = String(r?.RCFE_Registered_ID || r?.ID || r?.id || '').trim();
      const rcfeName = String(r?.RCFE_Name || '').trim();
      const numberOfBeds = String(r?.Number_of_Beds || '').trim() || null;
      const county = String(r?.RCFE_County || '').trim() || null;
      const registrationTimestamp = String(r?.Timestamp || '').trim() || null;
      const payload: RcfeRegistryRow = { rcfeRegisteredId, rcfeName, numberOfBeds, county, registrationTimestamp };
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
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: true });
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
        lastStreet: String(data.lastStreet || '').trim() || null,
        lastCity: String(data.lastCity || '').trim() || null,
        lastZip: String(data.lastZip || '').trim() || null,
        lastAddress: String(data.lastAddress || '').trim() || null,
      };
    });

    const historyBySignature: Record<string, { lastNumberOfBeds: string | null; lastCounty: string | null; lastUpdatedAt: string | null; lastUpdatedByEmail: string | null }> = {};
    const historyByName: Record<string, { lastNumberOfBeds: string | null; lastCounty: string | null; lastUpdatedAt: string | null; lastUpdatedByEmail: string | null }> = {};
    let progressOverrides: Record<string, { Number_of_Beds?: string | null; RCFE_County?: string | null }> = {};
    const progressBySignature: Record<string, { Number_of_Beds?: string | null; RCFE_County?: string | null }> = {};
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
        const name = normalizeLookupToken(updates.RCFE_Name);
        const street = normalizeLookupToken(updates.RCFE_Street);
        const city = normalizeLookupToken(updates.RCFE_City);
        const zip = normalizeLookupToken(updates.RCFE_Zip);
        const signature = [name, street, city, zip].join('|');
        if (!name) return;
        const beds = String(updates.Number_of_Beds || '').trim() || null;
        const county = String(updates.RCFE_County || '').trim() || null;
        const createdAt =
          typeof (data as any)?.createdAt?.toDate === 'function'
            ? (data as any).createdAt.toDate().toISOString()
            : String((data as any)?.createdAt || '').trim() || null;
        const actorEmail = String((data as any)?.actorEmail || '').trim() || null;
        const payload = {
          lastNumberOfBeds: beds,
          lastCounty: county,
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
      const next: Record<string, { Number_of_Beds?: string | null; RCFE_County?: string | null }> = {};
      Object.entries(rawOverrides).forEach(([key, value]) => {
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (!normalizedKey) return;
        const payload = {
          Number_of_Beds: String(value?.Number_of_Beds || '').trim() || null,
          RCFE_County: String(value?.RCFE_County || '').trim() || null,
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

    const authz = await requireAdminApiAuth(req, { requireTwoFactor: true });
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
    if (memberIds.length === 0) {
      return NextResponse.json({ success: false, error: 'memberIds is required' }, { status: 400 });
    }

    const rawUpdates = (body?.updates || {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    const allowedFields = [
      'RCFE_Name',
      'RCFE_Administrator',
      'RCFE_Administrator_Email',
      'RCFE_Administrator_Phone',
      'Number_of_Beds',
      'RCFE_Street',
      'RCFE_City',
      'RCFE_Zip',
      'RCFE_County',
      'RCFE_Address',
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

    const results = await Promise.all(
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
          body: JSON.stringify(updates),
        });
        if (!caspioRes.ok) {
          const err = await caspioRes.text().catch(() => '');
          return { memberId, ok: false, error: `Caspio ${caspioRes.status}: ${err}` };
        }

        await adminDb.collection('caspio_members_cache').doc(memberId).set(
          {
            ...updates,
            cachedAt: new Date().toISOString(),
            Date_Modified: new Date().toISOString(),
          },
          { merge: true }
        );

        return { memberId, ok: true };
      })
    );

    const failed = results.filter((r) => !r.ok);
    const countyUpdateValue = String(updates.RCFE_County || '').trim();
    const uniqueRcfeRegisteredIds = Array.from(new Set(rcfeRegisteredIds));
    const rcfeTableCountyUpdate = { attempted: 0, updated: 0, failed: 0 };
    if (countyUpdateValue && uniqueRcfeRegisteredIds.length > 0) {
      rcfeTableCountyUpdate.attempted = uniqueRcfeRegisteredIds.length;
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
          body: JSON.stringify({ RCFE_County: countyUpdateValue }),
        });
        if (rcfeRes.ok) {
          rcfeTableCountyUpdate.updated += 1;
        } else {
          rcfeTableCountyUpdate.failed += 1;
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
      rcfeTableCountyUpdate,
      failedCount: failed.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (uniqueRcfeRegisteredIds.length > 0) {
      const beds = String(updates.Number_of_Beds || '').trim();
      const county = String(updates.RCFE_County || '').trim();
      const rcfeName = String(updates.RCFE_Name || '').trim();
      const street = String(updates.RCFE_Street || '').trim();
      const city = String(updates.RCFE_City || '').trim();
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
          if (street) payload.lastStreet = street;
          if (city) payload.lastCity = city;
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
          rcfeTableCountyUpdate,
          failed,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: results.length,
      updates,
      rcfeTableCountyUpdate,
    });
  } catch (error: any) {
    console.error('Error updating RCFE directory fields:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update RCFE fields' }, { status: 500 });
  }
}
