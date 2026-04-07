'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  ClipboardList,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';

// ── Types ──────────────────────────────────────────────────────────────────────

type MonthExportRow = {
  date: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  visitId: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId: string;
  claimNumber: string;
  dailyVisitCount: number;
  dailyVisitFees: number;
  dailyGas: number;
  dailyTotal: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const money = (v: any) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '$0';
};

const buildMonthOptions = (): Array<{ value: string; label: string }> => {
  const start = new Date(2026, 1, 1); // Feb 2026
  const now = new Date();
  const opts: Array<{ value: string; label: string }> = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor >= start) {
    const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    opts.push({ value, label });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return opts;
};

const claimStatusLabel = (status: string) => {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'paid') return { label: 'Paid', color: 'text-green-700 bg-green-50 border-green-300' };
  if (s === 'submitted' || s === 'approved') return { label: 'Submitted', color: 'text-blue-700 bg-blue-50 border-blue-300' };
  if (s === 'rejected') return { label: 'Rejected', color: 'text-red-700 bg-red-50 border-red-300' };
  return { label: 'Draft', color: 'text-gray-600 bg-gray-50 border-gray-200' };
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SWHistoryPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const { isSocialWorker, isLoading: swLoading } = useSocialWorker();

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => new Date().toISOString().slice(0, 7)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MonthExportRow[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(
    async (month: string) => {
      if (!auth?.currentUser) return;
      setLoading(true);
      setError(null);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/sw-visits/monthly-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ month, dedupeByMemberMonth: true }),
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to load history (HTTP ${res.status})`);
        }
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setHasLoadedOnce(true);
      } catch (e: any) {
        const msg = e?.message || 'Failed to load visit history.';
        setError(msg);
        toast({ title: 'Load failed', description: msg, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [auth, toast]
  );

  useEffect(() => {
    if (swLoading || !isSocialWorker) return;
    void load(selectedMonth);
  }, [isSocialWorker, load, selectedMonth, swLoading]);

  // ── Summary stats ─────────────────────────────────────────────────────────────

  const totalVisits = useMemo(() => rows.filter((r) => Boolean(r.visitId)).length, [rows]);
  const signedOff = useMemo(() => rows.filter((r) => r.signedOff).length, [rows]);
  const submitted = useMemo(
    () =>
      rows.filter((r) =>
        ['submitted', 'approved', 'paid'].includes(String(r.claimStatus || '').toLowerCase())
      ).length,
    [rows]
  );
  const totalEarnings = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.dailyTotal || 0), 0),
    [rows]
  );

  // ── Auth guard ────────────────────────────────────────────────────────────────

  if (swLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Visit History</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Review your past visits and claims.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => load(selectedMonth)}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Month picker */}
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !hasLoadedOnce && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {/* Summary bar */}
      {hasLoadedOnce && !loading && (
        <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totalVisits}</span> visits
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-medium">{signedOff}</span> signed off
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="font-medium">{submitted}</span> submitted
          </span>
          {totalEarnings > 0 && (
            <span className="ml-auto font-semibold text-green-700">{money(totalEarnings)} earned</span>
          )}
        </div>
      )}

      {/* Empty state */}
      {hasLoadedOnce && !loading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10" />
          <p className="font-medium">No visits recorded</p>
          <p className="text-sm">No visit records found for this month.</p>
        </div>
      )}

      {/* Visit rows */}
      {hasLoadedOnce && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {rows.map((row, idx) => {
            const flags = computeSwVisitStatusFlags({
              visitId: row.visitId,
              signedOff: row.signedOff,
              claimStatus: row.claimStatus,
              claimSubmitted: row.claimSubmitted,
              claimPaid: row.claimPaid,
              claimId: row.claimId,
            });
            const { label, color } = claimStatusLabel(row.claimStatus);
            const visitDate = row.date
              ? new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : '—';

            return (
              <div
                key={`${row.memberId}-${idx}`}
                className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {flags.nextAction === 'none' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/30" />
                  )}
                </div>

                {/* Name / RCFE */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.memberName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{row.rcfeName}</p>
                </div>

                {/* Date + claim status */}
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="text-xs text-muted-foreground">{visitDate}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${color}`}>
                    {label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link to today */}
      <div className="pt-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
          <Link href="/sw-portal/home">← Back to Today's List</Link>
        </Button>
      </div>
    </div>
  );
}
