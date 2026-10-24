'use client';

import { Button } from '@/components/ui/button';
import { Loader2, Download, ExternalLink, Mail, Undo2, Trash2, RefreshCw } from 'lucide-react';
import { type IlsMifMasterRow } from '@/lib/ils-mif-parse';

export interface MasterRowsToolbarProps {
  visibleRows: IlsMifMasterRow[];
  selectAllVisibleMasterRows: () => void;
  selectedVisibleRows: IlsMifMasterRow[];
  deselectVisibleMasterRows: () => void;
  selected: Record<string, boolean>;
  deselectAllMasterRows: () => void;
  isDownloadingServiceDeliveryPdf: boolean;
  selectedServiceDeliveryRows: IlsMifMasterRow[];
  downloadServiceDeliveryPdfForMembers: (targetRows: IlsMifMasterRow[]) => Promise<void>;
  hasCheckedCaspio: boolean;
  isSaving: boolean;
  isParsing: boolean;
  isMatching: boolean;
  selectedNewRows: IlsMifMasterRow[];
  remainingNewForCreateApp: IlsMifMasterRow[];
  sendSelectedToCreateApplication: (runId?: string | undefined, options?: { rows?: IlsMifMasterRow[] | undefined; autoParseRowId?: string | undefined; } | undefined) => Promise<void>;
  isSendingDeclines: boolean;
  isCheckingDeclineCaspio: boolean;
  selectedNorthernForDecline: IlsMifMasterRow[];
  totals: { total: number; unique: number; createApp: number; caspio: number; notInCaspioAll: number; alreadyHaveSkeleton: number; caspioPending: number; needsAuthorized: number; needsT2038Received: number; statusUpdates: number; duplicateSpreadsheetLines: number; incomplete: number; northern: number; northernNeedingDenial: number; declined: number; };
  openNorthernDeclineComposer: () => void;
  isUndeclining: boolean;
  selectedDeclinedRows: IlsMifMasterRow[];
  undeclineSelectedMembers: () => Promise<void>;
  isRemovingSelected: boolean;
  isRestoringRemoved: boolean;
  removeSelectedFromSessionList: () => Promise<void>;
  removedKeys: Set<string>;
  activeRunId: string;
  restoreRemovedAndStartOver: (runId?: string | undefined) => Promise<void>;
}

export function MasterRowsToolbar({
  visibleRows,
  selectAllVisibleMasterRows,
  selectedVisibleRows,
  deselectVisibleMasterRows,
  selected,
  deselectAllMasterRows,
  isDownloadingServiceDeliveryPdf,
  selectedServiceDeliveryRows,
  downloadServiceDeliveryPdfForMembers,
  hasCheckedCaspio,
  isSaving,
  isParsing,
  isMatching,
  selectedNewRows,
  remainingNewForCreateApp,
  sendSelectedToCreateApplication,
  isSendingDeclines,
  isCheckingDeclineCaspio,
  selectedNorthernForDecline,
  totals,
  openNorthernDeclineComposer,
  isUndeclining,
  selectedDeclinedRows,
  undeclineSelectedMembers,
  isRemovingSelected,
  isRestoringRemoved,
  removeSelectedFromSessionList,
  removedKeys,
  activeRunId,
  restoreRemovedAndStartOver,
}: MasterRowsToolbarProps) {
  return (
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
        className="h-8"
        disabled={
          isDownloadingServiceDeliveryPdf ||
          !selectedServiceDeliveryRows.length
        }
        title="Generate & download Service Delivery Form PDF(s) from selected members’ MIF data"
        onClick={() => void downloadServiceDeliveryPdfForMembers(selectedServiceDeliveryRows)}
      >
        {isDownloadingServiceDeliveryPdf ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="mr-1 h-3.5 w-3.5" />
        )}
        Service Delivery Form
        {selectedServiceDeliveryRows.length ? ` (${selectedServiceDeliveryRows.length})` : ''}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="default"
        className="h-8"
        disabled={
          !hasCheckedCaspio ||
          isSaving ||
          isParsing ||
          isMatching ||
          (selectedNewRows.length === 0 && remainingNewForCreateApp.length === 0)
        }
        title={
          selectedNewRows.length
            ? `Send ${selectedNewRows.length} selected Create App candidate(s) to Create Application (Parse Row there)`
            : remainingNewForCreateApp.length
              ? `Send all ${remainingNewForCreateApp.length} remaining Create App candidate(s)`
              : 'No Create App candidates (not in Caspio, no skeleton)'
        }
        onClick={() => void sendSelectedToCreateApplication()}
      >
        <ExternalLink className="mr-1 h-3.5 w-3.5" />
        Send to Create App
        {selectedNewRows.length
          ? ` (${selectedNewRows.length} selected)`
          : remainingNewForCreateApp.length
            ? ` (${remainingNewForCreateApp.length})`
            : ''}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={
          isSendingDeclines ||
          isCheckingDeclineCaspio ||
          !hasCheckedCaspio ||
          (selectedNorthernForDecline.length === 0 && totals.northern < 1)
        }
        title={
          selectedNorthernForDecline.length
            ? `Live Caspio check, then email ILS denial for ${selectedNorthernForDecline.length} selected northern member(s)`
            : totals.northern
              ? `Live Caspio check, then include all ${totals.northern} northern not-in-Caspio member(s)`
              : 'Select northern Not in Caspio members, or open Northern not in Caspio filter'
        }
        onClick={() => openNorthernDeclineComposer()}
      >
        {isSendingDeclines || isCheckingDeclineCaspio ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Mail className="mr-1 h-3.5 w-3.5" />
        )}
        {isCheckingDeclineCaspio ? 'Checking Caspio…' : 'Bulk Email Denial'}
        {!isCheckingDeclineCaspio && selectedNorthernForDecline.length
          ? ` (${selectedNorthernForDecline.length})`
          : !isCheckingDeclineCaspio && totals.northern
            ? ` (${totals.northern})`
            : ''}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 text-sky-800"
        disabled={isUndeclining || selectedDeclinedRows.length === 0}
        title={
          selectedDeclinedRows.length
            ? `Remove Declined status for ${selectedDeclinedRows.length} selected member(s)`
            : 'Select Declined member(s) first'
        }
        onClick={() => void undeclineSelectedMembers()}
      >
        {isUndeclining ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Undo2 className="mr-1 h-3.5 w-3.5" />
        )}
        Undecline selected
        {selectedDeclinedRows.length ? ` (${selectedDeclinedRows.length})` : ''}
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
  );
}
