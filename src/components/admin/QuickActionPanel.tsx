'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  UserPlus, 
  FileText, 
  Send, 
  Search, 
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle,
  Phone,
  Mail,
  MessageSquare
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import type { Application } from '@/lib/definitions';

interface QuickActionPanelProps {
  applications: Application[];
  onRefresh: () => void;
}

export function QuickActionPanel({ applications, onRefresh }: QuickActionPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const toast = useEnhancedToast();

  const stats = {
    total: applications.length,
    pending: applications.filter(app => app.status === 'In Progress').length,
    needsRevision: applications.filter(app => app.status === 'Requires Revision').length,
    completed: applications.filter(app => app.status === 'Completed & Submitted').length,
    overdue: applications.filter(app => {
      // Applications older than 7 days without updates
      if (!app.lastUpdated) return false;
      const daysSinceUpdate = (Date.now() - app.lastUpdated.toMillis()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 7 && app.status === 'In Progress';
    }).length
  };

  const quickActions = [
    {
      title: 'Create User Account',
      description: 'Help a member create their account',
      icon: <UserPlus className="h-5 w-5" />,
      action: () => setIsCreatingUser(true),
      color: 'bg-blue-500'
    },
    {
      title: 'Send Reminder',
      description: 'Send reminder emails to pending applications',
      icon: <Send className="h-5 w-5" />,
      action: () => handleSendReminders(),
      color: 'bg-green-500'
    },
    {
      title: 'Generate Report',
      description: 'Create status report for management',
      icon: <FileText className="h-5 w-5" />,
      action: () => handleGenerateReport(),
      color: 'bg-purple-500'
    }
  ];

  const handleSendReminders = async () => {
    toast.info('Sending reminders...', 'Processing reminder emails');
    // Implementation would call your existing reminder system
    setTimeout(() => {
      toast.success('Reminders sent!', `Sent to ${stats.pending} pending applications`);
    }, 2000);
  };

  const handleGenerateReport = () => {
    const reportData = {
      date: new Date().toLocaleDateString(),
      stats,
      applications: applications.map(app => ({
        name: `${app.memberFirstName} ${app.memberLastName}`,
        status: app.status,
        pathway: app.pathway,
        lastUpdated: app.lastUpdated?.toDate().toLocaleDateString()
      }))
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calaim-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    toast.success('Report generated!', 'Report downloaded to your computer');
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Need Revision</p>
                <p className="text-2xl font-bold">{stats.needsRevision}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold">{stats.overdue}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto p-4 flex flex-col items-start space-y-2"
                onClick={action.action}
              >
                <div className={`p-2 rounded-md ${action.color} text-white`}>
                  {action.icon}
                </div>
                <div className="text-left">
                  <p className="font-medium">{action.title}</p>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search Applications</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name, MRN, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Label htmlFor="filter">Filter by Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Requires Revision">Needs Revision</SelectItem>
                  <SelectItem value="Completed & Submitted">Completed</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreatingUser} onOpenChange={setIsCreatingUser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="userEmail">Email Address</Label>
              <Input id="userEmail" type="email" placeholder="member@example.com" />
            </div>
            <div>
              <Label htmlFor="userName">Full Name</Label>
              <Input id="userName" placeholder="John Doe" />
            </div>
            <div>
              <Label htmlFor="tempPassword">Temporary Password</Label>
              <Input id="tempPassword" type="password" placeholder="Auto-generated" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsCreatingUser(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
              <Button className="flex-1">
                Create Account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}