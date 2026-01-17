'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  MapPin, 
  Users, 
  Building2, 
  Navigation, 
  Stethoscope,
  UserCheck,
  Home,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Filter,
  BarChart3,
  ChevronDown
} from 'lucide-react';
import { findCountyByCity, searchCities, getCitiesInCounty } from '@/lib/california-cities';
import { useToast } from '@/hooks/use-toast';
import GoogleMapsComponent from '@/components/GoogleMapsComponent';

// Types
interface StaffMember {
  id: string;
  name: string;
  role: 'Social Worker' | 'RN';
  county: string;
  city?: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
}

interface RCFE {
  id: string;
  name: string;
  county: string;
  city?: string;
  address?: string;
  phone?: string;
  capacity?: number;
  licensedBeds?: number;
  status: 'Active' | 'Inactive';
  licenseNumber?: string;
  contactPerson?: string;
}

interface CountyData {
  county: string;
  socialWorkers: StaffMember[];
  rns: StaffMember[];
  total: number;
}

interface RCFECountyData {
  county: string;
  facilities: RCFE[];
  totalCapacity: number;
  activeCount: number;
  inactiveCount: number;
}

// California counties with coordinates
const californiaCounties = [
  { name: 'Alameda', lat: 37.6017, lng: -121.7195, region: 'Bay Area' },
  { name: 'Alpine', lat: 38.7596, lng: -119.8138, region: 'Sierra Nevada' },
  { name: 'Amador', lat: 38.4580, lng: -120.6532, region: 'Central Valley' },
  { name: 'Butte', lat: 39.6395, lng: -121.6168, region: 'Northern California' },
  { name: 'Calaveras', lat: 38.2096, lng: -120.5687, region: 'Central Valley' },
  { name: 'Colusa', lat: 39.2149, lng: -122.2094, region: 'Central Valley' },
  { name: 'Contra Costa', lat: 37.9161, lng: -121.9364, region: 'Bay Area' },
  { name: 'Del Norte', lat: 41.7056, lng: -124.1287, region: 'North Coast' },
  { name: 'El Dorado', lat: 38.7265, lng: -120.5624, region: 'Sierra Nevada' },
  { name: 'Fresno', lat: 36.7378, lng: -119.7871, region: 'Central Valley' },
  { name: 'Glenn', lat: 39.5918, lng: -122.3894, region: 'Central Valley' },
  { name: 'Humboldt', lat: 40.7450, lng: -123.8695, region: 'North Coast' },
  { name: 'Imperial', lat: 32.8394, lng: -115.3617, region: 'Desert' },
  { name: 'Inyo', lat: 36.8008, lng: -118.2273, region: 'Sierra Nevada' },
  { name: 'Kern', lat: 35.3738, lng: -118.9597, region: 'Central Valley' },
  { name: 'Kings', lat: 36.1015, lng: -119.9624, region: 'Central Valley' },
  { name: 'Lake', lat: 39.0840, lng: -122.8084, region: 'North Coast' },
  { name: 'Lassen', lat: 40.4780, lng: -120.5542, region: 'Northern California' },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, region: 'Southern California' },
  { name: 'Madera', lat: 37.0611, lng: -119.8897, region: 'Central Valley' },
  { name: 'Marin', lat: 38.0834, lng: -122.7633, region: 'Bay Area' },
  { name: 'Mariposa', lat: 37.4849, lng: -119.9663, region: 'Sierra Nevada' },
  { name: 'Mendocino', lat: 39.3080, lng: -123.4384, region: 'North Coast' },
  { name: 'Merced', lat: 37.3022, lng: -120.4829, region: 'Central Valley' },
  { name: 'Modoc', lat: 41.5949, lng: -120.1696, region: 'Northern California' },
  { name: 'Mono', lat: 37.8585, lng: -118.9648, region: 'Sierra Nevada' },
  { name: 'Monterey', lat: 36.2677, lng: -121.4018, region: 'Central Coast' },
  { name: 'Napa', lat: 38.5025, lng: -122.2654, region: 'Bay Area' },
  { name: 'Nevada', lat: 39.2362, lng: -121.0159, region: 'Sierra Nevada' },
  { name: 'Orange', lat: 33.7175, lng: -117.8311, region: 'Southern California' },
  { name: 'Placer', lat: 39.0916, lng: -120.8039, region: 'Sierra Nevada' },
  { name: 'Plumas', lat: 39.9266, lng: -120.8347, region: 'Sierra Nevada' },
  { name: 'Riverside', lat: 33.7537, lng: -116.3755, region: 'Southern California' },
  { name: 'Sacramento', lat: 38.4747, lng: -121.3542, region: 'Central Valley' },
  { name: 'San Benito', lat: 36.5761, lng: -120.9876, region: 'Central Coast' },
  { name: 'San Bernardino', lat: 34.8394, lng: -116.2394, region: 'Southern California' },
  { name: 'San Diego', lat: 32.7157, lng: -117.1611, region: 'Southern California' },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194, region: 'Bay Area' },
  { name: 'San Joaquin', lat: 37.9357, lng: -121.2907, region: 'Central Valley' },
  { name: 'San Luis Obispo', lat: 35.2828, lng: -120.6596, region: 'Central Coast' },
  { name: 'San Mateo', lat: 37.5630, lng: -122.3255, region: 'Bay Area' },
  { name: 'Santa Barbara', lat: 34.4208, lng: -119.6982, region: 'Central Coast' },
  { name: 'Santa Clara', lat: 37.3541, lng: -121.9552, region: 'Bay Area' },
  { name: 'Santa Cruz', lat: 37.0513, lng: -121.9858, region: 'Central Coast' },
  { name: 'Shasta', lat: 40.7751, lng: -122.2047, region: 'Northern California' },
  { name: 'Sierra', lat: 39.5777, lng: -120.5135, region: 'Sierra Nevada' },
  { name: 'Siskiyou', lat: 41.8057, lng: -122.7108, region: 'Northern California' },
  { name: 'Solano', lat: 38.3105, lng: -121.8308, region: 'Bay Area' },
  { name: 'Sonoma', lat: 38.5816, lng: -122.8678, region: 'Bay Area' },
  { name: 'Stanislaus', lat: 37.5091, lng: -120.9876, region: 'Central Valley' },
  { name: 'Sutter', lat: 39.0282, lng: -121.6169, region: 'Central Valley' },
  { name: 'Tehama', lat: 40.0274, lng: -122.1958, region: 'Northern California' },
  { name: 'Trinity', lat: 40.6221, lng: -123.1351, region: 'Northern California' },
  { name: 'Tulare', lat: 36.2077, lng: -118.8597, region: 'Central Valley' },
  { name: 'Tuolumne', lat: 37.9502, lng: -120.2624, region: 'Sierra Nevada' },
  { name: 'Ventura', lat: 34.3705, lng: -119.1391, region: 'Southern California' },
  { name: 'Yolo', lat: 38.7646, lng: -121.9018, region: 'Central Valley' },
  { name: 'Yuba', lat: 39.2735, lng: -121.4944, region: 'Central Valley' },
];

