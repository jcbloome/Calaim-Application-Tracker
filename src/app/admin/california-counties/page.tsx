'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RotateCcw, MapPin, Users, Building2, Navigation } from 'lucide-react';
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
  { name: 'Santa Cruz', lat: 37.0513, lng: -121.9858, population: '273,213', region: 'Central Coast', color: '#14B8A6' },
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
  { name: 'Tuolumne', population: '55,810', region: 'Sierra Nevada', lat: 37.9502, lng: -120.2429, color: '#10B981' },
  { name: 'Ventura', population: '843,843', region: 'Southern California', lat: 34.3705, lng: -119.1391, color: '#EC4899' },
  { name: 'Yolo', population: '216,403', region: 'Central Valley', lat: 38.7646, lng: -121.9018, color: '#F59E0B' },
  { name: 'Yuba', population: '81,575', region: 'Central Valley', lat: 39.2735, lng: -121.4944, color: '#F59E0B' }
];

// Region color mapping
const regionColors = {
  'Bay Area': '#3B82F6',
  'Southern California': '#EC4899', 
  'Central Valley': '#F59E0B',
  'Sierra Nevada': '#10B981',
  'Northern California': '#EF4444',
  'North Coast': '#84CC16',
  'Central Coast': '#14B8A6',
  'Desert': '#F97316'
};

export default function CaliforniaCountiesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);

  // Filter counties based on search and region
  const filteredCounties = useMemo(() => {
    let filtered = californiaCounties;
    
    if (searchTerm) {
      filtered = filtered.filter(county =>
        county.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedRegion) {
      filtered = filtered.filter(county => county.region === selectedRegion);
    }
    
    return filtered;
  }, [searchTerm, selectedRegion]);

  // Get unique regions
  const regions = useMemo(() => {
    return Array.from(new Set(californiaCounties.map(county => county.region)));
  }, []);

  // City search functionality
  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [citySearchResults, setCitySearchResults] = useState<Array<{city: string, county: string}>>([]);
  const [selectedCountyFromCity, setSelectedCountyFromCity] = useState<string>('');

  const handleCitySearch = (term: string) => {
    setCitySearchTerm(term);
    if (term.length > 2) {
      const results = searchCities(term);
      setCitySearchResults(results.slice(0, 10)); // Limit to 10 results
    } else {
      setCitySearchResults([]);
    }
  };

  const handleCitySelect = (city: string, county: string) => {
    setSelectedCountyFromCity(county);
    setSelectedCounty(county);
    setCitySearchTerm(`${city}, ${county} County`);
    setCitySearchResults([]);
  };

  // Get cities in selected county
  const citiesInSelectedCounty = useMemo(() => {
    if (selectedCounty) {
      return getCitiesInCounty(selectedCounty);
    }
    return [];
  }, [selectedCounty]);

  const resetView = () => {
    setSelectedRegion(null);
    setSelectedCounty(null);
    setSearchTerm('');
    setCitySearchTerm('');
    setCitySearchResults([]);
    setSelectedCountyFromCity('');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">California Counties & Cities</h1>
          <p className="text-muted-foreground">
            Explore California's 58 counties with population data, regional groupings, and city lookup functionality.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search counties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetView}
            >
              <RotateCcw className="h-4 w-4" />
              Reset Filters
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* City Search */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                City Lookup
              </CardTitle>
              <CardDescription>
                Search for any California city to find its county
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Enter city name..."
                  value={citySearchTerm}
                  onChange={(e) => handleCitySearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {citySearchResults.length > 0 && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {citySearchResults.map((result, index) => (
                    <button
                      key={index}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm"
                      onClick={() => handleCitySelect(result.city, result.county)}
                    >
                      <div className="font-medium">{result.city}</div>
                      <div className="text-gray-500 text-xs">{result.county} County</div>
                    </button>
                  ))}
                </div>
              )}
              
              {selectedCountyFromCity && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm font-medium text-blue-900">
                    Selected County: {selectedCountyFromCity}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Region Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Regions</CardTitle>
              <CardDescription>
                Filter counties by California regions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button
                  variant={selectedRegion === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedRegion(null)}
                  className="w-full justify-start"
                >
                  All Regions
                </Button>
                {regions.map((region) => (
                  <Button
                    key={region}
                    variant={selectedRegion === region ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedRegion(region)}
                    className="w-full justify-start"
                  >
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: regionColors[region as keyof typeof regionColors] }}
                    />
                    {region}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Selected County Info */}
          {selectedCounty && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {selectedCounty} County
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const county = californiaCounties.find(c => c.name === selectedCounty);
                  return county ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-gray-500">Population</div>
                        <div className="font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {county.population}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Region</div>
                        <div className="font-semibold flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: county.color }}
                          />
                          {county.region}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Coordinates</div>
                        <div className="font-mono text-sm">
                          {county.lat.toFixed(4)}, {county.lng.toFixed(4)}
                        </div>
                      </div>
                      
                      {citiesInSelectedCounty.length > 0 && (
                        <div>
                          <div className="text-sm text-gray-500 mb-2">Major Cities ({citiesInSelectedCounty.length})</div>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {citiesInSelectedCounty.slice(0, 10).map((city, index) => (
                              <div key={index} className="text-sm px-2 py-1 bg-gray-50 rounded">
                                {city}
                              </div>
                            ))}
                            {citiesInSelectedCounty.length > 10 && (
                              <div className="text-xs text-gray-500 px-2">
                                ...and {citiesInSelectedCounty.length - 10} more cities
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        {/* County Cards Grid */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>California Counties ({filteredCounties.length})</CardTitle>
              <CardDescription>
                Click on any county card to view detailed information and city list
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto">
                {filteredCounties.map((county) => (
                  <Card
                    key={county.name}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                      selectedCounty === county.name
                        ? 'ring-2 ring-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedCounty(selectedCounty === county.name ? null : county.name)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: county.color }}
                          />
                          <h3 className="font-semibold text-sm">{county.name}</h3>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {county.region}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{county.population}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{county.lat.toFixed(2)}, {county.lng.toFixed(2)}</span>
                        </div>
                      </div>

                      {selectedCounty === county.name && citiesInSelectedCounty.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-xs font-medium text-gray-700 mb-2">
                            Cities ({citiesInSelectedCounty.length})
                          </div>
                          <div className="max-h-32 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-1">
                              {citiesInSelectedCounty.slice(0, 8).map((city, index) => (
                                <div 
                                  key={index} 
                                  className="text-xs px-2 py-1 bg-white rounded border text-gray-600"
                                >
                                  {city}
                                </div>
                              ))}
                              {citiesInSelectedCounty.length > 8 && (
                                <div className="text-xs px-2 py-1 text-gray-500 italic">
                                  +{citiesInSelectedCounty.length - 8} more cities
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{filteredCounties.length}</div>
                <div className="text-sm text-gray-500">Counties Shown</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {filteredCounties.reduce((sum, county) => {
                    const pop = parseInt(county.population.replace(/,/g, ''));
                    return sum + pop;
                  }, 0).toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Total Population</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Building2 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{regions.length}</div>
                <div className="text-sm text-gray-500">Regions</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}