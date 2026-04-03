'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { useFirestore, type WithId } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, PhoneCall, FileText, Sheet } from 'lucide-react';

type IntakeSource = 'family_call' | 'ils_single_authorization_sheet' | 'ils_spreadsheet_batch';
type IntakeAppRow = WithId<Record<string, unknown>> & { __ownerUid?: string | null };

const SOURCE_LABELS: Record<IntakeSource, string> = {
  family_call: 'Families call us (manual assisted application)',
  ils_single_authorization_sheet: 'ILS sends single authorization sheet',
  ils_spreadsheet_batch: 'ILS sends spreadsheet with multiple authorizations',
};

const sourceIcon = (source: IntakeSource) => {
  if (source === 'family_call') return PhoneCall;
  if (source === 'ils_single_authorization_sheet') return FileText;
  return Sheet;
};

const normalizeIntakeSource = (app: Record<string, unknown>): IntakeSource => {
  const intakeSource = String(app?.intakeSource || '').trim().toLowerCase();
  if (intakeSource === 'family_call') return 'family_call';
  if (intakeSource === 'ils_spreadsheet_batch') return 'ils_spreadsheet_batch';
  if (intakeSource === 'ils_single_authorization_sheet') return 'ils_single_authorization_sheet';
  const intakeType = String(app?.intakeType || '').trim().toLowerCase();
  if (intakeType === 'kaiser_auth_received_via_ils') return 'ils_single_authorization_sheet';
  return 'family_call';
};

const toMillis = (value: unknown): number => {
  try {
    const ts = value as { toDate?: () => Date; toMillis?: () => number } | null;
    if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts && typeof ts.toMillis === 'function') return Number(ts.toMillis()) || 0;
    const ms = new Date(String(value || '')).getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
};

const isActiveIntake = (app: Record<string, unknown>) => {
  const status = String(app?.status || '').trim().toLowerCase();
  if (status === 'completed & submitted' || status === 'approved') return false;
  if (app?.isComplete === true) return false;
  return true;
};

export default function ApplicationsIntakeProcessingPage() {
  const firestore = useFirestore();
  const [rows, setRows] = useState<IntakeAppRow[]>([]);
  const [selectedSource, setSelectedSource] = useState<IntakeSource>('family_call');
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    if (!firestore) return;
    setLoading(true);
    try {
      const [userSnap, adminSnap] = await Promise.all([
        getDocs(collectionGroup(firestore, 'applications')),
        getDocs(collection(firestore, 'applications')),
      ]);
      const userRows = userSnap.docs.map((d) => ({
        id: d.id,
        __ownerUid: d.ref?.parent?.parent?.id || null,
        ...(d.data() as Record<string, unknown>),
      }));
      const adminRows = adminSnap.docs.map((d) => ({
        id: d.id,
        __ownerUid: null,
        ...(d.data() as Record<string, unknown>),
      }));
      const byKey = new Map<string, IntakeAppRow>();
      [...userRows, ...adminRows].forEach((row) => {
        const owner = String(row.__ownerUid || 'admin');
        byKey.set(`${owner}:${row.id}`, row);
      });
      setRows(Array.from(byKey.values()));
    } finally {
      setLoading(false);
    }
  }, [firestore]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const laneStats = useMemo(() => {
    const stats: Record<IntakeSource, { total: number; active: number }> = {
      family_call: { total: 0, active: 0 },
      ils_single_authorization_sheet: { total: 0, active: 0 },
      ils_spreadsheet_batch: { total: 0, active: 0 },
    };
    rows.forEach((app) => {
      const source = normalizeIntakeSource(app);
      stats[source].total += 1;
      if (isActiveIntake(app)) stats[source].active += 1;
    });
    return stats;
  }, [rows]);

  const visibleRows = useMemo(() => {
    return rows
      .filter((app) => normalizeIntakeSource(app) === selectedSource)
      .sort((a, b) => {
        const aMs = toMillis(a?.lastUpdated || a?.createdAt || a?.submissionDate);
        const bMs = toMillis(b?.lastUpdated || b?.createdAt || b?.submissionDate);
        return bMs - aMs;
      })
      .slice(0, 75);
  }, [rows, selectedSource]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Application Intake Processing</h1>
          <p className="text-muted-foreground">Start and process intakes by source: family calls, single ILS auth sheet, or ILS spreadsheet batch.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/applications">Open All Applications</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(['family_call', 'ils_single_authorization_sheet', 'ils_spreadsheet_batch'] as IntakeSource[]).map((source) => {
          const Icon = sourceIcon(source);
          return (
            <Card key={source} className={selectedSource === source ? 'border-primary' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {SOURCE_LABELS[source]}
                </CardTitle>
                <CardDescription>
                  Active {laneStats[source].active} • Total {laneStats[source].total}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button variant={selectedSource === source ? 'default' : 'outline'} onClick={() => setSelectedSource(source)}>
                  View Queue
                </Button>
                <Button asChild variant="secondary">
                  <Link href={`/admin/applications/create?intakeSource=${encodeURIComponent(source)}`}>
                    Start New
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{SOURCE_LABELS[selectedSource]} Queue</CardTitle>
          <CardDescription>Most recent records first. Open any row to continue processing.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading intake queue...
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No records in this lane yet.</div>
          ) : (
            <div className="overflow-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Assigned Staff</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((app) => {
                    const memberName = `${String(app?.memberFirstName || '').trim()} ${String(app?.memberLastName || '').trim()}`.trim() || 'Unknown member';
                    const status = String(app?.status || '').trim() || '—';
                    const plan = String(app?.healthPlan || '').trim() || '—';
                    const staff = String(app?.assignedStaffName || '').trim() || 'Unassigned';
                    const isActive = isActiveIntake(app);
                    return (
                      <tr key={`${String(app.__ownerUid || 'admin')}:${app.id}`} className="border-t">
                        <td className="px-3 py-2 font-medium">{memberName}</td>
                        <td className="px-3 py-2">
                          <Badge variant={isActive ? 'secondary' : 'outline'}>{status}</Badge>
                        </td>
                        <td className="px-3 py-2">{plan}</td>
                        <td className="px-3 py-2">{staff}</td>
                        <td className="px-3 py-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/applications/${encodeURIComponent(String(app.id || ''))}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

