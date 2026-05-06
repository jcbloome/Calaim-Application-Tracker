'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore } from '@/firebase';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Mail, RefreshCw, Search } from 'lucide-react';

type CaspioUser = {
  id: string;
  User_ID: string;
  First_Name: string;
  Last_Name: string;
  Email: string;
  Role: string;
  Account_Activation: unknown;
  updatedAt: string | null;
};

const normalizeBool = (value: unknown): boolean => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'checked', 'active'].includes(normalized);
};

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
};

export default function CaspioUsersRegistrationPage() {
  const { isLoading: isAdminLoading, isSuperAdmin } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [rows, setRows] = useState<CaspioUser[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [search, setSearch] = useState('');
  const [sendingDocId, setSendingDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminLoading && !isSuperAdmin) router.push('/admin');
  }, [isAdminLoading, isSuperAdmin, router]);

  const loadRows = useCallback(async () => {
    if (!firestore) return;
    setLoadingRows(true);
    try {
      const q = query(collection(firestore, 'caspio_usersregistration_cache'), orderBy('updatedAt', 'desc'), limit(300));
      const snap = await getDocs(q);
      const data = snap.docs.map((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          User_ID: String(d.User_ID || ''),
          First_Name: String(d.First_Name || ''),
          Last_Name: String(d.Last_Name || ''),
          Email: String(d.Email || '').toLowerCase(),
          Role: String(d.Role || ''),
          Account_Activation: d.Account_Activation,
          updatedAt: String(d.updatedAt || '') || null,
        } as CaspioUser;
      });
      setRows(data);
    } catch {
      toast({
        title: 'Load failed',
        description: 'Could not load Caspio users registration cache.',
        variant: 'destructive',
      });
    } finally {
      setLoadingRows(false);
    }
  }, [firestore, toast]);

  useEffect(() => {
    if (isAdminLoading || !isSuperAdmin || !firestore) return;
    void loadRows();
  }, [isAdminLoading, isSuperAdmin, firestore, loadRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const fullName = `${r.First_Name} ${r.Last_Name}`.trim().toLowerCase();
      return (
        fullName.includes(q) ||
        String(r.Email || '').toLowerCase().includes(q) ||
        String(r.User_ID || '').toLowerCase().includes(q) ||
        String(r.Role || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const sendWelcomeNow = async (row: CaspioUser) => {
    if (!auth?.currentUser) return;
    const ok =
      typeof window !== 'undefined'
        ? window.confirm(`Send welcome email now to ${row.Email || row.User_ID || row.id}?`)
        : false;
    if (!ok) return;
    try {
      setSendingDocId(row.id);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/caspio-users/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ docId: row.id }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Failed (HTTP ${res.status})`));
      toast({
        title: 'Welcome email sent',
        description: String(data?.sentTo || row.Email || row.id),
      });
      await loadRows();
    } catch (error: unknown) {
      toast({
        title: 'Send failed',
        description: error instanceof Error ? error.message : 'Failed to send welcome email.',
        variant: 'destructive',
      });
    } finally {
      setSendingDocId(null);
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Caspio User Registration</h1>
          <p className="text-muted-foreground mt-1">
            Welcome onboarding for users from connect_tbl_userregistration (including RCFE instructions).
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/registered-users">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Registered Users
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/system-configuration/welcoming-user-screen">
              <Mail className="h-4 w-4 mr-2" />
              Edit Welcome Template
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Users from Caspio Cache</CardTitle>
          <CardDescription>
            Showing {filteredRows.length} of {rows.length}. Manual send only works when Account_Activation is checked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, role, User_ID..."
                className="w-full sm:w-[360px]"
              />
            </div>
            <Button variant="outline" onClick={() => void loadRows()} disabled={loadingRows}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingRows ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Activation</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const active = normalizeBool(row.Account_Activation);
                  const name = `${row.First_Name} ${row.Last_Name}`.trim() || '—';
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.Email || '—'}</TableCell>
                      <TableCell>{row.Role || '—'}</TableCell>
                      <TableCell>
                        {active ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Activated</Badge>
                        ) : (
                          <Badge variant="secondary">Not Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmt(row.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!active || sendingDocId === row.id}
                          onClick={() => void sendWelcomeNow(row)}
                        >
                          {sendingDocId === row.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                          Send Welcome
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      No Caspio users found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
