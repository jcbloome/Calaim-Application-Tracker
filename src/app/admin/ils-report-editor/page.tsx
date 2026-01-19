'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
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
  Printer,
  MessageSquare,
  Database
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
  // Kaiser workflow bottleneck statuses (these should be in Kaiser_Status field)
  'T2038 Requested',
  'Tier Level Requested', 
  'Need Tier Level',
  'Locating RCFEs',
  'Found RCFE',
  'R&B Requested',
  'RCFE/ILS for Contracting',
  'RCFE/ILS for Invoicing',
  // Common bottleneck indicators
  'RN/MSW Scheduled',
  'RN Visit Complete',
  'Needs RN Visit'
];

export default function ILSReportEditorPage() {
  const { isAdmin, isUserLoading } = useAdmin();
  const [members, setMembers] = useState<ILSReportMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportComments, setReportComments] = useState('');
  const { toast } = useToast();

  // Load Kaiser members for ILS report
  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/kaiser-members');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.members) {
        console.log('🔍 ILS REPORT DEBUG - First member fields:', Object.keys(data.members[0] || {}));
        console.log('🔍 ILS REPORT DEBUG - Date fields in first member:', 
          Object.keys(data.members[0] || {}).filter(key => 
            key.toLowerCase().includes('t2038') || 
            key.toLowerCase().includes('t038') ||
            key.toLowerCase().includes('tier') || 
            key.toLowerCase().includes('date') ||
            key.toLowerCase().includes('requested') ||
            key.toLowerCase().includes('received')
          )
        );
        console.log('🔍 ILS REPORT DEBUG - Sample member date values:', {
          Kaiser_T038_Requested: data.members[0]?.Kaiser_T038_Requested,
          Kaiser_T2038_Requested: data.members[0]?.Kaiser_T2038_Requested,
          Kaiser_T2038_Requested_Date: data.members[0]?.Kaiser_T2038_Requested_Date,
          Kaiser_Tier_Level_Requested: data.members[0]?.Kaiser_Tier_Level_Requested,
          Kaiser_Tier_Level_Requested_Date: data.members[0]?.Kaiser_Tier_Level_Requested_Date
        });
        
        // Debug: Show all unique statuses in the data
        const allKaiserStatuses = [...new Set(data.members.map((m: any) => m.Kaiser_Status).filter(Boolean))];
        const allCalAIMStatuses = [...new Set(data.members.map((m: any) => m.CalAIM_Status).filter(Boolean))];
        console.log('🔍 ILS REPORT DEBUG - All available Kaiser_Status values:', allKaiserStatuses);
        console.log('🔍 ILS REPORT DEBUG - All available CalAIM_Status values:', allCalAIMStatuses);
        console.log('🔍 ILS REPORT DEBUG - Looking for bottleneck statuses:', BOTTLENECK_STATUSES);
        
        // Filter for bottleneck statuses
        const bottleneckMembers = data.members
          .filter((member: any) => 
            BOTTLENECK_STATUSES.includes(member.Kaiser_Status)
          );
          
        console.log('🔍 ILS REPORT DEBUG - Found bottleneck members:', bottleneckMembers.length);
        console.log('🔍 ILS REPORT DEBUG - Bottleneck member statuses:', 
          bottleneckMembers.map((m: any) => m.Kaiser_Status)
        );
        
        const processedMembers = bottleneckMembers.map((member: any) => ({
            id: member.id,
            memberName: `${member.memberFirstName} ${member.memberLastName}`,
            memberMrn: member.memberMrn,
            client_ID2: member.client_ID2,
            Kaiser_Status: member.Kaiser_Status,
            // Using EXACT field names from Caspio screenshot
            Kaiser_T2038_Requested_Date: member.Kaiser_T038_Requested || member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date || '',
            Kaiser_T2038_Received_Date: member.Kaiser_T038_Received || member.Kaiser_T2038_Received || member.Kaiser_T2038_Received_Date || '',
            // Tier Level fields from screenshot
            Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date || '',
            Kaiser_Tier_Level_Received_Date: member.Kaiser_Tier_Level_Received || member.Kaiser_Tier_Level_Received_Date || '',
            // Try multiple possible field names for ILS/RCFE dates
            ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date || member.ILS_RCFE_Sent_For_Contract || '',
            ILS_RCFE_Received_Contract_Date: member.ILS_RCFE_Received_Contract_Date || member.ILS_RCFE_Received_Contract || '',
            memberCounty: member.memberCounty,
            kaiser_user_assignment: member.kaiser_user_assignment
          }));
        
        setMembers(processedMembers);
        
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
      comments: reportComments,
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
              .comments-section { margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #007bff; }
              .comments-section h2 { margin: 0 0 10px 0; font-size: 16px; color: #333; }
              .comments-content { font-size: 14px; line-height: 1.5; color: #555; white-space: pre-wrap; }
              @media print { 
                body { margin: 0; }
                .no-print { display: none; }
                .comments-section { background-color: #f5f5f5; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ILS Weekly Report</h1>
              <div class="report-date">Report Date: ${format(new Date(reportDate), 'MMMM dd, yyyy')}</div>
              <div class="report-date">Kaiser Bottleneck Members</div>
            </div>
            
            ${reportData.comments ? `
            <div class="comments-section">
              <h2>Report Comments & Notes</h2>
              <div class="comments-content">${reportData.comments.replace(/\n/g, '<br>')}</div>
            </div>
            ` : ''}
            
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
                    <td>${member.Kaiser_T2038_Requested_Date && member.Kaiser_T2038_Requested_Date !== 'null' ? format(new Date(member.Kaiser_T2038_Requested_Date), 'MM/dd/yyyy') : '-'}</td>
                    <td>${member.Kaiser_Tier_Level_Requested_Date && member.Kaiser_Tier_Level_Requested_Date !== 'null' ? format(new Date(member.Kaiser_Tier_Level_Requested_Date), 'MM/dd/yyyy') : '-'}</td>
                    <td>${member.ILS_RCFE_Sent_For_Contract_Date && member.ILS_RCFE_Sent_For_Contract_Date !== 'null' ? format(new Date(member.ILS_RCFE_Sent_For_Contract_Date), 'MM/dd/yyyy') : '-'}</td>
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

  // Save comments to localStorage
  const saveComments = () => {
    if (reportComments.trim()) {
      localStorage.setItem(`ils-report-comments-${reportDate}`, reportComments);
      toast({
        title: 'Comments Saved',
        description: 'Report comments saved locally',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    }
  };

  // Load comments from localStorage
  useEffect(() => {
    const savedComments = localStorage.getItem(`ils-report-comments-${reportDate}`);
    if (savedComments) {
      setReportComments(savedComments);
    } else {
      setReportComments('');
    }
  }, [reportDate]);

  // Removed auto-loading useEffect - now only loads when "Load Members" button is pressed

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
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
                  className="bg-green-50 hover:bg-green-100 border-green-200"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  {members.length === 0 ? 'Load Members' : 'Refresh Data'}
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
            
            <div className="space-y-2">
              <Label htmlFor="report-comments">Report Comments & Notes</Label>
              <Textarea
                id="report-comments"
                placeholder="Add any comments, observations, or notes about this week's bottlenecks..."
                value={reportComments}
                onChange={(e) => setReportComments(e.target.value)}
                rows={6}
                className="resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  These comments will be included in the printable report for ILS
                </p>
                <Button
                  onClick={saveComments}
                  size="sm"
                  variant="outline"
                  disabled={!reportComments.trim()}
                >
                  <Save className="mr-2 h-3 w-3" />
                  Save Comments
                </Button>
              </div>
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

      {/* Comments Preview */}
      {reportComments && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Report Comments Preview
            </CardTitle>
            <CardDescription>
              This section will appear in the printable report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
              <div className="whitespace-pre-wrap text-sm">{reportComments}</div>
            </div>
          </CardContent>
        </Card>
      )}

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
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Generate ILS Report</h3>
              <p className="mb-6">Click "Load Members" to fetch Kaiser bottleneck members from Caspio</p>
              <Button 
                onClick={loadMembers} 
                variant="default" 
                className="bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <Database className="mr-2 h-4 w-4" />
                Load Members from Caspio
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
                  {member.Kaiser_T2038_Requested_Date && member.Kaiser_T2038_Requested_Date !== 'null' ? 
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
                  {member.Kaiser_T2038_Received_Date && member.Kaiser_T2038_Received_Date !== 'null' ? 
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
                  {member.Kaiser_Tier_Level_Requested_Date && member.Kaiser_Tier_Level_Requested_Date !== 'null' ? 
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
                  {member.Kaiser_Tier_Level_Received_Date && member.Kaiser_Tier_Level_Received_Date !== 'null' ? 
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
                  {member.ILS_RCFE_Sent_For_Contract_Date && member.ILS_RCFE_Sent_For_Contract_Date !== 'null' ? 
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
                  {member.ILS_RCFE_Received_Contract_Date && member.ILS_RCFE_Received_Contract_Date !== 'null' ? 
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