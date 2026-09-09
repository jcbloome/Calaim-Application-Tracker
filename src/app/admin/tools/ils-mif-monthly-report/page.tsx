'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { Loader2, Download, RefreshCw } from 'lucide-react';
import {
  annotateIlsMifRowsWithCaspioMembers,
  parseIlsMifSpreadsheetWorkbook,
  type IlsMifMasterRow,
} from '@/lib/ils-mif-parse';
import {
  CS_ENGAGEMENT_LABELS,
  defaultRtfProductionDate,
  defaultRtfReportingPeriod,
  deriveHasMemberBeenHoused,
  fillIlsRtfWorkbook,
  mapKaiserStatusToCsEngagement,
  OUTREACH_METHOD_LABELS,
  OUTREACH_METHOD_TELEPHONIC,
  parseIlsRtfTemplateFromWorkbook,
  pickFirstAndLastNotes,
  PROVIDER_TYPE_NON_CLINICAL,
  type CsMemberEngagementCode,
  type IlsRtfRowValues,
  type IlsRtfTemplate,
} from '@/lib/ils-mif-rtf-cs';

type MemberNote = {
  id: string;
  clientId2: string;
  noteText: string;
  createdAt: string;
  createdByName?: string;
};

type CaspioMemberLookup = {
  rcfeName: string;
  authorizationNumber: string;
  kaiserStatus: string;
};

type MonthlyReportRow = {
  rowId: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  caspioExists: boolean;
  caspioMatchedBy: string;
  caspioMatchedClientId2: string;
  caspioKaiserStatus: string;
  rcfeName: string;
  authorizationNumber: string;
  engagementCode: CsMemberEngagementCode;
  outreachMethod: 1 | 2 | 3;
  providerType: 1 | 2;
  hasMemberBeenHoused: 0 | 1 | '';
  dateOfOutreachAttempt: string;
  firstOutreachDate: string;
  firstOutreachNote: string;
  lastContactDate: string;
  lastContactNote: string;
};

type NotesProgress = {
  total: number;
  complete: number;
  success: number;
  failed: number;
  currentMember: string;
};

const memberDisplayName = (row: Pick<MonthlyReportRow, 'memberLastName' | 'memberFirstName'>) =>
  `${row.memberLastName}, ${row.memberFirstName}`.trim().replace(/^,\s*/, '');

const pickCaspioAuthNumber = (member: Record<string, unknown> | undefined) =>
  String(
    member?.Authorization_Number_T038 ||
      member?.Authorization_Number_T2038 ||
      member?.authorizationNumberT2038 ||
      ''
  ).trim();

function buildCaspioLookupMap(members: any[]): Map<string, CaspioMemberLookup> {
  const map = new Map<string, CaspioMemberLookup>();
  for (const member of members) {
    const clientId2 = String(member?.client_ID2 || member?.Client_ID2 || '').trim();
    if (!clientId2) continue;
    map.set(clientId2, {
      rcfeName: String(member?.RCFE_Name || member?.ispFacilityName || '').trim(),
      authorizationNumber: pickCaspioAuthNumber(member?.caspioRaw || member),
      kaiserStatus: String(member?.Kaiser_Status || member?.Kaiser_ID_Status || '').trim(),
    });
  }
  return map;
}

function buildReportRowFromMif(
  mifRow: IlsMifMasterRow,
  notes: MemberNote[] = [],
  caspioLookup?: CaspioMemberLookup
): MonthlyReportRow {
  const noteSummary = pickFirstAndLastNotes(notes);
  const kaiserStatus = String(
    mifRow.caspioKaiserStatus || caspioLookup?.kaiserStatus || ''
  ).trim();
  const rcfeName = String(caspioLookup?.rcfeName || '').trim();
  const engagementCode = mapKaiserStatusToCsEngagement(kaiserStatus);
  const authorizationNumber =
    String(mifRow.authorizationNumberT2038 || '').trim() ||
    String(caspioLookup?.authorizationNumber || '').trim();

  return {
    rowId: mifRow.rowId,
    memberFirstName: mifRow.memberFirstName,
    memberLastName: mifRow.memberLastName,
    memberMrn: mifRow.memberMrn,
    memberMediCalNum: mifRow.memberMediCalNum,
    caspioExists: Boolean(mifRow.caspioExists),
    caspioMatchedBy: String(mifRow.caspioMatchedBy || ''),
    caspioMatchedClientId2: String(mifRow.caspioMatchedClientId2 || ''),
    caspioKaiserStatus: kaiserStatus,
    rcfeName,
    authorizationNumber,
    engagementCode,
    outreachMethod: OUTREACH_METHOD_TELEPHONIC,
    providerType: PROVIDER_TYPE_NON_CLINICAL,
    hasMemberBeenHoused: deriveHasMemberBeenHoused(rcfeName, kaiserStatus),
    dateOfOutreachAttempt: noteSummary.lastNoteDate,
    firstOutreachDate: noteSummary.firstNoteDate,
    firstOutreachNote: noteSummary.firstNoteText,
    lastContactDate: noteSummary.lastNoteDate,
    lastContactNote: noteSummary.lastNoteText,
  };
}

