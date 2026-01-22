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
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  const [socialWorkerEmails, setSocialWorkerEmails] = useState<Set<string>>(new Set());
  const [rnEmails, setRnEmails] = useState<Set<string>>(new Set());

  // Direct Firebase Auth listener
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });

    return () => unsubscribe();
  }, []);

  const ensureCurrentUserSession = useCallback(async () => {
    // Try both user sources
    const user = currentUser || authUser;
    
    if (!user) {
      return;
    }

    try {
      const db = getFirestore();
      const sessionDoc = doc(db, 'activeSessions', user.uid);
      
      const sessionData = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0] || 'Unknown',
        displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
        email: user.email,
        loginTime: serverTimestamp(),
        lastActivity: serverTimestamp(),
        ipAddress: 'Current Session',
        userAgent: typeof window !== 'undefined' ? navigator.userAgent.substring(0, 100) : 'Server',
        sessionDuration: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      await setDoc(sessionDoc, sessionData, { merge: true });
    } catch (err: any) {
      console.error('Failed to create session:', err);
    }
  }, [currentUser, authUser]);

  const loadLoginLogs = useCallback(async () => {
    try {
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
    } catch (err: any) {
      const errorMsg = `Failed to load login logs: ${err.message}`;
      setError(errorMsg);
      console.error(errorMsg, err);
    }
  }, [filterAction]);

  const loadActiveSessions = useCallback(async () => {
    try {
      const db = getFirestore();
      const sessionsCollection = collection(db, 'activeSessions');

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
    } catch (err: any) {
      const errorMsg = `Failed to load active sessions: ${err.message}`;
      setError(errorMsg);
      console.error(errorMsg, err);
    }
  }, []);

  const testFirestoreWrite = useCallback(async () => {
    try {
      const db = getFirestore();
      const testDoc = doc(db, 'test_writes', `session_test_${Date.now()}`);
      
      await setDoc(testDoc, {
        test: 'session creation test',
        timestamp: new Date().toISOString(),
        user: currentUser?.email || 'unknown'
      });
      
      return true;
    } catch (err: any) {
      console.error('Firestore write test failed:', err);
      return false;
    }
  }, [currentUser]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // First test basic Firestore write permissions
      const canWrite = await testFirestoreWrite();
      
      if (canWrite) {
        // Then ensure current user has an active session
        await ensureCurrentUserSession();
      }
      
      // Then load all data
      await Promise.all([loadLoginLogs(), loadActiveSessions()]);
    } catch (err) {
      console.error('Data refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadLoginLogs, loadActiveSessions, ensureCurrentUserSession, testFirestoreWrite]);

  // Initial load
  useEffect(() => {
    if (isSuperAdmin) {
      refreshData();
    }
  }, [isSuperAdmin, refreshData]);

  // Load social worker and RN emails to identify user types
  useEffect(() => {
    const loadUserTypeEmails = async () => {
      try {
        const db = getFirestore();
        
        // Load social workers
        const swCollection = collection(db, 'socialWorkers');
        const swSnapshot = await getDocs(swCollection);
        const swEmails = new Set<string>();
        swSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.email) {
            swEmails.add(data.email.toLowerCase());
          }
        });
        setSocialWorkerEmails(swEmails);
        
        // Load RNs - check if there's a registeredNurses collection or similar
        // For now, we'll check for RN in email or a dedicated collection if it exists
        // You can add RN identification logic here based on your system
        const rnEmails = new Set<string>();
        // TODO: Add RN identification logic (e.g., from a collection or email pattern)
        setRnEmails(rnEmails);
      } catch (err) {
        console.error('Failed to load user type emails:', err);
      }
    };
    
    if (isSuperAdmin) {
      loadUserTypeEmails();
    }
  }, [isSuperAdmin]);

  const getUserType = (email?: string): 'staff' | 'socialWorker' | 'rn' | 'user' => {
    if (!email) return 'user';
    
    const emailLower = email.toLowerCase();
    
    // Check if admin/staff
    const adminEmails = [
      'jason@carehomefinders.com',
      'jason.bloome@connectionslos.com',
      'jcbloome@gmail.com'
    ];
    
    if (adminEmails.includes(emailLower)) {
      return 'staff';
    }
    
    // Check if social worker
    if (socialWorkerEmails.has(emailLower)) {
      return 'socialWorker';
    }
    
    // Check if RN
    if (rnEmails.has(emailLower)) {
      return 'rn';
    }
    
    return 'user';
  };

  const getUserTypeBadge = (userType: 'staff' | 'socialWorker' | 'rn' | 'user') => {
    switch (userType) {
      case 'staff':
        return { label: 'Staff', className: 'bg-blue-500 text-white' };
      case 'socialWorker':
        return { label: 'SW', className: 'bg-purple-500 text-white' };
      case 'rn':
        return { label: 'RN', className: 'bg-green-500 text-white' };
      case 'user':
        return { label: 'User', className: 'bg-gray-500 text-white' };
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    });
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading && (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </>
          )}
        </div>
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
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Active Sessions ({activeSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-64 overflow-y-auto">
              {activeSessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-xs">No active sessions</p>
              ) : (
                <div className="space-y-1">
                  {activeSessions.map((session) => (
                    <div key={session.id} className="p-2 border rounded text-xs hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-xs">{session.userName || session.displayName || session.userEmail || session.email || 'Unknown User'}</p>
                          <p className="text-xs text-muted-foreground truncate">{session.userEmail || session.email || 'No email'}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(session.lastActivity)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Login Logs - Compact */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                Login History ({loginLogs.length})
              </CardTitle>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-20 h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-64 overflow-y-auto">
              {loginLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-xs">No login logs found</p>
              ) : (
                <div className="space-y-1">
                  {loginLogs.map((log) => {
                    const userEmail = log.userEmail || log.email || '';
                    const userType = getUserType(userEmail);
                    const userName = log.userName || log.displayName || userEmail || 'Unknown User';
                    const action = log.action || log.type || log.event || 'unknown';
                    const isSuccess = log.success !== false;
                    const typeBadge = getUserTypeBadge(userType);
                    
                    return (
                      <div 
                        key={log.id} 
                        className="p-2 border rounded text-xs hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-gray-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="font-medium truncate text-xs">
                              {userName}
                            </span>
                            <Badge 
                              className={`text-xs px-1.5 py-0 h-4 shrink-0 ${typeBadge.className}`}
                            >
                              {typeBadge.label}
                            </Badge>
                            <Badge 
                              variant={getActionBadgeVariant(action, isSuccess)} 
                              className="text-xs px-1.5 py-0 h-4 shrink-0"
                            >
                              {action}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(log.timestamp)}
                            </span>
                            {log.failureReason && (
                              <span className="text-xs text-red-600 truncate ml-auto">
                                {log.failureReason}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}