'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Users, 
  UserCheck, 
  UserPlus,
  Home, 
  MapPin, 
  Mail, 
  Phone,
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SocialWorker {
  id: string;
  name: string;
  email: string;
  phone?: string;
  county: string;
  city?: string;
  caseload: number;
  maxCaseload: number;
  status: 'Active' | 'Inactive';
}

interface RCFEMember {
  id: string;
  name: string;
  rcfeName: string;
  rcfeAddress: string;
  county: string;
  city: string;
  assignedSocialWorker?: string;
  lastVisit?: string;
  nextVisit?: string;
  status: 'Active' | 'Inactive';
  careLevel: 'Low' | 'Medium' | 'High';
}

interface Assignment {
  id: string;
  socialWorkerId: string;
  socialWorkerName: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  county: string;
  assignedDate: string;
  lastVisit?: string;
  nextVisit?: string;
  status: 'Active' | 'Completed' | 'Pending';
  notes?: string;
}

export default function SocialWorkerAssignmentsPage() {
  const [socialWorkers, setSocialWorkers] = useState<SocialWorker[]>([]);
  const [rcfeMembers, setRCFEMembers] = useState<RCFEMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rcfeSearchTerm, setRcfeSearchTerm] = useState('');
  const [socialWorkerSearchTerm, setSocialWorkerSearchTerm] = useState('');
  const [selectedSocialWorker, setSelectedSocialWorker] = useState('');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedSocialWorkerMembers, setSelectedSocialWorkerMembers] = useState<any[]>([]);
  const [selectedSocialWorkerName, setSelectedSocialWorkerName] = useState('');

  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    // Auto-sync from Caspio on page load
    syncFromCaspio();
  }, []);

  const loadMockData = () => {
    // Mock social workers
    const mockSocialWorkers: SocialWorker[] = [
      {
        id: '1',
        name: 'Jason Bloome',
        email: 'jcbloome@gmail.com',
        county: 'Los Angeles',
        city: 'Pembroke Pines',
        caseload: 15,
        maxCaseload: 25,
        status: 'Active'
      },
      {
        id: '2',
        name: 'Anna-Lisa Bastian',
        email: 'Annalisabastian@gmail.com',
        county: 'Los Angeles',
        city: 'View Park',
        caseload: 12,
        maxCaseload: 20,
        status: 'Active'
      },
      {
        id: '3',
        name: 'Kia Yang',
        email: 'mskiayang@yahoo.com',
        county: 'Sacramento',
        city: 'Sacramento',
        caseload: 8,
        maxCaseload: 18,
        status: 'Active'
      },
      {
        id: '4',
        name: 'John Amber',
        email: 'john.amber@example.com',
        county: 'Los Angeles',
        city: 'Los Angeles',
        caseload: 10,
        maxCaseload: 20,
        status: 'Active'
      },
      {
        id: '5',
        name: 'Nick Jaksic',
        email: 'nick.jaksic@example.com',
        county: 'Los Angeles',
        city: 'Los Angeles',
        caseload: 8,
        maxCaseload: 18,
        status: 'Active'
      }
    ];

    // Mock RCFE members
    const mockMembers: RCFEMember[] = [
      {
        id: '1',
        name: 'John Smith',
        rcfeName: 'Sunshine Care Home',
        rcfeAddress: '123 Main St, Los Angeles, CA',
        county: 'Los Angeles',
        city: 'Los Angeles',
        assignedSocialWorker: '1',
        lastVisit: '2024-01-10',
        nextVisit: '2024-02-10',
        status: 'Active',
        careLevel: 'Medium'
      },
      {
        id: '2',
        name: 'Mary Johnson',
        rcfeName: 'Golden Years RCFE',
        rcfeAddress: '456 Oak Ave, Sacramento, CA',
        county: 'Sacramento',
        city: 'Sacramento',
        status: 'Active',
        careLevel: 'High'
      },
      {
        id: '3',
        name: 'Robert Davis',
        rcfeName: 'Peaceful Living Home',
        rcfeAddress: '789 Pine St, Los Angeles, CA',
        county: 'Los Angeles',
        city: 'Pasadena',
        assignedSocialWorker: '2',
        lastVisit: '2024-01-15',
        nextVisit: '2024-02-15',
        status: 'Active',
        careLevel: 'Low'
      }
    ];

    // Mock assignments
    const mockAssignments: Assignment[] = [
      {
        id: '1',
        socialWorkerId: '1',
        socialWorkerName: 'Staff Member A',
        memberId: '1',
        memberName: 'Sample Member A',
        rcfeName: 'Sample Care Home A',
        county: 'Los Angeles',
        assignedDate: '2024-01-01',
        lastVisit: '2024-01-10',
        nextVisit: '2024-02-10',
        status: 'Active',
        notes: 'Regular monthly visits scheduled'
      },
      {
        id: '2',
        socialWorkerId: '2',
        socialWorkerName: 'Anna-Lisa Bastian',
        memberId: '3',
        memberName: 'Robert Davis',
        rcfeName: 'Peaceful Living Home',
        county: 'Los Angeles',
        assignedDate: '2024-01-05',
        lastVisit: '2024-01-15',
        nextVisit: '2024-02-15',
        status: 'Active',
        notes: 'Low care level, quarterly visits'
      }
    ];

    setSocialWorkers(mockSocialWorkers);
    setRCFEMembers(mockMembers);
    setAssignments(mockAssignments);
  };

  // Get counties for filter
  const counties = useMemo(() => {
    const uniqueCounties = [...new Set([
      ...socialWorkers.map(sw => sw.county),
      ...rcfeMembers.map(member => member.county)
    ])].sort();
    return uniqueCounties;
  }, [socialWorkers, rcfeMembers]);

  // Filter data
  // Remove old filtering logic since we're using card-based interface now

  const unassignedMembers = useMemo(() => {
    return rcfeMembers.filter(member => !member.assignedSocialWorker);
  }, [rcfeMembers]);

  // Group members by social worker for card display
  const socialWorkerGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    // Group RCFE members by their assigned social worker
    rcfeMembers.forEach(member => {
      const socialWorkerName = member.assignedSocialWorker || 'Unassigned';
      if (socialWorkerName !== 'Unassigned') { // Only include assigned members
        if (!groups[socialWorkerName]) {
          groups[socialWorkerName] = [];
        }
        groups[socialWorkerName].push(member);
      }
    });

    return Object.entries(groups)
      .map(([name, members]) => ({
        name,
        memberCount: members.length,
        members
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rcfeMembers]);

  // Filter social worker groups based on search terms
  const filteredSocialWorkerGroups = useMemo(() => {
    return socialWorkerGroups.filter(group => {
      const matchesSocialWorker = socialWorkerSearchTerm === '' || 
        group.name.toLowerCase().includes(socialWorkerSearchTerm.toLowerCase());
      
      const matchesMembers = searchTerm === '' || 
        group.members.some(member => 
          member.memberName.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
      const matchesRCFE = rcfeSearchTerm === '' ||
        group.members.some(member =>
          member.rcfeName.toLowerCase().includes(rcfeSearchTerm.toLowerCase())
        );
      
      return matchesSocialWorker && (searchTerm === '' || matchesMembers) && (rcfeSearchTerm === '' || matchesRCFE);
    });
  }, [socialWorkerGroups, socialWorkerSearchTerm, searchTerm, rcfeSearchTerm]);

  const handleSocialWorkerCardClick = (socialWorkerName: string, members: any[]) => {
    setSelectedSocialWorkerName(socialWorkerName);
    setSelectedSocialWorkerMembers(members);
    setShowMembersModal(true);
  };

  const handleAssignSocialWorker = (memberId: string, socialWorkerId: string) => {
    // READ-ONLY MODE: Assignments are disabled to prevent writes to Caspio
    toast({
      title: "Read-Only Mode",
      description: "Assignment functionality is disabled in read-only mode. Data is synced from Caspio only.",
      variant: "destructive"
    });
    
    setShowAssignModal(false);
    setSelectedMember(null);
  };

  const getNextVisitDate = () => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth.toISOString().split('T')[0];
  };

  const syncFromCaspio = async () => {
    console.log('🔄 Starting sync from Caspio...');
    setSyncing(true);
    try {
      console.log('📊 Syncing social worker assignments from Caspio (READ ONLY)');
      
      // Fetch data from Caspio API
      console.log('📡 Fetching from /api/kaiser-members...');
      const response = await fetch('/api/kaiser-members');
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Response Error:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📊 Synced data from Caspio:', data);
      
      if (!data.members || !Array.isArray(data.members)) {
        console.error('❌ Invalid data structure:', data);
        throw new Error('Invalid data structure received from API');
      }
      
      // Debug: Log Social_Worker_Assigned field only
      if (data.members && data.members.length > 0) {
        console.log('🔍 Social Worker Assignment Debug (Social_Worker_Assigned field only):');
        
        // Count assigned vs unassigned (only authorized members with RCFE)
        const authorizedWithRCFE = data.members.filter((m: any) => 
          m.CalAIM_Status === 'Authorized' && m.RCFE_Name && m.RCFE_Name.trim() !== ''
        );
        const assigned = authorizedWithRCFE.filter((m: any) => m.Social_Worker_Assigned && m.Social_Worker_Assigned.trim() !== '');
        const unassigned = authorizedWithRCFE.filter((m: any) => !m.Social_Worker_Assigned || m.Social_Worker_Assigned.trim() === '');
        
        console.log(`📊 Summary: ${assigned.length} assigned, ${unassigned.length} unassigned (out of ${authorizedWithRCFE.length} total authorized with RCFE)`);
        
        // Show first 5 members with their field values
        console.log('🔍 SOCIAL WORKER PAGE - First 5 members data:');
        data.members.slice(0, 5).forEach((member: any, index: number) => {
          console.log(`Member ${index + 1}:`, {
            Senior_Last_First_ID: member.Senior_Last_First_ID,
            Senior_First: member.Senior_First,
            Senior_Last: member.Senior_Last,
            memberName: member.memberName,
            memberFirstName: member.memberFirstName,
            memberLastName: member.memberLastName,
            RCFE_Name: member.RCFE_Name,
            RCFE_Address: member.RCFE_Address,
            RCFE_City_RCFE_Zip: member.RCFE_City_RCFE_Zip,
            CalAIM_Status: member.CalAIM_Status,
            Social_Worker_Assigned: member.Social_Worker_Assigned,
            hasAssignment: !!(member.Social_Worker_Assigned && member.Social_Worker_Assigned.trim() !== '')
          });
        });
        
        // Show all available fields from first member
        if (data.members.length > 0) {
          console.log('🔍 ALL FIELDS in first member:', Object.keys(data.members[0]).sort());
        }
        
        // Show unique social workers (from authorized members with RCFE)
        const uniqueSocialWorkers = [...new Set(
          authorizedWithRCFE
            .filter((m: any) => m.Social_Worker_Assigned && m.Social_Worker_Assigned.trim() !== '')
            .map((m: any) => m.Social_Worker_Assigned)
        )];
        console.log('👥 Unique Social Workers found:', uniqueSocialWorkers);
        console.log('📈 Total unique social workers:', uniqueSocialWorkers.length);
      }
      
      // Transform authorized RCFE members (both assigned and unassigned)
      const transformedMembers: RCFEMember[] = data.members
        .filter((member: any) => {
          const hasRCFE = member.RCFE_Name && member.RCFE_Name.trim() !== '';
          const isAuthorized = member.CalAIM_Status === 'Authorized';
          return hasRCFE && isAuthorized;
        })
        .map((member: any, index: number) => ({
          id: `rcfe-member-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}-${member.client_ID2 || 'unknown'}`,
          name: member.Senior_Last_First_ID || member.memberName || `${member.Senior_Last || 'Unknown'}, ${member.Senior_First || 'Member'}`,
          rcfeName: member.RCFE_Name || 'Unknown RCFE',
          rcfeAddress: member.RCFE_Address || 'Address not available',
          county: member.Member_County || 'Los Angeles',
          city: member.RCFE_City_RCFE_Zip || member.Member_City || 'Unknown',
          assignedSocialWorker: member.Social_Worker_Assigned && member.Social_Worker_Assigned.trim() !== '' ? member.Social_Worker_Assigned : undefined,
          lastVisit: member.Last_Visit_Date || undefined,
          nextVisit: member.Next_Visit_Date || undefined,
          status: member.CalAIM_Status === 'Authorized' ? 'Active' : 'Inactive',
          careLevel: member.Care_Level || 'Medium'
        }));

      // Transform social worker assignments - include ALL authorized members (assigned and unassigned)
      const staffAssignments = data.members
        .filter((member: any) => {
          const hasRCFE = member.RCFE_Name && member.RCFE_Name.trim() !== '';
          const isAuthorized = member.CalAIM_Status === 'Authorized';
          // Show all authorized members with RCFE regardless of social worker assignment
          return hasRCFE && isAuthorized;
        })
        .map((member: any) => {
          // Use Social_Worker_Assigned field, or "Unassigned" for authorized members without assignment
          const socialWorkerAssignment = member.Social_Worker_Assigned || 'Unassigned';
          
          // Debug: Log the social worker assignment
          console.log('🔍 Social Worker Assignment Debug (Including Unassigned):', {
            memberName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
            Social_Worker_Assigned: member.Social_Worker_Assigned,
            CalAIM_Status: member.CalAIM_Status,
            socialWorkerAssignment: socialWorkerAssignment,
            isUnassigned: socialWorkerAssignment === 'Unassigned'
          });
          
          // Ensure it's a string and determine if this is an email (social worker) or a name
          const assignmentStr = String(socialWorkerAssignment || '');
          const isEmail = assignmentStr && typeof assignmentStr === 'string' && assignmentStr.includes('@');
          
          // If it's an email, use it as both ID and name (for now)
          // If it's not an email, it might be a name - use it as the name but create an ID
          const socialWorkerId = isEmail ? assignmentStr : `sw-${assignmentStr.replace(/\s+/g, '-').toLowerCase()}`;
          const socialWorkerName = assignmentStr || 'Unassigned';
          
          return {
            id: `assignment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${member.client_ID2 || 'unknown'}`,
            socialWorkerId: socialWorkerId,
            socialWorkerName: socialWorkerName,
            memberId: `member-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${member.client_ID2 || 'unknown'}`,
            memberName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
            rcfeName: member.RCFE_Name || 'Unknown RCFE',
            county: member.Member_County || 'Los Angeles',
            assignedDate: member.Assignment_Date || new Date().toISOString().split('T')[0],
            lastVisit: member.Last_Visit_Date || undefined,
            nextVisit: member.Next_Visit_Date || undefined,
            status: 'Active',
            notes: member.Visit_Notes || undefined
          };
        });

      setRCFEMembers(transformedMembers);
      setAssignments(staffAssignments);
      
      toast({
        title: "Sync Complete",
        description: `Synced ${transformedMembers.length} RCFE members and ${staffAssignments.length} assignments from Caspio (READ ONLY)`,
      });
      
    } catch (error) {
      console.error('❌ Error syncing from Caspio:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync data from Caspio. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const getCareLevelBadge = (level: string) => {
    const colors = {
      'Low': 'bg-green-100 text-green-800',
      'Medium': 'bg-yellow-100 text-yellow-800',
      'High': 'bg-red-100 text-red-800'
    };
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Social Worker Assignments</h1>
          <p className="text-muted-foreground">View social worker assignments to RCFE members</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              📖 Read-Only Mode
            </Badge>
            <span className="text-sm text-muted-foreground">Data synced from Caspio - no write operations</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={syncFromCaspio} 
            disabled={syncing}
            variant="outline"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync from Caspio'}
          </Button>
          <Button 
            onClick={() => {
              toast({
                title: "Read-Only Mode",
                description: "Assignment creation is disabled. This page only displays data from Caspio.",
                variant: "destructive"
              });
            }} 
            variant="outline"
            disabled
          >
            <Plus className="h-4 w-4 mr-2" />
            New Assignment (Read-Only)
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="member-search">Filter by Member Name</Label>
          <Input
            id="member-search"
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rcfe-search">Filter by RCFE Name</Label>
          <Input
            id="rcfe-search"
            placeholder="Search RCFE facilities..."
            value={rcfeSearchTerm}
            onChange={(e) => setRcfeSearchTerm(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="social-worker-search">Filter by Social Worker</Label>
          <Input
            id="social-worker-search"
            placeholder="Search social workers..."
            value={socialWorkerSearchTerm}
            onChange={(e) => setSocialWorkerSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Active Social Workers</p>
                <p className="text-2xl font-bold">{socialWorkers.filter(sw => sw.status === 'Active').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{rcfeMembers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Active Assignments</p>
                <p className="text-2xl font-bold">{assignments.filter(a => a.status === 'Active').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Unassigned Members</p>
                <p className="text-2xl font-bold">{unassignedMembers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Main Content */}
      {/* Summary Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Social Worker Summary
          </CardTitle>
          <CardDescription>
            Overview of all social workers and their caseloads
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{socialWorkerGroups.length}</div>
              <div className="text-sm text-muted-foreground">Active Social Workers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{socialWorkerGroups.reduce((sum, group) => sum + group.memberCount, 0)}</div>
              <div className="text-sm text-muted-foreground">Assigned Members</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{unassignedMembers.length}</div>
              <div className="text-sm text-muted-foreground">Unassigned Members</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{rcfeMembers.length}</div>
              <div className="text-sm text-muted-foreground">Total RCFE Members</div>
            </div>
          </div>
          
          {/* Social Worker List */}
          <div className="mt-6">
            <h4 className="font-medium mb-3">Social Workers & Caseloads:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {socialWorkerGroups.map((group) => (
                <div key={group.name} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm font-medium">{group.name}</span>
                  <Badge variant="outline">{group.memberCount} members</Badge>
                </div>
              ))}
              {unassignedMembers.length > 0 && (
                <div className="flex justify-between items-center p-2 bg-orange-50 rounded">
                  <span className="text-sm font-medium">Unassigned</span>
                  <Badge variant="destructive">{unassignedMembers.length} members</Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Worker Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Social Workers ({filteredSocialWorkerGroups.length})</h2>
          <div className="text-sm text-muted-foreground">
            Click on a card to view assigned members
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSocialWorkerGroups.map((group) => (
            <Card 
              key={group.name} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleSocialWorkerCardClick(group.name, group.members.map(member => ({
                memberName: member.name,
                rcfeName: member.rcfeName,
                county: member.county,
                status: member.status,
                lastVisit: member.lastVisit,
                nextVisit: member.nextVisit
              })))}
            >
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{group.name}</h3>
                  <div className="text-2xl font-bold text-blue-600 mb-1">{group.memberCount}</div>
                  <p className="text-sm text-muted-foreground">
                    {group.memberCount === 1 ? 'Member' : 'Members'} Assigned
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {/* Unassigned Members Card */}
          {unassignedMembers.length > 0 && (
            <Card 
              className="cursor-pointer hover:shadow-md transition-shadow border-orange-200"
              onClick={() => handleSocialWorkerCardClick('Unassigned', unassignedMembers.map(member => ({
                memberName: member.name,
                rcfeName: member.rcfeName,
                county: member.county,
                status: member.status
              })))}
            >
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3">
                    <UserPlus className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Unassigned</h3>
                  <div className="text-2xl font-bold text-orange-600 mb-1">{unassignedMembers.length}</div>
                  <p className="text-sm text-muted-foreground">
                    {unassignedMembers.length === 1 ? 'Member' : 'Members'} Need Assignment
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {filteredSocialWorkerGroups.length === 0 && unassignedMembers.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No social workers found matching your filters</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Members Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Members Assigned to {selectedSocialWorkerName}</CardTitle>
                  <CardDescription>
                    {selectedSocialWorkerMembers.length} {selectedSocialWorkerMembers.length === 1 ? 'member' : 'members'} assigned
                  </CardDescription>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowMembersModal(false)}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              <div className="space-y-3">
                {selectedSocialWorkerMembers.map((member, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{member.memberName}</h4>
                        <div className="text-sm text-gray-600 mt-1">
                          <div>RCFE: {member.rcfeName}</div>
                          <div>County: {member.county}</div>
                          {member.lastVisit && <div>Last Visit: {member.lastVisit}</div>}
                          {member.nextVisit && <div>Next Visit: {member.nextVisit}</div>}
                        </div>
                      </div>
                      <Badge variant={member.status === 'Active' ? 'default' : 'secondary'}>
                        {member.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                
                {selectedSocialWorkerMembers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No members assigned to this social worker
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}