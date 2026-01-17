'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export default function EnhancedCaliforniaMapPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      console.log('🔄 Testing API calls...');
      
      const [staffResponse, rcfeResponse] = await Promise.all([
        fetch('/api/staff-locations'),
        fetch('/api/rcfe-locations')
      ]);

      const staffResult = await staffResponse.json();
      const rcfeResult = await rcfeResponse.json();

      console.log('📊 Staff result:', staffResult);
      console.log('🏠 RCFE result:', rcfeResult);

      setData({ staff: staffResult, rcfe: rcfeResult });
    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">California Resource Map (Simple Test)</h1>
          <p className="text-muted-foreground">
            Testing basic functionality and API calls
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Test API Calls'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>API Test Results</CardTitle>
            <CardDescription>
              Click the button above to test API calls and see console output
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>Testing API calls...</span>
              </div>
            ) : data ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">Staff API Result:</h3>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(data.staff, null, 2)}
                  </pre>
                </div>
                <div>
                  <h3 className="font-semibold">RCFE API Result:</h3>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(data.rcfe, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Click the test button to see results</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Click "Test API Calls" button above</li>
              <li>Open browser console (F12 → Console tab)</li>
              <li>Look for detailed debugging output</li>
              <li>Check the API results displayed above</li>
              <li>This will help identify field mapping issues</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}