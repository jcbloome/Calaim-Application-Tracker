import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('🏥 RCFE Locations API called (Fallback Mode - Caspio API is slow)');
  
  // Generate mock data representing your 250+ RCFEs across California counties
  const mockRCFEs = [];
  const counties = [
    'Los Angeles', 'Orange', 'San Diego', 'Riverside', 'San Bernardino', 
    'Santa Clara', 'Alameda', 'Sacramento', 'Contra Costa', 'Fresno',
    'Kern', 'San Francisco', 'Ventura', 'San Joaquin', 'Stanislaus',
    'Sonoma', 'Tulare', 'Santa Barbara', 'Solano', 'Monterey'
  ];
  
  const cities = {
    'Los Angeles': ['Los Angeles', 'Long Beach', 'Glendale', 'Pasadena', 'Burbank', 'Torrance', 'Inglewood', 'El Monte', 'Downey', 'West Covina'],
    'Orange': ['Anaheim', 'Santa Ana', 'Irvine', 'Huntington Beach', 'Garden Grove', 'Orange', 'Fullerton', 'Costa Mesa', 'Mission Viejo', 'Westminster'],
    'San Diego': ['San Diego', 'Chula Vista', 'Oceanside', 'Escondido', 'Carlsbad', 'El Cajon', 'Vista', 'San Marcos', 'Encinitas', 'National City'],
    'Riverside': ['Riverside', 'Moreno Valley', 'Corona', 'Murrieta', 'Temecula', 'Palm Springs', 'Hemet', 'Perris', 'Lake Elsinore', 'Indio'],
    'San Bernardino': ['San Bernardino', 'Fontana', 'Rancho Cucamonga', 'Ontario', 'Victorville', 'Rialto', 'Hesperia', 'Apple Valley', 'Redlands', 'Highland'],
    'Santa Clara': ['San Jose', 'Sunnyvale', 'Santa Clara', 'Mountain View', 'Milpitas', 'Palo Alto', 'Cupertino', 'Campbell', 'Los Altos', 'Saratoga'],
    'Alameda': ['Oakland', 'Fremont', 'Hayward', 'Berkeley', 'San Leandro', 'Livermore', 'Alameda', 'Pleasanton', 'Union City', 'Newark'],
    'Sacramento': ['Sacramento', 'Elk Grove', 'Roseville', 'Folsom', 'Citrus Heights', 'Rancho Cordova', 'Davis', 'West Sacramento', 'Woodland', 'Vacaville'],
    'Contra Costa': ['Concord', 'Richmond', 'Antioch', 'Fremont', 'Walnut Creek', 'Pittsburg', 'San Ramon', 'Brentwood', 'Oakley', 'Martinez'],
    'Fresno': ['Fresno', 'Clovis', 'Madera', 'Reedley', 'Selma', 'Fowler', 'Sanger', 'Kerman', 'Mendota', 'Coalinga']
  };
  
  // Generate 250+ RCFEs
  let id = 1;
  for (let i = 0; i < 260; i++) {
    const county = counties[i % counties.length];
    const countyCities = cities[county] || ['Unknown City'];
    const city = countyCities[i % countyCities.length];
    
    const rcfeNames = [
      'Sunrise Senior Living', 'Golden Years Care Home', 'Bay Area Senior Care', 'Peaceful Gardens RCFE',
      'Comfort Care Residence', 'Heritage Manor', 'Serenity Senior Home', 'Caring Hands RCFE',
      'Tranquil Living Center', 'Harmony Senior Care', 'Gentle Care Home', 'Loving Hearts RCFE',
      'Compassionate Care Center', 'Dignity Senior Living', 'Grace Manor RCFE', 'Hope Springs Care',
      'Kindness Senior Home', 'Mercy Care Residence', 'Noble Senior Living', 'Peaceful Valley RCFE'
    ];
    
    mockRCFEs.push({
      ID: id.toString(),
      Name: `${rcfeNames[i % rcfeNames.length]} ${Math.floor(i/rcfeNames.length) + 1}`,
      County: county,
      City: city,
      Address: `${100 + (i * 7) % 9000} ${['Main St', 'Oak Ave', 'Pine Rd', 'Elm Dr', 'Maple Way'][i % 5]}`,
      Phone: `${['310', '714', '619', '951', '909'][i % 5]}-555-${String(1000 + (i * 13) % 9000).padStart(4, '0')}`,
      Capacity: [25, 30, 35, 40, 45, 50, 60, 75, 80, 100][i % 10],
      Status: i % 20 === 0 ? 'Inactive' : 'Active', // 5% inactive
      License_Number: `RCFE-${county.substring(0, 2).toUpperCase()}-${String(i + 1).padStart(3, '0')}`
    });
    id++;
  }

  console.log(`🏥 Generated ${mockRCFEs.length} mock RCFEs for testing (Caspio API unavailable)`);

  // Group by county for the response format
  const countySummary: { [key: string]: any } = {};
  
  mockRCFEs.forEach(rcfe => {
    if (!countySummary[rcfe.County]) {
      countySummary[rcfe.County] = {
        county: rcfe.County,
        facilities: [],
        totalCapacity: 0,
        activeCount: 0,
        inactiveCount: 0
      };
    }
    
    countySummary[rcfe.County].facilities.push({
      id: rcfe.ID,
      name: rcfe.Name,
      city: rcfe.City,
      address: rcfe.Address,
      phone: rcfe.Phone,
      capacity: rcfe.Capacity,
      status: rcfe.Status,
      licenseNumber: rcfe.License_Number
    });
    
    countySummary[rcfe.County].totalCapacity += rcfe.Capacity;
    if (rcfe.Status === 'Active') {
      countySummary[rcfe.County].activeCount++;
    } else {
      countySummary[rcfe.County].inactiveCount++;
    }
  });

  const totalCapacity = mockRCFEs.reduce((sum, rcfe) => sum + rcfe.Capacity, 0);
  const activeCount = mockRCFEs.filter(rcfe => rcfe.Status === 'Active').length;
  const inactiveCount = mockRCFEs.filter(rcfe => rcfe.Status === 'Inactive').length;

  return NextResponse.json({
    success: true,
    message: 'RCFE locations retrieved successfully (MOCK DATA - Caspio API temporarily unavailable)',
    data: countySummary,
    totalRCFEs: mockRCFEs.length,
    counties: Object.keys(countySummary).length,
    totalCapacity,
    breakdown: {
      active: activeCount,
      inactive: inactiveCount
    },
    sourceTable: 'MOCK_DATA_CalAIM_tbl_New_RCFE_Registration',
    note: 'This is mock data generated because Caspio API is currently slow/unavailable. Contains realistic 260 RCFEs across California counties for testing purposes.'
  });
}