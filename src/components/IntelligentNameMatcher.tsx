'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Brain, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  X,
  RefreshCw,
  Loader2,
  FileText,
  User,
  MapPin,
  Activity,
  Download,
  Upload,
  Target,
  Zap,
  TrendingUp
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface DriveFolder {
  id: string;
  name: string;
  extractedFirstName: string;
  extractedLastName: string;
  clientID?: string;
  hasClientID: boolean;
  fileCount?: number;
}

interface CaspioMember {
  Record_ID: string;
  client_ID2: string;
  Senior_First: string;
  Senior_Last: string;
  Member_County: string;
  CalAIM_Status: string;
  Kaiser_Status: string;
  CalAIM_MCP: string;
}

interface MatchResult {
  driveFolder: DriveFolder;
  caspioMatch?: CaspioMember;
  matchScore: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  confidence: 'high' | 'medium' | 'low';
  alternativeMatches?: Array<{
    member: CaspioMember;
    score: number;
  }>;
}

interface MatchingSummary {
  totalFolders: number;
  totalMembers: number;
  exactMatches: number;
  fuzzyMatches: number;
  partialMatches: number;
  noMatches: number;
  readyToImport: number;
}

export default function IntelligentNameMatcher() {
  const [isMatching, setIsMatching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [matchResults, setMatchResults] = useState<{
    exactMatches: MatchResult[];
    fuzzyMatches: MatchResult[];
    partialMatches: MatchResult[];
    noMatches: MatchResult[];
    summary: MatchingSummary;
  } | null>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const { toast } = useToast();

  // Start intelligent matching
  const startMatching = async () => {
    setIsMatching(true);
    try {
      const functions = getFunctions();
      const matchFolders = httpsCallable(functions, 'matchDriveFoldersWithCaspio');
      
      const result = await matchFolders({});
      const data = result.data as any;
      
      if (data.success) {
        setMatchResults(data.results);
        
        toast({
          title: 'Matching Complete! 🧠',
          description: `Found ${data.results.summary.readyToImport} high-confidence matches ready to import`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error in intelligent matching:', error);
      toast({
        variant: 'destructive',
        title: 'Matching Failed',
        description: error.message || 'Could not perform intelligent matching',
      });
    } finally {
      setIsMatching(false);
    }
  };

  // Auto-import high confidence matches
  const autoImport = async () => {
    if (!matchResults) return;
    
    setIsImporting(true);
    try {
      const functions = getFunctions();
      const autoImportFunc = httpsCallable(functions, 'autoImportHighConfidenceMatches');
      
      const highConfidenceMatches = [
        ...matchResults.exactMatches,
        ...matchResults.fuzzyMatches.filter(m => m.confidence === 'high')
      ];
      
      const result = await autoImportFunc({ matchResults: highConfidenceMatches });
      const data = result.data as any;
      
      if (data.success) {
        setImportResults(data.results);
        
        toast({
          title: 'Auto-Import Complete! 🚀',
          description: `Successfully imported ${data.results.summary.successful} folders`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error in auto-import:', error);
      toast({
        variant: 'destructive',
        title: 'Auto-Import Failed',
        description: error.message || 'Could not auto-import folders',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const getMatchTypeBadge = (matchType: string, confidence: string) => {
    if (matchType === 'exact') {
      return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="mr-1 h-3 w-3" />Exact Match</Badge>;
    } else if (matchType === 'fuzzy' && confidence === 'high') {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Target className="mr-1 h-3 w-3" />High Confidence</Badge>;
    } else if (matchType === 'fuzzy') {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><AlertTriangle className="mr-1 h-3 w-3" />Medium Confidence</Badge>;
    } else if (matchType === 'partial') {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><AlertTriangle className="mr-1 h-3 w-3" />Partial Match</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800 border-red-200"><X className="mr-1 h-3 w-3" />No Match</Badge>;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Intelligent Name Matching
          </h3>
          <p className="text-sm text-muted-foreground">
            Automatically match Google Drive folders with Caspio members using AI-powered name matching
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={startMatching} disabled={isMatching}>
            {isMatching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-2 h-4 w-4" />
            )}
            Start Intelligent Matching
          </Button>
        </div>
      </div>

      {/* Matching Process */}
      {isMatching && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="font-medium">Analyzing Google Drive folders and Caspio members...</span>
              </div>
              <Progress value={75} className="w-full" />
              <div className="text-sm text-muted-foreground">
                Using fuzzy matching, nickname detection, and confidence scoring to find the best matches
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Summary */}
      {matchResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Matching Results Summary
            </CardTitle>
            <CardDescription>
              Intelligent analysis of {matchResults.summary.totalFolders} Google Drive folders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{matchResults.summary.exactMatches}</div>
                <div className="text-xs text-muted-foreground">Exact Matches</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{matchResults.summary.fuzzyMatches}</div>
                <div className="text-xs text-muted-foreground">Fuzzy Matches</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{matchResults.summary.partialMatches}</div>
                <div className="text-xs text-muted-foreground">Partial Matches</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{matchResults.summary.noMatches}</div>
                <div className="text-xs text-muted-foreground">No Matches</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{matchResults.summary.readyToImport}</div>
                <div className="text-xs text-muted-foreground">Ready to Import</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{matchResults.summary.totalFolders}</div>
                <div className="text-xs text-muted-foreground">Total Folders</div>
              </div>
            </div>

            {/* Auto-Import Button */}
            {matchResults.summary.readyToImport > 0 && (
              <div className="flex justify-center">
                <Button 
                  onClick={autoImport} 
                  disabled={isImporting}
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isImporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Auto-Import {matchResults.summary.readyToImport} High-Confidence Matches
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Results
            </CardTitle>
            <CardDescription>
              Auto-import completed: {importResults.summary.successful} successful, {importResults.summary.failed} failed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {importResults.importResults.map((result: any, index: number) => (
                <div key={index} className={`flex items-center justify-between p-2 rounded border ${
                  result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{result.folderName}</div>
                    {result.success && (
                      <div className="text-xs text-muted-foreground">
                        → {result.clientID} ({result.memberName})
                      </div>
                    )}
                    {result.error && (
                      <div className="text-xs text-red-600">{result.error}</div>
                    )}
                  </div>
                  <div>
                    {result.success ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Imported
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800">
                        <X className="mr-1 h-3 w-3" />
                        Failed
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Results */}
      {matchResults && (
        <Tabs defaultValue="exact" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="exact" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Exact ({matchResults.exactMatches.length})
            </TabsTrigger>
            <TabsTrigger value="fuzzy" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Fuzzy ({matchResults.fuzzyMatches.length})
            </TabsTrigger>
            <TabsTrigger value="partial" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Partial ({matchResults.partialMatches.length})
            </TabsTrigger>
            <TabsTrigger value="none" className="flex items-center gap-2">
              <X className="h-4 w-4" />
              No Match ({matchResults.noMatches.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="exact">
            <MatchResultsTable matches={matchResults.exactMatches} title="Exact Matches" />
          </TabsContent>

          <TabsContent value="fuzzy">
            <MatchResultsTable matches={matchResults.fuzzyMatches} title="Fuzzy Matches" />
          </TabsContent>

          <TabsContent value="partial">
            <MatchResultsTable matches={matchResults.partialMatches} title="Partial Matches" />
          </TabsContent>

          <TabsContent value="none">
            <MatchResultsTable matches={matchResults.noMatches} title="No Matches Found" />
          </TabsContent>
        </Tabs>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            How Intelligent Matching Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <p className="mb-3"><strong>Our AI-powered matching system:</strong></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-green-600">✅ Exact Matches (100% confidence)</h4>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li>Perfect first and last name matches</li>
                  <li>Automatically ready for import</li>
                  <li>No manual review needed</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-blue-600">🎯 Fuzzy Matches (80-99% confidence)</h4>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li>Handles nicknames (Bill → William)</li>
                  <li>Corrects minor spelling differences</li>
                  <li>High confidence matches auto-imported</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-yellow-600">⚠️ Partial Matches (40-79% confidence)</h4>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li>Partial name matches</li>
                  <li>Requires manual review</li>
                  <li>Shows alternative suggestions</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-red-600">❌ No Matches (0-39% confidence)</h4>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li>No suitable matches found</li>
                  <li>May need manual ClientID tagging</li>
                  <li>Could be new members not in Caspio</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Match Results Table Component
interface MatchResultsTableProps {
  matches: MatchResult[];
  title: string;
}

function MatchResultsTable({ matches, title }: MatchResultsTableProps) {
  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No {title.toLowerCase()} found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getMatchTypeBadge = (matchType: string, confidence: string) => {
    if (matchType === 'exact') {
      return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="mr-1 h-3 w-3" />Exact</Badge>;
    } else if (matchType === 'fuzzy' && confidence === 'high') {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Target className="mr-1 h-3 w-3" />High</Badge>;
    } else if (matchType === 'fuzzy') {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><AlertTriangle className="mr-1 h-3 w-3" />Medium</Badge>;
    } else if (matchType === 'partial') {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><AlertTriangle className="mr-1 h-3 w-3" />Partial</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800 border-red-200"><X className="mr-1 h-3 w-3" />None</Badge>;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {matches.length} folders in this category
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Google Drive Folder</TableHead>
                <TableHead>Extracted Name</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Caspio Match</TableHead>
                <TableHead>Member Info</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((match, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{match.driveFolder.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {match.driveFolder.fileCount} files
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">
                        {match.driveFolder.extractedFirstName} {match.driveFolder.extractedLastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`font-bold ${getConfidenceColor(match.matchScore)}`}>
                      {match.matchScore}%
                    </div>
                  </TableCell>
                  <TableCell>
                    {match.caspioMatch ? (
                      <div className="space-y-1">
                        <div className="font-medium text-sm">
                          {match.caspioMatch.Senior_First} {match.caspioMatch.Senior_Last}
                        </div>
                        <Badge variant="outline" className="text-xs font-mono">
                          {match.caspioMatch.client_ID2}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No match found</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {match.caspioMatch && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{match.caspioMatch.Member_County} County</span>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          {match.caspioMatch.CalAIM_Status}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {getMatchTypeBadge(match.matchType, match.confidence)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}