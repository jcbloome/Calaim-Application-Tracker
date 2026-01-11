'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  Loader2, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Search,
  Users,
  FolderOpen,
  Brain,
  Download,
  Upload,
  Filter,
  Eye,
  EyeOff,
  FileText,
  Folder,
  ExternalLink,
  Check,
  X,
  AlertCircle,
  Target
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface DriveFolder {
  id: string;
  name: string;
  fullPath: string;
  parentId: string;
  extractedFirstName?: string;
  extractedLastName?: string;
  extractedFullName?: string;
  hasClientId?: boolean;
  extractedClientId?: string;
  fileCount?: number;
  subfolderCount?: number;
  lastModified?: string;
}

interface CaspioMember {
  Client_ID2: string;
  First_Name: string;
  Last_Name: string;
  fullName: string;
  memberMrn?: string;
  memberCounty?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
}

interface MatchSuggestion {
  driveFolder: DriveFolder;
  caspioMember: CaspioMember;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'manual';
  reasons: string[];
  requiresManualReview: boolean;
}

interface MatchingStats {
  totalFolders: number;
  totalMembers: number;
  exactMatches: number;
  fuzzyMatches: number;
  partialMatches: number;
  requiresReview: number;
  unmatchedFolders: number;
  unmatchedMembers: number;
}

