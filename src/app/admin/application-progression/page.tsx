'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { doc, getDocs, query, collection, where, setDoc } from 'firebase/firestore';
import Link from 'next/link';

type StaffRow = {
  uid: string;
  name: string;
  email: string;
  isKaiserStaff: boolean;
  isHealthNetStaff: boolean;
  requiresNextStepDate: boolean;
};

export default function ApplicationProgressionPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();
  const router = useRouter();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isSuperAdmin) router.push('/admin');
  }, [isLoading, isSuperAdmin, router]);

  useEffect(() => {
    const run = async () => {
      if (!firestore) return;
      if (!isSuperAdmin) return;
      setIsLoadingStaff(true);
      try {
        const snap = await getDocs(query(collection(firestore, 'users'), where('isStaff', '==', true)));
        const rows: StaffRow[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const first = String(data.firstName || '').trim();
            const last = String(data.lastName || '').trim();
            const display = String(data.displayName || data.name || '').trim();
            const email = String(data.email || '').trim();
            const name = (first || last) ? `${first} ${last}`.trim() : (display || email || 'Staff');
            return {
              uid: d.id,
              name,
              email,
              isKaiserStaff: Boolean(data.isKaiserStaff),
              isHealthNetStaff: Boolean(data.isHealthNetStaff),
              requiresNextStepDate: Boolean(data.requiresNextStepDate),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setStaff(rows);
      } finally {
        setIsLoadingStaff(false);
      }
    };
    run().catch(() => undefined);
  }, [firestore, isSuperAdmin]);

  const updateFlag = async (
    uid: string,
    patch: Partial<Pick<StaffRow, 'isKaiserStaff' | 'isHealthNetStaff' | 'requiresNextStepDate'>>
  ) => {
    if (!firestore) return;
    setStaff((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s))
    );
    try {
      await setDoc(doc(firestore, 'users', uid), patch as any, { merge: true });
    } catch {
      // revert on failure
      setStaff((prev) =>
        prev.map((s) => (s.uid === uid ? { ...s, ...Object.fromEntries(Object.keys(patch).map((k) => [k, !(s as any)[k]])) } as any : s))
      );
    }
  };

  const staffSummary = useMemo(() => {
    const kaiser = staff.filter((s) => s.isKaiserStaff).length;
    const hn = staff.filter((s) => s.isHealthNetStaff).length;
    return { total: staff.length, kaiser, hn };
  }, [staff]);

  if (isLoading) return null;
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Application progression</h1>
        <p className="text-muted-foreground">
          Super Admin tools for progression workflow and staff plan assignments.
        </p>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between flex-row">
          <div>
            <CardTitle>Staff plan assignment</CardTitle>
            <CardDescription>
              Check which staff should be considered Kaiser vs Health Net staff.
              <span className="ml-2 text-xs text-muted-foreground">
                Total: {staffSummary.total} · Kaiser: {staffSummary.kaiser} · Health Net: {staffSummary.hn}
              </span>
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/progress-tracker">Open Progress Tracker</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Kaiser</TableHead>
                  <TableHead className="text-center">Health Net</TableHead>
                  <TableHead className="text-center">Require next step date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingStaff ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Loading staff…
                    </TableCell>
                  </TableRow>
                ) : staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No staff found.
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((s) => (
                    <TableRow key={s.uid}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.email || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={s.isKaiserStaff}
                          onCheckedChange={(checked) => updateFlag(s.uid, { isKaiserStaff: Boolean(checked) })}
                          aria-label={`Set Kaiser staff for ${s.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={s.isHealthNetStaff}
                          onCheckedChange={(checked) => updateFlag(s.uid, { isHealthNetStaff: Boolean(checked) })}
                          aria-label={`Set Health Net staff for ${s.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={s.requiresNextStepDate}
                          onCheckedChange={(checked) => updateFlag(s.uid, { requiresNextStepDate: Boolean(checked) })}
                          aria-label={`Require next step date for ${s.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

