'use client';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw, RefreshCw, Check } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { type Dispatch, type SetStateAction } from 'react';

export interface CaspioReversePullQuickActionProps {
  isReversePullPreviewOpen: boolean;
  setIsReversePullPreviewOpen: Dispatch<SetStateAction<boolean>>;
  openReversePullPreview: (applicationOverride?: Record<string, any> | undefined) => Promise<void>;
  isLoadingReversePullPreview: boolean;
  reversePullPreview: { mappingSource: string; summary: { totalMapped: number; missing: number; fillEmpty: number; overwrite: number; unchanged: number; }; preview: { items: { csField: string; targetCsField: string; caspioField: string; currentValue: string; incomingValue: string; status: "missing" | "fill_empty" | "overwrite" | "unchanged"; }[]; safePatch: Record<string, string>; fullPatch: Record<string, string>; }; } | null;
  reversePullWillUpdateItems: { csField: string; targetCsField: string; caspioField: string; currentValue: string; incomingValue: string; status: "missing" | "fill_empty" | "overwrite" | "unchanged"; }[];
  reversePullIncludeOverwrites: boolean;
  setReversePullIncludeOverwrites: Dispatch<SetStateAction<boolean>>;
  reversePullShowWillUpdateOnly: boolean;
  setReversePullShowWillUpdateOnly: Dispatch<SetStateAction<boolean>>;
  setReversePullShowOnlyMissing: Dispatch<SetStateAction<boolean>>;
  reversePullShowOnlyMissing: boolean;
  reversePullVisibleItems: { csField: string; targetCsField: string; caspioField: string; currentValue: string; incomingValue: string; status: "missing" | "fill_empty" | "overwrite" | "unchanged"; }[];
  applyReversePullPreview: (mode?: "overwrite" | "safe" | undefined) => Promise<void>;
  isApplyingReversePullPreview: boolean;
  setReversePullConfirmOverwriteOpen: Dispatch<SetStateAction<boolean>>;
  reversePullConfirmOverwriteOpen: boolean;
  reversePullOverwriteItems: { csField: string; targetCsField: string; caspioField: string; currentValue: string; incomingValue: string; status: "missing" | "fill_empty" | "overwrite" | "unchanged"; }[];
  applyReversePullWithOverwrite: () => Promise<void>;
}

