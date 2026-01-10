'use client';

import { useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

export default function KaiserTrackerPage() {
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    
    try {
      console.log('Starting Caspio sync...');
      
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      toast({
        title: 'Syncing...',
        description: 'Fetching Kaiser members from Caspio database',
      });
      
      const result = await fetchKaiserMembers();
      console.log('Caspio result:', result);
      
      const data = result.data as any;
      
      if (data?.success) {
        const count = data.members?.length || 0;
        setMemberCount(count);
        
        console.log('Success! Member count:', count);
        console.log('Sample member data:', data.members?.[0]);
        
        toast({
          title: 'Success!',
          description: `Loaded ${count} Kaiser members from Caspio`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        const errorMsg = data?.message || 'Failed to fetch Caspio data';
        setError(errorMsg);
        console.error('Caspio error:', errorMsg);
        
        toast({
          variant: 'destructive',
          title: 'Error',
          description: errorMsg,
        });
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      const errorMsg = error.message || 'Failed to connect to Caspio';
      setError(errorMsg);
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMsg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kaiser Tracker - Debug Mode</h1>
          <p className="text-muted-foreground">
            Simplified version to test Caspio connection and data retrieval
          </p>
        </div>
        <Button onClick={handleSync} disabled={isLoading}>
          {isLoading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Test Caspio Sync
        </Button>
      </div>

      {/* Simple Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? 'Testing...' : error ? 'Error' : memberCount > 0 ? 'Connected' : 'Ready'}
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Connecting to Caspio' : error ? 'Check console for details' : 'Click sync to test'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Member Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memberCount}</div>
            <p className="text-sm text-muted-foreground">Kaiser members found</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Debug Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <div>Status: {error ? 'Error' : memberCount > 0 ? 'Success' : 'Waiting'}</div>
              <div>Check browser console for detailed logs</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Error Details</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
            <p className="text-sm text-red-600 mt-2">
              Check the browser console (F12) for more detailed error information.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>1.</strong> Click "Test Caspio Sync" to test the connection</p>
            <p><strong>2.</strong> Open browser console (F12) to see detailed logs</p>
            <p><strong>3.</strong> Look for console messages showing:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Caspio connection status</li>
              <li>Member count and sample data</li>
              <li>Field names and values (especially client_ID2)</li>
              <li>Any error messages</li>
            </ul>
            <p><strong>4.</strong> If successful, we can add back the full interface</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}