export default function ComprehensiveDriveMatching() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'scan' | 'match' | 'review' | 'apply'>('scan');
  
  // Data states
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [members, setMembers] = useState<CaspioMember[]>([]);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [unmatchedFolders, setUnmatchedFolders] = useState<DriveFolder[]>([]);
  const [unmatchedMembers, setUnmatchedMembers] = useState<CaspioMember[]>([]);
  const [stats, setStats] = useState<MatchingStats | null>(null);
  
  // UI states
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(30);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  
  const { toast } = useToast();

  // Step 1: Scan Drive folders
  const scanDriveFolders = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const scanFolders = httpsCallable(functions, 'scanAllCalAIMFolders');
      
      const result = await scanFolders();
      const data = result.data as any;
      
      if (data.success) {
        setFolders(data.folders);
        toast({
          title: 'Drive Scan Complete! 📁',
          description: `Scanned ${data.stats.totalFolders} folders with ${data.stats.foldersWithClientId} already having Client IDs`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error scanning Drive folders:', error);
      toast({
        variant: 'destructive',
        title: 'Drive Scan Failed',
        description: error.message || 'Could not scan Google Drive folders',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Fetch Caspio members
  const fetchCaspioMembers = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getMembers = httpsCallable(functions, 'getAllCaspioMembersComprehensive');
      
      const result = await getMembers();
      const data = result.data as any;
      
      if (data.success) {
        setMembers(data.members);
        toast({
          title: 'Caspio Data Loaded! 👥',
          description: `Found ${data.stats.totalMembers} members with ${data.stats.kaiserMembers} Kaiser members`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error fetching Caspio members:', error);
      toast({
        variant: 'destructive',
        title: 'Caspio Fetch Failed',
        description: error.message || 'Could not fetch Caspio members',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Generate matching suggestions
  const generateMatching = async () => {
    if (folders.length === 0 || members.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Missing Data',
        description: 'Please scan Drive folders and fetch Caspio members first',
      });
      return;
    }

    setIsLoading(true);
    try {
      const functions = getFunctions();
      const generateMatches = httpsCallable(functions, 'generateComprehensiveMatching');
      
      const result = await generateMatches({ 
        folders, 
        members, 
        confidenceThreshold 
      });
      const data = result.data as any;
      
      if (data.success) {
        setSuggestions(data.suggestions);
        setUnmatchedFolders(data.unmatchedFolders);
        setUnmatchedMembers(data.unmatchedMembers);
        setStats(data.stats);
        setCurrentStep('review');
        
        toast({
          title: 'Matching Complete! 🤖',
          description: `Generated ${data.suggestions.length} suggestions with ${data.stats.exactMatches} exact matches`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error generating matches:', error);
      toast({
        variant: 'destructive',
        title: 'Matching Failed',
        description: error.message || 'Could not generate matching suggestions',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Apply confirmed matches
  const applyMatches = async () => {
    const selectedSuggestionsList = Array.from(selectedSuggestions).map(index => suggestions[index]);
    
    if (selectedSuggestionsList.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Matches Selected',
        description: 'Please select at least one match to apply',
      });
      return;
    }

    setIsLoading(true);
    try {
      const functions = getFunctions();
      const applyMatches = httpsCallable(functions, 'applyConfirmedMatches');
      
      const result = await applyMatches({ 
        confirmedMatches: selectedSuggestionsList
      });
      const data = result.data as any;
      
      if (data.success) {
        toast({
          title: 'Matches Applied! ✅',
          description: `Successfully applied ${data.results.applied} matches to Caspio`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        // Clear selections and move to next step
        setSelectedSuggestions(new Set());
        setCurrentStep('apply');
      }
    } catch (error: any) {
      console.error('Error applying matches:', error);
      toast({
        variant: 'destructive',
        title: 'Apply Failed',
        description: error.message || 'Could not apply matches to Caspio',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load all data at once
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([scanDriveFolders(), fetchCaspioMembers()]);
      setCurrentStep('match');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter suggestions based on type and search
  const filteredSuggestions = suggestions.filter(suggestion => {
    // Filter by match type
    if (filterType !== 'all' && suggestion.matchType !== filterType) {
      return false;
    }
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        suggestion.driveFolder.name.toLowerCase().includes(searchLower) ||
        suggestion.caspioMember.fullName.toLowerCase().includes(searchLower) ||
        suggestion.caspioMember.Client_ID2.includes(searchTerm)
      );
    }
    
    return true;
  });

  // Toggle suggestion selection
  const toggleSuggestion = (index: number) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedSuggestions(newSelected);
  };

  // Select matches by confidence
  const selectByConfidence = (minConfidence: number) => {
    const highConfidenceIndices = suggestions
      .map((suggestion, index) => ({ suggestion, index }))
      .filter(({ suggestion }) => suggestion.confidence >= minConfidence)
      .map(({ index }) => index);
    
    setSelectedSuggestions(new Set(highConfidenceIndices));
  };

  const getMatchTypeColor = (matchType: string) => {
    switch (matchType) {
      case 'exact': return 'bg-green-100 text-green-800 border-green-200';
      case 'fuzzy': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'partial': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'text-green-600 font-bold';
    if (confidence >= 80) return 'text-blue-600 font-semibold';
    if (confidence >= 60) return 'text-yellow-600 font-medium';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Comprehensive Drive-Caspio Matching System
          </h3>
          <p className="text-sm text-muted-foreground">
            Intelligent matching of 800+ Drive folders with 1000+ Caspio members
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Matching Process</CardTitle>
          <CardDescription>
            Follow these steps to match your Drive folders with Caspio members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            {[
              { step: 'scan', label: 'Scan Data', icon: Search },
              { step: 'match', label: 'Generate Matches', icon: Brain },
              { step: 'review', label: 'Review & Confirm', icon: Eye },
              { step: 'apply', label: 'Apply Changes', icon: Upload }
            ].map(({ step, label, icon: Icon }, index) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep === step ? 'border-blue-500 bg-blue-100 text-blue-600' :
                  ['scan', 'match', 'review'].indexOf(currentStep) > ['scan', 'match', 'review'].indexOf(step) ? 'border-green-500 bg-green-100 text-green-600' :
                  'border-gray-300 bg-gray-100 text-gray-400'
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="ml-2 text-sm font-medium">{label}</span>
                {index < 3 && <div className="w-16 h-px bg-gray-300 mx-4" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Data Loading */}
      {currentStep === 'scan' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Drive Folders
              </CardTitle>
              <CardDescription>
                Scan CalAIM Members folder structure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-2xl font-bold text-blue-600">
                  {folders.length.toLocaleString()}
                </div>
                <Button 
                  onClick={scanDriveFolders} 
                  disabled={isLoading}
                  className="w-full"
                  variant="outline"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Scan Drive Folders
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Caspio Members
              </CardTitle>
              <CardDescription>
                Fetch all member records from Caspio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-2xl font-bold text-green-600">
                  {members.length.toLocaleString()}
                </div>
                <Button 
                  onClick={fetchCaspioMembers} 
                  disabled={isLoading}
                  className="w-full"
                  variant="outline"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Fetch Caspio Data
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Quick Start
              </CardTitle>
              <CardDescription>
                Load both datasets simultaneously
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button 
                  onClick={loadAllData} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Load All Data
                </Button>
                <p className="text-xs text-muted-foreground">
                  Scans Drive folders and fetches Caspio members
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Generate Matching */}
      {currentStep === 'match' && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Intelligent Matches</CardTitle>
            <CardDescription>
              Configure matching parameters and generate suggestions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Confidence Threshold</label>
                  <Select value={confidenceThreshold.toString()} onValueChange={(value) => setConfidenceThreshold(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10% - Include all possible matches</SelectItem>
                      <SelectItem value="30">30% - Balanced approach (recommended)</SelectItem>
                      <SelectItem value="50">50% - Higher confidence only</SelectItem>
                      <SelectItem value="70">70% - Very high confidence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button 
                  onClick={generateMatching} 
                  disabled={isLoading || folders.length === 0 || members.length === 0}
                  className="w-full"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="mr-2 h-4 w-4" />
                  )}
                  Generate Intelligent Matches
                </Button>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Data Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Drive Folders:</span>
                    <div className="font-semibold">{folders.length.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Caspio Members:</span>
                    <div className="font-semibold">{members.length.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">With Client ID:</span>
                    <div className="font-semibold">{folders.filter(f => f.hasClientId).length}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Kaiser Members:</span>
                    <div className="font-semibold">{members.filter(m => m.Kaiser_Status).length}</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review Matches */}
      {currentStep === 'review' && stats && (
        <>
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Matching Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.exactMatches}</div>
                  <div className="text-sm text-muted-foreground">Exact Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.fuzzyMatches}</div>
                  <div className="text-sm text-muted-foreground">Fuzzy Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{stats.partialMatches}</div>
                  <div className="text-sm text-muted-foreground">Partial Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{stats.requiresReview}</div>
                  <div className="text-sm text-muted-foreground">Needs Review</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{stats.unmatchedFolders}</div>
                  <div className="text-sm text-muted-foreground">Unmatched</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Matching Controls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Review and Confirm Matches</CardTitle>
                  <CardDescription>
                    Select matches to apply to Caspio database
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setShowUnmatched(!showUnmatched)}
                    variant="outline"
                    size="sm"
                  >
                    {showUnmatched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showUnmatched ? 'Hide' : 'Show'} Unmatched
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <Input
                    placeholder="Search folders or members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
                
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="exact">Exact</SelectItem>
                    <SelectItem value="fuzzy">Fuzzy</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  onClick={() => selectByConfidence(95)}
                  variant="outline"
                  size="sm"
                >
                  Select Exact (95%+)
                </Button>

                <Button
                  onClick={() => selectByConfidence(80)}
                  variant="outline"
                  size="sm"
                >
                  Select High (80%+)
                </Button>

                <Button
                  onClick={applyMatches}
                  disabled={isLoading || selectedSuggestions.size === 0}
                  className="ml-auto"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Apply {selectedSuggestions.size} Selected
                </Button>
              </div>

              {/* Suggestions Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Drive Folder</TableHead>
                      <TableHead>Caspio Member</TableHead>
                      <TableHead>Client ID</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead>Reasons</TableHead>
                      <TableHead>Review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuggestions.map((suggestion, index) => {
                      const originalIndex = suggestions.indexOf(suggestion);
                      return (
                        <TableRow key={originalIndex} className={suggestion.requiresManualReview ? 'bg-yellow-50' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedSuggestions.has(originalIndex)}
                              onCheckedChange={() => toggleSuggestion(originalIndex)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>
                              <div className="font-semibold">{suggestion.driveFolder.name}</div>
                              {suggestion.driveFolder.extractedFullName && (
                                <div className="text-xs text-muted-foreground">
                                  Parsed: {suggestion.driveFolder.extractedFullName}
                                </div>
                              )}
                              {suggestion.driveFolder.hasClientId && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  ID: {suggestion.driveFolder.extractedClientId}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-semibold">{suggestion.caspioMember.fullName}</div>
                              {suggestion.caspioMember.memberCounty && (
                                <div className="text-xs text-muted-foreground">
                                  {suggestion.caspioMember.memberCounty} County
                                </div>
                              )}
                              {suggestion.caspioMember.Kaiser_Status && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {suggestion.caspioMember.Kaiser_Status}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {suggestion.caspioMember.Client_ID2}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={getConfidenceColor(suggestion.confidence)}>
                              {suggestion.confidence}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={getMatchTypeColor(suggestion.matchType)}>
                              {suggestion.matchType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{suggestion.driveFolder.fileCount || 0} files</div>
                              <div className="text-xs text-muted-foreground">
                                {suggestion.driveFolder.subfolderCount || 0} folders
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs">
                            {suggestion.reasons.slice(0, 2).join(', ')}
                            {suggestion.reasons.length > 2 && '...'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {suggestion.requiresManualReview && (
                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                              )}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Match Review</DialogTitle>
                                    <DialogDescription>
                                      Review this matching suggestion in detail
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h4 className="font-semibold">Drive Folder</h4>
                                        <p className="text-sm">{suggestion.driveFolder.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {suggestion.driveFolder.fileCount} files, {suggestion.driveFolder.subfolderCount} subfolders
                                        </p>
                                      </div>
                                      <div>
                                        <h4 className="font-semibold">Caspio Member</h4>
                                        <p className="text-sm">{suggestion.caspioMember.fullName}</p>
                                        <p className="text-xs text-muted-foreground">
                                          ID: {suggestion.caspioMember.Client_ID2}
                                        </p>
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Match Reasons</h4>
                                      <ul className="text-sm space-y-1">
                                        {suggestion.reasons.map((reason, i) => (
                                          <li key={i} className="flex items-center gap-2">
                                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            {reason}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium">Review Notes</label>
                                      <Textarea
                                        placeholder="Add any notes about this match..."
                                        value={reviewNotes[originalIndex] || ''}
                                        onChange={(e) => setReviewNotes(prev => ({
                                          ...prev,
                                          [originalIndex]: e.target.value
                                        }))}
                                        rows={3}
                                      />
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {filteredSuggestions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No matching suggestions found with current filters
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Step 4: Applied Results */}
      {currentStep === 'apply' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Matches Applied Successfully
            </CardTitle>
            <CardDescription>
              Your confirmed matches have been applied to the Caspio database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800">Next Steps</h4>
                <ul className="text-sm text-green-700 space-y-1 mt-2">
                  <li>• Drive folder IDs have been saved to Caspio member records</li>
                  <li>• You can now access member files directly from the application pages</li>
                  <li>• File structure mapping is available for document management</li>
                  <li>• Unmatched folders can be reviewed and matched manually if needed</li>
                </ul>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={() => {
                  setCurrentStep('scan');
                  setSuggestions([]);
                  setSelectedSuggestions(new Set());
                }}>
                  Start New Matching Session
                </Button>
                <Button variant="outline" onClick={() => setShowUnmatched(true)}>
                  Review Unmatched Items
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unmatched Items */}
      {showUnmatched && (unmatchedFolders.length > 0 || unmatchedMembers.length > 0) && (
        <Tabs defaultValue="folders" className="w-full">
          <TabsList>
            <TabsTrigger value="folders">
              Unmatched Folders ({unmatchedFolders.length})
            </TabsTrigger>
            <TabsTrigger value="members">
              Unmatched Members ({unmatchedMembers.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="folders">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Unmatched Drive Folders
                </CardTitle>
                <CardDescription>
                  These folders could not be automatically matched and may need manual review
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {unmatchedFolders.map((folder) => (
                    <div key={folder.id} className="p-3 bg-gray-50 rounded border">
                      <div className="font-medium">{folder.name}</div>
                      {folder.extractedFullName && (
                        <div className="text-sm text-muted-foreground">
                          Parsed: {folder.extractedFullName}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {folder.fileCount} files, {folder.subfolderCount} subfolders
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Unmatched Caspio Members
                </CardTitle>
                <CardDescription>
                  These members don't have corresponding Drive folders or couldn't be matched
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {unmatchedMembers.map((member) => (
                    <div key={member.Client_ID2} className="p-3 bg-gray-50 rounded border">
                      <div className="font-medium">{member.fullName}</div>
                      <div className="text-sm text-muted-foreground">
                        ID: {member.Client_ID2}
                        {member.memberCounty && ` • ${member.memberCounty} County`}
                      </div>
                      {member.Kaiser_Status && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {member.Kaiser_Status}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}