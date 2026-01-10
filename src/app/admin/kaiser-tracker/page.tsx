'use client';

import { useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, User, Clock, CheckCircle, XCircle } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface KaiserMember {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMediCalNum: string;
  memberMrn: string;
  memberCounty: string;
  client_ID2: string;
  Kaiser_Status: string;
  CalAIM_Status: string;
  kaiser_user_assignment: string;
  source: string;
}

export default function KaiserTrackerPage() {
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need admin access to view the Kaiser Tracker.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      toast({
        title: 'Syncing...',
        description: 'Fetching Kaiser members from Caspio database',
      });
      
      const result = await fetchKaiserMembers();
      const data = result.data as any;
      
      if (data.success) {
        setMembers(data.members || []);
        toast({
          title: 'Success!',
          description: `Loaded ${data.total || data.members?.length || 0} Kaiser members from Caspio`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.message || 'Failed to fetch Caspio data',
        });
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to connect to Caspio',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'Complete' || status === 'ILS Contracted (Complete)') {
      return 'bg-green-100 text-green-800';
    }
    if (status === 'On-Hold' || status === 'Non-active') {
      return 'bg-red-100 text-red-800';
    }
    if (status?.includes('Appeal') || status?.includes('Revision')) {
      return 'bg-orange-100 text-orange-800';
    }
    return 'bg-blue-100 text-blue-800';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Complete' || status === 'ILS Contracted (Complete)') {
      return <CheckCircle className="h-3 w-3" />;
    }
    if (status === 'On-Hold' || status === 'Non-active') {
      return <XCircle className="h-3 w-3" />;
    }
    return <Clock className="h-3 w-3" />;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kaiser Tracker</h1>
          <p className="text-muted-foreground">
            Simplified test version - Track Kaiser member applications and status updates
          </p>
        </div>
        <Button onClick={handleSync} disabled={isLoading}>
          {isLoading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync from Caspio
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">Kaiser members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {members.filter(m => m.Kaiser_Status && !m.Kaiser_Status.includes('Complete') && m.Kaiser_Status !== 'On-Hold' && m.Kaiser_Status !== 'Non-active').length}
            </div>
            <p className="text-xs text-muted-foreground">Active cases</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {members.filter(m => m.Kaiser_Status === 'Complete' || m.Kaiser_Status === 'ILS Contracted (Complete)').length}
            </div>
            <p className="text-xs text-muted-foreground">Finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">On Hold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {members.filter(m => m.Kaiser_Status === 'On-Hold' || m.Kaiser_Status === 'Non-active').length}
            </div>
            <p className="text-xs text-muted-foreground">Paused</p>
          </CardContent>
        </Card>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kaiser Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No Kaiser members loaded yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Click "Sync from Caspio" to load member data.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Client ID2</TableHead>
                    <TableHead>Medi-Cal #</TableHead>
                    <TableHead>MRN</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Kaiser Status</TableHead>
                    <TableHead>CalAIM Status</TableHead>
                    <TableHead>Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">
                          {member.memberFirstName} {member.memberLastName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {member.client_ID2 || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.memberMediCalNum || 'N/A'}</TableCell>
                      <TableCell>{member.memberMrn || 'N/A'}</TableCell>
                      <TableCell>{member.memberCounty || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(member.Kaiser_Status || 'Pending')}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(member.Kaiser_Status || 'Pending')}
                            {member.Kaiser_Status || 'Pending'}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(member.CalAIM_Status || 'Pending')}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(member.CalAIM_Status || 'Pending')}
                            {member.CalAIM_Status || 'Pending'}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {member.kaiser_user_assignment || 'Unassigned'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}