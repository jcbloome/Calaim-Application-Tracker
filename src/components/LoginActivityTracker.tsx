'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Activity,
  LogIn,
  LogOut,
  Clock,
  User,
  Shield,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Download,
  Calendar,
  Globe,
  Smartphone,
  Monitor,
  Loader2,
  Eye,
  TrendingUp,
  Users,
  Timer,
  MapPin,
  X
} from 'lucide-react';
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays, isToday, isYesterday } from 'date-fns';
import { useFirestore } from '@/firebase';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { useAdmin } from '@/hooks/use-admin';

interface LoginLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: string;
  action: 'login' | 'logout' | 'session_timeout' | 'forced_logout';
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
  location?: string;
  sessionDuration?: number; // in minutes
  success: boolean;
  failureReason?: string;
}

interface SessionInfo {
  userId: string;
  userEmail: string;
  userName: string;
  userRole: string;
  loginTime: Date;
  lastActivity: Date;
  ipAddress?: string;
  deviceType?: string;
  browser?: string;
  isActive: boolean;
  sessionDuration: number; // in minutes
}

const ACTION_COLORS = {
  'login': 'bg-green-100 text-green-800 border-green-200',
  'logout': 'bg-blue-100 text-blue-800 border-blue-200',
  'session_timeout': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'forced_logout': 'bg-red-100 text-red-800 border-red-200'
};

const ACTION_ICONS = {
  'login': LogIn,
  'logout': LogOut,
  'session_timeout': Clock,
  'forced_logout': AlertTriangle
};

const ROLE_COLORS = {
  'Super Admin': 'bg-purple-100 text-purple-800',
  'Admin': 'bg-blue-100 text-blue-800',
  'Staff': 'bg-gray-100 text-gray-800'
};

