'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ZoomIn, ZoomOut, RotateCcw, MapPin, Users, Building2, Navigation } from 'lucide-react';
import { findCountyByCity, searchCities, getCitiesInCounty } from '@/lib/california-cities';

// California counties data with coordinates and basic info
const californiaCounties = [
  { name: 'Alameda', population: '1,682,353', region: 'Bay Area', lat: 37.6017, lng: -121.7195, color: '#3B82F6' },
  { name: 'Alpine', population: '1,204', region: 'Sierra Nevada', lat: 38.7596, lng: -119.8138, color: '#10B981' },
  { name: 'Amador', population: '40,474', region: 'Central Valley', lat: 38.4580, lng: -120.6532, color: '#F59E0B' },
  { name: 'Butte', population: '219,186', region: 'Northern California', lat: 39.6395, lng: -121.6168, color: '#EF4444' },
  { name: 'Calaveras', population: '45,905', region: 'Central Valley', lat: 38.2096, lng: -120.5687, color: '#8B5CF6' },
  { name: 'Colusa', population: '21,917', region: 'Central Valley', lat: 39.2149, lng: -122.2094, color: '#06B6D4' },
  { name: 'Contra Costa', population: '1,165,927', region: 'Bay Area', lat: 37.9161, lng: -121.9364, color: '#3B82F6' },
  { name: 'Del Norte', population: '27,812', region: 'North Coast', lat: 41.7056, lng: -124.1287, color: '#84CC16' },
  { name: 'El Dorado', population: '191,185', region: 'Sierra Nevada', lat: 38.7265, lng: -120.5624, color: '#10B981' },
  { name: 'Fresno', population: '1,008,654', region: 'Central Valley', lat: 36.7378, lng: -119.7871, color: '#F59E0B' },
  { name: 'Glenn', population: '28,393', region: 'Central Valley', lat: 39.5918, lng: -122.3894, color: '#F59E0B' },
  { name: 'Humboldt', population: '136,463', region: 'North Coast', lat: 40.7450, lng: -123.8695, color: '#84CC16' },
  { name: 'Imperial', population: '179,702', region: 'Desert', lat: 32.8394, lng: -115.3617, color: '#F97316' },
  { name: 'Inyo', population: '19,016', region: 'Sierra Nevada', lat: 36.8008, lng: -118.2273, color: '#10B981' },
  { name: 'Kern', population: '900,202', region: 'Central Valley', lat: 35.3738, lng: -118.9597, color: '#F59E0B' },
  { name: 'Kings', population: '152,940', region: 'Central Valley', lat: 36.1015, lng: -119.9624, color: '#F59E0B' },
  { name: 'Lake', population: '68,163', region: 'North Coast', lat: 39.0840, lng: -122.8084, color: '#84CC16' },
  { name: 'Lassen', population: '32,730', region: 'Northern California', lat: 40.4780, lng: -120.5542, color: '#EF4444' },
  { name: 'Los Angeles', population: '9,861,224', region: 'Southern California', lat: 34.0522, lng: -118.2437, color: '#EC4899' },
  { name: 'Madera', population: '156,255', region: 'Central Valley', lat: 37.0611, lng: -119.8897, color: '#F59E0B' },
  { name: 'Marin', population: '258,826', region: 'Bay Area', lat: 38.0834, lng: -122.7633, color: '#3B82F6' },
  { name: 'Mariposa', population: '17,131', region: 'Sierra Nevada', lat: 37.4849, lng: -119.9663, color: '#10B981' },
  { name: 'Mendocino', population: '91,305', region: 'North Coast', lat: 39.3080, lng: -123.4384, color: '#84CC16' },
  { name: 'Merced', population: '281,202', region: 'Central Valley', lat: 37.3022, lng: -120.4829, color: '#F59E0B' },
  { name: 'Modoc', population: '8,700', region: 'Northern California', lat: 41.5949, lng: -120.1696, color: '#EF4444' },
  { name: 'Mono', population: '14,444', region: 'Sierra Nevada', lat: 37.8585, lng: -118.9648, color: '#10B981' },
  { name: 'Monterey', population: '439,035', region: 'Central Coast', lat: 36.2677, lng: -121.4018, color: '#14B8A6' },
  { name: 'Napa', population: '138,019', region: 'Bay Area', lat: 38.5025, lng: -122.2654, color: '#3B82F6' },
  { name: 'Nevada', population: '102,241', region: 'Sierra Nevada', lat: 39.2362, lng: -121.0159, color: '#10B981' },
  { name: 'Orange', population: '3,186,989', region: 'Southern California', lat: 33.7175, lng: -117.8311, color: '#EC4899' },
  { name: 'Placer', population: '404,739', region: 'Sierra Nevada', lat: 39.0916, lng: -120.8039, color: '#10B981' },
  { name: 'Plumas', population: '19,915', region: 'Sierra Nevada', lat: 39.9266, lng: -120.8347, color: '#10B981' },
  { name: 'Riverside', population: '2,418,185', region: 'Southern California', lat: 33.7537, lng: -116.3755, color: '#EC4899' },
  { name: 'Sacramento', population: '1,585,055', region: 'Central Valley', lat: 38.4747, lng: -121.3542, color: '#F59E0B' },
  { name: 'San Benito', population: '64,209', region: 'Central Coast', lat: 36.5761, lng: -120.9876, color: '#14B8A6' },
  { name: 'San Bernardino', population: '2,181,654', region: 'Southern California', lat: 34.8394, lng: -116.2394, color: '#EC4899' },
  { name: 'San Diego', population: '3,298,634', region: 'Southern California', lat: 32.7157, lng: -117.1611, color: '#EC4899' },
  { name: 'San Francisco', population: '873,965', region: 'Bay Area', lat: 37.7749, lng: -122.4194, color: '#3B82F6' },
  { name: 'San Joaquin', population: '779,233', region: 'Central Valley', lat: 37.9357, lng: -121.2907, color: '#F59E0B' },
  { name: 'San Luis Obispo', population: '282,424', region: 'Central Coast', lat: 35.2828, lng: -120.6596, color: '#14B8A6' },
  { name: 'San Mateo', population: '764,442', region: 'Bay Area', lat: 37.5630, lng: -122.3255, color: '#3B82F6' },
  { name: 'Santa Barbara', population: '448,229', region: 'Central Coast', lat: 34.4208, lng: -119.6982, color: '#14B8A6' },
  { name: 'Santa Clara', population: '1,936,259', region: 'Bay Area', lat: 37.3541, lng: -121.9552, color: '#3B82F6' },
  { name: 'Santa Cruz', population: '273,213', region: 'Central Coast', lat: 37.0513, lng: -121.9858, color: '#14B8A6' },
  { name: 'Shasta', population: '182,155', region: 'Northern California', lat: 40.7751, lng: -122.2047, color: '#EF4444' },
  { name: 'Sierra', population: '3,236', region: 'Sierra Nevada', lat: 39.5777, lng: -120.5135, color: '#10B981' },
  { name: 'Siskiyou', population: '44,076', region: 'Northern California', lat: 41.8057, lng: -122.7108, color: '#EF4444' },
  { name: 'Solano', population: '453,491', region: 'Bay Area', lat: 38.3105, lng: -121.8308, color: '#3B82F6' },
  { name: 'Sonoma', population: '488,863', region: 'Bay Area', lat: 38.5816, lng: -122.8678, color: '#3B82F6' },
  { name: 'Stanislaus', population: '552,878', region: 'Central Valley', lat: 37.5091, lng: -120.9876, color: '#F59E0B' },
  { name: 'Sutter', population: '99,633', region: 'Central Valley', lat: 39.0282, lng: -121.6169, color: '#F59E0B' },
  { name: 'Tehama', population: '65,084', region: 'Northern California', lat: 40.0274, lng: -122.1958, color: '#EF4444' },
  { name: 'Trinity', population: '16,060', region: 'Northern California', lat: 40.6221, lng: -123.1351, color: '#EF4444' },
  { name: 'Tulare', population: '473,117', region: 'Central Valley', lat: 36.2077, lng: -118.8597, color: '#F59E0B' },
  { name: 'Tuolumne', population: '55,810', region: 'Sierra Nevada', lat: 37.9502, lng: -120.2624, color: '#10B981' },
  { name: 'Ventura', population: '843,843', region: 'Southern California', lat: 34.3705, lng: -119.1391, color: '#EC4899' },
  { name: 'Yolo', population: '216,403', region: 'Central Valley', lat: 38.7646, lng: -121.9018, color: '#F59E0B' },
  { name: 'Yuba', population: '81,575', region: 'Central Valley', lat: 39.2735, lng: -121.4944, color: '#F59E0B' },
];

