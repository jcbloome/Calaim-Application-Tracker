'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestResetPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const testReset = async () => {
    setIsLoading(true);
    setResult('');
    
    try {
      console.log('Testing password reset for:', email);
      
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      console.log('Response:', { status: response.status, data });
      
      if (response.ok) {
        setResult(`✅ SUCCESS: ${data.message}`);
      } else {
        setResult(`❌ ERROR: ${data.error}`);
      }
    } catch (error) {
      console.error('Test error:', error);
      setResult(`❌ NETWORK ERROR: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Test Password Reset API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Input
              type="email"
              placeholder="Enter email to test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button 
            onClick={testReset} 
            disabled={isLoading || !email}
            className="w-full"
          >
            {isLoading ? 'Testing...' : 'Test Password Reset'}
          </Button>
          {result && (
            <div className="p-3 bg-gray-100 rounded text-sm whitespace-pre-wrap">
              {result}
            </div>
          )}
          <div className="text-xs text-gray-500">
            Check the browser console and server logs for detailed information.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}