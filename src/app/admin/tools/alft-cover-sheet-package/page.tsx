'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, Loader2, Mail, RefreshCw, Search, Upload } from 'lucide-react';
import { useAuth } from '@/firebase';
import { fetchKaiserMembers } from '@/lib/fetch-kaiser-members';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ALFT_COVER_SHEET_PACKAGE_TO,
  ALFT_COVER_SHEET_PACKAGE_TO_LABEL,
  ALFT_COVER_SHEET_PACKAGE_TO_NAME,
  buildAlftCoverSheetPackageEmailPreview,
  buildAlftCoverSheetPackageSubject,
  COVER_SHEET_PACKAGE_ALWAYS_REQUIRED,
  COVER_SHEET_PACKAGE_INITIAL_ONLY,
  COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT,
  pickReusableCoverSheetDocs,
  type CoverSheetPackageDocKey,
  type CoverSheetPackageFile,
  type CoverSheetPackageType,
  requiredCoverSheetPackageDocs,
} from '@/lib/alft-cover-sheet-package';

type KaiserMember = {
  id?: string;
  Client_ID2?: string;
  client_ID2?: string;
  memberName?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  [key: string]: unknown;
};

type PackageRecord = {
  id: string;
  memberClientId: string;
  memberName: string;
  memberMrn: string;
  packageType: CoverSheetPackageType;
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>>;
  linkedIspDownloadLogId?: string | null;
  linkedCoverDownloadLogId?: string | null;
  status: string;
  missingLabels: string[];
  readyToSend: boolean;
  sentAt?: string;
  sentTo?: string;
  notes?: string;
};

type LinkedDownload = {
  id: string;
  downloadName?: string;
  memberName?: string;
  memberMrn?: string;
  createdAt?: string;
  kind: 'isp' | 'cover';
};

type SendLogEntry = {
  id: string;
  packageId?: string;
  memberName: string;
  memberMrn?: string;
  packageType: CoverSheetPackageType;
  subject: string;
  sentTo: string;
  sentToName?: string;
  sentByName?: string;
  sentByEmail?: string;
  sentAt?: string;
  fileCount: number;
  files: Array<{
    key?: string;
    label?: string;
    fileName: string;
    downloadURL?: string;
  }>;
};

type EmailPreview = ReturnType<typeof buildAlftCoverSheetPackageEmailPreview>;

const clean = (value: unknown) => String(value || '').trim();

const toName = (member: KaiserMember) => {
  const firstLast = `${clean(member.memberFirstName)} ${clean(member.memberLastName)}`.trim();
  return firstLast || clean(member.memberName) || `Client ${clean(member.Client_ID2 || member.client_ID2)}`;
};

const clientIdOf = (member: KaiserMember) =>
  clean(member.Client_ID2 || member.client_ID2 || member.id);

