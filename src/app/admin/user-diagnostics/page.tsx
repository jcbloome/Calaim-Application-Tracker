'use client';

import { useState } from 'react';
import { useUser, useFirestore, useStorage } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, TestTube2, Shield, Database, HardDrive } from 'lucide-react';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function UserDiagnosticsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  
  const [diagnosticsLog, setDiagnosticsLog] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Helper function to add log entries
  const addDiagnosticLog = (message: string) => {
    console.log(message);
    setDiagnosticsLog(prev => [...prev, message]);
  };

  const checkAuthStatus = async () => {
    setIsRunningTest(true);
    console.log('=== AUTH STATUS CHECK ===');
    console.log('User object:', user);
    console.log('User UID:', user?.uid);
    console.log('User email:', user?.email);
    console.log('User loading:', isUserLoading);
    console.log('Firestore available:', !!firestore);
    console.log('Storage available:', !!storage);
    
    if (user?.uid) {
      // Check if user token is valid
      try {
        const token = await user.getIdToken();
        console.log('User token obtained successfully (length):', token.length);
        
        const tokenResult = await user.getIdTokenResult();
        console.log('Token claims:', tokenResult.claims);
      } catch (error) {
        console.error('Error getting user token:', error);
      }
    }
    
    toast({
      title: 'Auth Check Complete',
      description: 'Check console for detailed authentication information',
      className: 'bg-blue-100 text-blue-900 border-blue-200'
    });
    setIsRunningTest(false);
  };

  const testStorageConnection = async () => {
    setIsRunningTest(true);
    console.log('Testing storage connection...');
    try {
      if (!storage) {
        throw new Error('Storage not initialized');
      }
      
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }
      
      console.log('User info:', { uid: user.uid, email: user.email });
      
      // Create a test file
      const testData = new Blob(['Test file content'], { type: 'text/plain' });
      const testFile = new File([testData], 'test.txt', { type: 'text/plain' });
      
      // Create storage reference
      const storageRef = ref(storage, `user_uploads/${user.uid}/test-${Date.now()}.txt`);
      console.log('Storage reference created:', storageRef.fullPath);
      
      // Upload file
      const snapshot = await uploadBytes(storageRef, testFile);
      console.log('Upload successful:', snapshot);
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('Download URL:', downloadURL);
      
      toast({
        title: 'Storage Test Passed',
        description: 'File uploaded successfully to Firebase Storage',
        className: 'bg-green-100 text-green-900 border-green-200'
      });
      
    } catch (error: any) {
      console.error('Storage test failed:', error);
      toast({
        variant: 'destructive',
        title: 'Storage Test Failed',
        description: error.message
      });
    }
    setIsRunningTest(false);
  };

  const testStorageConnectionNew = async () => {
    setIsRunningTest(true);
    console.log('🔍 Testing Storage (New Method)...');
    
    try {
      console.log('Storage available:', !!storage);
      console.log('User available:', !!user);
      console.log('User UID:', user?.uid);
      console.log('User email:', user?.email);
      
      if (!storage) {
        throw new Error('Storage not available');
      }
      
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      // Test creating a reference
      const testRef = ref(storage, `user_uploads/${user.uid}/diagnostic-test/test.txt`);
      console.log('✅ Storage reference created:', testRef.fullPath);
      
      // Test upload
      const testData = new Blob(['New Method Test'], { type: 'text/plain' });
      const testFile = new File([testData], 'diagnostic-test.txt', { type: 'text/plain' });
      
      const uploadTask = uploadBytesResumable(testRef, testFile);
      
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress + '%');
        },
        (error) => {
          console.error('Upload failed:', error);
          toast({
            variant: 'destructive',
            title: 'Storage Test Failed (New)',
            description: `Upload failed: ${error.code} - ${error.message}`
          });
        },
        async () => {
          console.log('✅ Upload completed successfully');
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('Download URL:', downloadURL);
          
          toast({
            title: 'Storage Test Passed (New)',
            description: 'Storage works perfectly with new method!',
            className: 'bg-green-100 text-green-900 border-green-200'
          });
        }
      );
      
    } catch (error: any) {
      console.error('Storage test failed:', error);
      toast({
        variant: 'destructive',
        title: 'Storage Test Failed (New)',
        description: error.message
      });
    }
    setIsRunningTest(false);
  };

  // Comprehensive Firebase diagnostics
  const runComprehensiveDiagnostics = async () => {
    setIsRunningTest(true);
    setDiagnosticsLog([]);
    setShowDiagnostics(true);
    
    addDiagnosticLog('🔍 [USER DIAGNOSTICS] === COMPREHENSIVE FIREBASE DIAGNOSTICS ===');
    
    try {
      // 1. User Authentication Status
      addDiagnosticLog('👤 [USER] User Authentication:');
      addDiagnosticLog(`   - User exists: ${!!user}`);
      addDiagnosticLog(`   - User UID: ${user?.uid}`);
      addDiagnosticLog(`   - User email: ${user?.email}`);
      addDiagnosticLog(`   - Email verified: ${user?.emailVerified}`);
      
      if (user) {
        try {
          const token = await user.getIdToken(true);
          const tokenResult = await user.getIdTokenResult();
          addDiagnosticLog(`   - Token length: ${token.length}`);
          addDiagnosticLog(`   - Token expiry: ${tokenResult.expirationTime}`);
          addDiagnosticLog(`   - Sign in provider: ${tokenResult.signInProvider}`);
          addDiagnosticLog(`   - Auth time: ${tokenResult.authTime}`);
          addDiagnosticLog(`   - Claims: ${JSON.stringify(tokenResult.claims, null, 2)}`);
        } catch (tokenError: any) {
          addDiagnosticLog(`   - ❌ Token error: ${tokenError.message}`);
        }
      }
      
      // 2. Firebase Services Status
      addDiagnosticLog('🔥 [USER] Firebase Services:');
      addDiagnosticLog(`   - Firestore available: ${!!firestore}`);
      addDiagnosticLog(`   - Storage available: ${!!storage}`);
      if (storage) {
        addDiagnosticLog(`   - Storage bucket: ${storage.app.options.storageBucket}`);
        addDiagnosticLog(`   - Storage app name: ${storage.app.name}`);
        addDiagnosticLog(`   - Max upload retry time: ${storage.maxUploadRetryTime}`);
        addDiagnosticLog(`   - Max operation retry time: ${storage.maxOperationRetryTime}`);
      }
      
      // 3. Test Firestore Access
      addDiagnosticLog('📊 [USER] Testing Firestore Access...');
      try {
        const testDoc = doc(firestore, 'test', `user-diagnostics-${Date.now()}`);
        await setDoc(testDoc, { 
          test: true, 
          timestamp: serverTimestamp(),
          user: user?.uid,
          source: 'user-diagnostics'
        });
        addDiagnosticLog('✅ [USER] Firestore write: SUCCESS');
      } catch (firestoreError: any) {
        addDiagnosticLog(`❌ [USER] Firestore write: FAILED - ${firestoreError.message}`);
        addDiagnosticLog(`   - Error code: ${firestoreError.code}`);
      }
      
      // 4. Test Storage Access (Multiple Methods)
      addDiagnosticLog('🪣 [USER] Testing Storage Access...');
      
      if (storage && user) {
        // Method 1: uploadBytes (direct) with timeout
        try {
          addDiagnosticLog('🧪 [USER] Method 1: uploadBytes (direct)...');
          addDiagnosticLog(`   - Storage bucket debug: ${storage.app.options.storageBucket || 'UNDEFINED'}`);
          
          const testRef1 = ref(storage, `diagnostic-test/${user.uid}/direct-${Date.now()}.txt`);
          addDiagnosticLog(`   - Reference created: ${testRef1.fullPath}`);
          
          const testBlob1 = new Blob(['Direct upload test'], { type: 'text/plain' });
          addDiagnosticLog(`   - Blob created: ${testBlob1.size} bytes`);
          
          // Add timeout to prevent hanging
          const uploadPromise = uploadBytes(testRef1, testBlob1);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('uploadBytes timeout after 15 seconds')), 15000)
          );
          
          addDiagnosticLog('   - Starting upload with 15s timeout...');
          const snapshot1 = await Promise.race([uploadPromise, timeoutPromise]);
          
          const downloadURL1 = await getDownloadURL(snapshot1.ref);
          addDiagnosticLog('✅ [USER] uploadBytes: SUCCESS');
          addDiagnosticLog(`🔗 [USER] Direct upload URL: ${downloadURL1}`);
        } catch (directError: any) {
          addDiagnosticLog(`❌ [USER] uploadBytes: FAILED - ${directError.message}`);
          addDiagnosticLog(`   - Error code: ${directError.code}`);
          addDiagnosticLog(`   - Error name: ${directError.name}`);
        }
        
        // Method 2: uploadBytesResumable (with timeout)
        try {
          addDiagnosticLog('🧪 [USER] Method 2: uploadBytesResumable (with 10s timeout)...');
          const testRef2 = ref(storage, `diagnostic-test/${user.uid}/resumable-${Date.now()}.txt`);
          const testBlob2 = new Blob(['Resumable upload test'], { type: 'text/plain' });
          
          const uploadTask = uploadBytesResumable(testRef2, testBlob2);
          
          // Set up timeout
          const uploadPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              uploadTask.cancel();
              reject(new Error('Upload timeout after 10 seconds'));
            }, 10000);
            
            uploadTask.on('state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                addDiagnosticLog(`📈 [USER] Resumable progress: ${progress.toFixed(1)}%`);
              },
              (error) => {
                clearTimeout(timeout);
                reject(error);
              },
              async () => {
                clearTimeout(timeout);
                try {
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve(downloadURL);
                } catch (urlError) {
                  reject(urlError);
                }
              }
            );
          });
          
          const downloadURL2 = await uploadPromise;
          addDiagnosticLog('✅ [USER] uploadBytesResumable: SUCCESS');
          addDiagnosticLog(`🔗 [USER] Resumable upload URL: ${downloadURL2}`);
          
        } catch (resumableError: any) {
          addDiagnosticLog(`❌ [USER] uploadBytesResumable: FAILED - ${resumableError.message}`);
          addDiagnosticLog(`   - Error code: ${resumableError.code}`);
        }
      }
      
      // 5. Network Test
      addDiagnosticLog('🌐 [USER] Testing Network Connectivity...');
      try {
        // Test 1: Basic Firebase Storage API
        const networkTest = await fetch('https://firebasestorage.googleapis.com/', { method: 'HEAD' });
        addDiagnosticLog(`✅ [USER] Network to Firebase Storage: SUCCESS - ${networkTest.status}`);
        
        // Test 2: Specific bucket access
        const bucketTest = await fetch('https://firebasestorage.googleapis.com/v0/b/studio-2881432245-f1d94.firebasestorage.app/o?alt=media', {
          method: 'HEAD',
          mode: 'cors'
        });
        addDiagnosticLog(`✅ [USER] Bucket access: SUCCESS - ${bucketTest.status}`);
      } catch (networkError: any) {
        addDiagnosticLog(`❌ [USER] Network to Firebase Storage: FAILED - ${networkError.message}`);
      }
      
      // 6. Browser Environment
      addDiagnosticLog('🌐 [USER] Browser Environment:');
      addDiagnosticLog(`   - User Agent: ${navigator.userAgent}`);
      addDiagnosticLog(`   - Online: ${navigator.onLine}`);
      addDiagnosticLog(`   - Connection: ${(navigator as any).connection?.effectiveType || 'unknown'}`);
      addDiagnosticLog(`   - Language: ${navigator.language}`);
      addDiagnosticLog(`   - Platform: ${navigator.platform}`);
      
      addDiagnosticLog('🔍 [USER] === DIAGNOSTICS COMPLETE ===');
      
      toast({
        title: 'Comprehensive Diagnostics Complete',
        description: 'Results are displayed below. Look for ✅ SUCCESS or ❌ FAILED markers.',
        className: 'bg-blue-100 text-blue-900 border-blue-200'
      });
      
    } catch (error: any) {
      addDiagnosticLog(`❌ [USER] Diagnostics failed: ${error.message}`);
      toast({
        variant: 'destructive',
        title: 'Diagnostics Failed',
        description: error.message
      });
    }
    setIsRunningTest(false);
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-4">Loading user diagnostics...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <TestTube2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">User Side Diagnostic Tools</h1>
          <p className="text-muted-foreground">Test Firebase authentication, storage, and connectivity from the user perspective</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Tests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Quick Tests
            </CardTitle>
            <CardDescription>
              Run individual diagnostic tests to check specific functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              onClick={checkAuthStatus} 
              variant="outline" 
              className="w-full justify-start"
              disabled={isRunningTest}
            >
              {isRunningTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '🔍'}
              Check Auth Status
            </Button>
            <Button 
              onClick={testStorageConnection} 
              variant="outline" 
              className="w-full justify-start"
              disabled={isRunningTest}
            >
              {isRunningTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '🔧'}
              Test Storage (Old Method)
            </Button>
            <Button 
              onClick={testStorageConnectionNew} 
              variant="outline" 
              className="w-full justify-start"
              disabled={isRunningTest}
            >
              {isRunningTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '🧪'}
              Test Storage (New Method)
            </Button>
          </CardContent>
        </Card>

        {/* Comprehensive Diagnostics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Comprehensive Analysis
            </CardTitle>
            <CardDescription>
              Run a complete diagnostic suite to analyze all Firebase services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={runComprehensiveDiagnostics} 
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isRunningTest}
            >
              {isRunningTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '🔍'}
              Run Full Diagnostics
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This will test authentication, Firestore, Storage, and network connectivity
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Current User Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><strong>Email:</strong> {user?.email || 'Not logged in'}</div>
            <div><strong>UID:</strong> {user?.uid || 'N/A'}</div>
            <div><strong>Display Name:</strong> {user?.displayName || 'N/A'}</div>
            <div><strong>Email Verified:</strong> {user?.emailVerified ? 'Yes' : 'No'}</div>
            <div><strong>Firestore:</strong> {firestore ? 'Available' : 'Not Available'}</div>
            <div><strong>Storage:</strong> {storage ? 'Available' : 'Not Available'}</div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostics Results */}
      {showDiagnostics && diagnosticsLog.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Diagnostics Results</CardTitle>
              <Button 
                onClick={() => setShowDiagnostics(false)} 
                variant="ghost" 
                size="sm"
              >
                ✕ Close
              </Button>
            </div>
            <CardDescription>
              Look for ✅ SUCCESS (working) or ❌ FAILED (broken) markers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto bg-black text-green-400 p-4 rounded font-mono text-xs">
              {diagnosticsLog.map((log, index) => (
                <div key={index} className="mb-1 whitespace-pre-wrap">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}