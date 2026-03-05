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
import { useAuth } from '@/firebase';
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
import { getFunctions, httpsCallable } from 'firebase/functions';

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
  Kaiser_H2022_Requested?: string;
  Kaiser_H2022_Received?: string;
  memberCounty?: string;
  kaiser_user_assignment?: string;
}

type QueueKey = 't2038_auth_only_email' | 'h2022_requested' | 'tier_level_requested' | 'rb_sent_pending_ils_contract';

const hasMeaningfulValue = (value: any) => {
  const s = value != null ? String(value).trim() : '';
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower !== 'null' && lower !== 'undefined' && lower !== 'n/a';
};

const toYmd = (value: any): string => {
  const raw = value != null ? String(value).trim() : '';
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a') return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, '0');
    const dd = String(us[2]).padStart(2, '0');
    const yyyy = String(us[3]);
    return `${yyyy}-${mm}-${dd}`;
  }

  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const formatYmd = (value: any): string => {
  const ymd = toYmd(value);
  if (!ymd) return '';
  try {
    return format(new Date(`${ymd}T00:00:00`), 'MMM dd, yyyy');
  } catch {
    return ymd;
  }
};

const ymdSortKey = (value: any): string => {
  const ymd = toYmd(value);
  return ymd || '9999-12-31';
};

const normalizeStatus = (value: any) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const queueIncludes = (member: ILSReportMember, key: QueueKey): boolean => {
  const status = normalizeStatus(member.Kaiser_Status);
  if (key === 't2038_auth_only_email') {
    // This label is derived in getEffectiveKaiserStatus and is a known bottleneck.
    return status === 't2038 auth only email';
  }
  if (key === 'tier_level_requested') {
    const requested = Boolean(toYmd(member.Kaiser_Tier_Level_Requested_Date));
    const received = Boolean(toYmd(member.Kaiser_Tier_Level_Received_Date));
    return status === 'tier level requested' || (requested && !received);
  }
  if (key === 'h2022_requested') {
    const requested = Boolean(toYmd(member.Kaiser_H2022_Requested));
    const received = Boolean(toYmd(member.Kaiser_H2022_Received));
    return status === 'h2022 requested' || (requested && !received);
  }
  // R&B Sent Pending ILS Contract (bottleneck stage).
  // Use the exact Caspio status label only (avoid pulling in adjacent workflow statuses).
  return status === 'r&b sent pending ils contract' || status === 'r & b sent pending ils contract';
};

const queueRequestedDate = (member: ILSReportMember, key: QueueKey): string => {
  if (key === 'tier_level_requested') return toYmd(member.Kaiser_Tier_Level_Requested_Date);
  if (key === 'h2022_requested') return toYmd(member.Kaiser_H2022_Requested);
  if (key === 't2038_auth_only_email') return toYmd(member.Kaiser_T2038_Requested_Date);
  return '';
};

const getEffectiveKaiserStatus = (member: any): string => {
  const hasAuthEmail = hasMeaningfulValue(member?.T2038_Auth_Email_Kaiser);
  const hasOfficialAuth =
    hasMeaningfulValue(member?.Kaiser_T2038_Received_Date) ||
    hasMeaningfulValue(member?.Kaiser_T038_Received) ||
    hasMeaningfulValue(member?.Kaiser_T2038_Received);

  if (hasAuthEmail && !hasOfficialAuth) return 'T2038 Auth Only Email';
  return String(member?.Kaiser_Status || '');
};

