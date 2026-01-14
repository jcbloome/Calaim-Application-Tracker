'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { getFirestore, collection, query, orderBy, limit, getDocs, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useUser } from '@/firebase';
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

  const ensureCurrentUserSession = useCallback(async () => {
    if (!currentUser) {
      addDebugLog('❌ No current user - cannot create session');
      return;
    }

    try {
      addDebugLog(`👤 Creating/updating active session for: ${currentUser.email}`);
      const db = getFirestore();
      const sessionDoc = doc(db, 'activeSessions', currentUser.uid);
      
      const sessionData = {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        email: currentUser.email,
        loginTime: serverTimestamp(),
        lastActivity: serverTimestamp(),
        ipAddress: 'Current Session', // We don't have access to IP in browser
        userAgent: navigator.userAgent,
        sessionDuration: 0,
        isActive: true
      };

      await setDoc(sessionDoc, sessionData, { merge: true });
      addDebugLog(`✅ Created/updated active session for ${currentUser.email}`);
    } catch (err: any) {
      addDebugLog(`❌ Failed to create session: ${err.message}`);
    }
  }, [currentUser, addDebugLog]);

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

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    addDebugLog('🔄 Refreshing login activity data...');
    
    try {
      // First ensure current user has an active session
      await ensureCurrentUserSession();
      
      // Then load all data
      await Promise.all([loadLoginLogs(), loadActiveSessions()]);
      addDebugLog('✅ Data refresh completed');
    } catch (err) {
      addDebugLog('❌ Data refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, [loadLoginLogs, loadActiveSessions, ensureCurrentUserSession, addDebugLog]);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={refreshData} disabled={isLoading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Error: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Active Sessions ({activeSessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            {activeSessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No active sessions found</p>
            ) : (
              <div className="space-y-2">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="font-medium">{session.userName || session.displayName || session.userEmail || session.email || 'Unknown User'}</p>
                        <p className="text-sm text-muted-foreground">{session.userEmail || session.email || 'No email'}</p>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(session.lastActivity)}
                      </p>
                      <p className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {session.ipAddress}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Login Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Login Logs ({loginLogs.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-32">
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
        <CardContent>
          <ScrollArea className="h-96">
            {loginLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No login logs found</p>
            ) : (
              <div className="space-y-2">
                {loginLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="font-medium">
                          {log.userName || log.displayName || log.userEmail || log.email || 'Unknown User'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {log.userEmail || log.email || 'No email'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Role: {log.userRole || log.role || 'Unknown'} | ID: {log.userId || 'N/A'}
                        </p>
                        {log.failureReason && (
                          <p className="text-sm text-red-600">Reason: {log.failureReason}</p>
                        )}
                        {/* Debug: Show raw data */}
                        <details className="text-xs text-gray-400 mt-1">
                          <summary className="cursor-pointer">Debug Data</summary>
                          <pre className="mt-1 text-xs bg-gray-100 p-1 rounded">
                            {JSON.stringify(log, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={getActionBadgeVariant(log.action || log.type || log.event || 'unknown', log.success !== false)}>
                        {log.action || log.type || log.event || 'unknown'}
                      </Badge>
                      <div className="text-right text-sm">
                        <p className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(log.timestamp)}
                        </p>
                        <p className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {log.ipAddress || log.ip || log.clientIP || log.remoteAddress || 'Unknown IP'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Debug Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Debug Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-32">
            {debugLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No debug logs yet</p>
            ) : (
              <div className="space-y-1">
                {debugLogs.map((log, index) => (
                  <p key={index} className="text-xs font-mono text-muted-foreground">
                    {log}
                  </p>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}