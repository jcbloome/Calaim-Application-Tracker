'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import {
  KAISER_NOT_INTERESTED_COLLECTION,
} from '@/lib/kaiser-not-interested';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldAlert, ExternalLink, UserX } from 'lucide-react';

type NotInterestedEntry = {
  id: string;
  applicationId?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberMediCalNum?: string;
  clientId2?: string;
  healthPlan?: string;
  pathway?: string;
  county?: string;
  kaiserStatus?: string;
  loggedAtIso?: string;
  loggedAt?: any;
  loggedByEmail?: string | null;
  loggedByName?: string | null;
  source?: string;
};

const toMs = (value: unknown): number => {
  if (!value) return 0;
  try {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof (value as any)?.toDate === 'function') {
      return (value as any).toDate().getTime();
    }
    if (typeof (value as any)?.seconds === 'number') {
      return (value as any).seconds * 1000;
    }
  } catch {
    return 0;
  }
  return 0;
};

const formatLoggedAt = (entry: NotInterestedEntry) => {
  const ms = toMs(entry.loggedAt) || toMs(entry.loggedAtIso);
  if (!ms) return '—';
  try {
    return format(new Date(ms), 'MMM d, yyyy h:mm a');
  } catch {
    return '—';
  }
};

export default function KaiserNotInterestedLogPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();
  const [entries, setEntries] = useState<NotInterestedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!firestore || !isAdmin) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError('');
    const q = collection(firestore, KAISER_NOT_INTERESTED_COLLECTION);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as NotInterestedEntry[];
        next.sort((a, b) => {
          const aMs = toMs(a.loggedAt) || toMs(a.loggedAtIso);
          const bMs = toMs(b.loggedAt) || toMs(b.loggedAtIso);
          return bMs - aMs;
        });
        setEntries(next);
        setIsLoading(false);
      },
      (err) => {
        console.error('Not interested log load failed:', err);
        setLoadError(String(err?.message || 'Could not load Not Interested log.'));
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.memberFirstName,
        entry.memberLastName,
        entry.memberMrn,
        entry.memberMediCalNum,
        entry.clientId2,
        entry.county,
        entry.loggedByName,
        entry.loggedByEmail,
        entry.applicationId,
        entry.pathway,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(term);
    });
  }, [entries, search]);

  if (isAdminLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>Admin access is required to view this log.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <UserX className="h-8 w-8 text-rose-700" />
            Kaiser Not Interested Log
          </h1>
          <p className="text-muted-foreground">
            Members marked Not interested on the application page.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-rose-300 bg-rose-50 text-rose-900">
          {filtered.length} shown
          {filtered.length !== entries.length ? ` of ${entries.length}` : ''}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Search</CardTitle>
          <CardDescription>Filter by name, MRN, Medi-Cal #, county, or staff.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load log</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Logged members</CardTitle>
          <CardDescription>
            Selecting Not interested on a Kaiser application writes (or updates) a row here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading log...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No Not interested members logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Logged</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>MRN</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Logged by</TableHead>
                    <TableHead className="text-right">Application</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => {
                    const name = [entry.memberLastName, entry.memberFirstName]
                      .filter(Boolean)
                      .join(', ') || '—';
                    const appId = String(entry.applicationId || '').trim();
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatLoggedAt(entry)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{name}</div>
                          {entry.clientId2 ? (
                            <div className="text-xs text-muted-foreground">
                              Client ID2: {entry.clientId2}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.memberMrn || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{entry.county || '—'}</TableCell>
                        <TableCell className="text-sm">
                          <div>{entry.loggedByName || '—'}</div>
                          {entry.loggedByEmail ? (
                            <div className="text-xs text-muted-foreground">
                              {entry.loggedByEmail}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {appId ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/admin/applications/${encodeURIComponent(appId)}`}>
                                Open
                                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
