'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  Loader2, 
  RefreshCw, 
  Search,
  Users,
  FolderOpen,
  Download,
  Filter,
  FileText,
  Folder,
  ExternalLink,
  Calendar,
  User,
  Hash,
  Archive
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LegacyMember {
  id: string;
  folderName: string;
  extractedFirstName: string;
  extractedLastName: string;
  extractedFullName: string;
  driveUrl: string;
  fileCount: number;
  subfolderCount: number;
  lastModified?: string;
  folderPath: string;
  hasKaiserFolder: boolean;
  hasHealthNetFolder: boolean;
  extractedClientId?: string;
  hasClientId: boolean;
}

interface SearchStats {
  totalMembers: number;
  withClientId: number;
  withKaiserFolder: number;
  withHealthNetFolder: number;
  totalFiles: number;
  lastImportDate?: string;
}

export default function LegacyMemberSearch() {
  const [members, setMembers] = useState<LegacyMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'kaiser' | 'healthnet' | 'clientid' | 'noclientid'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'modified' | 'files'>('name');
  const [stats, setStats] = useState<SearchStats | null>(null);
  const { toast } = useToast();

  // Filter and search members
  const filteredMembers = useMemo(() => {
    let filtered = members;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(member => 
        member.extractedFirstName.toLowerCase().includes(search) ||
        member.extractedLastName.toLowerCase().includes(search) ||
        member.extractedFullName.toLowerCase().includes(search) ||
        member.folderName.toLowerCase().includes(search) ||
        (member.extractedClientId && member.extractedClientId.includes(search))
      );
    }

    // Apply category filter
    switch (filterBy) {
      case 'kaiser':
        filtered = filtered.filter(member => member.hasKaiserFolder);
        break;
      case 'healthnet':
        filtered = filtered.filter(member => member.hasHealthNetFolder);
        break;
      case 'clientid':
        filtered = filtered.filter(member => member.hasClientId);
        break;
      case 'noclientid':
        filtered = filtered.filter(member => !member.hasClientId);
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.extractedFullName.localeCompare(b.extractedFullName);
        case 'modified':
          if (!a.lastModified && !b.lastModified) return 0;
          if (!a.lastModified) return 1;
          if (!b.lastModified) return -1;
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case 'files':
          return b.fileCount - a.fileCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [members, searchTerm, filterBy, sortBy]);

  // Calculate statistics
  useEffect(() => {
    if (members.length > 0) {
      const stats: SearchStats = {
        totalMembers: members.length,
        withClientId: members.filter(m => m.hasClientId).length,
        withKaiserFolder: members.filter(m => m.hasKaiserFolder).length,
        withHealthNetFolder: members.filter(m => m.hasHealthNetFolder).length,
        totalFiles: members.reduce((sum, m) => sum + m.fileCount, 0),
        lastImportDate: new Date().toISOString()
      };
      setStats(stats);
    }
  }, [members]);

  const testGoogleDriveConnection = async () => {
    setIsImporting(true);
    try {
      const functions = getFunctions();
      const testFunction = httpsCallable(functions, 'testGoogleDriveConnection');
      
      toast({
        title: 'Testing Connection',
        description: 'Testing Google Drive authentication and folder access...',
        className: 'bg-blue-100 text-blue-900 border-blue-200',
      });

      const result = await testFunction();
      const data = result.data as any;

      if (data.success && data.connected) {
        toast({
          title: 'Connection Successful!',
          description: data.message,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Connection Failed',
          description: data.message || data.error || 'Failed to connect to Google Drive',
        });
      }
    } catch (error: any) {
      console.error('Error testing Google Drive connection:', error);
      toast({
        variant: 'destructive',
        title: 'Connection Test Failed',
        description: error.message || 'Failed to test Google Drive connection',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const importLegacyMembers = async () => {
    setIsImporting(true);
    try {
      const functions = getFunctions();
      const importFunction = httpsCallable(functions, 'importLegacyMembersFromDrive');
      
      toast({
        title: 'Starting Import',
        description: 'Scanning Google Drive for legacy CalAIM member folders...',
        className: 'bg-blue-100 text-blue-900 border-blue-200',
      });

      const result = await importFunction();
      const data = result.data as any;

      if (data.success) {
        setMembers(data.members || []);
        toast({
          title: 'Import Successful!',
          description: `Imported ${data.members?.length || 0} legacy member records from Google Drive`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        throw new Error(data.message || 'Import failed');
      }
    } catch (error: any) {
      console.error('Error importing legacy members:', error);
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: error.message || 'Failed to import legacy members from Google Drive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const refreshFunction = httpsCallable(functions, 'refreshLegacyMemberData');
      
      const result = await refreshFunction();
      const data = result.data as any;

      if (data.success) {
        setMembers(data.members || []);
        toast({
          title: 'Data Refreshed',
          description: `Updated ${data.members?.length || 0} legacy member records`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      toast({
        variant: 'destructive',
        title: 'Refresh Failed',
        description: error.message || 'Failed to refresh legacy member data',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openDriveFolder = (member: LegacyMember) => {
    window.open(member.driveUrl, '_blank');
  };

  const exportSearchResults = () => {
    const csvContent = [
      ['Full Name', 'First Name', 'Last Name', 'Client ID', 'Folder Name', 'File Count', 'Has Kaiser', 'Has Health Net', 'Last Modified', 'Drive URL'].join(','),
      ...filteredMembers.map(member => [
        `"${member.extractedFullName}"`,
        `"${member.extractedFirstName}"`,
        `"${member.extractedLastName}"`,
        `"${member.extractedClientId || ''}"`,
        `"${member.folderName}"`,
        member.fileCount,
        member.hasKaiserFolder ? 'Yes' : 'No',
        member.hasHealthNetFolder ? 'Yes' : 'No',
        member.lastModified ? new Date(member.lastModified).toLocaleDateString() : '',
        `"${member.driveUrl}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `legacy_calaim_members_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Export Complete',
      description: `Exported ${filteredMembers.length} legacy member records to CSV`,
      className: 'bg-green-100 text-green-900 border-green-200',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Legacy CalAIM Member Search</h2>
          <p className="text-muted-foreground">
            Search and browse legacy CalAIM members stored in Google Drive folders
          </p>
        </div>
        <div className="flex gap-2">
          {members.length > 0 && (
            <Button onClick={refreshData} disabled={isLoading} variant="outline">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          )}
          <Button onClick={testGoogleDriveConnection} disabled={isImporting} variant="outline">
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
            Test Connection
          </Button>
          <Button onClick={importLegacyMembers} disabled={isImporting}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
            {members.length > 0 ? 'Re-import' : 'Import Legacy Members'}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.totalMembers}</p>
                  <p className="text-xs text-muted-foreground">Total Members</p>
                </div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.withClientId}</p>
                  <p className="text-xs text-muted-foreground">With Client ID</p>
                </div>
                <Hash className="h-4 w-4 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-purple-600">{stats.withKaiserFolder}</p>
                  <p className="text-xs text-muted-foreground">Kaiser Folders</p>
                </div>
                <Folder className="h-4 w-4 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.withHealthNetFolder}</p>
                  <p className="text-xs text-muted-foreground">Health Net Folders</p>
                </div>
                <Folder className="h-4 w-4 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-orange-600">{stats.totalFiles}</p>
                  <p className="text-xs text-muted-foreground">Total Files</p>
                </div>
                <FileText className="h-4 w-4 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      {members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter
            </CardTitle>
            <CardDescription>
              Search by name or Client ID, and filter by folder type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by first name, last name, or Client ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              
              <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="kaiser">Kaiser Folders</SelectItem>
                  <SelectItem value="healthnet">Health Net Folders</SelectItem>
                  <SelectItem value="clientid">With Client ID</SelectItem>
                  <SelectItem value="noclientid">No Client ID</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="modified">Last Modified</SelectItem>
                  <SelectItem value="files">File Count</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={exportSearchResults} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span>Showing {filteredMembers.length} of {members.length} members</span>
              {searchTerm && (
                <Badge variant="secondary">
                  Search: "{searchTerm}"
                </Badge>
              )}
              {filterBy !== 'all' && (
                <Badge variant="secondary">
                  Filter: {filterBy}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {members.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Legacy Member Records</CardTitle>
            <CardDescription>
              Browse and access legacy CalAIM member folders from Google Drive
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Folder Name</TableHead>
                  <TableHead>Plan Folders</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div>{member.extractedFullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {member.extractedFirstName} {member.extractedLastName}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {member.extractedClientId ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {member.extractedClientId}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">No ID</span>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <div className="max-w-xs truncate" title={member.folderName}>
                        {member.folderName}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex gap-1">
                        {member.hasKaiserFolder && (
                          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                            Kaiser
                          </Badge>
                        )}
                        {member.hasHealthNetFolder && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                            Health Net
                          </Badge>
                        )}
                        {!member.hasKaiserFolder && !member.hasHealthNetFolder && (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{member.fileCount}</span>
                        {member.subfolderCount > 0 && (
                          <>
                            <Folder className="h-3 w-3 text-muted-foreground ml-2" />
                            <span className="text-sm">{member.subfolderCount}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {member.lastModified ? (
                        <div className="text-sm">
                          {new Date(member.lastModified).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unknown</span>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDriveFolder(member)}
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open Drive
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Archive className="mx-auto h-12 w-12 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium">No Legacy Members Imported</h3>
                <p className="text-muted-foreground">
                  Click "Import Legacy Members" to scan Google Drive and import all CalAIM member folders
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}