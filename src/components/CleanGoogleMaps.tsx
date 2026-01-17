'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadGoogleMaps } from '@/lib/google-maps-loader';

interface CleanGoogleMapsProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  onCountySelect?: (county: string) => void;
}

export default function CleanGoogleMaps({
  center = { lat: 36.7783, lng: -119.4179 },
  zoom = 6,
  onCountySelect
}: CleanGoogleMapsProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Initializing Google Maps...');
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    let mounted = true;

    const initializeMap = async () => {
      try {
        setStatus('🔑 Loading Google Maps API...');
        
        // Use global loader to prevent multiple script loads
        await loadGoogleMaps();
        
        if (!mounted) return;

        setStatus('🗺️ Creating map instance...');

        // Wait for DOM to be ready with multiple checks
        const initMapWithRetry = (attempts = 0) => {
          if (!mounted) {
            console.log('🚫 Component unmounted, stopping map init');
            return;
          }
          
          console.log(`🔍 Map container check attempt ${attempts + 1}/10`, {
            mapRefCurrent: !!mapRef.current,
            mapRefElement: mapRef.current,
            isMounted,
            mounted
          });
          
          if (!mapRef.current) {
            if (attempts < 10) {
              setTimeout(() => initMapWithRetry(attempts + 1), 200);
              return;
            } else {
              console.error('❌ Map container still not found after 10 attempts');
              setError(`Map container not found after ${attempts + 1} attempts. Check if component is properly rendered.`);
              return;
            }
          }

          try {
            setStatus('🗺️ Creating map instance...');
            
            const map = new window.google.maps.Map(mapRef.current, {
              center,
              zoom,
              mapTypeId: 'roadmap',
              gestureHandling: 'cooperative'
            });

            // Add CalAIM markers
            addCalAIMMarkers(map);
            
            setStatus('✅ Map loaded successfully!');
            setIsLoaded(true);
            
          } catch (err: any) {
            setError('Failed to create map: ' + err.message);
          }
        };

        // Start with immediate attempt, then retry if needed
        initMapWithRetry();

      } catch (err: any) {
        if (mounted) {
          setError(err.message);
        }
      }
    };

    initializeMap();

    return () => {
      mounted = false;
    };
  }, [center, zoom, isMounted]);

  const addCalAIMMarkers = (map: any) => {
    const counties = [
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, staff: 14, rcfes: 45 },
      { name: 'Sacramento', lat: 38.4747, lng: -121.3542, staff: 5, rcfes: 12 },
      { name: 'San Diego', lat: 32.7157, lng: -117.1611, staff: 1, rcfes: 8 },
      { name: 'Orange', lat: 33.7175, lng: -117.8311, staff: 2, rcfes: 15 },
      { name: 'Riverside', lat: 33.7537, lng: -116.3755, staff: 3, rcfes: 7 }
    ];

    counties.forEach(county => {
      // Staff marker
      const staffMarker = new window.google.maps.Marker({
        position: { lat: county.lat + 0.05, lng: county.lng - 0.05 },
        map: map,
        title: `${county.name} - ${county.staff} Staff`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8
        }
      });

      // RCFE marker
      const rcfeMarker = new window.google.maps.Marker({
        position: { lat: county.lat - 0.05, lng: county.lng + 0.05 },
        map: map,
        title: `${county.name} - ${county.rcfes} RCFEs`,
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          fillColor: '#8b5cf6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 6
        }
      });

      // Info windows
      const staffInfo = new window.google.maps.InfoWindow({
        content: `<div style="padding:8px;"><h3>${county.name} County</h3><p>Staff: ${county.staff}</p></div>`
      });

      const rcfeInfo = new window.google.maps.InfoWindow({
        content: `<div style="padding:8px;"><h3>${county.name} County</h3><p>RCFEs: ${county.rcfes}</p></div>`
      });

      staffMarker.addListener('click', () => {
        staffInfo.open(map, staffMarker);
        onCountySelect?.(county.name);
      });

      rcfeMarker.addListener('click', () => {
        rcfeInfo.open(map, rcfeMarker);
        onCountySelect?.(county.name);
      });
    });

    console.log('✅ Added CalAIM markers');
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <div className="text-red-600 mb-2">⚠️ Map Error</div>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-gray-700 mb-2">California Resource Map</p>
          <p className="text-xs text-gray-600">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div 
        ref={mapRef} 
        className="w-full h-full rounded-lg"
        style={{ minHeight: '400px' }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg z-10 border">
        <h4 className="font-semibold text-sm mb-2">CalAIM Resources</h4>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Staff (SW & RN)</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-purple-500" />
            <span className="ml-1">RCFE Facilities</span>
          </div>
        </div>
      </div>
    </div>
  );
}