export default function AlftCoverSheetPackagePage() {
  const auth = useAuth();
  const { toast } = useToast();

  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [packageType, setPackageType] = useState<CoverSheetPackageType>('initial');
  const [pkg, setPkg] = useState<PackageRecord | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [linkedIsp, setLinkedIsp] = useState<LinkedDownload[]>([]);
  const [linkedCover, setLinkedCover] = useState<LinkedDownload[]>([]);
  const [sendLogs, setSendLogs] = useState<SendLogEntry[]>([]);
  const [sendLogsLoading, setSendLogsLoading] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selectedMember = useMemo(
    () => members.find((m) => clientIdOf(m) === selectedClientId) || null,
    [members, selectedClientId]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 40);
    return members
      .filter((m) => {
        const hay = `${toName(m)} ${clean(m.memberMrn)} ${clientIdOf(m)}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [members, memberSearch]);

  const checklist = useMemo(() => requiredCoverSheetPackageDocs(packageType), [packageType]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const data = await fetchKaiserMembers({ source: 'cache', timeoutMs: 120000 });
      const list = Array.isArray(data?.members) ? (data.members as KaiserMember[]) : [];
      setMembers(list);
    } catch (error: any) {
      toast({
        title: 'Could not load members',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [toast]);

  const authHeaders = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    const idToken = await user.getIdToken();
    return { Authorization: `Bearer ${idToken}` };
  }, [auth]);

  const loadSendLogs = useCallback(async () => {
    if (!auth.currentUser) return;
    setSendLogsLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package/send?limit=100', {
        headers,
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Could not load send log'));
      }
      setSendLogs(Array.isArray(body.logs) ? (body.logs as SendLogEntry[]) : []);
    } catch (error: any) {
      toast({
        title: 'Could not load Veronica send log',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
      setSendLogs([]);
    } finally {
      setSendLogsLoading(false);
    }
  }, [auth.currentUser, authHeaders, toast]);

  const loadLinkedDownloads = useCallback(
    async (member: KaiserMember) => {
      try {
        const headers = await authHeaders();
        const clientId = clientIdOf(member);
        const mrn = clean(member.memberMrn);
        const [ispRes, coverRes] = await Promise.all([
          fetch(`/api/alft/download-log?limit=20${clientId ? `&memberId=${encodeURIComponent(clientId)}` : ''}`, {
            headers,
            cache: 'no-store',
          }),
          fetch(`/api/forms/kaiser-isp-cover-sheet/download-log?limit=20&member=${encodeURIComponent(mrn || toName(member))}`, {
            headers,
            cache: 'no-store',
          }),
        ]);
        const ispBody = await ispRes.json().catch(() => ({}));
        const coverBody = await coverRes.json().catch(() => ({}));
        const ispLogs = Array.isArray(ispBody?.logs) ? ispBody.logs : [];
        const coverLogs = Array.isArray(coverBody?.logs) ? coverBody.logs : [];
        setLinkedIsp(
          ispLogs
            .filter((row: any) => {
              const rowMrn = clean(row.memberMrn);
              const rowClient = clean(row.memberClientId);
              if (clientId && rowClient && rowClient === clientId) return true;
              if (mrn && rowMrn && rowMrn === mrn) return true;
              return clean(row.memberName).toLowerCase() === toName(member).toLowerCase();
            })
            .slice(0, 5)
            .map((row: any) => ({
              id: clean(row.id),
              downloadName: clean(row.downloadName),
              memberName: clean(row.memberName),
              memberMrn: clean(row.memberMrn),
              createdAt: clean(row.createdAt),
              kind: 'isp' as const,
            }))
        );
        setLinkedCover(
          coverLogs
            .filter((row: any) => {
              const rowClient = clean(row.memberClientId);
              const rowMrn = clean(row.memberMrn);
              if (clientId && rowClient && rowClient === clientId) return true;
              if (mrn && rowMrn && rowMrn === mrn) return true;
              return clean(row.memberName).toLowerCase() === toName(member).toLowerCase();
            })
            .slice(0, 5)
            .map((row: any) => ({
              id: clean(row.id),
              downloadName: clean(row.downloadName),
              memberName: clean(row.memberName),
              memberMrn: clean(row.memberMrn),
              createdAt: clean(row.createdAt),
              kind: 'cover' as const,
            }))
        );
      } catch {
        setLinkedIsp([]);
        setLinkedCover([]);
      }
    },
    [authHeaders]
  );

  const savePackage = useCallback(
    async (overrides?: Partial<{ packageType: CoverSheetPackageType; notes: string; docs: any }>) => {
      if (!selectedMember) throw new Error('Select a member first.');
      const headers = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg?.id || undefined,
          memberClientId: clientIdOf(selectedMember),
          memberName: toName(selectedMember),
          memberMrn: clean(selectedMember.memberMrn),
          packageType: overrides?.packageType || packageType,
          notes: overrides?.notes ?? notes,
          docs: overrides?.docs,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Could not save package'));
      }
      setPkg(body.package as PackageRecord);
      return body.package as PackageRecord;
    },
    [authHeaders, notes, packageType, pkg?.id, selectedMember]
  );

  const loadOrCreatePackage = useCallback(async () => {
    if (!selectedMember) return;
    setBusy('load');
    try {
      const headers = await authHeaders();
      const clientId = clientIdOf(selectedMember);
      const res = await fetch(
        `/api/alft/cover-sheet-package?memberClientId=${encodeURIComponent(clientId)}&limit=10`,
        { headers, cache: 'no-store' }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Could not load package'));
      }
      const packages = Array.isArray(body.packages) ? (body.packages as PackageRecord[]) : [];
      const match =
        packages.find((p) => p.packageType === packageType) ||
        packages.find((p) => p.status !== 'sent') ||
        packages[0] ||
        null;
      if (match) {
        let next = match;
        // Reassessment: reuse prior Proof of Income + Room & Board when this package is missing them.
        if (match.packageType === 'reassessment' || packageType === 'reassessment') {
          const reusable = pickReusableCoverSheetDocs(packages.filter((p) => p.id !== match.id).concat(packages));
          const docsPatch: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile>> = {};
          for (const key of COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT) {
            if (!match.docs?.[key]?.downloadURL && reusable[key]) {
              docsPatch[key] = reusable[key]!;
            }
          }
          if (Object.keys(docsPatch).length) {
            next = await savePackage({
              packageType: 'reassessment',
              docs: { ...(match.docs || {}), ...docsPatch },
            });
          }
        }
        setPkg(next);
        setPackageType(next.packageType);
        setNotes(clean(next.notes));
      } else {
        const reusable =
          packageType === 'reassessment' ? pickReusableCoverSheetDocs(packages) : {};
        const created = await savePackage({
          packageType,
          docs: Object.keys(reusable).length ? reusable : undefined,
        });
        setPkg(created);
      }
      await loadLinkedDownloads(selectedMember);
    } catch (error: any) {
      toast({
        title: 'Could not open package',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
      setPkg(null);
    } finally {
      setBusy('');
    }
  }, [authHeaders, loadLinkedDownloads, packageType, savePackage, selectedMember, toast]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!auth.currentUser) return;
    void loadSendLogs();
  }, [auth.currentUser, loadSendLogs]);

  useEffect(() => {
    if (!selectedMember) {
      setPkg(null);
      setLinkedIsp([]);
      setLinkedCover([]);
      return;
    }
    void loadOrCreatePackage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  const uploadDoc = async (docKey: CoverSheetPackageDocKey, file: File) => {
    setBusy(`upload:${docKey}`);
    try {
      let current = pkg;
      if (!current?.id) current = await savePackage();
      const headers = await authHeaders();
      const form = new FormData();
      form.set('packageId', current.id);
      form.set('docKey', docKey);
      form.set('file', file);
      const res = await fetch('/api/alft/cover-sheet-package/upload', {
        method: 'POST',
        headers,
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Upload failed'));
      }
      const refreshed = await savePackage({
        docs: { [docKey]: body.file },
      });
      setPkg(refreshed);
      toast({
        title: 'File uploaded',
        description: `${body.file?.fileName || file.name} added to checklist.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setBusy('');
    }
  };

  const linkExistingDownload = async (docKey: 'isp' | 'coversheet', entry: LinkedDownload) => {
    setBusy(`link:${docKey}`);
    try {
      const headers = await authHeaders();
      const endpoint =
        entry.kind === 'isp'
          ? `/api/alft/download-log?logId=${encodeURIComponent(entry.id)}&format=file`
          : `/api/forms/kaiser-isp-cover-sheet/download-log/redownload?logId=${encodeURIComponent(entry.id)}&format=file`;
      const fileRes = await fetch(endpoint, { headers, cache: 'no-store' });
      if (!fileRes.ok) {
        const body = await fileRes.json().catch(() => ({}));
        throw new Error(String(body?.error || 'Could not load linked download file'));
      }
      const blob = await fileRes.blob();
      const fileName =
        clean(fileRes.headers.get('X-Download-Name')) ||
        clean(entry.downloadName) ||
        (entry.kind === 'isp' ? 'ISP.pdf' : 'Coversheet.pdf');
      const file = new File([blob], fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`, {
        type: blob.type || 'application/pdf',
      });
      const uploaded = await uploadDoc(docKey, file);
      if (!uploaded || !selectedMember) return;
      const headers2 = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package', {
        method: 'POST',
        headers: { ...headers2, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg?.id,
          memberClientId: clientIdOf(selectedMember),
          memberName: toName(selectedMember),
          memberMrn: clean(selectedMember.memberMrn),
          packageType,
          linkedIspDownloadLogId: docKey === 'isp' ? entry.id : undefined,
          linkedCoverDownloadLogId: docKey === 'coversheet' ? entry.id : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.package) setPkg(body.package as PackageRecord);
    } catch (error: any) {
      toast({
        title: 'Could not link download',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  const removeDoc = async (docKey: CoverSheetPackageDocKey) => {
    if (!pkg?.id || !selectedMember) return;
    setBusy(`remove:${docKey}`);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          memberClientId: clientIdOf(selectedMember),
          memberName: toName(selectedMember),
          memberMrn: clean(selectedMember.memberMrn),
          packageType,
          removeDocKey: docKey,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Could not remove file'));
      setPkg(body.package as PackageRecord);
    } catch (error: any) {
      toast({
        title: 'Remove failed',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  const openEmailPreview = async () => {
    if (!pkg?.id) return;
    setBusy('preview');
    try {
      await savePackage();
      const headers = await authHeaders();
      const res = await fetch(
        `/api/alft/cover-sheet-package/send?preview=1&packageId=${encodeURIComponent(pkg.id)}`,
        { headers, cache: 'no-store' }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success || !body?.preview) {
        throw new Error(String(body?.error || 'Could not build email preview'));
      }
      setEmailPreview(body.preview as EmailPreview);
      setPreviewOpen(true);
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  const sendPackage = async () => {
    if (!pkg?.id) return;
    setBusy('send');
    try {
      await savePackage();
      const headers = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package/send', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Send failed'));
      }
      setPreviewOpen(false);
      toast({
        title: `Sent to ${ALFT_COVER_SHEET_PACKAGE_TO_NAME}`,
        description: `Emailed ${body.sentToName || ALFT_COVER_SHEET_PACKAGE_TO_NAME} <${body.sentTo}> — ${body.subject}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await Promise.all([loadOrCreatePackage(), loadSendLogs()]);
    } catch (error: any) {
      toast({
        title: 'Send failed',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  const memberLabel = selectedMember ? toName(selectedMember) : '';
  const memberMrn = selectedMember ? clean(selectedMember.memberMrn) : '';
  const emailSubject = buildAlftCoverSheetPackageSubject(memberLabel || 'Member', memberMrn || 'N/A');
  const ready = Boolean(pkg?.readyToSend);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>ALFT Cover Sheet Package Data Page</CardTitle>
              <CardDescription>
                Admin checklist for ISP, coversheet, proof of income, and room &amp; board. Initial packages also require
                RCFE W-9, proof of license, and proof of insurance. When complete, send to{' '}
                {ALFT_COVER_SHEET_PACKAGE_TO_LABEL}.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/tools/kaiser-isp-cover-sheet">Cover Sheet Generator</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/tools/kaiser-isp-cover-downloads">ALFT Cover Downloads</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/tools/isp-downloads">ISP Downloads</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2">
              <label className="text-sm font-medium">Member</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search name, MRN, or Client ID"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => void loadMembers()} disabled={membersLoading}>
                  {membersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              <div className="max-h-56 overflow-auto rounded border">
                {filteredMembers.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No matching Kaiser members.</div>
                ) : (
                  filteredMembers.map((m) => {
                    const id = clientIdOf(m);
                    const active = id === selectedClientId;
                    return (
                      <button
                        key={id || toName(m)}
                        type="button"
                        className={`flex w-full items-start justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                          active ? 'bg-emerald-50' : 'hover:bg-muted/40'
                        }`}
                        onClick={() => setSelectedClientId(id)}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{toName(m)}</div>
                          <div className="text-xs text-muted-foreground">
                            MRN {clean(m.memberMrn) || '—'} · Client {id || '—'}
                          </div>
                        </div>
                        {active ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-3 rounded border p-3">
              <div>
                <div className="text-sm font-medium">Package type</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={packageType === 'initial' ? 'default' : 'outline'}
                    disabled={!selectedMember || Boolean(busy)}
                    onClick={() => {
                      setPackageType('initial');
                      void (async () => {
                        setBusy('type');
                        try {
                          const saved = await savePackage({ packageType: 'initial' });
                          setPkg(saved);
                        } finally {
                          setBusy('');
                        }
                      })();
                    }}
                  >
                    Initial cover sheet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={packageType === 'reassessment' ? 'default' : 'outline'}
                    disabled={!selectedMember || Boolean(busy)}
                    onClick={() => {
                      setPackageType('reassessment');
                      void (async () => {
                        setBusy('type');
                        try {
                          const headers = await authHeaders();
                          const clientId = clientIdOf(selectedMember!);
                          const res = await fetch(
                            `/api/alft/cover-sheet-package?memberClientId=${encodeURIComponent(clientId)}&limit=10`,
                            { headers, cache: 'no-store' }
                          );
                          const body = await res.json().catch(() => ({}));
                          const packages = Array.isArray(body.packages)
                            ? (body.packages as PackageRecord[])
                            : [];
                          const reusable = pickReusableCoverSheetDocs(packages);
                          const docsPatch: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> = {
                            ...(pkg?.docs || {}),
                          };
                          for (const key of COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT) {
                            if (!docsPatch[key]?.downloadURL && reusable[key]) {
                              docsPatch[key] = reusable[key]!;
                            }
                          }
                          const saved = await savePackage({
                            packageType: 'reassessment',
                            docs: docsPatch,
                          });
                          setPkg(saved);
                          if (Object.keys(reusable).length) {
                            toast({
                              title: 'Prior forms reused',
                              description:
                                'Proof of Income and/or Room & Board from a previous package were linked — no re-upload needed.',
                              className: 'bg-green-100 text-green-900 border-green-200',
                            });
                          }
                        } finally {
                          setBusy('');
                        }
                      })();
                    }}
                  >
                    Reassessment
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  RCFE W-9, Proof of License, and Proof of Insurance are required for <strong>initial</strong> only.
                  On reassessment, Proof of Income and Room &amp; Board reuse prior uploads when available.
                </p>
              </div>

              {selectedMember ? (
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Selected:</span> {memberLabel}
                  </div>
                  <div>
                    <span className="text-muted-foreground">MRN:</span> {memberMrn || '—'}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline">{packageType === 'initial' ? 'Initial' : 'Reassessment'}</Badge>
                    <Badge variant={ready ? 'default' : 'secondary'}>
                      {pkg?.status === 'sent' ? 'Sent' : ready ? 'Ready to send' : 'Incomplete'}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Select a member to begin the checklist.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedMember && pkg ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Package checklist</CardTitle>
              <CardDescription>
                Upload each required document, or link an existing ISP / coversheet download for this member.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {checklist.map((item) => {
                const file = pkg.docs?.[item.key] || null;
                const uploading = busy === `upload:${item.key}` || busy === `link:${item.key}`;
                const initialOnly = COVER_SHEET_PACKAGE_INITIAL_ONLY.some((d) => d.key === item.key);
                const reusableOnReassessment =
                  packageType === 'reassessment' &&
                  COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT.includes(item.key);
                return (
                  <div key={item.key} className="rounded border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {item.label}{' '}
                          {initialOnly ? (
                            <span className="text-xs font-normal text-muted-foreground">(initial only)</span>
                          ) : null}
                          {reusableOnReassessment ? (
                            <span className="text-xs font-normal text-emerald-800">
                              (reuse prior upload OK)
                            </span>
                          ) : null}
                        </div>
                        {file ? (
                          <a
                            href={file.downloadURL}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block truncate text-xs text-blue-700 underline-offset-2 hover:underline"
                          >
                            {file.fileName}
                            {reusableOnReassessment && file.source === 'link' ? ' · prior package' : ''}
                          </a>
                        ) : (
                          <div className="mt-1 text-xs text-amber-800">
                            {reusableOnReassessment
                              ? 'Missing — upload once, or it will auto-link from a prior package when available'
                              : 'Missing — required before send'}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                            disabled={Boolean(busy)}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) void uploadDoc(item.key, f);
                            }}
                          />
                          {uploading ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-3.5 w-3.5" />
                          )}
                          Upload
                        </label>
                        {file ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={Boolean(busy)}
                            onClick={() => void removeDoc(item.key)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {item.key === 'isp' && linkedIsp.length ? (
                      <div className="mt-2 space-y-1">
                        <div className="text-[11px] font-medium text-muted-foreground">Link from ISP Downloads</div>
                        {linkedIsp.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className="block w-full truncate rounded border bg-muted/20 px-2 py-1 text-left text-xs hover:bg-muted/40"
                            disabled={Boolean(busy)}
                            onClick={() => void linkExistingDownload('isp', entry)}
                          >
                            {entry.downloadName || 'ISP packet'}
                            {entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ''}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {item.key === 'coversheet' && linkedCover.length ? (
                      <div className="mt-2 space-y-1">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          Link from ALFT Cover Downloads
                        </div>
                        {linkedCover.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className="block w-full truncate rounded border bg-muted/20 px-2 py-1 text-left text-xs hover:bg-muted/40"
                            disabled={Boolean(busy)}
                            onClick={() => void linkExistingDownload('coversheet', entry)}
                          >
                            {entry.downloadName || 'Cover sheet'}
                            {entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ''}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {packageType === 'reassessment' ? (
                <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                  Reassessment packages skip {COVER_SHEET_PACKAGE_INITIAL_ONLY.map((d) => d.label).join(', ')}.
                  Proof of Income and Room &amp; Board reuse a prior package when already on file.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send package to {ALFT_COVER_SHEET_PACKAGE_TO_NAME}</CardTitle>
              <CardDescription>
                Package emails go to {ALFT_COVER_SHEET_PACKAGE_TO_LABEL} when every required checklist item is
                uploaded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">To</div>
                  <div className="font-medium">{ALFT_COVER_SHEET_PACKAGE_TO_LABEL}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Subject</div>
                  <div className="font-medium">{emailSubject}</div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Internal notes (optional)</label>
                <Input
                  className="mt-1"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => {
                    if (!pkg?.id) return;
                    void savePackage({ notes }).then((saved) => setPkg(saved)).catch(() => undefined);
                  }}
                  placeholder="Optional notes for staff (not included in email subject)"
                />
              </div>
              {!ready ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Still needed: {(pkg.missingLabels || []).join(', ') || 'required documents'}
                </div>
              ) : (
                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                  All required documents are on file
                  {pkg.status === 'sent' && pkg.sentAt
                    ? ` · previously sent ${new Date(pkg.sentAt).toLocaleString()}`
                    : ''}
                  .
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!pkg?.id || Boolean(busy)}
                  onClick={() => void openEmailPreview()}
                >
                  {busy === 'preview' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  View email
                </Button>
                <Button type="button" disabled={!ready || Boolean(busy)} onClick={() => void sendPackage()}>
                  {busy === 'send' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  {pkg.status === 'sent' ? `Resend to ${ALFT_COVER_SHEET_PACKAGE_TO_NAME}` : `Send to ${ALFT_COVER_SHEET_PACKAGE_TO_NAME}`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void loadOrCreatePackage()}
                >
                  Refresh
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Always required: {COVER_SHEET_PACKAGE_ALWAYS_REQUIRED.map((d) => d.label).join(', ')}.
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Sent to {ALFT_COVER_SHEET_PACKAGE_TO_NAME}</CardTitle>
            <CardDescription>
              Log of every cover sheet package emailed to {ALFT_COVER_SHEET_PACKAGE_TO_LABEL}, including attached
              files.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sendLogsLoading || Boolean(busy)}
            onClick={() => void loadSendLogs()}
          >
            {sendLogsLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh log
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sendLogsLoading && !sendLogs.length ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading send log…
            </div>
          ) : null}
          {!sendLogsLoading && !sendLogs.length ? (
            <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
              No packages have been sent to {ALFT_COVER_SHEET_PACKAGE_TO_NAME} yet.
            </div>
          ) : null}
          {sendLogs.map((entry) => (
            <div key={entry.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {entry.memberName || 'Member'}
                    {entry.memberMrn ? ` · ${entry.memberMrn}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.packageType === 'initial' ? 'Initial' : 'Reassessment'}
                    {entry.sentAt ? ` · ${new Date(entry.sentAt).toLocaleString()}` : ''}
                    {entry.sentByName ? ` · by ${entry.sentByName}` : ''}
                  </div>
                </div>
                <Badge variant="secondary">{entry.fileCount || entry.files?.length || 0} files</Badge>
              </div>
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">To:</span> {entry.sentToName || ALFT_COVER_SHEET_PACKAGE_TO_NAME}{' '}
                &lt;{entry.sentTo || ALFT_COVER_SHEET_PACKAGE_TO}&gt;
              </div>
              <div className="mt-1 text-xs">
                <span className="text-muted-foreground">Subject:</span> {entry.subject || '—'}
              </div>
              {entry.files?.length ? (
                <ul className="mt-2 space-y-1 border-t pt-2">
                  {entry.files.map((file, idx) => (
                    <li key={`${entry.id}-${file.fileName}-${idx}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-medium">{file.label || 'Document'}:</span>
                      {file.downloadURL ? (
                        <a
                          href={file.downloadURL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {file.fileName}
                        </a>
                      ) : (
                        <span>{file.fileName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email preview — {ALFT_COVER_SHEET_PACKAGE_TO_NAME}</DialogTitle>
            <DialogDescription>
              Review the message and attachments before sending to {ALFT_COVER_SHEET_PACKAGE_TO_LABEL}.
            </DialogDescription>
          </DialogHeader>
          {emailPreview ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">To</div>
                <div className="font-medium">{emailPreview.toLabel || ALFT_COVER_SHEET_PACKAGE_TO_LABEL}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="font-medium">{emailPreview.subject}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Body</div>
                <div
                  className="rounded border bg-muted/20 p-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: emailPreview.html }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Attachments</div>
                <ul className="space-y-1 rounded border p-3">
                  {(emailPreview.attachmentLines || []).map((item) => (
                    <li key={item.key} className="flex flex-wrap gap-x-2 text-xs">
                      <span className="font-medium">{item.label}:</span>
                      {item.downloadURL ? (
                        <a
                          href={item.downloadURL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {item.fileName}
                        </a>
                      ) : (
                        <span className="text-amber-700">{item.fileName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button type="button" disabled={!ready || Boolean(busy)} onClick={() => void sendPackage()}>
              {busy === 'send' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Send to {ALFT_COVER_SHEET_PACKAGE_TO_NAME}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
