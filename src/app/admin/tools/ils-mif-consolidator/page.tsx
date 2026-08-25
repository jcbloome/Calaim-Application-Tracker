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
  History,
  Download,
  Trash2,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Eye,
  ChevronDown,
  ChevronRight,
  Copy,
  Send,
} from 'lucide-react';
import {
  addDoc,
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { identityTokenLookupKeys } from '@/lib/member-identity';
import { Checkbox } from '@/components/ui/checkbox';
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
  diffIlsMifMemberLists,
  downloadIlsMifMasterAsCsMifWorkbook,
  extractMifGeneratedDateKey,
  findMifDateUploadOverlaps,
  formatMifGeneratedDateLabel,
  ilsMifMonthKeyFromIso,
  ilsMifNeedsStatusUpdate,
  ilsMifRowNeedsAuthorizedUpdate,
  isIlsMifCaspioAuthorizedStatus,
  isIlsMifCaspioPendingStatus,
  isIlsMifSourcedMasterRow,
  resolveIlsMifNeedsAuthorizedUpdate,
  isIlsMifT2038ReceivedStatus,
  resolveIlsMifMergeStatusForCaspioMatch,
  ILS_MIF_TARGET_T2038_RECEIVED_STATUS,
  mergeIlsMifMonthlyCounts,
  ILS_MIF_AUDIT_COLLECTION,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_CONSOLIDATOR_HANDOFF_KEY,
  ILS_MIF_DECLINED_COLLECTION,
  ILS_MIF_NORTHERN_DECLINE_BATCHES_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_REMOVED_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
  ILS_MIF_RUN_REMOVED_SUBCOLLECTION,
  ILS_MIF_UPLOADED_FILES_COLLECTION,
  ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION,
  IlsMifMasterRow,
  type IlsMifMemberDiffSummary,
  IlsMifMemberIdentitySummary,
  IlsMifUploadedFileRecord,
  isNorthernCounty,
  findNewMembersNotInPriorList,
  MASTER_LIST_PAGE_SIZE,
  masterRowToCreateAppImportShape,
  NORTHERN_DECLINE_CONFIRM_THRESHOLD,
  parseIlsMifSpreadsheetFile,
  sortMifFileNamesByGeneratedDate,
  summarizeIlsMifMembersForBrowse,
  type IlsMifAuditAction,
} from '@/lib/ils-mif-parse';
import {
  ILS_DECISION_CC,
  ILS_DECISION_TO,
  buildIlsBulkOutOfCountyDeclineSubject,
  buildIlsBulkOutOfCountyDeclineTextBody,
  buildIlsDecisionSubject,
  buildIlsDecisionTextBody,
} from '@/lib/ils-decision-email';
import { fetchKaiserMembers } from '@/lib/fetch-kaiser-members';
import { markIlsMifMemberAuthorizedFromMifPush } from '@/lib/ils-mif-consolidator-sync';

type FilterMode =
  | 'all'
  | 'new'
  | 'caspio'
  | 'status-updates'
  | 'duplicates'
  | 'incomplete'
  | 'northern'
  | 'declined';

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