export default function IlsMifMonthlyReportPage() {
  const { toast } = useToast();
  const auth = useAuth();

  const [accessLoading, setAccessLoading] = useState(true);
  const [canAccessIlsTools, setCanAccessIlsTools] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('');
  const [rtfTemplateFileName, setRtfTemplateFileName] = useState('');
  const [rows, setRows] = useState<MonthlyReportRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingMif, setLoadingMif] = useState(false);
  const [loadingRtfTemplate, setLoadingRtfTemplate] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesProgress, setNotesProgress] = useState<NotesProgress | null>(null);
  const [rtfProductionDate, setRtfProductionDate] = useState(defaultRtfProductionDate());
  const [rtfReportingPeriod, setRtfReportingPeriod] = useState(defaultRtfReportingPeriod());

  const notesByClientIdRef = useRef<Record<string, MemberNote[]>>({});
  const caspioLookupRef = useRef<Map<string, CaspioMemberLookup>>(new Map());
  const originalWorkbookRef = useRef<ArrayBuffer | null>(null);
  const rtfTemplateRef = useRef<IlsRtfTemplate | null>(null);
  const stopNotesRef = useRef(false);

  const checkIlsToolsAccess = useCallback(async () => {
    if (!auth?.currentUser) {
      setCanAccessIlsTools(false);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-member-access', {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      setCanAccessIlsTools(Boolean(res.ok && data?.success && data?.canAccessIlsMembersPage));
    } catch {
      setCanAccessIlsTools(false);
    } finally {
      setAccessLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void checkIlsToolsAccess();
  }, [checkIlsToolsAccess]);

  const fetchMemberNotes = useCallback(async (clientId2: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      clientId2,
      forceSync: 'false',
      skipSync: 'true',
      repairIfEmpty: 'true',
    });
    const res = await fetch(`/api/member-notes?${query.toString()}`, { signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || `Failed to load notes for ${clientId2}`);
    }
    const notes = Array.isArray(data?.notes) ? (data.notes as MemberNote[]) : [];
    notesByClientIdRef.current[clientId2] = notes;
    return notes;
  }, []);

  const buildRowsFromAnnotated = useCallback((annotated: IlsMifMasterRow[]) => {
    return annotated.map((row) => {
      const clientId2 = String(row.caspioMatchedClientId2 || '').trim();
      const notes = clientId2 ? notesByClientIdRef.current[clientId2] || [] : [];
      const lookup = clientId2 ? caspioLookupRef.current.get(clientId2) : undefined;
      return buildReportRowFromMif(row, notes, lookup);
    });
  }, []);

  const loadNotesForRows = useCallback(
    async (mifRows: IlsMifMasterRow[]) => {
      const matched = mifRows.filter((row) => String(row.caspioMatchedClientId2 || '').trim());
      if (!matched.length) return;

      stopNotesRef.current = false;
      setLoadingNotes(true);
      setNotesProgress({
        total: matched.length,
        complete: 0,
        success: 0,
        failed: 0,
        currentMember: '',
      });

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let idx = 0;
      const concurrency = 3;

      const worker = async () => {
        while (true) {
          if (stopNotesRef.current) return;
          const i = idx;
          idx += 1;
          if (i >= matched.length) return;

          const mifRow = matched[i];
          const clientId2 = String(mifRow.caspioMatchedClientId2 || '').trim();
          setNotesProgress((prev) =>
            prev
              ? {
                  ...prev,
                  currentMember: memberDisplayName({
                    memberFirstName: mifRow.memberFirstName,
                    memberLastName: mifRow.memberLastName,
                  }),
                }
              : prev
          );

          try {
            await fetchMemberNotes(clientId2);
            setNotesProgress((prev) =>
              prev ? { ...prev, complete: prev.complete + 1, success: prev.success + 1 } : prev
            );
          } catch {
            setNotesProgress((prev) =>
              prev ? { ...prev, complete: prev.complete + 1, failed: prev.failed + 1 } : prev
            );
          }
          await delay(80);
        }
      };

      try {
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
      } finally {
        setLoadingNotes(false);
        setNotesProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
      }
    },
    [fetchMemberNotes]
  );

  const handleUploadMif = useCallback(
    async (file: File) => {
      setLoadingMif(true);
      try {
        const workbookBuffer = await file.arrayBuffer();
        originalWorkbookRef.current = workbookBuffer;

        const parsed = await parseIlsMifSpreadsheetWorkbook(file);
        const res = await fetch('/api/kaiser-members');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to load Caspio members (HTTP ${res.status})`);
        }

        const members = Array.isArray(data?.members) ? data.members : [];
        caspioLookupRef.current = buildCaspioLookupMap(members);
        const annotated = annotateIlsMifRowsWithCaspioMembers(parsed.members, members);

        notesByClientIdRef.current = {};
        setSourceFileName(file.name);
        setRows(buildRowsFromAnnotated(annotated));

        toast({
          title: 'MIF loaded',
          description: `Parsed ${annotated.length} members from ${file.name}. Loading notes…`,
        });

        await loadNotesForRows(annotated);
        setRows(buildRowsFromAnnotated(annotated));

        toast({
          title: 'Report ready',
          description: `Matched ${annotated.filter((r) => r.caspioExists).length} of ${annotated.length} to Caspio.`,
        });
      } catch (error: any) {
        toast({
          title: 'Upload failed',
          description: error?.message || 'Could not parse the ILS MIF file.',
          variant: 'destructive',
        });
      } finally {
        setLoadingMif(false);
      }
    },
    [buildRowsFromAnnotated, loadNotesForRows, toast]
  );

  const handleUploadRtfTemplate = useCallback(
    async (file: File) => {
      setLoadingRtfTemplate(true);
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const template = parseIlsRtfTemplateFromWorkbook(wb, XLSX, file.name);
        if (!template) {
          throw new Error('Could not find an RTF worksheet in that file.');
        }
        rtfTemplateRef.current = template;
        setRtfTemplateFileName(file.name);
        toast({
          title: 'RTF template loaded',
          description: `Using "${template.sheetName}" headers from ${file.name}.`,
        });
      } catch (error: any) {
        rtfTemplateRef.current = null;
        setRtfTemplateFileName('');
        toast({
          title: 'RTF template failed',
          description: error?.message || 'Could not read the RTF example file.',
          variant: 'destructive',
        });
      } finally {
        setLoadingRtfTemplate(false);
      }
    },
    [toast]
  );

  const refreshNotes = useCallback(async () => {
    if (!rows.length) return;
    const clientIds = [...new Set(rows.map((r) => r.caspioMatchedClientId2).filter(Boolean))];
    if (!clientIds.length) {
      toast({ title: 'No matched members', description: 'Upload a MIF with Caspio matches first.' });
      return;
    }

    stopNotesRef.current = false;
    setLoadingNotes(true);
    setNotesProgress({
      total: clientIds.length,
      complete: 0,
      success: 0,
      failed: 0,
      currentMember: '',
    });

    for (const clientId2 of clientIds) {
      if (stopNotesRef.current) break;
      const row = rows.find((r) => r.caspioMatchedClientId2 === clientId2);
      setNotesProgress((prev) =>
        prev
          ? {
              ...prev,
              currentMember: row ? memberDisplayName(row) : clientId2,
            }
          : prev
      );
      try {
        await fetchMemberNotes(clientId2);
        setNotesProgress((prev) =>
          prev ? { ...prev, complete: prev.complete + 1, success: prev.success + 1 } : prev
        );
      } catch {
        setNotesProgress((prev) =>
          prev ? { ...prev, complete: prev.complete + 1, failed: prev.failed + 1 } : prev
        );
      }
    }

    setRows((prev) =>
      prev.map((row) => {
        const notes = row.caspioMatchedClientId2
          ? notesByClientIdRef.current[row.caspioMatchedClientId2] || []
          : [];
        const lookup = row.caspioMatchedClientId2
          ? caspioLookupRef.current.get(row.caspioMatchedClientId2)
          : undefined;
        const noteSummary = pickFirstAndLastNotes(notes);
        const kaiserStatus = row.caspioKaiserStatus || lookup?.kaiserStatus || '';
        const rcfeName = row.rcfeName || lookup?.rcfeName || '';
        return {
          ...row,
          rcfeName,
          dateOfOutreachAttempt: noteSummary.lastNoteDate,
          firstOutreachDate: noteSummary.firstNoteDate,
          firstOutreachNote: noteSummary.firstNoteText,
          lastContactDate: noteSummary.lastNoteDate,
          lastContactNote: noteSummary.lastNoteText,
          hasMemberBeenHoused: deriveHasMemberBeenHoused(rcfeName, kaiserStatus),
        };
      })
    );

    setLoadingNotes(false);
    setNotesProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
    toast({ title: 'Notes refreshed', description: `Reloaded notes for ${clientIds.length} members.` });
  }, [fetchMemberNotes, rows, toast]);

  const updateRow = useCallback((rowId: string, patch: Partial<MonthlyReportRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = { ...row, ...patch };
        if ('rcfeName' in patch || 'caspioKaiserStatus' in patch) {
          next.hasMemberBeenHoused = deriveHasMemberBeenHoused(next.rcfeName, next.caspioKaiserStatus);
        }
        return next;
      })
    );
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.memberFirstName,
        row.memberLastName,
        row.memberMrn,
        row.memberMediCalNum,
        row.caspioMatchedClientId2,
        row.caspioKaiserStatus,
        row.rcfeName,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.caspioExists).length;
    const unmatched = rows.length - matched;
    const housed = rows.filter((r) => r.hasMemberBeenHoused === 1).length;
    const byEngagement = rows.reduce(
      (acc, row) => {
        acc[row.engagementCode] = (acc[row.engagementCode] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>
    );
    return { matched, unmatched, housed, byEngagement };
  }, [rows]);

  const exportFilledWorkbook = useCallback(() => {
    if (!originalWorkbookRef.current) {
      toast({
        title: 'Original MIF required',
        description: 'Upload the original ILS MIF workbook first.',
        variant: 'destructive',
      });
      return;
    }
    if (!filteredRows.length) {
      toast({ title: 'Nothing to export', description: 'Load a MIF and build the report first.' });
      return;
    }

    try {
      const reportValues: IlsRtfRowValues[] = filteredRows.map((row) => ({
        mrn: row.memberMrn,
        cin: row.memberMediCalNum,
        engagementCode: row.engagementCode,
        authorizationNumber: row.authorizationNumber,
        outreachMethod: row.outreachMethod,
        providerType: row.providerType,
        dateOfOutreachAttempt: row.dateOfOutreachAttempt,
        hasMemberBeenHoused: row.hasMemberBeenHoused,
        rtfProductionDate,
        rtfReportingPeriod,
      }));

      const filled = fillIlsRtfWorkbook(
        originalWorkbookRef.current,
        reportValues,
        rtfTemplateRef.current,
        XLSX
      );

      const blob = new Blob([filled], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.download = `ILS_MIF_RTF_Filled_${stamp}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Workbook exported',
        description: `Filled RTF fields for ${reportValues.length} members. MIF tab unchanged.`,
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error?.message || 'Could not fill the RTF workbook.',
        variant: 'destructive',
      });
    }
  }, [filteredRows, rtfProductionDate, rtfReportingPeriod, toast]);

  if (accessLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Checking ILS tools access...
        </div>
      </div>
    );
  }

  if (!canAccessIlsTools) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need ILS tools access to use the monthly MIF RTF report.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Monthly MIF → RTF</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload the original ILS CS MIF workbook, match Caspio, auto-fill RTF response fields only, then download the same workbook with RTF populated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!rows.length || loadingNotes}
            onClick={() => void refreshNotes()}
          >
            {loadingNotes ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh notes
          </Button>
          <Button type="button" disabled={!filteredRows.length || !sourceFileName} onClick={exportFilledWorkbook}>
            <Download className="h-4 w-4 mr-2" />
            Download filled MIF/RTF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Original ILS MIF workbook</CardTitle>
            <CardDescription>
              Upload the monthly file from ILS (MIF tab is read-only; we only write RTF response columns).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={loadingMif || loadingNotes}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadMif(file);
                e.currentTarget.value = '';
              }}
            />
            <p className="text-xs text-muted-foreground">
              {sourceFileName ? `Loaded: ${sourceFileName}` : 'No MIF loaded yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Previous RTF example (optional)</CardTitle>
            <CardDescription>
              Upload a past submission (e.g. June) so we match the exact RTF column headers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={loadingRtfTemplate}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadRtfTemplate(file);
                e.currentTarget.value = '';
              }}
            />
            <p className="text-xs text-muted-foreground">
              {loadingRtfTemplate
                ? 'Reading RTF template…'
                : rtfTemplateFileName
                  ? `Template: ${rtfTemplateFileName}${rtfTemplateRef.current ? ` (${rtfTemplateRef.current.sheetName})` : ''}`
                  : 'Optional — uses RTF tab headers from the MIF if not provided'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">MIF members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Caspio matched</CardTitle>
            <CardDescription>{stats.unmatched} unmatched</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.matched}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Has been housed</CardTitle>
            <CardDescription>RCFE + Final/Placed/H2022</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.housed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending outreach</CardTitle>
            <CardDescription>Code 1</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.byEngagement[1] || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Delivering service</CardTitle>
            <CardDescription>Code 3</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.byEngagement[3] || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">RTF metadata</CardTitle>
          <CardDescription>Applied to every exported RTF row</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">RTF Production Date (MM/DD/YYYY)</label>
            <Input value={rtfProductionDate} onChange={(e) => setRtfProductionDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Reporting Period (MM/DD/YYYY.MM/DD/YYYY)</label>
            <Input value={rtfReportingPeriod} onChange={(e) => setRtfReportingPeriod(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {notesProgress ? (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Notes progress</span>
              <span>
                {notesProgress.complete}/{notesProgress.total}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-200 overflow-hidden">
              <div
                className="h-2 bg-blue-600"
                style={{
                  width: `${notesProgress.total > 0 ? (notesProgress.complete / notesProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Success: {notesProgress.success} • Failed: {notesProgress.failed}
              {notesProgress.currentMember ? ` • ${notesProgress.currentMember}` : ''}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Report preview</CardTitle>
          <CardDescription>
            Provider Type defaults to 2 (non-clinical). Outreach method defaults to 2 (Telephonic). Has Member Been Housed = 1 when RCFE is set and status is Final- Member at RCFE, Placed, or On H2022 Revisits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, MRN, CIN, RCFE, Kaiser status…"
          />
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Member</th>
                  <th className="px-3 py-2 text-left font-medium">MRN</th>
                  <th className="px-3 py-2 text-left font-medium">Kaiser status</th>
                  <th className="px-3 py-2 text-left font-medium">RCFE</th>
                  <th className="px-3 py-2 text-left font-medium">Engagement</th>
                  <th className="px-3 py-2 text-left font-medium">Outreach</th>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-left font-medium">Housed</th>
                  <th className="px-3 py-2 text-left font-medium">First outreach</th>
                  <th className="px-3 py-2 text-left font-medium">Last contact</th>
                  <th className="px-3 py-2 text-left font-medium">Auth #</th>
                  <th className="px-3 py-2 text-left font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                      Upload the original ILS CS MIF workbook to begin.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.rowId} className="border-t align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{memberDisplayName(row)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.memberMrn || '—'}</td>
                      <td className="px-3 py-2 min-w-[180px]">{row.caspioKaiserStatus || '—'}</td>
                      <td className="px-3 py-2 min-w-[120px] text-xs">{row.rcfeName || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          value={row.engagementCode}
                          onChange={(e) =>
                            updateRow(row.rowId, {
                              engagementCode: Number(e.target.value) as CsMemberEngagementCode,
                            })
                          }
                        >
                          {(Object.entries(CS_ENGAGEMENT_LABELS) as [string, string][]).map(([code, label]) => (
                            <option key={code} value={code}>
                              {code}. {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          value={row.outreachMethod}
                          onChange={(e) =>
                            updateRow(row.rowId, {
                              outreachMethod: Number(e.target.value) as 1 | 2 | 3,
                            })
                          }
                        >
                          {(Object.entries(OUTREACH_METHOD_LABELS) as [string, string][]).map(([code, label]) => (
                            <option key={code} value={code}>
                              {code}. {label}
                            </option>
                          ))}
                        </select>
                        <Input
                          className="mt-1 h-8 text-xs"
                          value={row.dateOfOutreachAttempt}
                          onChange={(e) => updateRow(row.rowId, { dateOfOutreachAttempt: e.target.value })}
                          placeholder="MM/DD/YYYY"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">2 — Non-clinical</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.hasMemberBeenHoused === 1 ? (
                          <span className="text-green-700">1 — Yes</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 min-w-[200px]">
                        <div className="text-xs text-muted-foreground">{row.firstOutreachDate || '—'}</div>
                        <div className="text-xs line-clamp-3">{row.firstOutreachNote || '—'}</div>
                      </td>
                      <td className="px-3 py-2 min-w-[200px]">
                        <div className="text-xs text-muted-foreground">{row.lastContactDate || '—'}</div>
                        <div className="text-xs line-clamp-3">{row.lastContactNote || '—'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 w-28 text-xs"
                          value={row.authorizationNumber}
                          onChange={(e) => updateRow(row.rowId, { authorizationNumber: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.caspioExists ? (
                          <span className="text-green-700">{row.caspioMatchedBy || 'matched'}</span>
                        ) : (
                          <span className="text-amber-700">Unmatched</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
