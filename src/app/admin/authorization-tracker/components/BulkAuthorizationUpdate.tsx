'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { format, addMonths } from 'date-fns';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  Building, 
  Save,
  AlertTriangle,
  CheckCircle,
  Filter
} from 'lucide-react';

interface AuthorizationMember {
  id: string;
  memberName: string;
  mrn: string;
  healthPlan: string;
  authStartDateT2038?: string;
  authEndDateT2038?: string;
  authStartDateH2022?: string;
  authEndDateH2022?: string;
  t2038Status: string;
  h2022Status: string;
  needsAttention: boolean;
}

interface BulkAuthorizationUpdateProps {
  members: AuthorizationMember[];
  onUpdate: () => void;
}

export function BulkAuthorizationUpdate({ members, onUpdate }: BulkAuthorizationUpdateProps) {
  const { toast } = useToast();
  const functions = useFunctions();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [filterCriteria, setFilterCriteria] = useState({
    healthPlan: 'all',
    authStatus: 'all',
    needsAttention: false
  });
  
  const [bulkAuthData, setBulkAuthData] = useState({
    authStartDateT2038: '',
    authEndDateT2038: '',
    authStartDateH2022: '',
    authEndDateH2022: '',
    updateType: 'missing-only' // 'missing-only' or 'overwrite-all'
  });

  // Filter members based on criteria
  const filteredMembers = members.filter(member => {
    const matchesHealthPlan = filterCriteria.healthPlan === 'all' || 
      member.healthPlan?.toLowerCase().includes(filterCriteria.healthPlan.toLowerCase());
    
    const matchesAuthStatus = filterCriteria.authStatus === 'all' ||
      (filterCriteria.authStatus === 'no-auth' && member.t2038Status === 'none' && member.h2022Status === 'none') ||
      (filterCriteria.authStatus === 'missing-t2038' && member.t2038Status === 'none') ||
      (filterCriteria.authStatus === 'missing-h2022' && member.h2022Status === 'none') ||
      (filterCriteria.authStatus === 'expiring' && member.needsAttention);
    
    const matchesAttention = !filterCriteria.needsAttention || member.needsAttention;
    
    return matchesHealthPlan && matchesAuthStatus && matchesAttention;
  });

  // Auto-calculate end dates based on start dates
  const handleStartDateChange = (field: string, value: string) => {
    setBulkAuthData(prev => {
      const updated = { ...prev, [field]: value };
      
      if (value) {
        const startDate = new Date(value);
        
        if (field === 'authStartDateT2038') {
          // For bulk updates, assume 6 months for most MCOs
          updated.authEndDateT2038 = format(addMonths(startDate, 6), 'yyyy-MM-dd');
        }
        
        if (field === 'authStartDateH2022') {
          // H2022 is typically 6 months for all MCOs
          updated.authEndDateH2022 = format(addMonths(startDate, 6), 'yyyy-MM-dd');
        }
      }
      
      return updated;
    });
  };

  // Quick presets for common scenarios
  const applyPreset = (preset: string) => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    
    switch (preset) {
      case 'new-members-both':
        setBulkAuthData(prev => ({
          ...prev,
          authStartDateT2038: todayStr,
          authEndDateT2038: format(addMonths(today, 6), 'yyyy-MM-dd'),
          authStartDateH2022: todayStr,
          authEndDateH2022: format(addMonths(today, 6), 'yyyy-MM-dd'),
        }));
        break;
      case 't2038-only':
        setBulkAuthData(prev => ({
          ...prev,
          authStartDateT2038: todayStr,
          authEndDateT2038: format(addMonths(today, 6), 'yyyy-MM-dd'),
          authStartDateH2022: '',
          authEndDateH2022: '',
        }));
        break;
      case 'h2022-only':
        setBulkAuthData(prev => ({
          ...prev,
          authStartDateT2038: '',
          authEndDateT2038: '',
          authStartDateH2022: todayStr,
          authEndDateH2022: format(addMonths(today, 6), 'yyyy-MM-dd'),
        }));
        break;
    }
  };

  const handleMemberToggle = (memberId: string, checked: boolean) => {
    setSelectedMembers(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(memberId);
      } else {
        newSet.delete(memberId);
      }
      return newSet;
    });
  };

  const selectAllFiltered = () => {
    setSelectedMembers(new Set(filteredMembers.map(m => m.id)));
  };

  const clearSelection = () => {
    setSelectedMembers(new Set());
  };

  const handleBulkUpdate = async () => {
    if (!functions || selectedMembers.size === 0) return;
    
    setIsSaving(true);
    try {
      const updateAuth = httpsCallable(functions, 'updateMemberAuthorization');
      const updates = [];
      
      for (const memberId of selectedMembers) {
        const member = members.find(m => m.id === memberId);
        if (!member) continue;
        
        // Prepare authorization data based on update type
        const authData: any = {};
        
        if (bulkAuthData.updateType === 'missing-only') {
          // Only update fields that are currently empty/null
          if (!member.authStartDateT2038 && bulkAuthData.authStartDateT2038) {
            authData.Authorization_Start_Date_T2038 = bulkAuthData.authStartDateT2038;
          }
          if (!member.authEndDateT2038 && bulkAuthData.authEndDateT2038) {
            authData.Authorization_End_Date_T2038 = bulkAuthData.authEndDateT2038;
          }
          if (!member.authStartDateH2022 && bulkAuthData.authStartDateH2022) {
            authData.Authorization_Start_Date_H2022 = bulkAuthData.authStartDateH2022;
          }
          if (!member.authEndDateH2022 && bulkAuthData.authEndDateH2022) {
            authData.Authorization_End_Date_H2022 = bulkAuthData.authEndDateH2022;
          }
        } else {
          // Overwrite all specified fields
          if (bulkAuthData.authStartDateT2038) {
            authData.Authorization_Start_Date_T2038 = bulkAuthData.authStartDateT2038;
          }
          if (bulkAuthData.authEndDateT2038) {
            authData.Authorization_End_Date_T2038 = bulkAuthData.authEndDateT2038;
          }
          if (bulkAuthData.authStartDateH2022) {
            authData.Authorization_Start_Date_H2022 = bulkAuthData.authStartDateH2022;
          }
          if (bulkAuthData.authEndDateH2022) {
            authData.Authorization_End_Date_H2022 = bulkAuthData.authEndDateH2022;
          }
        }
        
        if (Object.keys(authData).length > 0) {
          updates.push(updateAuth({
            memberId,
            authorizationData: authData
          }));
        }
      }
      
      await Promise.all(updates);
      
      toast({
        title: 'Bulk Update Complete',
        description: `Successfully updated authorization dates for ${updates.length} members`,
        className: 'bg-green-100 text-green-900 border-green-200'
      });
      
      setIsOpen(false);
      setSelectedMembers(new Set());
      onUpdate();
      
    } catch (error) {
      console.error('Error updating authorizations:', error);
      toast({
        variant: 'destructive',
        title: 'Bulk Update Failed',
        description: 'Some updates may have failed. Please check individual records.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Bulk Update Authorizations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Authorization Update
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Filter Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Health Plan</Label>
                  <Select 
                    value={filterCriteria.healthPlan} 
                    onValueChange={(value) => setFilterCriteria(prev => ({ ...prev, healthPlan: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Health Plans</SelectItem>
                      <SelectItem value="kaiser">Kaiser</SelectItem>
                      <SelectItem value="health net">Health Net</SelectItem>
                      <SelectItem value="molina">Molina</SelectItem>
                      <SelectItem value="anthem">Anthem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Authorization Status</Label>
                  <Select 
                    value={filterCriteria.authStatus} 
                    onValueChange={(value) => setFilterCriteria(prev => ({ ...prev, authStatus: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="no-auth">No Authorizations</SelectItem>
                      <SelectItem value="missing-t2038">Missing T2038</SelectItem>
                      <SelectItem value="missing-h2022">Missing H2022</SelectItem>
                      <SelectItem value="expiring">Expiring Soon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="needs-attention"
                    checked={filterCriteria.needsAttention}
                    onCheckedChange={(checked) => 
                      setFilterCriteria(prev => ({ ...prev, needsAttention: !!checked }))
                    }
                  />
                  <Label htmlFor="needs-attention">Needs Attention Only</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Presets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Quick Presets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => applyPreset('new-members-both')}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  New Members (Both Auth)
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('t2038-only')}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  T2038 Only
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('h2022-only')}>
                  <Building className="h-4 w-4 mr-2" />
                  H2022 Only
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Authorization Data */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  T2038 Authorization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={bulkAuthData.authStartDateT2038}
                    onChange={(e) => handleStartDateChange('authStartDateT2038', e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={bulkAuthData.authEndDateT2038}
                    onChange={(e) => setBulkAuthData(prev => ({ ...prev, authEndDateT2038: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-purple-600" />
                  H2022 Authorization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={bulkAuthData.authStartDateH2022}
                    onChange={(e) => handleStartDateChange('authStartDateH2022', e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={bulkAuthData.authEndDateH2022}
                    onChange={(e) => setBulkAuthData(prev => ({ ...prev, authEndDateH2022: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Update Type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Update Behavior</CardTitle>
            </CardHeader>
            <CardContent>
              <Select 
                value={bulkAuthData.updateType} 
                onValueChange={(value) => setBulkAuthData(prev => ({ ...prev, updateType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing-only">Only fill missing dates (recommended)</SelectItem>
                  <SelectItem value="overwrite-all">Overwrite all dates</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Member Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Select Members ({filteredMembers.length} available)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                    Select All Filtered
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearSelection}>
                    Clear Selection
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {filteredMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={selectedMembers.has(member.id)}
                        onCheckedChange={(checked) => handleMemberToggle(member.id, !!checked)}
                      />
                      <div>
                        <p className="font-medium">{member.memberName}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.healthPlan} • MRN: {member.mrn}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {member.needsAttention && (
                        <Badge variant="destructive" className="text-xs">Urgent</Badge>
                      )}
                      {member.t2038Status === 'none' && (
                        <Badge variant="outline" className="text-xs">No T2038</Badge>
                      )}
                      {member.h2022Status === 'none' && (
                        <Badge variant="outline" className="text-xs">No H2022</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {selectedMembers.size > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>{selectedMembers.size}</strong> members selected for bulk update
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkUpdate} 
              disabled={isSaving || selectedMembers.size === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Updating...' : `Update ${selectedMembers.size} Members`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}