'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { format, parseISO, differenceInDays, addDays, isBefore, isAfter, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  Filter, 
  Download,
  DollarSign,
  Building,
  User,
  Phone,
  Mail,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  PieChart
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { UpdateAuthorizationDialog } from './components/UpdateAuthorizationDialog';

interface AuthorizationMember {
  id: string;
  memberName: string;
  mrn: string;
  healthPlan: string;
  kaiserStatus?: string;
  calaimStatus?: string;
  rcfeName?: string;
  primaryContact: string;
  contactPhone: string;
  contactEmail: string;
  
  // T2038 Authorization (ConnectionsILOS)
  authStartDateT2038?: string;
  authEndDateT2038?: string;
  authExtRequestDateT2038?: string;
  
  // H2022 Authorization (RCFE)
  authStartDateH2022?: string;
  authEndDateH2022?: string;
  authExtRequestDateH2022?: string;
  
  // Calculated fields
  t2038DaysRemaining?: number;
  h2022DaysRemaining?: number;
  t2038Status: 'active' | 'expiring' | 'expired' | 'pending' | 'none';
  h2022Status: 'active' | 'expiring' | 'expired' | 'pending' | 'none';
  // Critical renewal bucket for authorization tracker.
  criticalRenewal?: boolean;
  hasCompleteH2022Dates?: boolean;
  needsIlsDateRouting?: boolean;
  needsAttention: boolean;
}

interface MembersCacheStatusSnapshot {
  lastSyncAt?: string;
  lastRunAt?: string;
  lastMode?: string;
  webhook?: {
    latestEventReceivedAt?: string;
    latestEventOperation?: string;
    latestProcessedAt?: string;
    latestProcessedSuccess?: boolean | null;
  };
}

const getAuthStatus = (endDate?: string): 'active' | 'expiring' | 'expired' | 'pending' | 'none' => {
  if (!endDate || endDate.trim() === '') return 'none';
  
  try {
    const end = parseISO(endDate);
    if (isNaN(end.getTime())) return 'none'; // Invalid date
    
    const today = new Date();
    const daysRemaining = differenceInDays(end, today);
    
    if (daysRemaining < 0) return 'expired';
    if (daysRemaining <= 14) return 'expiring';
    return 'active';
  } catch (error) {
    console.warn('Invalid date format:', endDate);
    return 'none';
  }
};

const getDaysRemaining = (endDate?: string): number | undefined => {
  if (!endDate || endDate.trim() === '') return undefined;
  
  try {
    const end = parseISO(endDate);
    if (isNaN(end.getTime())) return undefined; // Invalid date
    
    return differenceInDays(end, new Date());
  } catch (error) {
    return undefined;
  }
};

const getHealthPlanBadgeClass = (plan?: string) => {
  const normalized = String(plan || '').toLowerCase();
  if (normalized.includes('health net')) return 'bg-green-50 text-green-700 border-green-200';
  if (normalized.includes('kaiser')) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const normalizePlanForFilter = (plan?: string) => {
  const normalized = String(plan || '').toLowerCase().trim();
  if (normalized.includes('health net')) return 'health net';
  if (normalized.includes('kaiser')) return 'kaiser';
  return normalized || 'unknown';
};

const normalizePlanForDisplay = (plan?: string) => {
  const normalized = String(plan || '').toLowerCase().trim();
  if (normalized.includes('health net')) return 'Health Net';
  if (normalized.includes('kaiser')) return 'Kaiser';
  return String(plan || 'Unknown').trim() || 'Unknown';
};

const isKaiserPlan = (plan?: string) => String(plan || '').toLowerCase().includes('kaiser');
const isHealthNetPlan = (plan?: string) => String(plan || '').toLowerCase().includes('health net');

const normalizeCalaimStatus = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const isAuthorizedCalaim = (value?: string) => normalizeCalaimStatus(value) === 'authorized';
const normalizeKaiserStatus = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
const isKaiserTrackerStatus = (value?: string) => {
  const status = normalizeKaiserStatus(value);
  return status === 'final member at rcfe' || status === 'r & b sent pending ils contract';
};
const hasDateValue = (value?: string) => Boolean(String(value || '').trim());

const isEndDateWithinDays = (endDate?: string, withinDays: number = 30) => {
  if (!endDate || endDate.trim() === '') return false;
  try {
    const end = parseISO(endDate);
    if (isNaN(end.getTime())) return false;
    const daysRemaining = differenceInDays(end, new Date());
    return daysRemaining >= 0 && daysRemaining <= withinDays;
  } catch {
    return false;
  }
};

const formatDateSafe = (dateString?: string) => {
  if (!dateString) return '-';
  try {
    const date = parseISO(dateString);
    return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
  } catch {
    return '-';
  }
};

const formatDateTimeSafe = (dateString?: string) => {
  if (!dateString) return 'Not available';
  try {
    const date = parseISO(dateString);
    if (!isNaN(date.getTime())) return format(date, 'MMM d, yyyy h:mm a');
  } catch {
    // fallback to native parse
  }
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 'Not available' : format(date, 'MMM d, yyyy h:mm a');
  } catch {
    return 'Not available';
  }
};