const regions = [
  { name: 'Bay Area', color: '#3B82F6', count: 9 },
  { name: 'Southern California', color: '#EC4899', count: 7 },
  { name: 'Central Valley', color: '#F59E0B', count: 19 },
  { name: 'Sierra Nevada', color: '#10B981', count: 12 },
  { name: 'Northern California', color: '#EF4444', count: 7 },
  { name: 'North Coast', color: '#84CC16', count: 4 },
  { name: 'Central Coast', color: '#14B8A6', count: 6 },
  { name: 'Desert', color: '#F97316', count: 1 },
];

export default function CaliforniaMapPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<typeof californiaCounties[0] | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [citySearchResults, setCitySearchResults] = useState<Array<{city: string, county: string}>>([]);

  const filteredCounties = californiaCounties.filter(county =>
    county.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    county.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedCounties = selectedRegion 
    ? filteredCounties.filter(county => county.region === selectedRegion)
    : filteredCounties;

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
  const handleReset = () => {
    setZoomLevel(1);
    setSelectedCounty(null);
    setSelectedRegion(null);
    setSearchTerm('');
    setCitySearchTerm('');
    setCitySearchResults([]);
  };

  // Handle city search
  const handleCitySearch = (value: string) => {
    setCitySearchTerm(value);
    if (value.length >= 2) {
      const results = searchCities(value);
      setCitySearchResults(results);
    } else {
      setCitySearchResults([]);
    }
  };

  // Handle city selection
  const handleCitySelect = (city: string, county: string) => {
    const countyData = californiaCounties.find(c => c.name === county);
    if (countyData) {
      setSelectedCounty(countyData);
      setCitySearchTerm(`${city} → ${county} County`);
      setCitySearchResults([]);
    }
  };

  // Get cities in selected county
  const citiesInSelectedCounty = useMemo(() => {
    if (!selectedCounty) return [];
    return getCitiesInCounty(selectedCounty.name);
  }, [selectedCounty]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel - Controls and Info */}
        <div className="lg:w-1/3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                California Counties Map
              </CardTitle>
              <CardDescription>
                Interactive map of all 58 California counties with city lookup functionality.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* County Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search counties or regions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* City Search */}
              <div className="relative">
                <Navigation className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search cities to find their county..."
                  value={citySearchTerm}
                  onChange={(e) => handleCitySearch(e.target.value)}
                  className="pl-10"
                />
                {citySearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                    {citySearchResults.map((result, index) => (
                      <button
                        key={index}
                        onClick={() => handleCitySelect(result.city, result.county)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium capitalize">{result.city}</div>
                        <div className="text-sm text-gray-600">{result.county} County</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex gap-2">
                <Button onClick={handleZoomIn} size="sm" variant="outline">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button onClick={handleZoomOut} size="sm" variant="outline">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button onClick={handleReset} size="sm" variant="outline">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {/* Region Filter */}
              <div>
                <h3 className="font-semibold mb-2">Filter by Region:</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setSelectedRegion(null)}
                    size="sm"
                    variant={selectedRegion === null ? "default" : "outline"}
                  >
                    All Regions
                  </Button>
                  {regions.map((region) => (
                    <Button
                      key={region.name}
                      onClick={() => setSelectedRegion(region.name)}
                      size="sm"
                      variant={selectedRegion === region.name ? "default" : "outline"}
                      style={{
                        backgroundColor: selectedRegion === region.name ? region.color : undefined,
                        borderColor: region.color,
                        color: selectedRegion === region.name ? 'white' : region.color
                      }}
                    >
                      {region.name} ({region.count})
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected County Info */}
          {selectedCounty && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedCounty.name} County
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">Population:</span>
                  <span>{selectedCounty.population}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">Region:</span>
                  <Badge style={{ backgroundColor: selectedCounty.color }}>
                    {selectedCounty.region}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Coordinates:</span> {selectedCounty.lat.toFixed(4)}, {selectedCounty.lng.toFixed(4)}
                </div>
                
                {/* Cities in County */}
                {citiesInSelectedCounty.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Major Cities ({citiesInSelectedCounty.length}):</h4>
                    <div className="max-h-32 overflow-y-auto">
                      <div className="grid grid-cols-1 gap-1 text-sm">
                        {citiesInSelectedCounty.slice(0, 10).map((city, index) => (
                          <div key={index} className="capitalize text-gray-600">
                            {city}
                          </div>
                        ))}
                        {citiesInSelectedCounty.length > 10 && (
                          <div className="text-xs text-gray-500 italic">
                            +{citiesInSelectedCounty.length - 10} more cities
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* County List */}
          <Card>
            <CardHeader>
              <CardTitle>Counties ({displayedCounties.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {displayedCounties.map((county) => (
                  <div
                    key={county.name}
                    onClick={() => setSelectedCounty(county)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCounty?.name === county.name
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{county.name}</div>
                        <div className="text-sm text-gray-600">{county.population}</div>
                      </div>
                      <Badge style={{ backgroundColor: county.color }}>
                        {county.region}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Map */}
        <div className="lg:w-2/3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Interactive California Map</CardTitle>
              <CardDescription>
                Click on counties to view details. Search for cities to find their counties.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative bg-gradient-to-b from-blue-50 to-green-50 rounded-lg overflow-hidden" style={{ height: '700px' }}>
                {/* Proper California SVG Map */}
                <div 
                  className="absolute inset-0 transition-transform duration-300"
                  style={{ 
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: 'center center'
                  }}
                >
                  {/* California state outline (more accurate) */}
                  <svg
                    viewBox="0 0 600 800"
                    className="absolute inset-0 w-full h-full"
                    style={{ filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.1))' }}
                  >
                    {/* More accurate California outline */}
                    <path
                      d="M158 50 L180 45 L200 48 L220 52 L250 58 L280 65 L310 75 L340 85 L370 95 L400 110 L420 125 L440 145 L455 170 L465 200 L470 230 L475 260 L478 290 L480 320 L482 350 L485 380 L488 410 L490 440 L492 470 L495 500 L498 530 L500 560 L502 590 L505 620 L508 650 L510 680 L512 710 L510 740 L505 760 L495 775 L480 785 L460 790 L440 792 L420 790 L400 785 L380 778 L360 770 L340 760 L320 748 L300 735 L280 720 L260 703 L240 685 L220 665 L200 643 L185 620 L172 595 L162 568 L155 540 L150 510 L148 480 L147 450 L146 420 L145 390 L144 360 L143 330 L142 300 L141 270 L140 240 L142 210 L145 180 L150 150 L155 120 L158 90 Z"
                      fill="#ffffff"
                      stroke="#e2e8f0"
                      strokeWidth="2"
                      className="drop-shadow-sm"
                    />
                  </svg>

                  {/* County markers */}
                  {displayedCounties.map((county) => {
                    // Better coordinate mapping for California
                    const x = ((county.lng + 125) / 15) * 600;
                    const y = ((42 - county.lat) / 10) * 800;
                    
                    return (
                      <div
                        key={county.name}
                        onClick={() => setSelectedCounty(county)}
                        className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 hover:scale-125 hover:z-10"
                        style={{
                          left: `${Math.max(20, Math.min(580, x))}px`,
                          top: `${Math.max(20, Math.min(780, y))}px`,
                        }}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border-2 border-white shadow-lg ${
                            selectedCounty?.name === county.name ? 'ring-2 ring-blue-500 ring-offset-2 scale-125' : ''
                          }`}
                          style={{ backgroundColor: county.color }}
                          title={`${county.name} County - ${county.population}`}
                        />
                        {selectedCounty?.name === county.name && (
                          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow-lg text-xs font-medium whitespace-nowrap z-20">
                            {county.name} County
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg">
                  <h4 className="font-semibold text-sm mb-2">Regions</h4>
                  <div className="space-y-1">
                    {regions.map((region) => (
                      <div key={region.name} className="flex items-center gap-2 text-xs">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: region.color }}
                        />
                        <span>{region.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Zoom indicator */}
                <div className="absolute top-4 right-4 bg-white px-2 py-1 rounded shadow text-sm">
                  Zoom: {Math.round(zoomLevel * 100)}%
                </div>

                {/* Instructions */}
                <div className="absolute top-4 left-4 bg-white p-3 rounded-lg shadow-lg max-w-xs">
                  <h4 className="font-semibold text-sm mb-1">How to Use:</h4>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• Click county dots to view details</li>
                    <li>• Search cities to find their counties</li>
                    <li>• Filter by regions using buttons</li>
                    <li>• Use zoom controls to explore</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}