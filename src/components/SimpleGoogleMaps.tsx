'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface SimpleGoogleMapsProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  staffData?: any;
  rcfeData?: any;
  showStaffLayer?: boolean;
  showRCFELayer?: boolean;
  onCountySelect?: (county: string) => void;
}

export default function SimpleGoogleMaps({
  center = { lat: 36.7783, lng: -119.4179 },
  zoom = 6,
  staffData = {},
  rcfeData = {},
  showStaffLayer = true,
  showRCFELayer = false,
  onCountySelect
}: SimpleGoogleMapsProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<any>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  useEffect(() => {
    let mounted = true;
    
    const loadGoogleMaps = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        if (mounted) setError('Google Maps API key not configured');
        return;
      }

      // Check if Google Maps is already loaded
      if (window.google && window.google.maps) {
        if (mounted) {
          console.log('🗺️ Google Maps already loaded');
          setTimeout(() => {
            if (mounted) initializeMap();
          }, 100);
        }
        return;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        console.log('🔄 Google Maps script already loading...');
        // Wait for it to load
        const checkLoaded = setInterval(() => {
          if (window.google && window.google.maps) {
            clearInterval(checkLoaded);
            if (mounted) {
              console.log('✅ Google Maps loaded (existing script)');
              initializeMap();
            }
          }
        }, 100);
        return;
      }

      // Load Google Maps script with unique callback
      const callbackName = `initMap_${Date.now()}`;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${callbackName}`;
      script.async = true;
      script.defer = true;

      // Create unique global callback
      (window as any)[callbackName] = () => {
        console.log('✅ Google Maps loaded via callback');
        if (mounted) {
          initializeMap();
        }
        // Cleanup callback
        delete (window as any)[callbackName];
      };

      script.onerror = () => {
        if (mounted) {
          setError('Failed to load Google Maps - Check API key and restrictions');
        }
        delete (window as any)[callbackName];
      };

      document.head.appendChild(script);
    };

    loadGoogleMaps();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array to prevent re-runs

  const initializeMap = () => {
    // Check if everything is ready
    if (!mapRef.current) {
      retryCountRef.current += 1;
      if (retryCountRef.current <= maxRetries) {
        console.log(`⏳ Map container not ready, retry ${retryCountRef.current}/${maxRetries}`);
        setTimeout(() => initializeMap(), 200 * retryCountRef.current); // Exponential backoff
        return;
      } else {
        console.error('❌ Map container failed to initialize after max retries');
        setError('Map container failed to initialize');
        return;
      }
    }

    if (!window.google || !window.google.maps) {
      console.error('❌ Google Maps API not ready');
      setError('Google Maps API not loaded');
      return;
    }

    // Reset retry count on successful container check
    retryCountRef.current = 0;

    try {
      console.log('🗺️ Initializing Google Maps...');
      console.log('📍 Map container:', mapRef.current);
      console.log('🌍 Google Maps API:', !!window.google.maps);
      
      const mapInstance = new window.google.maps.Map(mapRef.current, {
        center,
        zoom,
        mapTypeId: 'roadmap',
        gestureHandling: 'cooperative',
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });

      // Wait for map to be ready
      mapInstance.addListener('tilesloaded', () => {
        console.log('🎯 Map tiles loaded');
        setMap(mapInstance);
        setIsLoaded(true);
        
        // Add test markers after map is fully loaded
        setTimeout(() => {
          addTestMarkers(mapInstance);
        }, 500);
      });
      
      console.log('✅ Google Maps instance created');
      
    } catch (err: any) {
      console.error('❌ Failed to initialize map:', err);
      setError(`Failed to initialize map: ${err.message}`);
    }
  };

  const addTestMarkers = (mapInstance: any) => {
    // Add markers for major California counties with CalAIM presence
    const counties = [
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, color: '#10b981', staff: 14, rcfes: 45 },
      { name: 'Sacramento', lat: 38.4747, lng: -121.3542, color: '#3b82f6', staff: 5, rcfes: 12 },
      { name: 'San Diego', lat: 32.7157, lng: -117.1611, color: '#ef4444', staff: 1, rcfes: 8 },
      { name: 'Orange', lat: 33.7175, lng: -117.8311, color: '#f59e0b', staff: 2, rcfes: 15 },
      { name: 'Riverside', lat: 33.7537, lng: -116.3755, color: '#8b5cf6', staff: 3, rcfes: 7 }
    ];

    counties.forEach(county => {
      // Staff marker (slightly offset)
      const staffMarker = new window.google.maps.Marker({
        position: { lat: county.lat + 0.05, lng: county.lng - 0.05 },
        map: mapInstance,
        title: `${county.name} County - ${county.staff} Staff Members`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: county.color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8
        }
      });

      // RCFE marker (slightly offset)
      const rcfeMarker = new window.google.maps.Marker({
        position: { lat: county.lat - 0.05, lng: county.lng + 0.05 },
        map: mapInstance,
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
          <div style="padding: 8px;">
            <h3 style="margin: 0 0 8px 0; color: #1f2937;">${county.name} County</h3>
            <p style="margin: 0; color: #4b5563;"><strong>Staff Members:</strong> ${county.staff}</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Social Workers & RNs</p>
          </div>
        `
      });

      const rcfeInfoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <h3 style="margin: 0 0 8px 0; color: #1f2937;">${county.name} County</h3>
            <p style="margin: 0; color: #4b5563;"><strong>RCFE Facilities:</strong> ${county.rcfes}</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Residential Care Facilities</p>
          </div>
        `
      });

      // Click handlers
      staffMarker.addListener('click', () => {
        staffInfoWindow.open(mapInstance, staffMarker);
        onCountySelect?.(county.name);
      });

      rcfeMarker.addListener('click', () => {
        rcfeInfoWindow.open(mapInstance, rcfeMarker);
        onCountySelect?.(county.name);
      });
    });

    console.log('✅ Added markers for 5 major CalAIM counties');
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <div className="text-red-600 mb-2">⚠️ Map Error</div>
          <p className="text-sm text-gray-600">{error}</p>
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-left">
            <p className="text-xs font-medium text-yellow-800 mb-2">Quick Fix:</p>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• Go to Google Cloud Console</li>
              <li>• Find your API key: AIzaSyCjXa...ip_0</li>
              <li>• Remove all restrictions temporarily</li>
              <li>• Or add localhost:3000/* to HTTP referrers</li>
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

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}