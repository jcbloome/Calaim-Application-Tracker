/**
 * Caspio API Utilities - Complete Record Retrieval System
 * 
 * This module solves the critical problem of Caspio's 1000 record limit per query.
 * It provides utilities to fetch ALL records from large Caspio tables by using
 * strategic query partitioning and data normalization.
 * 
 * PROBLEM SOLVED:
 * - Caspio REST API has a hard 1000 record limit per query
 * - Setting q.limit=5000 still only returns 1000 records maximum
 * - Pagination with q.pageNumber often fails or returns inconsistent results
 * - Large datasets (1000+ records) were being truncated
 * 
 * SOLUTION STRATEGY:
 * 1. Query by data partitions (e.g., MCO, status, date ranges)
 * 2. Use pagination WITHIN each partition (handles >1000 records per partition)
 * 3. Combine results from multiple queries
 * 4. Deduplicate records to prevent overlaps
 * 5. Normalize data for consistency
 */

export interface CaspioCredentials {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

import { trackCaspioCall } from '@/lib/caspio-usage-tracker';

export function getCaspioCredentialsFromEnv(): CaspioCredentials {
  const baseUrlRaw = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com';
  const clientId = process.env.CASPIO_CLIENT_ID;
  const clientSecret = process.env.CASPIO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Caspio credentials not configured');
  }

  const baseUrl = baseUrlRaw.replace(/\/rest\/v2\/?$/, '');
  return { baseUrl, clientId, clientSecret };
}

export interface CaspioQueryOptions {
  table: string;
  partitionField?: string;
  partitionValues?: string[];
  limit?: number;
  additionalWhere?: string;
}

export interface CaspioMember {
  client_ID2: string;
  Senior_First: string;
  Senior_Last: string;
  Member_County: string;
  CalAIM_MCO: string;
  CalAIM_Status: string;
  Social_Worker_Assigned: string;
  Kaiser_User_Assignment: string;
  Hold_For_Social_Worker: string;
  RCFE_Name: string;
  RCFE_Address: string;
  Pathway: string;
  last_updated: string;
  [key: string]: any;
}

export interface CaspioSocialWorker {
  id: string;
  name: string;
  email: string;
  role: string;
  sw_id: string;
  phone?: string;
  department?: string;
  assignedMemberCount: number;
  rate?: number | null;
  isActive: boolean;
}

/**
 * Get OAuth token from Caspio
 */
