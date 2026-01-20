'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Database, CheckCircle2, AlertTriangle, Users, ArrowRight, Map, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

// CS Summary Form Fields - Empty template for testing
const csSummaryFields = {
  // Step 1 - Member Info
  memberFirstName: "",
  memberLastName: "",
  memberDob: "",
  sex: "",
  memberAge: null,
  memberMediCalNum: "",
  confirmMemberMediCalNum: "",
  memberMrn: "",
  confirmMemberMrn: "",
  memberLanguage: "",
  
  // Step 1 - Referrer Info
  referrerFirstName: "",
  referrerLastName: "",
  referrerEmail: "",
  referrerPhone: "",
  referrerRelationship: "",
  agency: "",

  // Step 1 - Primary Contact Person
  bestContactFirstName: "",
  bestContactLastName: "",
  bestContactRelationship: "",
  bestContactPhone: "",
  bestContactEmail: "",
  bestContactLanguage: "",

  // Secondary Contact
  secondaryContactFirstName: "",
  secondaryContactLastName: "",
  secondaryContactRelationship: "",
  secondaryContactPhone: "",
  secondaryContactEmail: "",
  secondaryContactLanguage: "",

  // Step 1 - Legal Rep
  hasLegalRep: "",
  repFirstName: "",
  repLastName: "",
  repRelationship: "",
  repPhone: "",
  repEmail: "",

  // Step 2 - Location
  currentLocation: "",
  currentAddress: "",
  currentCity: "",
  currentState: "",
  currentZip: "",
  currentCounty: "",
  customaryLocationType: "",
  customaryAddress: "",
  customaryCity: "",
  customaryState: "",
  customaryZip: "",
  customaryCounty: "",

  // Step 3 - Health Plan & Pathway
  healthPlan: "",
  existingHealthPlan: "",
  switchingHealthPlan: "",
  pathway: "",
  meetsPathwayCriteria: null,
  snfDiversionReason: "",

  // Step 4 - ISP & RCFE
  ispFirstName: "",
  ispLastName: "",
  ispRelationship: "",
  ispPhone: "",
  ispEmail: "",
  ispLocationType: "",
  ispAddress: "",
  ispFacilityName: "",
  onALWWaitlist: "",
  monthlyIncome: "",
  ackRoomAndBoard: null,
  hasPrefRCFE: "",
  rcfeName: "",
  rcfeAddress: "",
  rcfeAdminName: "",
  rcfeAdminPhone: "",
  rcfeAdminEmail: ""
};

// CalAIM Members Table Field Names (for dropdown selection)
const caspioMembersFieldNames = [
  'client_ID2',
  'Client_ID2', 
  'Senior_First',
  'Senior_Last',
  'memberFirstName',
  'memberLastName',
  'memberMediCalNum',
  'memberMrn',
  'MCP_CIN',
  'MC',
  'memberCounty',
  'Member_County',
  'memberDob',
  'memberAge',
  'sex',
  'memberLanguage',
  'CalAIM_MCO',
  'CalAIM_MCP',
  'HealthPlan',
  'healthPlan',
  'CalAIM_Status',
  'Kaiser_Status',
  'pathway',
  'SNF_Diversion_or_Transition',
  'bestContactFirstName',
  'bestContactLastName',
  'bestContactPhone',
  'bestContactEmail',
  'bestContactRelationship',
  'bestContactLanguage',
  'secondaryContactFirstName',
  'secondaryContactLastName',
  'secondaryContactPhone',
  'secondaryContactEmail',
  'secondaryContactRelationship',
  'referrerFirstName',
  'referrerLastName',
  'referrerPhone',
  'referrerEmail',
  'referrerRelationship',
  'agency',
  'currentLocation',
  'currentAddress',
  'currentCity',
  'currentState',
  'currentZip',
  'currentCounty',
  'ispFirstName',
  'ispLastName',
  'ispPhone',
  'ispEmail',
  'ispFacilityName',
  'rcfeName',
  'rcfeAddress',
  'rcfeAdminName',
  'rcfeAdminPhone',
  'rcfeAdminEmail',
  'Kaiser_T2038_Requested_Date',
  'Kaiser_T2038_Received_Date',
  'Kaiser_Tier_Level_Requested_Date',
  'Kaiser_Tier_Level_Received_Date',
  'ILS_RCFE_Sent_For_Contract_Date',
  'ILS_RCFE_Received_Contract_Date',
  'DateCreated',
  'LastUpdated',
  'created_date',
  'last_updated',
  'next_steps_date',
  'kaiser_user_assignment'
];

