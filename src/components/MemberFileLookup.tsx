'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Loader2, FileText, Download, Search, FolderOpen, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface MemberFile {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: Date;
  uploadedBy: string;
  downloadUrl?: string;
  size?: number;
}

interface MemberFileRecord {
  clientId: string;
  folderName: string;
  fileCount: number;
  migratedAt: Date;
  migratedBy: string;
  source: string;
  files?: MemberFile[];
}

interface MemberFileLookupProps {
  clientId?: string;
  className?: string;
}

export function MemberFileLookup({ clientId: initialClientId, className = '' }: MemberFileLookupProps) {
  const [clientId, setClientId] = useState(initialClientId || '');
  const [isSearching, setIsSearching] = useState(false);
  const [memberFiles, setMemberFiles] = useState<MemberFileRecord | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();

  const searchMemberFiles = async (searchClientId?: string) => {
    const searchId = searchClientId || clientId;
    
    if (!searchId.trim()) {
      toast({
        variant: 'destructive',
        title: 'Client ID Required',
        description: 'Please enter a client ID to search for files',
      });
      return;
    }

    if (!firestore) {
      toast({
        variant: 'destructive',
        title: 'Database Error',
        description: 'Unable to connect to database',
      });
      return;
    }

    setIsSearching(true);
    setSearchPerformed(true);

    try {
      // Search for member files by client ID
      const memberFileDoc = await getDoc(doc(firestore, 'member-files', searchId));
      
      if (memberFileDoc.exists()) {
        const data = memberFileDoc.data();
        setMemberFiles({
          clientId: searchId,
          folderName: data.folderName,
          fileCount: data.fileCount,
          migratedAt: data.migratedAt?.toDate() || new Date(),
          migratedBy: data.migratedBy,
          source: data.source,
          files: data.files || []
        });
        
        toast({
          title: 'Files Found',
          description: `Found ${data.fileCount} files for client ${searchId}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        setMemberFiles(null);
        toast({
          title: 'No Files Found',
          description: `No files found for client ID: ${searchId}`,
          className: 'bg-yellow-100 text-yellow-900 border-yellow-200',
        });
      }
    } catch (error: any) {
      console.error('Error searching member files:', error);
      toast({
        variant: 'destructive',
        title: 'Search Error',
        description: 'Failed to search for member files',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search if clientId is provided as prop
  useEffect(() => {
    if (initialClientId && firestore) {
      searchMemberFiles(initialClientId);
    }
  }, [initialClientId, firestore]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchMemberFiles();
    }
  };

  const getFileIcon = (fileType: string) => {
    // Return appropriate icon based on file type
    return FileText;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Member File Lookup
        </CardTitle>
        <CardDescription>
          Search for files associated with a specific member using their client ID
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter client ID (e.g., CALAIM-2024-001)"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button 
            onClick={() => searchMemberFiles()}
            disabled={isSearching}
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Search Results */}
        {searchPerformed && (
          <>
            {memberFiles ? (
              <div className="space-y-4">
                {/* File Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Files</p>
                          <p className="text-2xl font-bold">{memberFiles.fileCount}</p>
                        </div>
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Original Folder</p>
                        <p className="text-sm font-semibold truncate">{memberFiles.folderName}</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Migrated</p>
                        <p className="text-sm font-semibold">
                          {format(memberFiles.migratedAt, 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Migration Info */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Migrated from {memberFiles.source} on {format(memberFiles.migratedAt, 'PPP')}
                  </span>
                  <Badge variant="outline">{memberFiles.source}</Badge>
                </div>

                {/* File List */}
                {memberFiles.files && memberFiles.files.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Files:</h4>
                    <div className="space-y-2">
                      {memberFiles.files.map((file) => {
                        const FileIcon = getFileIcon(file.fileType);
                        return (
                          <div
                            key={file.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-3">
                              <FileIcon className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{file.fileName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {formatFileSize(file.size)} • {format(file.uploadedAt, 'MMM dd, yyyy')}
                                </p>
                              </div>
                            </div>
                            {file.downloadUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={file.downloadUrl} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </a>
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>File details are being processed</p>
                    <p className="text-sm">Individual file information will be available soon</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No files found for this client ID</p>
                <p className="text-sm">Try searching with a different client ID or check if files have been migrated</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}