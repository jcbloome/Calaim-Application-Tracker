'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/useAdmin';
import { useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { format, parseISO, differenceInDays, addDays, isBefore, isAfter } from 'date-fns';
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
  X
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { AuthorizationRulesDashboard } from '@/components/AuthorizationRulesDashboard';

interface AuthorizationMember {
  id: string;
  memberName: string;
  mrn: string;
  healthPlan: string;
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
  needsAttention: boolean;
}

const getAuthStatus = (endDate?: string): 'active' | 'expiring' | 'expired' | 'pending' | 'none' => {
  if (!endDate) return 'none';
  
  const end = parseISO(endDate);
  const today = new Date();
  const daysRemaining = differenceInDays(end, today);
  
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 14) return 'expiring';
  return 'active';
};

const getDaysRemaining = (endDate?: string): number | undefined => {
  if (!endDate) return undefined;
  return differenceInDays(parseISO(endDate), new Date());
};

export default function AuthorizationTracker() {
  const { user, isAdmin } = useAdmin();
  const { toast } = useToast();
  const functions = useFunctions();
  
  const [members, setMembers] = useState<AuthorizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMCO, setSelectedMCO] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);

  // Fetch authorization data
  const fetchAuthorizationData = async () => {
    if (!functions) return;
    
    setIsLoading(true);
    try {
      const fetchMembers = httpsCallable(functions, 'fetchAuthorizationMembers');
      const result = await fetchMembers();
      const membersData = result.data as any[];
      
      const processedMembers: AuthorizationMember[] = membersData.map(member => {
        const t2038Status = getAuthStatus(member.authEndDateT2038);
        const h2022Status = getAuthStatus(member.authEndDateH2022);
        const t2038DaysRemaining = getDaysRemaining(member.authEndDateT2038);
        const h2022DaysRemaining = getDaysRemaining(member.authEndDateH2022);
        
        const needsAttention = t2038Status === 'expiring' || t2038Status === 'expired' ||
                              h2022Status === 'expiring' || h2022Status === 'expired';
        
        return {
          ...member,
          t2038Status,
          h2022Status,
          t2038DaysRemaining,
          h2022DaysRemaining,
          needsAttention
        };
      });
      
      setMembers(processedMembers);
    } catch (error) {
      console.error('Error fetching authorization data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch authorization data.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthorizationData();
  }, [functions]);

  // Filter members
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      const matchesSearch = searchTerm === '' || 
        member.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.mrn.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMCO = selectedMCO === 'all' || member.healthPlan === selectedMCO;
      
      const matchesStatus = selectedStatus === 'all' || 
        member.t2038Status === selectedStatus || 
        member.h2022Status === selectedStatus;
      
      const matchesExpiring = !showExpiringOnly || member.needsAttention;
      
      return matchesSearch && matchesMCO && matchesStatus && matchesExpiring;
    });
  }, [members, searchTerm, selectedMCO, selectedStatus, showExpiringOnly]);

  // Summary stats
  const stats = useMemo(() => {
    const total = members.length;
    const needingAttention = members.filter(m => m.needsAttention).length;
    const t2038Expiring = members.filter(m => m.t2038Status === 'expiring').length;
    const h2022Expiring = members.filter(m => m.h2022Status === 'expiring').length;
    const expired = members.filter(m => m.t2038Status === 'expired' || m.h2022Status === 'expired').length;
    
    return { total, needingAttention, t2038Expiring, h2022Expiring, expired };
  }, [members]);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Authorization Tracker</h1>
          <p className="text-muted-foreground">Track T2038 and H2022 authorization dates and renewals</p>
        </div>
        <Button onClick={fetchAuthorizationData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Need Attention</p>
                <p className="text-2xl font-bold text-red-600">{stats.needingAttention}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">T2038 Expiring</p>
                <p className="text-2xl font-bold text-orange-600">{stats.t2038Expiring}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">H2022 Expiring</p>
                <p className="text-2xl font-bold text-purple-600">{stats.h2022Expiring}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
              </div>
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
            
            <Select value={selectedMCO} onValueChange={setSelectedMCO}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Health Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health Plans</SelectItem>
                <SelectItem value="Kaiser Permanente">Kaiser</SelectItem>
                <SelectItem value="Health Net">Health Net</SelectItem>
              </SelectContent>
            </Select>
            
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
          </div>
        </CardContent>
      </Card>

      {/* Authorization Rules Dashboard */}
      <Tabs defaultValue="tracker" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tracker">Authorization Tracker</TabsTrigger>
          <TabsTrigger value="rules">MCO Rules & Guidelines</TabsTrigger>
        </TabsList>
        
        <TabsContent value="tracker">
          {/* Authorization Table */}
          <Card>
        <CardHeader>
          <CardTitle>Authorization Status ({filteredMembers.length} members)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading authorization data...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No Authorization Data"
              description="No members found matching your current filters."
              actionLabel="Clear Filters"
              actionOnClick={() => {
                setSearchTerm('');
                setSelectedMCO('all');
                setSelectedStatus('all');
                setShowExpiringOnly(false);
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Health Plan</TableHead>
                    <TableHead>T2038 Status</TableHead>
                    <TableHead>T2038 End Date</TableHead>
                    <TableHead>H2022 Status</TableHead>
                    <TableHead>H2022 End Date</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => (
                    <TableRow key={member.id} className={member.needsAttention ? 'bg-red-50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{member.memberName}</p>
                          <p className="text-sm text-muted-foreground">MRN: {member.mrn}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.healthPlan}</Badge>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(member.t2038Status, member.t2038DaysRemaining)}
                      </TableCell>
                      <TableCell>
                        {member.authEndDateT2038 ? (
                          <div className="text-sm">
                            {format(parseISO(member.authEndDateT2038), 'MMM d, yyyy')}
                            {member.authExtRequestDateT2038 && (
                              <p className="text-xs text-muted-foreground">
                                Ext Req: {format(parseISO(member.authExtRequestDateT2038), 'MMM d')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(member.h2022Status, member.h2022DaysRemaining)}
                      </TableCell>
                      <TableCell>
                        {member.authEndDateH2022 ? (
                          <div className="text-sm">
                            {format(parseISO(member.authEndDateH2022), 'MMM d, yyyy')}
                            {member.authExtRequestDateH2022 && (
                              <p className="text-xs text-muted-foreground">
                                Ext Req: {format(parseISO(member.authExtRequestDateH2022), 'MMM d')}
                              </p>
                            )}
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
                        <Button variant="outline" size="sm">
                          Update Auth
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
        
        <TabsContent value="rules">
          <AuthorizationRulesDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}