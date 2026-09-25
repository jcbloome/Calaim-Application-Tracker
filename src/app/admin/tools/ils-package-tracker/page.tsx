'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Route,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DocStatus = {
  key: string;
  label: string;
  present: boolean;
  source: string | null;
  fileName: string | null;
  pathwayAvailable: boolean;
};

type TrackerRow = {
  id: string;
  memberClientId: string;
  memberName: string;
  memberMrn: string;
  packageType: 'initial' | 'reassessment';
  placementType: 'rcfe' | 'home';
  status: string;
  homeVettedByIls: boolean;
  rcfeVettedByIls: boolean;
  managerVerified: boolean;
  missingLabels: string[];
  missingCount: number;
  docsComplete: boolean;
  readyToSend: boolean;
  docStatuses: DocStatus[];
  kaiserUserAssignment: string;
  kaiserStatus: string;
  assignedStaffName: string;
  assignedStaffEmail: string;
  staffName: string;
  staffEmail: string;
  applicationId: string | null;
  pathwayHref: string | null;
  checklistHref: string;
  updatedAt?: string;
};

type DocColumn = { key: string; abbreviation: string; label: string };

type SortKey = 'member' | 'staff' | 'type' | 'updated' | string;

const TRACKED_DOCS: DocColumn[] = [
  { key: 'isp', abbreviation: 'ISP', label: 'ISP / ALFT' },
  { key: 'coversheet', abbreviation: 'Cov', label: 'Cover page' },
  { key: 'proofOfIncome', abbreviation: 'POI', label: 'Proof of Income' },
  { key: 'roomAndBoardStatement', abbreviation: 'R&B', label: 'Room and Board Statement' },
  { key: 'rcfeW9', abbreviation: 'W9', label: 'RCFE W-9' },
  { key: 'proofOfLicense', abbreviation: 'Lic', label: 'Proof of License / Liability' },
  { key: 'proofOfInsurance', abbreviation: 'Ins', label: 'Proof of Insurance' },
  { key: 'rcfeVettedByIls', abbreviation: 'Vet', label: 'RCFE vetted by ILS' },
  { key: 'homeVettedByIls', abbreviation: 'Home', label: 'Home vetted by ILS' },
  { key: 'managerVerified', abbreviation: 'Mgr', label: 'Manager verified' },
];

const clean = (value: unknown) => String(value || '').trim();

const lastNameKey = (name: string) => {
  const n = clean(name);
  if (!n) return '';
  if (n.includes(',')) return n.split(',')[0].trim().toLowerCase();
  const parts = n.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
};

type CellStatus = 'Completed' | 'Pending' | 'Not Applicable';

