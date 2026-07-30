'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Kanban, DollarSign, Calendar, Activity, ArrowRight, Mail, UserCheck, ClipboardList, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

const operationsTools = [
  {
    title: 'Managerial Overview',
    description: 'Comprehensive dashboard for tracking member assignments, RCFE distribution, and staff workload',
    icon: Kanban,
    href: '/admin/managerial-overview',
    color: 'text-purple-600'
  },
  {
    title: 'SW Claims Management',
    description: 'Review, approve, and process social worker visit claims and gas reimbursements',
    icon: DollarSign,
    href: '/admin/sw-claims-management',
    color: 'text-green-600'
  },
  {
    title: 'Daily Task Tracker',
    description: 'Track and manage daily tasks, assignments, and workflow items',
    icon: Calendar,
    href: '/admin/daily-tasks',
    color: 'text-blue-600'
  },
  {
    title: 'Assignment Tracker',
    description: 'View all app-generated staff assignments with filters for staff/member and date sorting',
    icon: UserCheck,
    href: '/admin/assignment-tracker',
    color: 'text-cyan-600'
  },
  {
    title: 'ALFT Assignment',
    description: 'Pick Kaiser members from Caspio, use Caspio SW assignment, and launch SW → Manager → RN → ILS ALFT workflow',
    icon: ClipboardList,
    href: '/admin/alft-assignment',
    color: 'text-violet-600'
  },
  {
    title: 'Login Activity',
    description: 'Monitor user login activity, session tracking, and access logs',
    icon: Activity,
    href: '/admin/login-activity',
    color: 'text-orange-600'
  },
  {
    title: 'Email Logs',
    description: 'Track all outbound emails and verify success or failure delivery status',
    icon: Mail,
    href: '/admin/email-logs',
    color: 'text-indigo-600'
  }
];

type KaiserDigestStatus = {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  triggerSource?: string;
  emailsSent?: number;
  recipientsEvaluated?: number;
  scannedEvents?: number;
  cadenceHours?: number;
  etHour24?: number;
  updatedAt?: string;
  updatedAtMs?: number;
};

