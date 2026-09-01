'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ClipboardList, ExternalLink, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_SW_ISP_TOOLS,
  SW_ISP_TOOLS_SETTINGS_DOC,
  type SwIspToolItem,
  normalizeSwIspToolsList,
  swIspToolsForFirestore,
} from '@/lib/sw-isp-tools';

const clean = (v: unknown) => String(v ?? '').trim();

export default function IspSwToolsAdminPage() {
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<SwIspToolItem[]>([...DEFAULT_SW_ISP_TOOLS]);
  const [newLabel, setNewLabel] = useState('');
  const [newHref, setNewHref] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'admin-settings', SW_ISP_TOOLS_SETTINGS_DOC));
        if (cancelled) return;
        if (!snap.exists()) {
          setItems([...DEFAULT_SW_ISP_TOOLS]);
          return;
        }
        setItems(normalizeSwIspToolsList((snap.data() as any)?.items));
      } catch (e: any) {
        toast({
          variant: 'destructive',
          title: 'Could not load SW ISP tools',
          description: String(e?.message || e),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firestore, toast]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    [items]
  );

  const persist = async (nextItems: SwIspToolItem[]) => {
    if (!firestore) return;
    setSaving(true);
    try {
      const normalized = normalizeSwIspToolsList(nextItems);
      await setDoc(
        doc(firestore, 'admin-settings', SW_ISP_TOOLS_SETTINGS_DOC),
        {
          items: swIspToolsForFirestore(normalized),
          updatedAt: serverTimestamp(),
          updatedByEmail: clean(auth?.currentUser?.email).toLowerCase() || null,
          updatedByName: clean(auth?.currentUser?.displayName) || null,
        },
        { merge: true }
      );
      setItems(normalized);
      toast({
        title: 'SW ISP Tools saved',
        description: 'Social worker portal ISP Tools menu will show active items.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: String(e?.message || e),
      });
    } finally {
      setSaving(false);
    }
  };

  const addLinkTool = async () => {
    const label = clean(newLabel);
    const href = clean(newHref);
    if (!label || !href) {
      toast({
        variant: 'destructive',
        title: 'Label and link required',
        description: 'Enter a menu label and an SW portal path or URL.',
      });
      return;
    }
    const next: SwIspToolItem = {
      id: `custom-${Date.now()}`,
      label,
      href,
      description: clean(newDescription) || undefined,
      active: true,
      sortOrder: (items.reduce((max, item) => Math.max(max, item.sortOrder), 0) || 0) + 10,
    };
    setNewLabel('');
    setNewHref('');
    setNewDescription('');
    await persist([...items, next]);
  };

  const uploadFileTool = async (file: File | null) => {
    if (!file || !auth?.currentUser) return;
    const label = clean(newLabel) || file.name.replace(/\.[^.]+$/, '');
    setUploading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const form = new FormData();
      form.append('file', file);
      form.append('label', label);
      if (clean(newDescription)) form.append('description', clean(newDescription));

      const res = await fetch('/api/admin/sw-isp-tools/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || `Upload failed (HTTP ${res.status})`));
      }

      const next: SwIspToolItem = {
        id: `upload-${Date.now()}`,
        label: clean(body.label) || label,
        href: clean(body.href),
        description: clean(body.description) || clean(newDescription) || `Uploaded file: ${file.name}`,
        active: true,
        sortOrder: (items.reduce((max, item) => Math.max(max, item.sortOrder), 0) || 0) + 10,
        fileName: clean(body.fileName) || file.name,
        storagePath: clean(body.storagePath) || undefined,
        uploadedAtIso: clean(body.uploadedAtIso) || new Date().toISOString(),
      };
      if (!next.href) throw new Error('Upload succeeded but no download link was returned');

      setNewLabel('');
      setNewDescription('');
      await persist([...items, next]);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: String(e?.message || e),
      });
    } finally {
      setUploading(false);
    }
  };

  const updateItem = (id: string, patch: Partial<SwIspToolItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>SW Portal ISP Tools</CardTitle>
                <Badge variant="outline">ISP Workflow</Badge>
              </div>
              <CardDescription className="mt-1.5">
                Manage the Social Worker portal <span className="font-medium">ISP Tools</span> menu. Add portal links
                or upload files (PDF/docs) social workers can open from that menu.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-workflow">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  ISP Workflow
                </Link>
              </Button>
              <Button size="sm" onClick={() => void persist(items)} disabled={saving || loading}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save menu
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tools…
            </div>
          ) : (
            <>
              <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                <div className="text-sm font-medium">Add tool</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Menu label</label>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. ISP Cover Sheet Guide"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Link (optional if uploading a file)</label>
                    <Input
                      value={newHref}
                      onChange={(e) => setNewHref(e.target.value)}
                      placeholder="/sw-portal/... or https://..."
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Description (optional)</label>
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={2}
                    placeholder="Short note shown under the menu item"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void addLinkTool()} disabled={saving}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add link tool
                  </Button>
                  <Button type="button" variant="outline" disabled={uploading || saving} asChild>
                    <label className="cursor-pointer">
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Upload file tool
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.target.value = '';
                          void uploadFileTool(file);
                        }}
                      />
                    </label>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {sortedItems.map((item) => (
                  <div key={item.id} className="rounded-md border bg-white p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={item.label}
                          onChange={(e) => updateItem(item.id, { label: e.target.value })}
                          className="font-medium"
                        />
                        <Input
                          value={item.href}
                          onChange={(e) => updateItem(item.id, { href: e.target.value })}
                          className="text-xs"
                        />
                        <Input
                          value={item.description || ''}
                          onChange={(e) => updateItem(item.id, { description: e.target.value })}
                          placeholder="Description"
                          className="text-xs"
                        />
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <label className="inline-flex items-center gap-2">
                            Sort
                            <Input
                              type="number"
                              className="h-8 w-20"
                              value={item.sortOrder}
                              onChange={(e) => updateItem(item.id, { sortOrder: Number(e.target.value) || 0 })}
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <Checkbox
                              checked={item.active}
                              onCheckedChange={(checked) => updateItem(item.id, { active: checked === true })}
                            />
                            Show in SW portal
                          </label>
                          {item.fileName ? <span>File: {item.fileName}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a href={item.href} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void persist(items.filter((row) => row.id !== item.id))}
                          disabled={saving}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
