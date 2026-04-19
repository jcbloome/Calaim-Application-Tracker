
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Loader2, Printer, ArrowLeft, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ILSMember = {
  memberFirstName: string;
  memberLastName: string;
  memberFullName: string;
  memberMrn: string;
  birthDate?: string;
  CalAIM_Status: string;
  Kaiser_Status: string;
  pathway: string;
  healthPlan: string;
  ILS_View: string;
  Tier_Level_Request_Date?: string;
  bestContactFirstName: string;
  bestContactLastName: string;
  bestContactPhone: string;
  bestContactEmail: string;
  lastUpdated: string;
  created_date: string;
  client_ID2: string;
};

export default function IlsReportPage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();

  const [ilsMembers, setIlsMembers] = useState<ILSMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [canAccessIlsPage, setCanAccessIlsPage] = useState(false);
  const [commentsByClientId, setCommentsByClientId] = useState<Record<string, { noteText: string; updatedAt?: string; updatedByEmail?: string }>>({});
  const [draftCommentByClientId, setDraftCommentByClientId] = useState<Record<string, string>>({});
  const [savingCommentByClientId, setSavingCommentByClientId] = useState<Record<string, boolean>>({});

  const checkIlsAccess = useCallback(async () => {
    if (!auth?.currentUser) {
      setCanAccessIlsPage(false);
      setAccessLoading(false);
      return;
    }
    if (isSuperAdmin) {
      setCanAccessIlsPage(true);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-member-access', {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      setCanAccessIlsPage(Boolean(res.ok && data?.success && data?.canAccessIlsMembersPage));
    } catch {
      setCanAccessIlsPage(false);
    } finally {
      setAccessLoading(false);
    }
  }, [auth, isSuperAdmin]);

  useEffect(() => {
    if (isAdminLoading) return;
    void checkIlsAccess();
  }, [checkIlsAccess, isAdminLoading]);

  const fetchIlsComments = useCallback(async (clientIds: string[]) => {
    if (!auth?.currentUser) return;
    const ids = clientIds.map((x) => String(x || '').trim()).filter(Boolean);
    if (ids.length === 0) {
      setCommentsByClientId({});
      setDraftCommentByClientId({});
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      const qs = new URLSearchParams({ clientIds: ids.join(',') });
      const res = await fetch(`/api/admin/ils-member-comments?${qs.toString()}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) return;
      const map = (data?.comments || {}) as Record<string, { noteText: string; updatedAt?: string; updatedByEmail?: string }>;
      setCommentsByClientId(map);
      setDraftCommentByClientId((prev) => {
        const next = { ...prev };
        Object.keys(map).forEach((id) => {
          if (next[id] === undefined) next[id] = String(map[id]?.noteText || '');
        });
        return next;
      });
    } catch {
      // ignore
    }
  }, [auth]);

  const saveIlsComment = useCallback(async (clientId2: string) => {
    const id = String(clientId2 || '').trim();
    if (!id || !auth?.currentUser) return;
    const noteText = String(draftCommentByClientId[id] || '').trim();
    setSavingCommentByClientId((prev) => ({ ...prev, [id]: true }));
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-member-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ clientId2: id, noteText }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to save note');
      setCommentsByClientId((prev) => ({
        ...prev,
        [id]: {
          noteText,
          updatedAt: new Date().toISOString(),
        },
      }));
    } catch {
      // ignore
    } finally {
      setSavingCommentByClientId((prev) => ({ ...prev, [id]: false }));
    }
  }, [auth, draftCommentByClientId]);

  const fetchILSMembers = useCallback(async () => {
    if (isAdminLoading || accessLoading || !canAccessIlsPage) {
      if (!isAdminLoading && !accessLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📥 Fetching ILS members from API...');
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/ils-members', {
        headers: { authorization: `Bearer ${idToken}` },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.members) {
        console.log(`✅ Successfully fetched ${data.count} ILS members`);
        
        // Sort by member name
        const sortedMembers = data.members.sort((a: ILSMember, b: ILSMember) => {
          if (a.memberFullName < b.memberFullName) return -1;
          if (a.memberFullName > b.memberFullName) return 1;
          return 0;
        });
        
        setIlsMembers(sortedMembers);
        void fetchIlsComments(sortedMembers.map((m: ILSMember) => m.client_ID2));
      } else {
        console.error('❌ Failed to fetch ILS members:', data);
        setError(data.error || 'Failed to fetch ILS members from Caspio');
      }
    } catch (error) {
      console.error('❌ Error fetching ILS members:', error);
      setError('Error connecting to Caspio database');
    } finally {
      setIsLoading(false);
    }
  }, [accessLoading, canAccessIlsPage, fetchIlsComments, isAdminLoading]);

  // Disabled automatic loading - only load when user clicks refresh
  // useEffect(() => {
  //   fetchILSMembers();
  // }, [fetchILSMembers]);

  if (isAdminLoading || accessLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading...</p>
      </div>
    );
  }

  if (!canAccessIlsPage) {
    return (
      <div className="flex items-center justify-center h-full">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You do not have access to the ILS Member page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col print:bg-white">
      <header className="print:hidden sticky top-0 bg-white/80 backdrop-blur-sm border-b z-10">
        <div className="container mx-auto py-4 px-4">
          <div className="flex justify-between items-center">
            <Button variant="outline" asChild>
              <Link href="/admin">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Dashboard
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button 
                onClick={fetchILSMembers} 
                disabled={isLoading}
                variant="outline"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {isLoading ? 'Loading...' : 'Refresh ILS Data'}
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print Report
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto py-8 px-4 print:p-0">
        <Card className="bg-white p-4 sm:p-8 shadow-lg rounded-lg print:shadow-none print:p-4 print:border-none">
          <CardHeader className="text-center print:text-left print:p-0">
            <CardTitle className="text-2xl flex items-center justify-center gap-2 print:justify-start">
              <Users className="h-6 w-6" />
              ILS Weekly Report
            </CardTitle>
            <CardDescription>
              CalAIM Members with ILS_View = "Yes" • As of {format(new Date(), 'PPPP')}
            </CardDescription>
            <div className="text-sm text-muted-foreground mt-2">
              Total ILS Members: <span className="font-semibold text-primary">{ilsMembers.length}</span>
            </div>
          </CardHeader>
          <CardContent className="mt-6 print:mt-4">
            {error && (
              <Alert className="mb-6" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {ilsMembers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member Name</TableHead>
                    <TableHead>MRN</TableHead>
                      <TableHead>DOB</TableHead>
                    <TableHead>Health Plan</TableHead>
                    <TableHead>CalAIM Status</TableHead>
                    <TableHead>Kaiser Status</TableHead>
                    <TableHead>Pathway</TableHead>
                    <TableHead>Tier Level Request Date</TableHead>
                    <TableHead>Primary Contact</TableHead>
                    <TableHead>Contact Phone</TableHead>
                    <TableHead>Comments / Notes</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ilsMembers.map((member, index) => (
                    <TableRow key={member.client_ID2 || index}>
                      <TableCell className="font-medium">{member.memberFullName}</TableCell>
                      <TableCell>{member.memberMrn || 'N/A'}</TableCell>
                      <TableCell>
                        {member.birthDate ? format(new Date(member.birthDate), 'MMM d, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>{member.healthPlan || 'N/A'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          member.CalAIM_Status ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {member.CalAIM_Status || 'Not Set'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          member.Kaiser_Status ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {member.Kaiser_Status || 'Not Set'}
                        </span>
                      </TableCell>
                      <TableCell>{member.pathway || 'N/A'}</TableCell>
                      <TableCell>
                        {member.Tier_Level_Request_Date
                          ? format(new Date(member.Tier_Level_Request_Date), 'MMM d, yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {member.bestContactFirstName && member.bestContactLastName 
                          ? `${member.bestContactFirstName} ${member.bestContactLastName}`
                          : 'N/A'
                        }
                      </TableCell>
                      <TableCell>{member.bestContactPhone || 'N/A'}</TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="flex items-center gap-2">
                          <Input
                            value={
                              draftCommentByClientId[member.client_ID2] ??
                              commentsByClientId[member.client_ID2]?.noteText ??
                              ''
                            }
                            onChange={(e) =>
                              setDraftCommentByClientId((prev) => ({
                                ...prev,
                                [member.client_ID2]: e.target.value,
                              }))
                            }
                            placeholder="Add comment/note"
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(savingCommentByClientId[member.client_ID2])}
                            onClick={() => void saveIlsComment(member.client_ID2)}
                          >
                            {savingCommentByClientId[member.client_ID2] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                          </Button>
                        </div>
                        {commentsByClientId[member.client_ID2]?.updatedAt ? (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Updated {format(new Date(commentsByClientId[member.client_ID2].updatedAt as string), 'MMM d, yyyy p')}
                            {commentsByClientId[member.client_ID2]?.updatedByEmail ? ` by ${commentsByClientId[member.client_ID2].updatedByEmail}` : ''}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {member.lastUpdated 
                          ? format(new Date(member.lastUpdated), 'MMM d, yyyy')
                          : 'N/A'
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center text-muted-foreground py-10">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No ILS Data Loaded</p>
                <p className="mb-4">Click "Refresh ILS Data" to load ILS members data</p>
                <Button onClick={fetchILSMembers} disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {isLoading ? 'Loading...' : 'Refresh ILS Data'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
