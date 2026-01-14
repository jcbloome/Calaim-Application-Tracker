'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Database, CheckCircle2, AlertTriangle, Users, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TestResult {
  member: string;
  clientId?: string;
  mco?: string;
  success: boolean;
  error?: string;
  clientTableResult?: any;
  memberTableResult?: any;
}

interface TestResponse {
  success: boolean;
  message: string;
  results: TestResult[];
  summary: {
    totalTested: number;
    successful: number;
    failed: number;
  };
}

export default function CaspioTestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const { toast } = useToast();

  const runCaspioMemberSyncTest = async () => {
    setIsRunning(true);
    setTestResults(null);

    try {
      // Try Firebase function first
      console.log('🧪 Starting Caspio member sync test via Firebase function...');
      const functions = getFunctions();
      const testFunction = httpsCallable(functions, 'testCaspioMemberSync');
      
      const result = await testFunction();
      const data = result.data as TestResponse;
      
      console.log('📊 Test results:', data);
      setTestResults(data);
      
      if (data.success) {
        toast({
          title: 'Test Completed (Firebase)',
          description: data.message,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Test Failed',
          description: data.message,
        });
      }
      
    } catch (error: any) {
      console.error('❌ Firebase function failed, trying API route fallback:', error);
      
      try {
        // Fallback to API route
        console.log('🔄 Trying API route fallback...');
        const apiResponse = await fetch('/api/caspio-member-sync-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!apiResponse.ok) {
          throw new Error(`API route failed: ${apiResponse.status} ${apiResponse.statusText}`);
        }
        
        const data = await apiResponse.json() as TestResponse;
        console.log('📊 API route test results:', data);
        setTestResults(data);
        
        if (data.success) {
          toast({
            title: 'Test Completed (API Route)',
            description: data.message,
            className: 'bg-blue-100 text-blue-900 border-blue-200',
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Test Failed',
            description: data.message,
          });
        }
        
      } catch (apiError: any) {
        console.error('❌ Both Firebase function and API route failed:', apiError);
        toast({
          variant: 'destructive',
          title: 'Test Error',
          description: `Both methods failed. Firebase: ${error.message}. API: ${apiError.message}`,
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Database className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Caspio Member Sync Test</h1>
          <p className="text-muted-foreground">Test the workflow: Client Table → CalAIM Members Table</p>
        </div>
      </div>

      {/* Test Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Test Workflow
          </CardTitle>
          <CardDescription>
            This test validates the complete member sync process with mock data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold">1</div>
              <div>
                <div className="font-medium">Add to Client Table</div>
                <div className="text-sm text-muted-foreground">Create client record, get client_ID2</div>
              </div>
            </div>
            
            <div className="flex items-center justify-center">
              <ArrowRight className="h-6 w-6 text-muted-foreground" />
            </div>
            
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-semibold">2</div>
              <div>
                <div className="font-medium">Add to CalAIM Members</div>
                <div className="text-sm text-muted-foreground">Link with client_ID2, add MCO info</div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Test Data (3 Mock Members):</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• John Smith → Kaiser Permanente</li>
              <li>• Maria Garcia → Health Net</li>
              <li>• David Johnson → Blue Cross Blue Shield</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Run Test Button */}
      <Card>
        <CardHeader>
          <CardTitle>Run Test</CardTitle>
          <CardDescription>
            Execute the Caspio member sync test with mock data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={runCaspioMemberSyncTest}
            disabled={isRunning}
            size="lg"
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Running Caspio Member Sync Test...
              </>
            ) : (
              <>
                <Database className="mr-2 h-5 w-5" />
                Run Caspio Member Sync Test
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {testResults.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              Test Results
            </CardTitle>
            <CardDescription>
              {testResults.message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{testResults.summary.totalTested}</div>
                <div className="text-sm text-muted-foreground">Total Tested</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{testResults.summary.successful}</div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-red-600">{testResults.summary.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>

            {/* Individual Results */}
            <div className="space-y-3">
              <h4 className="font-medium">Individual Results:</h4>
              {testResults.results.map((result, index) => (
                <div key={index} className={`p-4 border rounded-lg ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium">{result.member}</div>
                        {result.success && (
                          <div className="text-sm text-muted-foreground">
                            Client ID: {result.clientId} • MCO: {result.mco}
                          </div>
                        )}
                        {!result.success && result.error && (
                          <div className="text-sm text-red-600">{result.error}</div>
                        )}
                      </div>
                    </div>
                    <Badge variant={result.success ? "default" : "destructive"}>
                      {result.success ? "Success" : "Failed"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      {testResults?.success && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Test Successful!</AlertTitle>
          <AlertDescription>
            The Caspio member sync workflow is working correctly. You can now proceed with:
            <ul className="mt-2 space-y-1">
              <li>• Setting up real Google Drive access</li>
              <li>• Testing Drive folder scanning</li>
              <li>• Integrating Drive → Caspio member sync</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}