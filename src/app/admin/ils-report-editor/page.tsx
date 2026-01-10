'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  FileText, 
  Download, 
  Save, 
  RefreshCw, 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Edit,
  Eye,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface ILSReportMember {
  id: string;
  memberName: string;
  memberMrn: string;
  client_ID2: string;
  Kaiser_Status: string;
  Kaiser_T2038_Requested_Date?: string;
  Kaiser_T2038_Received_Date?: string;
  Kaiser_Tier_Level_Requested_Date?: string;
  Kaiser_Tier_Level_Received_Date?: string;
  ILS_RCFE_Sent_For_Contract_Date?: string;
  ILS_RCFE_Received_Contract_Date?: string;
  memberCounty?: string;
  kaiser_user_assignment?: string;
}

const BOTTLENECK_STATUSES = [
  'T2038 Requested',
  'Tier Level Requested', 
  'RCFE/ILS for Contracting'
];

export default function ILSReportEditorPage() {
  const { isAdmin, isUserLoading } = useAdmin();
  const [members, setMembers] = useState<ILSReportMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { toast } = useToast();

  // Load Kaiser members for ILS report
  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const fetchMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      const result = await fetchMembers({});
      const data = result.data as any;
      
      if (data.success && data.members) {
        // Filter for bottleneck statuses
        const bottleneckMembers = data.members
          .filter((member: any) => 
            BOTTLENECK_STATUSES.includes(member.Kaiser_Status)
          )
          .map((member: any) => ({
            id: member.id,
            memberName: `${member.memberFirstName} ${member.memberLastName}`,
            memberMrn: member.memberMrn,
            client_ID2: member.client_ID2,
            Kaiser_Status: member.Kaiser_Status,
            Kaiser_T2038_Requested_Date: member.Kaiser_T2038_Requested_Date,
            Kaiser_T2038_Received_Date: member.Kaiser_T2038_Received_Date,
            Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested_Date,
            Kaiser_Tier_Level_Received_Date: member.Kaiser_Tier_Level_Received_Date,
            ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date,
            ILS_RCFE_Received_Contract_Date: member.ILS_RCFE_Received_Contract_Date,
            memberCounty: member.memberCounty,
            kaiser_user_assignment: member.kaiser_user_assignment
          }));
        
        setMembers(bottleneckMembers);
        
        toast({
          title: 'Members Loaded',
          description: `Found ${bottleneckMembers.length} members at bottleneck stages`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error loading members:', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: 'Could not load Kaiser members for ILS report',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Save member date updates
  const saveMemberDates = async (memberId: string, updates: Partial<ILSReportMember>) => {
    setIsSaving(true);
    try {
      const functions = getFunctions();
      const updateMember = httpsCallable(functions, 'updateKaiserMemberDates');
      
      const result = await updateMember({
        memberId,
        updates
      });
      
      const data = result.data as any;
      
      if (data.success) {
        // Update local state
        setMembers(prev => prev.map(member => 
          member.id === memberId 
            ? { ...member, ...updates }
            : member
        ));
        
        toast({
          title: 'Dates Updated',
          description: 'Member dates saved successfully',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        setEditingMember(null);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not save member dates',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate printable PDF report
  const generatePrintableReport = () => {
    const reportData = {
      reportDate,
      members: members.map(member => ({
        memberName: member.memberName,
        memberMrn: member.memberMrn,
        Kaiser_Status: member.Kaiser_Status,
        Kaiser_T2038_Requested_Date: member.Kaiser_T2038_Requested_Date,
        Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested_Date,
        ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date
      }))
    };

    // Create printable version
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>ILS Weekly Report - ${format(new Date(reportDate), 'MMM dd, yyyy')}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .report-date { color: #666; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; font-weight: bold; }
              .status-badge { padding: 2px 6px; border-radius: 4px; font-size: 12px; }
              .status-t2038 { background-color: #fef3c7; color: #92400e; }
              .status-tier { background-color: #dbeafe; color: #1e40af; }
              .status-rcfe { background-color: #f3e8ff; color: #7c3aed; }
              .footer { margin-top: 30px; font-size: 12px; color: #666; }
              @media print { 
                body { margin: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ILS Weekly Report</h1>
              <div class="report-date">Report Date: ${format(new Date(reportDate), 'MMMM dd, yyyy')}</div>
              <div class="report-date">Kaiser Bottleneck Members</div>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th>MRN</th>
                  <th>Kaiser Status</th>
                  <th>T2038 Requested</th>
                  <th>Tier Requested</th>
                  <th>RCFE Sent</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.members.map(member => `
                  <tr>
                    <td>${member.memberName}</td>
                    <td>${member.memberMrn}</td>
                    <td>
                      <span class="status-badge ${
                        member.Kaiser_Status.includes('T2038') ? 'status-t2038' :
                        member.Kaiser_Status.includes('Tier') ? 'status-tier' :
                        'status-rcfe'
                      }">
                        ${member.Kaiser_Status}
                      </span>
                    </td>
                    <td>${member.Kaiser_T2038_Requested_Date ? format(new Date(member.Kaiser_T2038_Requested_Date), 'MM/dd/yyyy') : '-'}</td>
                    <td>${member.Kaiser_Tier_Level_Requested_Date ? format(new Date(member.Kaiser_Tier_Level_Requested_Date), 'MM/dd/yyyy') : '-'}</td>
                    <td>${member.ILS_RCFE_Sent_For_Contract_Date ? format(new Date(member.ILS_RCFE_Sent_For_Contract_Date), 'MM/dd/yyyy') : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="footer">
              <p>Generated on ${format(new Date(), 'MMMM dd, yyyy HH:mm')} | CalAIM Tracker System</p>
              <p>Total Members: ${reportData.members.length}</p>
            </div>
            
            <script>
              window.onload = function() {
                window.print();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Statistics
  const stats = useMemo(() => {
    const total = members.length;
    const byStatus = members.reduce((acc, member) => {
      acc[member.Kaiser_Status] = (acc[member.Kaiser_Status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const withT2038Date = members.filter(m => m.Kaiser_T2038_Requested_Date).length;
    const withTierDate = members.filter(m => m.Kaiser_Tier_Level_Requested_Date).length;
    const withRCFEDate = members.filter(m => m.ILS_RCFE_Sent_For_Contract_Date).length;
    
    return { total, byStatus, withT2038Date, withTierDate, withRCFEDate };
  }, [members]);

  useEffect(() => {
    if (isAdmin && !isUserLoading) {
      loadMembers();
    }
  }, [isAdmin, isUserLoading]);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need administrator privileges to access the ILS report editor.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Weekly Report Editor</h1>
          <p className="text-muted-foreground">
            Edit and track Kaiser bottleneck dates before generating printable report
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Bottleneck Tracking</span>
        </div>
      </div>

      {/* Report Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Report Configuration
          </CardTitle>
          <CardDescription>
            Set report date and generate printable version
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <Label htmlFor="report-date">Report Date</Label>
              <Input
                id="report-date"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-40"
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={loadMembers}
                disabled={isLoading}
                variant="outline"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh Data
              </Button>
              
              <Button
                onClick={generatePrintableReport}
                disabled={members.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Printer className="mr-2 h-4 w-4" />
                Generate PDF Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.byStatus['T2038 Requested'] || 0}</p>
                <p className="text-xs text-muted-foreground">T2038 Requested</p>
              </div>
              <Clock className="h-4 w-4 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.byStatus['Tier Level Requested'] || 0}</p>
                <p className="text-xs text-muted-foreground">Tier Requested</p>
              </div>
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.byStatus['RCFE/ILS for Contracting'] || 0}</p>
                <p className="text-xs text-muted-foreground">RCFE Contracting</p>
              </div>
              <Clock className="h-4 w-4 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {Math.round(((stats.withT2038Date + stats.withTierDate + stats.withRCFEDate) / (stats.total * 3)) * 100)}%
                </p>
                <p className="text-xs text-muted-foreground">Date Completion</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Bottleneck Members - Editable View</CardTitle>
          <CardDescription>
            Click edit to add missing dates for better bottleneck tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading members...</span>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No bottleneck members found</p>
              <Button onClick={loadMembers} variant="outline" className="mt-4">
                <RefreshCw className="mr-2 h-4 w-4" />
                Load Members
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <MemberEditCard
                  key={member.id}
                  member={member}
                  isEditing={editingMember === member.id}
                  isSaving={isSaving}
                  onEdit={() => setEditingMember(member.id)}
                  onCancel={() => setEditingMember(null)}
                  onSave={(updates) => saveMemberDates(member.id, updates)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Member Edit Card Component
interface MemberEditCardProps {
  member: ILSReportMember;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (updates: Partial<ILSReportMember>) => void;
}

function MemberEditCard({ member, isEditing, isSaving, onEdit, onCancel, onSave }: MemberEditCardProps) {
  const [editData, setEditData] = useState<Partial<ILSReportMember>>({});

  useEffect(() => {
    if (isEditing) {
      setEditData({
        Kaiser_T2038_Requested_Date: member.Kaiser_T2038_Requested_Date || '',
        Kaiser_T2038_Received_Date: member.Kaiser_T2038_Received_Date || '',
        Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested_Date || '',
        Kaiser_Tier_Level_Received_Date: member.Kaiser_Tier_Level_Received_Date || '',
        ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date || '',
        ILS_RCFE_Received_Contract_Date: member.ILS_RCFE_Received_Contract_Date || ''
      });
    }
  }, [isEditing, member]);

  const handleSave = () => {
    onSave(editData);
  };

  const getStatusColor = (status: string) => {
    if (status.includes('T2038')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (status.includes('Tier')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-purple-100 text-purple-800 border-purple-200';
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      {/* Member Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="font-medium">{member.memberName}</h3>
            <Badge variant="outline" className="text-xs">
              MRN: {member.memberMrn}
            </Badge>
            <Badge variant="outline" className="text-xs">
              ID: {member.client_ID2}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(member.Kaiser_Status)}>
              {member.Kaiser_Status}
            </Badge>
            {member.memberCounty && (
              <span className="text-sm text-muted-foreground">{member.memberCounty} County</span>
            )}
            {member.kaiser_user_assignment && (
              <span className="text-sm text-muted-foreground">Assigned: {member.kaiser_user_assignment}</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Link href={`/admin/applications/${member.id}`}>
            <Button size="sm" variant="outline">
              <Eye className="mr-2 h-3 w-3" />
              View
            </Button>
          </Link>
          
          {!isEditing ? (
            <Button size="sm" onClick={onEdit}>
              <Edit className="mr-2 h-3 w-3" />
              Edit Dates
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-2 h-3 w-3" />
                )}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Date Fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* T2038 Process */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">T2038 Process</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Requested Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.Kaiser_T2038_Requested_Date || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_T2038_Requested_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {member.Kaiser_T2038_Requested_Date ? 
                    format(new Date(member.Kaiser_T2038_Requested_Date), 'MMM dd, yyyy') : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Received Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.Kaiser_T2038_Received_Date || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_T2038_Received_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {member.Kaiser_T2038_Received_Date ? 
                    format(new Date(member.Kaiser_T2038_Received_Date), 'MMM dd, yyyy') : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tier Level Process */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tier Level Process</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Requested Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.Kaiser_Tier_Level_Requested_Date || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_Tier_Level_Requested_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {member.Kaiser_Tier_Level_Requested_Date ? 
                    format(new Date(member.Kaiser_Tier_Level_Requested_Date), 'MMM dd, yyyy') : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Received Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.Kaiser_Tier_Level_Received_Date || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_Tier_Level_Received_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {member.Kaiser_Tier_Level_Received_Date ? 
                    format(new Date(member.Kaiser_Tier_Level_Received_Date), 'MMM dd, yyyy') : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ILS RCFE Contract Process */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">ILS RCFE Contract</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Sent Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.ILS_RCFE_Sent_For_Contract_Date || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, ILS_RCFE_Sent_For_Contract_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {member.ILS_RCFE_Sent_For_Contract_Date ? 
                    format(new Date(member.ILS_RCFE_Sent_For_Contract_Date), 'MMM dd, yyyy') : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Received Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.ILS_RCFE_Received_Contract_Date || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, ILS_RCFE_Received_Contract_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {member.ILS_RCFE_Received_Contract_Date ? 
                    format(new Date(member.ILS_RCFE_Received_Contract_Date), 'MMM dd, yyyy') : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}