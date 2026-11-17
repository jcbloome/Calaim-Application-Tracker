'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  buildKaiserMifCompareWorkbook,
  buildKaiserMifOursOnlyIlsWorkbook,
  compareKaiserPortalToAuthorized,
  filterKaiserMifHitsByRoster,
  filterKaiserMifHitsByStatus,
  kaiserMifHitIsDiedOrNonActive,
  parseKaiserPortalMifFile,
  type KaiserMifCompareHit,
  type KaiserMifCompareMember,
  type KaiserMifCompareResult,
  type KaiserMifRosterFilter,
  type KaiserMifStatusFilter,
} from '@/lib/kaiser-mif-compare';
import { isAuthorizedCalaimStatus } from '@/lib/t2038-claims';
import { Download, FileSpreadsheet, Loader2, RefreshCw, Upload } from 'lucide-react';

function downloadExcelBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type BucketFilter = 'discrepancies' | 'portal_only' | 'ours_only' | 'matched' | 'all';

export default function KaiserMifComparePage() {
  const auth = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [authorized, setAuthorized] = useState<KaiserMifCompareMember[]>([]);
  const [allKaiser, setAllKaiser] = useState<KaiserMifCompareMember[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [portalMeta, setPortalMeta] = useState<{
    sheetName: string;
    headerRow: number;
    count: number;
    mrnColumn: string;
    cinColumn: string;
    rowsWithMrn: number;
    rowsWithCin: number;
  } | null>(null);
  const [result, setResult] = useState<KaiserMifCompareResult | null>(null);
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('discrepancies');
  const [rosterFilter, setRosterFilter] = useState<KaiserMifRosterFilter>('authorized');
  const [statusFilter, setStatusFilter] = useState<KaiserMifStatusFilter>('hide_died_nonactive');
  const [query, setQuery] = useState('');

  const authorizedRosterCount = useMemo(
    () => authorized.filter((m) => isAuthorizedCalaimStatus(m.calaimStatus)).length,
    [authorized]
  );

  const loadMembers = useCallback(
    async (refresh = false) => {
      const user = auth.currentUser;
      if (!user) {
        setError('Sign in required.');
        return;
      }
      setIsLoadingMembers(true);
      setError('');
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(
          `/api/admin/kaiser-mif-compare/members${refresh ? '?refresh=true' : ''}`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: 'no-store',
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        setAuthorized(Array.isArray(body.authorized) ? body.authorized : []);
        setAllKaiser(Array.isArray(body.allKaiser) ? body.allKaiser : []);
        setFetchedAt(String(body.fetchedAt || ''));
      } catch (err: unknown) {
        setError(String((err as { message?: string })?.message || 'Could not load authorized Kaiser members.'));
      } finally {
        setIsLoadingMembers(false);
      }
    },
    [auth]
  );

  useEffect(() => {
    if (!isAdminLoading && isAdmin) void loadMembers(false);
  }, [isAdmin, isAdminLoading, loadMembers]);

  const runCompare = useCallback(
    (portalMembers: KaiserMifCompareMember[]) => {
      const next = compareKaiserPortalToAuthorized({
        portalMembers,
        authorizedMembers: authorized,
        allKaiserMembers: allKaiser,
      });
      setResult(next);
      toast({
        title: 'Compare complete',
        description: `${next.summary.matched} matched · ${next.summary.portalOnly} portal only · ${next.summary.oursOnly} ours only`,
      });
    },
    [authorized, allKaiser, toast]
  );

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!authorized.length) {
      toast({
        variant: 'destructive',
        title: 'Load Caspio roster first',
        description: 'Click Refresh from Caspio, then upload the Kaiser portal MIF again.',
      });
      return;
    }
    setIsParsing(true);
    setError('');
    try {
      // Use the same CS_MIF parser as ILS MIF consolidator (skips companion "Lists" tabs).
      const parsed = await parseKaiserPortalMifFile(file);
      if (!parsed.members.length) {
        throw new Error(
          'No member rows found on the CS_MIF sheet. Open the file and confirm the CS_MIF / CSMIF tab has Member First/Last Name and Medical Record Number (MRN).'
        );
      }
      setFileName(file.name);
      setPortalMeta({
        sheetName: parsed.sheetName,
        headerRow: parsed.headerRow,
        count: parsed.members.length,
        mrnColumn: parsed.mrnColumn,
        cinColumn: parsed.cinColumn,
        rowsWithMrn: parsed.rowsWithMrn,
        rowsWithCin: parsed.rowsWithCin,
      });
      if (parsed.rowsWithMrn === 0) {
        toast({
          variant: 'destructive',
          title: 'MRN values missing on CS_MIF sheet',
          description: `Parsed ${parsed.members.length} rows from “${parsed.sheetName}” but none had MRN. Check the Medical Record Number (MRN) column on that tab.`,
        });
      } else {
        toast({
          title: 'Portal MIF loaded',
          description: `${parsed.members.length} members from “${parsed.sheetName}” · ${parsed.rowsWithMrn} with MRN · ${parsed.rowsWithCin} with CIN`,
        });
      }
      runCompare(parsed.members);
    } catch (err: unknown) {
      setResult(null);
      setPortalMeta(null);
      setError(String((err as { message?: string })?.message || 'Could not parse Excel file.'));
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const bucketHits = useMemo(() => {
    if (!result) return [] as KaiserMifCompareHit[];
    if (bucketFilter === 'discrepancies') return [...result.portalOnly, ...result.oursOnly];
    if (bucketFilter === 'portal_only') return result.portalOnly;
    if (bucketFilter === 'ours_only') return result.oursOnly;
    if (bucketFilter === 'matched') return result.matched;
    return [...result.portalOnly, ...result.oursOnly, ...result.matched];
  }, [result, bucketFilter]);

  const rosterFilteredHits = useMemo(
    () => filterKaiserMifHitsByRoster(bucketHits, rosterFilter),
    [bucketHits, rosterFilter]
  );

  const statusFilteredHits = useMemo(
    () => filterKaiserMifHitsByStatus(rosterFilteredHits, statusFilter),
    [rosterFilteredHits, statusFilter]
  );

  const diedOrNonActiveInBucket = useMemo(
    () => rosterFilteredHits.filter((hit) => kaiserMifHitIsDiedOrNonActive(hit)).length,
    [rosterFilteredHits]
  );

  const displayedHits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return statusFilteredHits;
    return statusFilteredHits.filter((hit) => {
      const haystack = [
        hit.portal?.memberName,
        hit.portal?.mrn,
        hit.portal?.cin,
        hit.ours?.memberName,
        hit.ours?.clientId2,
        hit.ours?.mrn,
        hit.ours?.cin,
        hit.ours?.calaimStatus,
        hit.ours?.kaiserStatus,
        hit.caspioOther?.memberName,
        hit.caspioOther?.calaimStatus,
        hit.caspioOther?.kaiserStatus,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [statusFilteredHits, query]);

  const downloadWorkbook = () => {
    if (!result) return;
    downloadExcelBytes(
      buildKaiserMifCompareWorkbook(result),
      `Kaiser-MIF-compare-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const downloadOursOnlyForIls = () => {
    if (!result) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadExcelBytes(
      buildKaiserMifOursOnlyIlsWorkbook(result, {
        portalFileName: fileName || undefined,
        comparedAt: new Date().toISOString(),
        rosterForEnrichment: authorized.length ? authorized : allKaiser,
      }),
      `ILS-Kaiser-ours-only-missing-from-portal-${dateStamp}.xlsx`
    );
    toast({
      title: 'Ours-only list ready',
      description: `${result.oursOnly.length} Authorized member${
        result.oursOnly.length === 1 ? '' : 's'
      } exported for ILS review.`,
    });
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking access
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>Sign in as an admin to compare Kaiser portal MIF files.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kaiser MIF Compare</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Upload the Excel list from the new Kaiser portal and compare it to{' '}
            <span className="font-medium">all</span> Kaiser members in Caspio (every CalAIM_Status) for matching.
            Portal-only means on the Kaiser list but not in Caspio. Ours-only lists{' '}
            <span className="font-medium">Authorized</span> members who are missing from the portal MIF.
          </p>
          {fetchedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Roster pulled: {new Date(fetchedAt).toLocaleString()} · {authorized.length} Kaiser in Caspio ·{' '}
              {authorizedRosterCount} Authorized
            </p>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => void loadMembers(true)} disabled={isLoadingMembers}>
          {isLoadingMembers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh from Caspio
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Compare issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Upload Kaiser portal MIF Excel</CardTitle>
          <CardDescription>
            .xlsx / .xls / .csv — header row can sit below title rows. Matching uses MRN, CIN, Client_ID2, then
            name+DOB, then unique name.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(event) => void onFileSelected(event.target.files?.[0] || null)}
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing || isLoadingMembers || authorized.length === 0}
          >
            {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload Excel
          </Button>
          {fileName ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-center gap-1">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
                {portalMeta
                  ? ` · ${portalMeta.count} rows · sheet “${portalMeta.sheetName}” · header row ${portalMeta.headerRow}`
                  : ''}
              </div>
              {portalMeta ? (
                <div className="text-xs">
                  MRN column: <span className="font-medium text-foreground">{portalMeta.mrnColumn}</span> (
                  {portalMeta.rowsWithMrn}/{portalMeta.count} filled) · CIN column:{' '}
                  <span className="font-medium text-foreground">{portalMeta.cinColumn}</span> (
                  {portalMeta.rowsWithCin}/{portalMeta.count} filled)
                </div>
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {authorized.length === 0
                ? 'Load Kaiser roster from Caspio first.'
                : 'No portal file uploaded yet.'}
            </span>
          )}
          {result ? (
            <>
              <Button type="button" variant="secondary" onClick={downloadWorkbook}>
                <Download className="mr-2 h-4 w-4" />
                Download discrepancies
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadOursOnlyForIls}
                disabled={result.oursOnly.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Download ours-only for ILS ({result.oursOnly.length})
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {rosterFilter === 'authorized' ? 'Our Authorized roster' : 'Our roster (all statuses)'}
            </CardDescription>
            <CardTitle>
              {rosterFilter === 'authorized' ? authorizedRosterCount : authorized.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {rosterFilter === 'authorized'
              ? `CalAIM_Status Authorized · ${authorized.length} total Kaiser in Caspio`
              : 'Kaiser · all CalAIM_Status values in Caspio'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Portal MIF rows</CardDescription>
            <CardTitle>{result?.summary.portalCount ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">From uploaded Excel</CardContent>
        </Card>
        <Card className={result?.summary.portalOnly ? 'border-amber-400' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>Portal only</CardDescription>
            <CardTitle>{result?.summary.portalOnly ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            On Kaiser list, not found in Caspio
          </CardContent>
        </Card>
        <Card className={result?.summary.oursOnly ? 'border-rose-300' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>Ours only (Authorized)</CardDescription>
            <CardTitle>{result?.summary.oursOnly ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div>
              CalAIM_Status Authorized with us, missing from portal MIF
              {result?.summary.oursCount != null
                ? ` · ${result.summary.oursCount} Authorized in Caspio`
                : ''}
            </div>
            {result && result.oursOnly.length > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={downloadOursOnlyForIls}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Send list to ILS
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Discrepancies</CardTitle>
            <CardDescription>
              Matched {result.summary.matched}. Review portal-only and ours-only rows (default filter).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Show</span>
                <select
                  className="block h-10 rounded-md border bg-white px-3 text-sm"
                  value={bucketFilter}
                  onChange={(event) => setBucketFilter(event.target.value as BucketFilter)}
                >
                  <option value="discrepancies">Discrepancies (portal + ours only)</option>
                  <option value="portal_only">Portal only</option>
                  <option value="ours_only">Ours only (Authorized, not on portal)</option>
                  <option value="matched">Matched</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Our roster</span>
                <select
                  className="block h-10 rounded-md border bg-white px-3 text-sm"
                  value={rosterFilter}
                  onChange={(event) => setRosterFilter(event.target.value as KaiserMifRosterFilter)}
                >
                  <option value="authorized">Currently Authorized only</option>
                  <option value="all">All CalAIM_Status values</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Kaiser / CalAIM status</span>
                <select
                  className="block h-10 rounded-md border bg-white px-3 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as KaiserMifStatusFilter)}
                >
                  <option value="hide_died_nonactive">Hide Member Died / Non-Active</option>
                  <option value="all">Include Member Died / Non-Active</option>
                  <option value="only_died_nonactive">Only Member Died / Non-Active</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Search</span>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, MRN, CIN, Client_ID2, status"
                  className="w-64"
                />
              </label>
              <div className="text-sm text-muted-foreground pb-2">
                Showing {displayedHits.length}
                {statusFilter === 'hide_died_nonactive' && diedOrNonActiveInBucket > 0
                  ? ` · ${diedOrNonActiveInBucket} Member Died / Non-Active hidden`
                  : statusFilter === 'only_died_nonactive'
                    ? ` · Member Died / Non-Active`
                    : diedOrNonActiveInBucket > 0
                      ? ` · ${diedOrNonActiveInBucket} Member Died / Non-Active in view`
                      : ''}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 text-left">
                  <tr>
                    <th className="px-2 py-2">Bucket</th>
                    <th className="px-2 py-2">Portal</th>
                    <th className="px-2 py-2">Our Caspio member</th>
                    <th className="px-2 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedHits.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        No rows for this filter.
                      </td>
                    </tr>
                  ) : null}
                  {displayedHits.map((hit, index) => {
                    const bucketLabel =
                      hit.bucket === 'matched'
                        ? 'Matched'
                        : hit.bucket === 'portal_only'
                          ? 'Portal only'
                          : 'Ours only';
                    const badgeClass =
                      hit.bucket === 'matched'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : hit.bucket === 'portal_only'
                          ? 'bg-amber-50 text-amber-950 border-amber-300'
                          : 'bg-rose-50 text-rose-900 border-rose-200';
                    return (
                      <tr key={`${hit.bucket}-${index}`} className="border-t align-top">
                        <td className="px-2 py-2">
                          <Badge variant="outline" className={badgeClass}>
                            {bucketLabel}
                          </Badge>
                          {hit.matchMethod ? (
                            <div className="mt-1 text-[11px] text-muted-foreground">via {hit.matchMethod}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          {hit.portal ? (
                            <>
                              <div className="font-medium">{hit.portal.memberName}</div>
                              <div className="text-muted-foreground">
                                MRN {hit.portal.mrn || '—'} · CIN {hit.portal.cin || '—'}
                                {hit.portal.dob ? ` · DOB ${hit.portal.dob}` : ''}
                                {hit.portal.rowNumber ? ` · row ${hit.portal.rowNumber}` : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {hit.ours ? (
                            <>
                              <div className="font-medium">{hit.ours.memberName}</div>
                              <div className="text-muted-foreground">
                                Client_ID2 {hit.ours.clientId2 || '—'} · MRN {hit.ours.mrn || '—'} · CIN{' '}
                                {hit.ours.cin || '—'}
                              </div>
                              <div className="text-muted-foreground">
                                CalAIM {hit.ours.calaimStatus || '—'}
                                {hit.ours.kaiserStatus ? ` · Kaiser ${hit.ours.kaiserStatus}` : ''}
                                {hit.ours.authorizationStart || hit.ours.authorizationEnd
                                  ? ` · auth ${hit.ours.authorizationStart || '—'} → ${hit.ours.authorizationEnd || '—'}`
                                  : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {hit.caspioOther ? (
                            <span>
                              In Caspio as{' '}
                              <span className="font-medium text-foreground">
                                CalAIM {hit.caspioOther.calaimStatus || '—'}
                                {hit.caspioOther.kaiserStatus
                                  ? ` · Kaiser ${hit.caspioOther.kaiserStatus}`
                                  : ''}
                              </span>
                              {hit.caspioOther.clientId2 ? ` · Client_ID2 ${hit.caspioOther.clientId2}` : ''}
                              {hit.caspioOther.memberName ? ` · ${hit.caspioOther.memberName}` : ''}
                            </span>
                          ) : hit.bucket === 'portal_only' ? (
                            'Not found in our Kaiser Caspio roster'
                          ) : hit.bucket === 'ours_only' ? (
                            'Missing from uploaded portal MIF'
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