const StatusIndicator = ({ status, formName }: { status: CellStatus; formName: string }) => {
  const statusConfig = {
    Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Uploaded' },
    Pending: { Icon: XCircle, color: 'text-red-500', label: 'Still needed' },
    'Not Applicable': { Icon: Circle, color: 'text-gray-300', label: 'Not Applicable' },
  };
  const { Icon, color, label } = statusConfig[status];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex" aria-label={`${formName}: ${label}`}>
            <Icon className={cn('h-5 w-5', color)} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {formName}: {label}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const getDocStatus = (row: TrackerRow, column: DocColumn): CellStatus => {
  if (column.key === 'rcfeVettedByIls') {
    if (row.placementType !== 'rcfe') return 'Not Applicable';
    return row.rcfeVettedByIls ? 'Completed' : 'Pending';
  }
  if (column.key === 'homeVettedByIls') {
    if (row.placementType !== 'home') return 'Not Applicable';
    return row.homeVettedByIls ? 'Completed' : 'Pending';
  }
  if (column.key === 'managerVerified') {
    return row.managerVerified ? 'Completed' : 'Pending';
  }
  const doc = row.docStatuses.find((d) => d.key === column.key);
  if (!doc) return 'Not Applicable';
  return doc.present ? 'Completed' : 'Pending';
};

const isDocMissing = (row: TrackerRow, docKey: string) => {
  const col = TRACKED_DOCS.find((d) => d.key === docKey);
  if (!col) return false;
  return getDocStatus(row, col) === 'Pending';
};

export default function IlsPackageTrackerPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, missing: 0, ready: 0, sent: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [missingDocFilters, setMissingDocFilters] = useState<string[]>([]);
  const [packageTypeFilter, setPackageTypeFilter] = useState<'all' | 'initial' | 'reassessment'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [emailRow, setEmailRow] = useState<TrackerRow | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [emailPreview, setEmailPreview] = useState<{
    subject: string;
    text: string;
    to: string;
    toName: string;
  } | null>(null);
  const [emailBusy, setEmailBusy] = useState('');

  const loadRows = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/alft/cover-sheet-package/tracker?limit=200&status=all', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Failed to load tracker'));
      }
      setRows(Array.isArray(body.rows) ? (body.rows as TrackerRow[]) : []);
      setCounts(body.counts || { total: 0, missing: 0, ready: 0, sent: 0 });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not load ILS package tracker',
        description: String(error?.message || error),
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [auth.currentUser, toast]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const toggleMissingDocFilter = (docKey: string, checked: boolean) => {
    setMissingDocFilters((prev) =>
      checked ? Array.from(new Set([...prev, docKey])) : prev.filter((k) => k !== docKey)
    );
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    if (key === 'updated' || TRACKED_DOCS.some((d) => d.key === key)) {
      setSortDir(key === 'updated' ? 'desc' : 'asc');
    } else {
      setSortDir('asc');
    }
  };

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    const list = rows.filter((row) => {
      if (onlyMissing && row.missingCount <= 0) return false;
      if (row.status === 'sent' && onlyMissing) return false;
      if (packageTypeFilter !== 'all' && row.packageType !== packageTypeFilter) return false;
      if (missingDocFilters.length > 0) {
        const allSelectedMissing = missingDocFilters.every((key) => isDocMissing(row, key));
        if (!allSelectedMissing) return false;
      }
      if (q) {
        const hay = [
          row.memberName,
          row.memberMrn,
          row.memberClientId,
          row.kaiserUserAssignment,
          row.kaiserStatus,
          row.assignedStaffName,
          row.assignedStaffEmail,
          row.packageType,
          row.placementType,
          ...(row.missingLabels || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'member') {
        return (
          lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName)) * dir ||
          clean(a.memberName).localeCompare(clean(b.memberName)) * dir
        );
      }
      if (sortKey === 'staff') {
        return (
          clean(a.assignedStaffName || a.kaiserUserAssignment).localeCompare(
            clean(b.assignedStaffName || b.kaiserUserAssignment)
          ) * dir || lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName))
        );
      }
      if (sortKey === 'type') {
        return (
          clean(a.packageType).localeCompare(clean(b.packageType)) * dir ||
          lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName))
        );
      }
      if (sortKey === 'updated') {
        const aMs = Date.parse(a.updatedAt || '') || 0;
        const bMs = Date.parse(b.updatedAt || '') || 0;
        if (aMs !== bMs) return (aMs - bMs) * dir;
        return lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName));
      }
      // Sort by a specific doc column: pending first when desc
      const col = TRACKED_DOCS.find((d) => d.key === sortKey);
      if (col) {
        const rank = (r: TrackerRow) => {
          const s = getDocStatus(r, col);
          if (s === 'Pending') return 0;
          if (s === 'Completed') return 1;
          return 2;
        };
        return (
          (rank(a) - rank(b)) * dir ||
          lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName))
        );
      }
      return lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName));
    });
  }, [rows, search, onlyMissing, missingDocFilters, packageTypeFilter, sortKey, sortDir]);

  const SortHeader = ({
    label,
    column,
    className,
    mono,
  }: {
    label: string;
    column: SortKey;
    className?: string;
    mono?: boolean;
  }) => {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={cn(
            'inline-flex items-center justify-center gap-1 rounded-sm hover:text-foreground',
            mono ? 'font-mono text-xs' : 'font-semibold',
            active ? 'text-foreground' : 'text-muted-foreground'
          )}
          aria-label={`Sort by ${label}`}
        >
          {label}
          <Icon className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} />
        </button>
      </TableHead>
    );
  };

  const openEmailDialog = (row: TrackerRow) => {
    setEmailRow(row);
    setEmailTo(clean(row.assignedStaffEmail) || clean(row.staffEmail));
    setEmailNote('');
    setEmailPreview(null);
  };

  const runStaffEmail = async (previewOnly: boolean) => {
    if (!emailRow || !auth.currentUser) return;
    setEmailBusy(previewOnly ? 'preview' : 'send');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/cover-sheet-package/remind-staff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: emailRow.id,
          toEmail: clean(emailTo) || undefined,
          toName: clean(emailRow.assignedStaffName || emailRow.kaiserUserAssignment) || undefined,
          additionalNote: clean(emailNote) || undefined,
          preview: previewOnly,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Request failed'));
      }
      if (previewOnly) {
        setEmailPreview({
          subject: String(body.preview?.subject || ''),
          text: String(body.preview?.text || ''),
          to: String(body.preview?.to || emailTo),
          toName: String(body.preview?.toName || ''),
        });
        return;
      }
      toast({
        title: 'Reminder sent',
        description: `Emailed ${body.sentToName || body.sentTo} about missing item(s).`,
        className: 'bg-emerald-50 text-emerald-950 border-emerald-200',
      });
      setEmailRow(null);
      setEmailPreview(null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: previewOnly ? 'Preview failed' : 'Could not send reminder',
        description: String(error?.message || error),
      });
    } finally {
      setEmailBusy('');
    }
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/alft-cover-sheet-package">
            <FileText className="mr-2 h-4 w-4" />
            ILS Member Package Checklist
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/progress-tracker">
            <ClipboardList className="mr-2 h-4 w-4" />
            Application Progress Tracker
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ILS Member Package Checklist Tracker</CardTitle>
          <CardDescription>
            Documents come from the application pathway or uploads on the ILS Member Package Checklist. Filter by
            individual missing items, sort by clicking column headers, and email assigned staff when items are still
            needed.
          </CardDescription>
          <div className="pt-1 text-sm text-slate-700">
            Open <span className="font-semibold tabular-nums">{counts.total - counts.sent}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            Missing <span className="font-semibold tabular-nums">{counts.missing}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            Ready <span className="font-semibold tabular-nums">{counts.ready}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            Sent <span className="font-semibold tabular-nums">{counts.sent}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">Legend</h3>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {TRACKED_DOCS.map((c) => (
                <span key={c.key}>
                  <strong className="font-mono">{c.abbreviation}:</strong> {c.label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Uploaded
              </span>
              <span className="inline-flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-500" /> Still needed
              </span>
              <span className="inline-flex items-center gap-1">
                <Circle className="h-3.5 w-3.5 text-gray-300" /> Not applicable
              </span>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ils-only-missing"
                checked={onlyMissing}
                onCheckedChange={(v) => setOnlyMissing(Boolean(v))}
              />
              <Label htmlFor="ils-only-missing" className="cursor-pointer text-sm font-medium">
                Only show packages with missing documents
              </Label>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Filter by missing item</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {TRACKED_DOCS.map((c) => (
                  <div key={c.key} className="flex items-start space-x-2">
                    <Checkbox
                      id={`missing-filter-${c.key}`}
                      className="mt-0.5"
                      checked={missingDocFilters.includes(c.key)}
                      onCheckedChange={(checked) => toggleMissingDocFilter(c.key, Boolean(checked))}
                    />
                    <Label htmlFor={`missing-filter-${c.key}`} className="cursor-pointer text-sm font-normal leading-snug">
                      <span className="font-mono">{c.abbreviation}</span>
                      <span className="hidden text-muted-foreground sm:inline"> — {c.label}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5 sm:min-w-[220px]">
                <Label htmlFor="ils-member-search" className="text-sm font-medium">
                  Search member / staff
                </Label>
                <Input
                  id="ils-member-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Member, MRN, staff, Kaiser_Status…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:w-auto">
                <div className="min-w-0 space-y-1.5 sm:w-[160px]">
                  <Label className="text-sm font-medium">Sort</Label>
                  <Select
                    value={
                      sortKey === 'member' && sortDir === 'asc'
                        ? 'name-asc'
                        : sortKey === 'member' && sortDir === 'desc'
                          ? 'name-desc'
                          : sortKey === 'updated' && sortDir === 'asc'
                            ? 'oldest'
                            : 'most-recent'
                    }
                    onValueChange={(v) => {
                      if (v === 'name-asc') {
                        setSortKey('member');
                        setSortDir('asc');
                      } else if (v === 'name-desc') {
                        setSortKey('member');
                        setSortDir('desc');
                      } else if (v === 'oldest') {
                        setSortKey('updated');
                        setSortDir('asc');
                      } else {
                        setSortKey('updated');
                        setSortDir('desc');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="most-recent">Most Recent</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                      <SelectItem value="name-asc">Name A–Z</SelectItem>
                      <SelectItem value="name-desc">Name Z–A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5 sm:w-[160px]">
                  <Label className="text-sm font-medium">Package type</Label>
                  <Select
                    value={packageTypeFilter}
                    onValueChange={(v: 'all' | 'initial' | 'reassessment') => setPackageTypeFilter(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="initial">Initial</SelectItem>
                      <SelectItem value="reassessment">Reassessment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <span className="text-sm text-muted-foreground sm:pb-2">{filteredRows.length} packages</span>
            </div>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4">Loading package data…</p>
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto sm:mx-0">
              <Table className="min-w-[780px]">
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Member" column="member" className="min-w-[180px] sm:w-[250px]" />
                    {TRACKED_DOCS.map((c) => (
                      <SortHeader
                        key={c.key}
                        label={c.abbreviation}
                        column={c.key}
                        className="w-[52px] p-1 text-center sm:w-[70px] sm:p-2"
                        mono
                      />
                    ))}
                    <TableHead className="sticky right-0 z-10 bg-background text-right font-semibold shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] sm:static sm:shadow-none">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length > 0 ? (
                    filteredRows.map((row) => {
                      const staffLabel =
                        clean(row.assignedStaffName) || clean(row.kaiserUserAssignment) || '';
                      const staffEmail = clean(row.assignedStaffEmail) || clean(row.staffEmail);
                      const kaiserStatus = clean(row.kaiserStatus);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="align-top">
                            <div className="font-medium leading-snug">{row.memberName}</div>
                            <div className="text-xs text-muted-foreground">
                              MRN {row.memberMrn || '—'} ·{' '}
                              {row.packageType === 'initial' ? 'Initial' : 'Reauth'} /{' '}
                              <span className="capitalize">{row.placementType}</span>
                            </div>
                            {kaiserStatus ? (
                              <div className="mt-1 text-xs text-slate-700">
                                <span className="text-muted-foreground">Kaiser_Status:</span> {kaiserStatus}
                              </div>
                            ) : null}
                            {staffLabel ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="mt-1 cursor-default text-xs text-muted-foreground">
                                      Staff: {staffLabel}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{staffEmail || 'No email on file — open Email to enter address'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </TableCell>
                          {TRACKED_DOCS.map((c) => (
                            <TableCell key={`${row.id}-${c.key}`} className="p-1 text-center sm:p-2">
                              <StatusIndicator status={getDocStatus(row, c)} formName={c.label} />
                            </TableCell>
                          ))}
                          <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] sm:static sm:shadow-none">
                            <TooltipProvider delayDuration={200}>
                              <div className="inline-flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button asChild variant="outline" size="icon" className="h-8 w-8">
                                      <Link href={row.checklistHref} title="View checklist" aria-label="View checklist">
                                        <Eye className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View checklist / uploads</p>
                                  </TooltipContent>
                                </Tooltip>
                                {row.pathwayHref ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button asChild variant="outline" size="icon" className="h-8 w-8">
                                        <Link
                                          href={row.pathwayHref}
                                          title="Application pathway"
                                          aria-label="Open application pathway"
                                        >
                                          <Route className="h-4 w-4" />
                                        </Link>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Application pathway</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled
                                        title="No pathway linked"
                                        aria-label="No pathway linked"
                                      >
                                        <ExternalLink className="h-4 w-4 opacity-40" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>No application pathway linked</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {row.missingCount > 0 ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => openEmailDialog(row)}
                                        title={
                                          staffEmail
                                            ? `Email ${staffLabel || 'staff'}`
                                            : 'Email staff'
                                        }
                                        aria-label="Email staff about missing items"
                                      >
                                        <Mail className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {staffEmail
                                          ? `Email ${staffLabel || 'staff'} about missing items`
                                          : 'Email staff (enter address)'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={TRACKED_DOCS.length + 2} className="h-24 text-center">
                        No packages match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(emailRow)}
        onOpenChange={(open) => {
          if (!open && !emailBusy) {
            setEmailRow(null);
            setEmailPreview(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email staff — items still needed</DialogTitle>
            <DialogDescription>
              {emailRow
                ? `Notify assigned staff about missing ILS package items for ${emailRow.memberName}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {emailRow ? (
            <div className="space-y-3 text-sm">
              <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div>
                  <span className="text-muted-foreground">Member:</span> {emailRow.memberName}
                  {emailRow.memberMrn ? ` · MRN ${emailRow.memberMrn}` : ''}
                </div>
                {clean(emailRow.kaiserStatus) ? (
                  <div className="mt-0.5">
                    <span className="text-muted-foreground">Kaiser_Status:</span> {emailRow.kaiserStatus}
                  </div>
                ) : null}
                <div className="mt-0.5">
                  <span className="text-muted-foreground">Staff:</span>{' '}
                  {clean(emailRow.assignedStaffName) ||
                    clean(emailRow.kaiserUserAssignment) ||
                    '—'}
                  {clean(emailRow.assignedStaffEmail) || clean(emailRow.staffEmail)
                    ? ` · ${clean(emailRow.assignedStaffEmail) || clean(emailRow.staffEmail)}`
                    : ''}
                </div>
              </div>
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-950">
                <div className="font-medium">Still needed ({emailRow.missingCount})</div>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {emailRow.missingLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <Label htmlFor="ils-remind-to">To email</Label>
                <Input
                  id="ils-remind-to"
                  type="email"
                  className="mt-1"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="staff@example.com"
                />
              </div>
              <div>
                <Label htmlFor="ils-remind-note">Additional note (optional)</Label>
                <Textarea
                  id="ils-remind-note"
                  className="mt-1"
                  rows={3}
                  value={emailNote}
                  onChange={(e) => setEmailNote(e.target.value)}
                />
              </div>
              {emailPreview ? (
                <div className="rounded border bg-slate-50 p-3 text-xs whitespace-pre-wrap">
                  <div className="mb-1 font-medium">
                    To: {emailPreview.toName} &lt;{emailPreview.to}&gt;
                  </div>
                  <div className="mb-2 font-medium">{emailPreview.subject}</div>
                  {emailPreview.text}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(emailBusy)}
              onClick={() => void runStaffEmail(true)}
            >
              {emailBusy === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Preview
            </Button>
            <Button
              type="button"
              disabled={Boolean(emailBusy) || !clean(emailTo)}
              onClick={() => void runStaffEmail(false)}
            >
              {emailBusy === 'send' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
