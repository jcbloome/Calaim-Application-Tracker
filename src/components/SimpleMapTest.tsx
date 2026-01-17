'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Minus, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { loadGoogleMaps } from '@/lib/google-maps-loader';

// Helper function to get county coordinates
const getCountyCoordinates = (county: string) => {
  const countyCoords: Record<string, { lat: number; lng: number }> = {
    'Los Angeles': { lat: 34.0522, lng: -118.2437 },
    'Sacramento': { lat: 38.4747, lng: -121.3542 },
    'San Diego': { lat: 32.7157, lng: -117.1611 },
    'Orange': { lat: 33.7175, lng: -117.8311 },
    'Riverside': { lat: 33.7537, lng: -116.3755 },
    'San Bernardino': { lat: 34.1083, lng: -117.2898 },
    'Santa Clara': { lat: 37.3541, lng: -121.9552 },
    'Alameda': { lat: 37.6017, lng: -121.7195 },
    'Fresno': { lat: 36.7378, lng: -119.7871 },
    'Kern': { lat: 35.3733, lng: -119.0187 },
    'Ventura': { lat: 34.3705, lng: -119.2290 },
    'Santa Barbara': { lat: 34.4208, lng: -119.6982 },
    'Contra Costa': { lat: 37.9161, lng: -121.9594 },
    'Solano': { lat: 38.2494, lng: -121.9018 },
    'Sonoma': { lat: 38.5816, lng: -122.8678 },
    'Marin': { lat: 38.0834, lng: -122.7633 }
  };
  
  return countyCoords[county] || { lat: 36.7783, lng: -119.4179 }; // Default to CA center
};

interface SimpleMapTestProps {
  shouldLoadMap?: boolean;
  resourceCounts?: {
    socialWorkers?: number;
    registeredNurses?: number;
    rcfeFacilities?: number;
    authorizedMembers?: number;
  };
}

