'use client';

import { useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function KaiserTrackerPage() {
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
      toast({
        title: 'Sync Started',
        description: 'This is a simplified test version of the Kaiser Tracker.',
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
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
          Test Sync
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Test mode</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Test mode</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Test mode</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kaiser Tracker - Test Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This is a simplified version to test if the page loads correctly.</p>
          <p className="text-sm text-muted-foreground mt-2">
            If you see this message, the basic page structure is working.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}