'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  Upload,
  Users,
  ExternalLink,
  Save,
  History,
  Download,
  Trash2,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Eye,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  annotateIlsMifRowsWithCaspioMembers,
  buildIlsMifDedupeKey,
  compareMifFileNamesByGeneratedDate,
  dedupeIlsMifMasterRows,
  downloadIlsMifMasterAsCsMifWorkbook,
  extractMifGeneratedDateKey,
  findMifDateUploadOverlaps,
  formatMifGeneratedDateLabel,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_CONSOLIDATOR_HANDOFF_KEY,
  ILS_MIF_DECLINED_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
  ILS_MIF_UPLOADED_FILES_COLLECTION,
  ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION,
  IlsMifMasterRow,
  IlsMifMemberIdentitySummary,
  IlsMifUploadedFileRecord,
  isNorthernCounty,
  findNewMembersNotInPriorList,
  masterRowToCreateAppImportShape,
  parseIlsMifSpreadsheetFile,
  sortMifFileNamesByGeneratedDate,
  summarizeIlsMifMembersForBrowse,
} from '@/lib/ils-mif-parse';
import {
  ILS_DECISION_CC,
  ILS_DECISION_CUSTOM_TEXT_MAX,
  ILS_DECISION_TO,
  buildIlsDecisionNarrative,
  buildIlsDecisionSubject,
  buildIlsDecisionTextBody,
  normalizeIlsDecisionCustomText,
} from '@/lib/ils-decision-email';

type FilterMode = 'all' | 'new' | 'caspio' | 'duplicates' | 'incomplete' | 'northern' | 'declined';

type ConsolidationRunSummary = {
  id: string;
  createdAtIso: string;
  label: string;
  sourceFiles: string[];
  totals: {
    total: number;
    unique: number;
    caspio: number;
    duplicates: number;
    incomplete: number;
    northern: number;
  };
  newMemberCount: number;
  memberCount?: number;
  caspioMemberCount?: number;
  northernMemberCount?: number;
  declinedMemberCount?: number;
};

type DeclinedMemberRecord = {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  sourceFileName: string;
  declinedAtIso: string;
  emailSubject: string;
  emailBodyText: string;
  customText: string;
  actedByEmail: string;
  to: string[];
  cc: string[];
};

