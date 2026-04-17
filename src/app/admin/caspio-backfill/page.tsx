'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Database, Play, ShieldAlert } from 'lucide-react';

type BackfillRow = {
  key: string;
  table: string;
  collection: string;
  fetched: number;
  upserted: number;
  skippedMissingId: number;
  skippedTestMarkers: number;
  pages: number;
  warning?: string;
};

type BackfillResponse = {
  success: boolean;
  startedAt?: string;
  results?: BackfillRow[];
  totals?: {
    fetched: number;
    upserted: number;
    skippedMissingId: number;
    skippedTestMarkers: number;
  };
  error?: string;
};

export default function CaspioBackfillPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const auth = useAuth();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResponse | null>(null);
  const [includeMembers, setIncludeMembers] = useState(true);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" />
              Super Admin Access Required
            </CardTitle>
            <CardDescription>This one-time Caspio backfill tool is restricted to Super Admin users.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push('/admin')}>
              Back to Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const runBackfill = async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be signed in as a Super Admin.');
      }
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin/caspio/backfill-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ includeMembers }),
      });
      const payload = (await res.json().catch(() => ({}))) as BackfillResponse;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Backfill request failed');
      }
      setResult(payload);
    } catch (error: unknown) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Backfill failed',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Caspio One-Time Backfill</h1>
        <p className="mt-2 text-muted-foreground">
          Run a full initial pull from Caspio into Firestore for webhook-backed tables, then rely on webhooks for live updates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Backfill Controls
          </CardTitle>
          <CardDescription>
            This operation upserts records into cache collections. It is safe to re-run, but intended as a one-time go-live backfill.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeMembers}
              onChange={(e) => setIncludeMembers(e.target.checked)}
              disabled={running}
            />
            Include full members cache sync (`CalAIM_tbl_Members`) before other table backfills
          </label>
          <Button onClick={() => void runBackfill()} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? 'Running Backfill...' : 'Run One-Time Backfill'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Result</CardTitle>
            <CardDescription>{result.startedAt ? `Started at ${result.startedAt}` : 'No start time recorded'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result.success ? (
              <Alert variant="destructive">
                <AlertTitle>Backfill failed</AlertTitle>
                <AlertDescription>{result.error || 'Unknown error'}</AlertDescription>
              </Alert>
            ) : null}

            {result.success && result.totals ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded border p-3 text-sm">
                  <div className="text-muted-foreground">Fetched</div>
                  <div className="text-xl font-semibold">{result.totals.fetched}</div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="text-muted-foreground">Upserted</div>
                  <div className="text-xl font-semibold">{result.totals.upserted}</div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="text-muted-foreground">Missing IDs</div>
                  <div className="text-xl font-semibold">{result.totals.skippedMissingId}</div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="text-muted-foreground">Test Markers</div>
                  <div className="text-xl font-semibold">{result.totals.skippedTestMarkers}</div>
                </div>
              </div>
            ) : null}

            {result.success && Array.isArray(result.results) ? (
              <div className="space-y-2">
                {result.results.map((row) => (
                  <div key={row.key} className="rounded border p-3 text-sm">
                    <div className="font-medium">{row.table}</div>
                    <div className="text-muted-foreground">Collection: {row.collection}</div>
                    <div className="mt-1">
                      fetched={row.fetched}, upserted={row.upserted}, missingId={row.skippedMissingId}, testMarkers={row.skippedTestMarkers}
                    </div>
                    {row.warning ? <div className="mt-1 text-amber-700">{row.warning}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

