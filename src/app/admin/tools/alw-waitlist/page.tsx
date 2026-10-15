'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Archive, Download, Eye, ExternalLink, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ALW_WAITLIST_CCA_NAME,
  buildAlwWaitlistFileName,
  buildAlwWaitlistWorkbookBytes,
  parseAlwAlreadyOnWaitlistWorkbook,
  partitionAlwWaitlistRows,
  type AlwWaitlistExclusionEntry,
  type AlwWaitlistMemberRow,
} from '@/lib/alw-waitlist';
import { alwWaitlistFormFileName, buildAlwWaitlistFormPdfBytes } from '@/lib/alw-waitlist-form-pdf';

export default function AlwWaitlistToolPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<AlwWaitlistMemberRow[]>([]);
  const [exclusionEntries, setExclusionEntries] = useState<AlwWaitlistExclusionEntry[]>([]);
  const [exclusionFileName, setExclusionFileName] = useState<string | null>(null);
  const [exclusionUploadedAt, setExclusionUploadedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExclusions, setIsLoadingExclusions] = useState(false);
  const [isUploadingExclusions, setIsUploadingExclusions] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const getToken = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) throw new Error('Please sign in again.');
    return user.getIdToken();
  }, [auth?.currentUser]);

  const loadExclusions = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingExclusions(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/alw-waitlist/exclusions', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load exclusion list');
      }
      setExclusionEntries(Array.isArray(data.entries) ? data.entries : []);
      setExclusionFileName(data.fileName ? String(data.fileName) : null);
      setExclusionUploadedAt(data.uploadedAtIso ? String(data.uploadedAtIso) : null);
    } catch (err: any) {
      toast({
        title: 'Could not load exclusion list',
        description: String(err?.message || 'Try refreshing the page.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingExclusions(false);
    }
  }, [getToken, isAdmin, toast]);

  const fetchMembers = useCallback(
    async (refresh = false) => {
      if (!isAdmin) return;
      setIsLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const qs = refresh ? '?refresh=true' : '';
        const res = await fetch(`/api/admin/alw-waitlist/members${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to load members (HTTP ${res.status})`);
        }
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setHasLoaded(true);
        setLastRefreshedAt(new Date());
      } catch (err: any) {
        setRows([]);
        setHasLoaded(true);
        setError(String(err?.message || 'Could not load authorized Health Net members.'));
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, isAdmin]
  );

  useEffect(() => {
    if (isAdminLoading || !isAdmin || hasLoaded || isLoading) return;
    void fetchMembers(true);
    void loadExclusions();
  }, [isAdmin, isAdminLoading, hasLoaded, isLoading, fetchMembers, loadExclusions]);

  const { included, excluded } = useMemo(
    () => partitionAlwWaitlistRows(rows, exclusionEntries),
    [rows, exclusionEntries]
  );

  const selectedMember = useMemo(
    () => included.find((row) => row.id === selectedMemberId) || null,
    [included, selectedMemberId]
  );

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!selectedMemberId) return;
    if (!included.some((row) => row.id === selectedMemberId)) {
      setSelectedMemberId(null);
      setIsPreviewOpen(false);
      revokePreviewUrl();
      setPreviewUrl(null);
      setPreviewFileName(null);
    }
  }, [included, revokePreviewUrl, selectedMemberId]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const missingFieldCounts = useMemo(() => {
    const counts = {
      phone: 0,
      dob: 0,
      gender: 0,
      mediCal: 0,
      address: 0,
      residence: 0,
    };
    included.forEach((row) => {
      if (!row.homePhone) counts.phone += 1;
      if (!row.dateOfBirth) counts.dob += 1;
      if (!row.gender) counts.gender += 1;
      if (!row.mediCalNumber) counts.mediCal += 1;
      if (!row.address) counts.address += 1;
      if (!row.currentResidence) counts.residence += 1;
    });
    return counts;
  }, [included]);

  const handleExclusionUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingExclusions(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseAlwAlreadyOnWaitlistWorkbook(buffer);
      if (parsed.entries.length === 0) {
        throw new Error(
          parsed.noCount > 0
            ? `Found ${parsed.noCount} row(s) marked NO, but none marked YES. Only YES rows are excluded.`
            : 'No YES rows found. Need column “Is the Member on the ALW Waitlist?” = YES, plus Medi-Cal # / Client_ID2 / Name.'
        );
      }
      const token = await getToken();
      const res = await fetch('/api/admin/alw-waitlist/exclusions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'save',
          entries: parsed.entries,
          fileName: file.name,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to save exclusion list');
      }
      setExclusionEntries(Array.isArray(data.entries) ? data.entries : parsed.entries);
      setExclusionFileName(String(data.fileName || file.name));
      setExclusionUploadedAt(String(data.uploadedAtIso || new Date().toISOString()));
      toast({
        title: 'Exclusion list uploaded',
        description: `${parsed.entries.length} YES (excluded) · ${parsed.noCount} NO (still included) from ${file.name}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: String(err?.message || 'Could not read that Excel file.'),
        variant: 'destructive',
      });
    } finally {
      setIsUploadingExclusions(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearExclusions = async () => {
    setIsUploadingExclusions(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/alw-waitlist/exclusions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to clear exclusion list');
      }
      setExclusionEntries([]);
      setExclusionFileName(null);
      setExclusionUploadedAt(null);
      toast({ title: 'Exclusion list cleared', description: 'All authorized members are eligible for the Sierra sheet again.' });
    } catch (err: any) {
      toast({
        title: 'Clear failed',
        description: String(err?.message || 'Could not clear exclusions.'),
        variant: 'destructive',
      });
    } finally {
      setIsUploadingExclusions(false);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadSheet = async () => {
    if (!included.length) return;
    setIsDownloading(true);
    try {
      const fileName = buildAlwWaitlistFileName();
      const bytes = buildAlwWaitlistWorkbookBytes(included);
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, fileName);
      toast({
        title: 'Sheet downloaded',
        description: `${included.length} members (excluded ${excluded.length} already on waitlist) · ${fileName}`,
      });
    } catch (err: any) {
      toast({
        title: 'Download failed',
        description: String(err?.message || 'Could not build the workbook.'),
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadFormsZip = async () => {
    if (!included.length) return;
    setIsDownloadingZip(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/alw-waitlist/forms-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: included }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error || `ZIP failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName =
        match?.[1] ||
        `ALW Waitlist Forms - Health Net - ${included.length} members.zip`;
      downloadBlob(blob, fileName);
      toast({
        title: 'Google Drive package ready',
        description: `${included.length} filled PDFs + Excel summary. Upload this ZIP to a Drive folder and share with Sierra.`,
      });
    } catch (err: any) {
      toast({
        title: 'ZIP download failed',
        description: String(err?.message || 'Could not build the forms package.'),
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const previewMemberForm = async (row: AlwWaitlistMemberRow) => {
    setSelectedMemberId(row.id);
    setIsPreviewOpen(true);
    setIsLoadingPreview(true);
    setPreviewUrl(null);
    try {
      // Prefer server preview; fall back to client-generated PDF if the API fails.
      const token = await getToken();
      const res = await fetch('/api/admin/alw-waitlist/form-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ row, asBase64: true }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (res.ok && data?.success && data?.pdfBase64) {
        const binary = atob(String(data.pdfBase64));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        revokePreviewUrl();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewFileName(String(data.fileName || alwWaitlistFormFileName(row)));
        return;
      }

      const pdfBytes = await buildAlwWaitlistFormPdfBytes(row);
      const fileName = alwWaitlistFormFileName(row);
      revokePreviewUrl();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewFileName(fileName);
    } catch (err: any) {
      setPreviewUrl(null);
      setPreviewFileName(null);
      toast({
        title: 'Preview failed',
        description: String(err?.message || 'Could not build the sample form.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking admin access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Admin access required</AlertTitle>
          <AlertDescription>This tool is only available to admin users.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">ALW Waitlist — Health Net</CardTitle>
          <CardDescription>
            Build filled Assisted Living Waiver Waitlist Request forms for{' '}
            <strong>Authorized</strong> Health Net members who are <strong>not</strong> already on the
            waitlist (CCA: {ALW_WAITLIST_CCA_NAME}). Download a ZIP and upload it to a Google Drive folder
            to share with Sierra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Authorized Health Net</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{isLoading ? '—' : rows.length}</div>
            </div>
            <div className="rounded-md border bg-amber-50 border-amber-200 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-900/70">Already on waitlist (excluded)</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-amber-950">
                {isLoading ? '—' : excluded.length}
              </div>
            </div>
            <div className="rounded-md border bg-emerald-50 border-emerald-200 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-900/70">Forms for Drive package</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-emerald-950">
                {isLoading ? '—' : included.length}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void fetchMembers(true)}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh members
            </Button>
            <Button
              type="button"
              disabled={isLoading || isDownloadingZip || included.length === 0}
              onClick={() => void downloadFormsZip()}
            >
              {isDownloadingZip ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Download ZIP for Google Drive ({included.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isDownloading || included.length === 0}
              onClick={() => void downloadSheet()}
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download Excel only
            </Button>
            <div className="text-sm text-muted-foreground">
              {lastRefreshedAt ? `Refreshed ${format(lastRefreshedAt, 'M/d/yyyy h:mm a')}` : null}
            </div>
          </div>
          <Alert>
            <Archive className="h-4 w-4" />
            <AlertTitle>Share via Google Drive</AlertTitle>
            <AlertDescription>
              The ZIP includes one filled PDF per member, an Excel summary, and a short README. Upload that
              ZIP (or unzipped folder) to Drive and share the folder with Sierra CCA — no email send from
              this tool.
            </AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load members</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="rounded-md border border-dashed p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Already on waitlist — exclusion upload</div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Upload your roster Excel. Only rows where <strong>Is the Member on the ALW Waitlist? = YES</strong>{' '}
                  are excluded (matched by Medi-Cal #, Client_ID2, or name + DOB). Rows marked NO stay on the
                  download list. Caspio <code>On_ALW_Waitlist = Yes</code> is also excluded. Address/residence on
                  forms use RCFE_Name / RCFE_Address / City / State / Zip.
                </p>
                {exclusionFileName ? (
                  <div className="text-xs text-muted-foreground">
                    Current file: <span className="font-medium text-foreground">{exclusionFileName}</span>
                    {exclusionUploadedAt
                      ? ` · ${format(new Date(exclusionUploadedAt), 'M/d/yyyy h:mm a')}`
                      : ''}
                    {` · ${exclusionEntries.length} exclusion row${exclusionEntries.length === 1 ? '' : 's'}`}
                    {isLoadingExclusions ? ' · loading…' : ''}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No exclusion file uploaded yet
                    {isLoadingExclusions ? ' · loading…' : ''}.
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={(e) => void handleExclusionUpload(e.target.files?.[0] || null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploadingExclusions}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingExclusions ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload exclusion Excel
                </Button>
                {exclusionEntries.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isUploadingExclusions}
                    onClick={() => void clearExclusions()}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear exclusions
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {!isLoading && included.length > 0 ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Pre-fill gaps on members in the Drive package: phone {missingFieldCounts.phone}, DOB{' '}
              {missingFieldCounts.dob}, gender {missingFieldCounts.gender}, Medi-Cal{' '}
              {missingFieldCounts.mediCal}, address {missingFieldCounts.address}, residence{' '}
              {missingFieldCounts.residence}. Program/service checkboxes are left blank for CCA
              completion.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            Members in Drive package
            <Badge variant="secondary">{included.length}</Badge>
          </CardTitle>
          <CardDescription>
            Click <strong>View</strong> to open a sample filled ALW Waitlist Request form. The Google Drive ZIP
            includes one PDF per member below, plus the Excel summary.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !rows.length ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading from Caspio…
            </div>
          ) : included.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No authorized Health Net members found.'
                : 'All authorized members are excluded (already on waitlist).'}
            </p>
          ) : (
            <div className="overflow-auto rounded-md border max-h-[640px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Medi-Cal #</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Residence</TableHead>
                    <TableHead className="w-[90px]">Form</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {included.map((row) => {
                    const isSelected = row.id === selectedMemberId && isPreviewOpen;
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'cursor-pointer',
                          isSelected ? 'bg-sky-50 hover:bg-sky-50' : 'hover:bg-muted/40'
                        )}
                        onClick={() => void previewMemberForm(row)}
                      >
                        <TableCell className="font-medium whitespace-nowrap">
                          {row.memberName || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.mediCalNumber || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.dateOfBirth || '—'}</TableCell>
                        <TableCell>{row.county || '—'}</TableCell>
                        <TableCell
                          className="max-w-[180px] truncate"
                          title={row.currentResidenceOther || row.currentResidence}
                        >
                          {row.currentResidence || '—'}
                          {row.rcfeName ? ` · ${row.rcfeName}` : ''}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? 'default' : 'outline'}
                            className="h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              void previewMemberForm(row);
                            }}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) {
            setSelectedMemberId(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Sample form{selectedMember?.memberName ? ` — ${selectedMember.memberName}` : ''}
            </DialogTitle>
            <DialogDescription>
              Filled Assisted Living Waiver Waitlist Request PDF (same file that goes in the Drive ZIP).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            {previewFileName ? (
              <span className="text-xs text-muted-foreground truncate max-w-[50%]">{previewFileName}</span>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {previewUrl ? (
                <>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Open in new tab
                    </a>
                  </Button>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={previewUrl} download={previewFileName || 'alw-waitlist-form.pdf'}>
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Download PDF
                    </a>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 rounded-md border bg-muted/20 overflow-hidden">
            {isLoadingPreview ? (
              <div className="flex h-full min-h-[420px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building form…
              </div>
            ) : previewUrl ? (
              <object
                data={`${previewUrl}#view=FitH`}
                type="application/pdf"
                className="h-full w-full min-h-[420px]"
              >
                <iframe title="ALW waitlist form preview" src={previewUrl} className="h-full w-full min-h-[420px]" />
              </object>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Could not load this form preview.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {excluded.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              Excluded (already on waitlist)
              <Badge variant="outline">{excluded.length}</Badge>
            </CardTitle>
            <CardDescription>
              These members will not be included in the download or email to Sierra.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Medi-Cal #</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excluded.map((row) => (
                    <TableRow key={`ex-${row.id}`}>
                      <TableCell className="font-medium whitespace-nowrap">{row.memberName || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.mediCalNumber || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.dateOfBirth || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.excludeReason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
