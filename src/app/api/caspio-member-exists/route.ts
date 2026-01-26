import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawMrn = searchParams.get('mrn') || '';
    const mrn = rawMrn.trim().toUpperCase();

    if (!mrn) {
      return NextResponse.json({ error: 'Missing mrn parameter' }, { status: 400 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const baseUrl = credentials.baseUrl.replace(/\/$/, '');

    const whereClause = `MCP_CIN='${mrn.replace(/'/g, "''")}'`;
    const queryUrl = `${baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(whereClause)}&q.limit=1`;

    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Caspio lookup failed: ${response.status} ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const records = Array.isArray(data?.Result) ? data.Result : [];

    return NextResponse.json({
      success: true,
      exists: records.length > 0,
      mrn,
    });
  } catch (error: any) {
    console.error('Caspio member lookup failed:', error);
    return NextResponse.json(
      { error: 'Failed to check Caspio member existence', details: error.message },
      { status: 500 }
    );
  }
}
