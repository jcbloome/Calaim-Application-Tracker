'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/google-maps-loader';

export default function TestGoogleMapsPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    const initMap = async () => {
      try {
        setStatus('🔑 Loading Google Maps API...');
        await loadGoogleMaps();
        
        setStatus('📡 Google Maps API loaded');
        
        setTimeout(() => {
          if (!mapRef.current) {
            setStatus('❌ Map container not found');
            return;
          }

          try {
            const map = new window.google.maps.Map(mapRef.current, {
              center: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
              zoom: 10
            });

            // Add a simple marker
            new window.google.maps.Marker({
              position: { lat: 34.0522, lng: -118.2437 },
              map: map,
              title: 'Test Marker - Los Angeles'
            });

            setStatus('✅ Google Maps loaded successfully!');
          } catch (error: any) {
            setStatus('❌ Error creating map: ' + error.message);
          }
        }, 100);
        
      } catch (error: any) {
        setStatus('❌ Failed to load: ' + error.message);
      }
    };

    initMap();
  }, []);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Google Maps Test</h1>
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <strong>Status:</strong> {status}
      </div>

      <div 
        ref={mapRef} 
        className="w-full h-96 border rounded-lg bg-gray-200"
        style={{ minHeight: '400px' }}
      />

      <div className="mt-4 text-sm text-gray-600">
        <p><strong>API Key:</strong> {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? '✅ Configured' : '❌ Missing'}</p>
        <p><strong>Expected:</strong> Map should load with a marker in Los Angeles</p>
      </div>
    </div>
  );
}