export default function OperationsDashboardPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const router = useRouter();
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const [digestStatus, setDigestStatus] = useState<KaiserDigestStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [isRunningDigestTest, setIsRunningDigestTest] = useState(false);
  const [digestCadenceHours, setDigestCadenceHours] = useState(2);
  const [isSavingCadence, setIsSavingCadence] = useState(false);

  const fetchDigestStatus = useCallback(async () => {
    if (!firestore) return;
    setStatusLoading(true);
    try {
      const [statusSnap, reviewSnap] = await Promise.all([
        getDoc(doc(firestore, 'system_settings', 'kaiser_manager_hourly_digest_status')),
        getDoc(doc(firestore, 'system_settings', 'review_notifications')),
      ]);
      if (statusSnap.exists()) {
        setDigestStatus((statusSnap.data() || {}) as KaiserDigestStatus);
      } else {
        setDigestStatus(null);
      }
      if (reviewSnap.exists()) {
        const reviewData = reviewSnap.data() as any;
        const cadence = Number(reviewData?.kaiserManagerDigestIntervalHours || 2);
        setDigestCadenceHours(Number.isFinite(cadence) ? Math.max(1, Math.min(24, Math.round(cadence))) : 2);
      } else {
        setDigestCadenceHours(2);
      }
    } catch {
      setDigestStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [firestore]);

  const saveCadence = useCallback(async () => {
    if (!firestore) return;
    setIsSavingCadence(true);
    try {
      const nextCadence = Number.isFinite(digestCadenceHours)
        ? Math.max(1, Math.min(24, Math.round(digestCadenceHours)))
        : 2;
      await setDoc(
        doc(firestore, 'system_settings', 'review_notifications'),
        { kaiserManagerDigestIntervalHours: nextCadence },
        { merge: true }
      );
      toast({
        title: 'Digest cadence saved',
        description: `Kaiser digest cadence set to every ${nextCadence} hour${nextCadence === 1 ? '' : 's'}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await fetchDigestStatus();
    } catch (error: any) {
      toast({
        title: 'Failed to save cadence',
        description: String(error?.message || 'Unable to save digest cadence.'),
        variant: 'destructive',
      });
    } finally {
      setIsSavingCadence(false);
    }
  }, [digestCadenceHours, fetchDigestStatus, firestore, toast]);

  const runKaiserDigestTest = useCallback(async () => {
    const currentUser = auth?.currentUser;
    if (!currentUser) {
      toast({
        title: 'Not signed in',
        description: 'Please sign in again and retry.',
        variant: 'destructive',
      });
      return;
    }
    setIsRunningDigestTest(true);
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/cron/kaiser-manager-hourly-review-digest', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'Failed to run hourly digest test.'));
      }
      toast({
        title: 'Kaiser digest test complete',
        description: `Recipients evaluated: ${Number(payload?.recipientsEvaluated || 0)}. Emails sent: ${Number(payload?.emailsSent || 0)}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await fetchDigestStatus();
    } catch (error: any) {
      toast({
        title: 'Kaiser digest test failed',
        description: String(error?.message || 'Unable to run digest test.'),
        variant: 'destructive',
      });
      await fetchDigestStatus();
    } finally {
      setIsRunningDigestTest(false);
    }
  }, [auth?.currentUser, fetchDigestStatus, toast]);

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isSuperAdmin, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isSuperAdmin) {
      void fetchDigestStatus();
    }
  }, [fetchDigestStatus, isLoading, isSuperAdmin]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Operations Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Centralized access to operational tools, tracking, and management systems
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {operationsTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.href} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${tool.color}`} />
                  <CardTitle className="text-xl">{tool.title}</CardTitle>
                </div>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={tool.href}>
                  <Button className="w-full">
                    Open {tool.title}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-emerald-200/60">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-xl">Kaiser Digest Status</CardTitle>
              <CardDescription>
                Visibility into Kaiser review digest behavior (window, cadence, and no-new-item skips).
              </CardDescription>
              <p className="mt-2 text-xs text-amber-700">
                Note: Cadence runs only during business hours (12:00 PM - 7:59 PM EST). No automatic sends occur outside this window.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="ops-kaiser-digest-cadence" className="text-xs font-medium text-muted-foreground">
                  Digest cadence
                </label>
                <select
                  id="ops-kaiser-digest-cadence"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={String(digestCadenceHours)}
                  onChange={(event) => {
                    const next = Number(event.target.value || 2);
                    setDigestCadenceHours(Number.isFinite(next) ? Math.max(1, Math.min(24, Math.round(next))) : 2);
                  }}
                >
                  <option value="1">Every 1 hour</option>
                  <option value="2">Every 2 hours</option>
                  <option value="3">Every 3 hours</option>
                  <option value="4">Every 4 hours</option>
                  <option value="6">Every 6 hours</option>
                  <option value="8">Every 8 hours</option>
                  <option value="12">Every 12 hours</option>
                  <option value="24">Every 24 hours</option>
                </select>
              </div>
              <Button type="button" variant="outline" onClick={() => void saveCadence()} disabled={isSavingCadence}>
                {isSavingCadence ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save cadence
              </Button>
              <Button type="button" variant="outline" onClick={() => void fetchDigestStatus()} disabled={statusLoading}>
                {statusLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              <Button type="button" onClick={() => void runKaiserDigestTest()} disabled={isRunningDigestTest}>
                {isRunningDigestTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Test Digest Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {digestStatus ? (
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div><span className="font-semibold">Last run:</span> {digestStatus.updatedAt ? new Date(digestStatus.updatedAt).toLocaleString() : digestStatus.updatedAtMs ? new Date(Number(digestStatus.updatedAtMs)).toLocaleString() : 'Unknown'}</div>
              <div><span className="font-semibold">Source:</span> {String(digestStatus.triggerSource || 'Unknown')}</div>
              <div><span className="font-semibold">Result:</span> {digestStatus.skipped ? 'Skipped' : 'Completed'}</div>
              <div><span className="font-semibold">Reason:</span> {String(digestStatus.reason || (digestStatus.skipped ? 'Skipped' : 'Sent/processed'))}</div>
              <div><span className="font-semibold">Cadence:</span> {digestCadenceHours}h</div>
              <div><span className="font-semibold">ET hour:</span> {Number(digestStatus.etHour24 ?? -1) >= 0 ? String(digestStatus.etHour24) : 'N/A'}</div>
              <div><span className="font-semibold">Recipients evaluated:</span> {Number(digestStatus.recipientsEvaluated || 0)}</div>
              <div><span className="font-semibold">Emails sent:</span> {Number(digestStatus.emailsSent || 0)}</div>
              <div><span className="font-semibold">Items scanned:</span> {Number(digestStatus.scannedEvents || 0)}</div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No digest status found yet. Run a test to generate a status snapshot.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
