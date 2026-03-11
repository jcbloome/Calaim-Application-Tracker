'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { 
  FileText, 
  Save, 
  RefreshCw,
  Calendar,
  AlertTriangle,
  Clock,
  Loader2,
  Pencil,
  Printer,
  MessageSquare,
  Database
} from 'lucide-react';
import { format } from 'date-fns';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ILSReportMember {
  id: string;
  memberName: string;
  memberMrn: string;
  birthDate?: string;
  client_ID2: string;
  Kaiser_Status: string;
  Kaiser_T2038_Requested_Date?: string;
  Kaiser_T2038_Requested?: string;
  Kaiser_T2038_Received_Date?: string;
  Kaiser_Tier_Level?: string;
  Kaiser_Tier_Level_Requested?: string;
  Kaiser_Tier_Level_Requested_Date?: string;
  Kaiser_Tier_Level_Received_Date?: string;
  Kaiser_H2022_Requested?: string;
  Kaiser_H2022_Received?: string;
  memberCounty?: string;
  kaiser_user_assignment?: string;
  RCFE_Name?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Email?: string;
}

interface IlsQueueChangeLogRow {
  id: string;
  memberName: string;
  clientId2?: string;
  queue: string;
  changes?: Record<string, any>;
  changedByEmail?: string;
  createdAtIso?: string;
  dateKey?: string;
  queueChangeFlag?: boolean;
  eventType?: string;
}

type QueueKey = 't2038_auth_only_email' | 't2038_requested' | 'tier_level_requested' | 'rb_sent_pending_ils_contract';

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
  if (key === 't2038_requested') {
    const requested = Boolean(toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date));
    const received = Boolean(toYmd(member.Kaiser_T2038_Received_Date));
    return requested && !received;
  }
  if (key === 'tier_level_requested') {
    const requested = Boolean(toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date));
    const received = Boolean(toYmd(member.Kaiser_Tier_Level_Received_Date));
    return status === 'tier level requested' || (requested && !received);
  }
  // R&B Sent Pending ILS Contract (bottleneck stage).
  // Use the exact Caspio status label only (avoid pulling in adjacent workflow statuses).
  return status === 'r&b sent pending ils contract' || status === 'r & b sent pending ils contract';
};

