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
} from 'lucide-react';
import {
  collection,
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
import {
  annotateIlsMifRowsWithCaspioMembers,
  buildIlsMifDedupeKey,
  dedupeIlsMifMasterRows,
  downloadIlsMifMasterAsCsMifWorkbook,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_CONSOLIDATOR_HANDOFF_KEY,
  ILS_MIF_DECLINED_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_UPLOADED_FILES_COLLECTION,
  IlsMifMasterRow,
  IlsMifUploadedFileRecord,
  isNorthernCounty,
  masterRowToCreateAppImportShape,
  parseIlsMifSpreadsheetFile,
} from '@/lib/ils-mif-parse';
import { ILS_DECISION_CC, ILS_DECISION_TO } from '@/lib/ils-decision-email';

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
  actedByEmail: string;
};

export default function IlsMifConsolidatorPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<IlsMifMasterRow[]>([]);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [queryText, setQueryText] = useState('');
  const [filter, setFilter] = useState<FilterMode>('new');
  const [northernOnly, setNorthernOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isSendingDeclines, setIsSendingDeclines] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [lastMatchedLabel, setLastMatchedLabel] = useState('');
  const [activeRunId, setActiveRunId] = useState('');
  const [runs, setRuns] = useState<ConsolidationRunSummary[]>([]);
  const [declinedMembers, setDeclinedMembers] = useState<DeclinedMemberRecord[]>([]);
  const [declinedKeys, setDeclinedKeys] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<IlsMifUploadedFileRecord[]>([]);
  const [masterListCreatedAtIso, setMasterListCreatedAtIso] = useState('');

  const memberKey = (row: Pick<IlsMifMasterRow, 'memberMrn' | 'memberMediCalNum' | 'memberFirstName' | 'memberLastName'>) =>
    buildIlsMifDedupeKey(row);

  const totals = useMemo(() => {
    const unique = rows.filter((r) => r.mergeStatus === 'unique').length;
    const caspio = rows.filter((r) => r.mergeStatus === 'already_in_caspio').length;
    const duplicates = rows.filter((r) => r.mergeStatus === 'duplicate_in_batch').length;
    const incomplete = rows.filter((r) => r.mergeStatus === 'incomplete').length;
    const northern = rows.filter((r) => isNorthernCounty(r.memberCounty)).length;
    const declined = rows.filter((r) => declinedKeys.has(memberKey(r))).length;
    return { total: rows.length, unique, caspio, duplicates, incomplete, northern, declined };
  }, [rows, declinedKeys]);

  const visibleRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return rows.filter((row) => {
      if (northernOnly && !isNorthernCounty(row.memberCounty)) return false;
      if (filter === 'new' && row.mergeStatus !== 'unique') return false;
      if (filter === 'caspio' && row.mergeStatus !== 'already_in_caspio') return false;
      if (filter === 'duplicates' && row.mergeStatus !== 'duplicate_in_batch') return false;
      if (filter === 'incomplete' && row.mergeStatus !== 'incomplete') return false;
      if (filter === 'northern' && !isNorthernCounty(row.memberCounty)) return false;
      if (filter === 'declined' && !declinedKeys.has(memberKey(row))) return false;
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
  }, [rows, filter, queryText, northernOnly, declinedKeys]);

  const selectedNorthernForDecline = useMemo(
    () =>
      rows.filter(
        (row) =>
          selected[row.rowId] &&
          isNorthernCounty(row.memberCounty) &&
          !declinedKeys.has(memberKey(row))
      ),
    [rows, selected, declinedKeys]
  );

  const selectedNewRows = useMemo(
    () =>
      rows.filter(
        (row) => selected[row.rowId] && row.mergeStatus === 'unique' && !row.caspioExists
      ),
    [rows, selected]
  );

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
          actedByEmail: String(data.actedByEmail || ''),
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
        });
      });
      setUploadedFiles(nextUploads);

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
    setSelected((prev) => {
      const next = { ...prev };
      combined.forEach((row) => {
        if (next[row.rowId] === undefined) {
          next[row.rowId] = row.mergeStatus === 'unique';
        }
      });
      return next;
    });
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
    try {
      const parsedBatches: IlsMifMasterRow[] = [];
      const names: string[] = [];
      for (const file of files) {
        const parsed = await parseIlsMifSpreadsheetFile(file);
        if (!parsed.length) continue;
        parsedBatches.push(...parsed);
        names.push(file.name);
      }
      if (!parsedBatches.length) {
        throw new Error('No usable member rows found in the uploaded spreadsheets.');
      }
      setSourceFiles((prev) => Array.from(new Set([...prev, ...names])));
      mergeParsedRows(parsedBatches);

      if (firestore) {
        const uploadedAtIso = new Date().toISOString();
        for (const file of files) {
          const parsedForFile = parsedBatches.filter((row) => row.sourceFileName === file.name);
          const safeId = `${Date.now()}_${file.name}`.replace(/[\/#?[\]]/g, '_').slice(0, 700);
          await setDoc(
            doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, safeId),
            {
              fileName: file.name,
              uploadedAtIso,
              uploadedAtServer: serverTimestamp(),
              rowCount: parsedForFile.length,
              uploadedBy: user?.email || user?.uid || '',
              runId: '',
            },
            { merge: true }
          );
        }
        await loadRunsAndDeclined();
      }

      toast({
        title: 'MIF files parsed',
        description: `Added ${parsedBatches.length} rows from ${names.length} file(s). Uploads are saved for reference. Click Check Caspio next.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to parse MIF files',
        description: String(error?.message || 'Unknown parse error'),
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const checkCaspio = async () => {
    if (!rows.length) {
      toast({
        variant: 'destructive',
        title: 'Nothing to check',
        description: 'Upload MIF spreadsheets first.',
      });
      return;
    }
    setIsMatching(true);
    try {
      const response = await fetch('/api/kaiser-members?source=cache', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
        throw new Error(data?.error || `Failed to load Caspio members (HTTP ${response.status})`);
      }
      const deduped = dedupeIlsMifMasterRows(rows);
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
      const newCount = annotated.filter((r) => r.mergeStatus === 'unique').length;
      const caspioCount = annotated.filter((r) => r.mergeStatus === 'already_in_caspio').length;
      toast({
        title: 'Caspio check complete',
        description: `${newCount} new · ${caspioCount} already in Caspio · ${annotated.length} total`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Caspio check failed',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsMatching(false);
    }
  };

  const saveMasterListAndRun = async () => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    if (!rows.length) {
      toast({ variant: 'destructive', title: 'Nothing to save', description: 'Upload and check members first.' });
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date();
      const createdAtIso = now.toISOString();
      const runId = `run_${now.getTime()}`;
      const runLabel = now.toLocaleString();
      const northern = rows.filter((r) => isNorthernCounty(r.memberCounty)).length;
      const runTotals = { ...totals, northern };
      const newMembers = rows.filter((r) => r.mergeStatus === 'unique' && !r.caspioExists);

      const CHUNK = 400;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const batch = writeBatch(firestore);
        if (i === 0) {
          batch.set(
            doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'),
            {
              updatedAt: createdAtIso,
              updatedAtServer: serverTimestamp(),
              updatedBy: user?.email || user?.uid || '',
              sourceFiles,
              totals: runTotals,
              memberCount: rows.length,
              latestRunId: runId,
              latestRunAtIso: createdAtIso,
            },
            { merge: true }
          );
          batch.set(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, runId), {
            createdAtIso,
            createdAtServer: serverTimestamp(),
            label: runLabel,
            sourceFiles,
            totals: runTotals,
            newMemberCount: newMembers.length,
            createdBy: user?.email || user?.uid || '',
            memberKeys: newMembers.map((row) => buildIlsMifDedupeKey(row)),
          });
          // Attach recent unassigned uploads to this run.
          uploadedFiles
            .filter((file) => !file.runId && sourceFiles.includes(file.fileName))
            .forEach((file) => {
              batch.set(
                doc(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION, file.id),
                {
                  runId,
                  linkedRunAtIso: createdAtIso,
                },
                { merge: true }
              );
            });
        }
        chunk.forEach((row) => {
          const key = buildIlsMifDedupeKey(row).replace(/[\/#?[\]]/g, '_').slice(0, 700);
          batch.set(
            doc(firestore, ILS_MIF_MASTER_COLLECTION, key || row.rowId),
            {
              ...row,
              dedupeKey: key,
              runId,
              runAtIso: createdAtIso,
              updatedAt: createdAtIso,
              updatedBy: user?.email || user?.uid || '',
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      setActiveRunId(runId);
      setMasterListCreatedAtIso(createdAtIso);
      await loadRunsAndDeclined();
      toast({
        title: 'Consolidation run saved',
        description: `Master list created ${runLabel}. Create Application can pull new members from this dated run.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to save consolidation run',
        description: String(error?.message || 'Unknown error'),
      });
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
      const snap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      const loaded: IlsMifMasterRow[] = [];
      const files = new Set<string>();
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
        if (runId && String(data.runId || '') !== runId) return;
        loaded.push({
          ...data,
          rowId: data.rowId || docSnap.id,
        });
        if (data.sourceFileName) files.add(data.sourceFileName);
      });
      if (!loaded.length) {
        toast({
          title: 'No saved members found',
          description: runId
            ? 'That consolidation run has no saved member rows.'
            : 'Upload MIF files and save a consolidation run first.',
        });
        return;
      }
      const deduped = dedupeIlsMifMasterRows(loaded);
      setRows(deduped);
      setSourceFiles(Array.from(files));
      setActiveRunId(runId || '');
      setSelected(() => {
        const next: Record<string, boolean> = {};
        deduped.forEach((row) => {
          next[row.rowId] = row.mergeStatus === 'unique';
        });
        return next;
      });
      toast({
        title: runId ? 'Consolidation run loaded' : 'Saved master list loaded',
        description: `${deduped.length} members loaded.`,
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

  const bulkSendNorthernDeclines = async () => {
    // Prefer explicitly selected northern rows; otherwise use visible northern rows.
    const toSend =
      selectedNorthernForDecline.length > 0
        ? selectedNorthernForDecline
        : visibleRows.filter(
            (row) => isNorthernCounty(row.memberCounty) && !declinedKeys.has(memberKey(row))
          );

    if (!toSend.length) {
      toast({
        variant: 'destructive',
        title: 'No northern members to decline',
        description: 'Filter Northern Counties, select members, then bulk send denials.',
      });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required' });
      return;
    }

    setIsSendingDeclines(true);
    let sent = 0;
    let failed = 0;
    try {
      const idToken = await user.getIdToken();
      for (const row of toSend) {
        const memberName = `${row.memberFirstName} ${row.memberLastName}`.trim();
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
                emailSubject: String(body?.log?.subject || ''),
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

  const sendSelectedToCreateApplication = (runId?: string) => {
    const payloadRows = selectedNewRows.length
      ? selectedNewRows
      : rows.filter((row) => row.mergeStatus === 'unique' && !row.caspioExists);
    if (!payloadRows.length) {
      toast({
        variant: 'destructive',
        title: 'No new members selected',
        description: 'Select members marked New (not in Caspio), then try again.',
      });
      return;
    }
    try {
      const handoff = {
        createdAt: new Date().toISOString(),
        sourceFiles,
        runId: runId || activeRunId || '',
        rows: payloadRows.map(masterRowToCreateAppImportShape),
      };
      window.sessionStorage.setItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY, JSON.stringify(handoff));
      toast({
        title: 'Ready for Create Application',
        description: `${payloadRows.length} new members staged. Open Create Application to parse each row, create the skeleton, and assign staff.`,
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
    if (row.mergeStatus === 'already_in_caspio') {
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">In Caspio</Badge>;
    }
    if (row.mergeStatus === 'duplicate_in_batch') {
      return <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-200">Batch duplicate</Badge>;
    }
    if (row.mergeStatus === 'incomplete') {
      return <Badge variant="destructive">Incomplete</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">New</Badge>;
  };

  const clickableStat = (
    mode: FilterMode,
    label: string,
    value: number,
    className: string
  ) => (
    <button
      type="button"
      onClick={() => {
        setFilter(mode);
        if (mode === 'northern') setNorthernOnly(true);
        else if (mode !== 'all') setNorthernOnly(false);
      }}
      className={`rounded-lg border bg-white p-3 text-left transition hover:border-slate-400 hover:shadow-sm ${
        filter === mode ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${className}`}>{value}</div>
      <div className="mt-1 text-[11px] text-blue-700">Click to view list</div>
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
            Upload multiple MIF spreadsheets, skip Caspio duplicates, decline northern-county members by email, and send
            remaining new members into Create Application for skeleton create + staff assignment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={(event) => void handleUploadFiles(event.target.files)}
            />
            <Button variant="outline" size="sm" disabled={isParsing} onClick={() => fileInputRef.current?.click()}>
              {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload MIF Spreadsheets
            </Button>
            <Button variant="outline" size="sm" disabled={isMatching || !rows.length} onClick={() => void checkCaspio()}>
              {isMatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Check Caspio
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving || !rows.length}
              onClick={() => void saveMasterListAndRun()}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Dated Consolidation Run
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
              disabled={isLoadingSaved}
              onClick={() => void loadSavedMasterList()}
            >
              {isLoadingSaved ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Load Latest Master List
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSendingDeclines || !rows.length}
              onClick={() => void bulkSendNorthernDeclines()}
            >
              {isSendingDeclines ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Bulk Send Northern Denials
            </Button>
            <Button size="sm" disabled={!rows.length} onClick={() => sendSelectedToCreateApplication()}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Send New Members to Create Application
            </Button>
          </div>

          <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Decline emails go <span className="font-medium">To</span> {ILS_DECISION_TO[0]} and always{' '}
            <span className="font-medium">CC</span> {ILS_DECISION_CC[0]}. Subject uses member name + MRN.
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>Session files: {sourceFiles.length ? sourceFiles.join(', ') : 'None yet'}</span>
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

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {clickableStat('all', 'Total', totals.total, '')}
            {clickableStat('new', 'New (not in Caspio)', totals.unique, 'text-emerald-700')}
            {clickableStat('caspio', 'Already in Caspio', totals.caspio, 'text-amber-700')}
            {clickableStat('duplicates', 'Batch duplicates', totals.duplicates, '')}
            {clickableStat('incomplete', 'Incomplete', totals.incomplete, 'text-red-700')}
            {clickableStat('northern', 'Northern counties', totals.northern, 'text-indigo-700')}
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
              onClick={() => {
                setNorthernOnly((prev) => !prev);
                setFilter('northern');
              }}
            >
              <MapPin className="mr-1 h-4 w-4" />
              Northern Counties (Fresno north)
            </Button>
            {(
              [
                ['new', 'New'],
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
                onClick={() => {
                  setFilter(value);
                  if (value !== 'northern') setNorthernOnly(false);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Uploaded MIF Files
          </CardTitle>
          <CardDescription>
            Reference list of MIF spreadsheets already uploaded, with upload date and row counts.
            {masterListCreatedAtIso
              ? ` Latest master consolidator list created ${new Date(masterListCreatedAtIso).toLocaleString()}.`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[260px] overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2">Linked run</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {uploadedFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No uploaded MIF files saved yet.
                    </td>
                  </tr>
                ) : (
                  uploadedFiles.map((file) => (
                    <tr key={file.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{file.fileName}</td>
                      <td className="px-3 py-2">
                        {file.uploadedAtIso ? new Date(file.uploadedAtIso).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2">{file.rowCount || 0}</td>
                      <td className="px-3 py-2 text-muted-foreground">{file.runId || 'Not linked yet'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{file.uploadedBy || '—'}</td>
                    </tr>
                  ))
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
            Each save stores a dated run. Create Application can pull new (not-in-Caspio) members from a run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved runs yet.</div>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{run.label || run.createdAtIso}</div>
                  <div className="text-xs text-muted-foreground">
                    {run.newMemberCount} new · {run.totals.caspio} in Caspio · {run.totals.total} total
                    {run.sourceFiles.length ? ` · ${run.sourceFiles.length} file(s)` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isLoadingSaved}
                    onClick={() => void loadSavedMasterList(run.id)}
                  >
                    Open Run
                  </Button>
                  <Button size="sm" onClick={() => sendSelectedToCreateApplication(run.id)}>
                    Send New to Create App
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {filter === 'declined' ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Declined Members List</CardTitle>
            <CardDescription>
              Members emailed to ILS as out-of-county declines. Always CC {ILS_DECISION_CC[0]}.
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
                  </tr>
                </thead>
                <tbody>
                  {declinedMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
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
                      const canSelectCreate = row.mergeStatus === 'unique' && !row.caspioExists;
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
    </div>
  );
}
