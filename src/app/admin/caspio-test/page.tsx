'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Database, CheckCircle2, AlertTriangle, Users, ArrowRight, Map, Copy, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCaspioSync } from '@/modules/caspio-integration';
import { useAuth } from '@/firebase';

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
  memberMediCalNum: "",
  memberMrn: "",
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
  rcfePreferredCities: "",
  rcfeAdminFirstName: "",
  rcfeAdminLastName: "",
  rcfeAdminPhone: "",
  rcfeAdminEmail: ""
};

// CalAIM Members Table Field Names (loaded from Caspio)
const caspioMembersFieldNames: string[] = [];

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
  const auth = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const [isSingleTestRunning, setIsSingleTestRunning] = useState(false);
  const [singleTestResults, setSingleTestResults] = useState<any>(null);
  const [singleTestPreviewOpen, setSingleTestPreviewOpen] = useState(false);
  const [singleTestPreviewFields, setSingleTestPreviewFields] = useState<string[]>([]);
  const [singleTestPreviewCounts, setSingleTestPreviewCounts] = useState<{ payload?: number; mapped?: number } | null>(null);
  const [singleTestPreviewPayload, setSingleTestPreviewPayload] = useState<Record<string, any> | null>(null);
  const [singleTestSendStatus, setSingleTestSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [singleTestSendError, setSingleTestSendError] = useState<string | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [isSingleTestPreviewLoading, setIsSingleTestPreviewLoading] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<{[key: string]: string}>({});
  const [isRefreshingCaspioFields, setIsRefreshingCaspioFields] = useState(false);
  const [isRefreshingAppFields, setIsRefreshingAppFields] = useState(false);
  const [isLoadingCachedFields, setIsLoadingCachedFields] = useState(false);
  const [dynamicCaspioFields, setDynamicCaspioFields] = useState<string[]>(caspioMembersFieldNames);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const { toast } = useToast();
  const [lockedMappings, setLockedMappings] = useState<{[key: string]: string} | null>(null);
  const [hasDraftMappings, setHasDraftMappings] = useState(false);
  const [hasLockedMappings, setHasLockedMappings] = useState(false);
  const [lockedMappingCount, setLockedMappingCount] = useState(0);
  const [draftName, setDraftName] = useState('');
  const [namedDrafts, setNamedDrafts] = useState<Record<string, {[key: string]: string}>>({});
  const [selectedDraftName, setSelectedDraftName] = useState('');
  const [lastDraftName, setLastDraftName] = useState('');
  const draftKey = 'calaim_cs_caspio_mapping_draft';
  const lockedKey = 'calaim_cs_caspio_mapping';
  const caspioFieldsKey = 'calaim_caspio_fields_cache';
  const namedDraftsKey = 'calaim_cs_caspio_mapping_named_drafts';
  const lastDraftNameKey = 'calaim_cs_caspio_mapping_last_draft_name';
  
  // Use new Caspio integration module
  const { 
    members, 
    syncStatus, 
    isLoading, 
    isSyncing, 
    error, 
    syncMembers, 
    performFullSync, 
    clearError 
  } = useCaspioSync();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(lockedKey);
      let lockedLoaded = false;
      if (stored) {
        const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') {
          setLockedMappings(parsed);
          setFieldMappings(parsed);
            const count = Object.keys(parsed).length;
            setLockedMappingCount(count);
            setHasLockedMappings(count > 0);
          lockedLoaded = true;
        }
      }
      if (!lockedLoaded) {
        const draftStored = localStorage.getItem(draftKey);
        if (draftStored) {
          const parsedDraft = JSON.parse(draftStored);
          if (parsedDraft && typeof parsedDraft === 'object') {
            setFieldMappings(parsedDraft);
            setHasDraftMappings(Object.keys(parsedDraft).length > 0);
          }
        }
      }
      const namedDraftsStored = localStorage.getItem(namedDraftsKey);
      if (namedDraftsStored) {
        const parsedNamed = JSON.parse(namedDraftsStored);
        if (parsedNamed && typeof parsedNamed === 'object') {
          setNamedDrafts(parsedNamed);
        }
      }
      const lastDraftStored = localStorage.getItem(lastDraftNameKey);
      if (lastDraftStored) {
        setLastDraftName(lastDraftStored);
      }
    } catch (error) {
      console.error('Failed to load saved field mappings:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasLockedMappings) return;
    const stored = localStorage.getItem(lockedKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        setHasLockedMappings(true);
      }
    } catch (error) {
      console.warn('Failed to parse locked mapping cache:', error);
    }
  }, [hasLockedMappings, lockedKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lockedMappings) return;
    if (Object.keys(fieldMappings).length === 0) {
      localStorage.removeItem(draftKey);
      setHasDraftMappings(false);
      return;
    }
    localStorage.setItem(draftKey, JSON.stringify(fieldMappings));
    setHasDraftMappings(true);
  }, [fieldMappings, lockedMappings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const blocked = new Set(['CalAIM_Status']);
    let didUpdate = false;
    const cleanedMappings: {[key: string]: string} = {};
    Object.entries(fieldMappings).forEach(([csField, caspioField]) => {
      if (blocked.has(caspioField)) {
        didUpdate = true;
        return;
      }
      cleanedMappings[csField] = caspioField;
    });
    if (didUpdate) {
      setFieldMappings(cleanedMappings);
    }
    if (lockedMappings) {
      let lockedUpdated = false;
      const cleanedLocked: {[key: string]: string} = {};
      Object.entries(lockedMappings).forEach(([csField, caspioField]) => {
        if (blocked.has(caspioField)) {
          lockedUpdated = true;
          return;
        }
        cleanedLocked[csField] = caspioField;
      });
      if (lockedUpdated) {
        setLockedMappings(cleanedLocked);
        localStorage.setItem(lockedKey, JSON.stringify(cleanedLocked));
        const count = Object.keys(cleanedLocked).length;
        setLockedMappingCount(count);
        setHasLockedMappings(count > 0);
      }
    }
  }, [fieldMappings, lockedMappings, lockedKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadCachedCaspioFields = async () => {
      setIsLoadingCachedFields(true);
      try {
        const idToken = await auth?.currentUser?.getIdToken().catch(() => undefined);
        const response = await fetch('/api/caspio-table-fields?tableName=CalAIM_tbl_Members', {
          method: 'GET',
          headers: {
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        });

        const data = await response.json();

        if (!response.ok) {
          console.warn('Cached Caspio field load failed:', data?.error || data);
          throw new Error(data?.error || 'Failed to load cached Caspio fields');
        }

        if (data.success && Array.isArray(data.fields)) {
          setDynamicCaspioFields(data.fields);
          if (data.updatedAt) {
            setLastRefreshTime(new Date(data.updatedAt).getTime());
          }
          if (data.fields.length > 0) {
            localStorage.setItem(caspioFieldsKey, JSON.stringify({
              fields: data.fields,
              updatedAt: Date.now(),
            }));
          }
        }
      } catch (error: any) {
        console.warn('Failed to load cached Caspio fields:', error?.message || error);
        const fallback = localStorage.getItem(caspioFieldsKey);
        if (fallback) {
          try {
            const parsed = JSON.parse(fallback);
            if (Array.isArray(parsed?.fields)) {
              setDynamicCaspioFields(parsed.fields);
              if (parsed.updatedAt) {
                setLastRefreshTime(parsed.updatedAt);
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse local Caspio field cache:', parseError);
          }
        }
      } finally {
        setIsLoadingCachedFields(false);
      }
    };

    loadCachedCaspioFields();
  }, [auth?.currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (dynamicCaspioFields.length === 0) return;
    localStorage.setItem(caspioFieldsKey, JSON.stringify({
      fields: dynamicCaspioFields,
      updatedAt: Date.now(),
    }));
  }, [dynamicCaspioFields]);

  const loadSavedCaspioFields = async () => {
    if (typeof window === 'undefined') return;
    try {
      const fallback = localStorage.getItem(caspioFieldsKey);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed?.fields) && parsed.fields.length > 0) {
          setDynamicCaspioFields(parsed.fields);
          if (parsed.updatedAt) {
            setLastRefreshTime(parsed.updatedAt);
          }
          toast({
            title: "Saved Fields Loaded",
            description: `Loaded ${parsed.fields.length} cached fields from this browser.`,
          });
          return;
        }
      }

      const idToken = await auth?.currentUser?.getIdToken().catch(() => undefined);
      const response = await fetch('/api/caspio-table-fields?tableName=CalAIM_tbl_Members', {
        method: 'GET',
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });

      const data = await response.json();
      if (response.ok && data.success && Array.isArray(data.fields) && data.fields.length > 0) {
        setDynamicCaspioFields(data.fields);
        if (data.updatedAt) {
          setLastRefreshTime(new Date(data.updatedAt).getTime());
        } else {
          setLastRefreshTime(Date.now());
        }
        localStorage.setItem(caspioFieldsKey, JSON.stringify({
          fields: data.fields,
          updatedAt: Date.now(),
        }));
        toast({
          title: "Saved Fields Loaded",
          description: `Loaded ${data.fields.length} fields from saved cache.`,
        });
        return;
      }
      throw new Error('No cached fields returned from API.');
    } catch (error: any) {
      const fallback = localStorage.getItem(caspioFieldsKey);
      if (!fallback) {
        toast({
          variant: "destructive",
          title: "No Saved Fields",
          description: "No saved Caspio field list found in this browser.",
        });
        return;
      }
      try {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed?.fields) && parsed.fields.length > 0) {
          setDynamicCaspioFields(parsed.fields);
          if (parsed.updatedAt) {
            setLastRefreshTime(parsed.updatedAt);
          }
          toast({
            title: "Saved Fields Loaded",
            description: `Loaded ${parsed.fields.length} cached fields from this browser.`,
          });
          return;
        }
        throw new Error('Saved cache is empty.');
      } catch (parseError: any) {
        toast({
          variant: "destructive",
          title: "Load Failed",
          description: parseError.message || "Could not load saved Caspio fields.",
        });
      }
    }
  };

  const refreshCaspioFields = async () => {
    // Rate limiting: prevent calls within 5 seconds of each other
    const now = Date.now();
    const RATE_LIMIT_MS = 5000; // 5 seconds
    
    if (now - lastRefreshTime < RATE_LIMIT_MS) {
      toast({
        variant: "destructive",
        title: "Please Wait",
        description: "Please wait a few seconds between refresh attempts",
      });
      return;
    }
    
    setIsRefreshingCaspioFields(true);
    setLastRefreshTime(now);
    
    try {
      console.log('🔄 [FIELD-REFRESH] Starting Caspio field refresh...');
      
      if (!auth?.currentUser) {
        toast({
          variant: "destructive",
          title: "Admin Session Missing",
          description: "Please sign out and sign back in to refresh Caspio fields.",
        });
        return;
      }

      const idToken = await auth.currentUser.getIdToken().catch(() => undefined);
      const response = await fetch('/api/caspio-table-fields', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ tableName: 'CalAIM_tbl_Members' }),
      });

      const data = await response.json();

      if (!response.ok) {
        const details = data?.details ? ` ${data.details}` : '';
        throw new Error(`${data?.error || 'Failed to fetch Caspio fields'}${details}`);
      }
      
      if (data.success && data.fields) {
        const normalizedFields = Array.isArray(data.fields)
          ? data.fields.filter((field: any) => typeof field === 'string')
          : [];

        setDynamicCaspioFields(normalizedFields);
        setLastRefreshTime(Date.now());
        localStorage.setItem(caspioFieldsKey, JSON.stringify({
          fields: normalizedFields,
          updatedAt: Date.now(),
        }));
        console.log('✅ [FIELD-REFRESH] Successfully updated field list', {
          count: normalizedFields.length,
          sample: normalizedFields.slice(0, 5)
        });
        if (normalizedFields.length === 0) {
          toast({
            variant: "destructive",
            title: "No Caspio Fields Returned",
            description: `Schema returned 0 fields. Check Caspio table name or schema. URL: ${data.schemaUrl || 'unknown'}`,
          });
        } else {
          toast({
            title: "Caspio Fields Refreshed",
            description: `Found ${normalizedFields.length} fields in CalAIM_tbl_Members table`,
          });
        }
      } else {
        throw new Error(data.message || 'Failed to fetch Caspio fields');
      }
    } catch (error: any) {
      console.error('❌ [FIELD-REFRESH] Error refreshing Caspio fields:', error);
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: error.message || "Could not refresh Caspio field names",
      });
    } finally {
      setIsRefreshingCaspioFields(false);
      console.log('🏁 [FIELD-REFRESH] Refresh operation completed');
    }
  };

  const refreshAppFields = async () => {
    setIsRefreshingAppFields(true);
    try {
      // Simulate refreshing app fields - in a real scenario, this might reload from a config file
      // For now, we'll just show a success message since the fields are hardcoded
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      toast({
        title: "App Fields Refreshed",
        description: `CS Summary form fields reloaded (${Object.keys(csSummaryFields).length} fields)`,
      });
    } catch (error: any) {
      console.error('Error refreshing app fields:', error);
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Could not refresh app field definitions",
      });
    } finally {
      setIsRefreshingAppFields(false);
    }
  };

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

  const getLockedFieldNames = () => {
    if (!lockedMappings || Object.keys(lockedMappings).length === 0) {
      return null;
    }
    return Object.values(lockedMappings).filter((field) => field !== 'CalAIM_Status');
  };

  const buildSingleClientPayload = () => {
    const fieldNames = getLockedFieldNames();
    if (!fieldNames) return null;
    return {
      fieldNames,
      testClient: {
        firstName: 'TestClient',
        lastName: `Single-${new Date().toISOString().substring(0, 19).replace(/[:.]/g, '-')}`,
        seniorFirst: 'Senior',
        seniorLast: `Guardian-${new Date().toISOString().substring(0, 10)}`,
      mco: Math.random() > 0.5 ? 'Kaiser' : 'Health Net'
      }
    };
  };

  const loadSingleClientPreview = async (openDialog: boolean) => {
    setIsSingleTestPreviewLoading(true);
    try {
      const payload = buildSingleClientPayload();
      if (!payload) {
        if (openDialog) {
          toast({
            variant: 'destructive',
            title: 'Locked Mapping Required',
            description: 'Lock your field mappings before running the sync test.',
          });
        }
        return;
      }
      const response = await fetch('/api/caspio-single-client-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          dryRun: true,
        }),
      });

      const data = await response.json().catch(async () => ({
        success: false,
        message: await response.text()
      }));

      if (!response.ok) {
        const errorMessage = data?.message || data?.error || `API failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      setSingleTestPreviewFields(Array.isArray(data.payloadFields) ? data.payloadFields : []);
      setSingleTestPreviewCounts({
        payload: data.payloadFieldCount,
        mapped: data.mappedFieldCount
      });
      setSingleTestPreviewPayload(data?.payloadPreview && typeof data.payloadPreview === 'object' ? data.payloadPreview : null);
      if (openDialog) {
        setSingleTestPreviewOpen(true);
      }
      setSingleTestSendStatus('idle');
      setSingleTestSendError(null);
    } catch (error: any) {
      console.error('❌ Single client preview failed:', error);
      if (openDialog) {
        toast({
          variant: 'destructive',
          title: 'Preview Error',
          description: `Single client preview failed: ${error.message}`,
        });
      }
    } finally {
      setIsSingleTestPreviewLoading(false);
    }
  };

  const previewSingleClientTest = async () => loadSingleClientPreview(true);

  useEffect(() => {
    if (!lockedMappings) return;
    loadSingleClientPreview(false);
  }, [lockedMappings]);

  const runSingleClientTest = async () => {
    setIsSingleTestRunning(true);
    setSingleTestResults(null);
    setSingleTestSendStatus('idle');
    setSingleTestSendError(null);

    try {
      const payload = buildSingleClientPayload();
      if (!payload) {
        toast({
          variant: 'destructive',
          title: 'Locked Mapping Required',
          description: 'Lock your field mappings before sending to Caspio.',
        });
        return;
      }
      console.log('🧪 Starting Single Client → Member Test...');
      
      const response = await fetch('/api/caspio-single-client-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json().catch(async () => ({
        success: false,
        message: await response.text()
      }));

      if (!response.ok) {
        const errorMessage = data?.message || data?.error || `API failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }
      console.log('📊 Single client test results:', data);
      
      setSingleTestResults(data);
      
      if (data.success) {
        setSingleTestSendStatus('success');
        toast({
          title: 'Single Client Test Successful! ✅',
          description: `Client created with ID: ${data.clientId}. ${data.mappedFieldCount ?? 0} fields imported into CalAIM_tbl_Members.`,
          className: 'bg-green-100 text-green-900 border-green-200',
          duration: 3000,
        });
      } else {
        setSingleTestSendStatus('error');
        setSingleTestSendError(data.message || 'Unknown error occurred');
        toast({
          variant: 'destructive',
          title: 'Single Client Test Failed',
          description: data.message || 'Unknown error occurred',
        });
      }
      
    } catch (error: any) {
      console.error('❌ Single client test failed:', error);
      setSingleTestSendStatus('error');
      setSingleTestSendError(error.message || 'Unknown error occurred');
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

  const lockedMappingEntries = lockedMappings
    ? Object.entries(lockedMappings).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const autoSaveLabel = lastDraftName || 'Draft 1';
  const getNextDraftName = () => {
    const names = Object.keys(namedDrafts);
    const usedNumbers = names
      .map((name) => {
        const match = name.match(/^Draft\s+(\d+)$/i);
        return match ? Number(match[1]) : null;
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const nextNumber = usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1;
    return `Draft ${nextNumber}`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Database className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Caspio Member Sync & Field Mapping</h1>
          <p className="text-muted-foreground">Test sync workflow and map CS Summary form fields to Caspio CalAIM_tbl_Members</p>
        </div>
      </div>

      <Tabs defaultValue="interactive-mapping" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="interactive-mapping">Field Mapping</TabsTrigger>
          <TabsTrigger value="sync-test">Sync Test</TabsTrigger>
        </TabsList>

        <TabsContent value="sync-test" className="space-y-6">
      {/* Single Client Test - NEW */}
      <Card className="border-blue-500 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Users className="h-5 w-5" />
            Single Client → Member Test
          </CardTitle>
          <CardDescription className="text-blue-700">
            Uses locked mapping fields to create mock data, preview mapped fields, then send to Caspio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={previewSingleClientTest}
            disabled={isSingleTestRunning || isSingleTestPreviewLoading || !lockedMappings}
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSingleTestRunning || isSingleTestPreviewLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Preparing Field Preview...
              </>
            ) : (
              <>
                <Database className="mr-2 h-5 w-5" />
                Load Mock Data → Preview Mapped Fields
              </>
            )}
          </Button>
          {!lockedMappings && (
            <div className="text-xs text-blue-700">
              Lock your field mappings first to run the sync test.
            </div>
          )}
          <AlertDialog open={singleTestPreviewOpen} onOpenChange={setSingleTestPreviewOpen}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Mapped Fields Preview</AlertDialogTitle>
                <AlertDialogDescription>
                  Mock data has been prepared from your locked mappings. Review before sending to Caspio.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {singleTestSendStatus === 'success' && (
                <Alert className="border-green-200 bg-green-50 text-green-900">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Sent to Caspio</AlertTitle>
                  <AlertDescription>
                    Payload sent successfully. Checkmark indicates the send completed.
                  </AlertDescription>
                </Alert>
              )}
              {singleTestSendStatus === 'error' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Send Failed</AlertTitle>
                  <AlertDescription>
                    {singleTestSendError || 'Could not send payload to Caspio.'}
                  </AlertDescription>
                </Alert>
              )}
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Locked mappings: {lockedMappingEntries.length}</div>
                <div>Payload fields: {singleTestPreviewCounts?.payload ?? 0}</div>
                <div>Mapped fields (written): {singleTestPreviewCounts?.mapped ?? 0}</div>
              </div>
              {lockedMappingEntries.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Locked field mappings</div>
                  <div className="max-h-48 overflow-y-auto rounded border p-3 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                      {lockedMappingEntries.map(([csField, caspioField]) => (
                        <div key={csField} className="font-mono">
                          {csField} → {caspioField}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="text-sm font-medium">Payload fields to send (with mock data)</div>
                <div className="max-h-48 overflow-y-auto rounded border p-3 text-xs">
                  {singleTestPreviewPayload ? (
                    <div className="grid grid-cols-1 gap-y-1">
                      {Object.entries(singleTestPreviewPayload).map(([field, value]) => (
                        <div key={field} className="font-mono">
                          {field}: <span className="text-muted-foreground">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : singleTestPreviewFields.length === 0 ? (
                    <div>No fields returned from preview.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                      {singleTestPreviewFields.map((field) => (
                        <div key={field} className="font-mono">{field}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    runSingleClientTest();
                  }}
                >
                  Send to Caspio
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Locked Mapping Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Locked Mapping Verification
          </CardTitle>
          <CardDescription>
            Shows which locked mapping fields are included in the mock payload and last test payload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!lockedMappings ? (
            <Alert variant="destructive">
              <AlertTitle>No Locked Mapping</AlertTitle>
              <AlertDescription>
                Lock your field mappings first to verify which fields are sent.
              </AlertDescription>
            </Alert>
          ) : (
            (() => {
              const previewFields = new Set<string>(
                Array.isArray(singleTestPreviewFields) ? singleTestPreviewFields : []
              );
              const payloadFields = new Set<string>(
                Array.isArray(singleTestResults?.payloadFields) ? singleTestResults.payloadFields : []
              );
              const entries = Object.entries(lockedMappings);
              const failed = entries.filter(([, caspioField]) => !previewFields.has(caspioField) && !payloadFields.has(caspioField));

              return (
                <>
                  <div className="text-sm text-muted-foreground">
                    Total locked mappings: {entries.length} • Included in mock payload: {entries.length - failed.length} • Missing: {failed.length}
                  </div>
                  <div className="rounded border p-3 space-y-2 max-h-64 overflow-y-auto">
                    {entries.map(([csField, caspioField]) => {
                      const isIncluded = previewFields.has(caspioField) || payloadFields.has(caspioField);
                      return (
                        <div key={`${csField}-${caspioField}`} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {isIncluded ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="font-mono">{csField}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono text-green-700">{caspioField}</span>
                          </div>
                          <span className={`text-xs ${isIncluded ? 'text-green-600' : 'text-destructive'}`}>
                            {isIncluded ? 'Included' : 'Missing'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {failed.length > 0 && (
                    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <div className="font-medium mb-1">Error Log</div>
                      <div className="space-y-1">
                        {failed.map(([csField, caspioField]) => (
                          <div key={`${csField}-${caspioField}-error`}>
                            Missing in payload: {csField} → {caspioField}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()
          )}
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

        {/* Field Reference tab removed per request */}

        <TabsContent value="interactive-mapping" className="space-y-6">
          <Card>
            <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
              CS Summary → Caspio CalAIM_tbl_Members
              </CardTitle>
              <CardDescription>
              Map each CS Summary field (with example) to a Caspio CalAIM_tbl_Members field
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Mapping Controls */}
                <div className="flex flex-col gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div>
                    <h4 className="font-medium text-blue-900">Field Mapping Progress</h4>
                    <p className="text-sm text-blue-700">
                      {Object.keys(fieldMappings).length} of {Object.keys(csSummaryFields).length} fields mapped
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Last updated: {isLoadingCachedFields ? 'Loading cached fields...' : (lastRefreshTime > 0 ? new Date(lastRefreshTime).toLocaleString() : 'Not yet loaded')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          Clear All
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear all mappings?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove all field mappings and unlock any locked mapping. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setFieldMappings({});
                              setLockedMappings(null);
                              localStorage.removeItem(lockedKey);
                              setHasLockedMappings(false);
                              setLockedMappingCount(0);
                            }}
                          >
                            Clear All
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant={lockedMappings ? 'default' : 'outline'} size="sm">
                          {lockedMappings ? (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-100" />
                              Locked Actions
                            </>
                          ) : (
                            'Mapping Lock Actions'
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onSelect={() => {
                            if (Object.keys(fieldMappings).length === 0) {
                              toast({
                                variant: "destructive",
                                title: "No Mappings to Lock",
                                description: "Map at least one field before locking.",
                              });
                              return;
                            }
                            setLockedMappings(fieldMappings);
                            localStorage.setItem(lockedKey, JSON.stringify(fieldMappings));
                            localStorage.removeItem(draftKey);
                            setHasDraftMappings(false);
                            const count = Object.keys(fieldMappings).length;
                            setLockedMappingCount(count);
                            setHasLockedMappings(count > 0);
                            toast({
                              title: "Mappings Locked",
                              description: "Field mapping saved and ready for export.",
                              className: 'bg-green-100 text-green-900 border-green-200',
                              duration: 3000,
                            });
                          }}
                          disabled={!!lockedMappings}
                        >
                          Lock Mappings
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setLockedMappings(null);
                            if (lockedMappings) {
                              setFieldMappings(lockedMappings);
                            }
                            toast({
                              title: "Mappings Unlocked",
                              description: "You can edit mappings again.",
                            });
                          }}
                          disabled={!lockedMappings}
                        >
                          Unlock
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            const stored = localStorage.getItem(lockedKey);
                            if (!stored) {
                              toast({
                                variant: "destructive",
                                title: "No Locked Mapping",
                                description: "There is no locked mapping to load.",
                              });
                              return;
                            }
                            try {
                              const parsed = JSON.parse(stored);
                              if (parsed && typeof parsed === 'object') {
                                setLockedMappings(parsed);
                                setFieldMappings(parsed);
                                const count = Object.keys(parsed).length;
                                setLockedMappingCount(count);
                                setHasLockedMappings(count > 0);
                                toast({
                                  title: "Locked Mapping Loaded",
                                  description: "Saved locked mapping restored.",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                variant: "destructive",
                                title: "Load Failed",
                                description: error.message || "Could not load locked mapping.",
                              });
                            }
                          }}
                          disabled={!hasLockedMappings}
                        >
                          Load Locked{hasLockedMappings && lockedMappingCount > 0 ? ` (${lockedMappingCount})` : ''}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {lockedMappings && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLockedMappings(null);
                          setFieldMappings(lockedMappings);
                          toast({
                            title: "Mappings Unlocked",
                            description: "You can edit mappings again.",
                          });
                        }}
                      >
                        Unlock
                      </Button>
                    )}
                    <Select
                      value={selectedDraftName}
                      onValueChange={setSelectedDraftName}
                      disabled={!!lockedMappings}
                    >
                      <SelectTrigger className="h-9 w-48">
                        <SelectValue placeholder="Select draft" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(namedDrafts).length === 0 ? (
                          <SelectItem value="no-drafts" disabled>
                            No saved drafts
                          </SelectItem>
                        ) : (
                          Object.keys(namedDrafts).map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!selectedDraftName || !namedDrafts[selectedDraftName]) {
                          toast({
                            variant: "destructive",
                            title: "No Saved Draft",
                            description: "Select a draft to load.",
                          });
                          return;
                        }
                        try {
                          const selectedDraft = namedDrafts[selectedDraftName];
                          setFieldMappings(selectedDraft);
                          setHasDraftMappings(Object.keys(selectedDraft).length > 0);
                          toast({
                            title: "Draft Loaded",
                            description: `Draft "${selectedDraftName}" restored.`,
                          });
                        } catch (error: any) {
                          console.error('Failed to load mapping draft:', error);
                          toast({
                            variant: "destructive",
                            title: "Draft Load Failed",
                            description: error.message || "Could not load saved draft.",
                          });
                        }
                      }}
                      disabled={!hasDraftMappings || !!lockedMappings}
                    >
                      Load Draft
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={refreshCaspioFields}
                      disabled={isRefreshingCaspioFields}
                    >
                      {isRefreshingCaspioFields ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Refresh Caspio Fields
                    </Button>
                  </div>
                </div>

                {/* Field Mapping Grid */}
                <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto border rounded-lg p-4">
                  {Object.entries(csSummaryFields).map(([csField, sampleValue]) => (
                    <div key={csField} className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-gray-50">
                      <div className="space-y-2">
                        <div className="p-2 bg-blue-100 rounded border">
                          <div className="font-mono text-sm font-medium">{csField}</div>
                          <div className="text-xs text-blue-600 mt-1 truncate">
                            Sample: {sampleValue?.toString() || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="sr-only">Map to Caspio field</Label>
                        <Select
                          value={fieldMappings[csField] || 'no-mapping'}
                          onValueChange={(value) => {
                            if (value === 'no-mapping') {
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
                          disabled={!!lockedMappings}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Caspio field..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no-mapping">-- No Mapping --</SelectItem>
                            {dynamicCaspioFields.length === 0 ? (
                              <SelectItem value="no-fields" disabled>
                                {isLoadingCachedFields ? 'Loading cached Caspio fields...' : 'No Caspio fields loaded — click “Refresh Caspio Fields”'}
                              </SelectItem>
                            ) : (
                              dynamicCaspioFields
                                .filter((fieldName) => fieldName !== 'CalAIM_Status')
                                .map(fieldName => (
                                <SelectItem key={fieldName} value={fieldName}>
                                  {fieldName}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {fieldMappings[csField] && (
                          <div className="text-xs text-green-600 font-mono">
                            ✓ Mapped to: {fieldMappings[csField]}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Fields loaded: {dynamicCaspioFields.length}</span>
                          {lastRefreshTime > 0 && (
                            <span>Last refresh: {new Date(lastRefreshTime).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 border rounded-lg bg-white space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Auto-save is enabled for each selection. Use a name below to save this draft.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder={autoSaveLabel}
                      className="h-9 w-64"
                      disabled={!!lockedMappings}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (Object.keys(fieldMappings).length === 0) {
                          toast({
                            variant: "destructive",
                            title: "No Mappings to Save",
                            description: "Map at least one field before saving.",
                          });
                          return;
                        }
                        const resolvedDraftName = draftName.trim() || getNextDraftName();
                        const updatedDrafts = {
                          ...namedDrafts,
                          [resolvedDraftName]: fieldMappings,
                        };
                        setNamedDrafts(updatedDrafts);
                        setLastDraftName(resolvedDraftName);
                        localStorage.setItem(namedDraftsKey, JSON.stringify(updatedDrafts));
                        localStorage.setItem(lastDraftNameKey, resolvedDraftName);
                        setHasDraftMappings(true);
                        toast({
                          title: "Draft Saved",
                          description: `Draft "${resolvedDraftName}" saved.`,
                        });
                        setDraftName('');
                      }}
                      disabled={!!lockedMappings}
                    >
                      Save Draft
                    </Button>
                  </div>
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

        {/* Sample Data tab removed per request */}
      </Tabs>
    </div>
  );
}