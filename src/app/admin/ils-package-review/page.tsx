'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type PackageRow = {
  id: string;
  memberName: string;
  memberMrn: string;
  packageType: 'initial' | 'reassessment';
  authLabel: string;
  placementType?: string;
  sentAt?: string;
  sentSubject?: string;
  docs?: Record<string, { fileName?: string; downloadURL?: string } | null>;
  veronicaDecision?: string;
  veronicaDecisionNote?: string;
  veronicaDecisionAt?: string;
};

const clean = (value: unknown) => String(value || '').trim();

export default function IlsPackageReviewPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const {
    isAdmin,
    isSuperAdmin,
    isLoading: adminLoading,
    canAccessIlsPackagePortal,
    isIlsStaff,
  } = useAdmin();

  const [rows, setRows] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const focusId = clean(searchParams.get('packageId'));

  const allowed = Boolean(isAdmin || isSuperAdmin || canAccessIlsPackagePortal || isIlsStaff);

  const authHeaders = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    const idToken = await user.getIdToken();
    return { Authorization: `Bearer ${idToken}` };
  }, [auth]);

  const loadRows = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package/veronica?limit=80', {
        headers,
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Could not load packages'));
      }
      setRows(Array.isArray(body.packages) ? (body.packages as PackageRow[]) : []);
    } catch (error: any) {
      toast({
        title: 'Could not load packages',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [auth.currentUser, authHeaders, toast]);

  useEffect(() => {
    if (!allowed || adminLoading) return;
    void loadRows();
  }, [allowed, adminLoading, loadRows]);

  const ordered = useMemo(() => {
    if (!focusId) return rows;
    const focus = rows.find((r) => r.id === focusId);
    if (!focus) return rows;
    return [focus, ...rows.filter((r) => r.id !== focusId)];
  }, [rows, focusId]);

  const decide = async (pkg: PackageRow, decision: 'approved' | 'rejected') => {
    setBusyId(pkg.id);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/alft/cover-sheet-package/veronica', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          decision,
          note: notes[pkg.id] || '',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Could not save decision'));
      }
      toast({
        title: decision === 'approved' ? 'Package approved' : 'Package rejected',
        description:
          decision === 'rejected'
            ? 'John was notified with your explanation.'
            : 'John was notified of the approval.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await loadRows();
    } catch (error: any) {
      toast({
        title: 'Decision failed',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setBusyId('');
    }
  };

  if (!adminLoading && !allowed) {
    return (
      <div className="container mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>ILS Package Review</CardTitle>
            <CardDescription>
              This limited portal is for staff activated with ILS Package Review access on Staff Management.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">ILS Package Review</h1>
          <p className="text-sm text-muted-foreground">
            Review cover sheet packages sent for Veronica. Approve or reject (with explanation). Rejects notify John.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">Admin home</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading packages…
        </div>
      ) : ordered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No sent cover sheet packages yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {ordered.map((pkg) => {
            const decision = clean(pkg.veronicaDecision).toLowerCase() || 'pending';
            const docs = Object.entries(pkg.docs || {}).filter(
              ([, file]) => file && clean(file.fileName) && clean(file.downloadURL)
            );
            return (
              <li key={pkg.id} className="rounded-md border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">{pkg.memberName}</div>
                    <div className="text-sm text-muted-foreground">
                      MRN {pkg.memberMrn || '—'} · {pkg.authLabel}
                      {pkg.sentAt ? ` · sent ${new Date(pkg.sentAt).toLocaleString()}` : ''}
                    </div>
                    {pkg.sentSubject ? (
                      <div className="mt-1 text-xs text-muted-foreground">{pkg.sentSubject}</div>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      decision === 'approved' ? 'default' : decision === 'rejected' ? 'destructive' : 'secondary'
                    }
                  >
                    {decision === 'approved'
                      ? 'Approved'
                      : decision === 'rejected'
                        ? 'Rejected'
                        : 'Awaiting decision'}
                  </Badge>
                </div>

                {docs.length ? (
                  <ul className="mt-3 space-y-1 rounded border bg-muted/20 p-2 text-xs">
                    {docs.map(([key, file]) => (
                      <li key={key}>
                        <a
                          href={file!.downloadURL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 underline-offset-2 hover:underline"
                        >
                          {file!.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {decision === 'pending' ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      placeholder="Explanation required if rejecting"
                      value={notes[pkg.id] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={Boolean(busyId)}
                        onClick={() => void decide(pkg, 'approved')}
                      >
                        {busyId === pkg.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={Boolean(busyId)}
                        onClick={() => void decide(pkg, 'rejected')}
                      >
                        {busyId === pkg.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="mr-2 h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {pkg.veronicaDecisionAt
                      ? `Decided ${new Date(pkg.veronicaDecisionAt).toLocaleString()}`
                      : 'Decided'}
                    {pkg.veronicaDecisionNote ? ` · ${pkg.veronicaDecisionNote}` : ''}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
