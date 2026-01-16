'use client';

import React, { useState, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getNextStep, getSortedKaiserStatuses, KAISER_STATUS_PROGRESSION } from '@/lib/kaiser-status-progression';
import { Input } from '@/components/ui/input';
import { RefreshCw, User, Clock, CheckCircle, XCircle, AlertTriangle, Calendar, Download, ArrowUpDown, ArrowUp, ArrowDown, Shield, HourglassIcon, Filter, X, Database } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { useAutoSync } from '@/hooks/use-auto-sync';
import { MemberListModal } from '@/components/MemberListModal';
import { MemberCardSkeleton, MemberTableSkeleton } from '@/components/MemberCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { StaffAssignmentDropdown } from '@/components/StaffAssignmentDropdown';

// Kaiser workflow with next steps and recommended timeframes
const kaiserWorkflow = {
  "Pre-T2038, Compiling Docs": {
    nextStep: "T2038 Requested",
    recommendedDays: 3,
    description: "Compile all required documents and submit T2038 request",
    requiredActions: ["Gather medical records", "Complete T2038 form", "Submit to Kaiser"]
  },
  "T2038 Requested": {
    nextStep: "T2038 Received",
    recommendedDays: 14,
    description: "Follow up on T2038 request status",
    requiredActions: ["Monitor Kaiser response", "Follow up if no response in 10 days"]
  },
  "T2038 Received": {
    nextStep: "T2038 received, Need First Contact",
    recommendedDays: 2,
    description: "Review T2038 and initiate first contact",
    requiredActions: ["Review T2038 details", "Schedule initial member contact"]
  },
  "T2038 received, Need First Contact": {
    nextStep: "T2038 received, doc collection",
    recommendedDays: 5,
    description: "Complete first contact and begin document collection",
    requiredActions: ["Contact member", "Explain process", "Begin document gathering"]
  },
  "T2038 received, doc collection": {
    nextStep: "Needs RN Visit",
    recommendedDays: 7,
    description: "Complete document collection and schedule RN visit",
    requiredActions: ["Collect all required documents", "Schedule RN assessment"]
  },
  "Needs RN Visit": {
    nextStep: "RN/MSW Scheduled",
    recommendedDays: 3,
    description: "Schedule RN/MSW visit",
    requiredActions: ["Contact RN/MSW", "Schedule visit", "Confirm with member"]
  },
  "RN/MSW Scheduled": {
    nextStep: "RN Visit Complete",
    recommendedDays: 7,
    description: "Complete RN/MSW visit",
    requiredActions: ["Conduct visit", "Complete assessment", "Submit report"]
  },
  "RN Visit Complete": {
    nextStep: "Need Tier Level",
    recommendedDays: 2,
    description: "Review RN report and determine tier level needs",
    requiredActions: ["Review assessment", "Determine tier requirements"]
  },
  "Need Tier Level": {
    nextStep: "Tier Level Requested",
    recommendedDays: 3,
    description: "Submit tier level request",
    requiredActions: ["Prepare tier request", "Submit to Kaiser", "Document submission"]
  },
  "Tier Level Requested": {
    nextStep: "Tier Level Received",
    recommendedDays: 14,
    description: "Follow up on tier level determination",
    requiredActions: ["Monitor Kaiser response", "Follow up if delayed"]
  },
  "Tier Level Received": {
    nextStep: "Locating RCFEs",
    recommendedDays: 1,
    description: "Begin RCFE location process",
    requiredActions: ["Review tier level", "Begin RCFE search"]
  },
  "Locating RCFEs": {
    nextStep: "Found RCFE",
    recommendedDays: 10,
    description: "Identify suitable RCFE options",
    requiredActions: ["Search available RCFEs", "Contact facilities", "Assess suitability"]
  },
  "Found RCFE": {
    nextStep: "R&B Requested",
    recommendedDays: 3,
    description: "Request room and board approval",
    requiredActions: ["Submit R&B request", "Provide RCFE details"]
  },
  "R&B Requested": {
    nextStep: "R&B Signed",
    recommendedDays: 7,
    description: "Follow up on R&B approval",
    requiredActions: ["Monitor approval status", "Follow up if needed"]
  },
  "R&B Signed": {
    nextStep: "RCFE/ILS for Invoicing",
    recommendedDays: 2,
    description: "Initiate invoicing process",
    requiredActions: ["Set up invoicing", "Coordinate with ILS"]
  },
  "RCFE/ILS for Invoicing": {
    nextStep: "ILS Contracted (Complete)",
    recommendedDays: 5,
    description: "Complete ILS contracting",
    requiredActions: ["Finalize contract", "Set up services"]
  },
  "ILS Contracted (Complete)": {
    nextStep: "Confirm ILS Contracted",
    recommendedDays: 3,
    description: "Confirm all services are in place",
    requiredActions: ["Verify services started", "Confirm member satisfaction"]
  },
  "Confirm ILS Contracted": {
    nextStep: "Complete",
    recommendedDays: 1,
    description: "Finalize case completion",
    requiredActions: ["Complete final documentation", "Close case"]
  },
  "Complete": {
    nextStep: null,
    recommendedDays: 0,
    description: "Case completed successfully",
    requiredActions: ["Case closed"]
  },
  "T2038 email but need auth sheet": {
    nextStep: "T2038 Requested",
    recommendedDays: 2,
    description: "Obtain authorization sheet and resubmit",
    requiredActions: ["Get auth sheet signed", "Resubmit T2038"]
  },
  "Tier Level Revision Request": {
    nextStep: "Tier Level Requested",
    recommendedDays: 5,
    description: "Submit revised tier level request",
    requiredActions: ["Revise request", "Resubmit to Kaiser"]
  },
  "Tier Level Appeal": {
    nextStep: "Tier Level Requested",
    recommendedDays: 10,
    description: "Process tier level appeal",
    requiredActions: ["Prepare appeal documentation", "Submit appeal"]
  },
  "On-Hold": {
    nextStep: null,
    recommendedDays: 30,
    description: "Case on hold - review regularly",
    requiredActions: ["Review hold reason", "Set review date"]
  },
  "Non-active": {
    nextStep: null,
    recommendedDays: 0,
    description: "Case inactive",
    requiredActions: ["Case closed as inactive"]
  }
};

