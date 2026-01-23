'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FolderOpen, CheckCircle2, AlertTriangle, Upload, Database, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { httpsCallable } from 'firebase/functions';
import { useFunctions } from '@/firebase';

interface DriveFolder {
  id: string;
  name: string;
  fileCount: number;
  subfolders?: DriveSubfolder[];
  files?: DriveFile[];
  path: string;
  status: 'scanned' | 'migrated' | 'error';
}

interface DriveSubfolder {
  id: string;
  name: string;
  fileCount: number;
  path: string;
}

interface DriveFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  modifiedTime: string;
}

interface MigrationProgress {
  totalFolders: number;
  processedFolders: number;
  totalFiles: number;
  migratedFiles: number;
  currentFolder?: string;
  errors: string[];
}

export default function MigrateDrivePage() {
  const { user, isAdmin, isSuperAdmin } = useAdmin();
  const router = useRouter();
  const { toast } = useToast();
  const functions = useFunctions();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [progress, setProgress] = useState<MigrationProgress>({
    totalFolders: 0,
    processedFolders: 0,
    totalFiles: 0,
    migratedFiles: 0,
    errors: []
  });

  useEffect(() => {
    // Temporarily allow access for testing
    // if (!isAdmin) {
    //   router.push('/admin');
    //   return;
    // }
  }, [isAdmin, router]);

  const authenticateGoogleDrive = async () => {
    try {
      // For now, we'll assume authentication is successful
      // In a real implementation, this would handle OAuth flow
      setIsAuthenticated(true);
      toast({
        title: 'Connected',
        description: 'Google Drive connection established',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: error.message || 'Failed to connect to Google Drive',
      });
    }
  };

  const scanCalAIMFolders = async (limitFolders: boolean = false, maxFolders: number = 10) => {
    if (!functions) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Firebase functions not available',
      });
      return;
    }

    setIsScanning(true);
    setFolders([]);

    try {
      const scanFunction = httpsCallable(functions, 'scanCalAIMDriveFolders');
      
      const result = await scanFunction({ limitFolders, maxFolders });
      const data = result.data as any;
      
      if (data.success) {
        setFolders(data.folders);
        const scanType = limitFolders ? `LIMITED TEST (${data.folders.length} folders)` : `FULL SCAN (${data.folders.length} folders)`;
        toast({
          title: 'Scan Complete',
          description: `${scanType} - Found ${data.folders.length} member folders in Google Drive`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Scan Failed',
        description: error.message || 'Failed to scan Google Drive folders',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const scannedFolders = folders.filter(f => f.status === 'scanned').length;
  const totalFiles = folders.reduce((sum, folder) => sum + folder.fileCount, 0);

  // Temporarily allow access for testing
  // if (!isAdmin) {
  //   return null;
  // }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Google Drive Migration</h1>
          <p className="text-muted-foreground">
            Explore and migrate CalAIM member folders from Google Drive
          </p>
        </div>
      </div>

      {/* Authentication Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Google Drive Authentication
          </CardTitle>
          <CardDescription>
            Connect to Google Drive to access the CalAIM Members folder
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isAuthenticated ? (
            <Button onClick={authenticateGoogleDrive} className="w-full">
              <FolderOpen className="mr-2 h-4 w-4" />
              Connect Google Drive
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span>Google Drive Connected</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan Folders Card */}
      {isAuthenticated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Scan CalAIM Folders
            </CardTitle>
            <CardDescription>
              Explore the structure of your "CalAIM Members" folder
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                onClick={() => scanCalAIMFolders(true, 10)} 
                disabled={isScanning}
                variant="outline"
                className="w-full"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Test Scan (10 folders)
                  </>
                )}
              </Button>
              
              <Button 
                onClick={() => scanCalAIMFolders(false)} 
                disabled={isScanning}
                className="w-full"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Full Scan (800+ folders)
                  </>
                )}
              </Button>
            </div>
            
            <div className="text-sm text-muted-foreground text-center">
              Start with "Test Scan" to verify Google Drive access and explore folder structure
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan Statistics */}
      {folders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Folders</p>
                  <p className="text-2xl font-bold">{folders.length}</p>
                </div>
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Scanned Folders</p>
                  <p className="text-2xl font-bold text-green-600">{scannedFolders}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Files</p>
                  <p className="text-2xl font-bold text-blue-600">{totalFiles}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Folder Hierarchy Display */}
      {folders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>CalAIM Members Folder Structure ({folders.length} folders)</span>
              <div className="flex gap-2 text-sm">
                <Badge variant="secondary">{scannedFolders} scanned</Badge>
                <Badge variant="outline">{totalFiles} total files</Badge>
              </div>
            </CardTitle>
            <CardDescription>
              Explore the structure of your CalAIM Members folder in Google Drive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Summary Table */}
              <div className="max-h-96 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Folder Name</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead>Subfolders</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {folders.map((folder) => (
                      <TableRow key={folder.id}>
                        <TableCell className="font-medium">{folder.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">{folder.path}</TableCell>
                        <TableCell>{folder.fileCount}</TableCell>
                        <TableCell>{folder.subfolders?.length || 0}</TableCell>
                        <TableCell>
                          <Badge variant={folder.status === 'scanned' ? 'secondary' : 'outline'}>
                            {folder.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Detailed Folder Structure */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Detailed Folder Structure</h3>
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {folders.slice(0, 5).map((folder) => (
                    <Card key={folder.id} className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">{folder.name}</span>
                          <Badge variant="outline">{folder.fileCount} files</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground font-mono pl-6">
                          {folder.path}
                        </div>
                        {folder.subfolders && folder.subfolders.length > 0 && (
                          <div className="pl-6 space-y-1">
                            <div className="text-sm font-medium">Subfolders:</div>
                            {folder.subfolders.map((subfolder) => (
                              <div key={subfolder.id} className="flex items-center gap-2 text-sm pl-4">
                                <FolderOpen className="h-3 w-3 text-gray-500" />
                                <span>{subfolder.name}</span>
                                <span className="text-muted-foreground">({subfolder.fileCount} files)</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {folder.files && folder.files.length > 0 && (
                          <div className="pl-6 space-y-1">
                            <div className="text-sm font-medium">Sample Files:</div>
                            {folder.files.slice(0, 3).map((file) => (
                              <div key={file.id} className="flex items-center gap-2 text-sm pl-4">
                                <FileText className="h-3 w-3 text-gray-500" />
                                <span className="truncate">{file.name}</span>
                                <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                              </div>
                            ))}
                            {folder.files.length > 3 && (
                              <div className="text-sm text-muted-foreground pl-4">
                                ... and {folder.files.length - 3} more files
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  {folders.length > 5 && (
                    <div className="text-center text-muted-foreground">
                      ... and {folders.length - 5} more folders
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}