export default function IlsMifConsolidatorPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterListAnchorRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<IlsMifMasterRow[]>([]);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [queryText, setQueryText] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [northernOnly, setNorthernOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isSendingDeclines, setIsSendingDeclines] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState('');
  const [deletingUploadId, setDeletingUploadId] = useState('');
  const [hasCheckedCaspio, setHasCheckedCaspio] = useState(false);
  const [lastMatchedLabel, setLastMatchedLabel] = useState('');
  const [expandedRunId, setExpandedRunId] = useState('');
  const [sessionFilesExpanded, setSessionFilesExpanded] = useState(false);
  const [latestRunMifsExpanded, setLatestRunMifsExpanded] = useState(false);
  const [uploadDateWarnings, setUploadDateWarnings] = useState<string[]>([]);
  const [mifDateSortDesc, setMifDateSortDesc] = useState(true);
  const [activeRunId, setActiveRunId] = useState('');
  const [runs, setRuns] = useState<ConsolidationRunSummary[]>([]);
  const [declinedMembers, setDeclinedMembers] = useState<DeclinedMemberRecord[]>([]);
  const [declinedKeys, setDeclinedKeys] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<IlsMifUploadedFileRecord[]>([]);
  const [masterListCreatedAtIso, setMasterListCreatedAtIso] = useState('');
  const [declineComposerOpen, setDeclineComposerOpen] = useState(false);
  const [declineComposerRows, setDeclineComposerRows] = useState<IlsMifMasterRow[]>([]);
  const [declineComposerCustomText, setDeclineComposerCustomText] = useState('');
  const [declineComposerPreviewIndex, setDeclineComposerPreviewIndex] = useState(0);
  const [viewedDeclineEmail, setViewedDeclineEmail] = useState<DeclinedMemberRecord | null>(null);
  const [expandedUploadId, setExpandedUploadId] = useState('');
  const [uploadMembersById, setUploadMembersById] = useState<Record<string, IlsMifMemberIdentitySummary[]>>({});
  const [loadingUploadMembersId, setLoadingUploadMembersId] = useState('');

  const scrollToMasterList = () => {
    window.setTimeout(() => {
      masterListAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const memberKey = (row: Pick<IlsMifMasterRow, 'memberMrn' | 'memberMediCalNum' | 'memberFirstName' | 'memberLastName'>) =>
    buildIlsMifDedupeKey(row);

  const totals = useMemo(() => {
    const duplicates = rows.filter((r) => r.mergeStatus === 'duplicate_in_batch').length;
    const incomplete = rows.filter((r) => r.mergeStatus === 'incomplete').length;
    const isNorthernReady = (r: IlsMifMasterRow) =>
      r.mergeStatus !== 'duplicate_in_batch' &&
      isNorthernCounty(r.memberCounty) &&
      !r.caspioExists &&
      r.mergeStatus !== 'already_in_caspio' &&
      !declinedKeys.has(memberKey(r));
    const northern = hasCheckedCaspio ? rows.filter(isNorthernReady).length : 0;
    const declined = rows.filter(
      (r) => r.mergeStatus !== 'duplicate_in_batch' && declinedKeys.has(memberKey(r))
    ).length;
    const total = rows.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
    const unique = hasCheckedCaspio
      ? rows.filter((r) => r.mergeStatus === 'unique' && !declinedKeys.has(memberKey(r))).length
      : 0;
    const caspio = hasCheckedCaspio
      ? rows.filter((r) => r.mergeStatus === 'already_in_caspio').length
      : 0;
    return { total, unique, caspio, duplicates, incomplete, northern, declined };
  }, [rows, declinedKeys, hasCheckedCaspio]);

  const visibleRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return rows.filter((row) => {
      if (northernOnly) {
        if (!isNorthernCounty(row.memberCounty)) return false;
        if (hasCheckedCaspio && (row.caspioExists || row.mergeStatus === 'already_in_caspio')) return false;
        if (declinedKeys.has(memberKey(row))) return false;
      }
      // "Total" / All = imported members only (batch duplicates excluded unless Duplicates filter)
      if (filter === 'all' && row.mergeStatus === 'duplicate_in_batch') return false;
      if (filter === 'new') {
        if (!hasCheckedCaspio || row.mergeStatus !== 'unique' || declinedKeys.has(memberKey(row))) return false;
      }
      if (filter === 'caspio') {
        if (!hasCheckedCaspio || row.mergeStatus !== 'already_in_caspio') return false;
      }
      if (filter === 'duplicates' && row.mergeStatus !== 'duplicate_in_batch') return false;
      if (filter === 'incomplete' && row.mergeStatus !== 'incomplete') return false;
      if (filter === 'northern') {
        if (row.mergeStatus === 'duplicate_in_batch' || !isNorthernCounty(row.memberCounty)) return false;
        if (!hasCheckedCaspio) return false;
        if (row.caspioExists || row.mergeStatus === 'already_in_caspio') return false;
        if (declinedKeys.has(memberKey(row))) return false;
      }
      if (filter === 'declined') {
        if (row.mergeStatus === 'duplicate_in_batch' || !declinedKeys.has(memberKey(row))) return false;
      }
      if (!needle) return true;
      const haystack = [
        row.memberFirstName,
        row.memberLastName,
        row.memberMrn,
        row.memberMediCalNum,
        row.memberCounty,
        row.sourceFileName,
        row.caspioMatchLabel,
        row.statusNote,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, filter, queryText, northernOnly, declinedKeys, hasCheckedCaspio]);

  const selectedNorthernForDecline = useMemo(
    () =>
      rows.filter(
        (row) =>
          selected[row.rowId] &&
          isNorthernCounty(row.memberCounty) &&
          !row.caspioExists &&
          row.mergeStatus !== 'already_in_caspio' &&
          !declinedKeys.has(memberKey(row))
      ),
    [rows, selected, declinedKeys]
  );

  const selectedNewRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          selected[row.rowId] &&
          row.mergeStatus === 'unique' &&
          !row.caspioExists &&
          !declinedKeys.has(memberKey(row))
      ),
    [rows, selected, declinedKeys]
  );

  const mifDateSortDirection = mifDateSortDesc ? 'desc' : 'asc';

  const latestConsolidationRun = runs[0] || null;
  const latestRunMifFiles = useMemo(
    () => sortMifFileNamesByGeneratedDate(latestConsolidationRun?.sourceFiles || [], mifDateSortDirection),
    [latestConsolidationRun, mifDateSortDirection]
  );

  const sortedUploadedFiles = useMemo(() => {
    const sorted = [...uploadedFiles].sort((a, b) =>
      compareMifFileNamesByGeneratedDate(a.fileName, b.fileName)
    );
    return mifDateSortDesc ? sorted.reverse() : sorted;
  }, [uploadedFiles, mifDateSortDesc]);

  const sortedSessionFiles = useMemo(
    () => sortMifFileNamesByGeneratedDate(sourceFiles, mifDateSortDirection),
    [sourceFiles, mifDateSortDirection]
  );

  const toggleMifDateSort = () => setMifDateSortDesc((prev) => !prev);

  const loadRunsAndDeclined = async () => {
    if (!firestore) return;
    try {
      const [runsSnap, declinedSnap, uploadsSnap, metaSnap] = await Promise.all([
        getDocs(query(collection(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION), orderBy('createdAtIso', 'desc'), limit(25))),
        getDocs(query(collection(firestore, ILS_MIF_DECLINED_COLLECTION), orderBy('declinedAtIso', 'desc'), limit(500))),
        getDocs(query(collection(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION), orderBy('uploadedAtIso', 'desc'), limit(200))),
        getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta')),
      ]);
      const nextRuns: ConsolidationRunSummary[] = [];
      runsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextRuns.push({
          id: docSnap.id,
          createdAtIso: String(data.createdAtIso || ''),
          label: String(data.label || docSnap.id),
          sourceFiles: Array.isArray(data.sourceFiles) ? data.sourceFiles.map(String) : [],
          totals: {
            total: Number(data?.totals?.total || 0),
            unique: Number(data?.totals?.unique || 0),
            caspio: Number(data?.totals?.caspio || 0),
            duplicates: Number(data?.totals?.duplicates || 0),
            incomplete: Number(data?.totals?.incomplete || 0),
            northern: Number(data?.totals?.northern || 0),
          },
          newMemberCount: Number(data.newMemberCount || data?.totals?.unique || 0),
          memberCount: Number(data.memberCount || data?.totals?.total || 0),
          caspioMemberCount: Number(data.caspioMemberCount || data?.totals?.caspio || 0),
          northernMemberCount: Number(data.northernMemberCount || data?.totals?.northern || 0),
          declinedMemberCount: Number(data.declinedMemberCount || 0),
        });
      });
      setRuns(nextRuns);

      const nextDeclined: DeclinedMemberRecord[] = [];
      const keys = new Set<string>();
      declinedSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const record: DeclinedMemberRecord = {
          id: docSnap.id,
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberMrn: String(data.memberMrn || ''),
          memberCounty: String(data.memberCounty || ''),
          sourceFileName: String(data.sourceFileName || ''),
          declinedAtIso: String(data.declinedAtIso || ''),
          emailSubject: String(data.emailSubject || ''),
          emailBodyText: String(data.emailBodyText || ''),
          customText: String(data.customText || ''),
          actedByEmail: String(data.actedByEmail || ''),
          to: Array.isArray(data.to) ? data.to.map(String) : [...ILS_DECISION_TO],
          cc: Array.isArray(data.cc) ? data.cc.map(String) : [...ILS_DECISION_CC],
        };
        nextDeclined.push(record);
        keys.add(
          buildIlsMifDedupeKey({
            clientId2: '',
            memberMrn: record.memberMrn,
            memberMediCalNum: String(data.memberMediCalNum || ''),
            memberFirstName: record.memberFirstName,
            memberLastName: record.memberLastName,
            memberDob: String(data.memberDob || ''),
          })
        );
      });
      setDeclinedMembers(nextDeclined);
      setDeclinedKeys(keys);

      const nextUploads: IlsMifUploadedFileRecord[] = [];
      uploadsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextUploads.push({
          id: docSnap.id,
          fileName: String(data.fileName || docSnap.id),
          uploadedAtIso: String(data.uploadedAtIso || ''),
          rowCount: Number(data.rowCount || 0),
          uploadedBy: String(data.uploadedBy || ''),
          runId: String(data.runId || ''),
          mifDateKey: String(data.mifDateKey || extractMifGeneratedDateKey(data.fileName || '')),
          mifDateLabel:
            String(data.mifDateLabel || '') ||
            formatMifGeneratedDateLabel(String(data.mifDateKey || extractMifGeneratedDateKey(data.fileName || ''))),
        });
      });
      setUploadedFiles(nextUploads);
      if (!nextUploads.length) setUploadDateWarnings([]);

      const metaData = metaSnap.exists() ? metaSnap.data() || {} : {};
      setMasterListCreatedAtIso(
        String(metaData.latestRunAtIso || metaData.updatedAt || nextRuns[0]?.createdAtIso || '')
      );
    } catch (error) {
      console.warn('Failed to load consolidator history:', error);
    }
  };

  useEffect(() => {
    void loadRunsAndDeclined();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore]);

  const mergeParsedRows = (incoming: IlsMifMasterRow[]) => {
    const combined = dedupeIlsMifMasterRows([...rows, ...incoming]);
    setRows(combined);
    setHasCheckedCaspio(false);
    setLastMatchedLabel('');
    if (filter === 'new' || filter === 'caspio') setFilter('all');
    setSelected((prev) => {
      const next = { ...prev };
      combined.forEach((row) => {
        if (next[row.rowId] === undefined) {
          next[row.rowId] = false;
        }
      });
      return next;
    });
    return combined;
  };

  const checkCaspio = async (rowsOverride?: IlsMifMasterRow[]) => {
    const workingRows = rowsOverride && rowsOverride.length ? rowsOverride : rows;
    if (!workingRows.length) {
      toast({
        variant: 'destructive',
        title: 'Nothing to check',
        description: 'Upload MIF spreadsheets first.',
      });
      return null;
    }
    setIsMatching(true);
    try {
      const response = await fetch('/api/kaiser-members?source=cache', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
        throw new Error(data?.error || `Failed to load Caspio members (HTTP ${response.status})`);
      }
      const deduped = dedupeIlsMifMasterRows(workingRows);
      const annotated = annotateIlsMifRowsWithCaspioMembers(deduped, data.members);
      setRows(annotated);
      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        annotated.forEach((row) => {
          next[row.rowId] = row.mergeStatus === 'unique' ? Boolean(prev[row.rowId] ?? true) : false;
        });
        return next;
      });
      setLastMatchedLabel(new Date().toLocaleString());
      setHasCheckedCaspio(true);
      setFilter('all');
      const newCount = annotated.filter((r) => r.mergeStatus === 'unique').length;
      const caspioCount = annotated.filter((r) => r.mergeStatus === 'already_in_caspio').length;
      const northernCount = annotated.filter((r) => isNorthernCounty(r.memberCounty)).length;
      toast({
        title: 'Master list consolidated + Caspio checked',
        description: `Full master list: ${annotated.length} members · ${newCount} new · ${caspioCount} in Caspio · ${northernCount} northern. Use filters for Caspio / northern denials; Save stores everyone. Create Application uses New only.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      return annotated;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Caspio check failed',
        description: String(error?.message || 'Unknown error'),
      });
      return null;
    } finally {
      setIsMatching(false);
    }
  };

  const loadUploadedMifMembers = async (uploadId: string) => {
    if (!firestore || !uploadId) return [];
    if (uploadMembersById[uploadId]?.length) return uploadMembersById[uploadId];
    setLoadingUploadMembersId(uploadId);
    try {
      const snap = await getDocs(
        collection(
          firestore,
          ILS_MIF_UPLOADED_FILES_COLLECTION,
          uploadId,
          ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION
        )
      );
      const members: IlsMifMemberIdentitySummary[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const first = String(data.memberFirstName || '').trim();
        const last = String(data.memberLastName || '').trim();
        if (!first || !last) return;
        members.push({
          memberFirstName: first,
          memberLastName: last,
          memberMrn: String(data.memberMrn || '').trim(),
          memberMediCalNum: String(data.memberMediCalNum || '').trim(),
        });
      });
      const sorted = summarizeIlsMifMembersForBrowse(members);
      setUploadMembersById((prev) => ({ ...prev, [uploadId]: sorted }));
      return sorted;
    } catch (error) {
      console.warn('Failed to load uploaded MIF members:', error);
      toast({
        variant: 'destructive',
        title: 'Unable to load MIF members',
        description: 'Could not read saved members for this uploaded file.',
      });
      return [];
    } finally {
      setLoadingUploadMembersId('');
    }
  };

  const toggleUploadedMifMembers = async (uploadId: string) => {
    if (expandedUploadId === uploadId) {
      setExpandedUploadId('');
      return;
    }
    setExpandedUploadId(uploadId);
    await loadUploadedMifMembers(uploadId);
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((file) =>
      /\.(xlsx|xls|csv)$/i.test(file.name)
    );
    if (!files.length) {
      toast({
        variant: 'destructive',
        title: 'No usable files',
        description: 'Upload one or more .xlsx / .xls / .csv MIF spreadsheets.',
      });
      return;
    }
    setIsParsing(true);
    let combinedForCheck: IlsMifMasterRow[] | null = null;
    let warningLines: string[] = [];
    let names: string[] = [];
    try {
      const parsedByFile = new Map<string, IlsMifMasterRow[]>();
      names = [];
      for (const file of files) {
        const parsed = await parseIlsMifSpreadsheetFile(file);
        if (!parsed.length) continue;
        parsedByFile.set(file.name, parsed);
        names.push(file.name);
      }
      if (!names.length) {
        throw new Error('No usable member rows found in the uploaded spreadsheets.');
      }

      const knownNames = uploadedFiles.map((file) => file.fileName).filter(Boolean);
      const overlaps = findMifDateUploadOverlaps(names, knownNames);
      warningLines = [];
      overlaps.forEach((overlap) => {
        const datePart = overlap.dateLabel || overlap.dateKey || 'unknown date';
        if (overlap.exactNameMatches.length) {
          warningLines.push(
            `${overlap.fileName}: exact filename already uploaded for MIF date ${datePart}.`
          );
        }
        if (overlap.sameDateDifferentNames.length) {
          warningLines.push(
            `${overlap.fileName}: MIF date ${datePart} already has different file(s): ${overlap.sameDateDifferentNames.join(', ')}.`
          );
        }
      });

      // Same-date check: count members that are new vs already stored for that MIF date.
      for (const fileName of names) {
        const dateKey = extractMifGeneratedDateKey(fileName);
        if (!dateKey || !firestore) continue;
        const sameDateUploads = uploadedFiles.filter(
          (file) =>
            (file.mifDateKey || extractMifGeneratedDateKey(file.fileName)) === dateKey &&
            file.fileName.toLowerCase() !== fileName.toLowerCase()
        );
        if (!sameDateUploads.length) continue;
        const priorMembers: IlsMifMasterRow[] = [];
        for (const prior of sameDateUploads) {
          const snap = await getDocs(
            collection(
              firestore,
              ILS_MIF_UPLOADED_FILES_COLLECTION,
              prior.id,
              ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION
            )
          );
          snap.forEach((docSnap) => {
            const data = docSnap.data() as IlsMifMasterRow;
            if (data?.memberFirstName && data?.memberLastName) priorMembers.push(data);
          });
        }
        const incoming = parsedByFile.get(fileName) || [];
        const brandNew = findNewMembersNotInPriorList(incoming, priorMembers);
        warningLines.push(
          `${fileName}: same MIF date ${formatMifGeneratedDateLabel(dateKey) || dateKey} — ${brandNew.length} new member(s) not in prior same-date MIF(s) (${incoming.length} in this file, ${priorMembers.length} already stored for that date).`
        );
      }

      if (latestRunMifFiles.length) {
        warningLines.unshift(
          `Latest consolidation run includes ${latestRunMifFiles.length} MIF file(s): ${latestRunMifFiles.slice(0, 8).join(', ')}${
            latestRunMifFiles.length > 8 ? '…' : ''
          }. New uploads will be added into the master list, then re-check Caspio.`
        );
      }

      if (warningLines.length) {
        const proceed = window.confirm(
          `Upload review:\n\n${warningLines.join('\n\n')}\n\nContinue uploading and merge into the master list?`
        );
        if (!proceed) {
          setUploadDateWarnings(warningLines);
          return;
        }
      }
      setUploadDateWarnings(warningLines.filter((line) => !line.startsWith('Latest consolidation run')));

      const parsedBatches = Array.from(parsedByFile.values()).flat();
      setSourceFiles((prev) =>
        sortMifFileNamesByGeneratedDate(Array.from(new Set([...prev, ...names])), 'desc')
      );
      combinedForCheck = mergeParsedRows(parsedBatches);

      if (firestore) {
        const uploadedAtIso = new Date().toISOString();
        for (const fileName of names) {
          const parsedForFile = parsedByFile.get(fileName) || [];
          const safeId = `${Date.now()}_${fileName}`.replace(/[\/#?[\]]/g, '_').slice(0, 700);
          const mifDateKey = extractMifGeneratedDateKey(fileName);
          await setDoc(
            doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, safeId),
            {
              fileName,
              uploadedAtIso,
              uploadedAtServer: serverTimestamp(),
              rowCount: parsedForFile.length,
              uploadedBy: user?.email || user?.uid || '',
              runId: '',
              mifDateKey,
              mifDateLabel: formatMifGeneratedDateLabel(mifDateKey),
            },
            { merge: true }
          );

          const CHUNK = 400;
          for (let i = 0; i < parsedForFile.length; i += CHUNK) {
            const chunk = parsedForFile.slice(i, i + CHUNK);
            const batch = writeBatch(firestore);
            chunk.forEach((row) => {
              const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
              batch.set(
                doc(
                  firestore,
                  ILS_MIF_UPLOADED_FILES_COLLECTION,
                  safeId,
                  ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION,
                  key || row.rowId
                ),
                {
                  memberFirstName: row.memberFirstName,
                  memberLastName: row.memberLastName,
                  memberMrn: row.memberMrn,
                  memberMediCalNum: row.memberMediCalNum,
                  memberDob: row.memberDob,
                  memberCounty: row.memberCounty,
                  clientId2: row.clientId2,
                  sourceFileName: row.sourceFileName,
                  rowId: row.rowId,
                  dedupeKey: key,
                },
                { merge: true }
              );
            });
            await batch.commit();
          }
          setUploadMembersById((prev) => ({
            ...prev,
            [safeId]: summarizeIlsMifMembersForBrowse(parsedForFile),
          }));
        }
        await loadRunsAndDeclined();
      }

      toast({
        title: 'MIFs saved and merged into master list',
        description: `Saved ${names.length} MIF file(s) with member lists, merged ${parsedBatches.length} row(s). Running Caspio check next…`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to parse MIF files',
        description: String(error?.message || 'Unknown parse error'),
      });
      combinedForCheck = null;
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    if (combinedForCheck?.length) {
      await checkCaspio(combinedForCheck);
    }
  };

  const saveMasterListAndRun = async (options?: { quiet?: boolean }) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return '';
    }
    if (!rows.length) {
      toast({ variant: 'destructive', title: 'Nothing to save', description: 'Upload MIF files first.' });
      return '';
    }
    if (!hasCheckedCaspio) {
      toast({
        variant: 'destructive',
        title: 'Check Caspio first',
        description: 'Consolidate/check Caspio before saving a dated master list for Create Application.',
      });
      return '';
    }
    setIsSaving(true);
    try {
      const now = new Date();
      const createdAtIso = now.toISOString();
      const runId = `run_${now.getTime()}`;
      const runLabel = now.toLocaleString();
      const northern = totals.northern;
      const runTotals = { ...totals, northern };
      const newMembers = rows.filter((r) => r.mergeStatus === 'unique' && !r.caspioExists);
      const caspioMembers = rows.filter((r) => r.mergeStatus === 'already_in_caspio' || r.caspioExists);
      const northernMembers = rows.filter(
        (r) =>
          r.mergeStatus !== 'duplicate_in_batch' &&
          isNorthernCounty(r.memberCounty) &&
          !r.caspioExists &&
          r.mergeStatus !== 'already_in_caspio' &&
          !declinedKeys.has(memberKey(r))
      );
      const declinedMemberRows = rows.filter(
        (r) => r.mergeStatus !== 'duplicate_in_batch' && declinedKeys.has(memberKey(r))
      );
      const sortedSources = sortMifFileNamesByGeneratedDate(sourceFiles, 'desc');

      // Run header + upload links first (keep batch under Firestore 500-op limit).
      {
        const headerBatch = writeBatch(firestore);
        headerBatch.set(
          doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'),
          {
            updatedAt: createdAtIso,
            updatedAtServer: serverTimestamp(),
            updatedBy: user?.email || user?.uid || '',
            sourceFiles: sortedSources,
            totals: runTotals,
            memberCount: totals.total,
            latestRunId: runId,
            latestRunAtIso: createdAtIso,
          },
          { merge: true }
        );
        headerBatch.set(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, runId), {
          createdAtIso,
          createdAtServer: serverTimestamp(),
          label: runLabel,
          sourceFiles: sortedSources,
          totals: runTotals,
          memberCount: totals.total,
          newMemberCount: newMembers.length,
          caspioMemberCount: caspioMembers.length,
          northernMemberCount: northernMembers.length,
          declinedMemberCount: declinedMemberRows.length,
          createdBy: user?.email || user?.uid || '',
        });
        uploadedFiles
          .filter((file) => !file.runId && sortedSources.includes(file.fileName))
          .forEach((file) => {
            headerBatch.set(
              doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, file.id),
              {
                runId,
                linkedRunAtIso: createdAtIso,
              },
              { merge: true }
            );
          });
        await headerBatch.commit();
      }

      // Persist a full per-run member snapshot + update latest master list.
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const batch = writeBatch(firestore);
        chunk.forEach((row) => {
          const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
          const isDeclined = declinedKeys.has(memberKey(row));
          const payload = {
            ...row,
            dedupeKey: key,
            runId,
            runAtIso: createdAtIso,
            updatedAt: createdAtIso,
            updatedBy: user?.email || user?.uid || '',
            declined: isDeclined,
            northernCounty: isNorthernCounty(row.memberCounty),
          };
          batch.set(
            doc(
              firestore,
              ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
              runId,
              ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
              key || row.rowId
            ),
            payload,
            { merge: true }
          );
          batch.set(doc(firestore, ILS_MIF_MASTER_COLLECTION, key || row.rowId), payload, { merge: true });
        });
        await batch.commit();
      }

      setActiveRunId(runId);
      setMasterListCreatedAtIso(createdAtIso);
      setSourceFiles(sortedSources);
      setExpandedRunId(runId);
      setFilter('all');
      await loadRunsAndDeclined();
      if (!options?.quiet) {
        toast({
          title: 'Consolidation run saved in app',
          description: `Saved full run ${runLabel}: ${rows.length} members · ${sortedSources.length} MIF file(s). Open it anytime under Consolidation Runs to see everyone and which MIFs are included.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
      return runId;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to save consolidation run',
        description: String(error?.message || 'Unknown error'),
      });
      return '';
    } finally {
      setIsSaving(false);
    }
  };

  const loadSavedMasterList = async (runId?: string) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    setIsLoadingSaved(true);
    try {
      let preferredRunId = String(runId || '').trim();
      if (!preferredRunId) {
        const metaSnap = await getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'));
        preferredRunId = String(metaSnap.exists() ? metaSnap.data()?.latestRunId || '' : '').trim();
        if (!preferredRunId && runs[0]?.id) preferredRunId = runs[0].id;
      }

      const loaded: IlsMifMasterRow[] = [];
      const files = new Set<string>();

      if (preferredRunId) {
        const [runSnap, memberSnap] = await Promise.all([
          getDoc(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, preferredRunId)),
          getDocs(
            collection(
              firestore,
              ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
              preferredRunId,
              ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
            )
          ),
        ]);
        if (runSnap.exists()) {
          const runData = runSnap.data() || {};
          (Array.isArray(runData.sourceFiles) ? runData.sourceFiles : []).forEach((name: string) => {
            if (name) files.add(String(name));
          });
          if (runData.createdAtIso) setMasterListCreatedAtIso(String(runData.createdAtIso));
        }
        memberSnap.forEach((docSnap) => {
          const data = docSnap.data() as IlsMifMasterRow;
          if (!data?.memberFirstName || !data?.memberLastName) return;
          loaded.push({
            ...data,
            rowId: data.rowId || docSnap.id,
          });
          if (data.sourceFileName) files.add(data.sourceFileName);
        });
      }

      // Fallback for older saves that only wrote the shared master collection.
      if (!loaded.length) {
        const snap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
        snap.forEach((docSnap) => {
          if (docSnap.id === '_meta') {
            const data = docSnap.data() || {};
            (Array.isArray(data.sourceFiles) ? data.sourceFiles : []).forEach((name: string) => {
              if (name) files.add(String(name));
            });
            return;
          }
          const data = docSnap.data() as IlsMifMasterRow & { runId?: string };
          if (!data?.memberFirstName || !data?.memberLastName) return;
          if (preferredRunId && String(data.runId || '') !== preferredRunId) return;
          loaded.push({
            ...data,
            rowId: data.rowId || docSnap.id,
          });
          if (data.sourceFileName) files.add(data.sourceFileName);
        });
      }

      if (!loaded.length) {
        toast({
          title: 'No saved members found',
          description: preferredRunId
            ? 'That consolidation run has no saved member rows yet. Save a new dated consolidation run.'
            : 'Upload MIF files and save a consolidation run first.',
        });
        return;
      }
      const deduped = dedupeIlsMifMasterRows(loaded);
      setRows(deduped);
      setSourceFiles(sortMifFileNamesByGeneratedDate(Array.from(files), 'desc'));
      setActiveRunId(preferredRunId || '');
      setHasCheckedCaspio(true);
      setLastMatchedLabel(preferredRunId ? `Loaded run ${preferredRunId}` : 'Loaded saved master list');
      setFilter('all');
      if (preferredRunId) setExpandedRunId(preferredRunId);
      setSelected(() => {
        const next: Record<string, boolean> = {};
        deduped.forEach((row) => {
          next[row.rowId] = row.mergeStatus === 'unique';
        });
        return next;
      });
      toast({
        title: preferredRunId ? 'Consolidation run loaded' : 'Saved master list loaded',
        description: `${deduped.length} members · ${files.size} MIF file(s). Use filters for Caspio / northern / new.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to load saved list',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const openNorthernDeclineComposer = () => {
    if (!hasCheckedCaspio) {
      toast({
        variant: 'destructive',
        title: 'Consolidate / Check Caspio first',
        description: 'Upload MIFs and wait for the Caspio check so New vs existing is known before sending northern denials.',
      });
      return;
    }
    const toSend =
      selectedNorthernForDecline.length > 0
        ? selectedNorthernForDecline
        : rows.filter(
            (row) =>
              isNorthernCounty(row.memberCounty) &&
              !row.caspioExists &&
              row.mergeStatus !== 'already_in_caspio' &&
              row.mergeStatus !== 'duplicate_in_batch' &&
              !declinedKeys.has(memberKey(row))
          );
    if (!toSend.length) {
      toast({
        variant: 'destructive',
        title: 'No northern members to decline',
        description:
          'Only Northern California members not already in Caspio (and not previously declined) are eligible. Check Caspio, then filter Northern not in Caspio.',
      });
      return;
    }
    setDeclineComposerRows(toSend);
    setDeclineComposerCustomText('');
    setDeclineComposerPreviewIndex(0);
    setDeclineComposerOpen(true);
  };

  const declineComposerPreviewRow = declineComposerRows[declineComposerPreviewIndex] || declineComposerRows[0] || null;

  const declineComposerPreview = useMemo(() => {
    if (!declineComposerPreviewRow) {
      return { subject: '', body: '', decisionText: '' };
    }
    const memberName = `${declineComposerPreviewRow.memberFirstName} ${declineComposerPreviewRow.memberLastName}`.trim();
    const customText = normalizeIlsDecisionCustomText(declineComposerCustomText);
    return {
      subject: buildIlsDecisionSubject(memberName, declineComposerPreviewRow.memberMrn),
      body: buildIlsDecisionTextBody({
        choice: 'decline',
        memberName,
        memberMrn: declineComposerPreviewRow.memberMrn,
        memberCounty: declineComposerPreviewRow.memberCounty,
        customText,
        declineReason: 'out_of_county',
      }),
      decisionText: buildIlsDecisionNarrative('decline', { declineReason: 'out_of_county' }),
    };
  }, [declineComposerPreviewRow, declineComposerCustomText]);

  const bulkSendNorthernDeclines = async () => {
    const toSend = declineComposerRows;
    if (!toSend.length) {
      toast({
        variant: 'destructive',
        title: 'No northern members to decline',
        description: 'Only Northern California members not already in Caspio (and not previously declined) are eligible.',
      });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required' });
      return;
    }

    const customText = normalizeIlsDecisionCustomText(declineComposerCustomText);
    setIsSendingDeclines(true);
    let sent = 0;
    let failed = 0;
    try {
      const idToken = await user.getIdToken();
      for (const row of toSend) {
        const memberName = `${row.memberFirstName} ${row.memberLastName}`.trim();
        const subject = buildIlsDecisionSubject(memberName, row.memberMrn);
        const emailBodyText = buildIlsDecisionTextBody({
          choice: 'decline',
          memberName,
          memberMrn: row.memberMrn,
          memberCounty: row.memberCounty,
          customText,
          declineReason: 'out_of_county',
        });
        const idempotencyKey =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        try {
          const response = await fetch('/api/admin/ils-service-delivery-decision', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              rowId: row.rowId,
              sourceType: 'mif_consolidator',
              sourceFileName: row.sourceFileName,
              memberName,
              memberMrn: row.memberMrn,
              memberCounty: row.memberCounty,
              memberClientId: row.clientId2 || row.caspioMatchedClientId2 || '',
              choice: 'decline',
              declineReason: 'out_of_county',
              customText,
              idempotencyKey,
            }),
          });
          const body = await response.json().catch(() => ({} as any));
          if (!response.ok || !body?.success) {
            throw new Error(body?.error || `HTTP ${response.status}`);
          }

          if (firestore) {
            const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
            await setDoc(
              doc(firestore, ILS_MIF_DECLINED_COLLECTION, key || row.rowId),
              {
                ...row,
                dedupeKey: key,
                memberName,
                declinedAtIso: new Date().toISOString(),
                declinedAtServer: serverTimestamp(),
                emailSubject: String(body?.log?.subject || subject),
                emailBodyText,
                customText,
                declineReason: 'out_of_county',
                actedByEmail: user.email || '',
                actedByUid: user.uid || '',
                to: [...ILS_DECISION_TO],
                cc: [...ILS_DECISION_CC],
              },
              { merge: true }
            );
          }
          sent += 1;
        } catch (error) {
          console.warn('Decline email failed for', memberName, error);
          failed += 1;
        }
      }
      await loadRunsAndDeclined();
      setDeclineComposerOpen(false);
      setDeclineComposerRows([]);
      setDeclineComposerCustomText('');
      toast({
        title: 'Bulk denials finished',
        description: `Sent ${sent} decline email(s) to ${ILS_DECISION_TO[0]} (CC ${ILS_DECISION_CC[0]})${
          failed ? ` · ${failed} failed` : ''
        }.`,
        className: failed ? undefined : 'bg-green-100 text-green-900 border-green-200',
        variant: failed && !sent ? 'destructive' : 'default',
      });
      setFilter('declined');
    } finally {
      setIsSendingDeclines(false);
    }
  };

  const openDeclinedEmailViewer = (row: DeclinedMemberRecord) => {
    const memberName = `${row.memberFirstName} ${row.memberLastName}`.trim();
    const rebuiltBody =
      row.emailBodyText ||
      buildIlsDecisionTextBody({
        choice: 'decline',
        memberName,
        memberMrn: row.memberMrn,
        memberCounty: row.memberCounty,
        customText: row.customText,
        declineReason: 'out_of_county',
      });
    const rebuiltSubject = row.emailSubject || buildIlsDecisionSubject(memberName, row.memberMrn);
    setViewedDeclineEmail({
      ...row,
      emailSubject: rebuiltSubject,
      emailBodyText: rebuiltBody,
    });
  };

  const clearSessionList = () => {
    if (!rows.length && !sourceFiles.length) return;
    const ok = window.confirm(
      'Clear the current session master list from this screen?\n\nSaved consolidation runs in Firestore are not deleted.'
    );
    if (!ok) return;
    setRows([]);
    setSourceFiles([]);
    setSelected({});
    setActiveRunId('');
    setMasterListCreatedAtIso('');
    setQueryText('');
    setFilter('all');
    setHasCheckedCaspio(false);
    setLastMatchedLabel('');
    setUploadDateWarnings([]);
    toast({
      title: 'Session list cleared',
      description: 'Saved consolidation runs are still available below.',
    });
  };

  const deleteConsolidationRun = async (run: ConsolidationRunSummary) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    const label = run.label || run.createdAtIso || run.id;
    const ok = window.confirm(
      `Delete consolidation run "${label}"?\n\nThis permanently removes:\n• The run record\n• Master-list members saved under this run\n\nUploaded file history and declined-member emails are kept. Linked uploads will be unlinked from this run.`
    );
    if (!ok) return;

    setDeletingRunId(run.id);
    try {
      const runMembersSnap = await getDocs(
        collection(
          firestore,
          ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
          run.id,
          ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
        )
      );
      const runMemberIds = runMembersSnap.docs.map((docSnap) => docSnap.id);

      const CHUNK = 400;
      for (let i = 0; i < runMemberIds.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        runMemberIds.slice(i, i + CHUNK).forEach((id) => {
          batch.delete(
            doc(
              firestore,
              ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
              run.id,
              ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
              id
            )
          );
        });
        await batch.commit();
      }

      // Also clear matching docs from the shared latest master list if they still point at this run.
      const masterSnap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      const masterIds: string[] = [];
      masterSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() || {};
        if (String(data.runId || '') === run.id) masterIds.push(docSnap.id);
      });
      for (let i = 0; i < masterIds.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        masterIds.slice(i, i + CHUNK).forEach((id) => {
          batch.delete(doc(firestore, ILS_MIF_MASTER_COLLECTION, id));
        });
        await batch.commit();
      }

      await deleteDoc(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, run.id));

      const linkedUploads = uploadedFiles.filter((file) => file.runId === run.id);
      for (let i = 0; i < linkedUploads.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        linkedUploads.slice(i, i + CHUNK).forEach((file) => {
          batch.set(
            doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, file.id),
            { runId: '', linkedRunAtIso: '' },
            { merge: true }
          );
        });
        await batch.commit();
      }

      const metaRef = doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta');
      const metaSnap = await getDoc(metaRef);
      if (metaSnap.exists() && String(metaSnap.data()?.latestRunId || '') === run.id) {
        const nextLatest = runs.find((item) => item.id !== run.id);
        await setDoc(
          metaRef,
          {
            latestRunId: nextLatest?.id || '',
            latestRunAtIso: nextLatest?.createdAtIso || '',
            memberCount: nextLatest ? Number(nextLatest.memberCount || nextLatest.totals.total || 0) : 0,
            sourceFiles: nextLatest?.sourceFiles || [],
            totals: nextLatest?.totals || {},
            updatedAt: new Date().toISOString(),
            updatedAtServer: serverTimestamp(),
            updatedBy: user?.email || user?.uid || '',
          },
          { merge: true }
        );
      }

      if (activeRunId === run.id) {
        setRows([]);
        setSourceFiles([]);
        setSelected({});
        setActiveRunId('');
        setMasterListCreatedAtIso('');
        setHasCheckedCaspio(false);
        setLastMatchedLabel('');
        setFilter('all');
      }

      await loadRunsAndDeclined();
      toast({
        title: 'Consolidation run deleted',
        description: `Removed "${label}" and ${runMemberIds.length} saved member row(s) from that run.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to delete consolidation run',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setDeletingRunId('');
    }
  };

  const deleteUploadedFileRecord = async (file: IlsMifUploadedFileRecord) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    const ok = window.confirm(
      `Remove uploaded file record "${file.fileName}"?\n\nThis only deletes the upload history row, not consolidation runs or member master rows.`
    );
    if (!ok) return;
    setDeletingUploadId(file.id);
    try {
      const membersSnap = await getDocs(
        collection(
          firestore,
          ILS_MIF_UPLOADED_FILES_COLLECTION,
          file.id,
          ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION
        )
      );
      const CHUNK = 400;
      const memberIds = membersSnap.docs.map((docSnap) => docSnap.id);
      for (let i = 0; i < memberIds.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        memberIds.slice(i, i + CHUNK).forEach((id) => {
          batch.delete(
            doc(
              firestore,
              ILS_MIF_UPLOADED_FILES_COLLECTION,
              file.id,
              ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION,
              id
            )
          );
        });
        await batch.commit();
      }
      await deleteDoc(doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, file.id));
      setUploadMembersById((prev) => {
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      if (expandedUploadId === file.id) setExpandedUploadId('');
      await loadRunsAndDeclined();
      setUploadDateWarnings((prev) =>
        prev.filter((line) => !line.toLowerCase().includes(file.fileName.toLowerCase()))
      );
      toast({
        title: 'Uploaded MIF removed',
        description: `Deleted ${file.fileName} and its ${memberIds.length} saved member row(s).`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to delete upload record',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setDeletingUploadId('');
    }
  };

  const clearAllUploadedFileRecords = async () => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    if (!uploadedFiles.length) return;
    const ok = window.confirm(
      `Delete all ${uploadedFiles.length} uploaded MIF file history records?\n\nThis clears overlap-warning history only. Session master rows and consolidation runs are not deleted.`
    );
    if (!ok) return;
    setDeletingUploadId('__all__');
    try {
      const CHUNK = 400;
      for (const file of uploadedFiles) {
        const membersSnap = await getDocs(
          collection(
            firestore,
            ILS_MIF_UPLOADED_FILES_COLLECTION,
            file.id,
            ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION
          )
        );
        const memberIds = membersSnap.docs.map((docSnap) => docSnap.id);
        for (let i = 0; i < memberIds.length; i += CHUNK) {
          const batch = writeBatch(firestore);
          memberIds.slice(i, i + CHUNK).forEach((id) => {
            batch.delete(
              doc(
                firestore,
                ILS_MIF_UPLOADED_FILES_COLLECTION,
                file.id,
                ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION,
                id
              )
            );
          });
          await batch.commit();
        }
      }
      for (let i = 0; i < uploadedFiles.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        uploadedFiles.slice(i, i + CHUNK).forEach((file) => {
          batch.delete(doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, file.id));
        });
        await batch.commit();
      }
      setUploadMembersById({});
      setExpandedUploadId('');
      setUploadDateWarnings([]);
      await loadRunsAndDeclined();
      toast({
        title: 'Upload history cleared',
        description: 'Deleted uploaded MIF records and their saved member lists. Re-upload to rebuild.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to clear upload history',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setDeletingUploadId('');
    }
  };

  const downloadMasterAsCsMif = async () => {
    if (!rows.length) {
      toast({
        variant: 'destructive',
        title: 'Nothing to download',
        description: 'Upload or load a master list first.',
      });
      return;
    }
    setIsDownloading(true);
    try {
      const stamp = masterListCreatedAtIso
        ? masterListCreatedAtIso.slice(0, 10).replace(/-/g, '')
        : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = await downloadIlsMifMasterAsCsMifWorkbook(
        rows,
        `ILS_CS_MIF_Master_${stamp}.xlsx`
      );
      toast({
        title: 'Master MIF downloaded',
        description: `Saved ${rows.length} member(s) as CS_MIF workbook: ${fileName}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: String(error?.message || 'Could not build the CS_MIF workbook.'),
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const sendSelectedToCreateApplication = async (runId?: string) => {
    if (!hasCheckedCaspio && !runId) {
      toast({
        variant: 'destructive',
        title: 'Consolidate / Check Caspio first',
        description: 'Upload MIFs so the master list can be Caspio-checked before sending new members to Create Application.',
      });
      return;
    }
    const payloadRows = selectedNewRows.length
      ? selectedNewRows
      : rows.filter(
          (row) =>
            row.mergeStatus === 'unique' &&
            !row.caspioExists &&
            !declinedKeys.has(memberKey(row))
        );
    if (!payloadRows.length) {
      toast({
        variant: 'destructive',
        title: 'No new members selected',
        description:
          'Select members marked New (not in Caspio, not declined for Northern California), then try again.',
      });
      return;
    }
    try {
      let handoffRunId = String(runId || activeRunId || '').trim();
      if (!handoffRunId) {
        handoffRunId = await saveMasterListAndRun({ quiet: true });
        if (!handoffRunId) return;
      }
      const handoff = {
        createdAt: new Date().toISOString(),
        sourceFiles,
        runId: handoffRunId,
        rows: payloadRows.map(masterRowToCreateAppImportShape),
      };
      window.sessionStorage.setItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY, JSON.stringify(handoff));
      toast({
        title: 'New members ready on Create Application',
        description: `${payloadRows.length} new members staged from consolidation run. Parse each row, create skeleton, assign staff.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      window.open(
        `/admin/applications/create?intake=ils_mif&fromConsolidator=1${
          handoff.runId ? `&consolidatorRunId=${encodeURIComponent(handoff.runId)}` : ''
        }`,
        '_blank',
        'noopener,noreferrer'
      );
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to stage members',
        description: String(error?.message || 'Unknown error'),
      });
    }
  };

  const statusBadge = (row: IlsMifMasterRow) => {
    if (declinedKeys.has(memberKey(row))) {
      return <Badge className="bg-rose-100 text-rose-900 hover:bg-rose-100">Declined</Badge>;
    }
    if (row.mergeStatus === 'duplicate_in_batch') {
      return <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-200">Batch duplicate</Badge>;
    }
    if (row.mergeStatus === 'incomplete') {
      return <Badge variant="destructive">Incomplete</Badge>;
    }
    if (!hasCheckedCaspio) {
      return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Awaiting Caspio check</Badge>;
    }
    if (row.mergeStatus === 'already_in_caspio') {
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">In Caspio</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">New</Badge>;
  };

  const clickableStat = (
    mode: FilterMode,
    label: string,
    value: number | string,
    className: string,
    options?: { disabled?: boolean; hint?: string }
  ) => (
    <button
      type="button"
      disabled={options?.disabled}
      onClick={() => {
        if (options?.disabled) return;
        setFilter(mode);
        if (mode === 'northern') setNorthernOnly(true);
        else if (mode !== 'all') setNorthernOnly(false);
        scrollToMasterList();
      }}
      className={`rounded-lg border bg-white p-3 text-left transition hover:border-slate-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:shadow-none ${
        filter === mode ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${className}`}>{value}</div>
      <div className="mt-1 text-[11px] text-blue-700">
        {options?.disabled
          ? options.hint || 'Check Caspio first'
          : [options?.hint, 'Jump to Master list'].filter(Boolean).join(' · ')}
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            ILS MIF Consolidator
          </CardTitle>
          <CardDescription>
            Upload each MIF (saved with member names/MRNs). Same-date uploads report how many members are new. Then
            Check Caspio / Save a consolidation run. Create Application uses Not in Caspio only. Declines skip anyone
            already declined.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-950 space-y-1">
            <div className="font-medium">Recommended workflow</div>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>
                <span className="font-medium">Upload MIFs</span> — each file is saved with its members; same-date files
                show how many members are new.
              </li>
              <li>
                <span className="font-medium">Browse Uploaded MIFs</span> — expand a file to see names + MRNs.
              </li>
              <li>
                <span className="font-medium">Save Dated Consolidation Run</span> — full master list for filtering
                (Caspio / northern / declined).
              </li>
              <li>
                <span className="font-medium">Northern denials</span> — only Northern not-in-Caspio members who are
                not already declined are emailed.
              </li>
              <li>
                <span className="font-medium">Create Application</span> — loads Not in Caspio and not declined
                (Northern California) from the saved run for assignment. To add another MIF later, review MIFs in the
                latest run, upload the new file, re-check Caspio, and save a new run.
              </li>
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={(event) => void handleUploadFiles(event.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isParsing || isMatching}
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsing || isMatching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isParsing
                ? 'Uploading into master list…'
                : isMatching
                  ? 'Checking Caspio…'
                  : '1) Upload MIFs → Consolidate + Check Caspio'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isMatching || isParsing || !rows.length}
              onClick={() => void checkCaspio()}
            >
              {isMatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Re-check Caspio
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSendingDeclines || !rows.length || !hasCheckedCaspio}
              onClick={() => openNorthernDeclineComposer()}
            >
              {isSendingDeclines ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              2) Bulk Send Northern Denials
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving || !rows.length || !hasCheckedCaspio}
              onClick={() => void saveMasterListAndRun()}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              3) Save Dated Consolidation Run
            </Button>
            <Button
              size="sm"
              disabled={!rows.length || isSaving || isParsing || isMatching || !hasCheckedCaspio}
              onClick={() => void sendSelectedToCreateApplication()}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              4) Send New Members to Create Application
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isDownloading || !rows.length}
              onClick={() => void downloadMasterAsCsMif()}
            >
              {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download Master as CS_MIF
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length && !sourceFiles.length}
              onClick={() => clearSessionList()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Session List
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingSaved}
              onClick={() => void loadSavedMasterList()}
            >
              {isLoadingSaved ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Load Latest Master List
            </Button>
          </div>

          <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Decline emails go <span className="font-medium">To</span> {ILS_DECISION_TO[0]} and always{' '}
            <span className="font-medium">CC</span> {ILS_DECISION_CC[0]}. Subject uses member name + MRN.
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex flex-wrap items-center gap-1">
                Session files ({mifDateSortDesc ? 'newest first' : 'oldest first'}):{' '}
                <span className="font-medium text-slate-800">
                  {sortedSessionFiles.length ? `${sortedSessionFiles.length} MIF file(s)` : 'None yet'}
                </span>
                {sortedSessionFiles.length ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 text-blue-700 underline-offset-2 hover:underline"
                      onClick={() => setSessionFilesExpanded((prev) => !prev)}
                    >
                      {sessionFilesExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {sessionFilesExpanded ? 'Hide MIFs' : 'Show MIFs'}
                    </button>
                    <button
                      type="button"
                      className="text-blue-700 underline-offset-2 hover:underline"
                      onClick={() => toggleMifDateSort()}
                    >
                      reverse
                    </button>
                  </>
                ) : null}
              </span>
              {lastMatchedLabel ? <span>Last Caspio check: {lastMatchedLabel}</span> : null}
              {masterListCreatedAtIso ? (
                <span>
                  Master list create date:{' '}
                  <span className="font-medium text-slate-800">
                    {new Date(masterListCreatedAtIso).toLocaleString()}
                  </span>
                </span>
              ) : null}
              {activeRunId ? <span>Active run: {activeRunId}</span> : null}
            </div>
            {sessionFilesExpanded && sortedSessionFiles.length ? (
              <ul className="max-h-[180px] overflow-auto rounded border bg-white divide-y text-xs text-slate-800">
                {sortedSessionFiles.map((fileName) => {
                  const dateKey = extractMifGeneratedDateKey(fileName);
                  return (
                    <li
                      key={`session-mif-${fileName}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5"
                    >
                      <span className="font-medium">{fileName}</span>
                      <span className="text-muted-foreground">
                        {formatMifGeneratedDateLabel(dateKey) || dateKey || 'No date in name'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {uploadDateWarnings.length ? (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
              <div className="font-medium">MIF date overlap warnings</div>
              {uploadDateWarnings.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {clickableStat(
              'all',
              'Total members',
              totals.total,
              '',
              {
                hint:
                  totals.duplicates > 0
                    ? `${totals.duplicates} batch duplicates excluded`
                    : undefined,
              }
            )}
            {clickableStat(
              'new',
              'Not in Caspio (Create App)',
              hasCheckedCaspio ? totals.unique : '—',
              hasCheckedCaspio ? 'text-emerald-700' : 'text-muted-foreground',
              {
                disabled: !hasCheckedCaspio,
                hint: hasCheckedCaspio ? 'Excludes Caspio + declined' : 'Check Caspio first',
              }
            )}
            {clickableStat(
              'caspio',
              'Already in Caspio',
              hasCheckedCaspio ? totals.caspio : '—',
              hasCheckedCaspio ? 'text-amber-700' : 'text-muted-foreground',
              {
                disabled: !hasCheckedCaspio,
                hint: hasCheckedCaspio ? undefined : 'Check Caspio first',
              }
            )}
            {clickableStat('incomplete', 'Incomplete', totals.incomplete, 'text-red-700')}
            {clickableStat(
              'northern',
              'Northern not in Caspio',
              hasCheckedCaspio ? totals.northern : '—',
              hasCheckedCaspio ? 'text-indigo-700' : 'text-muted-foreground',
              {
                disabled: !hasCheckedCaspio,
                hint: hasCheckedCaspio
                  ? 'Already serving Caspio members are excluded'
                  : 'Check Caspio first',
              }
            )}
            {clickableStat('declined', 'Declined list', totals.declined || declinedMembers.length, 'text-rose-700')}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Search name, MRN, CIN, county, file…"
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              variant={northernOnly || filter === 'northern' ? 'default' : 'outline'}
              disabled={!hasCheckedCaspio}
              onClick={() => {
                setNorthernOnly((prev) => !prev);
                setFilter('northern');
                scrollToMasterList();
              }}
            >
              <MapPin className="mr-1 h-4 w-4" />
              Northern not in Caspio
            </Button>
            {(
              [
                ['new', 'Not in Caspio'],
                ['caspio', 'In Caspio'],
                ['duplicates', 'Duplicates'],
                ['incomplete', 'Incomplete'],
                ['declined', 'Declined'],
                ['all', 'All'],
              ] as Array<[FilterMode, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                disabled={(value === 'new' || value === 'caspio') && !hasCheckedCaspio}
                onClick={() => {
                  setFilter(value);
                  if (value !== 'northern') setNorthernOnly(false);
                  scrollToMasterList();
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {latestConsolidationRun ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              MIFs in Latest Consolidation Run
            </CardTitle>
            <CardDescription>
              Before uploading another MIF, review what is already in{' '}
              {latestConsolidationRun.label || latestConsolidationRun.createdAtIso}. Then upload to add into the master
              list, re-check Caspio, and save a new run for Create Application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestRunMifFiles.length === 0 ? (
              <div className="text-sm text-muted-foreground">No MIF filenames stored on the latest run.</div>
            ) : (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm text-blue-700 underline-offset-2 hover:underline"
                  onClick={() => setLatestRunMifsExpanded((prev) => !prev)}
                >
                  {latestRunMifsExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {latestRunMifsExpanded
                    ? `Hide ${latestRunMifFiles.length} MIF file(s)`
                    : `Show ${latestRunMifFiles.length} MIF file(s)`}
                </button>
                {latestRunMifsExpanded ? (
                  <ul className="divide-y rounded border bg-white max-h-[220px] overflow-auto">
                    {latestRunMifFiles.map((fileName) => {
                      const dateKey = extractMifGeneratedDateKey(fileName);
                      return (
                        <li
                          key={`latest-run-mif-${fileName}`}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs"
                        >
                          <span className="font-medium">{fileName}</span>
                          <span className="text-muted-foreground">
                            {formatMifGeneratedDateLabel(dateKey) || dateKey || 'No date in name'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Uploaded MIF Files (viewable)
          </CardTitle>
          <CardDescription>
            Each uploaded MIF is saved with its members. Expand a row to see names and MRNs. Same-date uploads report
            how many members are new before merge.
            {masterListCreatedAtIso
              ? ` Latest consolidation list created ${new Date(masterListCreatedAtIso).toLocaleString()}.`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-rose-700"
              disabled={!uploadedFiles.length || deletingUploadId === '__all__'}
              onClick={() => void clearAllUploadedFileRecords()}
            >
              {deletingUploadId === '__all__' ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-3.5 w-3.5" />
              )}
              Clear All Upload History
            </Button>
          </div>
          <div className="max-h-[420px] overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-semibold hover:text-blue-700"
                      onClick={() => toggleMifDateSort()}
                      title="Toggle MIF date sort"
                    >
                      MIF date
                      {mifDateSortDesc ? (
                        <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpNarrowWide className="h-3.5 w-3.5" />
                      )}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {mifDateSortDesc ? 'newest' : 'oldest'}
                      </span>
                    </button>
                  </th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2">Members</th>
                  <th className="px-3 py-2">Linked run</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUploadedFiles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No uploaded MIF files saved yet.
                    </td>
                  </tr>
                ) : (
                  sortedUploadedFiles.map((file) => {
                    const dateKey = file.mifDateKey || extractMifGeneratedDateKey(file.fileName);
                    const isExpanded = expandedUploadId === file.id;
                    const members = uploadMembersById[file.id] || [];
                    return (
                      <React.Fragment key={file.id}>
                        <tr className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {file.mifDateLabel || formatMifGeneratedDateLabel(dateKey) || dateKey || '—'}
                          </td>
                          <td className="px-3 py-2 font-medium">{file.fileName}</td>
                          <td className="px-3 py-2">
                            {file.uploadedAtIso ? new Date(file.uploadedAtIso).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2">{file.rowCount || 0}</td>
                          <td className="px-3 py-2 text-muted-foreground">{file.runId || 'Not linked yet'}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => void toggleUploadedMifMembers(file.id)}
                              >
                                {loadingUploadMembersId === file.id ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Eye className="mr-1 h-3.5 w-3.5" />
                                )}
                                {isExpanded ? 'Hide members' : 'View members'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-rose-700"
                                disabled={deletingUploadId === file.id}
                                onClick={() => void deleteUploadedFileRecord(file)}
                              >
                                {deletingUploadId === file.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-t bg-slate-50">
                            <td colSpan={6} className="px-3 py-2">
                              {loadingUploadMembersId === file.id ? (
                                <div className="text-xs text-muted-foreground">Loading members…</div>
                              ) : members.length === 0 ? (
                                <div className="text-xs text-muted-foreground">
                                  No saved members for this file (older uploads may only have history metadata).
                                </div>
                              ) : (
                                <div className="max-h-[220px] overflow-auto rounded border bg-white">
                                  <table className="min-w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-100 text-left">
                                      <tr>
                                        <th className="px-2 py-1">Last</th>
                                        <th className="px-2 py-1">First</th>
                                        <th className="px-2 py-1">MRN</th>
                                        <th className="px-2 py-1">CIN</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {members.map((member, index) => (
                                        <tr
                                          key={`${file.id}-${member.memberMrn || member.memberMediCalNum || index}`}
                                          className="border-t"
                                        >
                                          <td className="px-2 py-1">{member.memberLastName}</td>
                                          <td className="px-2 py-1">{member.memberFirstName}</td>
                                          <td className="px-2 py-1">{member.memberMrn || '—'}</td>
                                          <td className="px-2 py-1">{member.memberMediCalNum || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Consolidation Runs
          </CardTitle>
          <CardDescription>
            Each Save stores a full dated run in the app: every member plus the MIF filenames in that run. Click Show
            MIFs / Open Run anytime to reopen the full list. Create Application loads only New (not in Caspio) from a
            run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved runs yet.</div>
          ) : (
            runs.map((run) => {
              const runMifs = sortMifFileNamesByGeneratedDate(run.sourceFiles || [], mifDateSortDirection);
              const isExpanded = expandedRunId === run.id;
              const totalSaved = run.memberCount || run.totals.total || 0;
              return (
                <div key={run.id} className="rounded border px-3 py-2 text-sm space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setExpandedRunId(isExpanded ? '' : run.id)}
                    >
                      <div className="font-medium">{run.label || run.createdAtIso}</div>
                      <div className="text-xs text-muted-foreground">
                        Full list {totalSaved} · {run.newMemberCount} new ·{' '}
                        {run.caspioMemberCount ?? run.totals.caspio} in Caspio ·{' '}
                        {run.northernMemberCount ?? run.totals.northern} northern
                        {typeof run.declinedMemberCount === 'number'
                          ? ` · ${run.declinedMemberCount} declined`
                          : ''}
                        {runMifs.length ? ` · ${runMifs.length} MIF file(s)` : ''}
                        {' · '}
                        <span className="text-blue-700">{isExpanded ? 'Hide MIFs' : 'Show MIFs'}</span>
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isLoadingSaved || Boolean(deletingRunId)}
                        onClick={() => {
                          setExpandedRunId(run.id);
                          void loadSavedMasterList(run.id);
                        }}
                      >
                        Open Run
                      </Button>
                      <Button
                        size="sm"
                        disabled={Boolean(deletingRunId)}
                        onClick={() => void sendSelectedToCreateApplication(run.id)}
                      >
                        Send New to Create App
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-700"
                        disabled={deletingRunId === run.id || Boolean(deletingRunId)}
                        onClick={() => void deleteConsolidationRun(run)}
                      >
                        {deletingRunId === run.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="rounded border bg-slate-50 px-3 py-2">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium text-slate-700">
                          MIFs in this run ({mifDateSortDesc ? 'newest → oldest' : 'oldest → newest'})
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => toggleMifDateSort()}
                        >
                          {mifDateSortDesc ? (
                            <ArrowDownWideNarrow className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpNarrowWide className="mr-1 h-3.5 w-3.5" />
                          )}
                          Reverse date order
                        </Button>
                      </div>
                      {runMifs.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No source MIF filenames saved.</div>
                      ) : (
                        <ul className="divide-y rounded border bg-white">
                          {runMifs.map((fileName) => {
                            const dateKey = extractMifGeneratedDateKey(fileName);
                            return (
                              <li
                                key={`${run.id}-${fileName}`}
                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs"
                              >
                                <span className="font-medium text-slate-900">{fileName}</span>
                                <span className="text-muted-foreground">
                                  {formatMifGeneratedDateLabel(dateKey) || dateKey || 'No date in name'}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {filter === 'declined' ? (
        <Card ref={masterListAnchorRef} id="mif-master-list">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Declined Members List</CardTitle>
            <CardDescription>
              Members emailed to ILS as out-of-county declines. Always CC {ILS_DECISION_CC[0]}. Use View Email to open
              the exact decline message that was sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">MRN</th>
                    <th className="px-3 py-2">County</th>
                    <th className="px-3 py-2">Declined</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {declinedMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                        No declined members yet.
                      </td>
                    </tr>
                  ) : (
                    declinedMembers.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 font-medium">
                          {row.memberLastName}, {row.memberFirstName}
                        </td>
                        <td className="px-3 py-2">{row.memberMrn || '—'}</td>
                        <td className="px-3 py-2">{row.memberCounty || '—'}</td>
                        <td className="px-3 py-2">
                          {row.declinedAtIso ? new Date(row.declinedAtIso).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.emailSubject || '—'}</td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => openDeclinedEmailViewer(row)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View Email
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card ref={masterListAnchorRef} id="mif-master-list">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Master List</CardTitle>
            <CardDescription>
              {visibleRows.length} shown · {selectedNewRows.length} new selected ·{' '}
              {selectedNorthernForDecline.length} northern selected for denial
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[560px] overflow-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Select</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">MRN / CIN</th>
                    <th className="px-3 py-2">County</th>
                    <th className="px-3 py-2">Source file</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        Upload MIF spreadsheets to build the master list.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const canSelectCreate =
                        hasCheckedCaspio && row.mergeStatus === 'unique' && !row.caspioExists;
                      const canSelectDecline =
                        isNorthernCounty(row.memberCounty) && !declinedKeys.has(memberKey(row));
                      return (
                        <tr key={row.rowId} className="border-t align-top">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              disabled={!canSelectCreate && !canSelectDecline}
                              checked={Boolean(selected[row.rowId])}
                              onChange={(event) =>
                                setSelected((prev) => ({ ...prev, [row.rowId]: event.target.checked }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">{statusBadge(row)}</td>
                          <td className="px-3 py-2 font-medium">
                            {row.memberLastName}, {row.memberFirstName}
                            {isNorthernCounty(row.memberCounty) ? (
                              <div className="text-[11px] font-normal text-indigo-700">Northern county</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div>MRN: {row.memberMrn || '—'}</div>
                            <div>CIN: {row.memberMediCalNum || '—'}</div>
                          </td>
                          <td className="px-3 py-2">{row.memberCounty || '—'}</td>
                          <td className="px-3 py-2">{row.sourceFileName || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.statusNote || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-sm">
        <Link href="/admin/applications/create" className="text-blue-700 underline">
          Open Create Application
        </Link>
      </div>

      <Dialog
        open={declineComposerOpen}
        onOpenChange={(open) => {
          if (isSendingDeclines) return;
          setDeclineComposerOpen(open);
          if (!open) {
            setDeclineComposerRows([]);
            setDeclineComposerCustomText('');
            setDeclineComposerPreviewIndex(0);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review northern decline emails</DialogTitle>
            <DialogDescription>
              Add optional text included in every decline email below, then confirm send. Only members not already on
              the declined list are included. To {ILS_DECISION_TO[0]} · CC {ILS_DECISION_CC[0]}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded border bg-slate-50 px-3 py-2 text-xs">
              Sending {declineComposerRows.length} decline email(s). Preview member{' '}
              {declineComposerRows.length
                ? `${Math.min(declineComposerPreviewIndex, declineComposerRows.length - 1) + 1} of ${declineComposerRows.length}`
                : '0'}
              .
            </div>

            {declineComposerRows.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={declineComposerPreviewIndex <= 0}
                  onClick={() => setDeclineComposerPreviewIndex((prev) => Math.max(0, prev - 1))}
                >
                  Previous preview
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={declineComposerPreviewIndex >= declineComposerRows.length - 1}
                  onClick={() =>
                    setDeclineComposerPreviewIndex((prev) =>
                      Math.min(declineComposerRows.length - 1, prev + 1)
                    )
                  }
                >
                  Next preview
                </Button>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="northern-decline-custom-text">Optional custom paragraph (added to every email)</Label>
              <Textarea
                id="northern-decline-custom-text"
                value={declineComposerCustomText}
                onChange={(event) =>
                  setDeclineComposerCustomText(event.target.value.slice(0, ILS_DECISION_CUSTOM_TEXT_MAX))
                }
                placeholder="Add notes that should appear in every northern decline email before you send."
                className="min-h-[100px]"
                maxLength={ILS_DECISION_CUSTOM_TEXT_MAX}
                disabled={isSendingDeclines}
              />
              <div className="text-[11px] text-muted-foreground">
                {declineComposerCustomText.length}/{ILS_DECISION_CUSTOM_TEXT_MAX}
              </div>
            </div>

            <div className="rounded border bg-white p-3 space-y-2">
              <div>
                <span className="font-medium">Subject:</span> {declineComposerPreview.subject || '—'}
              </div>
              <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm leading-6">
                {declineComposerPreview.body || 'No preview available.'}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Standard decline line: {declineComposerPreview.decisionText}
              </div>
            </div>

            <div className="max-h-40 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left">
                  <tr>
                    <th className="px-2 py-1">Member</th>
                    <th className="px-2 py-1">MRN</th>
                    <th className="px-2 py-1">County</th>
                  </tr>
                </thead>
                <tbody>
                  {declineComposerRows.map((row, index) => (
                    <tr
                      key={row.rowId}
                      className={`border-t cursor-pointer ${
                        index === declineComposerPreviewIndex ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setDeclineComposerPreviewIndex(index)}
                    >
                      <td className="px-2 py-1">
                        {row.memberLastName}, {row.memberFirstName}
                      </td>
                      <td className="px-2 py-1">{row.memberMrn || '—'}</td>
                      <td className="px-2 py-1">{row.memberCounty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSendingDeclines}
              onClick={() => setDeclineComposerOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSendingDeclines || !declineComposerRows.length} onClick={() => void bulkSendNorthernDeclines()}>
              {isSendingDeclines ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Confirm & Send {declineComposerRows.length} Decline{declineComposerRows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewedDeclineEmail)} onOpenChange={(open) => !open && setViewedDeclineEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Declined member email</DialogTitle>
            <DialogDescription>
              {viewedDeclineEmail
                ? `${viewedDeclineEmail.memberLastName}, ${viewedDeclineEmail.memberFirstName}`
                : 'Decline email'}
            </DialogDescription>
          </DialogHeader>
          {viewedDeclineEmail ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">To:</span>{' '}
                {(viewedDeclineEmail.to.length ? viewedDeclineEmail.to : [...ILS_DECISION_TO]).join(', ')}
              </div>
              <div>
                <span className="font-medium">CC:</span>{' '}
                {(viewedDeclineEmail.cc.length ? viewedDeclineEmail.cc : [...ILS_DECISION_CC]).join(', ')}
              </div>
              <div>
                <span className="font-medium">Subject:</span> {viewedDeclineEmail.emailSubject || '—'}
              </div>
              {viewedDeclineEmail.customText ? (
                <div>
                  <span className="font-medium">Custom text included:</span>
                  <div className="mt-1 whitespace-pre-wrap rounded border bg-amber-50 px-3 py-2">
                    {viewedDeclineEmail.customText}
                  </div>
                </div>
              ) : null}
              <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 leading-6">
                {viewedDeclineEmail.emailBodyText || 'Email body was not stored for this older decline record.'}
              </div>
              <div className="text-xs text-muted-foreground">
                Sent {viewedDeclineEmail.declinedAtIso ? new Date(viewedDeclineEmail.declinedAtIso).toLocaleString() : '—'}
                {viewedDeclineEmail.actedByEmail ? ` by ${viewedDeclineEmail.actedByEmail}` : ''}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewedDeclineEmail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