export default function AuthorizationTracker() {
  const { user, isAdmin } = useAdmin();
  const { toast } = useToast();
  const functions = useFunctions();
  
  const [members, setMembers] = useState<AuthorizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMCO, setSelectedMCO] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedPlanMetric, setSelectedPlanMetric] = useState<'all' | 'urgent' | 't2038Active' | 'h2022Active'>('all');
  const [lastAuthorizationRefreshAt, setLastAuthorizationRefreshAt] = useState<string>('');
  const [membersCacheStatus, setMembersCacheStatus] = useState<MembersCacheStatusSnapshot | null>(null);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string>('memberName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Set mock data for demonstration when functions aren't deployed
  const setMockData = () => {
    const mockMembers: AuthorizationMember[] = [
      {
        id: 'mock-1',
        memberName: 'Sample Member',
        mrn: 'MRN123456',
        healthPlan: 'Kaiser',
        primaryContact: 'Maria Garcia',
        contactPhone: '(555) 123-4567',
        contactEmail: 'maria@example.com',
        authStartDateT2038: '2024-01-01',
        authEndDateT2038: '2024-12-31',
        authStartDateH2022: '2024-06-01',
        authEndDateH2022: '2024-11-30',
        t2038Status: 'active',
        h2022Status: 'expiring',
        t2038DaysRemaining: 200,
        h2022DaysRemaining: 10,
        needsAttention: true
      },
      {
        id: 'mock-2',
        memberName: 'Michael Chen',
        mrn: 'MRN789012',
        healthPlan: 'Health Net',
        primaryContact: 'Jennifer Smith',
        contactPhone: '(555) 987-6543',
        contactEmail: 'jennifer@example.com',
        authStartDateT2038: '2024-03-15',
        authEndDateT2038: '2025-03-14',
        authStartDateH2022: '2024-03-15',
        authEndDateH2022: '2025-03-14',
        t2038Status: 'active',
        h2022Status: 'active',
        t2038DaysRemaining: 120,
        h2022DaysRemaining: 120,
        needsAttention: false
      },
      {
        id: 'mock-3',
        memberName: 'Emily Rodriguez',
        mrn: 'MRN345678',
        healthPlan: 'Kaiser',
        primaryContact: 'Robert Wilson',
        contactPhone: '(555) 456-7890',
        contactEmail: 'robert@example.com',
        authStartDateT2038: '2023-08-01',
        authEndDateT2038: '2024-01-20',
        t2038Status: 'expired',
        h2022Status: 'none',
        t2038DaysRemaining: -10,
        needsAttention: true
      }
    ];
    
    setMembers(mockMembers);
    setIsLoading(false);
    
    toast({
      title: 'Demo Mode',
      description: 'Showing sample data. Authorization functions need to be deployed for live data.',
      variant: 'default'
    });
  };

  // Fetch ALL members with authorization data using API route with exact Caspio field names
  const fetchAuthorizationData = async () => {
    setIsLoading(true);
    try {
      console.log('🔍 Fetching ALL members with authorization data from Caspio...');
      
      // Use API route that gets ALL members with exact field names (with aggressive cache busting)
      const response = await fetch(`/api/authorization/all-members?t=${Date.now()}&refresh=true`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      console.log('API Response status:', response.status);
      if (!response.ok) {
        throw new Error(`API failed: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'API returned success: false');
      }
      
      const allMembers = data.members || [];
      console.log(`✅ Fetched ${allMembers.length} total members from Caspio`);
      
      // Transform to authorization format using exact field names
      const membersData = allMembers.map((member: any, index: number) => ({
        id: member.recordId || member.clientId2 || `member-${index}-${Date.now()}`,
        memberName: member.memberFirstName && member.memberLastName 
          ? `${member.memberFirstName} ${member.memberLastName}` 
          : 'Unknown Member',
        mrn: member.memberMediCalNum || member.memberMrn || '',
        healthPlan: member.memberHealthPlan || 'Unknown',
        kaiserStatus: member.kaiserStatus || '',
        calaimStatus: member.memberStatus || '',
        rcfeName: member.rcfeName || '',
        primaryContact: member.primaryContact || '',
        contactPhone: member.contactPhone || '',
        contactEmail: member.contactEmail || '',
        // Using exact Caspio field names you provided
        authStartDateT2038: member.authStartDateT2038,
        authEndDateT2038: member.authEndDateT2038,
        authStartDateH2022: member.authStartDateH2022,
        authEndDateH2022: member.authEndDateH2022,
        authExtRequestDateT2038: member.authExtRequestDateT2038,
        authExtRequestDateH2022: member.authExtRequestDateH2022,
      }));
      
      const processedMembers: AuthorizationMember[] = membersData.map((member: any) => {
        const t2038Status = getAuthStatus(member.authEndDateT2038);
        const h2022Status = getAuthStatus(member.authEndDateH2022);
        const t2038DaysRemaining = getDaysRemaining(member.authEndDateT2038);
        const h2022DaysRemaining = getDaysRemaining(member.authEndDateH2022);
        const hasCompleteH2022Dates = hasDateValue(member.authStartDateH2022) && hasDateValue(member.authEndDateH2022);
        const needsIlsDateRouting =
          isKaiserPlan(member.healthPlan) &&
          isKaiserTrackerStatus(member.kaiserStatus) &&
          !hasCompleteH2022Dates;

        const authorized = isAuthorizedCalaim(member.calaimStatus);
        const hasRcfePlacement = Boolean(String(member.rcfeName || '').trim());
        const kaiserCritical =
          isKaiserPlan(member.healthPlan) &&
          (isEndDateWithinDays(member.authEndDateH2022, 30) || isEndDateWithinDays(member.authEndDateT2038, 30));
        const healthNetCritical =
          isHealthNetPlan(member.healthPlan) &&
          (isEndDateWithinDays(member.authEndDateH2022, 14) || isEndDateWithinDays(member.authEndDateT2038, 14));
        const criticalRenewal = authorized && !hasRcfePlacement && (kaiserCritical || healthNetCritical);
        
        const needsAttention =
          t2038Status === 'expiring' ||
          t2038Status === 'expired' ||
          h2022Status === 'expiring' ||
          h2022Status === 'expired' ||
          criticalRenewal;
        
        return {
          ...member,
          t2038Status,
          h2022Status,
          t2038DaysRemaining,
          h2022DaysRemaining,
          criticalRenewal,
          hasCompleteH2022Dates,
          needsIlsDateRouting,
          needsAttention
        };
      });
      
      setMembers(processedMembers);
      setLastAuthorizationRefreshAt(new Date().toISOString());
      
      toast({
        title: "Success",
        description: `Loaded ${processedMembers.length} members with authorization data from Caspio (via Kaiser function)`,
        variant: "default"
      });
    } catch (error: any) {
      console.error('Error fetching authorization data:', error);
      
      toast({
        title: "Connection Error - Using Demo Data",
        description: `Error: ${error.message || 'Unknown error'}. Check console for details.`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      void fetchMembersCacheStatus();
    }
  };

  const fetchMembersCacheStatus = async () => {
    try {
      const response = await fetch('/api/caspio/members-cache/status', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) return;
      setMembersCacheStatus({
        ...((data?.settings || {}) as MembersCacheStatusSnapshot),
        webhook: (data?.webhook || {}) as MembersCacheStatusSnapshot['webhook'],
      });
    } catch {
      // best effort only
    }
  };

  useEffect(() => {
    void fetchMembersCacheStatus();
  }, []);

  // Removed auto-loading - data only loads when "Refresh Data" button is clicked

  // Handle summary card clicks for filtering
  const handleCardClick = (filterType: string) => {
    setSelectedFilter(filterType);
    setSelectedMonth('all'); // Reset month filter when using summary cards
    // Scroll to the members table
    setTimeout(() => {
      const tableElement = document.querySelector('[data-testid="members-table"]');
      if (tableElement) {
        tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Handle monthly expiration clicks for filtering
  const handleMonthClick = (monthName: string) => {
    setSelectedMonth(monthName);
    setSelectedFilter('all'); // Reset other filters when using month filter
    setSelectedPlanMetric('all');
    // Scroll to the members table
    setTimeout(() => {
      const tableElement = document.querySelector('[data-testid="members-table"]');
      if (tableElement) {
        tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Clear filters
  const clearFilters = () => {
    setSelectedFilter('all');
    setSelectedMonth('all');
    setSelectedPlanMetric('all');
    setSearchTerm('');
    setSelectedMCO('all');
    setSelectedStatus('all');
    setShowExpiringOnly(false);
  };

  const handleMcoMetricClick = (mcoFilter: string, metric: 'urgent' | 't2038Active' | 'h2022Active') => {
    setSelectedMCO(mcoFilter);
    setSelectedPlanMetric(metric);
    setSelectedFilter('all');
    setSelectedMonth('all');
    setSelectedStatus('all');
    setShowExpiringOnly(false);
    setTimeout(() => {
      const tableElement = document.querySelector('[data-testid="members-table"]');
      if (tableElement) {
        tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const authorizationScopedMembers = useMemo(
    () =>
      members.filter((member) => {
        if (!isKaiserPlan(member.healthPlan)) return true;
        return isKaiserTrackerStatus(member.kaiserStatus) && Boolean(member.hasCompleteH2022Dates);
      }),
    [members]
  );

  const kaiserNeedsIlsRoutingMembers = useMemo(
    () => members.filter((member) => Boolean(member.needsIlsDateRouting)),
    [members]
  );

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Get sort icon for column headers
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4 text-primary" /> : 
      <ArrowDown className="h-4 w-4 text-primary" />;
  };

  // Filter and sort members
  const filteredAndSortedMembers = useMemo(() => {
    // First filter
    const filtered = authorizationScopedMembers.filter(member => {
      const matchesSearch = searchTerm === '' || 
        member.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.mrn.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMCO = selectedMCO === 'all' || 
        member.healthPlan === selectedMCO ||
        member.healthPlan?.toLowerCase().includes(selectedMCO.toLowerCase());
      
      const matchesStatus = selectedStatus === 'all' || 
        member.t2038Status === selectedStatus || 
        member.h2022Status === selectedStatus;
      
      const matchesExpiring = !showExpiringOnly || member.needsAttention;

      const matchesPlanMetric =
        selectedPlanMetric === 'all' ||
        (selectedPlanMetric === 'urgent' && member.needsAttention) ||
        (selectedPlanMetric === 't2038Active' && member.t2038Status === 'active') ||
        (selectedPlanMetric === 'h2022Active' && member.h2022Status === 'active');
      
      // Card-based filtering
      const matchesCardFilter = selectedFilter === 'all' || 
        (selectedFilter === 'needsAttention' && member.needsAttention) ||
        (selectedFilter === 't2038Expiring' && member.t2038Status === 'expiring') ||
        (selectedFilter === 'h2022Expiring' && member.h2022Status === 'expiring') ||
        (selectedFilter === 'criticalRenewal' && member.criticalRenewal) ||
        (selectedFilter === 'expired' && (member.t2038Status === 'expired' || member.h2022Status === 'expired'));
      
      // Month-based filtering
      const matchesMonthFilter = selectedMonth === 'all' || (() => {
        if (!selectedMonth) return true;
        
        // Parse the selected month (e.g., "Jan 2024")
        const [monthName, year] = selectedMonth.split(' ');
        const monthDate = new Date(`${monthName} 1, ${year}`);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        
        // Check if either T2038 or H2022 expires in this month
        const t2038ExpiresInMonth = member.authEndDateT2038 && (() => {
          try {
            const endDate = parseISO(member.authEndDateT2038);
            return isWithinInterval(endDate, { start: monthStart, end: monthEnd });
          } catch {
            return false;
          }
        })();
        
        const h2022ExpiresInMonth = member.authEndDateH2022 && (() => {
          try {
            const endDate = parseISO(member.authEndDateH2022);
            return isWithinInterval(endDate, { start: monthStart, end: monthEnd });
          } catch {
            return false;
          }
        })();
        
        return t2038ExpiresInMonth || h2022ExpiresInMonth;
      })();
      
      return matchesSearch && matchesMCO && matchesStatus && matchesExpiring && matchesCardFilter && matchesMonthFilter && matchesPlanMetric;
    });

    // Then sort
    return filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'memberName':
          aValue = a.memberName.toLowerCase();
          bValue = b.memberName.toLowerCase();
          break;
        case 'healthPlan':
          aValue = a.healthPlan.toLowerCase();
          bValue = b.healthPlan.toLowerCase();
          break;
        case 't2038EndDate':
          aValue = a.authEndDateT2038 ? new Date(a.authEndDateT2038).getTime() : 0;
          bValue = b.authEndDateT2038 ? new Date(b.authEndDateT2038).getTime() : 0;
          break;
        case 'h2022EndDate':
          aValue = a.authEndDateH2022 ? new Date(a.authEndDateH2022).getTime() : 0;
          bValue = b.authEndDateH2022 ? new Date(b.authEndDateH2022).getTime() : 0;
          break;
        case 't2038Status':
          const t2038Order = { 'expired': 0, 'expiring': 1, 'active': 2, 'pending': 3, 'none': 4 };
          aValue = t2038Order[a.t2038Status as keyof typeof t2038Order] || 5;
          bValue = t2038Order[b.t2038Status as keyof typeof t2038Order] || 5;
          break;
        case 'h2022Status':
          const h2022Order = { 'expired': 0, 'expiring': 1, 'active': 2, 'pending': 3, 'none': 4 };
          aValue = h2022Order[a.h2022Status as keyof typeof h2022Order] || 5;
          bValue = h2022Order[b.h2022Status as keyof typeof h2022Order] || 5;
          break;
        case 'needsAttention':
          aValue = a.needsAttention ? 0 : 1;
          bValue = b.needsAttention ? 0 : 1;
          break;
        default:
          aValue = a.memberName.toLowerCase();
          bValue = b.memberName.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [authorizationScopedMembers, searchTerm, selectedMCO, selectedStatus, showExpiringOnly, selectedFilter, selectedMonth, selectedPlanMetric, sortColumn, sortDirection]);

  // Summary stats and monthly expiration data
  const stats = useMemo(() => {
    const total = authorizationScopedMembers.length;
    const kaiserCount = authorizationScopedMembers.filter(m => String(m.healthPlan || '').toLowerCase().includes('kaiser')).length;
    const healthNetCount = authorizationScopedMembers.filter(m => String(m.healthPlan || '').toLowerCase().includes('health net')).length;
    const needingAttention = authorizationScopedMembers.filter(m => m.needsAttention).length;
    const t2038Expiring = authorizationScopedMembers.filter(m => m.t2038Status === 'expiring').length;
    const h2022Expiring = authorizationScopedMembers.filter(m => m.h2022Status === 'expiring').length;
    const expired = authorizationScopedMembers.filter(m => m.t2038Status === 'expired' || m.h2022Status === 'expired').length;
    const criticalRenewals = authorizationScopedMembers.filter(m => m.criticalRenewal).length;
    
    // Calculate monthly expiration data for next 6 months
    const today = new Date();
    const monthlyExpirations = [];
    
    for (let i = 0; i < 6; i++) {
      const monthStart = startOfMonth(addDays(today, i * 30));
      const monthEnd = endOfMonth(addDays(today, i * 30));
      const monthName = format(monthStart, 'MMM yyyy');

      const expiresInMonth = (member: AuthorizationMember) => {
        const t2038ExpiresInMonth = member.authEndDateT2038 && (() => {
          try {
            const endDate = parseISO(member.authEndDateT2038);
            return isWithinInterval(endDate, { start: monthStart, end: monthEnd });
          } catch {
            return false;
          }
        })();
        const h2022ExpiresInMonth = member.authEndDateH2022 && (() => {
          try {
            const endDate = parseISO(member.authEndDateH2022);
            return isWithinInterval(endDate, { start: monthStart, end: monthEnd });
          } catch {
            return false;
          }
        })();
        return t2038ExpiresInMonth || h2022ExpiresInMonth;
      };

      const kaiserExpirations = authorizationScopedMembers.filter(
        (member) => isKaiserPlan(member.healthPlan) && expiresInMonth(member)
      ).length;
      const healthNetExpirations = authorizationScopedMembers.filter(
        (member) => isHealthNetPlan(member.healthPlan) && expiresInMonth(member)
      ).length;

      monthlyExpirations.push({
        month: monthName,
        kaiser: kaiserExpirations,
        healthNet: healthNetExpirations,
        total: kaiserExpirations + healthNetExpirations
      });
    }
    
    // MCO breakdown
    const mcoBreakdown = authorizationScopedMembers.reduce((acc, member) => {
      const mco = normalizePlanForDisplay(member.healthPlan);
      const filterValue = normalizePlanForFilter(member.healthPlan);
      if (!acc[mco]) {
        acc[mco] = { total: 0, needsAttention: 0, t2038Active: 0, h2022Active: 0, filterValue };
      }
      acc[mco].total++;
      if (member.needsAttention) acc[mco].needsAttention++;
      if (member.t2038Status === 'active') acc[mco].t2038Active++;
      if (member.h2022Status === 'active') acc[mco].h2022Active++;
      return acc;
    }, {} as Record<string, { total: number; needsAttention: number; t2038Active: number; h2022Active: number; filterValue: string }>);
    
    
    return { 
      total, 
      kaiserCount,
      healthNetCount,
      needingAttention, 
      t2038Expiring, 
      h2022Expiring, 
      criticalRenewals,
      expired, 
      monthlyExpirations,
      mcoBreakdown
    };
  }, [authorizationScopedMembers]);

  const getStatusBadge = (status: string, daysRemaining?: number) => {
    switch (status) {
      case 'active':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Active ({daysRemaining}d)</Badge>;
      case 'expiring':
        return <Badge variant="destructive" className="bg-orange-100 text-orange-800">Expiring ({daysRemaining}d)</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">None</Badge>;
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Authorization Tracker</h1>
          <p className="text-muted-foreground">Track T2038 and H2022 authorization dates and renewals</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={fetchAuthorizationData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Health Plan Filter</p>
              <p className="text-xs text-muted-foreground">Quickly switch between Kaiser and Health Net members</p>
            </div>
            <Select value={selectedMCO} onValueChange={setSelectedMCO}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Select health plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health Plans</SelectItem>
                <SelectItem value="kaiser">Kaiser</SelectItem>
                <SelectItem value="health net">Health Net</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Authorization data last refreshed</div>
              <div className="font-medium">{lastAuthorizationRefreshAt ? formatDateTimeSafe(lastAuthorizationRefreshAt) : 'Not refreshed yet'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Members cache last sync</div>
              <div className="font-medium">{membersCacheStatus?.lastSyncAt ? formatDateTimeSafe(membersCacheStatus.lastSyncAt) : 'Not available'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Last webhook event received</div>
              <div className="font-medium">
                {membersCacheStatus?.webhook?.latestEventReceivedAt
                  ? `${formatDateTimeSafe(membersCacheStatus.webhook.latestEventReceivedAt)} (${membersCacheStatus?.webhook?.latestEventOperation || 'event'})`
                  : 'Not available'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Last webhook processed</div>
              <div className="font-medium">
                {membersCacheStatus?.webhook?.latestProcessedAt
                  ? `${formatDateTimeSafe(membersCacheStatus.webhook.latestProcessedAt)} (${membersCacheStatus?.webhook?.latestProcessedSuccess === false ? 'failed' : 'success'})`
                  : 'Not available'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Always show the interface structure */}
      <>
      {stats.criticalRenewals > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5" />
              <div>
                <div className="font-semibold text-red-800">
                  Critical: {stats.criticalRenewals} member{stats.criticalRenewals === 1 ? '' : 's'} need authorization renewal review
                </div>
                <div className="text-sm text-red-700">
                  Includes authorized members only, without RCFE placement: Health Net expiring within 14 days, Kaiser
                  H2022/T2038 expiring within 30 days.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  setSelectedMCO('all');
                  handleCardClick('criticalRenewal');
                }}
              >
                View Members
              </Button>
              <Button
                variant="outline"
                className="border-red-200 text-red-800 hover:bg-red-100"
                onClick={() => handleCardClick('criticalRenewal')}
              >
                Filter Only
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {kaiserNeedsIlsRoutingMembers.length > 0 && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-700 mt-0.5" />
              <div>
                <div className="font-semibold text-blue-800">
                  Kaiser members missing H2022 dates: {kaiserNeedsIlsRoutingMembers.length}
                </div>
                <div className="text-sm text-blue-700">
                  These members are in Kaiser status "Final- Member at RCFE" or "R &amp; B Sent Pending ILS Contract"
                  but are missing H2022 start/end dates and should be tracked in ILS Pending Tracker.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-blue-300 text-blue-800 hover:bg-blue-100"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/admin/ils-report-editor';
                  }
                }}
              >
                Open ILS Pending Tracker
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <Card className={`cursor-pointer transition-all hover:shadow-md ${selectedFilter === 'all' ? 'ring-2 ring-blue-500' : ''}`} 
              onClick={() => handleCardClick('all')}>
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`cursor-pointer transition-all hover:shadow-md ${selectedFilter === 'needsAttention' ? 'ring-2 ring-red-500' : ''}`} 
              onClick={() => handleCardClick('needsAttention')}>
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Need Attention</p>
              <p className="text-2xl font-bold text-red-600">{stats.needingAttention}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`cursor-pointer transition-all hover:shadow-md ${selectedFilter === 't2038Expiring' ? 'ring-2 ring-orange-500' : ''}`} 
              onClick={() => handleCardClick('t2038Expiring')}>
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">T2038 Expiring</p>
              <p className="text-2xl font-bold text-orange-600">{stats.t2038Expiring}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`cursor-pointer transition-all hover:shadow-md ${selectedFilter === 'h2022Expiring' ? 'ring-2 ring-purple-500' : ''}`} 
              onClick={() => handleCardClick('h2022Expiring')}>
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">H2022 Expiring</p>
              <p className="text-2xl font-bold text-purple-600">{stats.h2022Expiring}</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${selectedFilter === 'criticalRenewal' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => handleCardClick('criticalRenewal')}
        >
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Critical Renewals</p>
              <p className="text-2xl font-bold text-red-600">{stats.criticalRenewals}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`cursor-pointer transition-all hover:shadow-md ${selectedFilter === 'expired' ? 'ring-2 ring-red-500' : ''}`} 
              onClick={() => handleCardClick('expired')}>
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Expired</p>
              <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Expiration Trends */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Authorization Expirations by Month
            <span className="text-sm font-normal text-muted-foreground ml-2">(Click to filter)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.monthlyExpirations.map((month, index) => (
              <div 
                key={month.month} 
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/70 ${
                  selectedMonth === month.month ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/50'
                }`}
                onClick={() => handleMonthClick(month.month)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    index === 0 ? 'bg-red-500' : 
                    index === 1 ? 'bg-orange-500' : 
                    'bg-blue-500'
                  }`} />
                  <span className="font-medium">{month.month}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Kaiser</div>
                    <div className="font-semibold text-blue-600">{month.kaiser}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Health Net</div>
                    <div className="font-semibold text-purple-600">{month.healthNet}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Total</div>
                    <div className={`font-bold ${
                      month.total > 10 ? 'text-red-600' : 
                      month.total > 5 ? 'text-orange-600' : 
                      'text-green-600'
                    }`}>{month.total}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Additional Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* MCO Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Authorization Status by Health Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.mcoBreakdown)
                .sort(([,a], [,b]) => b.total - a.total)
                .map(([mco, data]) => (
                <div key={mco} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{mco}</div>
                    <div className="text-sm text-muted-foreground">
                      {data.total} members
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Urgent</div>
                      <button
                        type="button"
                        className={`font-semibold hover:underline ${
                          data.needsAttention > 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                        onClick={() => handleMcoMetricClick(data.filterValue, 'urgent')}
                        title={`Show ${mco} members with urgent items`}
                      >
                        {data.needsAttention}
                      </button>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">T2038</div>
                      <button
                        type="button"
                        className="font-semibold text-blue-600 hover:underline"
                        onClick={() => handleMcoMetricClick(data.filterValue, 't2038Active')}
                        title={`Show ${mco} members with active T2038`}
                      >
                        {data.t2038Active}
                      </button>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">H2022</div>
                      <button
                        type="button"
                        className="font-semibold text-purple-600 hover:underline"
                        onClick={() => handleMcoMetricClick(data.filterValue, 'h2022Active')}
                        title={`Show ${mco} members with active H2022`}
                      >
                        {data.h2022Active}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by member name or MRN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring">Expiring</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="none">No Auth</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant={showExpiringOnly ? "default" : "outline"}
              onClick={() => setShowExpiringOnly(!showExpiringOnly)}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Expiring Only
            </Button>
            
            {(selectedFilter !== 'all' || selectedMonth !== 'all' || selectedPlanMetric !== 'all') && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Filtered by: <span className="font-medium">
                    {selectedFilter === 'needsAttention' && 'Need Attention'}
                    {selectedFilter === 't2038Expiring' && 'T2038 Expiring'}
                    {selectedFilter === 'h2022Expiring' && 'H2022 Expiring'}
                    {selectedFilter === 'criticalRenewal' && 'Critical Renewals'}
                    {selectedFilter === 'expired' && 'Expired'}
                    {selectedMonth !== 'all' && `Expiring in ${selectedMonth}`}
                    {selectedPlanMetric === 'urgent' && (selectedFilter !== 'all' || selectedMonth !== 'all') ? ' • ' : ''}
                    {selectedPlanMetric === 'urgent' && 'Urgent (by health plan)'}
                    {selectedPlanMetric === 't2038Active' && (selectedFilter !== 'all' || selectedMonth !== 'all') ? ' • ' : ''}
                    {selectedPlanMetric === 't2038Active' && 'T2038 Active (by health plan)'}
                    {selectedPlanMetric === 'h2022Active' && (selectedFilter !== 'all' || selectedMonth !== 'all') ? ' • ' : ''}
                    {selectedPlanMetric === 'h2022Active' && 'H2022 Active (by health plan)'}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </div>
            )}
            
            <Button
              variant="outline"
              onClick={() => {
                setSortColumn('needsAttention');
                setSortDirection('asc');
              }}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Sort by Priority
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setSelectedMCO('all');
                setSelectedStatus('all');
                setShowExpiringOnly(false);
                setSelectedPlanMetric('all');
                setSortColumn('memberName');
                setSortDirection('asc');
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

          {/* Authorization Table */}
          <Card>
        <CardHeader>
          <CardTitle>Authorization Status ({filteredAndSortedMembers.length} members)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading authorization data...</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <Table data-testid="members-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort('memberName')}
                        >
                          <div className="flex items-center gap-2">
                            Member
                            {getSortIcon('memberName')}
                          </div>
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort('healthPlan')}
                        >
                          <div className="flex items-center gap-2">
                            Health Plan
                            {getSortIcon('healthPlan')}
                          </div>
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort('t2038Status')}
                        >
                          <div className="flex items-center gap-2">
                            T2038 Status
                            {getSortIcon('t2038Status')}
                          </div>
                        </Button>
                      </TableHead>
                      <TableHead>T2038 Start Date</TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort('t2038EndDate')}
                        >
                          <div className="flex items-center gap-2">
                            T2038 End Date
                            {getSortIcon('t2038EndDate')}
                          </div>
                        </Button>
                      </TableHead>
                      <TableHead>T2038 Request Date</TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort('h2022Status')}
                        >
                          <div className="flex items-center gap-2">
                            H2022 Status
                            {getSortIcon('h2022Status')}
                          </div>
                        </Button>
                      </TableHead>
                      <TableHead>H2022 Start Date</TableHead>
                      <TableHead>
                        <Button 
                          variant="ghost" 
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort('h2022EndDate')}
                        >
                          <div className="flex items-center gap-2">
                            H2022 End Date
                            {getSortIcon('h2022EndDate')}
                          </div>
                        </Button>
                      </TableHead>
                      <TableHead>H2022 Request Date</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          {authorizationScopedMembers.length === 0 ? (
                            <div className="text-muted-foreground">
                              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="font-medium">No Authorization Data Loaded</p>
                              <p className="text-sm">Click 'Refresh Data' to load authorization data from Caspio</p>
                            </div>
                          ) : (
                            <div className="text-muted-foreground">
                              <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="font-medium">No Members Match Current Filters</p>
                              <p className="text-sm">Try adjusting your search criteria or clear filters</p>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAndSortedMembers.map((member) => (
                      <TableRow
                        key={member.id}
                        className={
                          member.criticalRenewal ? 'bg-red-100' : member.needsAttention ? 'bg-red-50' : ''
                        }
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{member.memberName}</p>
                            <p className="text-sm text-muted-foreground">MRN: {member.mrn}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getHealthPlanBadgeClass(member.healthPlan)}>
                            {member.healthPlan}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(member.t2038Status, member.t2038DaysRemaining)}
                        </TableCell>
                        <TableCell>
                          {member.authStartDateT2038 ? (
                            <div className="text-sm">
                              {(() => {
                                try {
                                  const date = parseISO(member.authStartDateT2038);
                                  return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
                                } catch {
                                  return '-';
                                }
                              })()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.authEndDateT2038 ? (
                            <div className="text-sm">
                              {(() => {
                                try {
                                  const date = parseISO(member.authEndDateT2038);
                                  return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
                                } catch {
                                  return '-';
                                }
                              })()}
                              {member.authExtRequestDateT2038 && (
                                <p className="text-xs text-muted-foreground">
                                  Ext Req: {(() => {
                                    try {
                                      const date = parseISO(member.authExtRequestDateT2038);
                                      return isNaN(date.getTime()) ? '-' : format(date, 'MMM d');
                                    } catch {
                                      return '-';
                                    }
                                  })()}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.authExtRequestDateT2038 ? (
                            <div className="text-sm">
                              {(() => {
                                try {
                                  const date = parseISO(member.authExtRequestDateT2038);
                                  return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
                                } catch {
                                  return '-';
                                }
                              })()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(member.h2022Status, member.h2022DaysRemaining)}
                            {member.criticalRenewal && (
                              <Badge variant="destructive" className="w-fit bg-red-600">
                                Critical
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {member.authStartDateH2022 ? (
                            <div className="text-sm">
                              {(() => {
                                try {
                                  const date = parseISO(member.authStartDateH2022);
                                  return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
                                } catch {
                                  return '-';
                                }
                              })()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.authEndDateH2022 ? (
                            <div className="text-sm">
                              {(() => {
                                try {
                                  const date = parseISO(member.authEndDateH2022);
                                  return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
                                } catch {
                                  return '-';
                                }
                              })()}
                              {member.authExtRequestDateH2022 && (
                                <p className="text-xs text-muted-foreground">
                                  Ext Req: {(() => {
                                    try {
                                      const date = parseISO(member.authExtRequestDateH2022);
                                      return isNaN(date.getTime()) ? '-' : format(date, 'MMM d');
                                    } catch {
                                      return '-';
                                    }
                                  })()}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.authExtRequestDateH2022 ? (
                            <div className="text-sm">
                              {(() => {
                                try {
                                  const date = parseISO(member.authExtRequestDateH2022);
                                  return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy');
                                } catch {
                                  return '-';
                                }
                              })()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{member.primaryContact}</p>
                            {member.contactPhone && (
                              <p className="text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {member.contactPhone}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <UpdateAuthorizationDialog 
                            member={member} 
                            onUpdate={fetchAuthorizationData}
                          />
                        </TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </div>
              <div className="lg:hidden space-y-3">
                {filteredAndSortedMembers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {authorizationScopedMembers.length === 0 ? (
                      <>
                        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No Authorization Data Loaded</p>
                        <p className="text-sm">Click 'Refresh Data' to load authorization data from Caspio</p>
                      </>
                    ) : (
                      <>
                        <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No Members Match Current Filters</p>
                        <p className="text-sm">Try adjusting your search criteria or clear filters</p>
                      </>
                    )}
                  </div>
                ) : (
                  filteredAndSortedMembers.map((member) => (
                    <Card
                      key={member.id}
                      className={
                        member.criticalRenewal
                          ? 'border-l-4 border-l-red-700 bg-red-50/50'
                          : member.needsAttention
                            ? 'border-l-4 border-l-red-500'
                            : ''
                      }
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{member.memberName}</div>
                          <Badge variant="outline" className={getHealthPlanBadgeClass(member.healthPlan)}>
                            {member.healthPlan}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">MRN: {member.mrn}</div>
                        <div className="grid gap-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">T2038:</span>
                            {getStatusBadge(member.t2038Status, member.t2038DaysRemaining)}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">H2022:</span>
                            {getStatusBadge(member.h2022Status, member.h2022DaysRemaining)}
                            {member.criticalRenewal && (
                              <Badge variant="destructive" className="bg-red-600">
                                Critical
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">T2038 End:</span>{' '}
                            {formatDateSafe(member.authEndDateT2038)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">H2022 End:</span>{' '}
                            {formatDateSafe(member.authEndDateH2022)}
                          </div>
                        </div>
                        <div className="text-sm">
                          <div className="font-medium">{member.primaryContact}</div>
                          {member.contactPhone && (
                            <div className="text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {member.contactPhone}
                            </div>
                          )}
                        </div>
                        <div>
                          <UpdateAuthorizationDialog 
                            member={member} 
                            onUpdate={fetchAuthorizationData}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </>
    </div>
  );
}