'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { FileUp, Loader2, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { CoverSheetTemplateSummary } from '@/lib/kaiser-isp-cover-sheet-template';

type TemplateUpload = {
  id: string;
  fileName: string;
  uploadedAtIso: string;
  uploadedByEmail?: string;
  uploadedByName?: string;
  summary: CoverSheetTemplateSummary;
};

type TemplateState = {
  activeTemplateId: string | null;
  activatedAtIso: string | null;
  activatedByEmail: string | null;
  uploads: TemplateUpload[];
  builtInSummary: CoverSheetTemplateSummary | null;
};

const formatWhen = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : format(date, 'MMM d, yyyy h:mm a');
};

function TemplateFieldReport({ summary }: { summary: CoverSheetTemplateSummary }) {
  const dropdowns = summary.fields.filter((field) => field.type === 'dropdown' || field.type === 'list');
  const readOnly = summary.fields.filter((field) => field.readOnly);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{summary.pageCount} pages</Badge>
        <Badge variant="outline">{summary.fieldCount} fields</Badge>
        <Badge variant="outline">{summary.dropdownCount} dropdowns</Badge>
        {readOnly.length ? (
          <Badge variant="outline" className="border-amber-300 text-amber-800">
            {readOnly.length} read-only (generator unlocks them)
          </Badge>
        ) : null}
      </div>
      {summary.missingGeneratorFields.length ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <div className="font-medium">
            {summary.missingGeneratorFields.length} field(s) the generator fills were not found — those will stay blank
            until the mapping is updated:
          </div>
          <ul className="mt-1 list-disc pl-5">
            {summary.missingGeneratorFields.map((slot) => (
              <li key={`${slot.section}-${slot.label}`}>
                {slot.section}: {slot.label} <span className="text-xs">(expected {slot.acceptedNames.join(' or ')})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
          Every field the generator fills was found in this PDF.
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-medium">Dropdowns and options ({dropdowns.length})</summary>
        <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
          {dropdowns.map((field) => (
            <div key={field.name} className="rounded border p-2">
              <div className="font-mono text-xs">
                {field.page ? `p${field.page} · ` : ''}
                {field.name}
              </div>
              <div className="text-xs text-muted-foreground">{(field.options || []).join(' · ')}</div>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">All fields ({summary.fieldCount})</summary>
        <div className="mt-2 max-h-80 overflow-y-auto font-mono text-xs">
          {summary.fields.map((field) => (
            <div key={field.name}>
              {field.page ? `p${field.page} ` : ''}[{field.type}] {field.name}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function TemplateUploaderCard({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<TemplateState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/admin/kaiser-isp-cover-sheet-template', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setState(data as TemplateState);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load cover sheet templates', description: error?.message });
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken, toast]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (file: File) => {
    setIsUploading(true);
    try {
      const idToken = await getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/kaiser-isp-cover-sheet-template', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      toast({
        title: 'Cover sheet uploaded',
        description: `${data.fileName}: ${data.summary.fieldCount} fields, ${data.summary.dropdownCount} dropdowns. Not active yet.`,
      });
      setSelectedId(data.id);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: error?.message });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runAction = async (body: { action: 'activate'; id: string } | { action: 'revert' }) => {
    setBusyAction(body.action === 'activate' ? body.id : 'revert');
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/admin/kaiser-isp-cover-sheet-template', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      toast({
        title: body.action === 'activate' ? 'Template activated' : 'Using built-in template',
        description: 'New cover sheets will use this template.',
      });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not change template', description: error?.message });
    } finally {
      setBusyAction('');
    }
  };

  const uploads = state?.uploads || [];
  const active = uploads.find((upload) => upload.id === state?.activeTemplateId) || null;
  const selected = uploads.find((upload) => upload.id === selectedId) || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cover sheet template</CardTitle>
        <CardDescription>
          Upload a new fillable cover sheet PDF from Kaiser. It is checked for the fields and dropdowns the generator
          fills, and only used for new cover sheets after you activate it. Dropdowns stay editable in every generated
          PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">In use:</span>
          {active ? (
            <>
              <Badge>{active.fileName}</Badge>
              <span className="text-xs text-muted-foreground">
                activated {formatWhen(state?.activatedAtIso)}
                {state?.activatedByEmail ? ` by ${state.activatedByEmail}` : ''}
              </span>
            </>
          ) : (
            <Badge variant="secondary">Built-in template (public/Templates/Kaiser Cover Sheet.pdf)</Badge>
          )}
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            {isUploading ? 'Uploading…' : 'Upload new cover sheet PDF'}
          </Button>
          {active ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runAction({ action: 'revert' })}
              disabled={Boolean(busyAction)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Switch back to built-in template
            </Button>
          ) : null}
        </div>

        {uploads.length ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Uploaded templates</div>
            {uploads.map((upload) => {
              const isActive = upload.id === state?.activeTemplateId;
              const missing = upload.summary?.missingGeneratorFields?.length || 0;
              return (
                <div
                  key={upload.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                    selectedId === upload.id ? 'border-primary' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => setSelectedId(selectedId === upload.id ? '' : upload.id)}
                  >
                    <div className="font-medium">
                      {upload.fileName} {isActive ? <Badge className="ml-1">Active</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatWhen(upload.uploadedAtIso)} · {upload.uploadedByName || upload.uploadedByEmail || 'Staff'} ·{' '}
                      {upload.summary?.dropdownCount ?? 0} dropdowns ·{' '}
                      {missing ? `${missing} generator field(s) missing` : 'all generator fields found'}
                    </div>
                  </button>
                  {!isActive ? (
                    <Button
                      size="sm"
                      variant={missing ? 'outline' : 'default'}
                      onClick={() => void runAction({ action: 'activate', id: upload.id })}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === upload.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Use this template
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {selected?.summary ? (
          <TemplateFieldReport summary={selected.summary} />
        ) : !active && state?.builtInSummary ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Built-in template fields</summary>
            <div className="mt-2">
              <TemplateFieldReport summary={state.builtInSummary} />
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