export default function EnhancedCaliforniaMapPage() {
  // State management
  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);
  const [selectedCountyFromDropdown, setSelectedCountyFromDropdown] = useState<string>('');
  const [citySearchResults, setCitySearchResults] = useState<Array<{city: string, county: string}>>([]);
  const [activeTab, setActiveTab] = useState('staff');
  
  // Data state
  const [staffData, setStaffData] = useState<Record<string, CountyData>>({});
  const [rcfeData, setRCFEData] = useState<Record<string, RCFECountyData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Layer visibility
  const [showStaffLayer, setShowStaffLayer] = useState(true);
  const [showRCFELayer, setShowRCFELayer] = useState(false);
  const [showCountyBoundaries, setShowCountyBoundaries] = useState(true);

  const { toast } = useToast();

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Fetching staff and RCFE data...');
      
      const [staffResponse, rcfeResponse] = await Promise.all([
        fetch('/api/staff-locations'),
        fetch('/api/rcfe-locations')
      ]);

      const staffResult = await staffResponse.json();
      const rcfeResult = await rcfeResponse.json();

      if (staffResult.success) {
        setStaffData(staffResult.data.staffByCounty);
        console.log('✅ Staff data loaded:', staffResult.data);
      } else {
        console.error('❌ Staff data error:', staffResult.error);
      }

      if (rcfeResult.success) {
        setRCFEData(rcfeResult.data.rcfesByCounty);
        console.log('✅ RCFE data loaded:', rcfeResult.data);
      } else {
        console.error('❌ RCFE data error:', rcfeResult.error);
      }

      toast({
        title: "Data Loaded",
        description: `Loaded staff from ${Object.keys(staffResult.data?.staffByCounty || {}).length} counties and RCFEs from ${Object.keys(rcfeResult.data?.rcfesByCounty || {}).length} counties`,
      });

    } catch (error: any) {
      console.error('❌ Error fetching data:', error);
      setError(error.message);
      toast({
        title: "Error Loading Data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
    setSelectedCounty(county);
    setSelectedCountyFromDropdown(county);
    setCitySearchTerm(`${city} → ${county} County`);
    setCitySearchResults([]);
  };

  // Handle county dropdown selection
  const handleCountyDropdownChange = (county: string) => {
    setSelectedCountyFromDropdown(county);
    setSelectedCounty(county);
    setCitySearchTerm('');
    setCitySearchResults([]);
  };

  // Get county data for display
  const getCountyDisplayData = (countyName: string) => {
    const staff = staffData[countyName];
    const rcfe = rcfeData[countyName];
    
    return {
      staff: staff || { county: countyName, socialWorkers: [], rns: [], total: 0 },
      rcfe: rcfe || { county: countyName, facilities: [], totalCapacity: 0, activeCount: 0, inactiveCount: 0 }
    };
  };


  // Get cities in selected county
  const citiesInSelectedCounty = useMemo(() => {
    if (!selectedCountyFromDropdown) return [];
    return getCitiesInCounty(selectedCountyFromDropdown);
  }, [selectedCountyFromDropdown]);

  // Get selected county data
  const selectedCountyData = useMemo(() => {
    if (!selectedCountyFromDropdown) return null;
    return californiaCounties.find(c => c.name === selectedCountyFromDropdown);
  }, [selectedCountyFromDropdown]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalStaff = Object.values(staffData).reduce((sum, county) => sum + county.total, 0);
    const totalSocialWorkers = Object.values(staffData).reduce((sum, county) => sum + county.socialWorkers.length, 0);
    const totalRNs = Object.values(staffData).reduce((sum, county) => sum + county.rns.length, 0);
    const totalRCFEs = Object.values(rcfeData).reduce((sum, county) => sum + county.facilities.length, 0);
    const totalCapacity = Object.values(rcfeData).reduce((sum, county) => sum + county.totalCapacity, 0);
    
    return {
      totalStaff,
      totalSocialWorkers,
      totalRNs,
      totalRCFEs,
      totalCapacity,
      countiesWithStaff: Object.keys(staffData).length,
      countiesWithRCFEs: Object.keys(rcfeData).length
    };
  }, [staffData, rcfeData]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading staff and RCFE data from Caspio...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Enhanced California Resource Map</h1>
          <p className="text-muted-foreground">Interactive map showing staff locations and RCFE facilities across California</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Staff</p>
                <p className="text-2xl font-bold">{summaryStats.totalStaff}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Social Workers</p>
                <p className="text-2xl font-bold">{summaryStats.totalSocialWorkers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">RNs</p>
                <p className="text-2xl font-bold">{summaryStats.totalRNs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">RCFEs</p>
                <p className="text-2xl font-bold">{summaryStats.totalRCFEs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Beds</p>
                <p className="text-2xl font-bold">{summaryStats.totalCapacity}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-indigo-600" />
              <div>
                <p className="text-sm text-muted-foreground">Counties</p>
                <p className="text-2xl font-bold">{Math.max(summaryStats.countiesWithStaff, summaryStats.countiesWithRCFEs)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Controls and Data */}
        <div className="lg:col-span-1 space-y-6">
          {/* Search Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search & Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* County Dropdown */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Select County</Label>
                <Select value={selectedCountyFromDropdown} onValueChange={handleCountyDropdownChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a county..." />
                  </SelectTrigger>
                  <SelectContent>
                    {californiaCounties
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((county) => (
                        <SelectItem key={county.name} value={county.name}>
                          {county.name} County
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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

              {/* Layer Controls */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Map Layers</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="staff-layer"
                      checked={showStaffLayer}
                      onCheckedChange={setShowStaffLayer}
                    />
                    <Label htmlFor="staff-layer" className="text-sm">Staff Locations</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="rcfe-layer"
                      checked={showRCFELayer}
                      onCheckedChange={setShowRCFELayer}
                    />
                    <Label htmlFor="rcfe-layer" className="text-sm">RCFE Facilities</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="county-boundaries"
                      checked={showCountyBoundaries}
                      onCheckedChange={setShowCountyBoundaries}
                    />
                    <Label htmlFor="county-boundaries" className="text-sm">County Boundaries</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected County Cities */}
          {selectedCountyFromDropdown && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {selectedCountyFromDropdown} County
                </CardTitle>
                <CardDescription>
                  Cities and location information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedCountyData && (
                  <div className="space-y-4">
                    {/* County Info */}
                    <div className="p-3 bg-blue-50 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Region:</span>
                        <span className="text-sm text-gray-600">{selectedCountyData.region}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Coordinates:</span>
                        <span className="text-sm text-gray-600">
                          {selectedCountyData.lat.toFixed(4)}, {selectedCountyData.lng.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {/* Cities List */}
                    <div>
                      <h4 className="font-medium mb-2">Major Cities ({citiesInSelectedCounty.length})</h4>
                      {citiesInSelectedCounty.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto">
                          <div className="grid grid-cols-1 gap-1">
                            {citiesInSelectedCounty.map((city, index) => (
                              <div 
                                key={index} 
                                className="p-2 text-sm capitalize text-gray-700 hover:bg-gray-50 rounded border-b border-gray-100 last:border-b-0"
                              >
                                {city}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No major cities found in our database</p>
                      )}
                    </div>

                    {/* View on Map Button */}
                    <Button 
                      onClick={() => setSelectedCounty(selectedCountyFromDropdown)}
                      className="w-full"
                      variant="outline"
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Center Map on {selectedCountyFromDropdown}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Data Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Resource Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="staff">Staff</TabsTrigger>
                  <TabsTrigger value="rcfe">RCFEs</TabsTrigger>
                </TabsList>
                
                <TabsContent value="staff" className="space-y-4">
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {Object.entries(staffData)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([countyName, data]) => (
                        <div
                          key={countyName}
                          onClick={() => {
                            setSelectedCounty(countyName);
                            setSelectedCountyFromDropdown(countyName);
                          }}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedCounty === countyName
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{countyName} County</div>
                              <div className="text-sm text-gray-600">
                                {data.socialWorkers.length} SW, {data.rns.length} RN
                              </div>
                            </div>
                            <Badge variant="secondary">{data.total}</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="rcfe" className="space-y-4">
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {Object.entries(rcfeData)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([countyName, data]) => (
                        <div
                          key={countyName}
                          onClick={() => {
                            setSelectedCounty(countyName);
                            setSelectedCountyFromDropdown(countyName);
                          }}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedCounty === countyName
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{countyName} County</div>
                              <div className="text-sm text-gray-600">
                                {data.facilities.length} facilities, {data.totalCapacity} beds
                              </div>
                            </div>
                            <Badge variant="secondary">{data.activeCount}</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Map */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Interactive California Map</CardTitle>
              <CardDescription>
                Click on counties to view staff and RCFE details. Toggle layers to show different data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative rounded-lg overflow-hidden" style={{ height: '600px' }}>
                <GoogleMapsComponent
                  center={{ lat: 36.7783, lng: -119.4179 }}
                  zoom={6}
                  staffData={staffData}
                  rcfeData={rcfeData}
                  showStaffLayer={showStaffLayer}
                  showRCFELayer={showRCFELayer}
                  onCountySelect={(county) => {
                    setSelectedCounty(county);
                    setSelectedCountyFromDropdown(county);
                  }}
                />

                {/* Legend */}
                <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg z-10">
                  <h4 className="font-semibold text-sm mb-2">Legend</h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span>Social Workers</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>Registered Nurses</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <span>RCFE Facilities</span>
                    </div>
                  </div>
                </div>

                {/* Layer Status */}
                <div className="absolute top-4 right-4 bg-white p-2 rounded shadow text-xs z-10">
                  <div className="flex items-center gap-2">
                    {showStaffLayer && <Eye className="h-3 w-3 text-green-600" />}
                    {!showStaffLayer && <EyeOff className="h-3 w-3 text-gray-400" />}
                    <span>Staff</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {showRCFELayer && <Eye className="h-3 w-3 text-purple-600" />}
                    {!showRCFELayer && <EyeOff className="h-3 w-3 text-gray-400" />}
                    <span>RCFEs</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Selected County Details */}
      {selectedCounty && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedCounty} County Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="staff-details">
              <TabsList>
                <TabsTrigger value="staff-details">Staff Details</TabsTrigger>
                <TabsTrigger value="rcfe-details">RCFE Details</TabsTrigger>
              </TabsList>
              
              <TabsContent value="staff-details" className="space-y-4">
                {(() => {
                  const data = getCountyDisplayData(selectedCounty);
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Social Workers */}
                      <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-green-600" />
                          Social Workers ({data.staff.socialWorkers.length})
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {data.staff.socialWorkers.map((sw) => (
                            <div key={sw.id} className="p-2 bg-green-50 rounded border">
                              <div className="font-medium">{sw.name}</div>
                              {sw.city && <div className="text-sm text-gray-600">{sw.city}</div>}
                              {sw.email && <div className="text-xs text-gray-500">{sw.email}</div>}
                            </div>
                          ))}
                          {data.staff.socialWorkers.length === 0 && (
                            <p className="text-gray-500 text-sm">No social workers in this county</p>
                          )}
                        </div>
                      </div>

                      {/* RNs */}
                      <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-red-600" />
                          Registered Nurses ({data.staff.rns.length})
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {data.staff.rns.map((rn) => (
                            <div key={rn.id} className="p-2 bg-red-50 rounded border">
                              <div className="font-medium">{rn.name}</div>
                              {rn.city && <div className="text-sm text-gray-600">{rn.city}</div>}
                              {rn.email && <div className="text-xs text-gray-500">{rn.email}</div>}
                            </div>
                          ))}
                          {data.staff.rns.length === 0 && (
                            <p className="text-gray-500 text-sm">No RNs in this county</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>
              
              <TabsContent value="rcfe-details" className="space-y-4">
                {(() => {
                  const data = getCountyDisplayData(selectedCounty);
                  return (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Home className="h-4 w-4 text-purple-600" />
                        RCFE Facilities ({data.rcfe.facilities.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                        {data.rcfe.facilities.map((facility) => (
                          <div key={facility.id} className="p-3 bg-purple-50 rounded border">
                            <div className="font-medium">{facility.name}</div>
                            {facility.city && <div className="text-sm text-gray-600">{facility.city}</div>}
                            {facility.address && <div className="text-xs text-gray-500">{facility.address}</div>}
                            {facility.capacity && (
                              <div className="text-xs text-purple-700 mt-1">
                                Capacity: {facility.capacity} beds
                              </div>
                            )}
                            <Badge 
                              variant={facility.status === 'Active' ? 'default' : 'secondary'}
                              className="mt-1"
                            >
                              {facility.status}
                            </Badge>
                          </div>
                        ))}
                        {data.rcfe.facilities.length === 0 && (
                          <p className="text-gray-500 text-sm col-span-full">No RCFE facilities in this county</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}