type NorthernDeclineBatchRecord = {
  id: string;
  sentAtIso: string;
  subject: string;
  emailBodyText: string;
  customText: string;
  memberCount: number;
  members: Array<{
    memberFirstName: string;
    memberLastName: string;
    memberMrn: string;
    memberCounty: string;
  }>;
  actedByEmail: string;
  to: string[];
  cc: string[];
  runId: string;
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
  const [uploadedFilesSectionExpanded, setUploadedFilesSectionExpanded] = useState(false);
  const [uploadDateWarnings, setUploadDateWarnings] = useState<string[]>([]);
  const [mifDateSortDesc, setMifDateSortDesc] = useState(true);
  const [activeRunId, setActiveRunId] = useState('');
  const [runs, setRuns] = useState<ConsolidationRunSummary[]>([]);
  const [declinedMembers, setDeclinedMembers] = useState<DeclinedMemberRecord[]>([]);
  const [declinedKeys, setDeclinedKeys] = useState<Set<string>>(new Set());
  const [northernDeclineBatches, setNorthernDeclineBatches] = useState<NorthernDeclineBatchRecord[]>([]);
  const [viewedNorthernBatch, setViewedNorthernBatch] = useState<NorthernDeclineBatchRecord | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<IlsMifUploadedFileRecord[]>([]);
  const [masterListCreatedAtIso, setMasterListCreatedAtIso] = useState('');
  /** Net-new unique members added to the session master from uploads this session. */
  const [sessionNetNewFromUploads, setSessionNetNewFromUploads] = useState(0);
  const [lastUploadStats, setLastUploadStats] = useState<{
    netNew: number;
    parsedRows: number;
    fileCount: number;
  } | null>(null);
  const [declineComposerOpen, setDeclineComposerOpen] = useState(false);
  const [declineComposerRows, setDeclineComposerRows] = useState<IlsMifMasterRow[]>([]);
  const [declineComposerSubject, setDeclineComposerSubject] = useState('');
  const [declineComposerBody, setDeclineComposerBody] = useState('');
  const [declinePreviewApproved, setDeclinePreviewApproved] = useState(false);
  const [viewedDeclineEmail, setViewedDeclineEmail] = useState<DeclinedMemberRecord | null>(null);
  const [expandedUploadId, setExpandedUploadId] = useState('');
  const [uploadMembersById, setUploadMembersById] = useState<Record<string, IlsMifMemberIdentitySummary[]>>({});
  const [loadingUploadMembersId, setLoadingUploadMembersId] = useState('');
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [masterPage, setMasterPage] = useState(0);
  const [declineConfirmTyped, setDeclineConfirmTyped] = useState('');
  const [isRemovingSelected, setIsRemovingSelected] = useState(false);
  const [isRestoringRemoved, setIsRestoringRemoved] = useState(false);
  const [restoringRunId, setRestoringRunId] = useState('');
  const [runDiff, setRunDiff] = useState<{
    currentRunId: string;
    priorRunId: string;
    currentLabel: string;
    priorLabel: string;
    summary: IlsMifMemberDiffSummary;
  } | null>(null);
  const [isComparingRuns, setIsComparingRuns] = useState(false);
  const [auditEvents, setAuditEvents] = useState<
    Array<{ id: string; action: string; summary: string; atIso: string; actor: string }>
  >([]);
  const [authDetailRow, setAuthDetailRow] = useState<IlsMifMasterRow | null>(null);
  const [isPushingAuthorized, setIsPushingAuthorized] = useState(false);
  const [authorizePushResults, setAuthorizePushResults] = useState<{
    authorized: Array<{
      rowId: string;
      memberName: string;
      clientId2: string;
      authorizationNumberT2038: string;
      authorizationStartT2038: string;
      authorizationEndT2038: string;
    }>;
    skipped: Array<{ rowId: string; memberName: string; reason: string }>;
    failed: Array<{ rowId: string; memberName: string; reason: string }>;
  } | null>(null);

  const copyText = async (label: string, value: string) => {
    const textValue = String(value || '').trim();
    if (!textValue) {
      toast({
        variant: 'destructive',
        title: 'Nothing to copy',
        description: `${label} is empty on this MIF line.`,
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(textValue);
      toast({ title: 'Copied', description: `${label}: ${textValue}` });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Clipboard permission was denied.',
      });
    }
  };

  const scrollToMasterList = () => {
    window.setTimeout(() => {
      masterListAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const memberKey = (row: Pick<IlsMifMasterRow, 'memberMrn' | 'memberMediCalNum' | 'memberFirstName' | 'memberLastName'>) =>
    buildIlsMifDedupeKey(row);

  const writeIlsMifAudit = async (
    action: IlsMifAuditAction,
    summary: string,
    extra?: Record<string, unknown>
  ) => {
    if (!firestore) return;
    try {
      const atIso = new Date().toISOString();
      const actor = user?.email || user?.uid || '';
      const ref = await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
        action,
        summary,
        atIso,
        atServer: serverTimestamp(),
        actor,
        ...(extra || {}),
      });
      setAuditEvents((prev) =>
        [{ id: ref.id, action, summary, atIso, actor }, ...prev].slice(0, 40)
      );
    } catch (error) {
      console.warn('ILS MIF audit log write failed:', error);
    }
  };

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
    const createApp = hasCheckedCaspio
      ? rows.filter(
          (r) =>
            r.mergeStatus === 'unique' &&
            !r.caspioExists &&
            !String(r.skeletonApplicationId || '').trim() &&
            !declinedKeys.has(memberKey(r))
        ).length
      : 0;
    const caspio = hasCheckedCaspio
      ? rows.filter((r) => r.mergeStatus === 'already_in_caspio').length
      : 0;
    const needsAuthorized = hasCheckedCaspio
      ? rows.filter(
          (r) => r.mergeStatus !== 'duplicate_in_batch' && ilsMifRowNeedsAuthorizedUpdate(r)
        ).length
      : 0;
    const needsT2038Received = hasCheckedCaspio
      ? rows.filter(
          (r) =>
            r.mergeStatus !== 'duplicate_in_batch' && Boolean(r.needsT2038ReceivedUpdate)
        ).length
      : 0;
    const statusUpdates = hasCheckedCaspio
      ? rows.filter(
          (r) => r.mergeStatus !== 'duplicate_in_batch' && ilsMifNeedsStatusUpdate(r)
        ).length
      : 0;
    return {
      total,
      unique,
      createApp,
      caspio,
      needsAuthorized,
      needsT2038Received,
      statusUpdates,
      duplicates,
      incomplete,
      northern,
      declined,
    };
  }, [rows, declinedKeys, hasCheckedCaspio]);

  const visibleRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    const matchesSearch = (row: IlsMifMasterRow) => {
      if (!needle) return true;
      const fullName = `${row.memberFirstName} ${row.memberLastName}`.trim();
      const reverseName = `${row.memberLastName} ${row.memberFirstName}`.trim();
      const haystack = [
        row.memberFirstName,
        row.memberLastName,
        fullName,
        reverseName,
        row.memberMrn,
        row.memberMediCalNum,
        row.memberDob,
        row.memberCounty,
        row.clientId2,
        row.memberPhone,
        row.memberEmail,
        row.sourceFileName,
        row.caspioMatchLabel,
        row.statusNote,
        row.skeletonApplicationId,
        row.authorizationNumberT2038,
        row.authorizationStartT2038,
        row.authorizationEndT2038,
        row.dateReceivedRequestForAuthorization,
        row.dateOfReferralAuthorizationDecision,
      ]
        .join(' ')
        .toLowerCase();
      // Allow multi-token search (e.g. "smith 12345")
      return needle.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
    };

    return rows.filter((row) => {
      // Member search looks across the full master (not only the active status filter).
      if (needle) {
        if (filter === 'duplicates') {
          return row.mergeStatus === 'duplicate_in_batch' && matchesSearch(row);
        }
        if (row.mergeStatus === 'duplicate_in_batch') return false;
        return matchesSearch(row);
      }

      if (northernOnly) {
        if (!isNorthernCounty(row.memberCounty)) return false;
        if (hasCheckedCaspio && (row.caspioExists || row.mergeStatus === 'already_in_caspio')) return false;
        if (declinedKeys.has(memberKey(row))) return false;
      }
      // "Total" / All = imported members only (batch duplicates excluded unless Duplicates filter)
      if (filter === 'all' && row.mergeStatus === 'duplicate_in_batch') return false;
      if (filter === 'new') {
        if (!hasCheckedCaspio || row.mergeStatus !== 'unique' || declinedKeys.has(memberKey(row))) return false;
        // Create App filter = remaining skeleton candidates only
        if (String(row.skeletonApplicationId || '').trim()) return false;
        if (row.caspioExists) return false;
      }
      if (filter === 'caspio') {
        if (!hasCheckedCaspio || row.mergeStatus !== 'already_in_caspio') return false;
      }
      if (filter === 'status-updates') {
        if (!hasCheckedCaspio || !ilsMifNeedsStatusUpdate(row) || row.mergeStatus === 'duplicate_in_batch') {
          return false;
        }
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
      return true;
    });
  }, [rows, filter, queryText, northernOnly, declinedKeys, hasCheckedCaspio]);

  useEffect(() => {
    setMasterPage(0);
  }, [filter, queryText, northernOnly, rows.length]);

  const masterPageCount = Math.max(1, Math.ceil(visibleRows.length / MASTER_LIST_PAGE_SIZE));
  const pagedVisibleRows = useMemo(() => {
    const start = masterPage * MASTER_LIST_PAGE_SIZE;
    return visibleRows.slice(start, start + MASTER_LIST_PAGE_SIZE);
  }, [visibleRows, masterPage]);

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
          !String(row.skeletonApplicationId || '').trim() &&
          !declinedKeys.has(memberKey(row))
      ),
    [rows, selected, declinedKeys]
  );

  /** All remaining Create App candidates (no skeleton yet) — not only currently selected. */
  const remainingNewForCreateApp = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.mergeStatus === 'unique' &&
          !row.caspioExists &&
          !String(row.skeletonApplicationId || '').trim() &&
          !declinedKeys.has(memberKey(row))
      ),
    [rows, declinedKeys]
  );

  const selectedVisibleRows = useMemo(
    () => visibleRows.filter((row) => selected[row.rowId]),
    [visibleRows, selected]
  );

  const pendingAuthorizeCandidates = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.mergeStatus !== 'duplicate_in_batch' &&
          row.mergeStatus !== 'incomplete' &&
          ilsMifRowNeedsAuthorizedUpdate(row)
      ),
    [rows]
  );

  const pushAuthorizeTargets = useMemo(() => {
    const selectedPending = rows.filter(
      (row) => selected[row.rowId] && ilsMifRowNeedsAuthorizedUpdate(row)
    );
    return selectedPending.length ? selectedPending : pendingAuthorizeCandidates;
  }, [rows, selected, pendingAuthorizeCandidates]);

  const allVisibleSelected =
    visibleRows.length > 0 && selectedVisibleRows.length === visibleRows.length;
  const someVisibleSelected =
    selectedVisibleRows.length > 0 && selectedVisibleRows.length < visibleRows.length;

  const selectAllVisibleMasterRows = () => {
    setSelected((prev) => {
      const next = { ...prev };
      visibleRows.forEach((row) => {
        next[row.rowId] = true;
      });
      return next;
    });
  };

  const deselectAllMasterRows = () => {
    setSelected({});
  };

  const deselectVisibleMasterRows = () => {
    setSelected((prev) => {
      const next = { ...prev };
      visibleRows.forEach((row) => {
        delete next[row.rowId];
      });
      return next;
    });
  };

  const removeSelectedFromSessionList = async () => {
    const selectedIds = Object.keys(selected).filter((id) => selected[id]);
    if (!selectedIds.length) {
      toast({
        title: 'Nothing selected',
        description: 'Select one or more master-list rows first.',
      });
      return;
    }
    const toRemove = rows.filter((row) => selectedIds.includes(row.rowId));
    const ok = window.confirm(
      `Remove ${toRemove.length} selected member(s) from the session/run and persist the removal?\n\nUse “Restore removed · Start over” anytime to put them back and reload the run (typical after Northern CA / RCFE cleanup).`
    );
    if (!ok) return;

    setIsRemovingSelected(true);
    try {
      const nextRemoved = new Set(removedKeys);
      if (firestore) {
        const CHUNK = 200;
        for (let i = 0; i < toRemove.length; i += CHUNK) {
          const chunk = toRemove.slice(i, i + CHUNK);
          const batch = writeBatch(firestore);
          chunk.forEach((row) => {
            const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700) || row.rowId;
            nextRemoved.add(key);
            batch.set(
              doc(firestore, ILS_MIF_REMOVED_COLLECTION, key),
              {
                ...row,
                dedupeKey: key,
                removedAtIso: new Date().toISOString(),
                removedAtServer: serverTimestamp(),
                removedBy: user?.email || user?.uid || '',
                runId: activeRunId || '',
              },
              { merge: true }
            );
            batch.delete(doc(firestore, ILS_MIF_MASTER_COLLECTION, key));
            if (activeRunId) {
              batch.delete(
                doc(
                  firestore,
                  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
                  activeRunId,
                  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
                  key
                )
              );
              batch.set(
                doc(
                  firestore,
                  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
                  activeRunId,
                  ILS_MIF_RUN_REMOVED_SUBCOLLECTION,
                  key
                ),
                {
                  dedupeKey: key,
                  memberFirstName: row.memberFirstName,
                  memberLastName: row.memberLastName,
                  memberMrn: row.memberMrn,
                  memberMediCalNum: row.memberMediCalNum,
                  removedAtIso: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          });
          await batch.commit();
        }
      }
      setRemovedKeys(nextRemoved);
      const removeSet = new Set(selectedIds);
      setRows((prev) => prev.filter((row) => !removeSet.has(row.rowId)));
      setSelected({});
      await writeIlsMifAudit('session_member_remove', `Removed ${toRemove.length} member(s) from session/run`, {
        count: toRemove.length,
        runId: activeRunId || '',
      });
      toast({
        title: 'Members removed',
        description: `Removed ${toRemove.length} member(s) from this list${activeRunId ? ' and the active run' : ''}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to remove members',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsRemovingSelected(false);
    }
  };

  const restoreRemovedAndStartOver = async (runId?: string) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    const targetRunId = String(runId || activeRunId || '').trim();
    const ok = window.confirm(
      targetRunId
        ? `Restore previously removed members for run ${targetRunId} and reload from scratch?\n\nThis puts Northern CA / RCFE removals (and any other session removals for that run) back into the run, then opens it awaiting Re-check Caspio.`
        : `Restore all previously removed members and clear removal history?\n\nOpen a run afterward (or Load Latest Master List) to see the restored list.`
    );
    if (!ok) return;

    setIsRestoringRemoved(true);
    setRestoringRunId(targetRunId);
    try {
      const removedSnap = await getDocs(query(collection(firestore, ILS_MIF_REMOVED_COLLECTION), limit(2000)));
      const toRestore = removedSnap.docs.filter((docSnap) => {
        if (!targetRunId) return true;
        const data = docSnap.data() as { runId?: string };
        return String(data?.runId || '') === targetRunId || !String(data?.runId || '').trim();
      });

      if (!toRestore.length) {
        toast({
          title: 'Nothing to restore',
          description: targetRunId
            ? 'No removed members are stored for this run. Open Run to reload the saved list.'
            : 'No removed-member history found.',
        });
        if (targetRunId) await loadSavedMasterList(targetRunId, { ignoreRemoved: true });
        return;
      }

      const CHUNK = 150;
      for (let i = 0; i < toRestore.length; i += CHUNK) {
        const chunk = toRestore.slice(i, i + CHUNK);
        const batch = writeBatch(firestore);
        chunk.forEach((docSnap) => {
          const data = docSnap.data() as IlsMifMasterRow & { runId?: string; dedupeKey?: string };
          const key = String(data.dedupeKey || docSnap.id).replace(/[\/#?[\]]/g, '_').slice(0, 700) || docSnap.id;
          const rowRunId = String(data.runId || targetRunId || '').trim();
          const restoredRow: IlsMifMasterRow & { runId?: string; restoredAtIso?: string } = {
            ...data,
            rowId: data.rowId || key,
            runId: rowRunId || data.runId,
            restoredAtIso: new Date().toISOString(),
          };
          batch.set(doc(firestore, ILS_MIF_MASTER_COLLECTION, key), restoredRow, { merge: true });
          if (rowRunId) {
            batch.set(
              doc(
                firestore,
                ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
                rowRunId,
                ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
                key
              ),
              restoredRow,
              { merge: true }
            );
            batch.delete(
              doc(
                firestore,
                ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
                rowRunId,
                ILS_MIF_RUN_REMOVED_SUBCOLLECTION,
                key
              )
            );
          }
          batch.delete(doc(firestore, ILS_MIF_REMOVED_COLLECTION, docSnap.id));
        });
        await batch.commit();
      }

      const restoredIds = new Set(toRestore.map((d) => d.id));
      setRemovedKeys((prev) => {
        const next = new Set(prev);
        restoredIds.forEach((id) => next.delete(id));
        toRestore.forEach((docSnap) => {
          const data = docSnap.data() as { dedupeKey?: string; rowId?: string };
          if (data.dedupeKey) next.delete(String(data.dedupeKey));
          if (data.rowId) next.delete(String(data.rowId));
          next.delete(docSnap.id);
        });
        return next;
      });

      await writeIlsMifAudit(
        'session_member_restore',
        `Restored ${toRestore.length} previously removed member(s)${targetRunId ? ` for ${targetRunId}` : ''}`,
        { count: toRestore.length, runId: targetRunId || '' }
      );

      toast({
        title: 'Removed members restored',
        description: `Put back ${toRestore.length} member(s). Reloading${targetRunId ? ' the run' : ''} so you can start over.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      if (targetRunId) {
        await loadSavedMasterList(targetRunId, { ignoreRemoved: true });
      } else {
        setSelected({});
        setHasCheckedCaspio(false);
        setLastMatchedLabel('');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to restore removed members',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsRestoringRemoved(false);
      setRestoringRunId('');
    }
  };

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
      const [runsSnap, declinedSnap, uploadsSnap, metaSnap, removedSnap, auditSnap] = await Promise.all([
        getDocs(
          query(collection(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION), orderBy('createdAtIso', 'desc'), limit(25))
        ),
        getDocs(
          query(collection(firestore, ILS_MIF_DECLINED_COLLECTION), orderBy('declinedAtIso', 'desc'), limit(500))
        ),
        getDocs(
          query(collection(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION), orderBy('uploadedAtIso', 'desc'), limit(200))
        ),
        getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta')),
        getDocs(query(collection(firestore, ILS_MIF_REMOVED_COLLECTION), limit(2000))),
        getDocs(query(collection(firestore, ILS_MIF_AUDIT_COLLECTION), orderBy('atIso', 'desc'), limit(40))),
      ]);

      let declineBatchesSnap: Awaited<ReturnType<typeof getDocs>> | null = null;
      try {
        declineBatchesSnap = await getDocs(
          query(
            collection(firestore, ILS_MIF_NORTHERN_DECLINE_BATCHES_COLLECTION),
            orderBy('sentAtIso', 'desc'),
            limit(100)
          )
        );
      } catch (error) {
        console.warn('Unable to load northern decline batch log (deploy firestore rules if needed):', error);
      }
      const nextRemoved = new Set<string>();
      removedSnap.forEach((docSnap) => {
        nextRemoved.add(docSnap.id);
        const dedupeKey = String(docSnap.data()?.dedupeKey || '').trim();
        if (dedupeKey) nextRemoved.add(dedupeKey);
      });
      setRemovedKeys(nextRemoved);

      const nextAudit: Array<{ id: string; action: string; summary: string; atIso: string; actor: string }> = [];
      auditSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextAudit.push({
          id: docSnap.id,
          action: String(data.action || ''),
          summary: String(data.summary || ''),
          atIso: String(data.atIso || ''),
          actor: String(data.actor || ''),
        });
      });
      setAuditEvents(nextAudit);

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

      const nextBatches: NorthernDeclineBatchRecord[] = [];
      declineBatchesSnap?.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const members = Array.isArray(data.members)
          ? data.members.map((member: any) => ({
              memberFirstName: String(member?.memberFirstName || ''),
              memberLastName: String(member?.memberLastName || ''),
              memberMrn: String(member?.memberMrn || ''),
              memberCounty: String(member?.memberCounty || ''),
            }))
          : [];
        nextBatches.push({
          id: docSnap.id,
          sentAtIso: String(data.sentAtIso || ''),
          subject: String(data.subject || data.emailSubject || ''),
          emailBodyText: String(data.emailBodyText || ''),
          customText: String(data.customText || ''),
          memberCount: Number(data.memberCount || members.length || 0),
          members,
          actedByEmail: String(data.actedByEmail || ''),
          to: Array.isArray(data.to) ? data.to.map(String) : [...ILS_DECISION_TO],
          cc: Array.isArray(data.cc) ? data.cc.map(String) : [...ILS_DECISION_CC],
          runId: String(data.runId || ''),
        });
      });
      setNorthernDeclineBatches(nextBatches);

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

  const rawMembersAcrossUploadedMifs = useMemo(
    () => uploadedFiles.reduce((sum, file) => sum + (Number(file.rowCount) || 0), 0),
    [uploadedFiles]
  );

  const mergeParsedRows = (incoming: IlsMifMasterRow[]) => {
    const combined = dedupeIlsMifMasterRows([...rows, ...incoming]);
    setRows(combined);
    setHasCheckedCaspio(false);
    setLastMatchedLabel('');
    if (filter === 'new' || filter === 'caspio' || filter === 'status-updates') setFilter('all');
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
      // ILS MIF workflow is Kaiser intake only — use the Kaiser-only cache endpoint
      // (smaller/faster than /api/all-members, which returns every MCO).
      const { members: kaiserMembers } = await fetchKaiserMembers({
        requireNonEmpty: true,
        retryAction: 'click Re-check Caspio again',
      });
      const deduped = dedupeIlsMifMasterRows(workingRows);
      const annotated = annotateIlsMifRowsWithCaspioMembers(deduped, kaiserMembers);
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
      const newCount = annotated.filter((r) => r.mergeStatus === 'unique').length;
      const caspioCount = annotated.filter((r) => r.mergeStatus === 'already_in_caspio').length;
      const northernCount = annotated.filter((r) => isNorthernCounty(r.memberCounty)).length;
      const needsAuthorizedCount = annotated.filter((r) => ilsMifRowNeedsAuthorizedUpdate(r)).length;
      const needsT2038Count = annotated.filter((r) => Boolean(r.needsT2038ReceivedUpdate)).length;
      const statusUpdateCount = annotated.filter((r) => ilsMifNeedsStatusUpdate(r)).length;
      if (statusUpdateCount > 0) {
        setFilter('status-updates');
        scrollToMasterList();
      } else {
        setFilter('all');
      }
      const statusParts: string[] = [];
      if (needsAuthorizedCount > 0) {
        statusParts.push(
          `${needsAuthorizedCount} CalAIM_Status Pending → Authorized`
        );
      }
      if (needsT2038Count > 0) {
        statusParts.push(
          `${needsT2038Count} Kaiser_Status T2038 Requested → ${ILS_MIF_TARGET_T2038_RECEIVED_STATUS}`
        );
      }
      toast({
        title: 'Master list consolidated + Caspio checked',
        description:
          `Running master total: ${annotated.length} members · ${newCount} new · ${caspioCount} already in Caspio (Kaiser) · ${northernCount} northern.` +
          (statusParts.length ? ` · ${statusParts.join(' · ')}.` : '') +
          ' Health Net / other MCO records are ignored.',
        className:
          statusUpdateCount > 0
            ? 'bg-violet-100 text-violet-950 border-violet-200'
            : 'bg-green-100 text-green-900 border-green-200',
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

  const pushPendingToAuthorizedInCaspio = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required' });
      return;
    }
    if (!hasCheckedCaspio) {
      toast({
        variant: 'destructive',
        title: 'Check Caspio first',
        description: 'Re-check Caspio so Pending matches are known before pushing authorization updates.',
      });
      return;
    }
    const targets = pushAuthorizeTargets;
    if (!targets.length) {
      toast({
        title: 'No Pending → Authorized pushes ready',
        description: 'No members need CalAIM_Status Pending → Authorized with MIF T2038 auth data.',
      });
      return;
    }

    const selectedCount = rows.filter((row) => selected[row.rowId] && ilsMifRowNeedsAuthorizedUpdate(row)).length;
    const confirmMessage =
      `Push ${targets.length} member(s) to Caspio?\n\n` +
      `This will set CalAIM_Status to Authorized and write MIF T2038 authorization number, start date, and end date.\n\n` +
      (selectedCount > 0
        ? `Using ${selectedCount} selected member(s).`
        : `No selection — using all ${targets.length} Pending → Authorized member(s) on the master list.`);
    if (!window.confirm(confirmMessage)) return;

    setIsPushingAuthorized(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/ils-mif/push-pending-to-authorized', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          members: targets.map((row) => ({
            rowId: row.rowId,
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            memberMrn: row.memberMrn,
            memberMediCalNum: row.memberMediCalNum,
            clientId2: row.clientId2,
            caspioMatchedClientId2: row.caspioMatchedClientId2,
            caspioMatchedBy: row.caspioMatchedBy,
            authorizationNumberT2038: row.authorizationNumberT2038,
            authorizationStartT2038: row.authorizationStartT2038,
            authorizationEndT2038: row.authorizationEndT2038,
            caspioCalAIMStatus: row.caspioCalAIMStatus,
          })),
        }),
      });
      const body = await response.json().catch(() => ({} as any));
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      const authorized = Array.isArray(body.authorized) ? body.authorized : [];
      const skipped = Array.isArray(body.skipped) ? body.skipped : [];
      const failed = Array.isArray(body.failed) ? body.failed : [];
      setAuthorizePushResults({ authorized, skipped, failed });

      if (firestore && authorized.length) {
        const authorizedByRowId = new Map(authorized.map((entry: any) => [String(entry.rowId || ''), entry]));
        await Promise.all(
          targets
            .filter((row) => authorizedByRowId.has(row.rowId))
            .map(async (row) => {
              const hit = authorizedByRowId.get(row.rowId);
              try {
                await markIlsMifMemberAuthorizedFromMifPush(firestore, {
                  memberFirstName: row.memberFirstName,
                  memberLastName: row.memberLastName,
                  memberMrn: row.memberMrn,
                  memberMediCalNum: row.memberMediCalNum,
                  memberDob: row.memberDob,
                  clientId2: row.clientId2 || row.caspioMatchedClientId2,
                  caspioMatchedClientId2: hit?.clientId2 || row.caspioMatchedClientId2,
                  consolidatorRunId: activeRunId,
                  ilsMifDedupeKey: buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700),
                  actor: user.email || user.uid || '',
                  authorizationNumberT2038: hit?.authorizationNumberT2038 || row.authorizationNumberT2038,
                  authorizationStartT2038: hit?.authorizationStartT2038 || row.authorizationStartT2038,
                  authorizationEndT2038: hit?.authorizationEndT2038 || row.authorizationEndT2038,
                  caspioPkId: hit?.caspioPkId,
                });
              } catch (flagError) {
                console.warn('Failed to mark authorized member on consolidator master:', flagError);
              }
            })
        );
      }

      const authorizedIds = new Set(authorized.map((entry: any) => String(entry.rowId || '')));
      if (authorizedIds.size) {
        setRows((prev) =>
          prev.map((row) => {
            if (!authorizedIds.has(row.rowId)) return row;
            const hit = authorized.find((entry: any) => entry.rowId === row.rowId);
            return {
              ...row,
              caspioExists: true,
              caspioCalAIMStatus: 'Authorized',
              needsAuthorizedUpdate: false,
              mergeStatus:
                row.mergeStatus === 'duplicate_in_batch' || row.mergeStatus === 'incomplete'
                  ? row.mergeStatus
                  : 'already_in_caspio',
              statusNote: hit?.authorizationNumberT2038
                ? `Authorized in Caspio from MIF T2038 push · Auth ${hit.authorizationNumberT2038}`
                : 'Authorized in Caspio from MIF push',
            };
          })
        );
      }

      await writeIlsMifAudit(
        'mif_pending_to_authorized_push',
        `Pushed ${authorized.length} member(s) Pending → Authorized in Caspio` +
          (skipped.length ? ` · ${skipped.length} skipped` : '') +
          (failed.length ? ` · ${failed.length} failed` : ''),
        {
          authorizedCount: authorized.length,
          skippedCount: skipped.length,
          failedCount: failed.length,
          runId: activeRunId,
        }
      );

      toast({
        title:
          authorized.length > 0
            ? `${authorized.length} member(s) authorized in Caspio`
            : 'No Caspio authorization updates applied',
        description:
          authorized.length > 0
            ? authorized
                .slice(0, 5)
                .map((entry: any) => entry.memberName)
                .join(', ') + (authorized.length > 5 ? ` +${authorized.length - 5} more` : '')
            : skipped[0]?.reason || failed[0]?.reason || 'Review the push results for details.',
        className:
          authorized.length > 0
            ? 'bg-green-100 text-green-900 border-green-200'
            : failed.length
              ? undefined
              : undefined,
      });
      if (authorized.length > 0) {
        setFilter('caspio');
        scrollToMasterList();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Pending → Authorized push failed',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsPushingAuthorized(false);
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
    let uploadNetAdded = 0;
    let uploadFileNames: string[] = [];
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
            `${overlap.fileName}: filename already uploaded for MIF date ${datePart}. We will compare members (same name can still contain new people).`
          );
        }
        if (overlap.sameDateDifferentNames.length) {
          warningLines.push(
            `${overlap.fileName}: MIF date ${datePart} already has different file(s): ${overlap.sameDateDifferentNames.join(', ')}.`
          );
        }
      });

      // Same-day / same-filename check: compare MEMBER content, not only file names.
      // Same filename can arrive twice with different members.
      for (const fileName of names) {
        if (!firestore) continue;
        const dateKey = extractMifGeneratedDateKey(fileName);
        const priorUploads = uploadedFiles.filter((file) => {
          const priorName = String(file.fileName || '').trim();
          const priorDate =
            file.mifDateKey || extractMifGeneratedDateKey(priorName);
          const sameName = priorName.toLowerCase() === fileName.toLowerCase();
          const sameDate = Boolean(dateKey) && priorDate === dateKey;
          return sameName || sameDate;
        });
        if (!priorUploads.length) continue;

        const priorMembers: IlsMifMasterRow[] = [];
        const seenPriorKeys = new Set<string>();
        for (const prior of priorUploads) {
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
            if (!data?.memberFirstName || !data?.memberLastName) return;
            const key = buildIlsMifDedupeKey({
              clientId2: String(data.clientId2 || ''),
              memberMrn: String(data.memberMrn || ''),
              memberMediCalNum: String(data.memberMediCalNum || ''),
              memberFirstName: String(data.memberFirstName || ''),
              memberLastName: String(data.memberLastName || ''),
              memberDob: String(data.memberDob || ''),
            });
            if (key && seenPriorKeys.has(key)) return;
            if (key) seenPriorKeys.add(key);
            priorMembers.push(data);
          });
        }

        const incoming = parsedByFile.get(fileName) || [];
        const brandNew = findNewMembersNotInPriorList(incoming, priorMembers);
        const dateLabel = formatMifGeneratedDateLabel(dateKey) || dateKey || 'unknown date';
        const sameNamePriorCount = priorUploads.filter(
          (file) => String(file.fileName || '').toLowerCase() === fileName.toLowerCase()
        ).length;
        warningLines.push(
          `${fileName}: vs prior same-day/same-name upload(s) — ${brandNew.length} NEW member(s) to add` +
            ` (${incoming.length} in this file · ${priorMembers.length} already stored` +
            `${sameNamePriorCount ? ` · ${sameNamePriorCount} prior upload(s) with this exact filename` : ''}` +
            ` · MIF date ${dateLabel}).`
        );
      }

      if (latestRunMifFiles.length) {
        warningLines.unshift(
          `Latest consolidation run includes ${latestRunMifFiles.length} MIF file(s): ${latestRunMifFiles.slice(0, 8).join(', ')}${
            latestRunMifFiles.length > 8 ? '…' : ''
          }. Continuing merges new members into the running master, then re-checks Caspio and auto-saves the shared master.`
        );
      }

      if (warningLines.length) {
        const proceed = window.confirm(
          `Upload review:\n\n${warningLines.join('\n\n')}\n\nContinue? New members merge into the running master total. Duplicates are skipped.`
        );
        if (!proceed) {
          setUploadDateWarnings(warningLines);
          return;
        }
      }
      setUploadDateWarnings(warningLines.filter((line) => !line.startsWith('Latest consolidation run')));

      const priorMasterTotal = rows.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
      const parsedBatches = Array.from(parsedByFile.values()).flat();
      setSourceFiles((prev) =>
        sortMifFileNamesByGeneratedDate(Array.from(new Set([...prev, ...names])), 'desc')
      );
      combinedForCheck = mergeParsedRows(parsedBatches);
      const runningMasterTotal = (combinedForCheck || []).filter(
        (r) => r.mergeStatus !== 'duplicate_in_batch'
      ).length;
      const netAddedToMaster = Math.max(0, runningMasterTotal - priorMasterTotal);

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
                  authorizationNumberT2038: row.authorizationNumberT2038 || '',
                  authorizationStartT2038: row.authorizationStartT2038 || '',
                  authorizationEndT2038: row.authorizationEndT2038 || '',
                  dateReceivedRequestForAuthorization: row.dateReceivedRequestForAuthorization || '',
                  dateOfReferralAuthorizationDecision: row.dateOfReferralAuthorizationDecision || '',
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
        description:
          netAddedToMaster > 0
            ? `Running master total: ${runningMasterTotal} members (+${netAddedToMaster} NEW from this upload · ${names.length} file(s) · ${parsedBatches.length} row(s) parsed). Running Caspio check next…`
            : `Running master total still ${runningMasterTotal} — this upload added 0 net new members (everyone was already on the master list or duplicated). File history was still saved. Running Caspio check next…`,
        className:
          netAddedToMaster > 0
            ? 'bg-green-100 text-green-900 border-green-200'
            : 'bg-amber-100 text-amber-950 border-amber-200',
      });
      uploadNetAdded = netAddedToMaster;
      uploadFileNames = names;
      setLastUploadStats({
        netNew: netAddedToMaster,
        parsedRows: parsedBatches.length,
        fileCount: names.length,
      });
      setSessionNetNewFromUploads((prev) => prev + netAddedToMaster);
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
      const annotated = await checkCaspio(combinedForCheck);
      if (annotated?.length) {
        const flaggedCount = annotated.filter((r) => ilsMifNeedsStatusUpdate(r)).length;
        await saveMasterListAndRun({
          quiet: false,
          skipPartialConfirm: true,
          rowsOverride: annotated,
          sourceFilesOverride: sortMifFileNamesByGeneratedDate(
            Array.from(new Set([...sourceFiles, ...uploadFileNames])),
            'desc'
          ),
        });
        if (flaggedCount > 0) {
          setFilter('status-updates');
          scrollToMasterList();
        }
      }
    }
  };

  const saveMasterListAndRun = async (options?: {
    quiet?: boolean;
    skipPartialConfirm?: boolean;
    rowsOverride?: IlsMifMasterRow[];
    sourceFilesOverride?: string[];
  }) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return '';
    }
    const sessionRows = options?.rowsOverride?.length ? options.rowsOverride : rows;
    const filesToSave = options?.sourceFilesOverride?.length
      ? options.sourceFilesOverride
      : sourceFiles;
    if (!sessionRows.length) {
      toast({ variant: 'destructive', title: 'Nothing to save', description: 'Upload MIF files first.' });
      return '';
    }
    const checked =
      options?.rowsOverride?.length
        ? true
        : hasCheckedCaspio;
    if (!checked) {
      toast({
        variant: 'destructive',
        title: 'Check Caspio first',
        description: 'Consolidate/check Caspio before saving a dated master list for Create Application.',
      });
      return '';
    }
    setIsSaving(true);
    try {
      // Always merge session rows into the existing Firestore master so a partial
      // session (e.g. 35 new MIFs) cannot replace a 500+ member master list.
      const existingMasterSnap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      const existingMasterRows: IlsMifMasterRow[] = [];
      existingMasterSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() as IlsMifMasterRow;
        if (!data?.memberFirstName || !data?.memberLastName) return;
        if (data.mergeStatus === 'duplicate_in_batch') return;
        if (!isIlsMifSourcedMasterRow(data)) return;
        existingMasterRows.push({
          ...data,
          rowId: data.rowId || docSnap.id,
        });
      });
      const priorUnique = existingMasterRows.length;
      const sessionUnique = sessionRows.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
      const sessionByDedupeKey = new Map<string, IlsMifMasterRow>();
      sessionRows.forEach((row) => {
        if (row.mergeStatus === 'duplicate_in_batch') return;
        const key = buildIlsMifDedupeKey(row);
        if (key && !sessionByDedupeKey.has(key)) sessionByDedupeKey.set(key, row);
      });
      const rowsToSave = dedupeIlsMifMasterRows([...existingMasterRows, ...sessionRows]).map((row) => {
        if (row.mergeStatus === 'duplicate_in_batch') return row;
        const key = buildIlsMifDedupeKey(row);
        const sessionHit = sessionByDedupeKey.get(key);
        if (!sessionHit) return row;
        // Latest Caspio check / upload flags from the session win over stale master snapshot.
        return {
          ...row,
          caspioExists: Boolean(sessionHit.caspioExists || row.caspioExists),
          caspioMatchLabel: sessionHit.caspioMatchLabel || row.caspioMatchLabel,
          caspioMatchedClientId2: sessionHit.caspioMatchedClientId2 || row.caspioMatchedClientId2,
          caspioMatchedBy: sessionHit.caspioMatchedBy || row.caspioMatchedBy,
          caspioCalAIMStatus: sessionHit.caspioCalAIMStatus || row.caspioCalAIMStatus || '',
          caspioKaiserStatus: sessionHit.caspioKaiserStatus || row.caspioKaiserStatus || '',
          needsAuthorizedUpdate: Boolean(
            sessionHit.needsAuthorizedUpdate || row.needsAuthorizedUpdate
          ),
          needsT2038ReceivedUpdate: Boolean(
            sessionHit.needsT2038ReceivedUpdate || row.needsT2038ReceivedUpdate
          ),
          mergeStatus:
            sessionHit.mergeStatus === 'incomplete' || row.mergeStatus === 'incomplete'
              ? 'incomplete'
              : resolveIlsMifMergeStatusForCaspioMatch(
                  {
                    mergeStatus: row.mergeStatus,
                    caspioCalAIMStatus:
                      sessionHit.caspioCalAIMStatus || row.caspioCalAIMStatus || '',
                  },
                  Boolean(sessionHit.caspioExists || row.caspioExists)
                ),
          statusNote: sessionHit.statusNote || row.statusNote,
        };
      });
      const mergedUnique = rowsToSave.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
      if (priorUnique > 0 && sessionUnique > 0 && sessionUnique < priorUnique * 0.5) {
        if (!options?.skipPartialConfirm) {
          const ok = window.confirm(
            `Your session has ${sessionUnique} members, but the saved master already has ${priorUnique}.\n\n` +
              `Save will MERGE them into one master (~${mergedUnique} unique) so you do not lose the full list.\n\nContinue?`
          );
          if (!ok) {
            setIsSaving(false);
            return '';
          }
        }
      }

      const now = new Date();
      const createdAtIso = now.toISOString();
      const runId = `run_${now.getTime()}`;
      const runLabel = now.toLocaleString();
      const isNorthernReady = (r: IlsMifMasterRow) =>
        r.mergeStatus !== 'duplicate_in_batch' &&
        isNorthernCounty(r.memberCounty) &&
        !r.caspioExists &&
        r.mergeStatus !== 'already_in_caspio' &&
        !declinedKeys.has(memberKey(r));
      const runTotals = {
        total: rowsToSave.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length,
        unique: rowsToSave.filter(
          (r) => r.mergeStatus === 'unique' && !declinedKeys.has(memberKey(r))
        ).length,
        createApp: rowsToSave.filter(
          (r) =>
            r.mergeStatus === 'unique' &&
            !r.caspioExists &&
            !String(r.skeletonApplicationId || '').trim() &&
            !declinedKeys.has(memberKey(r))
        ).length,
        caspio: rowsToSave.filter((r) => r.mergeStatus === 'already_in_caspio').length,
        duplicates: rowsToSave.filter((r) => r.mergeStatus === 'duplicate_in_batch').length,
        incomplete: rowsToSave.filter((r) => r.mergeStatus === 'incomplete').length,
        northern: rowsToSave.filter(isNorthernReady).length,
        declined: rowsToSave.filter(
          (r) => r.mergeStatus !== 'duplicate_in_batch' && declinedKeys.has(memberKey(r))
        ).length,
      };
      const existingByKey = new Map<
        string,
        {
          skeletonApplicationId?: string;
          caspioExists?: boolean;
          mergeStatus?: string;
          firstSeenAtIso?: string;
          firstSeenMonthKey?: string;
          caspioCalAIMStatus?: string;
          caspioKaiserStatus?: string;
          needsAuthorizedUpdate?: boolean;
          needsT2038ReceivedUpdate?: boolean;
        }
      >();
      let existingMonthly: Record<string, number> = {};
      existingMasterSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') {
          const meta = docSnap.data() || {};
          const monthlyRaw = meta.monthlyNewMembers;
          if (monthlyRaw && typeof monthlyRaw === 'object' && !Array.isArray(monthlyRaw)) {
            Object.entries(monthlyRaw as Record<string, unknown>).forEach(([month, value]) => {
              const n = Number(value);
              if (/^\d{4}-\d{2}$/.test(month) && Number.isFinite(n) && n > 0) {
                existingMonthly[month] = Math.floor(n);
              }
            });
          }
          return;
        }
        const data = docSnap.data() || {};
        const flags = {
          skeletonApplicationId: String(data.skeletonApplicationId || '').trim() || undefined,
          caspioExists: Boolean(data.caspioExists),
          mergeStatus: String(data.mergeStatus || ''),
          firstSeenAtIso: String(data.firstSeenAtIso || '').trim() || undefined,
          firstSeenMonthKey: String(data.firstSeenMonthKey || '').trim() || undefined,
          caspioCalAIMStatus: String(data.caspioCalAIMStatus || '').trim() || undefined,
          caspioKaiserStatus: String(data.caspioKaiserStatus || '').trim() || undefined,
          needsAuthorizedUpdate: Boolean(data.needsAuthorizedUpdate),
          needsT2038ReceivedUpdate: Boolean(data.needsT2038ReceivedUpdate),
        };
        const remember = (key: string) => {
          if (!key || existingByKey.has(key)) return;
          existingByKey.set(key, flags);
        };
        remember(docSnap.id);
        remember(String(data.dedupeKey || '').trim());
        remember(buildIlsMifDedupeKey({
          clientId2: String(data.clientId2 || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberDob: String(data.memberDob || ''),
        }).replace(/[\/#?[\]]/g, '_').slice(0, 700));
        identityTokenLookupKeys(data.memberMrn).forEach((key) => remember(`mrn:${key}`));
        identityTokenLookupKeys(data.memberMediCalNum).forEach((key) => remember(`cin:${key}`));
      });
      const withExistingFlags = (row: IlsMifMasterRow) => {
        const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
        const existing =
          existingByKey.get(key) ||
          existingByKey.get(row.rowId) ||
          identityTokenLookupKeys(row.memberMrn)
            .map((mrnKey) => existingByKey.get(`mrn:${mrnKey}`))
            .find(Boolean) ||
          identityTokenLookupKeys(row.memberMediCalNum)
            .map((cinKey) => existingByKey.get(`cin:${cinKey}`))
            .find(Boolean);
        const skeletonApplicationId =
          String(row.skeletonApplicationId || existing?.skeletonApplicationId || '').trim();
        const caspioExists = Boolean(row.caspioExists || existing?.caspioExists);
        return { row, key, skeletonApplicationId, caspioExists, existing };
      };
      const monthIncrements: Record<string, number> = {};
      const firstSeenByKey = new Map<string, { firstSeenAtIso: string; firstSeenMonthKey: string }>();
      // Only count as "new this month" members that were not already on the prior master.
      const priorMasterKeys = new Set(
        existingMasterRows.map((row) =>
          buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700)
        )
      );
      rowsToSave.forEach((row) => {
        if (row.mergeStatus === 'duplicate_in_batch') return;
        const { key, existing } = withExistingFlags(row);
        const alreadyOnMaster = priorMasterKeys.has(key) || Boolean(existing);
        if (alreadyOnMaster) {
          const firstSeenAtIso = existing?.firstSeenAtIso || createdAtIso;
          const firstSeenMonthKey =
            existing?.firstSeenMonthKey || ilsMifMonthKeyFromIso(firstSeenAtIso);
          firstSeenByKey.set(key, { firstSeenAtIso, firstSeenMonthKey });
          return;
        }
        const firstSeenAtIso = createdAtIso;
        const firstSeenMonthKey = ilsMifMonthKeyFromIso(createdAtIso);
        firstSeenByKey.set(key, { firstSeenAtIso, firstSeenMonthKey });
        monthIncrements[firstSeenMonthKey] = (monthIncrements[firstSeenMonthKey] || 0) + 1;
      });
      const monthlyNewMembersNext = mergeIlsMifMonthlyCounts(existingMonthly, monthIncrements);
      const brandNewThisSave = Object.values(monthIncrements).reduce((sum, n) => sum + n, 0);
      const newMembers = rowsToSave.filter((r) => {
        const { skeletonApplicationId, caspioExists } = withExistingFlags(r);
        return r.mergeStatus === 'unique' && !caspioExists && !skeletonApplicationId;
      });
      const caspioMembers = rowsToSave.filter((r) => r.mergeStatus === 'already_in_caspio');
      const northernMembers = rowsToSave.filter(
        (r) =>
          r.mergeStatus !== 'duplicate_in_batch' &&
          isNorthernCounty(r.memberCounty) &&
          !r.caspioExists &&
          r.mergeStatus !== 'already_in_caspio' &&
          !declinedKeys.has(memberKey(r))
      );
      const declinedMemberRows = rowsToSave.filter(
        (r) => r.mergeStatus !== 'duplicate_in_batch' && declinedKeys.has(memberKey(r))
      );
      const sortedSources = sortMifFileNamesByGeneratedDate(filesToSave, 'desc');

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
            memberCount: runTotals.total,
            latestRunId: runId,
            latestRunAtIso: createdAtIso,
            monthlyNewMembers: monthlyNewMembersNext,
            monthlyNewMembersUpdatedAtIso: createdAtIso,
          },
          { merge: true }
        );
        headerBatch.set(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, runId), {
          createdAtIso,
          createdAtServer: serverTimestamp(),
          label: runLabel,
          sourceFiles: sortedSources,
          totals: runTotals,
          memberCount: runTotals.total,
          newMemberCount: newMembers.length,
          brandNewMasterCount: brandNewThisSave,
          caspioMemberCount: caspioMembers.length,
          northernMemberCount: northernMembers.length,
          declinedMemberCount: declinedMemberRows.length,
          createdBy: user?.email || user?.uid || '',
        });
        // Link any upload not yet tied to a run (by filename or unlinked recent uploads).
        uploadedFiles
          .filter((file) => !file.runId)
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
      for (let i = 0; i < rowsToSave.length; i += CHUNK) {
        const chunk = rowsToSave.slice(i, i + CHUNK);
        const batch = writeBatch(firestore);
        chunk.forEach((row) => {
          const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
          const isDeclined = declinedKeys.has(memberKey(row));
          const existing = existingByKey.get(key) || existingByKey.get(row.rowId);
          const skeletonApplicationId = String(
            row.skeletonApplicationId || existing?.skeletonApplicationId || ''
          ).trim();
          const caspioExists = Boolean(row.caspioExists || existing?.caspioExists);
          const caspioCalAIMStatus = String(
            row.caspioCalAIMStatus || existing?.caspioCalAIMStatus || ''
          ).trim();
          const caspioKaiserStatus = String(
            row.caspioKaiserStatus || existing?.caspioKaiserStatus || ''
          ).trim();
          const needsAuthorizedUpdate = resolveIlsMifNeedsAuthorizedUpdate(
            caspioCalAIMStatus,
            caspioExists,
            Boolean(row.needsAuthorizedUpdate || existing?.needsAuthorizedUpdate)
          );
          const needsT2038ReceivedUpdate = isIlsMifT2038ReceivedStatus(caspioKaiserStatus)
            ? false
            : Boolean(row.needsT2038ReceivedUpdate || existing?.needsT2038ReceivedUpdate);
          const firstSeen =
            firstSeenByKey.get(key) ||
            ({
              firstSeenAtIso: existing?.firstSeenAtIso || createdAtIso,
              firstSeenMonthKey:
                existing?.firstSeenMonthKey ||
                ilsMifMonthKeyFromIso(existing?.firstSeenAtIso || createdAtIso),
            } as const);
          const payload = {
            ...row,
            dedupeKey: key,
            runId,
            runAtIso: createdAtIso,
            updatedAt: createdAtIso,
            updatedBy: user?.email || user?.uid || '',
            declined: isDeclined,
            northernCounty: isNorthernCounty(row.memberCounty),
            caspioExists,
            caspioCalAIMStatus,
            caspioKaiserStatus,
            needsAuthorizedUpdate,
            needsT2038ReceivedUpdate,
            mergeStatus: resolveIlsMifMergeStatusForCaspioMatch(
              { mergeStatus: row.mergeStatus, caspioCalAIMStatus },
              caspioExists
            ),
            firstSeenAtIso: firstSeen.firstSeenAtIso,
            firstSeenMonthKey: firstSeen.firstSeenMonthKey,
            ...(skeletonApplicationId ? { skeletonApplicationId } : {}),
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

      if (options?.rowsOverride?.length || priorUnique > sessionUnique) {
        setRows(rowsToSave);
        setHasCheckedCaspio(true);
      }
      setActiveRunId(runId);
      setMasterListCreatedAtIso(createdAtIso);
      setSourceFiles(sortedSources);
      setExpandedRunId(runId);
      setFilter('all');
      await loadRunsAndDeclined();
      await writeIlsMifAudit('run_saved', `Saved consolidation run ${runLabel}`, {
        runId,
        memberCount: rowsToSave.length,
        sourceFileCount: sortedSources.length,
        brandNewMasterCount: brandNewThisSave,
        monthKey: ilsMifMonthKeyFromIso(createdAtIso),
        mergedFromExistingMaster: priorUnique,
        sessionMemberCount: sessionUnique,
      });
      if (!options?.quiet) {
        toast({
          title: 'Consolidation run saved in app',
          description: `Saved ${runLabel}: ${runTotals.total} unique on master` +
            (priorUnique ? ` (merged prior master ${priorUnique} + session ${sessionUnique})` : '') +
            ` · ${brandNewThisSave} first-time this save · ${newMembers.length} remaining for Create App.`,
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

  const loadSavedMasterList = async (
    runId?: string,
    options?: { ignoreRemoved?: boolean }
  ) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    setIsLoadingSaved(true);
    try {
      const explicitRunId = String(runId || '').trim();
      // Load Latest (no run id) always uses the FULL shared master collection —
      // not just the latest dated run snapshot (which can be a partial session save).
      const loadFullMaster = !explicitRunId;
      let preferredRunId = explicitRunId;
      const metaSnap = await getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'));
      const metaData = metaSnap.exists() ? metaSnap.data() || {} : {};
      if (!preferredRunId) {
        preferredRunId = String(metaData.latestRunId || '').trim();
        if (!preferredRunId && runs[0]?.id) preferredRunId = runs[0].id;
      }

      const loaded: IlsMifMasterRow[] = [];
      const files = new Set<string>();
      (Array.isArray(metaData.sourceFiles) ? metaData.sourceFiles : []).forEach((name: string) => {
        if (name) files.add(String(name));
      });
      if (metaData.latestRunAtIso || metaData.updatedAt) {
        setMasterListCreatedAtIso(String(metaData.latestRunAtIso || metaData.updatedAt || ''));
      }

      if (loadFullMaster) {
        const snap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
        snap.forEach((docSnap) => {
          if (docSnap.id === '_meta') return;
          const data = docSnap.data() as IlsMifMasterRow;
          if (!data?.memberFirstName || !data?.memberLastName) return;
          if (!isIlsMifSourcedMasterRow(data)) return;
          loaded.push({
            ...data,
            rowId: data.rowId || docSnap.id,
          });
          if (data.sourceFileName) files.add(data.sourceFileName);
        });
      } else if (preferredRunId) {
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
          if (!isIlsMifSourcedMasterRow(data)) return;
          loaded.push({
            ...data,
            rowId: data.rowId || docSnap.id,
          });
          if (data.sourceFileName) files.add(data.sourceFileName);
        });

        // If this dated run is a partial snapshot, merge the full master so Open Run
        // does not drop hundreds of members that still live on the shared master list.
        const masterSnap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
        const masterRows: IlsMifMasterRow[] = [];
        masterSnap.forEach((docSnap) => {
          if (docSnap.id === '_meta') return;
          const data = docSnap.data() as IlsMifMasterRow;
          if (!data?.memberFirstName || !data?.memberLastName) return;
          if (!isIlsMifSourcedMasterRow(data)) return;
          masterRows.push({ ...data, rowId: data.rowId || docSnap.id });
          if (data.sourceFileName) files.add(data.sourceFileName);
        });
        const runUnique = loaded.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
        const masterUnique = masterRows.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
        if (masterUnique > runUnique + 25) {
          loaded.push(...masterRows);
        }
      }

      if (!loaded.length) {
        toast({
          title: 'No saved members found',
          description: preferredRunId
            ? 'That consolidation run has no saved member rows yet. Upload MIFs again to refresh the master.'
            : 'Upload MIF files first (they auto-save to the shared master).',
        });
        return;
      }
      const dedupedBase = dedupeIlsMifMasterRows(loaded).filter((row) => {
        if (options?.ignoreRemoved) return true;
        const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
        return !removedKeys.has(key) && !removedKeys.has(row.rowId) && !removedKeys.has(String(key || ''));
      });

      // Uploads not yet linked to a consolidation run were never locked into Load Latest.
      // Merge those members so recent MIF uploads are not lost when opening the last saved run.
      const orphanUploads = uploadedFiles.filter((file) => !String(file.runId || '').trim());
      const orphanRows: IlsMifMasterRow[] = [];
      for (const upload of orphanUploads) {
        const snap = await getDocs(
          collection(
            firestore,
            ILS_MIF_UPLOADED_FILES_COLLECTION,
            upload.id,
            ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION
          )
        );
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (!data?.memberFirstName || !data?.memberLastName) return;
          orphanRows.push({
            ...(data as IlsMifMasterRow),
            rowId: String(data.rowId || docSnap.id),
            sourceFileName: String(data.sourceFileName || upload.fileName || ''),
            mergeStatus: 'unique',
            statusNote: String(data.statusNote || '').trim() || 'Merged from upload not yet in a dated run',
          });
        });
        if (upload.fileName) files.add(upload.fileName);
      }
      const beforeOrphanMerge = dedupedBase.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
      const deduped = dedupeIlsMifMasterRows([...dedupedBase, ...orphanRows]);
      const afterOrphanMerge = deduped.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
      const orphanNetAdded = Math.max(0, afterOrphanMerge - beforeOrphanMerge);
      // Dated runs are saved after Caspio check — keep those flags so Create App / Not in Caspio
      // cards work immediately. Overlay latest skeleton IDs from the shared master collection.
      const masterSnap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      const skeletonByKey = new Map<string, string>();
      masterSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() || {};
        const skeletonId = String(data.skeletonApplicationId || '').trim();
        if (!skeletonId) return;
        const remember = (key: string) => {
          if (key && !skeletonByKey.has(key)) skeletonByKey.set(key, skeletonId);
        };
        remember(docSnap.id);
        remember(String(data.dedupeKey || '').trim());
        remember(
          buildIlsMifDedupeKey({
            clientId2: String(data.clientId2 || ''),
            memberMrn: String(data.memberMrn || ''),
            memberMediCalNum: String(data.memberMediCalNum || ''),
            memberFirstName: String(data.memberFirstName || ''),
            memberLastName: String(data.memberLastName || ''),
            memberDob: String(data.memberDob || ''),
          })
            .replace(/[\/#?[\]]/g, '_')
            .slice(0, 700)
        );
      });
      const withSkeletons = deduped.map((row) => {
        const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
        const skeletonApplicationId =
          String(row.skeletonApplicationId || skeletonByKey.get(key) || skeletonByKey.get(row.rowId) || '').trim();
        const caspioAuthorized =
          Boolean(row.caspioExists) && isIlsMifCaspioAuthorizedStatus(row.caspioCalAIMStatus);
        const mergeStatus =
          row.mergeStatus === 'duplicate_in_batch' || row.mergeStatus === 'incomplete'
            ? row.mergeStatus
            : caspioAuthorized
              ? ('already_in_caspio' as const)
              : ('unique' as const);
        return {
          ...row,
          caspioExists: Boolean(row.caspioExists),
          mergeStatus,
          ...(skeletonApplicationId ? { skeletonApplicationId } : {}),
        };
      });
      let finalRows = withSkeletons;
      // Always re-check Caspio against the full master so past MIFs get status-update flags.
      const rechecked = await checkCaspio(withSkeletons);
      if (rechecked?.length) finalRows = rechecked;
      const createAppReady = finalRows.filter(
        (r) =>
          r.mergeStatus === 'unique' &&
          !r.caspioExists &&
          !String(r.skeletonApplicationId || '').trim() &&
          !declinedKeys.has(memberKey(r))
      ).length;
      const notInCaspioAll = finalRows.filter(
        (r) => r.mergeStatus === 'unique' && !declinedKeys.has(memberKey(r))
      ).length;
      const inCaspioCount = finalRows.filter((r) => r.mergeStatus === 'already_in_caspio').length;
      const alreadyHaveSkeleton = Math.max(0, notInCaspioAll - createAppReady);
      const statusUpdateCount = finalRows.filter((r) => ilsMifNeedsStatusUpdate(r)).length;
      setRows(finalRows);
      setSourceFiles(sortMifFileNamesByGeneratedDate(Array.from(files), 'desc'));
      setActiveRunId(preferredRunId || '');
      setHasCheckedCaspio(true);
      setLastMatchedLabel(
        orphanNetAdded > 0
          ? `Merged ${orphanNetAdded} from unsaved upload(s) + Caspio status scan`
          : loadFullMaster
            ? 'Full shared master list + Caspio status scan'
            : preferredRunId
              ? `From saved run ${preferredRunId} + Caspio status scan`
              : 'From saved master list + Caspio status scan'
      );
      setFilter(statusUpdateCount > 0 ? 'status-updates' : 'new');
      setNorthernOnly(false);
      setMasterPage(0);
      if (preferredRunId) setExpandedRunId(preferredRunId);
      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        finalRows.forEach((row) => {
          next[row.rowId] =
            row.mergeStatus === 'unique' &&
            !row.caspioExists &&
            !String(row.skeletonApplicationId || '').trim() &&
            !declinedKeys.has(memberKey(row))
              ? Boolean(prev[row.rowId] ?? true)
              : false;
        });
        return next;
      });
      const uniqueLoaded = finalRows.filter((r) => r.mergeStatus !== 'duplicate_in_batch').length;
      toast({
        title: loadFullMaster ? 'Full master list loaded' : 'Consolidation run loaded',
        description: `${uniqueLoaded} unique members` +
          (loadFullMaster ? ' from the shared master (all MIFs)' : ` · run ${preferredRunId}`) +
          ` · ${files.size} MIF file(s) · ${createAppReady} need skeleton` +
          (alreadyHaveSkeleton ? ` (${alreadyHaveSkeleton} already have skeleton)` : '') +
          (orphanNetAdded > 0 ? ` · +${orphanNetAdded} from uploads not yet in a dated run` : '') +
          (inCaspioCount ? ` · ${inCaspioCount} already in Caspio` : '') +
          (orphanNetAdded > 0 ? '. Master will include these after the next upload auto-save, or Re-check Caspio.' : ''),
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      scrollToMasterList();
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
    const members = toSend.map((row) => ({
      memberName: `${row.memberFirstName} ${row.memberLastName}`.trim(),
      memberMrn: row.memberMrn,
      memberCounty: row.memberCounty,
    }));
    setDeclineComposerSubject(buildIlsBulkOutOfCountyDeclineSubject(members.length));
    setDeclineComposerBody(buildIlsBulkOutOfCountyDeclineTextBody({ members }));
    setDeclinePreviewApproved(false);
    setDeclineConfirmTyped('');
    setDeclineComposerOpen(true);
  };

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
    if (!declinePreviewApproved) {
      toast({
        variant: 'destructive',
        title: 'Approve the preview',
        description: 'Check the required box to confirm you reviewed the email before sending.',
      });
      return;
    }
    const subject = String(declineComposerSubject || '').trim();
    const emailBodyText = String(declineComposerBody || '').trim();
    if (!subject || !emailBodyText) {
      toast({
        variant: 'destructive',
        title: 'Message incomplete',
        description: 'Subject and email body are required before sending.',
      });
      return;
    }
    if (toSend.length >= NORTHERN_DECLINE_CONFIRM_THRESHOLD) {
      if (String(declineConfirmTyped || '').trim() !== String(toSend.length)) {
        toast({
          variant: 'destructive',
          title: 'Confirm the send count',
          description: `Type ${toSend.length} in the confirmation box before sending one decline email covering ${toSend.length} members.`,
        });
        return;
      }
    }

    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    setIsSendingDeclines(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/ils-service-delivery-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sourceType: 'mif_consolidator_bulk',
          sourceFileName: activeRunId || toSend[0]?.sourceFileName || '',
          choice: 'decline',
          declineReason: 'out_of_county',
          emailSubject: subject,
          emailBodyText,
          idempotencyKey,
          members: toSend.map((row) => ({
            rowId: row.rowId,
            memberName: `${row.memberFirstName} ${row.memberLastName}`.trim(),
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            memberMrn: row.memberMrn,
            memberCounty: row.memberCounty,
            memberClientId: row.clientId2 || row.caspioMatchedClientId2 || '',
            sourceFileName: row.sourceFileName,
          })),
        }),
      });
      const body = await response.json().catch(() => ({} as any));
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      const sharedSubject = String(body?.log?.subject || subject);
      const sharedBody = String(body?.log?.message || emailBodyText);

      if (firestore) {
        const CHUNK = 200;
        for (let i = 0; i < toSend.length; i += CHUNK) {
          const chunk = toSend.slice(i, i + CHUNK);
          const batch = writeBatch(firestore);
          chunk.forEach((row) => {
            const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
            const memberName = `${row.memberFirstName} ${row.memberLastName}`.trim();
            batch.set(
              doc(firestore, ILS_MIF_DECLINED_COLLECTION, key || row.rowId),
              {
                ...row,
                dedupeKey: key,
                memberName,
                declinedAtIso: new Date().toISOString(),
                declinedAtServer: serverTimestamp(),
                emailSubject: sharedSubject,
                emailBodyText: sharedBody,
                customText: '',
                declineReason: 'out_of_county',
                bulkDecline: true,
                bulkMemberCount: toSend.length,
                actedByEmail: user.email || '',
                actedByUid: user.uid || '',
                to: [...ILS_DECISION_TO],
                cc: [...ILS_DECISION_CC],
              },
              { merge: true }
            );
          });
          await batch.commit();
        }

        const sentAtIso = new Date().toISOString();
        try {
          await addDoc(collection(firestore, ILS_MIF_NORTHERN_DECLINE_BATCHES_COLLECTION), {
            sentAtIso,
            sentAtServer: serverTimestamp(),
            subject: sharedSubject,
            emailSubject: sharedSubject,
            emailBodyText: sharedBody,
            customText: '',
            memberCount: toSend.length,
            members: toSend.map((row) => ({
              memberFirstName: row.memberFirstName,
              memberLastName: row.memberLastName,
              memberMrn: row.memberMrn,
              memberCounty: row.memberCounty,
              memberMediCalNum: row.memberMediCalNum || '',
              dedupeKey: buildIlsMifDedupeKey(row),
            })),
            actedByEmail: user.email || '',
            actedByUid: user.uid || '',
            to: [...ILS_DECISION_TO],
            cc: [...ILS_DECISION_CC],
            runId: activeRunId || '',
            apiLogId: String(body?.log?.id || ''),
          });
        } catch (batchLogError) {
          console.warn('Northern decline batch log write failed (deploy firestore rules if needed):', batchLogError);
        }
      }

      await loadRunsAndDeclined();
      setFilter('northern');
      setNorthernOnly(true);
      setDeclineComposerOpen(false);
      setDeclineComposerRows([]);
      setDeclineComposerSubject('');
      setDeclineComposerBody('');
      setDeclinePreviewApproved(false);
      setDeclineConfirmTyped('');
      await writeIlsMifAudit(
        'northern_decline_bulk',
        `Sent 1 northern decline email covering ${toSend.length} member(s)`,
        { sent: 1, failed: 0, count: toSend.length, bulk: true }
      );
      toast({
        title: 'Northern decline email sent',
        description: `Logged and emailed ${toSend.length} member(s) to ${ILS_DECISION_TO[0]} (CC ${ILS_DECISION_CC[0]}). Northern not in Caspio now shows only members still needing denial.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to send northern decline email',
        description: String(error?.message || 'Unknown error'),
      });
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
    setSessionNetNewFromUploads(0);
    setLastUploadStats(null);
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

  const downloadMasterAsCsMif = async (mode: 'all' | 'new' = 'all') => {
    const exportRows =
      mode === 'new'
        ? rows.filter(
            (row) =>
              row.mergeStatus === 'unique' && !row.caspioExists && !declinedKeys.has(memberKey(row))
          )
        : rows.filter((row) => row.mergeStatus !== 'duplicate_in_batch');
    if (!exportRows.length) {
      toast({
        variant: 'destructive',
        title: 'Nothing to download',
        description:
          mode === 'new'
            ? 'No not-in-Caspio members to export.'
            : 'Upload or load a master list first.',
      });
      return;
    }
    setIsDownloading(true);
    try {
      const stamp = masterListCreatedAtIso
        ? masterListCreatedAtIso.slice(0, 10).replace(/-/g, '')
        : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const suffix = mode === 'new' ? 'NotInCaspio' : 'Master';
      const fileName = await downloadIlsMifMasterAsCsMifWorkbook(
        exportRows,
        `ILS_CS_MIF_${suffix}_${stamp}.xlsx`
      );
      await writeIlsMifAudit('export_download', `Downloaded ${suffix} CS_MIF (${exportRows.length})`, {
        mode,
        count: exportRows.length,
        fileName,
      });
      toast({
        title: 'CS_MIF downloaded',
        description: `Saved ${exportRows.length} member(s) as ${fileName} using the original ILS MIF column layout.`,
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

  const compareActiveRunToPrevious = async () => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    const current = runs.find((run) => run.id === activeRunId) || runs[0];
    if (!current) {
      toast({ title: 'No runs to compare', description: 'Save or open a consolidation run first.' });
      return;
    }
    const prior = runs.find((run) => run.id !== current.id);
    if (!prior) {
      toast({ title: 'Need two runs', description: 'Upload another MIF batch (auto-saves a run) to compare against the previous one.' });
      return;
    }
    setIsComparingRuns(true);
    try {
      const loadMembers = async (runId: string) => {
        const snap = await getDocs(
          collection(
            firestore,
            ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
            runId,
            ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
          )
        );
        const list: IlsMifMasterRow[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as IlsMifMasterRow;
          if (!data?.memberFirstName || !data?.memberLastName) return;
          const key = buildIlsMifDedupeKey(data).replace(/[\/#?[\]]/g, '_').slice(0, 700);
          if (removedKeys.has(key) || removedKeys.has(docSnap.id)) return;
          list.push({ ...data, rowId: data.rowId || docSnap.id });
        });
        return list;
      };
      const [currentMembers, priorMembers] = await Promise.all([
        loadMembers(current.id),
        loadMembers(prior.id),
      ]);
      const summary = diffIlsMifMemberLists(currentMembers, priorMembers);
      setRunDiff({
        currentRunId: current.id,
        priorRunId: prior.id,
        currentLabel: current.label || current.createdAtIso,
        priorLabel: prior.label || prior.createdAtIso,
        summary,
      });
      await writeIlsMifAudit(
        'run_compare',
        `Compared ${current.label || current.id} vs ${prior.label || prior.id}: +${summary.added.length} / -${summary.removed.length}`,
        {
          currentRunId: current.id,
          priorRunId: prior.id,
          added: summary.added.length,
          removed: summary.removed.length,
        }
      );
      scrollToMasterList();
      toast({
        title: 'Run comparison ready',
        description: `+${summary.added.length} new · −${summary.removed.length} gone · ${summary.unchangedCount} unchanged`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Compare failed',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsComparingRuns(false);
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
            !String(row.skeletonApplicationId || '').trim() &&
            !declinedKeys.has(memberKey(row))
        );
    if (!payloadRows.length) {
      toast({
        variant: 'destructive',
        title: 'No remaining new members',
        description:
          'Everyone in this list is already in Caspio, declined, or already has a skeleton application. Upload new MIFs or Load Latest Master List to refresh remaining Create App candidates.',
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
      await writeIlsMifAudit(
        'create_app_load',
        `Staged ${payloadRows.length} new member(s) for Create Application`,
        { runId: handoffRunId, count: payloadRows.length }
      );
      toast({
        title: 'New members ready on Create Application',
        description: `${payloadRows.length} member(s) without a skeleton staged. Create Application stays available for anyone still new after you create skeletons — return here and send remaining members again.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      window.open(
        `/admin/applications/create?intakeSource=ils_spreadsheet_batch&fromConsolidator=1${
          handoff.runId ? `&consolidatorRunId=${encodeURIComponent(handoff.runId)}` : ''
        }#kaiser-ils-datapage`,
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
    if (ilsMifRowNeedsAuthorizedUpdate(row) || row.needsT2038ReceivedUpdate) {
      return (
        <div className="flex flex-wrap gap-1">
          {ilsMifRowNeedsAuthorizedUpdate(row) ? (
            <Badge className="bg-violet-100 text-violet-950 hover:bg-violet-100">
              In Caspio · Pending → Authorized
            </Badge>
          ) : null}
          {row.needsT2038ReceivedUpdate ? (
            <Badge className="bg-fuchsia-100 text-fuchsia-950 hover:bg-fuchsia-100">
              T2038 Requested → Received, doc collection
            </Badge>
          ) : null}
        </div>
      );
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
    <div className="space-y-6 w-full min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            ILS MIF Consolidator
          </CardTitle>
          <CardDescription>
            Upload MIFs to grow the shared master list (deduped). Same-day or same-filename files are compared by
            member (MRN/CIN/name). After Caspio check, new members are saved to the master automatically. Then send
            remaining new members to Create Application anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-950 space-y-1">
            <div className="font-medium">Recommended workflow</div>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>
                <span className="font-medium">1) Upload MIFs</span> — merges into the master (deduped), saves file
                history, checks Caspio, and auto-saves the shared master. Same filename / same day is OK: we
                compare members and only add people who are not already on the list.
              </li>
              <li>
                <span className="font-medium">2) Bulk Email Denial</span> — northern not-in-Caspio members (optional).
              </li>
              <li>
                <span className="font-medium">3) Send New Members to Create Application</span> — opens Create App
                with members who are not in Caspio, not declined, and <span className="font-medium">do not already
                have a skeleton</span>. You can return here anytime and send remaining new members again.
              </li>
              <li>
                <span className="font-medium">Later MIFs</span> — upload more files (even same name/day); the master
                updates automatically, then send only leftover new members to Create App.
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
              disabled={isParsing || isMatching || isSaving}
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsing || isMatching || isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isParsing
                ? 'Uploading into master list…'
                : isMatching
                  ? 'Checking Caspio…'
                  : isSaving
                    ? 'Saving master…'
                    : '1) Upload MIFs → Consolidate + Check Caspio'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSendingDeclines || !rows.length || !hasCheckedCaspio}
              onClick={() => openNorthernDeclineComposer()}
            >
              {isSendingDeclines ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              2) Bulk Email Denial
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                !rows.length ||
                isSaving ||
                isParsing ||
                isMatching ||
                !hasCheckedCaspio ||
                remainingNewForCreateApp.length === 0
              }
              onClick={() => void sendSelectedToCreateApplication()}
              title={
                remainingNewForCreateApp.length
                  ? `${remainingNewForCreateApp.length} member(s) still need a skeleton (not in Caspio, not declined). Selected rows are preferred; otherwise all remaining new members are sent.`
                  : 'No remaining new members without a skeleton.'
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              3) Send New Members to Create Application
              {hasCheckedCaspio && remainingNewForCreateApp.length
                ? ` (${remainingNewForCreateApp.length})`
                : ''}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isDownloading || !rows.length}
              onClick={() => void downloadMasterAsCsMif('all')}
            >
              {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download Master
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isDownloading || !rows.length || !hasCheckedCaspio}
              onClick={() => void downloadMasterAsCsMif('new')}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Not in Caspio
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isComparingRuns || runs.length < 2}
              onClick={() => void compareActiveRunToPrevious()}
            >
              {isComparingRuns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
              Compare to Previous Run
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <Button
              size="default"
              className="h-10 px-5 font-semibold"
              disabled={isMatching || isParsing || !rows.length}
              onClick={() => void checkCaspio()}
            >
              {isMatching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {isMatching ? 'Checking Caspio…' : 'Re-check Caspio'}
            </Button>
            <div className="min-w-0 flex-1 text-right space-y-0.5">
              <div className="text-sm font-semibold text-slate-900">
                {hasCheckedCaspio ? 'Kaiser Caspio status for summary cards' : 'Re-check Caspio required'}
              </div>
              <div className="text-xs text-muted-foreground">
                {hasCheckedCaspio
                  ? lastMatchedLabel
                    ? `${lastMatchedLabel}. Not in Caspio (Create App) = members still needing a skeleton.`
                    : 'Not in Caspio (Create App) = members still needing a skeleton. Re-check anytime to refresh.'
                  : 'Not in Caspio / Already in Caspio / Northern counts stay blank until you re-check (Kaiser only).'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">Running master consolidator total</span>
              <span className="text-2xl font-bold tabular-nums">{totals.total}</span>
              <span className="text-blue-800">
                unique member{totals.total === 1 ? '' : 's'} across all MIFs
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-900/90">
              <span>
                New from uploads (this session):{' '}
                <span className="font-semibold tabular-nums">{sessionNetNewFromUploads}</span>
              </span>
              {lastUploadStats ? (
                <span>
                  Latest upload:{' '}
                  <span className="font-semibold tabular-nums">+{lastUploadStats.netNew}</span> new
                  {' · '}
                  <span className="tabular-nums">{lastUploadStats.parsedRows}</span> row
                  {lastUploadStats.parsedRows === 1 ? '' : 's'} parsed
                  {' · '}
                  <span className="tabular-nums">{lastUploadStats.fileCount}</span> file
                  {lastUploadStats.fileCount === 1 ? '' : 's'}
                </span>
              ) : null}
              <span>
                Member rows across all uploaded MIF files:{' '}
                <span className="font-semibold tabular-nums">{rawMembersAcrossUploadedMifs}</span>
                <span className="text-blue-800/80"> (before unique merge)</span>
              </span>
              {totals.duplicates > 0 ? (
                <span>{totals.duplicates} batch duplicate(s) excluded from unique total</span>
              ) : null}
              {sortedSessionFiles.length ? (
                <span>
                  {sortedSessionFiles.length} MIF file{sortedSessionFiles.length === 1 ? '' : 's'} in
                  this session
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-blue-800/90">
              Unique total = everyone on the master after dedupe across all MIFs. New from uploads =
              people added to that unique list when you upload (auto-saved to the shared master after Caspio
              check). Monthly new-member and skeleton stats are on{' '}
              <Link href="/admin/tools/kaiser-statistics" className="underline underline-offset-2">
                Kaiser Statistics
              </Link>
              .
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            {clickableStat(
              'all',
              'Running master total',
              totals.total,
              '',
              {
                hint:
                  `Unique across all MIFs` +
                  (sessionNetNewFromUploads
                    ? ` · +${sessionNetNewFromUploads} new from uploads this session`
                    : '') +
                  (totals.duplicates > 0 ? ` · ${totals.duplicates} batch dupes excluded` : ''),
              }
            )}
            {clickableStat(
              'new',
              'Not in Caspio (Create App)',
              hasCheckedCaspio ? totals.createApp : '—',
              hasCheckedCaspio ? 'text-emerald-700' : 'text-muted-foreground',
              {
                disabled: !hasCheckedCaspio,
                hint: hasCheckedCaspio
                  ? totals.unique > totals.createApp
                    ? `Need skeleton · ${totals.unique - totals.createApp} already have skeleton (of ${totals.unique} not in Caspio)`
                    : 'Need skeleton · excludes Caspio + declined'
                  : 'Load Latest Master List or Re-check Caspio',
              }
            )}
            {clickableStat(
              'caspio',
              'Already in Caspio (Kaiser)',
              hasCheckedCaspio ? totals.caspio : '—',
              hasCheckedCaspio ? 'text-amber-700' : 'text-muted-foreground',
              {
                disabled: !hasCheckedCaspio,
                hint: hasCheckedCaspio ? 'Health Net ignored' : 'Check Caspio first',
              }
            )}
            {clickableStat(
              'status-updates',
              'Status updates needed',
              hasCheckedCaspio ? totals.statusUpdates : '—',
              hasCheckedCaspio ? 'text-violet-700' : 'text-muted-foreground',
              {
                disabled: !hasCheckedCaspio,
                hint: hasCheckedCaspio
                  ? `${totals.needsAuthorized} CalAIM Pending→Authorized · ${totals.needsT2038Received} Kaiser T2038 Requested→${ILS_MIF_TARGET_T2038_RECEIVED_STATUS}`
                  : 'Check Caspio first',
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
                  ? 'Still need denial · already emailed excluded'
                  : 'Check Caspio first',
              }
            )}
            {clickableStat(
              'declined',
              'Declined list',
              Math.max(totals.declined || 0, declinedMembers.length),
              'text-rose-700',
              {
                hint:
                  northernDeclineBatches.length > 0
                    ? `${northernDeclineBatches.length} bulk send(s) logged`
                    : 'Members emailed to ILS',
              }
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] max-w-lg flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryText}
                onChange={(event) => {
                  setQueryText(event.target.value);
                  scrollToMasterList();
                }}
                placeholder="Search member by name, MRN, CIN, DOB, county…"
                className="pl-9"
                aria-label="Search master MIF members"
              />
            </div>
            {queryText.trim() ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setQueryText('')}
              >
                Clear search
              </Button>
            ) : null}
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
                ['status-updates', 'Status updates'],
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
                disabled={
                  (value === 'new' || value === 'caspio' || value === 'status-updates') &&
                  !hasCheckedCaspio
                }
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

          {hasCheckedCaspio && pendingAuthorizeCandidates.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-semibold text-violet-950">
                  Pending → Authorized in Caspio ({pendingAuthorizeCandidates.length})
                </div>
                <div className="text-xs text-violet-900/90">
                  Push MIF T2038 authorization number, start/end dates, and set CalAIM_Status to Authorized for
                  Caspio matches still Pending.
                  {rows.some((row) => selected[row.rowId] && ilsMifRowNeedsAuthorizedUpdate(row))
                    ? ` Using ${rows.filter((row) => selected[row.rowId] && ilsMifRowNeedsAuthorizedUpdate(row)).length} selected member(s).`
                    : ' No selection — all Pending → Authorized members on the master list will be pushed.'}
                </div>
              </div>
              <Button
                size="sm"
                className="bg-violet-700 hover:bg-violet-800"
                disabled={isPushingAuthorized || !pushAuthorizeTargets.length}
                onClick={() => void pushPendingToAuthorizedInCaspio()}
              >
                {isPushingAuthorized ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isPushingAuthorized ? 'Pushing to Caspio…' : 'Push Pending → Authorized'}
              </Button>
            </div>
          ) : null}
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
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setUploadedFilesSectionExpanded((prev) => !prev)}
            aria-expanded={uploadedFilesSectionExpanded}
          >
            <CardTitle className="flex items-center gap-2 text-base">
              {uploadedFilesSectionExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <Upload className="h-4 w-4 shrink-0" />
              Uploaded MIF Files (viewable)
              <span className="text-sm font-normal text-muted-foreground">
                · {uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'}
              </span>
            </CardTitle>
            <span className="shrink-0 text-xs font-medium text-blue-700">
              {uploadedFilesSectionExpanded ? 'Hide' : 'Show'}
            </span>
          </button>
          {uploadedFilesSectionExpanded ? (
            <CardDescription>
              Each uploaded MIF is saved with its members. Expand a row to see names and MRNs. Same-date uploads report
              how many members are new before merge.
              {masterListCreatedAtIso
                ? ` Latest consolidation list created ${new Date(masterListCreatedAtIso).toLocaleString()}.`
                : ''}
            </CardDescription>
          ) : null}
        </CardHeader>
        {uploadedFilesSectionExpanded ? (
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
        ) : null}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Consolidation Runs
          </CardTitle>
          <CardDescription>
            Each MIF upload auto-saves a dated run. The latest run supports Open / Create App; older runs keep their
            MIF filenames for history (Show MIFs). Members stay on the shared master list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved runs yet.</div>
          ) : (
            runs.map((run) => {
              const runMifs = sortMifFileNamesByGeneratedDate(run.sourceFiles || [], mifDateSortDirection);
              const isExpanded = expandedRunId === run.id;
              const isLatestRun = latestConsolidationRun?.id === run.id;
              const totalSaved = run.memberCount || run.totals.total || 0;
              return (
                <div key={run.id} className="rounded border px-3 py-2 text-sm space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setExpandedRunId(isExpanded ? '' : run.id)}
                    >
                      <div className="font-medium">
                        {run.label || run.createdAtIso}
                        {isLatestRun ? (
                          <span className="ml-2 text-xs font-normal text-blue-700">Latest</span>
                        ) : null}
                      </div>
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
                      {isLatestRun ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoadingSaved || isRestoringRemoved || Boolean(deletingRunId)}
                            onClick={() => {
                              setExpandedRunId(run.id);
                              void loadSavedMasterList(run.id);
                            }}
                          >
                            Open Run
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoadingSaved || isRestoringRemoved || Boolean(deletingRunId)}
                            onClick={() => {
                              setExpandedRunId(run.id);
                              void restoreRemovedAndStartOver(run.id);
                            }}
                            title="Restore Northern CA / RCFE removals for this run and reload from scratch"
                          >
                            {isRestoringRemoved && restoringRunId === run.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Start over
                          </Button>
                          <Button
                            size="sm"
                            disabled={Boolean(deletingRunId)}
                            onClick={() => void sendSelectedToCreateApplication(run.id)}
                          >
                            Send New to Create App
                          </Button>
                        </>
                      ) : null}
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">Northern Denials Sent to ILS</CardTitle>
                <CardDescription>
                  Bulk emails already sent are logged here. Members in those sends stay excluded from Northern not in
                  Caspio when you add more MIFs — only new northern members still needing denial remain. To{' '}
                  {ILS_DECISION_TO[0]} · CC {ILS_DECISION_CC[0]}.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={isSendingDeclines || !rows.length || !hasCheckedCaspio}
                onClick={() => openNorthernDeclineComposer()}
              >
                <Mail className="mr-2 h-4 w-4" />
                Bulk Email Denial
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Bulk send log ({northernDeclineBatches.length})</div>
              <div className="max-h-[280px] overflow-auto rounded border">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Sent</th>
                      <th className="px-3 py-2">Members</th>
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2">By</th>
                      <th className="px-3 py-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {northernDeclineBatches.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No bulk northern denial emails logged yet.
                        </td>
                      </tr>
                    ) : (
                      northernDeclineBatches.map((batch) => (
                        <tr key={batch.id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {batch.sentAtIso ? new Date(batch.sentAtIso).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2">{batch.memberCount}</td>
                          <td className="px-3 py-2 text-muted-foreground">{batch.subject || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{batch.actedByEmail || '—'}</td>
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => setViewedNorthernBatch(batch)}
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
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Declined members ({declinedMembers.length})</div>
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
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card ref={masterListAnchorRef} id="mif-master-list">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {filter === 'northern' && !queryText.trim()
                ? 'Bulk Northern Denial Email'
                : queryText.trim()
                  ? 'Master List · Search results'
                  : 'Master List'}
            </CardTitle>
            <CardDescription>
              {queryText.trim()
                ? `${visibleRows.length} member(s) matching “${queryText.trim()}” across the full master list`
                : filter === 'northern'
                  ? `${totals.northern} northern member(s) still need denial (already emailed excluded). Preview the full email, then approve and send.`
                  : `${visibleRows.length} shown · ${selectedVisibleRows.length} selected · ${selectedNewRows.length} new selected · ${selectedNorthernForDecline.length} northern selected for denial${
                      removedKeys.size ? ` · ${removedKeys.size} removed (restorable)` : ''
                    }`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <Label htmlFor="master-member-search" className="text-xs font-medium text-slate-700">
                Search member on master MIF list
              </Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[260px] max-w-xl flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="master-member-search"
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    placeholder="Name, MRN, CIN, DOB, county, phone, file, auth #…"
                    className="bg-white pl-9"
                  />
                </div>
                {queryText.trim() ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setQueryText('')}>
                    Clear
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Search finds members across the whole master (not only the active filter). Use spaces for multiple
                terms (e.g. last name + MRN). Auth # / start / end come from the MIF line — open Auth fields to map
                into Caspio.
              </p>
            </div>
            {filter === 'northern' && !queryText.trim() ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-sm">
                  <div className="font-medium text-slate-900">
                    Ready to email {totals.northern} member{totals.northern === 1 ? '' : 's'} to ILS
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Opens full email preview (To / CC / body / member list). Approve preview and send as one email.
                  </div>
                </div>
                <Button
                  type="button"
                  disabled={isSendingDeclines || !hasCheckedCaspio || totals.northern < 1}
                  onClick={() => openNorthernDeclineComposer()}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Bulk Email Denial
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={!visibleRows.length}
                onClick={selectAllVisibleMasterRows}
              >
                Select all shown
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={!selectedVisibleRows.length}
                onClick={deselectVisibleMasterRows}
              >
                Deselect shown
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={!Object.values(selected).some(Boolean)}
                onClick={deselectAllMasterRows}
              >
                Deselect all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-rose-700"
                disabled={isRemovingSelected || isRestoringRemoved || !Object.values(selected).some(Boolean)}
                onClick={() => void removeSelectedFromSessionList()}
              >
                {isRemovingSelected ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                )}
                Remove selected from run
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={isRestoringRemoved || isRemovingSelected || (!removedKeys.size && !activeRunId)}
                onClick={() => void restoreRemovedAndStartOver(activeRunId || undefined)}
                title="Put Northern CA / RCFE removals (and other removals) back, then reload the run"
              >
                {isRestoringRemoved ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Restore removed · Start over
                {removedKeys.size ? ` (${removedKeys.size})` : ''}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Page {Math.min(masterPage + 1, masterPageCount)} of {masterPageCount} · showing{' '}
                {pagedVisibleRows.length} of {visibleRows.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={masterPage <= 0}
                  onClick={() => setMasterPage((prev) => Math.max(0, prev - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={masterPage + 1 >= masterPageCount}
                  onClick={() => setMasterPage((prev) => Math.min(masterPageCount - 1, prev + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto rounded border">
              <table className="w-max min-w-full table-auto text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 whitespace-nowrap">
                      <label className="inline-flex items-center gap-2 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleSelected;
                          }}
                          disabled={!visibleRows.length}
                          onChange={(event) => {
                            if (event.target.checked) selectAllVisibleMasterRows();
                            else deselectVisibleMasterRows();
                          }}
                          aria-label="Select all shown members"
                        />
                        <span>Select</span>
                      </label>
                    </th>
                    <th className="px-3 py-2 whitespace-nowrap">Status</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[11rem]">Member</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[10rem]">MRN / CIN</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">County</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[9rem]">Auth #</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">Auth start</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">Auth end</th>
                    <th className="px-3 py-2 whitespace-nowrap min-w-[20rem]">Source file</th>
                    <th className="px-3 py-2 whitespace-nowrap">MIF → Caspio</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                        Upload MIF spreadsheets to build the master list.
                      </td>
                    </tr>
                  ) : (
                    pagedVisibleRows.map((row) => {
                      return (
                        <tr key={row.rowId} className="border-t align-top">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={Boolean(selected[row.rowId])}
                              onChange={(event) =>
                                setSelected((prev) => ({ ...prev, [row.rowId]: event.target.checked }))
                              }
                              aria-label={`Select ${row.memberLastName}, ${row.memberFirstName}`}
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{statusBadge(row)}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {row.memberLastName}, {row.memberFirstName}
                            {isNorthernCounty(row.memberCounty) ? (
                              <div className="text-[11px] font-normal text-indigo-700">Northern county</div>
                            ) : null}
                            {hasCheckedCaspio &&
                            row.caspioExists &&
                            isIlsMifCaspioPendingStatus(row.caspioCalAIMStatus) ? (
                              <div className="text-[11px] font-normal text-violet-800">
                                Matched in Caspio as Pending — update CalAIM_Status to Authorized
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div>MRN: {row.memberMrn || '—'}</div>
                            <div>CIN: {row.memberMediCalNum || '—'}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.memberCounty || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                            {row.authorizationNumberT2038 || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                            {row.authorizationStartT2038 || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                            {row.authorizationEndT2038 || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                            {row.sourceFileName || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => setAuthDetailRow(row)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Auth fields
                            </Button>
                          </td>
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

      {runDiff ? (
        <Card id="mif-run-diff">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Run comparison
            </CardTitle>
            <CardDescription>
              {runDiff.currentLabel} vs previous {runDiff.priorLabel}: +{runDiff.summary.added.length} new · −
              {runDiff.summary.removed.length} gone · {runDiff.summary.unchangedCount} unchanged
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded border max-h-[240px] overflow-auto">
              <div className="sticky top-0 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900">
                Added in current run ({runDiff.summary.added.length})
              </div>
              <ul className="divide-y text-xs">
                {runDiff.summary.added.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">None</li>
                ) : (
                  runDiff.summary.added.slice(0, 200).map((row, index) => (
                    <li key={`added-${row.memberMrn || index}`} className="px-3 py-1.5">
                      {row.memberLastName}, {row.memberFirstName}
                      {row.memberMrn ? ` · MRN ${row.memberMrn}` : ''}
                      {row.memberCounty ? ` · ${row.memberCounty}` : ''}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded border max-h-[240px] overflow-auto">
              <div className="sticky top-0 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-900">
                Removed since previous run ({runDiff.summary.removed.length})
              </div>
              <ul className="divide-y text-xs">
                {runDiff.summary.removed.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">None</li>
                ) : (
                  runDiff.summary.removed.slice(0, 200).map((row, index) => (
                    <li key={`removed-${row.memberMrn || index}`} className="px-3 py-1.5">
                      {row.memberLastName}, {row.memberFirstName}
                      {row.memberMrn ? ` · MRN ${row.memberMrn}` : ''}
                      {row.memberCounty ? ` · ${row.memberCounty}` : ''}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">MIF audit log</CardTitle>
          <CardDescription>Recent declines, Create App loads, removals, exports, and run saves.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground">No audit events yet.</div>
          ) : (
            <ul className="divide-y rounded border max-h-[220px] overflow-auto text-xs">
              {auditEvents.map((event) => (
                <li key={event.id} className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{event.action}</span> — {event.summary}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {event.atIso ? new Date(event.atIso).toLocaleString() : '—'}
                    {event.actor ? ` · ${event.actor}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="text-sm">
        <Link
          href="/admin/applications/create?intakeSource=ils_spreadsheet_batch#kaiser-ils-datapage"
          className="text-blue-700 underline"
        >
          Open Create Application (Kaiser Auth Received via ILS)
        </Link>
      </div>

      <Dialog
        open={declineComposerOpen}
        onOpenChange={(open) => {
          if (isSendingDeclines) return;
          setDeclineComposerOpen(open);
          if (!open) {
            setDeclineComposerRows([]);
            setDeclineComposerSubject('');
            setDeclineComposerBody('');
            setDeclinePreviewApproved(false);
            setDeclineConfirmTyped('');
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk northern denial — email preview</DialogTitle>
            <DialogDescription>
              Edit the message if needed, check the approval box, then send. One email covers{' '}
              {declineComposerRows.length} member{declineComposerRows.length === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Will be delivered to
              </div>
              <div>
                <span className="font-medium">To:</span>{' '}
                <span className="font-mono text-[13px]">{ILS_DECISION_TO.join(', ')}</span>
              </div>
              <div>
                <span className="font-medium">CC:</span>{' '}
                <span className="font-mono text-[13px]">{ILS_DECISION_CC.join(', ')}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="northern-decline-subject">Subject</Label>
              <Input
                id="northern-decline-subject"
                value={declineComposerSubject}
                onChange={(event) => {
                  setDeclineComposerSubject(event.target.value);
                  setDeclinePreviewApproved(false);
                }}
                disabled={isSendingDeclines}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="northern-decline-body">Email message (editable)</Label>
              <Textarea
                id="northern-decline-body"
                value={declineComposerBody}
                onChange={(event) => {
                  setDeclineComposerBody(event.target.value);
                  setDeclinePreviewApproved(false);
                }}
                className="min-h-[280px] font-mono text-[13px] leading-6"
                disabled={isSendingDeclines}
              />
              <div className="text-[11px] text-muted-foreground">
                Changing the message clears the approval checkbox so you re-confirm before send.
              </div>
            </div>

            <div className="max-h-40 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left">
                  <tr>
                    <th className="px-2 py-1 w-10">#</th>
                    <th className="px-2 py-1">Member</th>
                    <th className="px-2 py-1">MRN</th>
                    <th className="px-2 py-1">County</th>
                  </tr>
                </thead>
                <tbody>
                  {declineComposerRows.map((row, index) => (
                    <tr key={row.rowId} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground tabular-nums">{index + 1}</td>
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

            {declineComposerRows.length >= NORTHERN_DECLINE_CONFIRM_THRESHOLD ? (
              <div className="space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2">
                <Label htmlFor="northern-decline-confirm-count" className="text-amber-950">
                  Type {declineComposerRows.length} to confirm member count
                </Label>
                <Input
                  id="northern-decline-confirm-count"
                  value={declineConfirmTyped}
                  onChange={(event) => setDeclineConfirmTyped(event.target.value)}
                  placeholder={String(declineComposerRows.length)}
                  className="max-w-[160px] bg-white"
                  disabled={isSendingDeclines}
                />
              </div>
            ) : null}

            <label
              htmlFor="northern-decline-approve-preview"
              className="flex items-start gap-3 rounded border border-slate-300 bg-white px-3 py-3 cursor-pointer"
            >
              <Checkbox
                id="northern-decline-approve-preview"
                checked={declinePreviewApproved}
                onCheckedChange={(checked) => setDeclinePreviewApproved(checked === true)}
                disabled={isSendingDeclines}
                className="mt-0.5"
              />
              <span className="text-sm leading-5">
                <span className="font-medium text-slate-900">Required:</span> I have reviewed this email preview
                (recipients, subject, and message) and approve sending it to {ILS_DECISION_TO.join(', ')}
                {ILS_DECISION_CC.length ? ` (CC ${ILS_DECISION_CC.join(', ')})` : ''}.
              </span>
            </label>
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
            <Button
              type="button"
              disabled={
                isSendingDeclines ||
                !declineComposerRows.length ||
                !declinePreviewApproved ||
                !String(declineComposerSubject || '').trim() ||
                !String(declineComposerBody || '').trim()
              }
              onClick={() => void bulkSendNorthernDeclines()}
            >
              {isSendingDeclines ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Approve preview and send
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

      <Dialog open={Boolean(viewedNorthernBatch)} onOpenChange={(open) => !open && setViewedNorthernBatch(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk northern denial email</DialogTitle>
            <DialogDescription>
              {viewedNorthernBatch
                ? `${viewedNorthernBatch.memberCount} member(s) · sent ${
                    viewedNorthernBatch.sentAtIso
                      ? new Date(viewedNorthernBatch.sentAtIso).toLocaleString()
                      : '—'
                  }`
                : 'Bulk decline email'}
            </DialogDescription>
          </DialogHeader>
          {viewedNorthernBatch ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">To:</span>{' '}
                {(viewedNorthernBatch.to.length ? viewedNorthernBatch.to : [...ILS_DECISION_TO]).join(', ')}
              </div>
              <div>
                <span className="font-medium">CC:</span>{' '}
                {(viewedNorthernBatch.cc.length ? viewedNorthernBatch.cc : [...ILS_DECISION_CC]).join(', ')}
              </div>
              <div>
                <span className="font-medium">Subject:</span> {viewedNorthernBatch.subject || '—'}
              </div>
              <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 leading-6">
                {viewedNorthernBatch.emailBodyText || 'Email body was not stored for this bulk send.'}
              </div>
              <div className="max-h-48 overflow-auto rounded border">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left">
                    <tr>
                      <th className="px-2 py-1">Member</th>
                      <th className="px-2 py-1">MRN</th>
                      <th className="px-2 py-1">County</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewedNorthernBatch.members.map((member, index) => (
                      <tr
                        key={`${viewedNorthernBatch.id}-${member.memberMrn || index}`}
                        className="border-t"
                      >
                        <td className="px-2 py-1">
                          {member.memberLastName}, {member.memberFirstName}
                        </td>
                        <td className="px-2 py-1">{member.memberMrn || '—'}</td>
                        <td className="px-2 py-1">{member.memberCounty || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground">
                {viewedNorthernBatch.actedByEmail
                  ? `Sent by ${viewedNorthernBatch.actedByEmail}`
                  : 'Sender not recorded'}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewedNorthernBatch(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(authorizePushResults)} onOpenChange={(open) => !open && setAuthorizePushResults(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Caspio Pending → Authorized push results</DialogTitle>
            <DialogDescription>
              Members updated in Caspio with MIF T2038 authorization data and CalAIM_Status set to Authorized.
            </DialogDescription>
          </DialogHeader>
          {authorizePushResults ? (
            <div className="space-y-4 text-sm">
              {authorizePushResults.authorized.length > 0 ? (
                <div>
                  <div className="mb-2 font-semibold text-green-800">
                    Authorized in Caspio ({authorizePushResults.authorized.length})
                  </div>
                  <ul className="divide-y rounded border bg-white">
                    {authorizePushResults.authorized.map((entry) => (
                      <li key={`authorized-${entry.rowId}`} className="px-3 py-2">
                        <div className="font-medium">{entry.memberName}</div>
                        <div className="text-xs text-muted-foreground">
                          Client_ID2 {entry.clientId2 || '—'} · Auth {entry.authorizationNumberT2038 || '—'} ·{' '}
                          {entry.authorizationStartT2038 || '—'} → {entry.authorizationEndT2038 || '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {authorizePushResults.skipped.length > 0 ? (
                <div>
                  <div className="mb-2 font-semibold text-amber-800">
                    Skipped ({authorizePushResults.skipped.length})
                  </div>
                  <ul className="divide-y rounded border bg-white">
                    {authorizePushResults.skipped.map((entry) => (
                      <li key={`skipped-${entry.rowId}-${entry.reason}`} className="px-3 py-2">
                        <div className="font-medium">{entry.memberName}</div>
                        <div className="text-xs text-muted-foreground">{entry.reason}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {authorizePushResults.failed.length > 0 ? (
                <div>
                  <div className="mb-2 font-semibold text-red-800">
                    Failed ({authorizePushResults.failed.length})
                  </div>
                  <ul className="divide-y rounded border bg-white">
                    {authorizePushResults.failed.map((entry) => (
                      <li key={`failed-${entry.rowId}-${entry.reason}`} className="px-3 py-2">
                        <div className="font-medium">{entry.memberName}</div>
                        <div className="text-xs text-muted-foreground">{entry.reason}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAuthorizePushResults(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(authDetailRow)} onOpenChange={(open) => !open && setAuthDetailRow(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>MIF line → Caspio auth fields</DialogTitle>
            <DialogDescription>
              {authDetailRow
                ? `${authDetailRow.memberLastName}, ${authDetailRow.memberFirstName}`
                : 'Member'}{' '}
              · values from the MIF line for pasting into Caspio when auth is received.
            </DialogDescription>
          </DialogHeader>
          {authDetailRow ? (
            <div className="space-y-4 text-sm">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Source file:{' '}
                <span className="font-mono text-slate-900">{authDetailRow.sourceFileName || '—'}</span>
                {authDetailRow.memberMrn ? (
                  <>
                    {' '}
                    · MRN <span className="font-mono text-slate-900">{authDetailRow.memberMrn}</span>
                  </>
                ) : null}
                {authDetailRow.memberMediCalNum ? (
                  <>
                    {' '}
                    · CIN <span className="font-mono text-slate-900">{authDetailRow.memberMediCalNum}</span>
                  </>
                ) : null}
              </div>
              <div className="overflow-auto rounded border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Caspio field</th>
                      <th className="px-3 py-2">MIF value</th>
                      <th className="px-3 py-2">Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        caspio: 'Authorization_Number_T038',
                        label: 'Auth number',
                        value: authDetailRow.authorizationNumberT2038,
                      },
                      {
                        caspio: 'Authorization_Start_T2038',
                        label: 'Auth start',
                        value: authDetailRow.authorizationStartT2038,
                      },
                      {
                        caspio: 'Authorization_End_T2038',
                        label: 'Auth end',
                        value: authDetailRow.authorizationEndT2038,
                      },
                      {
                        caspio: 'Date Received Request for Authorization (MIF)',
                        label: 'Date received request',
                        value: authDetailRow.dateReceivedRequestForAuthorization,
                      },
                      {
                        caspio: 'Date of Referral Authorization Decision (MIF)',
                        label: 'Referral decision date',
                        value: authDetailRow.dateOfReferralAuthorizationDecision,
                      },
                    ].map((field) => (
                      <tr key={field.caspio} className="border-t align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{field.label}</div>
                          <div className="font-mono text-[11px] text-slate-500">{field.caspio}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{field.value || '—'}</td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={!String(field.value || '').trim()}
                            onClick={() => void copyText(field.label, field.value || '')}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Use <span className="font-medium">Push Pending → Authorized</span> to write these MIF auth values into
                Caspio and set CalAIM_Status to Authorized, or copy individual fields below.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAuthDetailRow(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
