import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export async function POST(request: NextRequest) {
  try {
    const adminSession = request.cookies.get('calaim_admin_session')?.value;
    if (!adminSession) {
      const authHeader = request.headers.get('authorization');
      const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      const adminModule = await import('@/firebase-admin');
      const admin = adminModule.default;
      const adminDb = adminModule.adminDb;

      const decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
      const email = decoded.email?.toLowerCase();
      const uid = decoded.uid;

      let isAdmin = isHardcodedAdminEmail(email);
      if (!isAdmin && uid) {
        const [adminDoc, superAdminDoc] = await Promise.all([
          adminDb.collection('roles_admin').doc(uid).get(),
          adminDb.collection('roles_super_admin').doc(uid).get()
        ]);
        isAdmin = adminDoc.exists || superAdminDoc.exists;
      }

      if (!isAdmin) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    const { tableName = 'CalAIM_tbl_Members' } = await request.json();
    const rawBaseUrl = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/rest/v2';
    const baseUrl = rawBaseUrl.replace(/\/$/, '');
    const restBaseUrl = baseUrl.endsWith('/rest/v2') ? baseUrl : `${baseUrl}/rest/v2`;
    const clientId = process.env.CASPIO_CLIENT_ID || '';
    const clientSecret = process.env.CASPIO_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Caspio credentials not configured' },
        { status: 500 }
      );
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json(
        { error: `Token request failed: ${tokenResponse.status} ${errorText}` },
        { status: 502 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const encodedTableName = encodeURIComponent(tableName);
    const schemaUrl = `${restBaseUrl}/tables/${encodedTableName}`;
    const schemaResponse = await fetch(schemaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!schemaResponse.ok) {
      const errorText = await schemaResponse.text();
      return NextResponse.json(
        { error: `Schema request failed: ${schemaResponse.status}`, details: errorText, schemaUrl },
        { status: 502 }
      );
    }

    const schemaData = await schemaResponse.json();
    let fields = schemaData.Result?.Fields?.map((field: any) => field.Name) || [];
    const resultKeys = schemaData?.Result ? Object.keys(schemaData.Result) : [];

    // Fallback to columns endpoint if schema doesn't include fields
    if (fields.length === 0) {
      const fieldsUrl = `${restBaseUrl}/tables/${encodedTableName}/fields`;
      const fieldsResponse = await fetch(fieldsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (fieldsResponse.ok) {
        const fieldsData = await fieldsResponse.json();
        fields = fieldsData.Result?.map((field: any) => field.Name) || [];
        if (fields.length > 0) {
          return NextResponse.json({
            success: true,
            fields,
            tableName,
            message: `Successfully retrieved ${fields.length} field names from ${tableName}`,
            schemaUrl,
            fieldsUrl,
            resultKeys,
            timestamp: new Date().toISOString(),
          });
        }
      }

      const columnsUrl = `${restBaseUrl}/tables/${encodedTableName}/columns`;
      const columnsResponse = await fetch(columnsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!columnsResponse.ok) {
        const errorText = await columnsResponse.text();
        return NextResponse.json(
          { error: `Columns request failed: ${columnsResponse.status}`, details: errorText, schemaUrl, fieldsUrl, columnsUrl },
          { status: 502 }
        );
      }

      const columnsData = await columnsResponse.json();
      fields = columnsData.Result?.map((col: any) => col.Name) || [];
      if (fields.length > 0) {
        return NextResponse.json({
          success: true,
          fields,
          tableName,
          message: `Successfully retrieved ${fields.length} field names from ${tableName}`,
          schemaUrl,
          fieldsUrl,
          columnsUrl,
          resultKeys,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      fields,
      tableName,
      message: `Successfully retrieved ${fields.length} field names from ${tableName}`,
      schemaUrl,
      resultKeys,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Caspio table field fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Caspio table fields', details: error.message },
      { status: 500 }
    );
  }
}