export default function SimpleMapTest({ shouldLoadMap = true, resourceCounts }: SimpleMapTestProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  
  // Layer visibility states
  const [showSocialWorkers, setShowSocialWorkers] = useState(true);
  const [showRNs, setShowRNs] = useState(true);
  const [showRCFEs, setShowRCFEs] = useState(true);
  const [showMembers, setShowMembers] = useState(true);

  useEffect(() => {
    if (!shouldLoadMap) {
      console.log('🚫 Map loading disabled - waiting for reload button');
      return;
    }

    console.log('🚀 SimpleMapTest component mounted - loading map');
    
    // Check if ref is available immediately
    console.log('📍 Initial mapRef check:', {
      current: mapRef.current,
      hasRef: !!mapRef.current
    });

    // Wait for next tick to check DOM
    setTimeout(() => {
      console.log('📍 After timeout mapRef check:', {
        current: mapRef.current,
        hasRef: !!mapRef.current,
        clientHeight: mapRef.current?.clientHeight,
        clientWidth: mapRef.current?.clientWidth
      });

      if (mapRef.current) {
        
        // Use global loader to prevent multiple API loads
        const initMap = async () => {
          try {
            await loadGoogleMaps();
            
            console.log('📡 Google Maps loaded via global loader');
            
            if (!mapRef.current) {
              setError('Map container lost during loading');
              return;
            }

            const map = new window.google.maps.Map(mapRef.current, {
              center: { lat: 36.7783, lng: -119.4179 }, // California center
              zoom: 6,
              zoomControl: false, // Disable default zoom controls since we're adding custom ones
              mapTypeControl: true,
              streetViewControl: true,
              fullscreenControl: true
            });

            // Store map instance for zoom controls
            setMapInstance(map);

            // Add CalAIM overlays
            addCalAIMOverlays(map);
            
            
          } catch (err: any) {
            setError('Map creation failed: ' + err.message);
          }
        };

        initMap();

      } else {
        setError('Map container not found in DOM');
      }
    }, 100);

  }, [shouldLoadMap]);

  // Zoom control functions
  const handleZoomIn = () => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom();
      mapInstance.setZoom(currentZoom + 1);
    }
  };

  const handleZoomOut = () => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom();
      mapInstance.setZoom(currentZoom - 1);
    }
  };

  const handleResetZoom = () => {
    if (mapInstance) {
      mapInstance.setZoom(6); // Reset to California view
      mapInstance.setCenter({ lat: 36.7783, lng: -119.4179 });
    }
  };

  // Layer control functions
  const toggleLayer = (layerType: string, isVisible: boolean) => {
    markers.forEach(marker => {
      if ((marker as any).markerType === layerType) {
        marker.setVisible(isVisible);
      }
    });
  };

  // Effect to handle layer visibility changes
  React.useEffect(() => {
    toggleLayer('SW', showSocialWorkers);
  }, [showSocialWorkers, markers]);

  React.useEffect(() => {
    toggleLayer('RN', showRNs);
  }, [showRNs, markers]);

  React.useEffect(() => {
    toggleLayer('RCFE', showRCFEs);
  }, [showRCFEs, markers]);

  React.useEffect(() => {
    toggleLayer('MEMBERS', showMembers);
  }, [showMembers, markers]);

  const addCalAIMOverlays = async (map: any) => {
    console.log('🎯 Adding CalAIM overlays...');

    try {
      // Fetch real RCFE, staff, and member data from APIs
      const [staffResponse, rcfeResponse, memberResponse] = await Promise.all([
        fetch('/api/staff-locations'),
        fetch('/api/rcfe-locations'),
        fetch('/api/member-locations')
      ]);

      const staffResult = await staffResponse.json();
      const rcfeResult = await rcfeResponse.json();
      const memberResult = await memberResponse.json();

      console.log('📊 Staff API result:', staffResult);
      console.log('🏠 RCFE API result:', rcfeResult);
      console.log('👥 Member API result:', memberResult);
      
      // Debug member-RCFE matching
      if (memberResult.success && memberResult.data?.membersByRCFE) {
        console.log('🔗 Member-RCFE matching data:');
        console.log('  Total RCFEs with members:', Object.keys(memberResult.data.membersByRCFE).length);
        Object.entries(memberResult.data.membersByRCFE).forEach(([rcfeId, data]: [string, any]) => {
          console.log(`  RCFE ID "${rcfeId}": ${data.rcfeName} (${data.totalMembers} members)`);
        });
      }

      let calAIMData: any[] = [];

      // Add staff data (Social Workers and RNs)
      if (staffResult.success && staffResult.data?.staffByCounty) {
        Object.entries(staffResult.data.staffByCounty).forEach(([county, data]: [string, any]) => {
          // Add Social Workers
          data.socialWorkers?.forEach((sw: any, index: number) => {
            calAIMData.push({
              type: 'SW',
              name: sw.name || `${sw.firstName || ''} ${sw.lastName || ''}`.trim() || 'Social Worker',
              lat: getCountyCoordinates(county).lat + (Math.random() - 0.5) * 0.1,
              lng: getCountyCoordinates(county).lng + (Math.random() - 0.5) * 0.1,
              county: county,
              email: sw.email,
              phone: sw.phone
            });
          });

          // Add Registered Nurses
          data.rns?.forEach((rn: any, index: number) => {
            calAIMData.push({
              type: 'RN',
              name: rn.name || `${rn.firstName || ''} ${rn.lastName || ''}`.trim() || 'Registered Nurse',
              lat: getCountyCoordinates(county).lat + (Math.random() - 0.5) * 0.1,
              lng: getCountyCoordinates(county).lng + (Math.random() - 0.5) * 0.1,
              county: county,
              email: rn.email,
              phone: rn.phone
            });
          });
        });
      }

      // Add RCFE data with member counts using Registered ID matching
      if (rcfeResult.success && rcfeResult.data?.rcfesByCounty) {
        Object.entries(rcfeResult.data.rcfesByCounty).forEach(([county, data]: [string, any]) => {
          data.facilities?.forEach((rcfe: any) => {
            // Find members at this RCFE using the registered ID
            const rcfeRegisteredId = rcfe.registeredId || rcfe.id || rcfe.licenseNumber;
            const membersAtRCFE = memberResult.success && memberResult.data?.membersByRCFE?.[rcfeRegisteredId];
            const memberCount = membersAtRCFE?.totalMembers || 0;
            const membersList = membersAtRCFE?.members || [];

            console.log(`🏠 RCFE: ${rcfe.name} (ID: ${rcfeRegisteredId}) - ${memberCount} members`);
            if (memberCount > 0) {
              console.log(`  ✅ Found ${memberCount} members at ${rcfe.name}`);
            } else {
              console.log(`  ⚠️ No members found for RCFE ID: ${rcfeRegisteredId}`);
            }

            calAIMData.push({
              type: 'RCFE',
              name: rcfe.name,
              lat: getCountyCoordinates(county).lat + (Math.random() - 0.5) * 0.1,
              lng: getCountyCoordinates(county).lng + (Math.random() - 0.5) * 0.1,
              county: county,
              address: rcfe.address,
              phone: rcfe.phone,
              beds: rcfe.capacity || rcfe.licensedBeds || 0,
              status: rcfe.status,
              licenseNumber: rcfe.licenseNumber,
              registeredId: rcfeRegisteredId,
              memberCount: memberCount,
              membersList: membersList
            });
          });
        });
      }

      // Add CalAIM Member data
      if (memberResult.success && memberResult.data?.membersByCounty) {
        Object.entries(memberResult.data.membersByCounty).forEach(([county, data]: [string, any]) => {
          calAIMData.push({
            type: 'MEMBERS',
            name: `${county} County Members`,
            lat: getCountyCoordinates(county).lat,
            lng: getCountyCoordinates(county).lng,
            county: county,
            totalMembers: data.totalMembers,
            activeMembers: data.activeMembers,
            kaiserMembers: data.kaiserMembers,
            healthNetMembers: data.healthNetMembers,
            snfTransition: data.snfTransition,
            snfDiversion: data.snfDiversion,
            membersList: data.members
          });
        });
      }

      console.log(`📋 Total CalAIM data points: ${calAIMData.length}`);
      console.log('📊 Breakdown:', {
        socialWorkers: calAIMData.filter(d => d.type === 'SW').length,
        registeredNurses: calAIMData.filter(d => d.type === 'RN').length,
        rcfes: calAIMData.filter(d => d.type === 'RCFE').length,
        memberCounties: calAIMData.filter(d => d.type === 'MEMBERS').length,
        totalMembers: calAIMData.filter(d => d.type === 'MEMBERS').reduce((sum, d) => sum + (d.totalMembers || 0), 0)
      });

      // If no real data, fall back to sample data
      if (calAIMData.length === 0) {
        console.log('⚠️ No real data found, using sample data');
        calAIMData = [
          { type: 'SW', name: 'Sample Social Worker', lat: 34.0522, lng: -118.2437, county: 'Los Angeles' },
          { type: 'RN', name: 'Sample Registered Nurse', lat: 34.0722, lng: -118.2637, county: 'Los Angeles' },
          { type: 'RCFE', name: 'Sample RCFE Facility', lat: 34.0422, lng: -118.2537, county: 'Los Angeles', beds: 12 }
        ];
      }

      const createdMarkers: any[] = [];

      calAIMData.forEach(item => {
        let icon, title, content;

        switch (item.type) {
          case 'SW':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#10b981', // Green for Social Workers
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 8
            };
            title = `Social Worker: ${item.name}`;
            content = `<div style="padding:8px;">
            <h3>👩‍💼 Social Worker</h3>
            <p><strong>${item.name}</strong></p>
            <p>📍 ${item.county} County</p>
            ${item.email ? `<p>📧 ${item.email}</p>` : ''}
            ${item.phone ? `<p>📞 ${item.phone}</p>` : ''}
          </div>`;
            break;
            
          case 'RN':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#3b82f6', // Blue for Registered Nurses
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 8
            };
            title = `Registered Nurse: ${item.name}`;
            content = `<div style="padding:8px;">
            <h3>👩‍⚕️ Registered Nurse</h3>
            <p><strong>${item.name}</strong></p>
            <p>📍 ${item.county} County</p>
            ${item.email ? `<p>📧 ${item.email}</p>` : ''}
            ${item.phone ? `<p>📞 ${item.phone}</p>` : ''}
          </div>`;
            break;
            
          case 'RCFE':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#8b5cf6', // Purple for RCFE Facilities
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: Math.max(8, Math.min(item.memberCount ? item.memberCount + 6 : 8, 16)) // Scale based on member count
            };
            title = `RCFE: ${item.name} (${item.memberCount || 0} members)`;
            
            // Create member list HTML
            let memberListHtml = '';
            if (item.membersList && item.membersList.length > 0) {
              memberListHtml = `
                <div style="margin-top:8px; padding:8px; background:#f8f9fa; border-radius:4px; max-height:150px; overflow-y:auto;">
                  <p style="font-weight:bold; margin-bottom:4px; color:#8b5cf6;">👥 Current Members (${item.memberCount}):</p>
                  <div style="font-size:11px;">
                    ${item.membersList.map((member: any, index: number) => 
                      `<div style="padding:2px 0; border-bottom:1px solid #e5e7eb; cursor:pointer;" 
                           onmouseover="this.style.backgroundColor='#e0e7ff'" 
                           onmouseout="this.style.backgroundColor='transparent'"
                           title="Member: ${member.firstName} ${member.lastName}">
                        <strong>${member.firstName} ${member.lastName}</strong>
                        ${member.healthPlan ? `<span style="color:#666; margin-left:8px;">(${member.healthPlan})</span>` : ''}
                        ${member.pathway ? `<br><span style="color:#888; font-size:10px;">${member.pathway}</span>` : ''}
                      </div>`
                    ).join('')}
                  </div>
                </div>`;
            } else if (item.memberCount === 0) {
              memberListHtml = `<div style="margin-top:8px; padding:8px; background:#fef3c7; border-radius:4px; font-size:11px; color:#92400e;">
                ⚠️ No members currently assigned to this facility
              </div>`;
            }
            
            content = `<div style="padding:12px; min-width:280px; max-width:350px;">
            <h3>🏠 RCFE Facility</h3>
            <p><strong>${item.name}</strong></p>
            <p>📍 ${item.county} County</p>
            <div style="margin:8px 0; padding:6px; background:#f3f4f6; border-radius:4px; font-size:12px;">
              <strong>📊 Facility Info:</strong><br>
              ${item.beds ? `🛏️ Licensed Beds: ${item.beds}<br>` : ''}
              👥 Current Members: <strong style="color:#8b5cf6;">${item.memberCount || 0}</strong><br>
              ${item.status ? `Status: ${item.status}<br>` : ''}
              ${item.licenseNumber ? `License: ${item.licenseNumber}<br>` : ''}
              ${item.registeredId ? `🆔 Registered ID: ${item.registeredId}` : ''}
            </div>
            ${item.address ? `<p style="font-size:11px;">📍 ${item.address}</p>` : ''}
            ${item.phone ? `<p style="font-size:11px;">📞 ${item.phone}</p>` : ''}
            ${memberListHtml}
          </div>`;
            break;
            
          case 'MEMBERS':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#f59e0b', // Orange for CalAIM Members
              fillOpacity: 0.8,
              strokeColor: '#ffffff',
              strokeWeight: 3,
              scale: Math.min(Math.max(item.totalMembers / 5, 10), 25) // Scale based on member count
            };
            title = `CalAIM Members: ${item.county} County (${item.totalMembers})`;
            content = `<div style="padding:12px; min-width:250px;">
            <h3>👥 CalAIM Members</h3>
            <p><strong>${item.county} County</strong></p>
            <div style="margin:8px 0; padding:8px; background:#f8f9fa; border-radius:4px;">
              <p><strong>📊 Total Members: ${item.totalMembers}</strong></p>
              <p>✅ Active: ${item.activeMembers}</p>
              <p>🏥 Kaiser: ${item.kaiserMembers}</p>
              <p>🏥 Health Net: ${item.healthNetMembers}</p>
              <p>🏥 SNF Transition: ${item.snfTransition}</p>
              <p>🏥 SNF Diversion: ${item.snfDiversion}</p>
            </div>
            <p style="font-size:11px; color:#666;">Click to zoom in for more details</p>
          </div>`;
            break;
        }

      const marker = new window.google.maps.Marker({
        position: { lat: item.lat, lng: item.lng },
        map: map,
        title: title,
        icon: icon
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: content
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });
    });

    console.log(`✅ Added ${calAIMData.length} CalAIM markers`);

    } catch (error: any) {
      console.error('❌ Error loading CalAIM data:', error);
      
      // Fall back to sample data
      const sampleData = [
        { type: 'SW', name: 'Sample Social Worker', lat: 34.0522, lng: -118.2437, county: 'Los Angeles' },
        { type: 'RN', name: 'Sample Registered Nurse', lat: 34.0722, lng: -118.2637, county: 'Los Angeles' },
        { type: 'RCFE', name: 'Sample RCFE Facility', lat: 34.0422, lng: -118.2537, county: 'Los Angeles', beds: 12 }
      ];

      // Add sample markers
      sampleData.forEach(item => {
        let icon, title, content;

        switch (item.type) {
          case 'SW':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#10b981',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 8
            };
            title = `Social Worker: ${item.name}`;
            content = `<div style="padding:8px;"><h3>👩‍💼 Social Worker</h3><p><strong>${item.name}</strong></p><p>📍 ${item.county} County</p></div>`;
            break;
            
          case 'RN':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 8
            };
            title = `Registered Nurse: ${item.name}`;
            content = `<div style="padding:8px;"><h3>👩‍⚕️ Registered Nurse</h3><p><strong>${item.name}</strong></p><p>📍 ${item.county} County</p></div>`;
            break;
            
          case 'RCFE':
            icon = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#8b5cf6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 8
            };
            title = `RCFE: ${item.name}`;
            content = `<div style="padding:8px;"><h3>🏠 RCFE Facility</h3><p><strong>${item.name}</strong></p><p>📍 ${item.county} County</p><p>🛏️ Beds: ${item.beds}</p></div>`;
            break;
        }

        const marker = new window.google.maps.Marker({
          position: { lat: item.lat, lng: item.lng },
          map: map,
          title: title,
          icon: icon
        });

        // Add marker type for layer control
        (marker as any).markerType = item.type;

        const infoWindow = new window.google.maps.InfoWindow({
          content: content
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        createdMarkers.push(marker);
      });

      // Store markers for layer control
      setMarkers(createdMarkers);
    }
  };

  if (error) {
    return (
      <div className="w-full h-96 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
        <div className="text-center p-4">
          <div className="text-red-600 font-semibold mb-2">❌ Error</div>
          <div className="text-sm text-red-700">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-96 bg-gray-100 rounded-lg relative">
      <div 
        ref={mapRef} 
        className="w-full h-full rounded-lg bg-white"
        style={{ minHeight: '384px' }}
      />
      
      
      {/* Custom Zoom Controls */}
      {mapInstance && (
        <div className="absolute top-4 right-4 flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="bg-white hover:bg-gray-50 border border-gray-300 rounded-md p-2 shadow-sm transition-colors duration-200 flex items-center justify-center"
            title="Zoom In"
          >
            <Plus className="h-4 w-4 text-gray-700" />
          </button>
          <button
            onClick={handleZoomOut}
            className="bg-white hover:bg-gray-50 border border-gray-300 rounded-md p-2 shadow-sm transition-colors duration-200 flex items-center justify-center"
            title="Zoom Out"
          >
            <Minus className="h-4 w-4 text-gray-700" />
          </button>
          <button
            onClick={handleResetZoom}
            className="bg-white hover:bg-gray-50 border border-gray-300 rounded-md p-2 shadow-sm transition-colors duration-200 flex items-center justify-center"
            title="Reset to California View"
          >
            <RotateCcw className="h-4 w-4 text-gray-700" />
          </button>
        </div>
      )}
      
      {/* Interactive Legend with Layer Controls */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg border min-w-[250px]">
        <h4 className="font-semibold text-sm mb-3">Map Layers</h4>
        <div className="space-y-2">
          {/* Social Workers Layer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Social Workers (MSW): {resourceCounts?.socialWorkers || 0}</span>
            </div>
            <button
              onClick={() => setShowSocialWorkers(!showSocialWorkers)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={showSocialWorkers ? "Hide Social Workers" : "Show Social Workers"}
            >
              {showSocialWorkers ? (
                <Eye className="h-3 w-3 text-green-600" />
              ) : (
                <EyeOff className="h-3 w-3 text-gray-400" />
              )}
            </button>
          </div>

          {/* Registered Nurses Layer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Registered Nurses (RN): {resourceCounts?.registeredNurses || 0}</span>
            </div>
            <button
              onClick={() => setShowRNs(!showRNs)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={showRNs ? "Hide Registered Nurses" : "Show Registered Nurses"}
            >
              {showRNs ? (
                <Eye className="h-3 w-3 text-blue-600" />
              ) : (
                <EyeOff className="h-3 w-3 text-gray-400" />
              )}
            </button>
          </div>

          {/* RCFE Facilities Layer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span>RCFE Facilities: {resourceCounts?.rcfeFacilities || 0}</span>
            </div>
            <button
              onClick={() => setShowRCFEs(!showRCFEs)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={showRCFEs ? "Hide RCFE Facilities" : "Show RCFE Facilities"}
            >
              {showRCFEs ? (
                <Eye className="h-3 w-3 text-purple-600" />
              ) : (
                <EyeOff className="h-3 w-3 text-gray-400" />
              )}
            </button>
          </div>

          {/* CalAIM Members Layer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full bg-orange-500 opacity-80 border-2 border-white" />
              <span>CalAIM Members: {resourceCounts?.authorizedMembers || 0}</span>
            </div>
            <button
              onClick={() => setShowMembers(!showMembers)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={showMembers ? "Hide CalAIM Members" : "Show CalAIM Members"}
            >
              {showMembers ? (
                <Eye className="h-3 w-3 text-orange-600" />
              ) : (
                <EyeOff className="h-3 w-3 text-gray-400" />
              )}
            </button>
          </div>
        </div>
        
        <div className="mt-3 pt-2 border-t">
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => {
                setShowSocialWorkers(true);
                setShowRNs(true);
                setShowRCFEs(true);
                setShowMembers(true);
              }}
              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              Show All
            </button>
            <button
              onClick={() => {
                setShowSocialWorkers(false);
                setShowRNs(false);
                setShowRCFEs(false);
                setShowMembers(false);
              }}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              Hide All
            </button>
          </div>
          <p className="text-xs text-gray-600">• Click markers for details</p>
        </div>
      </div>
    </div>
  );
}