// All Kaiser status steps for comprehensive tracking
const kaiserSteps = Object.keys(kaiserWorkflow);

// Status colors for visual identification
const statusColors: Record<string, string> = {
  "Pre-T2038, Compiling Docs": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "T2038 Requested": "bg-yellow-200 text-yellow-900 border-yellow-300",
  "T2038 Received": "bg-blue-100 text-blue-800 border-blue-200",
  "T2038 received, Need First Contact": "bg-blue-200 text-blue-900 border-blue-300",
  "T2038 received, doc collection": "bg-blue-300 text-blue-900 border-blue-400",
  "Needs RN Visit": "bg-purple-100 text-purple-800 border-purple-200",
  "RN/MSW Scheduled": "bg-purple-200 text-purple-900 border-purple-300",
  "RN Visit Complete": "bg-purple-300 text-purple-900 border-purple-400",
  "Need Tier Level": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Tier Level Requested": "bg-indigo-200 text-indigo-900 border-indigo-300",
  "Tier Level Received": "bg-indigo-300 text-indigo-900 border-indigo-400",
  "Locating RCFEs": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Found RCFE": "bg-cyan-200 text-cyan-900 border-cyan-300",
  "R&B Requested": "bg-teal-100 text-teal-800 border-teal-200",
  "R&B Signed": "bg-teal-200 text-teal-900 border-teal-300",
  "RCFE/ILS for Invoicing": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "ILS Contracted (Complete)": "bg-green-100 text-green-800 border-green-200",
  "Confirm ILS Contracted": "bg-green-200 text-green-900 border-green-300",
  "Complete": "bg-green-300 text-green-900 border-green-400",
  "Tier Level Revision Request": "bg-red-100 text-red-800 border-red-200",
  "On-Hold": "bg-orange-100 text-orange-800 border-orange-200",
  "Tier Level Appeal": "bg-red-200 text-red-900 border-red-300",
  "T2038 email but need auth sheet": "bg-amber-100 text-amber-800 border-amber-200",
  "Non-active": "bg-gray-100 text-gray-800 border-gray-200",
  "Pending": "bg-slate-100 text-slate-800 border-slate-200"
};

interface KaiserMember {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMediCalNum: string;
  memberMrn: string;
  memberCounty: string;
  client_ID2: string;
  Kaiser_Status: string;
  CalAIM_Status: string;
  kaiser_user_assignment: string;
  pathway: string;
  next_step: string;
  next_steps_date: string;
  // Kaiser T2038 Process Dates
  Kaiser_T2038_Requested_Date?: string;
  Kaiser_T2038_Received_Date?: string;
  // Kaiser Tier Level Process Dates  
  Kaiser_Tier_Level_Requested_Date?: string;
  Kaiser_Tier_Level_Received_Date?: string;
  // ILS RCFE Contract Process Dates
  ILS_RCFE_Sent_For_Contract_Date?: string;
  ILS_RCFE_Received_Contract_Date?: string;
  // Legacy fields (keeping for compatibility)
  t2038_requested_date?: string;
  tier_requested_date?: string;
  last_status_change?: string;
  workflow_step?: string;
  days_in_current_status?: number;
  source: string;
}