export default function LoginActivityTracker() {
  try {
    const { toast } = useToast();
    const firestore = useFirestore();
    const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('today');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [showErrorLog, setShowErrorLog] = useState(false);

  // Check super admin permissions
  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading permissions...</span>
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

  // Add error to visible log
  const addErrorLog = useCallback((message: string, error?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    if (error) {
      console.error(message, error);
      setErrorLog(prev => [...prev, logEntry, `  Error: ${error.message || error}`]);
    } else {
      console.log(message);
      setErrorLog(prev => [...prev, logEntry]);
    }
    setShowErrorLog(true);
  }, []);

  // Add info to visible log
  const addInfoLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ℹ️ ${message}`;
    console.log(message);
    setErrorLog(prev => [...prev, logEntry]);
  }, []);

  // Clear error log
  const clearErrorLog = () => {
    setErrorLog([]);
    setShowErrorLog(false);
  };

  // Load login logs
  const loadLoginLogs = useCallback(async () => {
    if (!firestore || !isSuperAdmin) {
      addErrorLog('Cannot load logs: Missing firestore or super admin access');
      return;
    }
    
    addInfoLog('Starting to load login logs...');
    setIsLoading(true);
    try {
      let startDate = new Date();
      let endDate = new Date();
      
      switch (filterDate) {
        case 'today':
          startDate = startOfDay(new Date());
          endDate = endOfDay(new Date());
          break;
        case 'yesterday':
          startDate = startOfDay(subDays(new Date(), 1));
          endDate = endOfDay(subDays(new Date(), 1));
          break;
        case 'week':
          startDate = startOfDay(subDays(new Date(), 7));
          endDate = endOfDay(new Date());
          break;
        case 'month':
          startDate = startOfDay(subDays(new Date(), 30));
          endDate = endOfDay(new Date());
          break;
        default:
          startDate = startOfDay(new Date());
          endDate = endOfDay(new Date());
      }
      
      // Build Firestore query
      let q = query(
        collection(firestore, 'loginLogs'),
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        where('timestamp', '<=', Timestamp.fromDate(endDate)),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );
      
      const querySnapshot = await getDocs(q);
      const logs: LoginLog[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        logs.push({
          id: doc.id,
          userId: data.userId || '',
          userEmail: data.email || '',
          userName: data.displayName || data.email || 'Unknown',
          userRole: data.role || 'User',
          action: 'login', // Default to login since that's what we track
          timestamp: data.timestamp?.toDate() || new Date(),
          success: true, // Assume success if logged
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          deviceType: data.deviceType,
          browser: data.browser,
          location: data.location,
          sessionDuration: data.sessionDuration
        });
      });
      
      setLoginLogs(logs);
      addInfoLog(`Successfully loaded ${logs.length} login logs`);
    } catch (error: any) {
      addErrorLog('Failed to load login logs', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: `Could not load login activity logs: ${error.message || 'Unknown error'}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, isSuperAdmin, filterDate, selectedUser, addErrorLog, addInfoLog]);

  // Load active sessions (simplified - just show recent logins as "active")
  const loadActiveSessions = useCallback(async () => {
    if (!firestore || !isSuperAdmin) {
      addErrorLog('Cannot load active sessions: Missing firestore or super admin access');
      return;
    }
    
    addInfoLog('Loading active sessions...');
    try {
      // Get logins from the last hour as "active sessions"
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const q = query(
        collection(firestore, 'loginLogs'),
        where('timestamp', '>=', Timestamp.fromDate(oneHourAgo)),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      
      const querySnapshot = await getDocs(q);
      const sessions: SessionInfo[] = [];
      const seenUsers = new Set<string>();
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const userId = data.userId;
        
        // Only show the most recent login per user
        if (!seenUsers.has(userId)) {
          seenUsers.add(userId);
          sessions.push({
            userId: userId,
            userEmail: data.email || '',
            userName: data.displayName || data.email || 'Unknown',
            userRole: data.role || 'User',
            loginTime: data.timestamp?.toDate() || new Date(),
            lastActivity: data.timestamp?.toDate() || new Date(),
            ipAddress: data.ipAddress,
            deviceType: data.deviceType,
            browser: data.browser,
            isActive: true,
            sessionDuration: Math.floor((Date.now() - (data.timestamp?.toDate()?.getTime() || Date.now())) / 60000)
          });
        }
      });
      
      setActiveSessions(sessions);
      addInfoLog(`Successfully loaded ${sessions.length} active sessions`);
    } catch (error: any) {
      addErrorLog('Failed to load active sessions', error);
    }
  }, [firestore, isSuperAdmin, addErrorLog]);

  // Force logout user (simplified - just show a message)
  const forceLogoutUser = async (userId: string, userName: string) => {
    toast({
      title: 'Force Logout Not Available',
      description: 'Force logout functionality requires additional Firebase Functions setup',
      variant: 'default',
    });
  };

  // Export logs to CSV
  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'User', 'Email', 'Role', 'Action', 'IP Address', 'Device', 'Browser', 'Success', 'Duration (min)'].join(','),
      ...filteredLogs.map(log => [
        format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
        log.userName,
        log.userEmail,
        log.userRole,
        log.action,
        log.ipAddress || '',
        log.deviceType || '',
        log.browser || '',
        log.success ? 'Yes' : 'No',
        log.sessionDuration || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `login-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Filter logs
  const filteredLogs = useMemo(() => {
    let filtered = loginLogs;

    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ipAddress?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action === filterAction);
    }

    if (filterRole !== 'all') {
      filtered = filtered.filter(log => log.userRole === filterRole);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [loginLogs, searchTerm, filterAction, filterRole]);

  // Activity statistics
  const stats = useMemo(() => {
    const totalLogins = filteredLogs.filter(log => log.action === 'login' && log.success).length;
    const failedLogins = filteredLogs.filter(log => log.action === 'login' && !log.success).length;
    const totalLogouts = filteredLogs.filter(log => log.action === 'logout').length;
    const timeouts = filteredLogs.filter(log => log.action === 'session_timeout').length;
    const uniqueUsers = new Set(filteredLogs.map(log => log.userId)).size;
    
    const avgSessionDuration = filteredLogs
      .filter(log => log.sessionDuration && log.sessionDuration > 0)
      .reduce((sum, log) => sum + (log.sessionDuration || 0), 0) / 
      Math.max(1, filteredLogs.filter(log => log.sessionDuration && log.sessionDuration > 0).length);

    return {
      totalLogins,
      failedLogins,
      totalLogouts,
      timeouts,
      uniqueUsers,
      avgSessionDuration: Math.round(avgSessionDuration || 0),
      activeNow: activeSessions.length
    };
  }, [filteredLogs, activeSessions]);

  // Get device icon
  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Smartphone;
      default:
        return Monitor;
    }
  };

  useEffect(() => {
    addInfoLog('LoginActivityTracker component loaded');
    addInfoLog(`Firestore available: ${!!firestore}`);
    addInfoLog(`Super admin: ${isSuperAdmin}`);
    addInfoLog(`Admin loading: ${isAdminLoading}`);
    
    // Only load if we have firestore and super admin access
    if (firestore && isSuperAdmin && !isAdminLoading) {
      addInfoLog('Prerequisites met - loading data...');
      loadLoginLogs();
      loadActiveSessions();
      
      // Refresh active sessions every 30 seconds
      const interval = setInterval(() => {
        if (firestore && isSuperAdmin) {
          addInfoLog('Auto-refreshing active sessions...');
          loadActiveSessions();
        }
      }, 30000);
      
      return () => clearInterval(interval);
    } else {
      addErrorLog('Prerequisites not met for loading data');
    }
  }, [filterDate, selectedUser, firestore, isSuperAdmin, isAdminLoading]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Login Activity Tracker
          </h3>
          <p className="text-sm text-muted-foreground">
            Monitor staff login/logout activity and active sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportLogs} variant="outline" disabled={filteredLogs.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => { loadLoginLogs(); loadActiveSessions(); }} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button 
            onClick={() => setShowErrorLog(!showErrorLog)} 
            variant={errorLog.length > 0 ? "destructive" : "outline"}
          >
            <Eye className="mr-2 h-4 w-4" />
            Debug Log ({errorLog.length})
          </Button>
          {errorLog.length > 0 && (
            <Button onClick={clearErrorLog} variant="outline" size="sm">
              Clear Log
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.totalLogins}</p>
                <p className="text-xs text-muted-foreground">Successful Logins</p>
              </div>
              <LogIn className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.failedLogins}</p>
                <p className="text-xs text-muted-foreground">Failed Logins</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.totalLogouts}</p>
                <p className="text-xs text-muted-foreground">Logouts</p>
              </div>
              <LogOut className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.timeouts}</p>
                <p className="text-xs text-muted-foreground">Timeouts</p>
              </div>
              <Clock className="h-4 w-4 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.uniqueUsers}</p>
                <p className="text-xs text-muted-foreground">Unique Users</p>
              </div>
              <Users className="h-4 w-4 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">{stats.avgSessionDuration}</p>
                <p className="text-xs text-muted-foreground">Avg Session (min)</p>
              </div>
              <Timer className="h-4 w-4 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.activeNow}</p>
                <p className="text-xs text-muted-foreground">Active Now</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Debug/Error Log Panel */}
      {showErrorLog && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Debug Log
              </CardTitle>
              <Button onClick={() => setShowErrorLog(false)} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              Real-time log of operations and errors for debugging
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40 w-full rounded border bg-white p-3">
              <div className="space-y-1 font-mono text-sm">
                {errorLog.length === 0 ? (
                  <p className="text-muted-foreground italic">No log entries yet...</p>
                ) : (
                  errorLog.map((entry, index) => (
                    <div 
                      key={index} 
                      className={`${
                        entry.includes('Error:') ? 'text-red-600' : 
                        entry.includes('ℹ️') ? 'text-blue-600' : 
                        'text-gray-700'
                      }`}
                    >
                      {entry}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search users, emails, IPs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={filterDate} onValueChange={setFilterDate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="session_timeout">Timeout</SelectItem>
                  <SelectItem value="forced_logout">Forced Logout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="Super Admin">Super Admin</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {Array.from(new Set(loginLogs.map(log => log.userId))).map(userId => {
                    const user = loginLogs.find(log => log.userId === userId);
                    return user ? (
                      <SelectItem key={userId} value={userId}>
                        {user.userName} ({user.userRole})
                      </SelectItem>
                    ) : null;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Logs and Active Sessions */}
      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Logs ({filteredLogs.length})
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Active Sessions ({activeSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Login Activity Logs</CardTitle>
              <CardDescription>
                Detailed log of all login/logout activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading activity logs...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activity logs found for the selected criteria</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => {
                        const ActionIcon = ACTION_ICONS[log.action];
                        const DeviceIcon = getDeviceIcon(log.deviceType);
                        
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {format(log.timestamp, 'MMM dd, HH:mm:ss')}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(log.timestamp, { addSuffix: true })}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{log.userName}</div>
                                <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                                <Badge className={ROLE_COLORS[log.userRole as keyof typeof ROLE_COLORS]}>
                                  {log.userRole}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={ACTION_COLORS[log.action]}>
                                <ActionIcon className="mr-1 h-3 w-3" />
                                {log.action.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                                <div className="space-y-1">
                                  <div className="text-sm">{log.deviceType || 'Unknown'}</div>
                                  <div className="text-xs text-muted-foreground">{log.browser}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">{log.ipAddress}</div>
                                {log.location && (
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {log.location}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {log.sessionDuration ? (
                                <div className="flex items-center gap-1">
                                  <Timer className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{log.sessionDuration} min</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.success ? (
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Success
                                </Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-800">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Failed
                                </Badge>
                              )}
                              {log.failureReason && (
                                <div className="text-xs text-red-600 mt-1">
                                  {log.failureReason}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Currently logged in users and their session information
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active sessions found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSessions.map((session) => {
                    const DeviceIcon = getDeviceIcon(session.deviceType);
                    
                    return (
                      <Card key={session.userId} className="border-l-4 border-l-green-500">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-3 flex-1">
                              {/* User Info */}
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{session.userName}</span>
                                </div>
                                <Badge className={ROLE_COLORS[session.userRole as keyof typeof ROLE_COLORS]}>
                                  {session.userRole}
                                </Badge>
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Active
                                </Badge>
                              </div>

                              {/* Session Details */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="space-y-1">
                                  <div className="text-muted-foreground">Login Time</div>
                                  <div>{format(session.loginTime, 'MMM dd, HH:mm:ss')}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(session.loginTime, { addSuffix: true })}
                                  </div>
                                </div>
                                
                                <div className="space-y-1">
                                  <div className="text-muted-foreground">Last Activity</div>
                                  <div>{format(session.lastActivity, 'HH:mm:ss')}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(session.lastActivity, { addSuffix: true })}
                                  </div>
                                </div>
                                
                                <div className="space-y-1">
                                  <div className="text-muted-foreground">Session Duration</div>
                                  <div className="flex items-center gap-1">
                                    <Timer className="h-3 w-3" />
                                    {session.sessionDuration} minutes
                                  </div>
                                </div>
                              </div>

                              {/* Device & Location Info */}
                              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <DeviceIcon className="h-4 w-4" />
                                  <span>{session.deviceType || 'Desktop'}</span>
                                </div>
                                {session.browser && (
                                  <div className="flex items-center gap-1">
                                    <Globe className="h-4 w-4" />
                                    <span>{session.browser}</span>
                                  </div>
                                )}
                                {session.ipAddress && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-4 w-4" />
                                    <span>{session.ipAddress}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => forceLogoutUser(session.userId, session.userName)}
                              >
                                <LogOut className="mr-2 h-3 w-3" />
                                Force Logout
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
  } catch (error) {
    console.error('LoginActivityTracker error:', error);
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold text-red-600 mb-2">Component Error</h3>
        <p className="text-muted-foreground">
          There was an error loading the login activity tracker. Please refresh the page.
        </p>
      </div>
    );
  }
}