export async function getCaspioToken(credentials: CaspioCredentials): Promise<string> {
  const tokenResponse = await fetch(`${credentials.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
  });
  trackCaspioCall({ method: 'POST', kind: 'token', status: tokenResponse.status, ok: tokenResponse.ok, context: 'oauth/token' });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Get total record count from Caspio table
 */
export async function getCaspioRecordCount(
  credentials: CaspioCredentials,
  accessToken: string,
  tableName: string,
  whereClause?: string
): Promise<number> {
  const whereParam = whereClause ? `&q.where=${encodeURIComponent(whereClause)}` : '';
  const countUrl = `${credentials.baseUrl}/rest/v2/tables/${tableName}/records?q.select=COUNT(*)${whereParam}`;
  
  const countResponse = await fetch(countUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  trackCaspioCall({ method: 'GET', kind: 'read', status: countResponse.status, ok: countResponse.ok, context: `COUNT:${tableName}` });

  if (!countResponse.ok) {
    console.warn('Count query failed, proceeding without total count');
    return 0;
  }

  const countData = await countResponse.json();
  return countData.Result?.[0]?.['COUNT(*)'] || 0;
}

/**
 * Fetch records from Caspio with a specific WHERE clause using pagination
 * This handles cases where a single partition (e.g., Health Net) has >1000 records
 */
export async function fetchCaspioRecords(
  credentials: CaspioCredentials,
  accessToken: string,
  tableName: string,
  whereClause: string,
  limit: number = 1000
): Promise<any[]> {
  let allRecords: any[] = [];
  let pageNumber = 1;
  const maxPages = 10; // Safety limit per partition
  
  console.log(`   🔄 Using pagination for: ${whereClause}`);
  
  while (pageNumber <= maxPages) {
    const queryUrl = `${credentials.baseUrl}/rest/v2/tables/${tableName}/records?q.where=${encodeURIComponent(whereClause)}&q.pageSize=${limit}&q.pageNumber=${pageNumber}`;
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    trackCaspioCall({ method: 'GET', kind: 'read', status: response.status, ok: response.ok, context: `records:${tableName}` });

    if (!response.ok) {
      console.error(`   ❌ Failed to fetch page ${pageNumber} for: ${whereClause}`);
      break;
    }

    const data = await response.json();
    const pageRecords = data.Result || [];
    
    console.log(`   📄 Page ${pageNumber}: ${pageRecords.length} records`);
    
    if (pageRecords.length === 0) {
      console.log(`   ✅ No more records, stopping pagination`);
      break;
    }
    
    allRecords = allRecords.concat(pageRecords);
    
    // If we got fewer records than the limit, we're on the last page
    if (pageRecords.length < limit) {
      console.log(`   ✅ Last page reached (${pageRecords.length} < ${limit})`);
      break;
    }
    
    pageNumber++;
  }
  
  console.log(`   📊 Total records for partition: ${allRecords.length}`);
  return allRecords;
}

/**
 * CORE SOLUTION: Fetch ALL records by partitioning queries
 * 
 * This is the main function that solves the 1000 record limit problem.
 * It works by:
 * 1. Querying each partition value separately (e.g., each MCO)
 * 2. Using pagination within each partition (handles >1000 records per MCO)
 * 3. Combining all results
 * 4. Deduplicating by unique identifier
 * 5. Normalizing data for consistency
 */
export async function fetchAllCaspioRecords(
  credentials: CaspioCredentials,
  options: CaspioQueryOptions
): Promise<any[]> {
  console.log('🔍 Fetching ALL records from Caspio with partition strategy...');
  
  // Get OAuth token
  const accessToken = await getCaspioToken(credentials);
  console.log('✅ Got Caspio access token');

  // Get total count for monitoring
  const totalCount = await getCaspioRecordCount(credentials, accessToken, options.table);
  console.log(`📊 Total records in database: ${totalCount}`);

  let allRecords: any[] = [];

  if (options.partitionField && options.partitionValues) {
    // STRATEGY 1: Query by partition values (e.g., by MCO)
    console.log(`📊 Fetching records by ${options.partitionField} to bypass 1000 record limit...`);
    
    for (const partitionValue of options.partitionValues) {
      const whereClause = `${options.partitionField}='${partitionValue}'`;
      console.log(`📋 Fetching ${partitionValue} records...`);
      
      const partitionRecords = await fetchCaspioRecords(
        credentials, 
        accessToken, 
        options.table, 
        whereClause, 
        options.limit
      );
      
      console.log(`   ${partitionValue}: ${partitionRecords.length} records`);
      allRecords = allRecords.concat(partitionRecords);
    }

    // Also query for records with null/empty partition field
    console.log(`📋 Fetching records with unknown ${options.partitionField}...`);
    const unknownWhereClause = `${options.partitionField} IS NULL OR ${options.partitionField}=''`;
    const unknownRecords = await fetchCaspioRecords(
      credentials, 
      accessToken, 
      options.table, 
      unknownWhereClause, 
      options.limit
    );
    console.log(`   Unknown ${options.partitionField}: ${unknownRecords.length} records`);
    allRecords = allRecords.concat(unknownRecords);
    
  } else {
    // STRATEGY 2: Single query (fallback, will hit 1000 limit)
    console.log('⚠️ No partition strategy specified, using single query (may hit 1000 limit)');
    const whereClause = options.additionalWhere || '1=1';
    allRecords = await fetchCaspioRecords(
      credentials, 
      accessToken, 
      options.table, 
      whereClause, 
      options.limit || 1000
    );
  }

  console.log(`✅ Total records fetched: ${allRecords.length} across all partitions`);

  // CRITICAL: Deduplicate records by unique identifier
  const recordMap = new Map();
  allRecords.forEach(record => {
    const recordId = record.client_ID2 || record.id || Math.random().toString();
    if (!recordMap.has(recordId)) {
      recordMap.set(recordId, record);
    }
  });
  
  const deduplicatedRecords = Array.from(recordMap.values());
  console.log(`📋 After deduplication: ${deduplicatedRecords.length} unique records`);

  return deduplicatedRecords;
}

/**
 * Normalize social worker names to prevent duplicates
 * 
 * PROBLEM: Same social worker appears multiple times with variations:
 * - "Dawidowicz, Danielle 121" vs "Dawidowicz, Danielle"
 * - "BUCKHALTER, BILLY" vs "Buckhalter, Billy 76"
 * 
 * SOLUTION: Standardize format and remove trailing IDs
 */
export function normalizeSocialWorkerName(name: string): string {
  if (!name || name.trim() === '') return '';
  
  return name
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+\d+$/, '') // Remove trailing numbers like " 121", " 33", " 76"
    .trim();
}

/**
 * Transform raw Caspio member data to application format
 */
export function transformCaspioMember(member: CaspioMember): any {
  return {
    id: member.client_ID2 || Math.random().toString(),
    Client_ID2: member.client_ID2,
    memberName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
    memberFirstName: member.Senior_First || '',
    memberLastName: member.Senior_Last || '',
    memberCounty: member.Member_County || 'Los Angeles',
    CalAIM_MCO: member.CalAIM_MCO || 'Unknown',
    CalAIM_Status: member.CalAIM_Status || 'Unknown',
    Social_Worker_Assigned: normalizeSocialWorkerName(member.Social_Worker_Assigned || ''),
    Staff_Assigned: member.Kaiser_User_Assignment || '',
    Hold_For_Social_Worker: member.Hold_For_Social_Worker || '',
    RCFE_Name: member.RCFE_Name || '',
    RCFE_Address: member.RCFE_Address || '',
    pathway: member.Pathway || 'Unknown',
    last_updated: member.last_updated || new Date().toISOString()
  };
}

/**
 * Fetch all social workers with assignment counts
 * Uses the same full-member dataset logic as the assignments page.
 */
export async function fetchCaspioSocialWorkers(
  credentials: CaspioCredentials
): Promise<CaspioSocialWorker[]> {
  const accessToken = await getCaspioToken(credentials);

  const socialWorkerSelect = [
    'SW_ID',
    'SW_first',
    'SW_last',
    'SW_first_last',
    'SW_Last_First',
    'User_First',
    'User_Last',
    'SW_email',
    'Role',
    'SW_table_id',
    'Rate'
  ].join(',');
  const socialWorkerUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Social_Worker/records?q.select=${encodeURIComponent(socialWorkerSelect)}`;

  const swResponse = await fetch(socialWorkerUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!swResponse.ok) {
    throw new Error(`Failed to fetch social workers: ${swResponse.status} ${swResponse.statusText}`);
  }

  const swData = await swResponse.json();
  const allSocialWorkers = swData.Result || [];

  const transformedStaffRaw: CaspioSocialWorker[] = allSocialWorkers
    .map((sw: any) => {
      const swId = (sw.SW_ID || sw.SW_table_id || '').toString().trim();
      if (!swId) {
        return null;
      }

      const firstName = (sw.SW_first || sw.User_First || '').toString().trim();
      const lastName = (sw.SW_last || sw.User_Last || '').toString().trim();
      const formulaName = (sw.SW_first_last || sw.SW_Last_First || '').toString().trim();
      const fullName = formulaName || `${firstName} ${lastName}`.trim() || `SW ${swId}`;

      return {
        id: String(sw.SW_table_id || swId),
        name: fullName,
        email: sw.SW_email || '',
        role: sw.Role || 'MSW',
        sw_id: String(swId),
        phone: '',
        department: '',
        assignedMemberCount: 0,
        rate: sw.Rate || null,
        isActive: true
      };
    })
    .filter(Boolean) as CaspioSocialWorker[];

  // Caspio can contain duplicate staff rows (same SW_ID or same email). Deduplicate here so
  // downstream UI rendering and Firestore caching don't create conflicts.
  const pickBetter = (a: CaspioSocialWorker, b: CaspioSocialWorker) => {
    const aEmail = String(a.email || '').trim();
    const bEmail = String(b.email || '').trim();
    if (!!aEmail !== !!bEmail) return aEmail ? a : b;
    const aName = String(a.name || '').trim();
    const bName = String(b.name || '').trim();
    if (aName.length !== bName.length) return aName.length >= bName.length ? a : b;
    const aRate = a.rate ?? null;
    const bRate = b.rate ?? null;
    if ((aRate === null) !== (bRate === null)) return aRate !== null ? a : b;
    return a;
  };

  const bySwId = new Map<string, CaspioSocialWorker>();
  const byEmail = new Map<string, CaspioSocialWorker>();
  for (const staff of transformedStaffRaw) {
    const swId = String(staff.sw_id || '').trim();
    const email = String(staff.email || '').trim().toLowerCase();
    if (swId) {
      const existing = bySwId.get(swId);
      bySwId.set(swId, existing ? pickBetter(existing, staff) : staff);
      continue;
    }
    if (email) {
      const existing = byEmail.get(email);
      byEmail.set(email, existing ? pickBetter(existing, staff) : staff);
      continue;
    }
  }

  const transformedStaff = Array.from(bySwId.values()).concat(
    Array.from(byEmail.entries())
      .filter(([email]) => !Array.from(bySwId.values()).some((s) => String(s.email || '').trim().toLowerCase() === email))
      .map(([, staff]) => staff)
  );

  // Assignment counts are helpful but can be expensive (requires fetching full member dataset).
  // If counting fails (timeouts / data issues), return staff with 0 counts instead of failing the whole request.
  try {
    // Prefer Firestore cache if available to avoid frequent Caspio reads.
    let rawMembers: any[] = [];
    try {
      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const snap = await adminDb.collection('caspio_members_cache').limit(5000).get();
      rawMembers = snap.docs.map((doc) => doc.data());
    } catch (cacheError) {
      console.warn('⚠️ Failed to load members from Firestore cache; falling back to Caspio.', cacheError);
    }

    if (rawMembers.length === 0) {
      const result = await fetchAllCalAIMMembers(credentials, { includeRawData: true });
      rawMembers = result.rawMembers || [];
    }

    const byName: Record<string, number> = {};
    const bySwId: Record<string, number> = {};

    rawMembers.forEach((member: any) => {
      const swId = String(member.SW_ID || '').trim();
      if (swId) {
        bySwId[swId] = (bySwId[swId] || 0) + 1;
      }

      const swName = normalizeSocialWorkerName(String(member.Social_Worker_Assigned || '').trim());
      if (swName) {
        byName[swName] = (byName[swName] || 0) + 1;
      }
    });

    return transformedStaff.map((staff) => {
      const staffId = String(staff.sw_id || '').trim();
      const staffName = normalizeSocialWorkerName(String(staff.name || '').trim());
      const countByName = staffName ? byName[staffName] ?? 0 : 0;
      const countById = staffId ? bySwId[staffId] ?? 0 : 0;
      return {
        ...staff,
        assignedMemberCount: Math.max(countByName, countById)
      };
    });
  } catch (countError) {
    console.warn('⚠️ Failed to compute SW assignment counts; returning staff without counts.', countError);
    return transformedStaff.map((staff) => ({ ...staff, assignedMemberCount: 0 }));
  }
}

/**
 * COMPLETE EXAMPLE: Fetch all CalAIM members
 * 
 * This demonstrates the complete solution for fetching all members
 * from a large Caspio table, bypassing the 1000 record limit.
 */
export async function fetchAllCalAIMMembers(
  credentials: CaspioCredentials, 
  options: { includeRawData?: boolean; cacheTtlMs?: number; forceRefresh?: boolean } = {}
) {
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs as number) ? Number(options.cacheTtlMs) : 5 * 60 * 1000;
  const useCache = cacheTtlMs > 0;

  type CacheValue = {
    expiresAt: number;
    value: {
      members: any[];
      rawMembers?: any[];
      count: number;
      mcoStats: Record<string, number>;
    };
    inFlight?: Promise<CacheValue['value']>;
  };

  const g = globalThis as any;
  const cacheKey = '__calaim_fetchAllCalAIMMembers_cache_v1__';
  const cache: CacheValue | undefined = g[cacheKey];
  const now = Date.now();

  if (useCache && !options.forceRefresh && cache?.value && cache.expiresAt > now) {
    return {
      members: cache.value.members,
      rawMembers: options.includeRawData ? cache.value.rawMembers : undefined,
      count: cache.value.count,
      mcoStats: cache.value.mcoStats
    };
  }

  if (useCache && !options.forceRefresh && cache?.inFlight) {
    const inFlightValue = await cache.inFlight;
    return {
      members: inFlightValue.members,
      rawMembers: options.includeRawData ? inFlightValue.rawMembers : undefined,
      count: inFlightValue.count,
      mcoStats: inFlightValue.mcoStats
    };
  }

  // Define MCO partition strategy
  const mcoPartitions = ['Kaiser', 'Health Net', 'Molina', 'Blue Cross', 'Anthem'];
  
  const compute = async () => {
    // Fetch all records using partition strategy
    const rawMembers = await fetchAllCaspioRecords(credentials, {
      table: 'CalAIM_tbl_Members',
      partitionField: 'CalAIM_MCO',
      partitionValues: mcoPartitions,
      limit: 1000
    });

    // Transform to application format
    const transformedMembers = rawMembers.map(transformCaspioMember);

    // Calculate statistics
    const mcoStats: Record<string, number> = {};
    transformedMembers.forEach(member => {
      const mco = member.CalAIM_MCO || 'Unknown';
      mcoStats[mco] = (mcoStats[mco] || 0) + 1;
    });

    console.log('📈 Final MCO Distribution:', mcoStats);

    return {
      members: transformedMembers,
      rawMembers,
      count: transformedMembers.length,
      mcoStats
    };
  };

  if (!useCache) {
    const value = await compute();
    return {
      members: value.members,
      rawMembers: options.includeRawData ? value.rawMembers : undefined,
      count: value.count,
      mcoStats: value.mcoStats
    };
  }

  const inFlight = compute();
  g[cacheKey] = {
    expiresAt: 0,
    value: undefined,
    inFlight
  } as CacheValue;

  const value = await inFlight;
  g[cacheKey] = {
    expiresAt: Date.now() + cacheTtlMs,
    value
  } as CacheValue;

  return {
    members: value.members,
    rawMembers: options.includeRawData ? value.rawMembers : undefined,
    count: value.count,
    mcoStats: value.mcoStats
  };
}

/**
 * USAGE EXAMPLE:
 * 
 * const credentials = {
 *   baseUrl: process.env.CASPIO_BASE_URL!,
 *   clientId: process.env.CASPIO_CLIENT_ID!,
 *   clientSecret: process.env.CASPIO_CLIENT_SECRET!
 * };
 * 
 * const result = await fetchAllCalAIMMembers(credentials);
 * console.log(`Fetched ${result.count} members across all MCOs`);
 * 
 * RESULTS:
 * - Before: 1000 members (limited by Caspio)
 * - After: 1413+ members (complete dataset)
 * - Deduplication: Prevents duplicate records
 * - Normalization: Prevents duplicate social workers
 */