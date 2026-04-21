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
type IncomingDocumentSummary = {
  name: string;
  pendingCount: number;
  totalCount: number;
};
type GroupedMemberRow = {
  key: string;
  memberName: string;
  status: string;
  plan: string;
  staff: string;
  isActive: boolean;
  primaryAppId: string;
  incomingDocuments: IncomingDocumentSummary[];
};

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

const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getMemberKey = (app: Record<string, unknown>) => {
  const mrn = normalizeText(app?.memberMrn);
  if (mrn) return `mrn:${mrn}`;
  const mediCal = normalizeText(app?.memberMediCalNum);
  if (mediCal) return `medi:${mediCal}`;
  const dob = normalizeText(app?.memberDob);
  const firstName = normalizeText(app?.memberFirstName);
  const lastName = normalizeText(app?.memberLastName);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName && dob) return `name_dob:${fullName}|${dob}`;
  if (fullName) return `name:${fullName}`;
  return `app:${String(app?.id || 'unknown')}`;
};

const getIncomingDocumentsFromApp = (app: Record<string, unknown>): IncomingDocumentSummary[] => {
  const forms = Array.isArray(app?.forms) ? (app.forms as Record<string, unknown>[]) : [];
  const docsByName = new Map<string, IncomingDocumentSummary>();
  forms
    .filter((form) => {
      const status = String(form?.status || '').trim().toLowerCase();
      if (status !== 'completed') return false;
      const formName = String(form?.name || '').trim().toLowerCase();
      const isSummary = formName === 'cs member summary' || formName === 'cs summary';
      return !isSummary;
    })
    .forEach((form) => {
      const formName = String(form?.name || '').trim();
      const fileName = String(form?.fileName || '').trim();
      const displayName = fileName || formName || 'Incoming document';
      const acknowledged = form?.acknowledged === true;
      const docKey = normalizeText(displayName);
      const existing = docsByName.get(docKey);
      if (!existing) {
        docsByName.set(docKey, {
          name: displayName,
          pendingCount: acknowledged ? 0 : 1,
          totalCount: 1,
        });
        return;
      }
      docsByName.set(docKey, {
        name: existing.name,
        pendingCount: existing.pendingCount + (acknowledged ? 0 : 1),
        totalCount: existing.totalCount + 1,
      });
    });
  return Array.from(docsByName.values());
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

  const groupedRows = useMemo(() => {
    const visibleRows = rows
      .filter((app) => normalizeIntakeSource(app) === selectedSource)
      .sort((a, b) => {
        const aMs = toMillis(a?.lastUpdated || a?.createdAt || a?.submissionDate);
        const bMs = toMillis(b?.lastUpdated || b?.createdAt || b?.submissionDate);
        return bMs - aMs;
      })
      .slice(0, 75);

    const grouped = new Map<string, GroupedMemberRow>();
    visibleRows.forEach((app) => {
      const memberKey = getMemberKey(app);
      const memberName =
        `${String(app?.memberFirstName || '').trim()} ${String(app?.memberLastName || '').trim()}`.trim() ||
        'Unknown member';
      const currentDocs = getIncomingDocumentsFromApp(app);
      const appStatus = String(app?.status || '').trim() || '—';
      const appPlan = String(app?.healthPlan || '').trim() || '—';
      const appStaff = String(app?.assignedStaffName || '').trim() || 'Unassigned';
      const appIsActive = isActiveIntake(app);
      const existing = grouped.get(memberKey);

      if (!existing) {
        grouped.set(memberKey, {
          key: memberKey,
          memberName,
          status: appStatus,
          plan: appPlan,
          staff: appStaff,
          isActive: appIsActive,
          primaryAppId: String(app?.id || ''),
          incomingDocuments: currentDocs,
        });
        return;
      }

      // Merge incoming document names so one member appears once.
      const docsByName = new Map<string, IncomingDocumentSummary>();
      [...existing.incomingDocuments, ...currentDocs].forEach((doc) => {
        const docKey = normalizeText(doc.name);
        const prev = docsByName.get(docKey);
        if (!prev) {
          docsByName.set(docKey, { ...doc });
          return;
        }
        docsByName.set(docKey, {
          name: prev.name,
          pendingCount: prev.pendingCount + doc.pendingCount,
          totalCount: prev.totalCount + doc.totalCount,
        });
      });

      existing.incomingDocuments = Array.from(docsByName.values());
      existing.isActive = existing.isActive || appIsActive;
    });

    return Array.from(grouped.values());
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
          ) : groupedRows.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No records in this lane yet.</div>
          ) : (
            <div className="overflow-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">Incoming Documents</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Assigned Staff</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((member) => {
                    return (
                      <tr key={member.key} className="border-t">
                        <td className="px-3 py-2 font-medium">{member.memberName}</td>
                        <td className="px-3 py-2">
                          {member.incomingDocuments.length === 0 ? (
                            <span className="text-muted-foreground">No incoming documents</span>
                          ) : (
                            <div className="space-y-1">
                              {member.incomingDocuments.map((doc, index) => (
                                <div key={`${member.key}-${normalizeText(doc.name)}-${index}`} className="flex flex-wrap items-center gap-2">
                                  <span>{doc.name}</span>
                                  {doc.pendingCount > 0 ? (
                                    <Badge variant="secondary">Flagged</Badge>
                                  ) : (
                                    <Badge variant="outline">Reviewed</Badge>
                                  )}
                                  {doc.totalCount > 1 ? (
                                    <span className="text-xs text-muted-foreground">x{doc.totalCount}</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={member.isActive ? 'secondary' : 'outline'}>{member.status}</Badge>
                        </td>
                        <td className="px-3 py-2">{member.plan}</td>
                        <td className="px-3 py-2">{member.staff}</td>
                        <td className="px-3 py-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/applications/${encodeURIComponent(member.primaryAppId)}`}>Open</Link>
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

