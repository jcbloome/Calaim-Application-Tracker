'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { getFirestore, collection, query, orderBy, limit, getDocs, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useUser } from '@/firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  Activity,
  AlertTriangle,
  User,
  Clock,
  MapPin,
  Monitor,
  RefreshCw,
  Filter,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LoginLog {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  action?: string;
  timestamp?: any;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  failureReason?: string;
  location?: string;
  deviceInfo?: {
    browser: string;
    os: string;
    device: string;
  };
  // Alternative field names that might be in the data
  email?: string;
  displayName?: string;
  role?: string;
  type?: string;
  event?: string;
  ip?: string;
  clientIP?: string;
  remoteAddress?: string;
  [key: string]: any; // Allow any additional fields
}

interface ActiveSession {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  loginTime?: any;
  lastActivity?: any;
  ipAddress?: string;
  userAgent?: string;
  sessionDuration?: number;
  // Alternative field names
  email?: string;
  displayName?: string;
  [key: string]: any;
}

export default function LoginActivityTracker() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const { currentUser } = useUser();
  const [authUser, setAuthUser] = useState<any>(null);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  }, []);

  // Direct Firebase Auth listener
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      addDebugLog(`🔐 Auth state changed: ${user ? `User: ${user.email}` : 'No user'}`);
      setAuthUser(user);
    });

    return () => unsubscribe();
  }, [addDebugLog]);

  const ensureCurrentUserSession = useCallback(async () => {
    addDebugLog(`🔍 ensureCurrentUserSession called`);
    addDebugLog(`👤 useUser currentUser exists: ${!!currentUser}`);
    addDebugLog(`🔐 authUser exists: ${!!authUser}`);
    
    // Try both user sources
    const user = currentUser || authUser;
    
    if (!user) {
      addDebugLog('❌ No user found from either source - cannot create session');
      return;
    }

    addDebugLog(`👤 Using user: ${user.email}, UID: ${user.uid}`);

    try {
      addDebugLog(`🔥 Getting Firestore instance...`);
      const db = getFirestore();
      addDebugLog(`📄 Creating session document reference for UID: ${user.uid}`);
      const sessionDoc = doc(db, 'activeSessions', user.uid);
      
      const sessionData = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0] || 'Unknown',
        displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
        email: user.email,
        loginTime: serverTimestamp(),
        lastActivity: serverTimestamp(),
        ipAddress: 'Current Session', // We don't have access to IP in browser
        userAgent: navigator.userAgent.substring(0, 100), // Truncate to avoid size issues
        sessionDuration: 0,
        isActive: true,
        createdAt: new Date().toISOString(), // Add regular timestamp too
        lastUpdated: new Date().toISOString()
      };

      addDebugLog(`💾 Attempting to write session data...`);
      addDebugLog(`📊 Session data: ${JSON.stringify(sessionData, null, 2).substring(0, 300)}...`);
      
      await setDoc(sessionDoc, sessionData, { merge: true });
      addDebugLog(`✅ Successfully created/updated active session for ${user.email}`);
      
      // Verify the document was created
      addDebugLog(`🔍 Verifying session was created...`);
      
    } catch (err: any) {
      addDebugLog(`❌ Failed to create session: ${err.message}`);
      addDebugLog(`❌ Error code: ${err.code}`);
      addDebugLog(`❌ Error stack: ${err.stack}`);
    }
  }, [currentUser, authUser, addDebugLog]);

  const loadLoginLogs = useCallback(async () => {
    try {
      addDebugLog('📥 Loading login logs from Firestore...');
      const db = getFirestore();
      const logsCollection = collection(db, 'loginLogs');
      
      let logsQuery = query(
        logsCollection, 
        orderBy('timestamp', 'desc'), 
        limit(50)
      );

      if (filterAction !== 'all') {
        logsQuery = query(
          logsCollection,
          where('action', '==', filterAction),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
      }

      const logsSnapshot = await getDocs(logsQuery);
      const logs = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoginLog[];

      setLoginLogs(logs);
      addDebugLog(`✅ Loaded ${logs.length} login logs`);
      
      // Debug: Log first few entries to see data structure
      if (logs.length > 0) {
        const firstLog = logs[0];
        addDebugLog(`🔍 Sample log data: ${JSON.stringify(firstLog, null, 2).substring(0, 300)}...`);
        addDebugLog(`📊 Available fields: ${Object.keys(firstLog).join(', ')}`);
        addDebugLog(`👤 User fields: email=${firstLog.email}, displayName=${firstLog.displayName}, userName=${firstLog.userName}, userEmail=${firstLog.userEmail}`);
        addDebugLog(`🔑 Action fields: action=${firstLog.action}, type=${firstLog.type}, event=${firstLog.event}`);
        addDebugLog(`🌐 IP fields: ipAddress=${firstLog.ipAddress}, ip=${firstLog.ip}, clientIP=${firstLog.clientIP}, remoteAddress=${firstLog.remoteAddress}`);
        addDebugLog(`📊 Other fields: role=${firstLog.role}, userId=${firstLog.userId}, success=${firstLog.success}`);
      }
    } catch (err: any) {
      const errorMsg = `Failed to load login logs: ${err.message}`;
      setError(errorMsg);
      addDebugLog(`❌ ${errorMsg}`);
    }
  }, [filterAction, addDebugLog]);

  const loadActiveSessions = useCallback(async () => {
    try {
      addDebugLog('📥 Loading active sessions from Firestore...');
      const db = getFirestore();
      const sessionsCollection = collection(db, 'activeSessions');
      
      // First, try to get all documents to see what's there
      const allSessionsSnapshot = await getDocs(sessionsCollection);
      addDebugLog(`🔍 Total documents in activeSessions collection: ${allSessionsSnapshot.size}`);
      
      if (allSessionsSnapshot.size > 0) {
        allSessionsSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          addDebugLog(`📄 Session ${index + 1}: ID=${doc.id}, fields=${Object.keys(data).join(', ')}`);
        });
      }

      const sessionsQuery = query(
        sessionsCollection, 
        orderBy('lastActivity', 'desc'), 
        limit(20)
      );

      const sessionsSnapshot = await getDocs(sessionsQuery);
      const sessions = sessionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ActiveSession[];

      setActiveSessions(sessions);
      addDebugLog(`✅ Loaded ${sessions.length} active sessions`);
      
      // Debug: Show sample session data if available
      if (sessions.length > 0) {
        const firstSession = sessions[0];
        addDebugLog(`🔍 Sample session: ${JSON.stringify(firstSession, null, 2).substring(0, 200)}...`);
      }
    } catch (err: any) {
      const errorMsg = `Failed to load active sessions: ${err.message}`;
      setError(errorMsg);
      addDebugLog(`❌ ${errorMsg}`);
    }
  }, [addDebugLog]);

  const testFirestoreWrite = useCallback(async () => {
    try {
      addDebugLog('🧪 Testing basic Firestore write permissions...');
      const db = getFirestore();
      const testDoc = doc(db, 'test_writes', `session_test_${Date.now()}`);
      
      await setDoc(testDoc, {
        test: 'session creation test',
        timestamp: new Date().toISOString(),
        user: currentUser?.email || 'unknown'
      });
      
      addDebugLog('✅ Basic Firestore write test successful');
      return true;
    } catch (err: any) {
      addDebugLog(`❌ Basic Firestore write test failed: ${err.message}`);
      return false;
    }
  }, [currentUser, addDebugLog]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    addDebugLog('🔄 Refreshing login activity data...');
    
    try {
      // First test basic Firestore write permissions
      const canWrite = await testFirestoreWrite();
      
      if (canWrite) {
        // Then ensure current user has an active session
        await ensureCurrentUserSession();
      } else {
        addDebugLog('⚠️ Skipping session creation due to write permission issues');
      }
      
      // Then load all data
      await Promise.all([loadLoginLogs(), loadActiveSessions()]);
      addDebugLog('✅ Data refresh completed');
    } catch (err) {
      addDebugLog('❌ Data refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, [loadLoginLogs, loadActiveSessions, ensureCurrentUserSession, testFirestoreWrite, addDebugLog]);

  useEffect(() => {
    if (isSuperAdmin) {
      refreshData();
    }
  }, [isSuperAdmin, refreshData]);

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const getActionBadgeVariant = (action: string, success: boolean) => {
    if (!success) return 'destructive';
    switch (action) {
      case 'login': return 'default';
      case 'logout': return 'secondary';
      case 'password_reset': return 'outline';
      default: return 'secondary';
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin permissions...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold text-red-600 mb-2">Access Denied</h3>
        <p className="text-muted-foreground">Only Super Admins can view login logs</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <Button onClick={refreshData} disabled={isLoading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Error: {error}</span>
          </div>
        )}
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Sessions - Compact */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Active Sessions ({activeSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-48 overflow-y-auto">
              {activeSessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">No active sessions</p>
              ) : (
                <div className="space-y-2">
                  {activeSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{session.userName || session.displayName || session.userEmail || session.email || 'Unknown User'}</p>
                          <p className="text-xs text-muted-foreground truncate">{session.userEmail || session.email || 'No email'}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                        <p className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(session.lastActivity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Debug Log - Compact */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" />
              Debug Log
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-48 overflow-y-auto">
              {debugLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">No debug logs yet</p>
              ) : (
                <div className="space-y-1">
                  {debugLogs.slice(0, 20).map((log, index) => (
                    <p key={index} className="text-xs font-mono text-muted-foreground leading-tight">
                      {log}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Login Logs - Full Width but Compact */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Login Logs ({loginLogs.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-3 w-3" />
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="password_reset">Password Reset</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-64 overflow-y-auto">
            {loginLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No login logs found</p>
            ) : (
              <div className="space-y-1">
                {loginLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-2 border rounded text-sm hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">
                            {log.userName || log.displayName || log.userEmail || log.email || 'Unknown User'}
                          </p>
                          <Badge variant={getActionBadgeVariant(log.action || log.type || log.event || 'unknown', log.success !== false)} className="text-xs px-1 py-0">
                            {log.action || log.type || log.event || 'unknown'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {log.userEmail || log.email || 'No email'} • Role: {log.userRole || log.role || 'Unknown'}
                        </p>
                        {log.failureReason && (
                          <p className="text-xs text-red-600 truncate">Reason: {log.failureReason}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground flex-shrink-0 ml-2">
                      <p className="flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(log.timestamp)}
                      </p>
                      <p className="flex items-center gap-1 justify-end">
                        <MapPin className="h-3 w-3" />
                        {log.ipAddress || log.ip || log.clientIP || log.remoteAddress || 'Unknown IP'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}