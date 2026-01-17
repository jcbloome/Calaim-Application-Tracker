'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  MapPin, 
  Users, 
  UserCheck, 
  Stethoscope, 
  Home, 
  Mail, 
  Phone,
  Filter,
  X
} from 'lucide-react';

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

interface Member {
  id: string;
  clientId2?: string;
  firstName: string;
  lastName: string;
  county: string;
  city?: string;
  healthPlan?: string;
  pathway?: string;
  calaimStatus: string;
  rcfeRegisteredId?: string;
  rcfeName?: string;
  rcfeAddress?: string;
  rcfeCity?: string;
}

interface ResourceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'staff' | 'socialWorkers' | 'rns' | 'rcfes' | 'members';
  staffData: Record<string, any>;
  rcfeData: Record<string, any>;
  memberData?: Record<string, any>;
}

export function ResourceDetailModal({
  isOpen,
  onClose,
  type,
  staffData,
  rcfeData,
  memberData
}: ResourceDetailModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [rcfeSearchTerm, setRcfeSearchTerm] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  
  // Nested modal for RCFE members
  const [showRCFEMembersModal, setShowRCFEMembersModal] = useState(false);
  const [selectedRCFEId, setSelectedRCFEId] = useState<string>('');
  const [selectedRCFEName, setSelectedRCFEName] = useState<string>('');
  const [selectedRCFEMembers, setSelectedRCFEMembers] = useState<Member[]>([]);

  // Get all data based on type
  const allData = useMemo(() => {
    let items: (StaffMember | RCFE | Member)[] = [];
    
    if (type === 'staff' || type === 'socialWorkers' || type === 'rns') {
      Object.values(staffData).forEach((countyData: any) => {
        if (type === 'staff') {
          items.push(...countyData.socialWorkers, ...countyData.rns);
        } else if (type === 'socialWorkers') {
          items.push(...countyData.socialWorkers);
        } else if (type === 'rns') {
          items.push(...countyData.rns);
        }
      });
    } else if (type === 'rcfes') {
      Object.values(rcfeData).forEach((countyData: any) => {
        items.push(...countyData.facilities);
      });
    } else if (type === 'members' && memberData) {
      // Flatten all members from all counties
      Object.values(memberData.membersByCounty || {}).forEach((countyData: any) => {
        items.push(...countyData.members);
      });
    }
    
    return items;
  }, [type, staffData, rcfeData, memberData]);

  // Get unique counties and cities
  const counties = useMemo(() => {
    const uniqueCounties = [...new Set(allData.map(item => item.county))].sort();
    return uniqueCounties;
  }, [allData]);

  const cities = useMemo(() => {
    let filteredData = allData;
    if (selectedCounty !== 'all') {
      filteredData = allData.filter(item => item.county === selectedCounty);
    }
    const uniqueCities = [...new Set(filteredData.map(item => item.city).filter(Boolean))].sort();
    return uniqueCities;
  }, [allData, selectedCounty]);

  // Filter data based on search and selections
  const filteredData = useMemo(() => {
    let filtered = allData;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item => {
        if (type === 'members') {
          const member = item as Member;
          return (
            `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.county.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (member.city && member.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (member.healthPlan && member.healthPlan.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (member.clientId2 && member.clientId2.toLowerCase().includes(searchTerm.toLowerCase()))
          );
        } else {
          return (
            (item as any).name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.county.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.city && item.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
            ('email' in item && (item as any).email && (item as any).email.toLowerCase().includes(searchTerm.toLowerCase()))
          );
        }
      });
    }

    // Filter by RCFE search term (only for members)
    if (type === 'members' && rcfeSearchTerm) {
      filtered = filtered.filter(item => {
        const member = item as Member;
        return (
          (member.rcfeName && member.rcfeName.toLowerCase().includes(rcfeSearchTerm.toLowerCase())) ||
          (member.rcfeAddress && member.rcfeAddress.toLowerCase().includes(rcfeSearchTerm.toLowerCase())) ||
          (member.rcfeRegisteredId && member.rcfeRegisteredId.toLowerCase().includes(rcfeSearchTerm.toLowerCase()))
        );
      });
    }

    // Filter by county
    if (selectedCounty !== 'all') {
      filtered = filtered.filter(item => item.county === selectedCounty);
    }

    // Filter by city
    if (selectedCity !== 'all') {
      filtered = filtered.filter(item => item.city === selectedCity);
    }

    return filtered;
  }, [allData, searchTerm, rcfeSearchTerm, selectedCounty, selectedCity, type]);

  const getTitle = () => {
    switch (type) {
      case 'staff': return 'All Staff Members';
      case 'socialWorkers': return 'Social Workers';
      case 'rns': return 'Registered Nurses';
      case 'rcfes': return 'RCFE Facilities';
      case 'members': return 'Authorized CalAIM Members';
      default: return 'Resources';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'staff': return <Users className="h-5 w-5" />;
      case 'socialWorkers': return <UserCheck className="h-5 w-5" />;
      case 'rns': return <Stethoscope className="h-5 w-5" />;
      case 'rcfes': return <Home className="h-5 w-5" />;
      default: return <Users className="h-5 w-5" />;
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setRcfeSearchTerm('');
    setSelectedCounty('all');
    setSelectedCity('all');
  };

  const handleShowRCFEMembers = (rcfeId: string, rcfeName: string, members: Member[]) => {
    setSelectedRCFEId(rcfeId);
    setSelectedRCFEName(rcfeName);
    setSelectedRCFEMembers(members);
    setShowRCFEMembersModal(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {getTitle()}
            <Badge variant="secondary">{filteredData.length} total</Badge>
          </DialogTitle>
          <DialogDescription>
            Browse and filter {getTitle().toLowerCase()} by location and search terms
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="space-y-4">
          <div className={`grid grid-cols-1 gap-4 ${type === 'members' ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={type === 'members' ? "Search by member name, ID, or location..." : "Search by name, email, or location..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* RCFE Search (only for members) */}
            {type === 'members' && (
              <div className="relative">
                <Home className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by RCFE name, ID, or address..."
                  value={rcfeSearchTerm}
                  onChange={(e) => setRcfeSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            {/* County Filter */}
            <Select value={selectedCounty} onValueChange={setSelectedCounty}>
              <SelectTrigger>
                <SelectValue placeholder="All Counties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Counties</SelectItem>
                {counties.map(county => (
                  <SelectItem key={county} value={county}>{county}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* City Filter */}
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger>
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>

          {/* Active Filters Display */}
          {(searchTerm || rcfeSearchTerm || selectedCounty !== 'all' || selectedCity !== 'all') && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <Filter className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-800">
                Showing {filteredData.length} of {allData.length} results
              </span>
              {searchTerm && (
                <Badge variant="secondary">Member: "{searchTerm}"</Badge>
              )}
              {rcfeSearchTerm && (
                <Badge variant="secondary">RCFE: "{rcfeSearchTerm}"</Badge>
              )}
              {selectedCounty !== 'all' && (
                <Badge variant="secondary">County: {selectedCounty}</Badge>
              )}
              {selectedCity !== 'all' && (
                <Badge variant="secondary">City: {selectedCity}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto max-h-96">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredData.map((item) => (
              <div key={item.id} className="p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">
                      {type === 'members' 
                        ? `${(item as Member).firstName} ${(item as Member).lastName}`
                        : (item as any).name
                      }
                    </h3>
                    
                    {/* Role/Type */}
                    {'role' in item && (
                      <Badge 
                        variant={item.role === 'Social Worker' ? 'default' : 'secondary'}
                        className="mb-2"
                      >
                        {item.role}
                      </Badge>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
                      <MapPin className="h-3 w-3" />
                      {item.city ? `${item.city}, ${item.county}` : item.county}
                    </div>

                    {/* Member-specific info */}
                    {type === 'members' && (
                      <>
                        <div className="mb-2 flex items-center gap-2">
                          {(item as Member).healthPlan && (
                            <Badge variant="outline">
                              {(item as Member).healthPlan}
                            </Badge>
                          )}
                          {(item as Member).clientId2 && (
                            <Badge variant="secondary" className="text-xs">
                              ID: {(item as Member).clientId2}
                            </Badge>
                          )}
                        </div>
                        
                        {(item as Member).rcfeName && (
                          <div className="mb-2 p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-1 text-sm text-gray-700 mb-1">
                              <Home className="h-3 w-3" />
                              <span className="font-medium">RCFE:</span> {(item as Member).rcfeName}
                            </div>
                            
                            {/* Always show RCFE address since names may not be unique */}
                            <div className="text-sm text-gray-600 ml-4">
                              {(item as Member).rcfeAddress || 'Address not available'}
                              {(item as Member).rcfeCity && `, ${(item as Member).rcfeCity}`}
                            </div>
                            
                            {(item as Member).rcfeRegisteredId && (
                              <div className="text-xs text-gray-500 ml-4 mt-1">
                                RCFE ID: {(item as Member).rcfeRegisteredId}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {(item as Member).pathway && (
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Pathway:</span> {(item as Member).pathway}
                          </div>
                        )}
                      </>
                    )}

                    {/* Contact Info */}
                    {'email' in item && item.email && (
                      <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                        <Mail className="h-3 w-3" />
                        <a href={`mailto:${item.email}`} className="hover:text-blue-600">
                          {item.email}
                        </a>
                      </div>
                    )}

                    {'phone' in item && item.phone && (
                      <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                        <Phone className="h-3 w-3" />
                        <a href={`tel:${item.phone}`} className="hover:text-blue-600">
                          {item.phone}
                        </a>
                      </div>
                    )}

                    {/* RCFE Specific Info */}
                    {'capacity' in item && item.capacity && (
                      <div className="text-sm text-gray-600">
                        Capacity: {item.capacity} beds
                      </div>
                    )}

                    {/* RCFE Member Count (clickable) */}
                    {type === 'rcfes' && memberData && (
                      <div className="mt-2">
                        {(() => {
                          // Try both the RCFE id and any registered ID field
                          const rcfe = item as RCFE;
                          const rcfeId = rcfe.id;
                          const registeredId = (rcfe as any).registeredId || (rcfe as any).licenseNumber || rcfeId;
                          
                          // Look for members using both possible ID fields
                          const rcfeMembers = memberData.membersByRCFE?.[rcfeId] || 
                                            memberData.membersByRCFE?.[registeredId];
                          const memberCount = rcfeMembers?.totalMembers || 0;
                          
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowRCFEMembers(rcfeId, (item as RCFE).name, rcfeMembers?.members || []);
                              }}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              <Users className="h-3 w-3" />
                              {memberCount} member{memberCount !== 1 ? 's' : ''}
                              {memberCount > 0 && <span className="text-xs">(click to view)</span>}
                            </button>
                          );
                        })()}
                      </div>
                    )}

                    {'address' in item && item.address && (
                      <div className="text-sm text-gray-600 mt-1">
                        {item.address}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <Badge 
                    variant={item.status === 'Active' ? 'default' : 'secondary'}
                  >
                    {item.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="mb-2">{getIcon()}</div>
              <p>No {getTitle().toLowerCase()} match your current filters</p>
              <Button variant="outline" onClick={clearFilters} className="mt-2">
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Nested Modal for RCFE Members */}
    <Dialog open={showRCFEMembersModal} onOpenChange={setShowRCFEMembersModal}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Members at {selectedRCFEName}
            <Badge variant="secondary">{selectedRCFEMembers.length} members</Badge>
          </DialogTitle>
          <DialogDescription>
            CalAIM members currently assigned to this RCFE facility
          </DialogDescription>
        </DialogHeader>

        {/* RCFE Members List */}
        <div className="flex-1 overflow-y-auto">
          {selectedRCFEMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No members currently assigned to this RCFE</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedRCFEMembers.map((member) => (
                <div key={member.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">
                        {member.firstName} {member.lastName}
                      </h3>
                      
                      <div className="mb-2 flex items-center gap-2">
                        {member.healthPlan && (
                          <Badge variant="outline">
                            {member.healthPlan}
                          </Badge>
                        )}
                        {member.clientId2 && (
                          <Badge variant="secondary" className="text-xs">
                            ID: {member.clientId2}
                          </Badge>
                        )}
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
                        <MapPin className="h-3 w-3" />
                        {member.city ? `${member.city}, ${member.county}` : member.county}
                      </div>

                      {member.pathway && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Pathway:</span> {member.pathway}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}