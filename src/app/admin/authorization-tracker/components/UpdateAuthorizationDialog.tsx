'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { format, addMonths } from 'date-fns';
import { 
  Calendar, 
  DollarSign, 
  Building, 
  Save, 
  AlertTriangle,
  Info,
  CheckCircle
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
  authExtRequestDateT2038?: string;
  authExtRequestDateH2022?: string;
}

interface UpdateAuthorizationDialogProps {
  member: AuthorizationMember;
  onUpdate: () => void;
}

export function UpdateAuthorizationDialog({ member, onUpdate }: UpdateAuthorizationDialogProps) {
  const { toast } = useToast();
  const functions = useFunctions();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [authData, setAuthData] = useState({
    authStartDateT2038: member.authStartDateT2038 || '',
    authEndDateT2038: member.authEndDateT2038 || '',
    authStartDateH2022: member.authStartDateH2022 || '',
    authEndDateH2022: member.authEndDateH2022 || '',
    authExtRequestDateT2038: member.authExtRequestDateT2038 || '',
    authExtRequestDateH2022: member.authExtRequestDateH2022 || '',
  });

  const isKaiser = member.healthPlan?.toLowerCase().includes('kaiser');
  const isHealthNet = member.healthPlan?.toLowerCase().includes('health net');

  // Auto-calculate end dates based on MCO rules
  const handleStartDateChange = (field: string, value: string) => {
    setAuthData(prev => {
      const updated = { ...prev, [field]: value };
      
      if (value) {
        const startDate = new Date(value);
        
        if (field === 'authStartDateT2038') {
          if (isHealthNet) {
            // Health Net: 6 months for T2038
            updated.authEndDateT2038 = format(addMonths(startDate, 6), 'yyyy-MM-dd');
          }
          // Kaiser: Initial T2038, no automatic end date (TBD)
        }
        
        if (field === 'authStartDateH2022') {
          // Both Kaiser and Health Net: 6 months for H2022
          updated.authEndDateH2022 = format(addMonths(startDate, 6), 'yyyy-MM-dd');
        }
      }
      
      return updated;
    });
  };

  // Quick preset buttons for common scenarios
  const applyPreset = (preset: string) => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    
    switch (preset) {
      case 'health-net-new':
        setAuthData({
          authStartDateT2038: todayStr,
          authEndDateT2038: format(addMonths(today, 6), 'yyyy-MM-dd'),
          authStartDateH2022: todayStr,
          authEndDateH2022: format(addMonths(today, 6), 'yyyy-MM-dd'),
          authExtRequestDateT2038: '',
          authExtRequestDateH2022: '',
        });
        break;
      case 'kaiser-initial':
        setAuthData({
          authStartDateT2038: todayStr,
          authEndDateT2038: '', // TBD for Kaiser
          authStartDateH2022: '',
          authEndDateH2022: '',
          authExtRequestDateT2038: '',
          authExtRequestDateH2022: '',
        });
        break;
      case 'kaiser-h2022-placement':
        setAuthData(prev => ({
          ...prev,
          authStartDateH2022: todayStr,
          authEndDateH2022: format(addMonths(today, 6), 'yyyy-MM-dd'),
        }));
        break;
    }
  };

  const handleSave = async () => {
    if (!functions) return;
    
    setIsSaving(true);
    try {
      const updateAuth = httpsCallable(functions, 'updateMemberAuthorization');
      
      // Clean up empty strings to null
      const cleanedData = Object.entries(authData).reduce((acc, [key, value]) => {
        acc[key] = value === '' ? null : value;
        return acc;
      }, {} as any);
      
      await updateAuth({
        memberId: member.id,
        authorizationData: {
          Authorization_Start_Date_T2038: cleanedData.authStartDateT2038,
          Authorization_End_Date_T2038: cleanedData.authEndDateT2038,
          Authorization_Start_Date_H2022: cleanedData.authStartDateH2022,
          Authorization_End_Date_H2022: cleanedData.authEndDateH2022,
          Auth_Ext_Request_Date_T2038: cleanedData.authExtRequestDateT2038,
          Auth_Ext_Request_Date_H2022: cleanedData.authExtRequestDateH2022,
        }
      });
      
      toast({
        title: 'Authorization Updated',
        description: `Successfully updated authorization dates for ${member.memberName}`,
        className: 'bg-green-100 text-green-900 border-green-200'
      });
      
      setIsOpen(false);
      onUpdate();
      
    } catch (error) {
      console.error('Error updating authorization:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Failed to update authorization dates. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Update Auth
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Update Authorization Dates - {member.memberName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Member Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Member Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <p className="text-sm">{member.memberName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">MRN</Label>
                  <p className="text-sm">{member.mrn}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Health Plan</Label>
                  <Badge variant="outline">{member.healthPlan}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MCO-Specific Guidelines */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-4 w-4" />
                {member.healthPlan} Authorization Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isHealthNet && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Health Net Rules:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• T2038 and H2022 authorized together for 6 months</li>
                    <li>• Both renewed simultaneously</li>
                    <li>• End dates auto-calculated when start dates are entered</li>
                  </ul>
                </div>
              )}
              {isKaiser && (
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h4 className="font-medium text-orange-900 mb-2">Kaiser Rules:</h4>
                  <ul className="text-sm text-orange-800 space-y-1">
                    <li>• Initial T2038 authorization (reauth process TBD)</li>
                    <li>• H2022 authorized after member placement (6 months)</li>
                    <li>• H2022 renewed every 6 months</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Presets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Presets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {isHealthNet && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset('health-net-new')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    New Health Net Member (Both Auth)
                  </Button>
                )}
                {isKaiser && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset('kaiser-initial')}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Kaiser Initial T2038
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset('kaiser-h2022-placement')}
                    >
                      <Building className="h-4 w-4 mr-2" />
                      Kaiser H2022 After Placement
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Authorization Forms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* T2038 Authorization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  T2038 - ConnectionsILOS Services
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="t2038-start">Start Date</Label>
                  <Input
                    id="t2038-start"
                    type="date"
                    value={authData.authStartDateT2038}
                    onChange={(e) => handleStartDateChange('authStartDateT2038', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="t2038-end">End Date</Label>
                  <Input
                    id="t2038-end"
                    type="date"
                    value={authData.authEndDateT2038}
                    onChange={(e) => setAuthData(prev => ({ ...prev, authEndDateT2038: e.target.value }))}
                  />
                  {isKaiser && (
                    <p className="text-xs text-orange-600 mt-1">
                      Kaiser T2038 reauthorization process TBD
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="t2038-ext">Extension Request Date</Label>
                  <Input
                    id="t2038-ext"
                    type="date"
                    value={authData.authExtRequestDateT2038}
                    onChange={(e) => setAuthData(prev => ({ ...prev, authExtRequestDateT2038: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* H2022 Authorization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-purple-600" />
                  H2022 - RCFE Housing Services
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="h2022-start">Start Date</Label>
                  <Input
                    id="h2022-start"
                    type="date"
                    value={authData.authStartDateH2022}
                    onChange={(e) => handleStartDateChange('authStartDateH2022', e.target.value)}
                  />
                  {isKaiser && (
                    <p className="text-xs text-orange-600 mt-1">
                      Kaiser H2022 authorized after member placement
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="h2022-end">End Date</Label>
                  <Input
                    id="h2022-end"
                    type="date"
                    value={authData.authEndDateH2022}
                    onChange={(e) => setAuthData(prev => ({ ...prev, authEndDateH2022: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="h2022-ext">Extension Request Date</Label>
                  <Input
                    id="h2022-ext"
                    type="date"
                    value={authData.authExtRequestDateH2022}
                    onChange={(e) => setAuthData(prev => ({ ...prev, authExtRequestDateH2022: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Authorization Dates'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}