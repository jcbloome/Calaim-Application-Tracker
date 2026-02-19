'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  TrendingUp, 
  Users, 
  Calendar, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Bell,
  BarChart3,
  User,
  ArrowRight,
  MessageSquare
} from 'lucide-react';
import { useMemberActivityTracker } from '@/lib/member-activity-tracker';
import { format, formatDistanceToNow } from 'date-fns';

interface ActivityFilter {
  category: string;
  priority: string;
  timeRange: string;
  member: string;
}

export default function MemberActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>({
    category: 'all',
    priority: 'all',
    timeRange: 'week',
    member: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  
  const { 
    stats, 
    refreshStats, 
    getRecentActivities, 
    getMemberActivities,
    getMemberActivitySummary 
  } = useMemberActivityTracker();

  // Get filtered activities
  const getFilteredActivities = () => {
    let activities = selectedMember 
      ? getMemberActivities(selectedMember, 100)
      : getRecentActivities(200);

    // Apply filters
    if (filter.category !== 'all') {
      activities = activities.filter(a => a.category === filter.category);
    }
    
    if (filter.priority !== 'all') {
      activities = activities.filter(a => a.priority === filter.priority);
    }
    
    if (filter.timeRange !== 'all') {
      const now = new Date();
      let cutoff = new Date();
      
      switch (filter.timeRange) {
        case 'today':
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      if (filter.timeRange !== 'all') {
        activities = activities.filter(a => new Date(a.timestamp) >= cutoff);
      }
    }
    
    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      activities = activities.filter(a => 
        a.title.toLowerCase().includes(search) ||
        a.description.toLowerCase().includes(search) ||
        a.clientId2.toLowerCase().includes(search) ||
        a.changedByName.toLowerCase().includes(search)
      );
    }
    
    return activities;
  };

  const filteredActivities = getFilteredActivities();

  // Get activity icon
  const getActivityIcon = (activityType: string) => {
    const icons = {
      status_change: BarChart3,
      pathway_change: TrendingUp,
      date_update: Calendar,
      assignment_change: Users,
      note_added: MessageSquare,
      form_update: CheckCircle,
      authorization_change: CheckCircle
    };
    return icons[activityType as keyof typeof icons] || Activity;
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    const colors = {
      low: 'text-gray-500 bg-gray-100',
      normal: 'text-blue-600 bg-blue-100',
      high: 'text-orange-600 bg-orange-100',
      urgent: 'text-red-600 bg-red-100'
    };
    return colors[priority as keyof typeof colors] || colors.normal;
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    const colors = {
      pathway: 'text-purple-600 bg-purple-100',
      kaiser: 'text-red-600 bg-red-100',
      application: 'text-blue-600 bg-blue-100',
      assignment: 'text-green-600 bg-green-100',
      communication: 'text-yellow-600 bg-yellow-100',
      authorization: 'text-teal-600 bg-teal-100',
      system: 'text-gray-600 bg-gray-100'
    };
    return colors[category as keyof typeof colors] || colors.system;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📊 Member Activity Tracking</h1>
          <p className="text-muted-foreground">
            Complete log and notification system for all member activity
          </p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={refreshStats} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {filteredActivities.length === 0 && (
        <Alert>
          <AlertDescription>
            No activity has been logged yet. This dashboard shows real member activity events (for example: staff assignment
            updates, pathway/status changes, and other tracked actions).
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Activities</p>
                <p className="text-2xl font-bold">{stats.totalActivities}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold">{stats.todayActivities}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{stats.weekActivities}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Urgent Items</p>
                <p className="text-2xl font-bold">{stats.urgentActivities}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Members</p>
                <p className="text-2xl font-bold">{stats.membersCovered}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search activities..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Member</label>
              <Input
                placeholder="Client ID2 (e.g., CL001234)"
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select value={filter.category} onValueChange={(value) => setFilter({...filter, category: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="pathway">Pathway</SelectItem>
                  <SelectItem value="kaiser">Kaiser</SelectItem>
                  <SelectItem value="application">Application</SelectItem>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="authorization">Authorization</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Priority</label>
              <Select value={filter.priority} onValueChange={(value) => setFilter({...filter, priority: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Time Range</label>
              <Select value={filter.timeRange} onValueChange={(value) => setFilter({...filter, timeRange: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilter({ category: 'all', priority: 'all', timeRange: 'week', member: '' });
                  setSearchTerm('');
                  setSelectedMember('');
                }}
                className="w-full"
              >
                <Filter className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Activity Feed ({filteredActivities.length})</span>
            {selectedMember && (
              <Badge variant="outline">
                Showing activities for {selectedMember}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No activities found matching your criteria</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {filteredActivities.map((activity) => {
                  const IconComponent = getActivityIcon(activity.activityType);
                  return (
                    <Card key={activity.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className="flex-shrink-0 mt-1">
                              <IconComponent className="w-5 h-5 text-blue-600" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <h3 className="font-semibold text-sm">{activity.title}</h3>
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ${getCategoryColor(activity.category)}`}
                                >
                                  {activity.category}
                                </Badge>
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ${getPriorityColor(activity.priority)}`}
                                >
                                  {activity.priority}
                                </Badge>
                              </div>
                              
                              <p className="text-sm text-muted-foreground mb-2">
                                {activity.description}
                              </p>
                              
                              {activity.oldValue && activity.newValue && (
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-2">
                                  <span className="bg-red-50 text-red-700 px-2 py-1 rounded">
                                    {activity.oldValue}
                                  </span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span className="bg-green-50 text-green-700 px-2 py-1 rounded">
                                    {activity.newValue}
                                  </span>
                                </div>
                              )}
                              
                              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                <div className="flex items-center space-x-1">
                                  <User className="w-3 h-3" />
                                  <span>{activity.changedByName}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}</span>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {activity.clientId2}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          {activity.requiresNotification && (
                            <Bell className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* System Information */}
      <Alert>
        <Activity className="h-4 w-4" />
        <AlertDescription>
          <strong>Activity Tracking:</strong> This system automatically logs all member changes including 
          status updates, pathway changes, date modifications, staff assignments, and more. Staff receive 
          real-time notifications for relevant activities and can view complete member history.
        </AlertDescription>
      </Alert>
    </div>
  );
}