export default function ILSReportEditorPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const [members, setMembers] = useState<ILSReportMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportComments, setReportComments] = useState('');
  const { toast } = useToast();

  // Load Kaiser members for ILS report
  const loadMembers = async () => {
    setIsLoading(true);
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in to sync.');

      // On-demand incremental sync from Caspio → Firestore cache, then read from cache.
      const idToken = await auth.currentUser.getIdToken();
      const syncRes = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'incremental' }),
      });
      const syncData = await syncRes.json().catch(() => ({} as any));
      if (!syncRes.ok || !syncData?.success) {
        throw new Error(syncData?.error || `Failed to sync members cache (HTTP ${syncRes.status})`);
      }

      const response = await fetch('/api/kaiser-members');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.members) {
        const processedMembers = (Array.isArray(data.members) ? data.members : []).map((member: any) => {
          const effectiveStatus = getEffectiveKaiserStatus(member) || member.Kaiser_Status;
          
          return {
            id: member.id || member.Client_ID2,
            memberName: `${member.memberFirstName} ${member.memberLastName}`,
            memberMrn: member.memberMrn,
            client_ID2: member.client_ID2 || member.Client_ID2,
            Kaiser_Status: effectiveStatus,
            // Use the date fields directly from the API response
            Kaiser_T2038_Requested_Date: toYmd(member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Received_Date: toYmd(member.Kaiser_T2038_Received_Date),
            Kaiser_Tier_Level_Requested_Date: toYmd(member.Kaiser_Tier_Level_Requested_Date),
            Kaiser_Tier_Level_Received_Date: toYmd(member.Kaiser_Tier_Level_Received_Date),
            Kaiser_H2022_Requested: toYmd(member.Kaiser_H2022_Requested),
            Kaiser_H2022_Received: toYmd(member.Kaiser_H2022_Received),
            memberCounty: member.memberCounty,
            kaiser_user_assignment: member.kaiser_user_assignment
          };
        });

        const filtered = processedMembers
          .filter(Boolean)
          .filter(
            (m: ILSReportMember) =>
              queueIncludes(m, 't2038_auth_only_email') ||
              queueIncludes(m, 'tier_level_requested') ||
              queueIncludes(m, 'h2022_requested') ||
              queueIncludes(m, 'rb_sent_pending_ils_contract')
          )
          .sort((a: ILSReportMember, b: ILSReportMember) => {
            const aDates = [
              ymdSortKey(queueRequestedDate(a, 't2038_auth_only_email')),
              ymdSortKey(queueRequestedDate(a, 'h2022_requested')),
              ymdSortKey(queueRequestedDate(a, 'tier_level_requested')),
              ymdSortKey(queueRequestedDate(a, 'rb_sent_pending_ils_contract')),
            ].sort();
            const bDates = [
              ymdSortKey(queueRequestedDate(b, 't2038_auth_only_email')),
              ymdSortKey(queueRequestedDate(b, 'h2022_requested')),
              ymdSortKey(queueRequestedDate(b, 'tier_level_requested')),
              ymdSortKey(queueRequestedDate(b, 'rb_sent_pending_ils_contract')),
            ].sort();
            const aFirst = aDates[0] || '9999-12-31';
            const bFirst = bDates[0] || '9999-12-31';
            if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
            return String(a.memberName || '').localeCompare(String(b.memberName || ''));
          });

        setMembers(filtered);
        
        toast({
          title: 'Members Loaded',
          description: `Found ${filtered.length} member(s) in requested queues`,
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
    const escapeHtml = (value: any) => {
      const s = value != null ? String(value) : '';
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const makeRows = (key: QueueKey) => {
      const rows = members
        .filter((m) => queueIncludes(m, key))
        .map((m) => ({
          id: String(m.id || ''),
          memberName: String(m.memberName || '').trim(),
          memberMrn: String(m.memberMrn || '').trim(),
          requestedDate: queueRequestedDate(m, key),
        }))
        .sort((a, b) => {
          const ad = ymdSortKey(a.requestedDate);
          const bd = ymdSortKey(b.requestedDate);
          if (ad !== bd) return ad.localeCompare(bd);
          return a.memberName.localeCompare(b.memberName);
        });
      return rows;
    };

    const queues = {
      t2038AuthOnly: makeRows('t2038_auth_only_email'),
      h2022Requested: makeRows('h2022_requested'),
      tierRequested: makeRows('tier_level_requested'),
      rbPendingIlsContract: makeRows('rb_sent_pending_ils_contract'),
    };

    const uniqueMemberIds = new Set<string>([
      ...queues.t2038AuthOnly.map((r) => r.id).filter(Boolean),
      ...queues.h2022Requested.map((r) => r.id).filter(Boolean),
      ...queues.tierRequested.map((r) => r.id).filter(Boolean),
      ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
    ]);

    const reportData = {
      reportDate,
      comments: reportComments,
      totalMembers: uniqueMemberIds.size,
      queues,
    };

    // Create a blob with HTML content
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ILS Member Update - ${format(new Date(reportDate), 'MMM dd, yyyy')}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.4;
        }
        .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #007bff;
            padding-bottom: 15px;
        }
        .report-date { 
            color: #666; 
            font-size: 14px; 
            margin: 5px 0;
        }
        .summary {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
            margin: 10px 0 0 0;
        }
        .pill {
            border: 1px solid #ddd;
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 12px;
            background: #fafafa;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 16px;
        }
        .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 10px;
        }
        .card h2 {
            margin: 0 0 6px 0;
            font-size: 14px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 6px; 
            text-align: left; 
            vertical-align: top;
        }
        th { 
            background-color: #f5f5f5; 
            font-weight: bold; 
            font-size: 11px;
        }
        .footer { 
            margin-top: 30px; 
            font-size: 12px; 
            color: #666; 
            border-top: 1px solid #ddd;
            padding-top: 15px;
        }
        .comments-section { 
            margin: 20px 0; 
            padding: 15px; 
            background-color: #f9f9f9; 
            border-left: 4px solid #007bff; 
            border-radius: 4px;
        }
        .comments-section h2 { 
            margin: 0 0 10px 0; 
            font-size: 16px; 
            color: #333; 
        }
        .comments-content { 
            font-size: 14px; 
            line-height: 1.5; 
            color: #555; 
            white-space: pre-wrap; 
        }
        .print-button {
            background-color: #007bff;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin: 20px 0;
        }
        .print-button:hover {
            background-color: #0056b3;
        }
        @media print { 
            body { margin: 0.35in; }
            .no-print { display: none !important; }
            .comments-section { background-color: #f5f5f5; }
            .print-button { display: none !important; }
            .grid { gap: 10px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>ILS Member Update</h1>
        <div class="report-date">Report Date: ${format(new Date(reportDate), 'MMMM dd, yyyy')}</div>
        <div class="report-date">Kaiser bottleneck members</div>
    </div>
    
    <div class="no-print">
        <button class="print-button" onclick="window.print()">🖨️ Print Report</button>
    </div>
    
    ${reportData.comments ? `
    <div class="comments-section">
        <h2>Report Comments & Notes</h2>
        <div class="comments-content">${reportData.comments.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div class="summary">
      <div class="pill"><strong>Total members in queues:</strong> ${reportData.totalMembers}</div>
      <div class="pill"><strong>T2038 Auth Only Email:</strong> ${reportData.queues.t2038AuthOnly.length}</div>
      <div class="pill"><strong>H2022 Requested:</strong> ${reportData.queues.h2022Requested.length}</div>
      <div class="pill"><strong>Tier Level Requested:</strong> ${reportData.queues.tierRequested.length}</div>
      <div class="pill"><strong>R &amp; B Pending ILS Contract:</strong> ${reportData.queues.rbPendingIlsContract.length}</div>
    </div>

    <div class="grid">
      ${[
        { key: 't2038AuthOnly', label: 'T2038 Auth Only Email' },
        { key: 'h2022Requested', label: 'H2022 Requested' },
        { key: 'tierRequested', label: 'Tier Level Requested' },
        { key: 'rbPendingIlsContract', label: 'R & B Sent Pending ILS Contract' },
      ].map((q) => {
        const rows = (reportData.queues as any)[q.key] as Array<{ memberName: string; memberMrn: string; requestedDate: string }>;
        return `
          <div class="card">
            <h2>${q.label} (${rows.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>MRN</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length === 0 ? `<tr><td colspan="3" style="color:#777;">None</td></tr>` : rows.map((r) => `
                  <tr>
                    <td><strong>${escapeHtml(r.memberName || '—')}</strong></td>
                    <td>${escapeHtml(r.memberMrn || '—')}</td>
                    <td>${escapeHtml(r.requestedDate ? format(new Date(`${r.requestedDate}T00:00:00`), 'MM/dd/yyyy') : '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
    
    <div class="footer">
        <p><strong>Generated on:</strong> ${format(new Date(), 'MMMM dd, yyyy HH:mm')} | CalAIM Tracker System</p>
        <p><strong>Total members in queues:</strong> ${reportData.totalMembers}</p>
        <p><strong>Report Period:</strong> ${format(new Date(reportDate), 'MMMM dd, yyyy')}</p>
    </div>
</body>
</html>`;

    // Create blob and URL
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Open in new window with specific window features
    const printWindow = window.open(url, 'ILS_Report', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    
    if (printWindow) {
      // Clean up the blob URL after a delay
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      
      // Focus the new window
      printWindow.focus();
    } else {
      // Fallback: download as HTML file
      const link = document.createElement('a');
      link.href = url;
      link.download = `ILS_Member_Update_${format(new Date(reportDate), 'yyyy-MM-dd')}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Report Downloaded',
        description: 'Report saved as HTML file. Open it in your browser and use Ctrl+P to print as PDF.',
        className: 'bg-blue-100 text-blue-900 border-blue-200',
      });
    }
  };

  const queues = useMemo(() => {
    const makeRows = (key: QueueKey) => {
      return members
        .filter((m) => queueIncludes(m, key))
        .map((m) => ({
          id: String(m.id || ''),
          memberName: String(m.memberName || '').trim(),
          memberMrn: String(m.memberMrn || '').trim(),
          requestedDate: queueRequestedDate(m, key),
        }))
        .sort((a, b) => {
          const ad = ymdSortKey(a.requestedDate);
          const bd = ymdSortKey(b.requestedDate);
          if (ad !== bd) return ad.localeCompare(bd);
          return a.memberName.localeCompare(b.memberName);
        });
    };

    return {
      t2038AuthOnly: makeRows('t2038_auth_only_email'),
      h2022Requested: makeRows('h2022_requested'),
      tierRequested: makeRows('tier_level_requested'),
      rbPendingIlsContract: makeRows('rb_sent_pending_ils_contract'),
    };
  }, [members]);

  // Statistics for the requested queues
  const stats = useMemo(() => {
    const uniqueMemberIds = new Set<string>([
      ...queues.t2038AuthOnly.map((r) => r.id).filter(Boolean),
      ...queues.h2022Requested.map((r) => r.id).filter(Boolean),
      ...queues.tierRequested.map((r) => r.id).filter(Boolean),
      ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
    ]);
    return {
      totalInQueues: uniqueMemberIds.size,
      t2038AuthOnly: queues.t2038AuthOnly.length,
      h2022Requested: queues.h2022Requested.length,
      tierRequested: queues.tierRequested.length,
      rbPendingIlsContract: queues.rbPendingIlsContract.length,
    };
  }, [queues.h2022Requested, queues.rbPendingIlsContract, queues.t2038AuthOnly, queues.tierRequested]);

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

  if (isAdminLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight">ILS Member Update</h1>
          <p className="text-muted-foreground">
            Review and update key Kaiser timeline dates (then generate a printable report if needed)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Member Update</span>
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

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditor((v) => !v)}
                  disabled={members.length === 0}
                >
                  {showEditor ? 'Hide editor' : 'Show editor'}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.totalInQueues}</p>
                <p className="text-xs text-muted-foreground">Total in queues</p>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-yellow-700">{stats.t2038AuthOnly}</p>
                <p className="text-xs text-muted-foreground">T2038 Auth Only Email</p>
              </div>
              <Clock className="h-4 w-4 text-yellow-700" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-indigo-600">{stats.h2022Requested}</p>
                <p className="text-xs text-muted-foreground">H2022 Requested</p>
              </div>
              <Clock className="h-4 w-4 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.tierRequested}</p>
                <p className="text-xs text-muted-foreground">Tier Level Requested</p>
              </div>
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compact visual "graph" of requested queues */}
      <Card>
        <CardHeader>
          <CardTitle>Requested queues (compact)</CardTitle>
          <CardDescription>Member name • MRN • date requested</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-sm text-muted-foreground">Load members to see the requested queues.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(
                [
                  { key: 't2038AuthOnly' as const, label: 'T2038 Auth Only Email', rows: queues.t2038AuthOnly },
                  { key: 'h2022Requested' as const, label: 'H2022 Requested', rows: queues.h2022Requested },
                  { key: 'tierRequested' as const, label: 'Tier Level Requested', rows: queues.tierRequested },
                  { key: 'rbPendingIlsContract' as const, label: 'R & B Sent Pending ILS Contract', rows: queues.rbPendingIlsContract },
                ] as const
              ).map((q) => (
                <div key={q.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{q.label}</div>
                    <Badge variant="secondary">{q.rows.length}</Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    {q.rows.length === 0 ? (
                      <div className="text-muted-foreground">None</div>
                    ) : (
                      q.rows.slice(0, 60).map((r) => (
                        <div key={`${q.key}-${r.id}`} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.memberName || '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              MRN: <span className="font-mono">{r.memberMrn || '—'}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-xs font-mono text-muted-foreground">
                            {r.requestedDate ? format(new Date(`${r.requestedDate}T00:00:00`), 'MM/dd/yyyy') : '—'}
                          </div>
                        </div>
                      ))
                    )}
                    {q.rows.length > 60 ? (
                      <div className="text-xs text-muted-foreground pt-1">+ {q.rows.length - 60} more… (see PDF)</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
          <CardTitle>Editable details (optional)</CardTitle>
          <CardDescription>
            Use this only if you need to correct dates; the PDF is generated from the compact queues above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showEditor ? (
            <div className="text-sm text-muted-foreground">Click “Show editor” to edit member date fields.</div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading members...</span>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No members loaded</h3>
              <p className="mb-6">Click “Load Members” to fetch the requested queues from Caspio</p>
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
        Kaiser_T2038_Requested_Date: toYmd(member.Kaiser_T2038_Requested_Date),
        Kaiser_T2038_Received_Date: toYmd(member.Kaiser_T2038_Received_Date),
        Kaiser_Tier_Level_Requested_Date: toYmd(member.Kaiser_Tier_Level_Requested_Date),
        Kaiser_Tier_Level_Received_Date: toYmd(member.Kaiser_Tier_Level_Received_Date),
        Kaiser_H2022_Requested: toYmd(member.Kaiser_H2022_Requested),
        Kaiser_H2022_Received: toYmd(member.Kaiser_H2022_Received),
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
                  value={toYmd(editData.Kaiser_T2038_Requested_Date)}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_T2038_Requested_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {formatYmd(member.Kaiser_T2038_Requested_Date) ? 
                    formatYmd(member.Kaiser_T2038_Requested_Date) : 
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
                  value={toYmd(editData.Kaiser_T2038_Received_Date)}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_T2038_Received_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {formatYmd(member.Kaiser_T2038_Received_Date) ? 
                    formatYmd(member.Kaiser_T2038_Received_Date) : 
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
                  value={toYmd(editData.Kaiser_Tier_Level_Requested_Date)}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_Tier_Level_Requested_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {formatYmd(member.Kaiser_Tier_Level_Requested_Date) ? 
                    formatYmd(member.Kaiser_Tier_Level_Requested_Date) : 
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
                  value={toYmd(editData.Kaiser_Tier_Level_Received_Date)}
                  onChange={(e) => setEditData(prev => ({ ...prev, Kaiser_Tier_Level_Received_Date: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {formatYmd(member.Kaiser_Tier_Level_Received_Date) ? 
                    formatYmd(member.Kaiser_Tier_Level_Received_Date) : 
                    <span className="text-muted-foreground">Not set</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* H2022 Contract */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">H2022 Contract</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Requested Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={toYmd(editData.Kaiser_H2022_Requested)}
                  onChange={(e) => setEditData((prev) => ({ ...prev, Kaiser_H2022_Requested: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {formatYmd(member.Kaiser_H2022_Requested) ? (
                    formatYmd(member.Kaiser_H2022_Requested)
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Received Date</Label>
              {isEditing ? (
                <Input
                  type="date"
                  value={toYmd(editData.Kaiser_H2022_Received)}
                  onChange={(e) => setEditData((prev) => ({ ...prev, Kaiser_H2022_Received: e.target.value }))}
                  className="text-xs"
                />
              ) : (
                <div className="text-sm">
                  {formatYmd(member.Kaiser_H2022_Received) ? (
                    formatYmd(member.Kaiser_H2022_Received)
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}