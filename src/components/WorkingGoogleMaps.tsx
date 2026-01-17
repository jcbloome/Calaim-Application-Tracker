'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface WorkingGoogleMapsProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  onCountySelect?: (county: string) => void;
}

export default function WorkingGoogleMaps({
  center = { lat: 36.7783, lng: -119.4179 },
  zoom = 6,
  onCountySelect
}: WorkingGoogleMapsProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Initializing...');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      setStatus('❌ No API key found');
      return;
    }

    setStatus('🔑 API key found, loading Google Maps...');

    // Check if Google Maps is already loaded
    if (window.google && window.google.maps) {
      setStatus('📡 Google Maps API already loaded');
      initializeMap();
      return;
    }

    // Create unique callback name to avoid conflicts
    const callbackName = `initCalAIMMap_${Date.now()}`;
    
    // Simple script loading with callback (same as working test page)
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${callbackName}`;
    script.async = true;

    (window as any)[callbackName] = () => {
      setStatus('📡 Google Maps API loaded via callback');
      // Wait a bit for DOM to be ready (same as test page)
      setTimeout(() => {
        initializeMap();
      }, 100);
    };

    script.onerror = () => {
      setStatus('❌ Failed to load Google Maps script');
    };

    document.head.appendChild(script);

    return () => {
      delete (window as any)[callbackName];
    };
  }, []);

  const initializeMap = () => {
    if (!mapRef.current) {
      setStatus('❌ Map container not found');
      return;
    }

    if (!window.google || !window.google.maps) {
      setStatus('❌ Google Maps API not ready');
      return;
    }

    try {
      setStatus('🗺️ Creating map instance...');
      
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom,
        mapTypeId: 'roadmap'
      });

      // Add CalAIM county markers
      addCalAIMMarkers(map);
      
      setStatus('✅ Google Maps loaded successfully!');
      setIsLoaded(true);
      
    } catch (error: any) {
      setStatus('❌ Error creating map: ' + error.message);
    }
  };

  const addCalAIMMarkers = (map: any) => {
    // Add markers for major California counties with CalAIM presence
    const counties = [
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, staff: 14, rcfes: 45 },
      { name: 'Sacramento', lat: 38.4747, lng: -121.3542, staff: 5, rcfes: 12 },
      { name: 'San Diego', lat: 32.7157, lng: -117.1611, staff: 1, rcfes: 8 },
      { name: 'Orange', lat: 33.7175, lng: -117.8311, staff: 2, rcfes: 15 },
      { name: 'Riverside', lat: 33.7537, lng: -116.3755, staff: 3, rcfes: 7 },
      { name: 'San Bernardino', lat: 34.8394, lng: -116.2394, staff: 1, rcfes: 5 },
      { name: 'Fresno', lat: 36.7378, lng: -119.7871, staff: 1, rcfes: 3 },
      { name: 'Contra Costa', lat: 37.9161, lng: -121.9364, staff: 1, rcfes: 4 }
    ];

    counties.forEach(county => {
      // Staff marker (green circle)
      const staffMarker = new window.google.maps.Marker({
        position: { lat: county.lat + 0.05, lng: county.lng - 0.05 },
        map: map,
        title: `${county.name} County - ${county.staff} Staff Members`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8
        }
      });

      // RCFE marker (purple house)
      const rcfeMarker = new window.google.maps.Marker({
        position: { lat: county.lat - 0.05, lng: county.lng + 0.05 },
        map: map,
        title: `${county.name} County - ${county.rcfes} RCFE Facilities`,
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
      const staffInfoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-family: system-ui;">
            <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">${county.name} County</h3>
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <div style="width: 12px; height: 12px; background: #10b981; border-radius: 50%; margin-right: 8px;"></div>
              <span style="color: #4b5563; font-size: 14px;"><strong>Staff Members:</strong> ${county.staff}</span>
            </div>
            <p style="margin: 0; color: #6b7280; font-size: 12px;">Social Workers & Registered Nurses</p>
          </div>
        `
      });

      const rcfeInfoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-family: system-ui;">
            <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">${county.name} County</h3>
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 8px solid #8b5cf6; margin-right: 8px;"></div>
              <span style="color: #4b5563; font-size: 14px;"><strong>RCFE Facilities:</strong> ${county.rcfes}</span>
            </div>
            <p style="margin: 0; color: #6b7280; font-size: 12px;">Residential Care Facilities for the Elderly</p>
          </div>
        `
      });

      // Click handlers
      staffMarker.addListener('click', () => {
        staffInfoWindow.open(map, staffMarker);
        onCountySelect?.(county.name);
      });

      rcfeMarker.addListener('click', () => {
        rcfeInfoWindow.open(map, rcfeMarker);
        onCountySelect?.(county.name);
      });
    });

    console.log('✅ Added CalAIM markers for 8 counties');
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-gray-700 mb-2">Loading California Resource Map</p>
          <p className="text-xs text-gray-600">{status}</p>
          <div className="mt-4 text-xs text-gray-500">
            <p>API Key: {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? '✅ Configured' : '❌ Missing'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      
      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg z-10 border">
        <h4 className="font-semibold text-sm mb-2 text-gray-800">CalAIM Resources</h4>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-700">Social Workers & RNs</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-purple-500" />
            <span className="text-gray-700 ml-1">RCFE Facilities</span>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute top-4 right-4 bg-white px-3 py-1 rounded shadow text-xs text-green-600 font-medium z-10">
        ✅ Map Active
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