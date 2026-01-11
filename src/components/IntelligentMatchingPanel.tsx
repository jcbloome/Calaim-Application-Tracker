'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  EyeOff
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

interface DriveFolder {
  id: string;
  name: string;
  fullPath: string;
  parentId?: string;
}

interface CaspioMember {
  Client_ID2: string;
  First_Name: string;
  Last_Name: string;
  fullName: string;
}

interface MatchSuggestion {
  driveFolder: DriveFolder;
  caspioMember: CaspioMember;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'manual';
  reasons: string[];
}

interface MatchingStats {
  totalFolders: number;
  totalMembers: number;
  suggestedMatches: number;
  unmatchedFolders: number;
  unmatchedMembers: number;
  exactMatches: number;
  fuzzyMatches: number;
  partialMatches: number;
}

export default function IntelligentMatchingPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [members, setMembers] = useState<CaspioMember[]>([]);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [unmatchedFolders, setUnmatchedFolders] = useState<DriveFolder[]>([]);
  const [unmatchedMembers, setUnmatchedMembers] = useState<CaspioMember[]>([]);
  const [stats, setStats] = useState<MatchingStats | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [autoApplyThreshold, setAutoApplyThreshold] = useState(90);
  const { toast } = useToast();

  // Fetch Google Drive folders
  const fetchDriveFolders = async () => {
    try {
      const functions = getFunctions();
      const getAllFolders = httpsCallable(functions, 'getAllCalAIMFolders');
      
      const result = await getAllFolders();
      const data = result.data as any;
      
      if (data.success) {
        setFolders(data.folders);
        toast({
          title: 'Drive Folders Loaded! 📁',
          description: `Found ${data.count} CalAIM member folders`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error fetching Drive folders:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Load Drive Folders',
        description: error.message || 'Could not fetch Google Drive folders',
      });
    }
  };

  // Fetch Caspio members
  const fetchCaspioMembers = async () => {
    try {
      const functions = getFunctions();
      const getAllMembers = httpsCallable(functions, 'getAllCaspioMembers');
      
      const result = await getAllMembers();
      const data = result.data as any;
      
      if (data.success) {
        setMembers(data.members);
        toast({
          title: 'Caspio Members Loaded! 👥',
          description: `Found ${data.count} members in Caspio`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error fetching Caspio members:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Load Caspio Members',
        description: error.message || 'Could not fetch Caspio members',
      });
    }
  };

  // Load both datasets
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchDriveFolders(), fetchCaspioMembers()]);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate matching suggestions
  const generateSuggestions = async () => {
    if (folders.length === 0 || members.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Missing Data',
        description: 'Please load both Drive folders and Caspio members first',
      });
      return;
    }

    setIsLoading(true);
    try {
      const functions = getFunctions();
      const generateMatches = httpsCallable(functions, 'generateMatchingSuggestions');
      
      const result = await generateMatches({ folders, members });
      const data = result.data as any;
      
      if (data.success) {
        setSuggestions(data.suggestions);
        setUnmatchedFolders(data.unmatchedFolders);
        setUnmatchedMembers(data.unmatchedMembers);
        setStats(data.stats);
        
        toast({
          title: 'Matching Complete! 🤖',
          description: `Generated ${data.suggestions.length} matching suggestions`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error generating suggestions:', error);
      toast({
        variant: 'destructive',
        title: 'Matching Failed',
        description: error.message || 'Could not generate matching suggestions',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Apply selected suggestions
  const applySuggestions = async () => {
    const selectedSuggestionsList = Array.from(selectedSuggestions).map(index => suggestions[index]);
    
    if (selectedSuggestionsList.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Suggestions Selected',
        description: 'Please select at least one suggestion to apply',
      });
      return;
    }

    setIsLoading(true);
    try {
      const functions = getFunctions();
      const applyMatches = httpsCallable(functions, 'applyMatchingSuggestions');
      
      const result = await applyMatches({ 
        suggestions: selectedSuggestionsList,
        autoApplyThreshold 
      });
      const data = result.data as any;
      
      if (data.success) {
        toast({
          title: 'Matches Applied! ✅',
          description: `Successfully applied ${data.results.applied} matches`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        // Clear selections and refresh suggestions
        setSelectedSuggestions(new Set());
        await generateSuggestions();
      }
    } catch (error: any) {
      console.error('Error applying suggestions:', error);
      toast({
        variant: 'destructive',
        title: 'Apply Failed',
        description: error.message || 'Could not apply matching suggestions',
      });
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

  // Select all high-confidence matches
  const selectHighConfidenceMatches = () => {
    const highConfidenceIndices = suggestions
      .map((suggestion, index) => ({ suggestion, index }))
      .filter(({ suggestion }) => suggestion.confidence >= autoApplyThreshold)
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
    if (confidence >= 90) return 'text-green-600 font-semibold';
    if (confidence >= 70) return 'text-blue-600 font-medium';
    if (confidence >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Intelligent Drive-Caspio Matching
          </h3>
          <p className="text-sm text-muted-foreground">
            Automatically match Google Drive folders with Caspio member records
          </p>
        </div>
      </div>

      {/* Data Loading Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Google Drive Folders
            </CardTitle>
            <CardDescription>
              CalAIM member folders from Google Drive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-2xl font-bold text-blue-600">
                {folders.length.toLocaleString()}
              </div>
              <Button 
                onClick={fetchDriveFolders} 
                disabled={isLoading}
                className="w-full"
                variant="outline"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Load Drive Folders
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
              Member records from Caspio database
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
                Load Caspio Members
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Matching Engine
            </CardTitle>
            <CardDescription>
              Generate intelligent matching suggestions
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
              <Button 
                onClick={generateSuggestions} 
                disabled={isLoading || folders.length === 0 || members.length === 0}
                className="w-full"
                variant="outline"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="mr-2 h-4 w-4" />
                )}
                Generate Matches
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Matching Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <div className="text-2xl font-bold text-gray-600">{stats.unmatchedFolders}</div>
                <div className="text-sm text-muted-foreground">Unmatched</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matching Controls */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Matching Suggestions</CardTitle>
                <CardDescription>
                  Review and apply intelligent matching suggestions
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
                onClick={selectHighConfidenceMatches}
                variant="outline"
                size="sm"
              >
                Select High Confidence ({autoApplyThreshold}%+)
              </Button>

              <Button
                onClick={applySuggestions}
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
                    <TableHead>Reasons</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuggestions.map((suggestion, index) => {
                    const originalIndex = suggestions.indexOf(suggestion);
                    return (
                      <TableRow key={originalIndex}>
                        <TableCell>
                          <Checkbox
                            checked={selectedSuggestions.has(originalIndex)}
                            onCheckedChange={() => toggleSuggestion(originalIndex)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {suggestion.driveFolder.name}
                        </TableCell>
                        <TableCell>
                          {suggestion.caspioMember.fullName}
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
                        <TableCell className="text-sm text-muted-foreground">
                          {suggestion.reasons.join(', ')}
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
      )}

      {/* Unmatched Items */}
      {showUnmatched && (unmatchedFolders.length > 0 || unmatchedMembers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {unmatchedFolders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Unmatched Drive Folders ({unmatchedFolders.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {unmatchedFolders.map((folder) => (
                    <div key={folder.id} className="p-2 bg-gray-50 rounded text-sm">
                      {folder.name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {unmatchedMembers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Unmatched Caspio Members ({unmatchedMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {unmatchedMembers.map((member) => (
                    <div key={member.Client_ID2} className="p-2 bg-gray-50 rounded text-sm">
                      <div className="font-medium">{member.fullName}</div>
                      <div className="text-xs text-muted-foreground">ID: {member.Client_ID2}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}