export function CaspioReversePullQuickAction({
  isReversePullPreviewOpen,
  setIsReversePullPreviewOpen,
  openReversePullPreview,
  isLoadingReversePullPreview,
  reversePullPreview,
  reversePullWillUpdateItems,
  reversePullIncludeOverwrites,
  setReversePullIncludeOverwrites,
  reversePullShowWillUpdateOnly,
  setReversePullShowWillUpdateOnly,
  setReversePullShowOnlyMissing,
  reversePullShowOnlyMissing,
  reversePullVisibleItems,
  applyReversePullPreview,
  isApplyingReversePullPreview,
  setReversePullConfirmOverwriteOpen,
  reversePullConfirmOverwriteOpen,
  reversePullOverwriteItems,
  applyReversePullWithOverwrite,
}: CaspioReversePullQuickActionProps) {
  return (
    <div className="order-[10]">
    <Dialog open={isReversePullPreviewOpen} onOpenChange={setIsReversePullPreviewOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="qa-trigger"
          onClick={() => {
            if (!isReversePullPreviewOpen) {
              void openReversePullPreview();
            }
          }}
        >
          {isLoadingReversePullPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          <span className="qa-label">Precheck Caspio → CS Summary pull</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Precheck Caspio → CS Summary pull</DialogTitle>
          <DialogDescription>
            Review exactly which CS Summary fields will change before applying Caspio values.
            Nothing is written until you click Apply.
          </DialogDescription>
        </DialogHeader>
        {isLoadingReversePullPreview ? (
          <div className="py-8 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building reverse pull preview...
          </div>
        ) : reversePullPreview ? (
          <div className="space-y-4">
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <AlertTitle>
                Fields this action will update:{' '}
                {reversePullWillUpdateItems.length}
              </AlertTitle>
              <AlertDescription className="space-y-2 text-xs">
                <div>
                  Safe apply fills empty fields only ({reversePullPreview.summary.fillEmpty}).
                  Overwrite mode also replaces existing values ({reversePullPreview.summary.overwrite}).
                </div>
                {reversePullWillUpdateItems.length === 0 ? (
                  <div className="font-medium">
                    No CS Summary fields will change with the current settings.
                  </div>
                ) : (
                  <div className="max-h-[180px] overflow-auto rounded border border-emerald-200 bg-white">
                    <div className="grid grid-cols-4 gap-2 border-b bg-emerald-50/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      <div>CS Summary field</div>
                      <div>Current on form</div>
                      <div>Will become</div>
                      <div>Action</div>
                    </div>
                    {reversePullWillUpdateItems.map((item, index) => (
                      <div
                        key={`will-update-${item.targetCsField || item.csField}-${index}`}
                        className="grid grid-cols-4 gap-2 border-b px-2 py-1.5 text-[11px]"
                      >
                        <div className="font-medium">{item.targetCsField || item.csField}</div>
                        <div className="truncate text-muted-foreground" title={item.currentValue || '(empty)'}>
                          {item.currentValue || '(empty)'}
                        </div>
                        <div className="truncate font-medium" title={item.incomingValue || '—'}>
                          {item.incomingValue || '—'}
                        </div>
                        <div>
                          {item.status === 'fill_empty' ? 'Fill empty' : 'Overwrite'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 md:grid-cols-5 text-xs">
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-muted-foreground">Checked fields</div>
                <div className="font-semibold">{reversePullPreview.summary.totalMapped}</div>
              </div>
              <div className="rounded border bg-emerald-50 p-2">
                <div className="text-emerald-700">Fill Empty</div>
                <div className="font-semibold text-emerald-800">{reversePullPreview.summary.fillEmpty}</div>
              </div>
              <div className="rounded border bg-amber-50 p-2">
                <div className="text-amber-700">Would Overwrite</div>
                <div className="font-semibold text-amber-800">{reversePullPreview.summary.overwrite}</div>
              </div>
              <div className="rounded border bg-slate-50 p-2">
                <div className="text-slate-700">Unchanged</div>
                <div className="font-semibold text-slate-800">{reversePullPreview.summary.unchanged}</div>
              </div>
              <div className="rounded border bg-rose-50 p-2">
                <div className="text-rose-700">Missing in Caspio</div>
                <div className="font-semibold text-rose-800">{reversePullPreview.summary.missing}</div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Include overwrite candidates</div>
                <div className="text-xs text-muted-foreground">
                  Off = only empty CS Summary fields. On = also show fields that already have values.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={reversePullIncludeOverwrites}
                  onCheckedChange={(checked) => setReversePullIncludeOverwrites(Boolean(checked))}
                />
                <span className="text-xs">
                  Include overwrites ({reversePullPreview.summary.overwrite})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Show only fields that will update</div>
                <div className="text-xs text-muted-foreground">
                  Hides unchanged / missing-in-Caspio rows so the list matches what Apply will write.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={reversePullShowWillUpdateOnly}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked);
                    setReversePullShowWillUpdateOnly(next);
                    if (next) setReversePullShowOnlyMissing(false);
                  }}
                />
                <span className="text-xs">Will update only</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Show only fill-empty rows</div>
                <div className="text-xs text-muted-foreground">
                  Narrower filter: only blank CS Summary fields Caspio can fill.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={reversePullShowOnlyMissing}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked);
                    setReversePullShowOnlyMissing(next);
                    if (next) setReversePullShowWillUpdateOnly(false);
                  }}
                />
                <span className="text-xs">
                  Only missing from CS Summary
                </span>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-5 gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <div>CS field</div>
                <div>Caspio field</div>
                <div>Current</div>
                <div>Incoming</div>
                <div>Status</div>
              </div>
              <div className="max-h-[320px] overflow-auto">
                {reversePullVisibleItems.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    {reversePullShowOnlyMissing
                      ? 'No missing CS Summary fields are available from Caspio in this preview.'
                      : reversePullShowWillUpdateOnly
                        ? 'No fields will update with the current settings.'
                      : 'No fields available in this preview.'}
                  </div>
                ) : reversePullVisibleItems.map((item, index) => (
                  <div key={`${item.csField}-${item.caspioField}-${index}`} className="grid grid-cols-5 gap-2 border-b px-3 py-2 text-xs">
                    <div className="font-medium">
                      {item.targetCsField || item.csField}
                      {item.targetCsField && item.targetCsField !== item.csField ? (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {`mapped from ${item.csField}`}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground">{item.caspioField}</div>
                    <div className="truncate" title={item.currentValue || '(empty)'}>
                      {item.currentValue || '(empty)'}
                    </div>
                    <div className="truncate" title={item.incomingValue || 'No value from Caspio'}>
                      {item.incomingValue || '—'}
                    </div>
                    <div>
                      <Badge
                        variant="outline"
                        className={
                          item.status === 'fill_empty'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : item.status === 'overwrite'
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : item.status === 'unchanged'
                                ? 'border-slate-300 bg-slate-50 text-slate-700'
                                : 'border-rose-300 bg-rose-50 text-rose-700'
                        }
                      >
                        {item.status === 'fill_empty'
                          ? 'Fill empty'
                          : item.status === 'overwrite'
                            ? 'Overwrite'
                            : item.status === 'unchanged'
                              ? 'Unchanged'
                              : 'Missing'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Source: {reversePullPreview.mappingSource === 'local-preview' ? 'local locked preview mapping' : 'shared locked mapping'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openReversePullPreview()}
                  disabled={isLoadingReversePullPreview}
                >
                  {isLoadingReversePullPreview ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh precheck
                </Button>
                <Button
                  size="sm"
                  onClick={() => void applyReversePullPreview('safe')}
                  disabled={isApplyingReversePullPreview || reversePullPreview.summary.fillEmpty <= 0}
                >
                  {isApplyingReversePullPreview ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Apply {reversePullPreview.summary.fillEmpty} empty field{reversePullPreview.summary.fillEmpty === 1 ? '' : 's'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setReversePullConfirmOverwriteOpen(true)}
                  disabled={isApplyingReversePullPreview || reversePullPreview.summary.overwrite <= 0}
                >
                  Overwrite {reversePullPreview.summary.overwrite} existing field{reversePullPreview.summary.overwrite === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
            <AlertDialog open={reversePullConfirmOverwriteOpen} onOpenChange={setReversePullConfirmOverwriteOpen}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Overwrite existing CS Summary values?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        This will replace existing CS Summary fields with Caspio values for this member.
                        Overwrite candidates: {reversePullPreview.summary.overwrite}.
                      </p>
                      {reversePullOverwriteItems.length > 0 ? (
                        <div className="max-h-[220px] overflow-auto rounded border bg-background text-foreground">
                          <div className="grid grid-cols-3 gap-2 border-b bg-muted/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <div>Field</div>
                            <div>Current</div>
                            <div>Will become</div>
                          </div>
                          {reversePullOverwriteItems.map((item, index) => (
                            <div
                              key={`overwrite-confirm-${item.targetCsField || item.csField}-${index}`}
                              className="grid grid-cols-3 gap-2 border-b px-2 py-1.5 text-[11px]"
                            >
                              <div className="font-medium">{item.targetCsField || item.csField}</div>
                              <div className="truncate" title={item.currentValue}>{item.currentValue || '(empty)'}</div>
                              <div className="truncate font-medium" title={item.incomingValue}>{item.incomingValue || '—'}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isApplyingReversePullPreview}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      void applyReversePullWithOverwrite().finally(() => setReversePullConfirmOverwriteOpen(false));
                    }}
                    disabled={isApplyingReversePullPreview}
                  >
                    {isApplyingReversePullPreview ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Applying...
                      </span>
                    ) : (
                      'Confirm Overwrite'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">
            Open this dialog to run a precheck before applying Caspio values.
          </div>
        )}
      </DialogContent>
    </Dialog>
    </div>
  );
}
