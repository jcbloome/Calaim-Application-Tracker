'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface GoogleMapsComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  staffData?: any;
  rcfeData?: any;
  showStaffLayer?: boolean;
  showRCFELayer?: boolean;
  filteredCounties?: string[];
  activeFilter?: string;
  onCountySelect?: (county: string) => void;
}

export default function GoogleMapsComponent({
  center = { lat: 36.7783, lng: -119.4179 }, // Center of California
  zoom = 6,
  staffData = {},
  rcfeData = {},
  showStaffLayer = true,
  showRCFELayer = false,
  filteredCounties = [],
  activeFilter = 'all',
  onCountySelect
}: GoogleMapsComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store map instance
  const [mapInstance, setMapInstance] = useState<any>(null);
  // Store current markers for cleanup
  const [currentMarkers, setCurrentMarkers] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    
    const loadGoogleMaps = async () => {
      try {
        // Check if API key is available
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
          if (mounted) setError('Google Maps API key not configured');
          return;
        }

        console.log('🗺️ Loading Google Maps with API key:', apiKey.substring(0, 10) + '...');

        // Check if Google Maps is already loaded
        if (typeof window !== 'undefined' && window.google && window.google.maps) {
          if (mounted) {
            setIsLoaded(true);
            initializeMap();
          }
          return;
        }

        // Check if script is already being loaded or if we're already loading
        if ((window as any).googleMapsLoading) {
          console.log('🔄 Google Maps already loading, waiting...');
          const checkInterval = setInterval(() => {
            if (window.google && window.google.maps) {
              clearInterval(checkInterval);
              if (mounted) {
                setIsLoaded(true);
                initializeMap();
              }
            }
          }, 100);
          return;
        }

        let existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        
        if (!existingScript) {
          // Set loading flag
          (window as any).googleMapsLoading = true;
          
          // Create and load the script
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
          script.async = true;
          script.defer = true;
          
          script.onload = () => {
            (window as any).googleMapsLoading = false;
            if (mounted && window.google && window.google.maps) {
              console.log('✅ Google Maps script loaded successfully');
              setIsLoaded(true);
              initializeMap();
            }
          };
          
          script.onerror = (event) => {
            (window as any).googleMapsLoading = false;
            console.error('❌ Google Maps script failed to load:', event);
            if (mounted) setError('Failed to load Google Maps API - Check API key restrictions');
          };
          
          document.head.appendChild(script);
          existingScript = script;
        }

        // Wait for existing script to load
        if (existingScript) {
          const checkGoogleMaps = () => {
            if (!mounted) return;
            
            if (window.google && window.google.maps) {
              setIsLoaded(true);
              initializeMap();
            } else {
              setTimeout(checkGoogleMaps, 100);
            }
          };
          checkGoogleMaps();
        }

      } catch (err: any) {
        if (mounted) setError(`Failed to load Google Maps: ${err.message}`);
      }
    };

    loadGoogleMaps();

    return () => {
      mounted = false;
    };
  }, []);

  // Update markers when filters or data change (with proper dependencies)
  useEffect(() => {
    if (isLoaded && window.google && mapInstance) {
      const hasData = Object.keys(staffData).length > 0 || Object.keys(rcfeData).length > 0;
      if (hasData) {
        console.log('🔄 Updating map markers');
        updateMapMarkers();
      }
    }
  }, [
    isLoaded, 
    mapInstance, 
    JSON.stringify(filteredCounties), 
    activeFilter, 
    showStaffLayer, 
    showRCFELayer,
    Object.keys(staffData).length,
    Object.keys(rcfeData).length
  ]);

  const updateMapMarkers = (map?: any) => {
    const targetMap = map || mapInstance;
    if (!targetMap || !window.google) {
      console.log('⚠️ Map or Google Maps not ready');
      return;
    }

    console.log('🗺️ Updating map markers...', {
      staffCounties: Object.keys(staffData).length,
      rcfeCounties: Object.keys(rcfeData).length,
      showStaffLayer,
      showRCFELayer,
      filteredCounties: filteredCounties.length
    });

    // Clear existing markers
    currentMarkers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    
    const newMarkers: any[] = [];

    try {
      // Add markers for staff locations
      if (showStaffLayer && Object.keys(staffData).length > 0) {
        const staffMarkers = addStaffMarkers(targetMap);
        if (staffMarkers && staffMarkers.length > 0) {
          newMarkers.push(...staffMarkers);
        }
      }

      // Add markers for RCFE locations
      if (showRCFELayer && Object.keys(rcfeData).length > 0) {
        const rcfeMarkers = addRCFEMarkers(targetMap);
        if (rcfeMarkers && rcfeMarkers.length > 0) {
          newMarkers.push(...rcfeMarkers);
        }
      }

      setCurrentMarkers(newMarkers);
      console.log(`✅ Successfully added ${newMarkers.length} markers to map`);
    } catch (error) {
      console.error('❌ Error updating map markers:', error);
    }
  };

  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps) {
      console.error('❌ Map container or Google Maps not ready');
      return;
    }

    try {
      console.log('🗺️ Initializing Google Maps...');
      
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom,
        mapTypeId: 'roadmap',
        gestureHandling: 'cooperative',
        zoomControl: true,
        mapTypeControl: true,
        scaleControl: true,
        streetViewControl: true,
        rotateControl: true,
        fullscreenControl: true
      });

      // Wait for map to be fully loaded
      map.addListener('tilesloaded', () => {
        console.log('✅ Google Maps tiles loaded successfully');
        setMapInstance(map);
        setIsLoaded(true);
        
        // Add initial markers if data is available
        setTimeout(() => {
          updateMapMarkers(map);
        }, 500);
      });

      // Handle map load errors
      map.addListener('error', (error: any) => {
        console.error('❌ Google Maps error:', error);
        setError('Failed to load map tiles');
      });

      console.log('🗺️ Google Maps instance created');
      
    } catch (err: any) {
      console.error('❌ Failed to initialize map:', err);
      setError(`Failed to initialize map: ${err.message}`);
    }
  };

  const addStaffMarkers = (map: any) => {
    const markers: any[] = [];
    
    Object.entries(staffData).forEach(([county, data]: [string, any]) => {
      // Skip if county is filtered out
      if (filteredCounties.length > 0 && !filteredCounties.includes(county)) return;
      
      // Get county coordinates
      const countyCoords = getCountyCoordinates(county);
      if (!countyCoords) {
        console.warn(`⚠️ No coordinates found for county: ${county}`);
        return;
      }

      console.log(`📍 Adding markers for ${county}:`, {
        socialWorkers: data.socialWorkers.length,
        rns: data.rns.length,
        coords: countyCoords,
        activeFilter,
        showStaffLayer
      });

      // Create marker for social workers
      if (data.socialWorkers.length > 0 && (activeFilter === 'all' || activeFilter === 'staff' || activeFilter === 'socialWorkers')) {
        const swMarker = new window.google.maps.Marker({
          position: { lat: countyCoords.lat + 0.05, lng: countyCoords.lng - 0.05 },
          map,
          title: `${county} County - ${data.socialWorkers.length} Social Workers`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 8
          },
          label: {
            text: 'SW',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold'
          }
        });

        console.log(`✅ Created SW marker for ${county} at`, swMarker.getPosition());

        const swInfoWindow = new window.google.maps.InfoWindow({
          content: `
            <div>
              <h3>${county} County</h3>
              <p><strong>Social Workers:</strong> ${data.socialWorkers.length}</p>
              <ul>
                ${data.socialWorkers.slice(0, 5).map((sw: any) => `<li>${sw.name}</li>`).join('')}
                ${data.socialWorkers.length > 5 ? `<li>...and ${data.socialWorkers.length - 5} more</li>` : ''}
              </ul>
            </div>
          `
        });

        swMarker.addListener('click', () => {
          swInfoWindow.open(map, swMarker);
          onCountySelect?.(county);
        });

        markers.push(swMarker);
      }

      // Create marker for RNs
      if (data.rns.length > 0 && (activeFilter === 'all' || activeFilter === 'staff' || activeFilter === 'rns')) {
        const rnMarker = new window.google.maps.Marker({
          position: { lat: countyCoords.lat - 0.05, lng: countyCoords.lng + 0.05 },
          map,
          title: `${county} County - ${data.rns.length} RNs`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 8
          },
          label: {
            text: 'RN',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold'
          }
        });

        console.log(`✅ Created RN marker for ${county} at`, rnMarker.getPosition());

        const rnInfoWindow = new window.google.maps.InfoWindow({
          content: `
            <div>
              <h3>${county} County</h3>
              <p><strong>Registered Nurses:</strong> ${data.rns.length}</p>
              <ul>
                ${data.rns.slice(0, 5).map((rn: any) => `<li>${rn.name}</li>`).join('')}
                ${data.rns.length > 5 ? `<li>...and ${data.rns.length - 5} more</li>` : ''}
              </ul>
            </div>
          `
        });

        rnMarker.addListener('click', () => {
          rnInfoWindow.open(map, rnMarker);
          onCountySelect?.(county);
        });

        markers.push(rnMarker);
      }
    });

    return markers;
  };

  const addRCFEMarkers = (map: any) => {
    const markers: any[] = [];
    
    Object.entries(rcfeData).forEach(([county, data]: [string, any]) => {
      // Skip if county is filtered out
      if (filteredCounties.length > 0 && !filteredCounties.includes(county)) return;
      
      const countyCoords = getCountyCoordinates(county);
      if (!countyCoords) {
        console.warn(`⚠️ No coordinates found for county: ${county}`);
        return;
      }

      console.log(`🏠 Adding RCFE marker for ${county}:`, {
        facilities: data.facilities.length,
        coords: countyCoords
      });

      const rcfeMarker = new window.google.maps.Marker({
        position: countyCoords,
        map,
        title: `${county} County - ${data.facilities.length} RCFEs`,
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          fillColor: '#8b5cf6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 6
        }
      });

      console.log(`✅ Created RCFE marker for ${county} at`, rcfeMarker.getPosition());

      const rcfeInfoWindow = new window.google.maps.InfoWindow({
        content: `
          <div>
            <h3>${county} County RCFEs</h3>
            <p><strong>Facilities:</strong> ${data.facilities.length}</p>
            <p><strong>Total Capacity:</strong> ${data.totalCapacity} beds</p>
            <p><strong>Active:</strong> ${data.activeCount}</p>
            <ul>
              ${data.facilities.slice(0, 3).map((facility: any) => `
                <li>${facility.name} (${facility.capacity || 0} beds)</li>
              `).join('')}
              ${data.facilities.length > 3 ? `<li>...and ${data.facilities.length - 3} more</li>` : ''}
            </ul>
          </div>
        `
      });

      rcfeMarker.addListener('click', () => {
        rcfeInfoWindow.open(map, rcfeMarker);
        onCountySelect?.(county);
      });

      markers.push(rcfeMarker);
    });

    return markers;
  };

  // Helper function to get county coordinates
  const getCountyCoordinates = (countyName: string) => {
    const countyCoords: Record<string, { lat: number; lng: number }> = {
      'Alameda': { lat: 37.6017, lng: -121.7195 },
      'Alpine': { lat: 38.7596, lng: -119.8138 },
      'Amador': { lat: 38.4580, lng: -120.6532 },
      'Butte': { lat: 39.6395, lng: -121.6168 },
      'Calaveras': { lat: 38.2096, lng: -120.5687 },
      'Colusa': { lat: 39.2149, lng: -122.2094 },
      'Contra Costa': { lat: 37.9161, lng: -121.9364 },
      'Del Norte': { lat: 41.7056, lng: -124.1287 },
      'El Dorado': { lat: 38.7265, lng: -120.5624 },
      'Fresno': { lat: 36.7378, lng: -119.7871 },
      'Glenn': { lat: 39.5918, lng: -122.3894 },
      'Humboldt': { lat: 40.7450, lng: -123.8695 },
      'Imperial': { lat: 32.8394, lng: -115.3617 },
      'Inyo': { lat: 36.8008, lng: -118.2273 },
      'Kern': { lat: 35.3738, lng: -118.9597 },
      'Kings': { lat: 36.1015, lng: -119.9624 },
      'Lake': { lat: 39.0840, lng: -122.8084 },
      'Lassen': { lat: 40.4780, lng: -120.5542 },
      'Los Angeles': { lat: 34.0522, lng: -118.2437 },
      'Madera': { lat: 37.0611, lng: -119.8897 },
      'Marin': { lat: 38.0834, lng: -122.7633 },
      'Mariposa': { lat: 37.4849, lng: -119.9663 },
      'Mendocino': { lat: 39.3080, lng: -123.4384 },
      'Merced': { lat: 37.3022, lng: -120.4829 },
      'Modoc': { lat: 41.5949, lng: -120.1696 },
      'Mono': { lat: 37.8585, lng: -118.9648 },
      'Monterey': { lat: 36.2677, lng: -121.4018 },
      'Napa': { lat: 38.5025, lng: -122.2654 },
      'Nevada': { lat: 39.2362, lng: -121.0159 },
      'Orange': { lat: 33.7175, lng: -117.8311 },
      'Placer': { lat: 39.0916, lng: -120.8039 },
      'Plumas': { lat: 39.9266, lng: -120.8347 },
      'Riverside': { lat: 33.7537, lng: -116.3755 },
      'Sacramento': { lat: 38.4747, lng: -121.3542 },
      'San Benito': { lat: 36.5761, lng: -120.9876 },
      'San Bernardino': { lat: 34.8394, lng: -116.2394 },
      'San Diego': { lat: 32.7157, lng: -117.1611 },
      'San Francisco': { lat: 37.7749, lng: -122.4194 },
      'San Joaquin': { lat: 37.9357, lng: -121.2907 },
      'San Luis Obispo': { lat: 35.2828, lng: -120.6596 },
      'San Mateo': { lat: 37.5630, lng: -122.3255 },
      'Santa Barbara': { lat: 34.4208, lng: -119.6982 },
      'Santa Clara': { lat: 37.3541, lng: -121.9552 },
      'Santa Cruz': { lat: 37.0513, lng: -121.9858 },
      'Shasta': { lat: 40.7751, lng: -122.2047 },
      'Sierra': { lat: 39.5777, lng: -120.5135 },
      'Siskiyou': { lat: 41.8057, lng: -122.7108 },
      'Solano': { lat: 38.3105, lng: -121.8308 },
      'Sonoma': { lat: 38.5816, lng: -122.8678 },
      'Stanislaus': { lat: 37.5091, lng: -120.9876 },
      'Sutter': { lat: 39.0282, lng: -121.6169 },
      'Tehama': { lat: 40.0274, lng: -122.1958 },
      'Trinity': { lat: 40.6221, lng: -123.1351 },
      'Tulare': { lat: 36.2077, lng: -118.8597 },
      'Tuolumne': { lat: 37.9502, lng: -120.2624 },
      'Ventura': { lat: 34.3705, lng: -119.1391 },
      'Yolo': { lat: 38.7646, lng: -121.9018 },
      'Yuba': { lat: 39.2735, lng: -121.4944 }
    };

    return countyCoords[countyName];
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <div className="text-red-600 mb-2">⚠️ Map Error</div>
          <p className="text-sm text-gray-600">{error}</p>
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-left">
            <p className="text-xs font-medium text-yellow-800 mb-2">Troubleshooting Steps:</p>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• Check API key restrictions in Google Cloud Console</li>
              <li>• Enable Maps JavaScript API and Geocoding API</li>
              <li>• Add localhost:3000/* to allowed referrers</li>
              <li>• Wait 5-10 minutes after making changes</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading Google Maps...</p>
          <p className="text-xs text-gray-500 mt-1">
            API Key: {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? '✅ Configured' : '❌ Missing'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      {/* Fallback message if map doesn't load */}
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg" 
           style={{ zIndex: mapInstance ? -1 : 1 }}>
        <div className="text-center">
          <div className="text-gray-400 mb-2">🗺️</div>
          <p className="text-sm text-gray-600">Map Loading...</p>
          <p className="text-xs text-gray-500">If this persists, check API key restrictions</p>
        </div>
      </div>
    </div>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    google: any;
  }
}