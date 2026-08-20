'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type SpreadsheetMemberStatus = {
  rowId: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCity: string;
  caspioExists: boolean;
  skeletonCreated: boolean;
  applicationId: string;
  statusNote: string;
};

type SpreadsheetUploadLog = {
  id: string;
  fileName: string;
  uploadedBy: string;
  createdAtLabel: string;
  totalMembers: number;
  caspioMatchedMembers: number;
  skeletonCreatedMembers: number;
  members: SpreadsheetMemberStatus[];
};

const toDateLabel = (raw: any) => {
  try {
    const date = raw?.toDate ? raw.toDate() : raw instanceof Date ? raw : null;
    if (!date) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return 'Unknown';
  }
};

export default function SpreadsheetUploadsPage() {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<SpreadsheetUploadLog[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const logsRef = collection(firestore, 'ils_spreadsheet_upload_logs');
        let snap;
        try {
          snap = await getDocs(query(logsRef, orderBy('createdAt', 'desc')));
        } catch {
          snap = await getDocs(logsRef);
        }
        const next: SpreadsheetUploadLog[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const membersRaw = Array.isArray(data?.members) ? data.members : [];
          const members: SpreadsheetMemberStatus[] = membersRaw.map((m: any) => ({
            rowId: String(m?.rowId || ''),
            memberFirstName: String(m?.memberFirstName || ''),
            memberLastName: String(m?.memberLastName || ''),
            memberMrn: String(m?.memberMrn || ''),
            memberCity: String(m?.memberCity || ''),
            caspioExists: Boolean(m?.caspioExists),
            skeletonCreated: Boolean(m?.skeletonCreated),
            applicationId: String(m?.applicationId || ''),
            statusNote: String(m?.statusNote || ''),
          }));
          return {
            id: d.id,
            fileName: String(data?.fileName || 'Unknown Spreadsheet'),
            uploadedBy: String(data?.uploadedBy || 'Unknown'),
            createdAtLabel: toDateLabel(data?.createdAt || data?.lastSyncedAt),
            totalMembers: Number(data?.totalMembers || members.length || 0),
            caspioMatchedMembers: Number(data?.caspioMatchedMembers || 0),
            skeletonCreatedMembers: Number(data?.skeletonCreatedMembers || 0),
            members,
          };
        });
        setLogs(next);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [firestore]);

  const normalizedSearch = String(search || '').trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedSearch) return logs;
    return logs
      .map((log) => {
        const fileMatch = log.fileName.toLowerCase().includes(normalizedSearch);
        if (fileMatch) return log;
        const members = log.members.filter((member) => {
          const fullName = `${member.memberFirstName} ${member.memberLastName}`.toLowerCase();
          return (
            fullName.includes(normalizedSearch) ||
            member.memberMrn.toLowerCase().includes(normalizedSearch) ||
            member.memberCity.toLowerCase().includes(normalizedSearch)
          );
        });
        return { ...log, members };
      })
      .filter((log) => log.members.length > 0 || log.fileName.toLowerCase().includes(normalizedSearch));
  }, [logs, normalizedSearch]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Spreadsheet Upload Status</h1>
        <Button variant="outline" asChild>
          <Link href="/admin/applications/create">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Create Application
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Uploaded Spreadsheets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name, member name, MRN, or city"
          />
          {isLoading ? (
            <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading upload history...
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!isLoading && filtered.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No spreadsheet uploads found for this search.
          </CardContent>
        </Card>
      ) : null}

      {filtered.map((log) => (
        <Card key={log.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {log.fileName} • {log.createdAtLabel}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Uploaded by {log.uploadedBy} • Members: {log.totalMembers} • Already in Caspio: {log.caspioMatchedMembers} • Skeletons created: {log.skeletonCreatedMembers}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Member</th>
                    <th className="px-2 py-1.5">MRN</th>
                    <th className="px-2 py-1.5 min-w-[160px]">City</th>
                    <th className="px-2 py-1.5">Already in Caspio</th>
                    <th className="px-2 py-1.5">Skeleton Status</th>
                    <th className="px-2 py-1.5">Application</th>
                  </tr>
                </thead>
                <tbody>
                  {log.members.map((member) => (
                    <tr key={`${log.id}-${member.rowId}`} className="border-t">
                      <td className="px-2 py-1.5 whitespace-nowrap">{`${member.memberLastName}, ${member.memberFirstName}`}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{member.memberMrn || '—'}</td>
                      <td className="px-2 py-1.5 min-w-[160px] whitespace-normal break-words">{member.memberCity || '—'}</td>
                      <td className="px-2 py-1.5">{member.caspioExists ? 'Yes' : 'No'}</td>
                      <td className="px-2 py-1.5">{member.skeletonCreated ? 'Created' : 'Not created'}</td>
                      <td className="px-2 py-1.5">
                        {member.applicationId ? (
                          <Link className="underline" href={`/admin/applications/${encodeURIComponent(member.applicationId)}`}>
                            {member.applicationId}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