// CalAIM Members Table Fields
const caspioMembersFields = {
  // Basic Member Information
  client_ID2: "12345",
  Client_ID2: "12345", // Alternative field name
  memberFirstName: "",
  memberLastName: "",
  Senior_First: "",
  Senior_Last: "",
  
  // Member Details
  memberMediCalNum: "",
  memberMrn: "",
  MCP_CIN: "", // Kaiser MRN field
  MC: "", // Medi-Cal number field
  memberCounty: "",
  Member_County: "",
  memberDob: "",
  memberAge: "",
  sex: "",
  memberLanguage: "",
  
  // Health Plan & MCO
  CalAIM_MCO: "",
  CalAIM_MCP: "",
  HealthPlan: "",
  healthPlan: "",
  
  // Status Fields
  CalAIM_Status: "",
  Kaiser_Status: "",
  pathway: "",
  SNF_Diversion_or_Transition: "",
  
  // Contact Information
  bestContactFirstName: "",
  bestContactLastName: "",
  bestContactPhone: "",
  bestContactEmail: "",
  bestContactRelationship: "",
  bestContactLanguage: "",
  
  // Secondary Contact
  secondaryContactFirstName: "",
  secondaryContactLastName: "",
  secondaryContactPhone: "",
  secondaryContactEmail: "",
  secondaryContactRelationship: "",
  
  // Referrer Information
  referrerFirstName: "",
  referrerLastName: "",
  referrerPhone: "",
  referrerEmail: "",
  referrerRelationship: "",
  agency: "",
  
  // Location Information
  currentLocation: "",
  currentAddress: "",
  currentCity: "",
  currentState: "",
  currentZip: "",
  currentCounty: "",
  
  // ISP Information
  ispFirstName: "",
  ispLastName: "",
  ispPhone: "",
  ispEmail: "",
  ispFacilityName: "",
  
  // RCFE Information
  rcfeName: "",
  rcfeAddress: "",
  rcfeAdminName: "",
  rcfeAdminPhone: "",
  rcfeAdminEmail: "",
  
  // Kaiser Process Dates
  Kaiser_T2038_Requested_Date: "",
  Kaiser_T2038_Received_Date: "",
  Kaiser_Tier_Level_Requested_Date: "",
  Kaiser_Tier_Level_Received_Date: "",
  
  // ILS RCFE Contract Dates
  ILS_RCFE_Sent_For_Contract_Date: "",
  ILS_RCFE_Received_Contract_Date: "",
  
  // Administrative Fields
  DateCreated: "",
  LastUpdated: "",
  created_date: "",
  last_updated: "",
  next_steps_date: "",
  kaiser_user_assignment: ""
};