const queueRequestedDate = (member: ILSReportMember, key: QueueKey): string => {
  if (key === 't2038_requested') return toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date);
  if (key === 'tier_level_requested')
    return toYmd(member.Kaiser_Tier_Level_Requested || member.Kaiser_Tier_Level_Requested_Date);
  if (key === 't2038_auth_only_email') return toYmd(member.Kaiser_T2038_Requested_Date);
  if (key === 'rb_sent_pending_ils_contract') return toYmd(member.Kaiser_H2022_Requested);
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
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportComments, setReportComments] = useState('');
  const [cardEditOpen, setCardEditOpen] = useState(false);
  const [cardEditQueue, setCardEditQueue] = useState<'tier_level_requested' | 'rb_sent_pending_ils_contract' | null>(null);
  const [cardEditMemberId, setCardEditMemberId] = useState('');
  const [cardEditTierLevel, setCardEditTierLevel] = useState('');
  const [cardEditTierReceivedDate, setCardEditTierReceivedDate] = useState('');
  const [cardEditRbReceivedDate, setCardEditRbReceivedDate] = useState('');
  const [t2038ModalOpen, setT2038ModalOpen] = useState(false);
  const [isLoadingIlsLog, setIsLoadingIlsLog] = useState(false);
  const [ilsLogRows, setIlsLogRows] = useState<IlsQueueChangeLogRow[]>([]);
  const [ilsLogSearch, setIlsLogSearch] = useState('');
  const { toast } = useToast();

  // Load Kaiser members for ILS report
  const loadMembers = async () => {
    setIsLoading(true);
    try {
      if (!auth?.currentUser) throw new Error('You must be signed in to sync.');

      // On-demand full sync from Caspio → Firestore cache, then read from cache.
      const idToken = await auth.currentUser.getIdToken();
      const syncRes = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'full' }),
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
            birthDate: toYmd(member.Birth_Date || member.birthDate),
            client_ID2: member.client_ID2 || member.Client_ID2,
            Kaiser_Status: effectiveStatus,
            // Use the date fields directly from the API response
            Kaiser_T2038_Requested: toYmd(member.Kaiser_T2038_Requested || member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Requested_Date: toYmd(member.Kaiser_T2038_Requested_Date),
            Kaiser_T2038_Received_Date: toYmd(member.Kaiser_T2038_Received_Date),
            Kaiser_Tier_Level: String(member.Kaiser_Tier_Level || member.Tier_Level || '').trim(),
            Kaiser_Tier_Level_Requested: toYmd(
              member.Kaiser_Tier_Level_Requested ||
                member.Kaiser_Tier_Level_Requested_Date ||
                member.Tier_Level_Request_Date ||
                member.Tier_Level_Requested_Date ||
                member.Tier_Request_Date
            ),
            Kaiser_Tier_Level_Requested_Date: toYmd(
              member.Kaiser_Tier_Level_Requested ||
                member.Kaiser_Tier_Level_Requested_Date ||
                member.Tier_Level_Request_Date ||
                member.Tier_Level_Requested_Date ||
                member.Tier_Request_Date
            ),
            Kaiser_Tier_Level_Received_Date: toYmd(member.Kaiser_Tier_Level_Received_Date),
            Kaiser_H2022_Requested: toYmd(member.Kaiser_H2022_Requested),
            Kaiser_H2022_Received: toYmd(member.Kaiser_H2022_Received),
            memberCounty: member.memberCounty,
            kaiser_user_assignment: member.kaiser_user_assignment,
            RCFE_Name: String(member.RCFE_Name || '').trim(),
            RCFE_Admin_Name: String(member.RCFE_Admin_Name || member.RCFE_Administrator || '').trim(),
            RCFE_Admin_Email: String(member.RCFE_Admin_Email || member.RCFE_Administrator_Email || '').trim(),
          };
        });

        const filtered = processedMembers
          .filter(Boolean)
          .filter(
            (m: ILSReportMember) =>
              queueIncludes(m, 't2038_auth_only_email') ||
              queueIncludes(m, 't2038_requested') ||
              queueIncludes(m, 'tier_level_requested') ||
              queueIncludes(m, 'rb_sent_pending_ils_contract')
          )
          .sort((a: ILSReportMember, b: ILSReportMember) => {
            const aDates = [
              ymdSortKey(queueRequestedDate(a, 't2038_auth_only_email')),
              ymdSortKey(queueRequestedDate(a, 't2038_requested')),
              ymdSortKey(queueRequestedDate(a, 'tier_level_requested')),
              ymdSortKey(queueRequestedDate(a, 'rb_sent_pending_ils_contract')),
            ].sort();
            const bDates = [
              ymdSortKey(queueRequestedDate(b, 't2038_auth_only_email')),
              ymdSortKey(queueRequestedDate(b, 't2038_requested')),
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

  const writeIlsChangeLog = async (payload: {
    memberId: string;
    clientId2: string;
    memberName: string;
    queue: string;
    changes: Record<string, any>;
  }) => {
    if (!auth?.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch('/api/admin/ils-change-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        action: 'create',
        eventType: 'queue_change',
        queueChangeFlag: true,
        ...payload,
      }),
    });
  };

  const loadIlsChangeLog = async () => {
    try {
      if (!auth?.currentUser) return;
      setIsLoadingIlsLog(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-change-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, action: 'list', limit: 300 }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load ILS queue change log');
      }
      setIlsLogRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Log Load Failed',
        description: error?.message || 'Could not load ILS queue change log.',
      });
    } finally {
      setIsLoadingIlsLog(false);
    }
  };

  const openCardEdit = (queue: 'tier_level_requested' | 'rb_sent_pending_ils_contract', memberId: string) => {
    const member = members.find((m) => String(m.id || '') === String(memberId || ''));
    if (!member) return;
    setCardEditQueue(queue);
    setCardEditMemberId(String(member.id || ''));
    setCardEditTierLevel(String(member.Kaiser_Tier_Level || '').trim());
    setCardEditTierReceivedDate(toYmd(member.Kaiser_Tier_Level_Received_Date));
    setCardEditRbReceivedDate(toYmd(member.Kaiser_H2022_Received));
    setCardEditOpen(true);
  };

  const handleSaveCardEdit = async () => {
    if (!cardEditQueue || !cardEditMemberId) return;
    const member = members.find((m) => String(m.id || '') === String(cardEditMemberId || ''));
    if (!member) return;
    const updates: Partial<ILSReportMember> = {};
    const changes: Record<string, any> = {};
    if (cardEditQueue === 'tier_level_requested') {
      updates.Kaiser_Tier_Level = String(cardEditTierLevel || '').trim();
      updates.Kaiser_Tier_Level_Received_Date = toYmd(cardEditTierReceivedDate);
      changes.Kaiser_Tier_Level = updates.Kaiser_Tier_Level || '';
      changes.Kaiser_Tier_Level_Received_Date = updates.Kaiser_Tier_Level_Received_Date || '';
    } else if (cardEditQueue === 'rb_sent_pending_ils_contract') {
      updates.Kaiser_H2022_Received = toYmd(cardEditRbReceivedDate);
      changes.Kaiser_H2022_Received = updates.Kaiser_H2022_Received || '';
    }
    await saveMemberDates(cardEditMemberId, updates);
    await writeIlsChangeLog({
      memberId: String(member.id || ''),
      clientId2: String(member.client_ID2 || ''),
      memberName: String(member.memberName || ''),
      queue: cardEditQueue,
      changes,
    });
    await loadIlsChangeLog();
    setCardEditOpen(false);
    setCardEditQueue(null);
    setCardEditMemberId('');
  };

  // Generate printable PDF report
  const generatePrintableReport = (opts?: { includeT2038?: boolean; title?: string; downloadName?: string }) => {
    const includeT2038 = Boolean(opts?.includeT2038);
    const reportTitle = opts?.title || 'ILS Member Update';
    const downloadName = opts?.downloadName || `ILS_Member_Update_${format(new Date(reportDate), 'yyyy-MM-dd')}.html`;
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
          birthDate: toYmd(m.birthDate),
          rcfeName: String(m.RCFE_Name || '').trim(),
          rcfeAdminName: String(m.RCFE_Admin_Name || '').trim(),
          rcfeAdminEmail: String(m.RCFE_Admin_Email || '').trim(),
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
      t2038Requested: makeRows('t2038_requested'),
      tierRequested: makeRows('tier_level_requested'),
      rbPendingIlsContract: makeRows('rb_sent_pending_ils_contract'),
      t2038AuthOnly: makeRows('t2038_auth_only_email'),
    };

    const uniqueMemberIds = new Set<string>([
      ...queues.t2038Requested.map((r) => r.id).filter(Boolean),
      ...queues.tierRequested.map((r) => r.id).filter(Boolean),
      ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
      ...(includeT2038 ? queues.t2038AuthOnly.map((r) => r.id).filter(Boolean) : []),
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
    <title>${escapeHtml(reportTitle)} - ${format(new Date(reportDate), 'MMM dd, yyyy')}</title>
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
        <h1>${escapeHtml(reportTitle)}</h1>
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
      ${includeT2038
        ? `<div class="pill"><strong>T2038 Auth Only Email:</strong> ${reportData.queues.t2038AuthOnly.length}</div>`
        : `
      <div class="pill"><strong>T2038 Requested:</strong> ${reportData.queues.t2038Requested.length}</div>
      <div class="pill"><strong>Tier Level Requested:</strong> ${reportData.queues.tierRequested.length}</div>
      <div class="pill"><strong>R &amp; B Pending ILS Contract:</strong> ${reportData.queues.rbPendingIlsContract.length}</div>
      `}
    </div>

    <div class="grid">
      ${(includeT2038
        ? [{ key: 't2038AuthOnly', label: 'T2038 Auth Only Email' }]
        : [
            { key: 't2038Requested', label: 'T2038 Requested' },
            { key: 'tierRequested', label: 'Tier Level Requested' },
            { key: 'rbPendingIlsContract', label: 'R & B Sent Pending ILS Contract' },
          ]
      ).map((q) => {
        const rows = (reportData.queues as any)[q.key] as Array<{
          memberName: string;
          memberMrn: string;
          birthDate?: string;
          rcfeName?: string;
          rcfeAdminName?: string;
          rcfeAdminEmail?: string;
          requestedDate: string;
        }>;
        return `
          <div class="card">
            <h2>${q.label} (${rows.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>MRN / Birth Date</th>
                  <th>Request Date</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length === 0 ? `<tr><td colspan="3" style="color:#777;">None</td></tr>` : rows.map((r) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(r.memberName || '—')}</strong>
                      ${q.key === 'rbPendingIlsContract' ? `<br><span style="color:#666;">RCFE: ${escapeHtml(r.rcfeName || '—')}</span><br><span style="color:#666;">RCFE Admin Name: ${escapeHtml(r.rcfeAdminName || '—')}</span><br><span style="color:#666;">RCFE Admin Email: ${escapeHtml(r.rcfeAdminEmail || '—')}</span>` : ''}
                    </td>
                    <td>${escapeHtml(r.memberMrn || '—')}<br><span style="color:#666;">Birth Date: ${escapeHtml(r.birthDate ? format(new Date(`${r.birthDate}T00:00:00`), 'MM/dd/yyyy') : '—')}</span></td>
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
      link.download = downloadName;
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
          birthDate: toYmd(m.birthDate),
          rcfeName: String(m.RCFE_Name || '').trim(),
          rcfeAdminName: String(m.RCFE_Admin_Name || '').trim(),
          rcfeAdminEmail: String(m.RCFE_Admin_Email || '').trim(),
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
      t2038Requested: makeRows('t2038_requested'),
      tierRequested: makeRows('tier_level_requested'),
      rbPendingIlsContract: makeRows('rb_sent_pending_ils_contract'),
      t2038AuthOnly: makeRows('t2038_auth_only_email'),
    };
  }, [members]);

  // Statistics for the requested queues
  const stats = useMemo(() => {
    const uniqueMemberIds = new Set<string>([
      ...queues.t2038Requested.map((r) => r.id).filter(Boolean),
      ...queues.tierRequested.map((r) => r.id).filter(Boolean),
      ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
    ]);
    return {
      totalInQueues: uniqueMemberIds.size,
      t2038AuthOnly: queues.t2038AuthOnly.length,
      t2038Requested: queues.t2038Requested.length,
      tierRequested: queues.tierRequested.length,
      rbPendingIlsContract: queues.rbPendingIlsContract.length,
    };
  }, [queues.rbPendingIlsContract, queues.t2038AuthOnly, queues.t2038Requested, queues.tierRequested]);

  const ilsLogFilteredRows = useMemo(() => {
    const q = ilsLogSearch.trim().toLowerCase();
    if (!q) return ilsLogRows;
    return ilsLogRows.filter((r) => {
      const memberName = String(r.memberName || '').toLowerCase();
      const clientId2 = String(r.clientId2 || '').toLowerCase();
      const queue = String(r.queue || '').toLowerCase();
      const changedBy = String(r.changedByEmail || '').toLowerCase();
      return memberName.includes(q) || clientId2.includes(q) || queue.includes(q) || changedBy.includes(q);
    });
  }, [ilsLogRows, ilsLogSearch]);

  const queueLabel = (value: string) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'tier_level_requested') return 'Tier Level Requested';
    if (v === 'rb_sent_pending_ils_contract') return 'R & B Sent Pending ILS Contract';
    if (v === 't2038_requested') return 'T2038 Requested';
    if (v === 't2038_auth_only_email') return 'T2038 Auth Only Email';
    return value || 'Unknown Queue';
  };

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

  useEffect(() => {
    loadIlsChangeLog().catch(() => {});
  }, [auth?.currentUser?.uid]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Member Update</h1>
          <p className="text-muted-foreground">
            Review and update key Kaiser timeline dates (then generate a printable report if needed)
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
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
              
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={loadMembers}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full sm:w-auto justify-start bg-green-50 hover:bg-green-100 border-green-200"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  {members.length === 0 ? 'Load Members' : 'Refresh Data'}
                </Button>
                
                <Button
                  onClick={() =>
                    generatePrintableReport({
                      includeT2038: false,
                      title: 'ILS Member Update - Tier + R&B Queues',
                      downloadName: `ILS_Tier_RB_Queues_${format(new Date(reportDate), 'yyyy-MM-dd')}.html`,
                    })
                  }
                  disabled={members.length === 0}
                  className="w-full sm:w-auto justify-start bg-blue-600 hover:bg-blue-700"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Generate Tier + R&B PDF
                </Button>

                <Button
                  onClick={() =>
                    generatePrintableReport({
                      includeT2038: true,
                      title: 'T2038 Auth Only Email Queue',
                      downloadName: `T2038_Auth_Only_Queue_${format(new Date(reportDate), 'yyyy-MM-dd')}.html`,
                    })
                  }
                  disabled={members.length === 0}
                  variant="outline"
                  className="w-full sm:w-auto justify-start"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  T2038 PDF
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto justify-start"
                  onClick={() => setT2038ModalOpen(true)}
                  disabled={queues.t2038AuthOnly.length === 0}
                >
                  T2038 Auth Only ({queues.t2038AuthOnly.length})
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  These comments will be included in the printable report for ILS
                </p>
                <Button
                  onClick={saveComments}
                  size="sm"
                  variant="outline"
                  disabled={!reportComments.trim()}
                  className="w-full sm:w-auto"
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
                <p className="text-2xl font-bold text-yellow-700">{stats.t2038Requested}</p>
                <p className="text-xs text-muted-foreground">T2038 Requested</p>
              </div>
              <Clock className="h-4 w-4 text-yellow-700" />
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

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-indigo-700">{stats.rbPendingIlsContract}</p>
                <p className="text-xs text-muted-foreground">R & B Sent Pending ILS Contract</p>
              </div>
              <Clock className="h-4 w-4 text-indigo-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compact visual "graph" of requested queues */}
      <Card>
        <CardHeader>
          <CardTitle>Requested queues</CardTitle>
          <CardDescription>Member name • MRN • Birth Date • Request Date</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-sm text-muted-foreground">Load members to see the requested queues.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(
                [
                  {
                    key: 't2038Requested' as const,
                    queueKey: 't2038_requested' as const,
                    label: 'T2038 Requested',
                    rows: queues.t2038Requested,
                    editable: false,
                  },
                  {
                    key: 'tierRequested' as const,
                    queueKey: 'tier_level_requested' as const,
                    label: 'Tier Level Requested',
                    rows: queues.tierRequested,
                    editable: true,
                  },
                  {
                    key: 'rbPendingIlsContract' as const,
                    queueKey: 'rb_sent_pending_ils_contract' as const,
                    label: 'R & B Sent Pending ILS Contract',
                    rows: queues.rbPendingIlsContract,
                    editable: true,
                  },
                ] as const
              ).map((q) => (
                <div key={q.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{q.label}</div>
                    <Badge variant="secondary">{q.rows.length}</Badge>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Member / MRN / Birth Date</span>
                    <span className="hidden sm:inline font-medium">Request Date</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {q.rows.length === 0 ? (
                      <div className="text-muted-foreground">None</div>
                    ) : (
                      q.rows.slice(0, 60).map((r) => (
                        <div key={`${q.key}-${r.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.memberName || '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              MRN: <span className="font-mono">{r.memberMrn || '—'}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Birth Date:{' '}
                              <span className="font-mono">
                                {r.birthDate ? format(new Date(`${r.birthDate}T00:00:00`), 'MM/dd/yyyy') : '—'}
                              </span>
                            </div>
                            {q.queueKey === 'rb_sent_pending_ils_contract' ? (
                              <>
                                <div className="text-xs text-muted-foreground">
                                  RCFE: <span className="font-medium">{(r as any).rcfeName || '—'}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  RCFE Admin Name: <span className="font-medium">{(r as any).rcfeAdminName || '—'}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  RCFE Admin Email: <span className="font-mono">{(r as any).rcfeAdminEmail || '—'}</span>
                                </div>
                              </>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div className="text-xs font-mono text-muted-foreground">
                              {r.requestedDate ? format(new Date(`${r.requestedDate}T00:00:00`), 'MM/dd/yyyy') : '—'}
                            </div>
                            {q.editable ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1 text-[11px] mt-1"
                                onClick={() => openCardEdit(q.queueKey, r.id)}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            ) : null}
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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                ILS Queue Change Log
              </CardTitle>
              <CardDescription>
                Queue edits are flagged here immediately after save.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadIlsChangeLog} disabled={isLoadingIlsLog} className="w-full sm:w-auto">
              {isLoadingIlsLog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Log
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search by member, Client ID2, queue, or email"
              value={ilsLogSearch}
              onChange={(e) => setIlsLogSearch(e.target.value)}
              className="w-full sm:max-w-xl"
            />
            <Badge variant="secondary" className="self-start sm:self-auto">{ilsLogFilteredRows.length}</Badge>
          </div>
          <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
            {ilsLogFilteredRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No queue changes logged yet.</div>
            ) : (
              ilsLogFilteredRows.slice(0, 150).map((row) => {
                const changeEntries = Object.entries(row.changes || {});
                return (
                  <div key={`ils-log-${row.id}`} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-900 border-amber-200">Queue Change</Badge>
                      <Badge variant="outline">{queueLabel(row.queue)}</Badge>
                      <div className="text-xs text-muted-foreground">
                        {row.createdAtIso ? format(new Date(row.createdAtIso), 'MM/dd/yyyy h:mm a') : 'Time unavailable'}
                      </div>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="font-medium">{row.memberName || 'Member'}</span>
                      {row.clientId2 ? <span className="text-muted-foreground"> • Client ID2: {row.clientId2}</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Changed by: {row.changedByEmail || 'Unknown'}
                    </div>
                    {changeEntries.length > 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {changeEntries.map(([key, value]) => `${key}: ${String(value || '—')}`).join(' • ')}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
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

      <Dialog open={t2038ModalOpen} onOpenChange={setT2038ModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>T2038 Auth Only Email</DialogTitle>
            <DialogDescription>
              {queues.t2038AuthOnly.length} member(s). This section is separate and not included in Tier/R&B queue totals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  generatePrintableReport({
                    includeT2038: true,
                    title: 'T2038 Auth Only Email Queue',
                    downloadName: `T2038_Auth_Only_Queue_${format(new Date(reportDate), 'yyyy-MM-dd')}.html`,
                  })
                }
                disabled={queues.t2038AuthOnly.length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print T2038
              </Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {queues.t2038AuthOnly.length === 0 ? (
                <div className="text-sm text-muted-foreground">No T2038 Auth Only members right now.</div>
              ) : (
                queues.t2038AuthOnly.slice(0, 300).map((r) => (
                  <div key={`t2038-modal-${r.id}`} className="rounded-md border p-2">
                    <div className="font-medium">{r.memberName || '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      MRN: {r.memberMrn || '—'} • Birth Date:{' '}
                      {r.birthDate ? format(new Date(`${r.birthDate}T00:00:00`), 'MM/dd/yyyy') : '—'} • Request Date:{' '}
                      {r.requestedDate ? format(new Date(`${r.requestedDate}T00:00:00`), 'MM/dd/yyyy') : '—'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cardEditOpen}
        onOpenChange={(open) => {
          setCardEditOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cardEditQueue === 'tier_level_requested' ? 'Edit Tier Level Requested' : 'Edit R & B Sent Pending ILS Contract'}
            </DialogTitle>
            <DialogDescription>
              Update ILS fields directly from this queue row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {cardEditQueue === 'tier_level_requested' ? (
              <>
                <div className="space-y-2">
                  <Label>Tier Level</Label>
                  <Select value={cardEditTierLevel || 'none'} onValueChange={(v) => setCardEditTierLevel(v === 'none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tier level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tier Level Received Date</Label>
                  <Input
                    type="date"
                    value={cardEditTierReceivedDate}
                    onChange={(e) => setCardEditTierReceivedDate(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>R &amp; B Sent Pending ILS Contract Received Date</Label>
                <Input
                  type="date"
                  value={cardEditRbReceivedDate}
                  onChange={(e) => setCardEditRbReceivedDate(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCardEditOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveCardEdit} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}