'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Mail,
  Send,
  TestTube2,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildUisNoticePlainText,
  findMediCalColumnIndex,
  normalizeMediCalId,
  UIS_HEALTH_NET_HOME_URL,
  UIS_HEALTH_NET_TRANSITION_URL,
  UIS_NOTICE_SUBJECT,
  type UisMatchedMember,
  type UisRcfeGroup,
} from '@/lib/uis-rcfe-notice';

const formatMemberHoverLabel = (member: UisMatchedMember) => {
  const name = [member.lastName, member.firstName].filter(Boolean).join(', ') || 'Unknown member';
  const id = member.mediCalId ? ` · ${member.mediCalId}` : '';
  return `${name}${id}`;
};

type MatchResponse = {
  success: boolean;
  error?: string;
  uploadedCount?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  unmatched?: string[];
  rcfeCount?: number;
  rcfeWithEmailCount?: number;
  rcfeWithoutEmailCount?: number;
  rcfeGroups?: UisRcfeGroup[];
};

const csvEscape = (value: unknown) => {
  const raw = String(value ?? '');
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export default function UisRcfeNoticePage() {
  const auth = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const noticePreview = useMemo(() => buildUisNoticePlainText(), []);
  const groups = matchResult?.rcfeGroups || [];
  const emailableGroups = useMemo(
    () => groups.filter((g) => (g.emails || []).length > 0),
    [groups]
  );
  const selectedGroups = useMemo(
    () => emailableGroups.filter((g) => selectedKeys.has(g.key)),
    [emailableGroups, selectedKeys]
  );

  const getIdToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in required');
    return user.getIdToken();
  };

  const parseUploadedFile = async (file: File) => {
    setIsParsing(true);
    setMatchResult(null);
    setSelectedKeys(new Set());
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Spreadsheet has no sheets.');
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
      if (!rows.length) throw new Error('Spreadsheet is empty.');

      const headerRow = (rows[0] || []).map((cell) => String(cell ?? ''));
      let colIdx = findMediCalColumnIndex(headerRow);
      let dataRows = rows.slice(1);

      // Single-column paste / no recognizable header → treat first column as IDs.
      if (colIdx < 0) {
        colIdx = 0;
        const firstCell = normalizeMediCalId(headerRow[0]);
        if (firstCell.length >= 5) {
          dataRows = rows;
        }
      }

      const ids = [
        ...new Set(
          dataRows
            .map((row) => normalizeMediCalId(Array.isArray(row) ? row[colIdx] : ''))
            .filter((id) => id.length >= 5)
        ),
      ];
      if (!ids.length) {
        throw new Error('No Medi-Cal numbers found. Include a Medi-Cal / CIN column.');
      }

      setFileName(file.name);
      setUploadedIds(ids);
      toast({
        title: `Loaded ${ids.length.toLocaleString()} Medi-Cal ID${ids.length === 1 ? '' : 's'}`,
        description: file.name,
      });
    } catch (error: any) {
      setFileName('');
      setUploadedIds([]);
      toast({
        title: 'Could not read file',
        description: String(error?.message || 'Upload failed'),
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runMatch = async () => {
    if (!uploadedIds.length) {
      toast({
        title: 'Upload a list first',
        description: 'Upload an Excel/CSV with Medi-Cal numbers.',
        variant: 'destructive',
      });
      return;
    }
    setIsMatching(true);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/admin/uis-rcfe-notice/match', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mediCalIds: uploadedIds }),
      });
      const body = (await response.json().catch(() => ({}))) as MatchResponse;
      if (!response.ok || !body.success) {
        throw new Error(body.error || `Match failed (HTTP ${response.status})`);
      }
      setMatchResult(body);
      const withEmail = (body.rcfeGroups || []).filter((g) => g.emails.length > 0);
      setSelectedKeys(new Set(withEmail.map((g) => g.key)));
      toast({
        title: 'Match complete',
        description: `${body.matchedCount || 0} members → ${body.rcfeWithEmailCount || 0} RCFEs with email (${body.unmatchedCount || 0} unmatched).`,
      });
    } catch (error: any) {
      toast({
        title: 'Match failed',
        description: String(error?.message || 'Could not match members'),
        variant: 'destructive',
      });
    } finally {
      setIsMatching(false);
    }
  };

  const toggleGroup = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllEmailable = () => setSelectedKeys(new Set(emailableGroups.map((g) => g.key)));
  const clearSelection = () => setSelectedKeys(new Set());

  const sendNotices = async (opts?: { test?: boolean }) => {
    if (!selectedGroups.length) {
      toast({
        title: 'Nothing selected',
        description: 'Select at least one RCFE with an email address.',
        variant: 'destructive',
      });
      return;
    }
    if (opts?.test && !String(testEmail || '').trim()) {
      toast({
        title: 'Test email required',
        description: 'Enter your email address for a test send.',
        variant: 'destructive',
      });
      return;
    }

    const setBusy = opts?.test ? setIsSendingTest : setIsSending;
    setBusy(true);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/admin/uis-rcfe-notice/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          groups: selectedGroups,
          subject: UIS_NOTICE_SUBJECT,
          ...(opts?.test ? { testEmail: String(testEmail).trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false && Number(body?.sent || 0) === 0) {
        throw new Error(body?.error || `Send failed (HTTP ${response.status})`);
      }
      toast({
        title: opts?.test ? 'Test email sent' : 'UIS notices sent',
        description: opts?.test
          ? `Sample for ${selectedGroups[0]?.rcfeName} sent to ${testEmail} with member CSV attached.`
          : `Sent ${body.sent || 0} RCFE email${Number(body.sent || 0) === 1 ? '' : 's'}${
              Number(body.failed || 0) ? `, ${body.failed} failed` : ''
            }.`,
      });
    } catch (error: any) {
      toast({
        title: opts?.test ? 'Test send failed' : 'Send failed',
        description: String(error?.message || 'Could not send'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const downloadRcfeCsv = () => {
    const columns = ['RCFE name', 'City', 'Address', 'Emails', 'Member count', 'Has email'];
    const rows = groups.map((g) => [
      g.rcfeName,
      g.rcfeCity,
      g.rcfeAddress,
      (g.emails || []).join('; '),
      String(g.members?.length || 0),
      g.emails?.length ? 'Yes' : 'No',
    ]);
    const csv = [columns, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UIS RCFE notice list ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadUnmatched = () => {
    const ids = matchResult?.unmatched || [];
    const csv = ['Medi-Cal ID', ...ids].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UIS unmatched Medi-Cal IDs ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">UIS RCFE Notice</h1>
        <p className="text-muted-foreground">
          Upload Health Net&apos;s UIS / undocumented Medi-Cal member list, match to RCFEs in Caspio, and
          email each facility the January 1, 2027 FFS transition notice with their impacted members attached.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            1. Upload Medi-Cal list
          </CardTitle>
          <CardDescription>
            Excel or CSV with a Medi-Cal / CIN column. We match against CalAIM members in Caspio cache.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void parseUploadedFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isParsing}>
              {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Choose Excel / CSV
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => void runMatch()}
              disabled={!uploadedIds.length || isMatching}
            >
              {isMatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Match to RCFEs
            </Button>
            {fileName ? (
              <span className="text-sm text-muted-foreground">
                {fileName} · {uploadedIds.length.toLocaleString()} IDs
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {matchResult ? (
        <Card>
          <CardHeader>
            <CardTitle>2. RCFEs to notify</CardTitle>
            <CardDescription>
              Matched {matchResult.matchedCount?.toLocaleString()} of{' '}
              {matchResult.uploadedCount?.toLocaleString()} Medi-Cal IDs →{' '}
              {matchResult.rcfeCount?.toLocaleString()} RCFEs (
              {matchResult.rcfeWithEmailCount?.toLocaleString()} with email).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{emailableGroups.length} ready to email</Badge>
              <Badge variant="outline">{matchResult.rcfeWithoutEmailCount || 0} missing email</Badge>
              <Badge variant="outline">{matchResult.unmatchedCount || 0} unmatched IDs</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={selectAllEmailable}>
                Select all with email
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                Clear selection
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={downloadRcfeCsv}>
                <Download className="mr-2 h-4 w-4" />
                Download RCFE list
              </Button>
              {(matchResult.unmatchedCount || 0) > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={downloadUnmatched}>
                  <Download className="mr-2 h-4 w-4" />
                  Download unmatched IDs
                </Button>
              ) : null}
            </div>

            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>RCFE</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Emails</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => {
                      const hasEmail = (group.emails || []).length > 0;
                      const memberLines = (group.members || []).map(formatMemberHoverLabel);
                      const memberHover = memberLines.length
                        ? memberLines.join('\n')
                        : 'No matched members';
                      return (
                        <TableRow key={group.key} className={!hasEmail ? 'opacity-60' : undefined}>
                          <TableCell>
                            <input
                              type="checkbox"
                              disabled={!hasEmail}
                              checked={selectedKeys.has(group.key)}
                              onChange={() => toggleGroup(group.key)}
                            />
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="max-w-full cursor-help text-left"
                                  title={memberHover}
                                >
                                  <div className="font-medium underline decoration-dotted underline-offset-2">
                                    {group.rcfeName}
                                  </div>
                                  {group.rcfeAddress ? (
                                    <div className="text-xs text-muted-foreground">{group.rcfeAddress}</div>
                                  ) : null}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-sm whitespace-pre-line text-left">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Impacted members ({group.members.length})
                                </div>
                                {memberLines.map((line) => (
                                  <div key={line}>{line}</div>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{group.rcfeCity || '—'}</TableCell>
                          <TableCell className="text-xs">
                            {hasEmail ? group.emails.join(', ') : <span className="text-amber-700">No email</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="cursor-help underline decoration-dotted underline-offset-2"
                                  title={memberHover}
                                >
                                  {group.members.length}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm whitespace-pre-line text-left">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Impacted members ({group.members.length})
                                </div>
                                {memberLines.map((line) => (
                                  <div key={line}>{line}</div>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            3. Email notice
          </CardTitle>
          <CardDescription>
            Each selected RCFE gets this message plus a CSV of their impacted members. Links included:{' '}
            <a className="text-primary underline" href={UIS_HEALTH_NET_HOME_URL} target="_blank" rel="noreferrer">
              Health Net home
            </a>{' '}
            ·{' '}
            <a
              className="text-primary underline"
              href={UIS_HEALTH_NET_TRANSITION_URL}
              target="_blank"
              rel="noreferrer"
            >
              Provider UIS transition
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm font-medium">Subject</div>
          <Input value={UIS_NOTICE_SUBJECT} readOnly />
          <div className="text-sm font-medium">Message preview</div>
          <Textarea value={noticePreview} readOnly className="min-h-[280px] font-mono text-xs" />
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Test email address</div>
              <Input
                className="w-72"
                placeholder="you@ilshealth.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isSendingTest || !selectedGroups.length}
              onClick={() => void sendNotices({ test: true })}
            >
              {isSendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
              Send test (1 RCFE sample)
            </Button>
            <Button
              type="button"
              disabled={isSending || !selectedGroups.length}
              onClick={() => void sendNotices()}
            >
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Email {selectedGroups.length || 0} selected RCFE{selectedGroups.length === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
