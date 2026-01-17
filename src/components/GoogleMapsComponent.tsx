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
  onCountySelect?: (county: string) => void;
}

export default function GoogleMapsComponent({
  center = { lat: 36.7783, lng: -119.4179 }, // Center of California
  zoom = 6,
  staffData = {},
  rcfeData = {},
  showStaffLayer = true,
  showRCFELayer = false,
  onCountySelect
}: GoogleMapsComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const loadGoogleMaps = async () => {
      try {
        // Check if API key is available
        if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
          if (mounted) setError('Google Maps API key not configured');
          return;
        }

        // Check if Google Maps is already loaded
        if (typeof window !== 'undefined' && window.google && window.google.maps) {
          if (mounted) {
            setIsLoaded(true);
            initializeMap();
          }
          return;
        }

        // Check if script is already being loaded
        let existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        
        if (!existingScript) {
          // Create and load the script
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
          script.async = true;
          script.defer = true;
          
          script.onload = () => {
            if (mounted && window.google && window.google.maps) {
              setIsLoaded(true);
              initializeMap();
            }
          };
          
          script.onerror = () => {
            if (mounted) setError('Failed to load Google Maps API');
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

  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    try {
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom,
        mapTypeId: 'roadmap',
        styles: [
          {
            featureType: 'administrative.country',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#4285f4' }, { weight: 2 }]
          },
          {
            featureType: 'administrative.province',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#4285f4' }, { weight: 1 }]
          }
        ]
      });

      // Add markers for staff locations
      if (showStaffLayer) {
        addStaffMarkers(map);
      }

      // Add markers for RCFE locations
      if (showRCFELayer) {
        addRCFEMarkers(map);
      }

      setIsLoaded(true);
    } catch (err: any) {
      setError(`Failed to initialize map: ${err.message}`);
    }
  };

  const addStaffMarkers = (map: any) => {
    Object.entries(staffData).forEach(([county, data]: [string, any]) => {
      // Get county coordinates (you'd need to implement this)
      const countyCoords = getCountyCoordinates(county);
      if (!countyCoords) return;

      // Create marker for social workers
      if (data.socialWorkers.length > 0) {
        const swMarker = new window.google.maps.Marker({
          position: { lat: countyCoords.lat + 0.1, lng: countyCoords.lng },
          map,
          title: `${county} County - ${data.socialWorkers.length} Social Workers`,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#10b981" stroke="white" stroke-width="2"/>
                <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">SW</text>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(24, 24)
          }
        });

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
      }

      // Create marker for RNs
      if (data.rns.length > 0) {
        const rnMarker = new window.google.maps.Marker({
          position: { lat: countyCoords.lat - 0.1, lng: countyCoords.lng },
          map,
          title: `${county} County - ${data.rns.length} RNs`,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#ef4444" stroke="white" stroke-width="2"/>
                <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">RN</text>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(24, 24)
          }
        });

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
      }
    });
  };

  const addRCFEMarkers = (map: any) => {
    Object.entries(rcfeData).forEach(([county, data]: [string, any]) => {
      const countyCoords = getCountyCoordinates(county);
      if (!countyCoords) return;

      const rcfeMarker = new window.google.maps.Marker({
        position: countyCoords,
        map,
        title: `${county} County - ${data.facilities.length} RCFEs`,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#8b5cf6" stroke="white" stroke-width="2"/>
              <text x="12" y="16" text-anchor="middle" fill="white" font-size="8" font-weight="bold">RCFE</text>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(24, 24)
        }
      });

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
    });
  };

  // Helper function to get county coordinates
  const getCountyCoordinates = (countyName: string) => {
    const countyCoords: Record<string, { lat: number; lng: number }> = {
      'Los Angeles': { lat: 34.0522, lng: -118.2437 },
      'Orange': { lat: 33.7175, lng: -117.8311 },
      'San Diego': { lat: 32.7157, lng: -117.1611 },
      'Riverside': { lat: 33.7537, lng: -116.3755 },
      'San Bernardino': { lat: 34.8394, lng: -116.2394 },
      'Santa Clara': { lat: 37.3541, lng: -121.9552 },
      'Alameda': { lat: 37.6017, lng: -121.7195 },
      'Sacramento': { lat: 38.4747, lng: -121.3542 },
      'Contra Costa': { lat: 37.9161, lng: -121.9364 },
      'Fresno': { lat: 36.7378, lng: -119.7871 },
      // Add more counties as needed
    };

    return countyCoords[countyName];
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <div className="text-red-600 mb-2">⚠️ Map Error</div>
          <p className="text-sm text-gray-600">{error}</p>
          <p className="text-xs text-gray-500 mt-2">
            Please configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment variables
          </p>
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
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    google: any;
  }
}