export default function CaspioTestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const [isSingleTestRunning, setIsSingleTestRunning] = useState(false);
  const [singleTestResults, setSingleTestResults] = useState<any>(null);
  const [fieldMappings, setFieldMappings] = useState<{[key: string]: string}>({});
  const { toast } = useToast();

  const runCaspioMemberSyncTest = async () => {
    setIsRunning(true);
    setTestResults(null);

    try {
      // Go DIRECTLY to the simple API route - no Firebase function at all
      console.log('🧪 Starting SIMPLE Caspio test via API route ONLY...');
      
      const apiResponse = await fetch('/api/caspio-simple-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!apiResponse.ok) {
        throw new Error(`API route failed: ${apiResponse.status} ${apiResponse.statusText}`);
      }
      
      const data = await apiResponse.json();
      console.log('📊 Simple API test results:', data);
      
      // Convert the response to match the expected format
      const formattedData = {
        success: data.success,
        message: data.message,
        results: [{
          member: data.testData ? `${data.testData.Senior_First} ${data.testData.Senior_Last}` : 'Test User',
          success: data.success,
          clientTableResult: data.response,
          error: data.success ? undefined : data.message
        }],
        summary: {
          totalTested: 1,
          successful: data.success ? 1 : 0,
          failed: data.success ? 0 : 1
        }
      };
      
      setTestResults(formattedData);
      
      if (data.success) {
        toast({
          title: 'Test Completed (Simple API)',
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
      console.error('❌ Simple API test failed:', error);
      toast({
        variant: 'destructive',
        title: 'Test Error',
        description: `Simple API failed: ${error.message}`,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runSingleClientTest = async () => {
    setIsSingleTestRunning(true);
    setSingleTestResults(null);

    try {
      console.log('🧪 Starting Single Client → Member Test...');
      
      const response = await fetch('/api/caspio-single-client-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testClient: {
            firstName: 'TestClient',
            lastName: `Single-${new Date().toISOString().substring(0, 19).replace(/[:.]/g, '-')}`,
            seniorFirst: 'Senior',
            seniorLast: `Guardian-${new Date().toISOString().substring(0, 10)}`,
            mco: Math.random() > 0.5 ? 'Kaiser Permanente' : 'Health Net'
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`API failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📊 Single client test results:', data);
      
      setSingleTestResults(data);
      
      if (data.success) {
        toast({
          title: 'Single Client Test Successful! ✅',
          description: `Client created with ID: ${data.clientId}, Member record linked successfully`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Single Client Test Failed',
          description: data.message || 'Unknown error occurred',
        });
      }
      
    } catch (error: any) {
      console.error('❌ Single client test failed:', error);
      toast({
        variant: 'destructive',
        title: 'Test Error',
        description: `Single client test failed: ${error.message}`,
      });
    } finally {
      setIsSingleTestRunning(false);
    }
  };

  // Remove the old fallback logic since we're going direct to API
  const runCaspioMemberSyncTestOLD = async () => {
    setIsRunning(true);
    setTestResults(null);

    try {
      // Skip Firebase function for now, go directly to API route
      console.log('🧪 Starting Caspio member sync test via API route (bypassing Firebase)...');
      throw new Error('Bypassing Firebase function to test API route directly');
      
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
        // Fallback to SIMPLE API route (bypassing cache issues)
        console.log('🔄 Trying SIMPLE API route fallback...');
        const apiResponse = await fetch('/api/caspio-simple-test', {
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
          <h1 className="text-3xl font-bold">Caspio Member Sync & Field Mapping</h1>
          <p className="text-muted-foreground">Test sync workflow and map CS Summary form fields to CalAIM Members table</p>
        </div>
      </div>

      <Tabs defaultValue="sync-test" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync-test">Sync Test</TabsTrigger>
          <TabsTrigger value="field-mapping">Field Reference</TabsTrigger>
          <TabsTrigger value="interactive-mapping">Interactive Mapping</TabsTrigger>
          <TabsTrigger value="sample-data">Sample Data</TabsTrigger>
        </TabsList>

        <TabsContent value="sync-test" className="space-y-6">
          {/* EMERGENCY DIRECT TEST BUTTON - VERY VISIBLE */}
          <Card className="border-green-500 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-800">🚀 WORKING CASPIO TEST</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={async () => {
              console.log('🚀 EMERGENCY DIRECT API TEST...');
              try {
                const response = await fetch('/api/caspio-simple-test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                console.log('📊 Result:', result);
                alert(`RESULT: ${result.success ? 'SUCCESS ✅' : 'FAILED ❌'}\n${result.message}`);
              } catch (error: any) {
                console.error('❌ Error:', error);
                alert(`ERROR: ${error.message}`);
              }
            }}
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            🚀 CLICK HERE - WORKING CASPIO TEST
          </Button>
        </CardContent>
      </Card>

      {/* Single Client Test - NEW */}
      <Card className="border-blue-500 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Users className="h-5 w-5" />
            Single Client → Member Test
          </CardTitle>
          <CardDescription className="text-blue-700">
            Test the complete workflow: Create client record → Link to member table with enhanced fields
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-blue-200 rounded-lg bg-white">
              <h4 className="font-medium text-blue-900 mb-2">Test Client Data:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Name:</strong> Test Subject[1-100] (random number)</li>
                <li>• <strong>Senior:</strong> Senior Guardian[number]</li>
                <li>• <strong>MCO:</strong> Kaiser Permanente OR Health Net (random)</li>
                <li>• <strong>Fields:</strong> Senior_First, Senior_Last, CalAIM_MCO, client_ID2</li>
              </ul>
            </div>
            <div className="p-4 border border-blue-200 rounded-lg bg-white">
              <h4 className="font-medium text-blue-900 mb-2">Expected Workflow:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 1️⃣ Create record in connect_tbl_clients</li>
                <li>• 2️⃣ Get client_ID2 from response</li>
                <li>• 3️⃣ Retrieve client record with all fields</li>
                <li>• 4️⃣ Create linked record in CalAIM_tbl_Members</li>
              </ul>
            </div>
          </div>
          
          <Button 
            onClick={runSingleClientTest}
            disabled={isSingleTestRunning}
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSingleTestRunning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Testing Single Client → Member Workflow...
              </>
            ) : (
              <>
                <Database className="mr-2 h-5 w-5" />
                Run Single Client → Member Test
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Single Test Results */}
      {singleTestResults && (
        <Card className={`${singleTestResults.success ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${singleTestResults.success ? 'text-green-800' : 'text-red-800'}`}>
              {singleTestResults.success ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
              Single Client Test Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-white">
                <h4 className="font-medium mb-2">Client Table Result:</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(singleTestResults.clientResult, null, 2)}
                </pre>
              </div>
              <div className="p-4 border rounded-lg bg-white">
                <h4 className="font-medium mb-2">Member Table Result:</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(singleTestResults.memberResult, null, 2)}
                </pre>
              </div>
            </div>
            
            {singleTestResults.success && (
              <div className="p-4 bg-green-100 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">✅ Success Summary:</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• <strong>Client ID:</strong> {singleTestResults.clientId}</li>
                  <li>• <strong>Client Record:</strong> Created with Senior_First and Senior_Last</li>
                  <li>• <strong>Member Record:</strong> Linked with client_ID2 and enhanced fields</li>
                  <li>• <strong>MCO:</strong> {singleTestResults.mco}</li>
                </ul>
              </div>
            )}
            
            {!singleTestResults.success && (
              <div className="p-4 bg-red-100 border border-red-200 rounded-lg">
                <h4 className="font-medium text-red-800 mb-2">❌ Error Details:</h4>
                <p className="text-sm text-red-700">{singleTestResults.message}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            <h4 className="font-medium text-blue-900 mb-2">Test Data (Mock Members - Kaiser/Health Net Only):</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Test Subject1 → Kaiser Permanente</li>
              <li>• Test Subject2 → Health Net</li>
              <li>• Test Subject3 → Kaiser Permanente</li>
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
            className="w-full mb-4"
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
          
          {/* NEW DIRECT TEST BUTTON */}
          <Button 
            onClick={async () => {
              console.log('🚀 DIRECT API TEST - bypassing all caching...');
              try {
                const response = await fetch('/api/caspio-simple-test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                console.log('📊 DIRECT result:', result);
                alert(`Direct test result: ${result.success ? 'SUCCESS' : 'FAILED'}\n${result.message}`);
              } catch (error: any) {
                console.error('❌ Direct test error:', error);
                alert(`Direct test error: ${error.message}`);
              }
            }}
            size="lg"
            className="w-full"
            variant="outline"
          >
            🚀 DIRECT API TEST (Bypass Cache)
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
        </TabsContent>

        <TabsContent value="field-mapping" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                CS Summary Form → CalAIM Members Table Field Mapping
              </CardTitle>
              <CardDescription>
                Map fields from the CS Summary form to the corresponding CalAIM Members table fields
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* CS Summary Form Fields */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-blue-600">CS Summary Form Fields</h3>
                  <div className="space-y-4 max-h-96 overflow-y-auto border rounded-lg p-4">
                    {Object.entries(csSummaryFields).map(([key, value]) => (
                      <div key={key} className="flex flex-col gap-1 p-2 border-b">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium text-sm">{key}</Label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigator.clipboard.writeText(key)}
                            className="h-6 w-6 p-0"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input 
                          value={value?.toString() || ''} 
                          readOnly 
                          className="text-xs bg-blue-50"
                          placeholder="Sample data"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* CalAIM Members Table Fields */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-green-600">CalAIM Members Table Fields</h3>
                  <div className="space-y-4 max-h-96 overflow-y-auto border rounded-lg p-4">
                    {Object.entries(caspioMembersFields).map(([key, value]) => (
                      <div key={key} className="flex flex-col gap-1 p-2 border-b">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium text-sm">{key}</Label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigator.clipboard.writeText(key)}
                            className="h-6 w-6 p-0"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input 
                          value={value?.toString() || ''} 
                          readOnly 
                          className="text-xs bg-green-50"
                          placeholder="Caspio field (empty)"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-medium text-yellow-800 mb-2">Field Mapping Notes:</h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li>• <strong>Direct Matches:</strong> memberFirstName → memberFirstName, memberLastName → memberLastName</li>
                  <li>• <strong>Alternative Names:</strong> memberFirstName → Senior_First, memberMrn → MCP_CIN</li>
                  <li>• <strong>MCO Restriction:</strong> healthPlan must be "Kaiser" or "Health Net" only</li>
                  <li>• <strong>ID Fields:</strong> client_ID2 and Client_ID2 are the same field with different casing</li>
                  <li>• <strong>Status Fields:</strong> CalAIM_Status, Kaiser_Status track different workflow stages</li>
                  <li>• <strong>Date Fields:</strong> Multiple date tracking fields for Kaiser processes and ILS contracts</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interactive-mapping" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                Interactive Field Mapping Tool
              </CardTitle>
              <CardDescription>
                Map each CS Summary form field to its corresponding CalAIM Members table field
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Mapping Controls */}
                <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-blue-900">Field Mapping Progress</h4>
                    <p className="text-sm text-blue-700">
                      {Object.keys(fieldMappings).length} of {Object.keys(csSummaryFields).length} fields mapped
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setFieldMappings({})}
                    >
                      Clear All
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => {
                        // Auto-map obvious matches
                        const autoMappings: {[key: string]: string} = {};
                        Object.keys(csSummaryFields).forEach(csField => {
                          if (caspioMembersFieldNames.includes(csField)) {
                            autoMappings[csField] = csField;
                          }
                        });
                        setFieldMappings(autoMappings);
                        toast({
                          title: "Auto-mapping Complete",
                          description: `Mapped ${Object.keys(autoMappings).length} obvious matches`,
                          className: 'bg-green-100 text-green-900 border-green-200',
                        });
                      }}
                    >
                      Auto-Map Matches
                    </Button>
                  </div>
                </div>

                {/* Field Mapping Grid */}
                <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto border rounded-lg p-4">
                  {Object.entries(csSummaryFields).map(([csField, sampleValue]) => (
                    <div key={csField} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded-lg bg-gray-50">
                      {/* CS Summary Field */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-blue-700">CS Summary Field</Label>
                        <div className="p-2 bg-blue-100 rounded border">
                          <div className="font-mono text-sm font-medium">{csField}</div>
                          <div className="text-xs text-blue-600 mt-1 truncate">
                            Sample: {sampleValue?.toString() || 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Mapping Arrow */}
                      <div className="flex items-center justify-center">
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                      </div>

                      {/* CalAIM Members Field Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-green-700">CalAIM Members Field</Label>
                        <Select 
                          value={fieldMappings[csField] || 'no-mapping'} 
                          onValueChange={(value) => {
                            if (value === 'no-mapping') {
                              // Remove the mapping if "No Mapping" is selected
                              setFieldMappings(prev => {
                                const newMappings = { ...prev };
                                delete newMappings[csField];
                                return newMappings;
                              });
                            } else {
                              setFieldMappings(prev => ({
                                ...prev,
                                [csField]: value
                              }));
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select CalAIM field..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no-mapping">-- No Mapping --</SelectItem>
                            {caspioMembersFieldNames.map(fieldName => (
                              <SelectItem key={fieldName} value={fieldName}>
                                {fieldName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldMappings[csField] && (
                          <div className="text-xs text-green-600 font-mono">
                            ✓ Mapped to: {fieldMappings[csField]}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Export Mappings */}
                <div className="p-4 bg-gray-50 border rounded-lg">
                  <h4 className="font-medium mb-2">Export Field Mappings</h4>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        const mappingJson = JSON.stringify(fieldMappings, null, 2);
                        navigator.clipboard.writeText(mappingJson);
                        toast({
                          title: "Mappings Copied",
                          description: "Field mappings copied to clipboard as JSON",
                        });
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy as JSON
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        const mappingCode = Object.entries(fieldMappings)
                          .map(([cs, caspio]) => `  ${caspio}: formData.${cs},`)
                          .join('\n');
                        navigator.clipboard.writeText(`const memberData = {\n${mappingCode}\n};`);
                        toast({
                          title: "Code Copied",
                          description: "Field mappings copied as JavaScript object",
                        });
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy as Code
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sample-data" className="space-y-6">
          {/* MCO Restriction Notice */}
          <Card className="border-orange-500 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-800">🏥 MCO Restriction</CardTitle>
              <CardDescription className="text-orange-700">
                All mock applications must use only Kaiser Permanente or Health Net as MCO
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-white border border-orange-200 rounded">
                  <h4 className="font-medium text-orange-900 mb-2">✅ Allowed MCOs:</h4>
                  <ul className="text-sm text-orange-800 space-y-1">
                    <li>• Kaiser Permanente</li>
                    <li>• Health Net</li>
                  </ul>
                </div>
                <div className="p-3 bg-white border border-orange-200 rounded">
                  <h4 className="font-medium text-orange-900 mb-2">❌ Not Allowed:</h4>
                  <ul className="text-sm text-orange-800 space-y-1">
                    <li>• Blue Cross Blue Shield</li>
                    <li>• Anthem</li>
                    <li>• Other MCOs</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CS Summary Sample Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-blue-600">CS Summary Form Sample Data</CardTitle>
                <CardDescription>Complete sample data for all CS Summary form fields</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={JSON.stringify(csSummaryFields, null, 2)}
                  readOnly
                  className="h-96 font-mono text-xs"
                />
                <Button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(csSummaryFields, null, 2))}
                  className="mt-2 w-full"
                  variant="outline"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy CS Summary Sample Data
                </Button>
              </CardContent>
            </Card>

            {/* CalAIM Members Sample Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600">CalAIM Members Table Structure</CardTitle>
                <CardDescription>All available fields in the CalAIM Members table</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={JSON.stringify(caspioMembersFields, null, 2)}
                  readOnly
                  className="h-96 font-mono text-xs"
                />
                <Button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(caspioMembersFields, null, 2))}
                  className="mt-2 w-full"
                  variant="outline"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Members Table Structure
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Field Categories */}
          <Card>
            <CardHeader>
              <CardTitle>Field Categories & Mapping Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-blue-600 mb-2">Member Information</h4>
                  <ul className="text-sm space-y-1">
                    <li>• memberFirstName → Senior_First</li>
                    <li>• memberLastName → Senior_Last</li>
                    <li>• memberDob → memberDob</li>
                    <li>• memberAge → memberAge</li>
                    <li>• sex → sex</li>
                    <li>• memberLanguage → memberLanguage</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-green-600 mb-2">Health Plan & IDs</h4>
                  <ul className="text-sm space-y-1">
                    <li>• memberMediCalNum → MC</li>
                    <li>• memberMrn → MCP_CIN (Kaiser/Health Net)</li>
                    <li>• healthPlan → CalAIM_MCO (Kaiser/Health Net only)</li>
                    <li>• pathway → SNF_Diversion_or_Transition</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-purple-600 mb-2">Contact Information</h4>
                  <ul className="text-sm space-y-1">
                    <li>• bestContactFirstName → bestContactFirstName</li>
                    <li>• bestContactLastName → bestContactLastName</li>
                    <li>• bestContactPhone → bestContactPhone</li>
                    <li>• bestContactEmail → bestContactEmail</li>
                    <li>• referrerFirstName → referrerFirstName</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-orange-600 mb-2">Location Data</h4>
                  <ul className="text-sm space-y-1">
                    <li>• currentLocation → currentLocation</li>
                    <li>• currentAddress → currentAddress</li>
                    <li>• currentCity → currentCity</li>
                    <li>• currentCounty → Member_County</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-red-600 mb-2">ISP & RCFE</h4>
                  <ul className="text-sm space-y-1">
                    <li>• ispFirstName → ispFirstName</li>
                    <li>• ispLastName → ispLastName</li>
                    <li>• ispFacilityName → ispFacilityName</li>
                    <li>• rcfeName → rcfeName</li>
                    <li>• rcfeAdminName → rcfeAdminName</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-gray-600 mb-2">Administrative</h4>
                  <ul className="text-sm space-y-1">
                    <li>• client_ID2 (generated)</li>
                    <li>• CalAIM_Status (workflow)</li>
                    <li>• Kaiser_Status (Kaiser only)</li>
                    <li>• DateCreated (auto)</li>
                    <li>• LastUpdated (auto)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}