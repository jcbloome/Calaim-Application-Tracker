'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  FolderOpen, 
  CheckCircle2, 
  AlertTriangle, 
  X,
  RefreshCw,
  Loader2,
  FileText,
  User,
  MapPin,
  Activity,
  ExternalLink,
  Download
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ClientIDFile {
  id: string;
  name: string;
  clientID: string;
  extractedName: string;
  pathway: string;
  hasClientID: boolean;
  caspioMatch: any;
  matchStatus: 'matched' | 'no_caspio_record' | 'error';
  memberInfo?: {
    name: string;
    county: string;
    status: string;
    kaiserStatus: string;
  };
  error?: string;
}

interface FolderStructure {
  rootFolder: {
    id: string;
    name: string;
    itemCount: number;
  };
  recentFiles: Array<{
    name: string;
    id: string;
    type: string;
    modified: string;
    hasClientID: boolean;
    clientID: string | null;
  }>;
  filesWithClientID: Array<{
    name: string;
    clientID: string;
    extractedName: string;
    pathway: string;
  }>;
  summary: {
    totalFiles: number;
    filesWithClientID: number;
    filesWithoutClientID: number;
    lastScanned: string;
  };
}

export default function ClientIDFileFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [clientIDFiles, setClientIDFiles] = useState<ClientIDFile[]>([]);
  const [folderStructure, setFolderStructure] = useState<FolderStructure | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  // Search for files with ClientID tags
  const searchClientIDFiles = async () => {
    setIsSearching(true);
    try {
      const functions = getFunctions();
      const searchFiles = httpsCallable(functions, 'searchClientIDFiles');
      
      const result = await searchFiles({});
      const data = result.data as any;
      
      if (data.success) {
        setClientIDFiles(data.files);
        
        toast({
          title: 'Search Complete',
          description: `Found ${data.summary.totalFound} files with ClientID tags`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error searching for ClientID files:', error);
      toast({
        variant: 'destructive',
        title: 'Search Failed',
        description: error.message || 'Could not search for ClientID files',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Get folder structure
  const getFolderStructure = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getStructure = httpsCallable(functions, 'getCalAIMFolderStructure');
      
      const result = await getStructure({});
      const data = result.data as any;
      
      if (data.success) {
        setFolderStructure(data.structure);
        
        toast({
          title: 'Folder Structure Retrieved',
          description: `Found ${data.structure.summary.totalFiles} total files`,
          className: 'bg-blue-100 text-blue-900 border-blue-200',
        });
      }
    } catch (error: any) {
      console.error('Error getting folder structure:', error);
      toast({
        variant: 'destructive',
        title: 'Structure Failed',
        description: error.message || 'Could not get folder structure',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Test Google Drive connection
  const testConnection = async () => {
    try {
      const functions = getFunctions();
      const testConn = httpsCallable(functions, 'testGoogleDriveConnection');
      
      const result = await testConn({});
      const data = result.data as any;
      
      if (data.success) {
        toast({
          title: 'Connection Test Successful',
          description: 'Google Drive API is working correctly',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Connection Test Failed',
        description: error.message || 'Google Drive API connection failed',
      });
    }
  };

  // Filter files based on search term
  const filteredFiles = clientIDFiles.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.clientID.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.extractedName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getMatchStatusBadge = (status: string) => {
    switch (status) {
      case 'matched':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="mr-1 h-3 w-3" />Matched</Badge>;
      case 'no_caspio_record':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><AlertTriangle className="mr-1 h-3 w-3" />No Record</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><X className="mr-1 h-3 w-3" />Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Search className="h-5 w-5" />
            ClientID File Finder
          </h3>
          <p className="text-sm text-muted-foreground">
            Find and match Google Drive files with ClientID tags
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={testConnection} variant="outline" size="sm">
            <Activity className="mr-2 h-4 w-4" />
            Test Connection
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4">
        <Button onClick={getFolderStructure} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="mr-2 h-4 w-4" />
          )}
          Get Folder Structure
        </Button>
        
        <Button onClick={searchClientIDFiles} disabled={isSearching}>
          {isSearching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Search ClientID Files
        </Button>
      </div>

      {/* Folder Structure Summary */}
      {folderStructure && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              CalAIM Members Folder Structure
            </CardTitle>
            <CardDescription>
              Overview of your Google Drive CalAIM Members folder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{folderStructure.summary.totalFiles}</div>
                <div className="text-xs text-muted-foreground">Total Files</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{folderStructure.summary.filesWithClientID}</div>
                <div className="text-xs text-muted-foreground">With ClientID</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{folderStructure.summary.filesWithoutClientID}</div>
                <div className="text-xs text-muted-foreground">Without ClientID</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{folderStructure.filesWithClientID.length}</div>
                <div className="text-xs text-muted-foreground">Ready to Import</div>
              </div>
            </div>

            {/* Files with ClientID Preview */}
            {folderStructure.filesWithClientID.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Files with ClientID Tags:</h4>
                <div className="space-y-2">
                  {folderStructure.filesWithClientID.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{file.extractedName}</div>
                        <div className="text-xs text-muted-foreground">{file.pathway}</div>
                      </div>
                      <Badge className="bg-green-100 text-green-800">
                        {file.clientID}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {clientIDFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              ClientID Files Found ({clientIDFiles.length})
            </CardTitle>
            <CardDescription>
              Files with ClientID tags and their Caspio matching status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Search Filter */}
            <div className="mb-4">
              <Label htmlFor="search-files">Search Files</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-files"
                  placeholder="Search by name, ClientID, or extracted name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Results Table */}
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>ClientID</TableHead>
                    <TableHead>Extracted Name</TableHead>
                    <TableHead>Pathway</TableHead>
                    <TableHead>Match Status</TableHead>
                    <TableHead>Caspio Info</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-sm">{file.name}</div>
                          <div className="text-xs text-muted-foreground">Google Drive File</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {file.clientID}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{file.extractedName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{file.pathway}</span>
                      </TableCell>
                      <TableCell>
                        {getMatchStatusBadge(file.matchStatus)}
                      </TableCell>
                      <TableCell>
                        {file.memberInfo ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{file.memberInfo.name}</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span>{file.memberInfo.county} County</span>
                            </div>
                            <div className="text-xs">
                              <Badge className="bg-blue-100 text-blue-800 text-xs">
                                {file.memberInfo.status}
                              </Badge>
                            </div>
                          </div>
                        ) : file.error ? (
                          <div className="text-xs text-red-600">{file.error}</div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No match found</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {filteredFiles.length === 0 && searchTerm && (
              <div className="text-center py-4 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No files match your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-blue-600" />
            How to Use ClientID Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <p className="mb-2"><strong>To tag your Google Drive files:</strong></p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to your Google Drive CalAIM Members folder</li>
              <li>Find the member folder you want to tag</li>
              <li>Rename it to include <code className="bg-gray-100 px-1 rounded">:ClientID: CL######</code> at the end</li>
              <li>Example: <code className="bg-gray-100 px-1 rounded">John Smith - SNF Transition :ClientID: CL001234</code></li>
              <li>Come back here and click "Search ClientID Files" to find them</li>
            </ol>
          </div>
          
          <div className="bg-blue-50 p-3 rounded border border-blue-200">
            <div className="text-sm">
              <strong className="text-blue-800">Current Status:</strong>
              <p className="text-blue-700 mt-1">
                You mentioned adding ClientID tags to two files. Use the "Search ClientID Files" button above to locate them and verify they match with Caspio records.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}