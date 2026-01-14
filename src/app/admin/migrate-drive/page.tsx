'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, FolderOpen, CheckCircle2, AlertTriangle, Upload, Database, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ClientIDFileFinder from '@/components/ClientIDFileFinder';
import IntelligentNameMatcher from '@/components/IntelligentNameMatcher';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DriveFolder {
  id: string;
  name: string;
  fileCount: number;
  suggestedMatch?: {
    client_ID2: string;
    memberName: string;
    confidence: number;
  };
  manualClientId?: string;
  status: 'pending' | 'matched' | 'migrated' | 'error';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();

  const authenticateGoogleDrive = async () => {
    try {
      const functions = getFunctions();
      const authFunction = httpsCallable(functions, 'authenticateGoogleDrive');
      
      const result = await authFunction();
      const data = result.data as any;
      
      if (data.success) {
        setIsAuthenticated(true);
        toast({
          title: 'Google Drive Connected',
          description: 'Successfully authenticated with Google Drive',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Authentication Failed',
        description: error.message || 'Failed to authenticate with Google Drive',
      });
    }
  };

  const scanCalAIMFolders = async (limitFolders: boolean = false, maxFolders: number = 10) => {
    setIsScanning(true);
    
    try {
      const functions = getFunctions();
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

  const updateManualClientId = (folderId: string, clientId: string) => {
    setFolders(prev => prev.map(folder => 
      folder.id === folderId 
        ? { ...folder, manualClientId: clientId, status: 'matched' as const }
        : folder
    ));
  };

  const acceptSuggestedMatch = (folderId: string) => {
    setFolders(prev => prev.map(folder => 
      folder.id === folderId 
        ? { ...folder, status: 'matched' as const }
        : folder
    ));
  };

  const startMigration = async () => {
    const matchedFolders = folders.filter(f => f.status === 'matched');
    
    if (matchedFolders.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Folders Ready',
        description: 'Please match folders to members before starting migration',
      });
      return;
    }

    setIsMigrating(true);
    setProgress({
      totalFolders: matchedFolders.length,
      processedFolders: 0,
      totalFiles: 0,
      migratedFiles: 0,
      errors: []
    });

    try {
      const functions = getFunctions();
      const migrateFunction = httpsCallable(functions, 'migrateDriveFoldersToFirebase');
      
      const migrationData = matchedFolders.map(folder => ({
        folderId: folder.id,
        folderName: folder.name,
        clientId: folder.manualClientId || folder.suggestedMatch?.client_ID2
      }));

      const result = await migrateFunction({ folders: migrationData });
      const data = result.data as any;
      
      if (data.success) {
        setProgress(data.progress);
        toast({
          title: 'Migration Complete!',
          description: `Successfully migrated ${data.progress.migratedFiles} files from ${data.progress.processedFolders} folders`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        // Update folder statuses
        setFolders(prev => prev.map(folder => 
          matchedFolders.some(mf => mf.id === folder.id)
            ? { ...folder, status: 'migrated' as const }
            : folder
        ));
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Migration Failed',
        description: error.message || 'Failed to migrate folders',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const readyToMigrate = folders.filter(f => f.status === 'matched').length;
  const needsReview = folders.filter(f => f.status === 'pending').length;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Google Drive Migration</h1>
        <p className="text-muted-foreground">
          One-time migration of existing CalAIM member folders from Google Drive to Firebase Storage
        </p>
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
              Scan the "CalAIM Members" folder and match to existing members
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
              Start with "Test Scan" to verify Google Drive access with a few folders
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration Status */}
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
                  <p className="text-sm font-medium text-muted-foreground">Ready to Migrate</p>
                  <p className="text-2xl font-bold text-green-600">{readyToMigrate}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Needs Review</p>
                  <p className="text-2xl font-bold text-yellow-600">{needsReview}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Migration Progress */}
      {isMigrating && (
        <Card>
          <CardHeader>
            <CardTitle>Migration Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Folders: {progress.processedFolders} / {progress.totalFolders}</span>
                <span>Files: {progress.migratedFiles} / {progress.totalFiles}</span>
              </div>
              <Progress value={(progress.processedFolders / progress.totalFolders) * 100} />
            </div>
            {progress.currentFolder && (
              <p className="text-sm text-muted-foreground">
                Currently processing: {progress.currentFolder}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Folders Table */}
      {folders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Member Folder Matching</CardTitle>
            <CardDescription>
              Review and confirm folder-to-member matches before migration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {needsReview > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Review Required</AlertTitle>
                  <AlertDescription>
                    {needsReview} folders need manual review before migration can begin.
                  </AlertDescription>
                </Alert>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folder Name</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Suggested Match</TableHead>
                    <TableHead>Manual Client ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folders.map((folder) => (
                    <TableRow key={folder.id}>
                      <TableCell className="font-medium">{folder.name}</TableCell>
                      <TableCell>{folder.fileCount}</TableCell>
                      <TableCell>
                        {folder.suggestedMatch ? (
                          <div className="space-y-1">
                            <div className="font-medium">{folder.suggestedMatch.memberName}</div>
                            <div className="text-sm text-muted-foreground">
                              ID: {folder.suggestedMatch.client_ID2}
                            </div>
                            <Badge className={getConfidenceColor(folder.suggestedMatch.confidence)}>
                              {Math.round(folder.suggestedMatch.confidence * 100)}% match
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No match found</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Enter client_ID2"
                          value={folder.manualClientId || ''}
                          onChange={(e) => updateManualClientId(folder.id, e.target.value)}
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          folder.status === 'matched' ? 'default' :
                          folder.status === 'migrated' ? 'secondary' :
                          folder.status === 'error' ? 'destructive' : 'outline'
                        }>
                          {folder.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {folder.suggestedMatch && folder.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acceptSuggestedMatch(folder.id)}
                          >
                            Accept Match
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {readyToMigrate > 0 && (
                <div className="flex justify-end">
                  <Button
                    onClick={startMigration}
                    disabled={isMigrating}
                    className="w-48"
                  >
                    {isMigrating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Migrating...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Start Migration ({readyToMigrate} folders)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Intelligent Name Matching */}
      <IntelligentNameMatcher />

      {/* ClientID File Finder */}
      <ClientIDFileFinder />
    </div>
  );
}