import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lastName = searchParams.get('lastName');
    
    if (!lastName || !lastName.trim()) {
      return NextResponse.json(
        { success: false, error: 'Last name is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Searching clients by last name:', lastName);
    
    // Use same authentication pattern as client-notes API
    const caspioConfig = getCaspioServerConfig();
    const dataBaseUrl = caspioConfig.restBaseUrl;
    const accessToken = await getCaspioServerAccessToken(caspioConfig);

    // Search clients by last name
    const clientsTable = 'connect_tbl_clients';
    let allClients: any[] = [];
    let pageNumber = 1;
    const pageSize = 100;
    const maxPages = 50;
    let pageRecords: any[] = [];

    console.log('📊 Searching clients...');

    do {
      // Search for clients where Senior_Last starts with the search term
      // Escape single quotes in the search term to prevent SQL injection
      const escapedLastName = lastName.trim().replace(/'/g, "''");
      const searchFilter = `Senior_Last LIKE '${escapedLastName}%'`;
      const clientsUrl = `${dataBaseUrl}/tables/${clientsTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}&q.where=${encodeURIComponent(searchFilter)}`;
      
      console.log(`🌐 Fetching page ${pageNumber} from ${clientsTable}...`);

      const clientsResponse = await fetch(clientsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!clientsResponse.ok) {
        const errorText = await clientsResponse.text();
        console.log(`❌ Error response for ${clientsTable} page ${pageNumber}:`, errorText);
        break;
      }

      const clientsData = await clientsResponse.json();
      pageRecords = clientsData.Result || [];
      
      console.log(`📄 Retrieved ${pageRecords.length} clients from page ${pageNumber}`);

      if (pageRecords.length > 0) {
        allClients = allClients.concat(pageRecords);
        pageNumber++;
      }

      if (pageRecords.length < pageSize) {
        console.log(`📋 Reached end of data - got ${pageRecords.length} records`);
        break;
      }

      if (pageNumber > maxPages) {
        console.log(`⚠️ Reached maximum pages limit (${maxPages})`);
        break;
      }
      
    } while (pageRecords.length === pageSize && pageNumber <= maxPages);

    console.log(`✅ Found ${allClients.length} clients matching last name "${lastName}"`);

    // Transform client data
    const clients = allClients.map((client: any) => ({
      clientId2: client.Client_ID2 || '',
      seniorFirst: client.Senior_First || '',
      seniorLast: client.Senior_Last || '',
      seniorFullName: client.Senior_Full_Name || `${client.Senior_First || ''} ${client.Senior_Last || ''}`.trim()
    }));

    // Sort by last name, then first name
    clients.sort((a, b) => {
      const lastNameCompare = (a.seniorLast || '').localeCompare(b.seniorLast || '');
      if (lastNameCompare !== 0) return lastNameCompare;
      return (a.seniorFirst || '').localeCompare(b.seniorFirst || '');
    });

    return NextResponse.json({
      success: true,
      data: {
        clients,
        total: clients.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error searching clients:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to search clients',
        data: {
          clients: [],
          total: 0
        }
      },
      { status: 500 }
    );
  }
}