export default function KaiserTrackerPage() {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();

  // State declarations
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMembers, setModalMembers] = useState<KaiserMember[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDescription, setModalDescription] = useState('');
  const [modalFilterType, setModalFilterType] = useState<'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'overdue_tasks'>('kaiser_status');
  const [modalFilterValue, setModalFilterValue] = useState('');
  const [filters, setFilters] = useState({
    kaiserStatus: 'all',
    calaimStatus: 'all',
    county: 'all',
    assignment: 'all',
    staffAssigned: '',
    overdueOnly: false
  });

  // Helper function to open member list modal
  const openMemberModal = (
    memberList: KaiserMember[],
    title: string,
    description: string,
    filterType: 'kaiser_status' | 'county' | 'staff' | 'calaim_status' | 'staff_assignment' | 'overdue_tasks',
    filterValue: string
  ) => {
    setModalMembers(memberList);
    setModalTitle(title);
    setModalDescription(description);
    setModalFilterType(filterType);
    setModalFilterValue(filterValue);
    setModalOpen(true);
  };

  // Helper functions
  const isOverdue = (dateString: string): boolean => {
    if (!dateString) return false;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'No date set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getDaysUntilDue = (dateString: string): number => {
    if (!dateString) return 999;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getStatusColor = (status: string): string => {
    return statusColors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Complete' || status === 'ILS Contracted (Complete)') {
      return <CheckCircle className="h-3 w-3" />;
    }
    if (status === 'On-Hold' || status === 'Non-active') {
      return <XCircle className="h-3 w-3" />;
    }
    if (status?.includes('Appeal') || status?.includes('Revision')) {
      return <AlertTriangle className="h-3 w-3" />;
    }
    return <Clock className="h-3 w-3" />;
  };

  // Update member status functions with workflow automation
  const updateMemberStatus = async (memberId: string, field: string, value: string) => {
    try {
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      // If updating Kaiser Status, check for workflow automation
      if (field === 'Kaiser_Status' && value in kaiserWorkflow) {
        const workflow = kaiserWorkflow[value as keyof typeof kaiserWorkflow];
        const currentDate = new Date();
        const recommendedDueDate = new Date(currentDate);
        recommendedDueDate.setDate(currentDate.getDate() + workflow.recommendedDays);
        
        // Update member with new status and recommended due date
        setMembers(prevMembers => 
          prevMembers.map(m => 
            m.id === memberId 
              ? { 
                  ...m, 
                  [field]: value,
                  next_steps_date: workflow.recommendedDays > 0 ? recommendedDueDate.toISOString().split('T')[0] : m.next_steps_date,
                  last_status_change: new Date().toISOString(),
                  workflow_step: workflow.nextStep || 'Complete'
                }
              : m
          )
        );

        // Show workflow guidance
        if (workflow.nextStep) {
          toast({
            title: 'Status Updated with Next Steps',
            description: (
              <div className="space-y-2">
                <p><strong>Current:</strong> {value}</p>
                <p><strong>Next Step:</strong> {workflow.nextStep}</p>
                <p><strong>Due:</strong> {recommendedDueDate.toLocaleDateString()}</p>
                <p><strong>Action:</strong> {workflow.description}</p>
              </div>
            ),
            className: 'bg-blue-100 text-blue-900 border-blue-200',
            duration: 8000,
          });
        } else {
          toast({
            title: 'Status Updated - Case Complete!',
            description: `Member has reached: ${value}`,
            className: 'bg-green-100 text-green-900 border-green-200',
          });
        }
      } else {
        // Regular status update
        setMembers(prevMembers => 
          prevMembers.map(m => 
            m.id === memberId 
              ? { ...m, [field]: value }
              : m
          )
        );

        toast({
          title: 'Status Updated',
          description: `${field} updated successfully`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }

      // TODO: Add API call to sync with Caspio
      console.log(`Updating member ${memberId}: ${field} = ${value}`);
      
    } catch (error) {
      console.error('Error updating member status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update member status',
      });
    }
  };

  const updateMemberDate = async (memberId: string, date: string) => {
    try {
      setMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === memberId 
            ? { ...member, next_steps_date: date }
            : member
        )
      );

      console.log(`Updating member ${memberId}: next_steps_date = ${date}`);
      
      toast({
        title: 'Date Updated',
        description: 'Next steps date updated successfully',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Error updating member date:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update date',
      });
    }
  };

  // Sorting functionality
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // Get unique staff members for dropdown
  const staffMembers = useMemo(() => {
    try {
      const uniqueStaff = [...new Set((members || []).map(m => m?.kaiser_user_assignment).filter(s => s && s.trim() !== ''))];
      return uniqueStaff.sort();
    } catch (error) {
      console.error('Error getting staff members:', error);
      return [];
    }
  }, [members]);

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    try {
      const uniqueKaiserStatuses = [...new Set((members || []).map(m => m?.Kaiser_Status).filter(s => s && s.trim() !== ''))];
      const uniqueCalaimStatuses = [...new Set((members || []).map(m => m?.CalAIM_Status).filter(s => s && s.trim() !== ''))];
      const uniqueCounties = [...new Set((members || []).map(m => m?.memberCounty).filter(s => s && s.trim() !== ''))];
      const uniqueAssignments = [...new Set((members || []).map(m => m?.kaiser_user_assignment).filter(s => s && s.trim() !== ''))];
      
      return {
        kaiserStatuses: uniqueKaiserStatuses.sort(),
        calaimStatuses: uniqueCalaimStatuses.sort(),
        counties: uniqueCounties.sort(),
        assignments: uniqueAssignments.sort()
      };
    } catch (error) {
      console.error('Error getting filter options:', error);
      return {
        kaiserStatuses: [],
        calaimStatuses: [],
        counties: [],
        assignments: []
      };
    }
  }, [members]);

  // Apply all filters
  const filteredMembers = useMemo(() => {
    try {
      if (!members || members.length === 0) return [];
      
      let filtered = [...members];
      
      // Staff filter
      if (selectedStaff !== 'all') {
        if (selectedStaff === 'unassigned') {
          filtered = filtered.filter(m => !m?.kaiser_user_assignment);
        } else {
          filtered = filtered.filter(m => m?.kaiser_user_assignment === selectedStaff);
        }
      }
      
      // Kaiser Status filter
      if (filters.kaiserStatus !== 'all') {
        filtered = filtered.filter(m => m?.Kaiser_Status === filters.kaiserStatus);
      }
      
      // CalAIM Status filter
      if (filters.calaimStatus !== 'all') {
        filtered = filtered.filter(m => m?.CalAIM_Status === filters.calaimStatus);
      }
      
      // County filter
      if (filters.county !== 'all') {
        filtered = filtered.filter(m => m?.memberCounty === filters.county);
      }
      
      // Assignment filter (different from staff filter - this is for specific filtering)
      if (filters.assignment !== 'all') {
        if (filters.assignment === 'unassigned') {
          filtered = filtered.filter(m => !m?.kaiser_user_assignment);
        } else {
          filtered = filtered.filter(m => m?.kaiser_user_assignment === filters.assignment);
        }
      }
      
      // Staff Assigned filter (from clicking staff cards)
      if (filters.staffAssigned) {
        filtered = filtered.filter(m => m?.kaiser_user_assignment === filters.staffAssigned);
      }
      
      // Overdue only filter
      if (filters.overdueOnly) {
        filtered = filtered.filter(m => isOverdue(m?.next_steps_date));
      }
      
      return filtered;
    } catch (error) {
      console.error('Error filtering members:', error);
      return members || [];
    }
  }, [members, selectedStaff, filters]);

  // Sort members based on current sort settings with error handling
  const sortedMembers = useMemo(() => {
    try {
      if (!filteredMembers || filteredMembers.length === 0) return [];
      
      return [...filteredMembers].sort((a, b) => {
        if (!sortField) return 0;
        
        let aValue = '';
        let bValue = '';
        
        try {
          switch (sortField) {
            case 'name':
              aValue = `${a?.memberFirstName || ''} ${a?.memberLastName || ''}`.toLowerCase();
              bValue = `${b?.memberFirstName || ''} ${b?.memberLastName || ''}`.toLowerCase();
              break;
            case 'mrn':
              aValue = a?.memberMrn || '';
              bValue = b?.memberMrn || '';
              break;
            case 'county':
              aValue = a?.memberCounty || '';
              bValue = b?.memberCounty || '';
              break;
            case 'pathway':
              aValue = a?.pathway || '';
              bValue = b?.pathway || '';
              break;
            case 'kaiser_status':
              aValue = a?.Kaiser_Status || '';
              bValue = b?.Kaiser_Status || '';
              break;
            case 'calaim_status':
              aValue = a?.CalAIM_Status || '';
              bValue = b?.CalAIM_Status || '';
              break;
            case 'assignment':
              aValue = a?.kaiser_user_assignment || '';
              bValue = b?.kaiser_user_assignment || '';
              break;
            case 'due_date':
              aValue = a?.next_steps_date || '9999-12-31';
              bValue = b?.next_steps_date || '9999-12-31';
              break;
            default:
              return 0;
          }
          
          if (sortDirection === 'asc') {
            return aValue.localeCompare(bValue);
          } else {
            return bValue.localeCompare(aValue);
          }
        } catch (error) {
          console.error('Error sorting individual items:', error);
          return 0;
        }
      });
    } catch (error) {
      console.error('Error sorting members:', error);
      return filteredMembers || [];
    }
  }, [filteredMembers, sortField, sortDirection]);

  // ILS Report functionality moved to dedicated ILS Report Editor
  // All ILS report generation is now handled by /admin/ils-report-editor

  // Fetch Caspio data
  const fetchCaspioData = async () => {
    setIsLoading(true);
    try {
      console.log('Starting Caspio sync...');
      
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      const result = await fetchKaiserMembers();
      console.log('Caspio result:', result);
      
      const data = result.data as any;
      
      if (data.success) {
        // Ensure members is an array and has proper structure
        const membersData = Array.isArray(data.members) ? data.members : [];
        
        console.log('Raw members data:', membersData.slice(0, 3)); // Log first 3 members
        
        // Validate and clean member data with workflow tracking
        const cleanMembers = membersData.map((member: any, index: number) => {
          const kaiserStatus = member?.Kaiser_Status || 'Pre-T2038, Compiling Docs';
          const lastChange = member?.last_status_change ? new Date(member.last_status_change) : new Date();
          const daysInStatus = Math.floor((new Date().getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24));
          
          return {
            id: member?.id || `frontend-member-${index}-${member?.client_ID2 || 'unknown'}`,
            memberFirstName: member?.memberFirstName || '',
            memberLastName: member?.memberLastName || '',
            memberMediCalNum: member?.memberMediCalNum || '',
            memberMrn: member?.memberMrn || '',
            memberCounty: member?.memberCounty || '',
            client_ID2: member?.client_ID2 || '',
            Kaiser_Status: kaiserStatus,
            CalAIM_Status: member?.CalAIM_Status || 'Pending',
            kaiser_user_assignment: member?.kaiser_user_assignment || '',
            pathway: member?.pathway || '',
            next_step: getNextStep(kaiserStatus) || '',
            next_steps_date: member?.next_steps_date || '',
            t2038_requested_date: member?.t2038_requested_date || '',
            tier_requested_date: member?.tier_requested_date || '',
            last_status_change: member?.last_status_change || new Date().toISOString(),
            workflow_step: kaiserWorkflow[kaiserStatus as keyof typeof kaiserWorkflow]?.nextStep || null,
            days_in_current_status: daysInStatus,
            source: member?.source || 'caspio'
          };
        });
        
        console.log('Cleaned members data:', cleanMembers.slice(0, 3)); // Log first 3 cleaned members
        
        setMembers(cleanMembers);
        toast({
          title: 'Success!',
          description: `Loaded ${cleanMembers.length} Kaiser members from Caspio`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.message || 'Failed to fetch Caspio data',
        });
      }
    } catch (error: any) {
      console.error('Error fetching Caspio data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to connect to Caspio',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need admin access to view the Kaiser Tracker.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kaiser Tracker Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of all Kaiser members from Caspio with comprehensive status tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchCaspioData} disabled={isLoading}>
            {isLoading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync from Caspio
          </Button>
          
        </div>
      </div>

      {/* Comprehensive Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Filter members by status, assignment, county, or other criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            
            {/* Staff Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <User className="h-3 w-3" />
                Staff Assignment
              </label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffMembers.filter(staff => staff && staff.trim() !== '').map((staff) => (
                    <SelectItem key={staff} value={staff}>
                      {staff}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Kaiser Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Kaiser Status
              </label>
              <Select 
                value={filters.kaiserStatus} 
                onValueChange={(value) => setFilters(prev => ({...prev, kaiserStatus: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {filterOptions.kaiserStatuses.filter(status => status && status.trim() !== '').map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CalAIM Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Shield className="h-3 w-3" />
                CalAIM Status
              </label>
              <Select 
                value={filters.calaimStatus} 
                onValueChange={(value) => setFilters(prev => ({...prev, calaimStatus: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {filterOptions.calaimStatuses.filter(status => status && status.trim() !== '').map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* County Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <User className="h-3 w-3" />
                County
              </label>
              <Select 
                value={filters.county} 
                onValueChange={(value) => setFilters(prev => ({...prev, county: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Counties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Counties</SelectItem>
                  {filterOptions.counties.filter(county => county && county.trim() !== '').map((county) => (
                    <SelectItem key={county} value={county}>
                      {county}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignment Filter (Additional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <User className="h-3 w-3" />
                Assignment
              </label>
              <Select 
                value={filters.assignment} 
                onValueChange={(value) => setFilters(prev => ({...prev, assignment: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Assignments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignments</SelectItem>
                  <SelectItem value="unassigned">Unassigned Only</SelectItem>
                  {filterOptions.assignments.filter(assignment => assignment && assignment.trim() !== '').map((assignment) => (
                    <SelectItem key={assignment} value={assignment}>
                      {assignment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Overdue Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Due Status
              </label>
              <Select 
                value={filters.overdueOnly ? 'overdue' : 'all'} 
                onValueChange={(value) => setFilters(prev => ({...prev, overdueOnly: value === 'overdue'}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Tasks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tasks</SelectItem>
                  <SelectItem value="overdue">Overdue Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Active Filters & Clear All */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing {filteredMembers.length} of {members.length} members</span>
            </div>
            
            {(selectedStaff !== 'all' || 
              filters.kaiserStatus !== 'all' || 
              filters.calaimStatus !== 'all' || 
              filters.county !== 'all' || 
              filters.assignment !== 'all' || 
              filters.staffAssigned ||
              filters.overdueOnly) && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSelectedStaff('all');
                  setFilters({
                    kaiserStatus: 'all',
                    calaimStatus: 'all',
                    county: 'all',
                    assignment: 'all',
                    staffAssigned: '',
                    overdueOnly: false
                  });
                }}
                className="flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                Clear All Filters
              </Button>
            )}
          </div>

          {/* Active Filter Tags */}
          <div className="flex flex-wrap gap-2 mt-3">
            {selectedStaff !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Staff: {selectedStaff === 'unassigned' ? 'Unassigned' : selectedStaff}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSelectedStaff('all')}
                />
              </Badge>
            )}
            {filters.kaiserStatus !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Kaiser: {filters.kaiserStatus}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setFilters(prev => ({...prev, kaiserStatus: 'all'}))}
                />
              </Badge>
            )}
            {filters.calaimStatus !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                CalAIM: {filters.calaimStatus}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setFilters(prev => ({...prev, calaimStatus: 'all'}))}
                />
              </Badge>
            )}
            {filters.county !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                County: {filters.county}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setFilters(prev => ({...prev, county: 'all'}))}
                />
              </Badge>
            )}
            {filters.assignment !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Assignment: {filters.assignment === 'unassigned' ? 'Unassigned' : filters.assignment}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setFilters(prev => ({...prev, assignment: 'all'}))}
                />
              </Badge>
            )}
            {filters.staffAssigned && (
              <Badge variant="secondary" className="flex items-center gap-1 bg-purple-100 text-purple-800">
                Staff: {filters.staffAssigned}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setFilters(prev => ({...prev, staffAssigned: ''}))}
                />
              </Badge>
            )}
            {filters.overdueOnly && (
              <Badge variant="secondary" className="flex items-center gap-1 bg-red-100 text-red-800">
                Overdue Only
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setFilters(prev => ({...prev, overdueOnly: false}))}
                />
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedStaff === 'all' ? 'Total Kaiser Members' : 
               selectedStaff === 'unassigned' ? 'Unassigned Members' : 
               `${selectedStaff}'s Members`}
            </CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{filteredMembers.length}</div>
            <p className="text-xs text-muted-foreground">
              {selectedStaff === 'all' ? 'Active in pipeline' : 
               selectedStaff === 'unassigned' ? 'Need assignment' : 
               'Assigned cases'}
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-red-300"
          onClick={() => {
            const overdueMembers = filteredMembers.filter(m => isOverdue(m.next_steps_date));
            if (overdueMembers.length > 0) {
              openMemberModal(
                overdueMembers,
                'Overdue Tasks',
                'Members with overdue next steps that need immediate attention',
                'overdue_tasks',
                'overdue'
              );
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {filteredMembers.filter(m => isOverdue(m.next_steps_date)).length}
            </div>
            <p className="text-xs text-muted-foreground">Click to view overdue members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ILS Bottlenecks</CardTitle>
            <Download className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {filteredMembers.filter(m => 
                m.Kaiser_Status === 'T2038 Requested' || 
                m.Kaiser_Status === 'Tier Level Requested' || 
                m.Kaiser_Status === 'RCFE/ILS for Contracting'
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">Weekly report ready</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authorized</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {filteredMembers.filter(m => 
                m.CalAIM_Status?.toLowerCase().includes('authorized') || 
                m.CalAIM_Status?.toLowerCase().includes('approved')
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">CalAIM authorized</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <HourglassIcon className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {filteredMembers.filter(m => 
                m.CalAIM_Status?.toLowerCase().includes('pending') || 
                m.CalAIM_Status?.toLowerCase().includes('waiting') ||
                m.CalAIM_Status?.toLowerCase().includes('submitted') ||
                (!m.CalAIM_Status || m.CalAIM_Status === 'Pending')
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting authorization</p>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        
        {/* Kaiser Status Steps Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              Kaiser Status Breakdown
            </CardTitle>
            <CardDescription>Members at each Kaiser status step</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {kaiserSteps.map((status) => {
                try {
                  const count = filteredMembers?.filter(m => m?.Kaiser_Status === status)?.length || 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        const statusMembers = filteredMembers?.filter(m => m?.Kaiser_Status === status) || [];
                        openMemberModal(
                          statusMembers,
                          `Kaiser Status: ${status}`,
                          `Members currently at ${status} stage`,
                          'kaiser_status',
                          status
                        );
                      }}
                      className="flex items-center justify-between text-xs p-2 rounded border hover:bg-blue-50 hover:border-blue-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 cursor-pointer"
                    >
                      <span className="truncate pr-2 text-left" title={status}>{status}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {count}
                        </Badge>
                        <span className="text-blue-600 text-xs">→</span>
                      </div>
                    </button>
                  );
                } catch (error) {
                  console.error('Error rendering status card:', error);
                  return null;
                }
              })}
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between font-medium">
                <span>
                  {selectedStaff === 'all' ? 'Total Members' : 
                   selectedStaff === 'unassigned' ? 'Unassigned Members' : 
                   `${selectedStaff}'s Members`}
                </span>
                <Badge className="bg-blue-100 text-blue-800">
                  {filteredMembers.length}
                </Badge>
              </div>
              {filters.kaiserStatus && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-600 font-medium">
                      Filtered by: {filters.kaiserStatus}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFilters(prev => ({ ...prev, kaiserStatus: '' }))}
                      className="text-xs h-6 px-2"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* CalAIM Authorization Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              CalAIM Authorization
            </CardTitle>
            <CardDescription>Authorization status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...new Set((filteredMembers || []).map(m => m?.CalAIM_Status).filter(Boolean))]
                .sort()
                .map((status) => {
                  try {
                    const count = (filteredMembers || []).filter(m => m?.CalAIM_Status === status).length;
                    const isAuthorized = status?.toLowerCase().includes('authorized') || status?.toLowerCase().includes('approved');
                    const isPending = status?.toLowerCase().includes('pending') || status?.toLowerCase().includes('waiting') || status?.toLowerCase().includes('submitted');
                    
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          const statusMembers = (filteredMembers || []).filter(m => m?.CalAIM_Status === status);
                          openMemberModal(
                            statusMembers,
                            `CalAIM Status: ${status}`,
                            `Members with ${status} CalAIM authorization status`,
                            'calaim_status',
                            status
                          );
                        }}
                        className="flex items-center justify-between text-sm p-2 rounded border hover:bg-green-50 hover:border-green-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 cursor-pointer w-full"
                      >
                        <div className="flex items-center gap-2">
                          {isAuthorized ? (
                            <Shield className="h-3 w-3 text-green-600" />
                          ) : isPending ? (
                            <HourglassIcon className="h-3 w-3 text-orange-600" />
                          ) : (
                            <Clock className="h-3 w-3 text-gray-600" />
                          )}
                          <span className="font-medium">{status}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className={
                              isAuthorized ? "bg-green-50 text-green-700 border-green-200" :
                              isPending ? "bg-orange-50 text-orange-700 border-orange-200" :
                              "bg-gray-50 text-gray-700 border-gray-200"
                            }
                          >
                            {count}
                          </Badge>
                          <span className="text-green-600 text-xs">→</span>
                        </div>
                      </button>
                    );
                  } catch (error) {
                    console.error('Error rendering CalAIM status card:', error);
                    return null;
                  }
                })}
              
              {/* Summary totals */}
              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3 w-3 text-green-600" />
                    <span className="font-medium text-green-700">Total Authorized</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">
                    {filteredMembers.filter(m => 
                      m.CalAIM_Status?.toLowerCase().includes('authorized') || 
                      m.CalAIM_Status?.toLowerCase().includes('approved')
                    ).length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HourglassIcon className="h-3 w-3 text-orange-600" />
                    <span className="font-medium text-orange-700">Total Pending</span>
                  </div>
                  <Badge className="bg-orange-100 text-orange-800">
                    {filteredMembers.filter(m => 
                      m.CalAIM_Status?.toLowerCase().includes('pending') || 
                      m.CalAIM_Status?.toLowerCase().includes('waiting') ||
                      m.CalAIM_Status?.toLowerCase().includes('submitted') ||
                      (!m.CalAIM_Status || m.CalAIM_Status === 'Pending')
                    ).length}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* County Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-green-600" />
              County Distribution
            </CardTitle>
            <CardDescription>Members by county</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...new Set((filteredMembers || []).map(m => m?.memberCounty).filter(Boolean))]
                .sort()
                .map((county) => {
                  try {
                    const count = (filteredMembers || []).filter(m => m?.memberCounty === county).length;
                    const overdue = (filteredMembers || []).filter(m => m?.memberCounty === county && isOverdue(m?.next_steps_date)).length;
                    return (
                      <button
                        key={county}
                        onClick={() => {
                          const countyMembers = (filteredMembers || []).filter(m => m?.memberCounty === county);
                          openMemberModal(
                            countyMembers,
                            `${county} County Members`,
                            `All Kaiser members in ${county} County`,
                            'county',
                            county
                          );
                        }}
                        className="flex items-center justify-between text-sm p-2 rounded border hover:bg-green-50 hover:border-green-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 cursor-pointer w-full"
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{county}</span>
                          {overdue > 0 && (
                            <span className="text-xs text-red-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {overdue} overdue
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">
                            {count}
                          </Badge>
                          <span className="text-green-600 text-xs">→</span>
                        </div>
                      </button>
                    );
                  } catch (error) {
                    console.error('Error rendering county card:', error);
                    return null;
                  }
                })}
              {filteredMembers.filter(m => !m.memberCounty).length > 0 && (
                <div className="flex items-center justify-between text-sm p-2 rounded border">
                  <span className="text-muted-foreground">No County</span>
                  <Badge variant="outline">
                    {filteredMembers.filter(m => !m.memberCounty).length}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Staff Assignment Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-purple-600" />
              Staff Assignments
            </CardTitle>
            <CardDescription>Workload by staff member • Click any staff member to view their assigned members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...new Set((members || []).map(m => m?.kaiser_user_assignment).filter(Boolean))]
                .sort()
                .map((staff) => {
                  try {
                    const count = (members || []).filter(m => m?.kaiser_user_assignment === staff).length;
                    const overdue = (members || []).filter(m => m?.kaiser_user_assignment === staff && isOverdue(m?.next_steps_date)).length;
                    const dueToday = (members || []).filter(m => {
                      if (m?.kaiser_user_assignment !== staff) return false;
                      const days = getDaysUntilDue(m?.next_steps_date);
                      return days === 0;
                    }).length;
                    
                    return (
                      <button
                        key={staff}
                        onClick={() => {
                          const staffMembers = (members || []).filter(m => m?.kaiser_user_assignment === staff);
                          openMemberModal(
                            staffMembers,
                            `${staff}'s Assigned Members`,
                            `All Kaiser members assigned to ${staff}`,
                            'staff',
                            staff
                          );
                        }}
                        className="flex items-center justify-between text-sm p-3 rounded-lg border hover:bg-purple-50 hover:border-purple-300 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 cursor-pointer w-full group"
                      >
                        <div className="flex-1">
                          <div className="flex flex-col text-left">
                            <span className="font-medium truncate group-hover:text-purple-700 transition-colors" title={staff}>{staff}</span>
                            <div className="flex gap-2 text-xs">
                              {overdue > 0 && (
                                <span className="text-red-600 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {overdue} overdue
                                </span>
                              )}
                              {dueToday > 0 && (
                                <span className="text-orange-600 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {dueToday} due today
                                </span>
                              )}
                              {!overdue && !dueToday && (
                                <span className="text-muted-foreground group-hover:text-purple-600 transition-colors">
                                  Click to view members
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="group-hover:border-purple-300 group-hover:bg-purple-50 transition-colors">
                            {count}
                          </Badge>
                          <span className="text-purple-600 text-xs group-hover:text-purple-700 transition-colors">→</span>
                        </div>
                      </button>
                    );
                  } catch (error) {
                    console.error('Error rendering staff card:', error);
                    return null;
                  }
                })}
              {members.filter(m => !m.kaiser_user_assignment).length > 0 && (
                <button
                  onClick={() => {
                    const unassignedMembers = members.filter(m => !m.kaiser_user_assignment);
                    openMemberModal(
                      unassignedMembers,
                      'Unassigned Members',
                      'Members that need staff assignment',
                      'staff_assignment',
                      'unassigned'
                    );
                  }}
                  className="flex items-center justify-between text-sm p-3 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 cursor-pointer w-full group"
                >
                  <div className="flex flex-col">
                    <span className="text-orange-700 font-medium group-hover:text-orange-800 transition-colors">Unassigned Members</span>
                    <span className="text-xs text-orange-600 group-hover:text-orange-700 transition-colors">Click to view and assign staff</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className="bg-orange-100 text-orange-800 group-hover:bg-orange-200 transition-colors">
                      {members.filter(m => !m.kaiser_user_assignment).length}
                    </Badge>
                    <span className="text-orange-600 text-xs group-hover:text-orange-700 transition-colors">→</span>
                  </div>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Workflow Alerts */}
      {filteredMembers.some(m => 
        (m.days_in_current_status || 0) > (kaiserWorkflow[m.Kaiser_Status as keyof typeof kaiserWorkflow]?.recommendedDays || 0)
      ) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              Workflow Alerts
            </CardTitle>
            <CardDescription className="text-orange-700">
              Members who have been in their current status longer than recommended
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredMembers
                .filter(m => (m.days_in_current_status || 0) > (kaiserWorkflow[m.Kaiser_Status as keyof typeof kaiserWorkflow]?.recommendedDays || 0))
                .slice(0, 5)
                .map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 bg-white rounded border border-orange-200">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <div>
                        <span className="font-medium">{member.memberFirstName} {member.memberLastName}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {member.days_in_current_status} days in "{member.Kaiser_Status}"
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-orange-100 text-orange-800">
                        {member.workflow_step || 'Review Needed'}
                      </Badge>
                      {member.workflow_step && (
                        <Button 
                          size="sm" 
                          onClick={() => updateMemberStatus(member.id, 'Kaiser_Status', member.workflow_step!)}
                        >
                          Advance
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              {filteredMembers.filter(m => (m.days_in_current_status || 0) > (kaiserWorkflow[m.Kaiser_Status as keyof typeof kaiserWorkflow]?.recommendedDays || 0)).length > 5 && (
                <p className="text-sm text-orange-700 text-center pt-2">
                  ...and {filteredMembers.filter(m => (m.days_in_current_status || 0) > (kaiserWorkflow[m.Kaiser_Status as keyof typeof kaiserWorkflow]?.recommendedDays || 0)).length - 5} more members need attention
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Kaiser Members ({filteredMembers.length}
              {selectedStaff !== 'all' && ` of ${members.length} total`})
            </CardTitle>
          </CardHeader>
        <CardContent>
          {isLoading ? (
            <>
              {/* Desktop skeleton */}
              <div className="hidden lg:block">
                <MemberTableSkeleton />
              </div>
              {/* Mobile skeleton */}
              <div className="lg:hidden space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <MemberCardSkeleton key={i} />
                ))}
              </div>
            </>
          ) : members.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No Kaiser Members Loaded"
              description="Kaiser member data needs to be synced from Caspio to display here."
              actionLabel="Sync from Caspio"
              actionOnClick={fetchCaspioData}
            />
          ) : filteredMembers.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="No Members Found"
              description={`No members found for ${selectedStaff === 'unassigned' ? 'unassigned' : selectedStaff}. Try selecting a different staff member or clear the filter.`}
              actionLabel="Clear Filters"
              actionOnClick={() => {
                setSelectedStaff('all');
                setFilters({
                  kaiserStatus: 'all',
                  calaimStatus: 'all',
                  county: 'all',
                  assignment: 'all',
                  staffAssigned: '',
                  overdueOnly: false
                });
              }}
            />
          ) : (
            <>
              {/* Desktop Table View */}
              <div id="members-table" className="hidden lg:block rounded-md border overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('name')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        Member {getSortIcon('name')}
                      </Button>
                    </TableHead>
                    <TableHead>Client ID2</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('mrn')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        MRN {getSortIcon('mrn')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('county')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        County {getSortIcon('county')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('pathway')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        Pathway {getSortIcon('pathway')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('kaiser_status')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        Kaiser Status {getSortIcon('kaiser_status')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('calaim_status')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        CalAIM Status {getSortIcon('calaim_status')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('assignment')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        Assignment {getSortIcon('assignment')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('due_date')}
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                      >
                        Due Date {getSortIcon('due_date')}
                      </Button>
                    </TableHead>
                    <TableHead>Next Step</TableHead>
                    <TableHead>Next Steps</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">
                          {member.memberFirstName} {member.memberLastName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {member.client_ID2 || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.memberMrn || 'N/A'}</TableCell>
                      <TableCell>{member.memberCounty || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          {member.pathway || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={member.Kaiser_Status || 'Pending'} 
                          onValueChange={(value) => updateMemberStatus(member.id, 'Kaiser_Status', value)}
                        >
                          <SelectTrigger className="w-full min-w-[200px]">
                            <SelectValue>
                              <Badge className={getStatusColor(member.Kaiser_Status || 'Pending')} variant="outline">
                                <div className="flex items-center gap-1">
                                  {getStatusIcon(member.Kaiser_Status || 'Pending')}
                                  <span className="text-xs">{member.Kaiser_Status || 'Pending'}</span>
                                </div>
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {kaiserSteps.map((status) => (
                              <SelectItem key={status} value={status}>
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(status)}
                                  <span className="text-sm">{status}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={member.CalAIM_Status || 'Pending'} 
                          onValueChange={(value) => updateMemberStatus(member.id, 'CalAIM_Status', value)}
                        >
                          <SelectTrigger className="w-full min-w-[150px]">
                            <SelectValue>
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200" variant="outline">
                                <div className="flex items-center gap-1">
                                  {getStatusIcon(member.CalAIM_Status || 'Pending')}
                                  <span className="text-xs">{member.CalAIM_Status || 'Pending'}</span>
                                </div>
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">
                              <div className="flex items-center gap-2">
                                <HourglassIcon className="h-3 w-3 text-orange-600" />
                                <span>Pending</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Submitted">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3 text-blue-600" />
                                <span>Submitted</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Under Review">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3 text-yellow-600" />
                                <span>Under Review</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Authorized">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3 text-green-600" />
                                <span>Authorized</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Approved">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-3 w-3 text-green-600" />
                                <span>Approved</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Denied">
                              <div className="flex items-center gap-2">
                                <XCircle className="h-3 w-3 text-red-600" />
                                <span>Denied</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Needs More Info">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-3 w-3 text-orange-600" />
                                <span>Needs More Info</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <StaffAssignmentDropdown
                          member={member}
                          staffMembers={staffMembers}
                          onAssignmentChange={updateMemberStatus}
                          currentUser={user}
                          showEmailButton={true}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                        >
                          {member.next_step || 'No Next Step'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            value={member.next_steps_date || ''}
                            onChange={(e) => updateMemberDate(member.id, e.target.value)}
                            className={`w-full text-xs ${
                              isOverdue(member.next_steps_date) 
                                ? 'border-red-300 bg-red-50' 
                                : 'border-gray-300'
                            }`}
                          />
                          {isOverdue(member.next_steps_date) && (
                            <div className="flex items-center gap-1 text-red-600">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="text-xs font-medium">
                                {Math.abs(getDaysUntilDue(member.next_steps_date))}d overdue
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {member.workflow_step ? (
                            <>
                              <div className="text-sm font-medium text-blue-700">
                                Next: {member.workflow_step}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {kaiserWorkflow[member.Kaiser_Status as keyof typeof kaiserWorkflow]?.description}
                              </div>
                              <div className="text-xs">
                                <Badge variant="outline" className={`${
                                  (member.days_in_current_status || 0) > (kaiserWorkflow[member.Kaiser_Status as keyof typeof kaiserWorkflow]?.recommendedDays || 0)
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-green-50 text-green-700 border-green-200'
                                }`}>
                                  {member.days_in_current_status || 0} days in status
                                </Badge>
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-green-600 font-medium">Complete</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/admin/applications/${member.id}`}>
                              Manage
                            </a>
                          </Button>
                          {member.workflow_step && (
                            <Button 
                              size="sm" 
                              variant="default"
                              onClick={() => updateMemberStatus(member.id, 'Kaiser_Status', member.workflow_step!)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Next Step
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="lg:hidden space-y-4">
              {sortedMembers.map((member) => (
                <Card key={member.id} className="p-4">
                  <div className="space-y-3">
                    {/* Header with name and status */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {member.memberFirstName} {member.memberLastName}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          MRN: {member.memberMrn || 'N/A'}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {member.client_ID2 || 'N/A'}
                      </Badge>
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {member.Kaiser_Status || 'No Status'}
                      </Badge>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {member.CalAIM_Status || 'Pending'}
                      </Badge>
                      {member.next_step && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          Next: {member.next_step}
                        </Badge>
                      )}
                    </div>

                    {/* Key info grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">County:</span>
                        <p className="font-medium">{member.memberCounty || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pathway:</span>
                        <p className="font-medium">{member.pathway || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Assigned:</span>
                        <p className="font-medium text-xs">
                          {member.kaiser_user_assignment || 'Unassigned'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Due Date:</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={member.next_steps_date || ''}
                            onChange={(e) => updateMemberDate(member.id, e.target.value)}
                            className={`text-xs h-8 ${
                              isOverdue(member.next_steps_date) 
                                ? 'border-red-300 bg-red-50' 
                                : 'border-gray-300'
                            }`}
                          />
                          {isOverdue(member.next_steps_date) && (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Assignment dropdown */}
                    <div className="pt-2 border-t">
                      <StaffAssignmentDropdown
                        member={member}
                        staffMembers={staffMembers}
                        onAssignmentChange={updateMemberStatus}
                        currentUser={user}
                        showEmailButton={true}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Member List Modal */}
      <MemberListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        members={modalMembers}
        title={modalTitle}
        description={modalDescription}
        filterType={modalFilterType}
        filterValue={modalFilterValue}
        staffMembers={staffMembers}
        onMemberUpdate={updateMemberStatus}
      />
    </div>
  );
}