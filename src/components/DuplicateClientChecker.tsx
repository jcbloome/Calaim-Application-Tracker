'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  AlertTriangle, 
  Users, 
  CheckCircle2, 
  Loader2,
  Link2,
  Unlink2,
  Eye
} from 'lucide-react';

interface DuplicateMatch {
  id: string;
  source: 'firestore' | 'caspio';
  memberName: string;
  clientId?: string;
  email?: string;
  phone?: string;
  dob?: string;
  similarity: number;
  status: string;
}

interface DuplicateCheckResult {
  hasDuplicates: boolean;
  matches: DuplicateMatch[];
  recommendations: string[];
  canProceed: boolean;
}

interface DuplicateClientCheckerProps {
  memberData: any;
  onDuplicateResolved?: (clientId: string) => void;
  className?: string;
}

export function DuplicateClientChecker({ 
  memberData, 
  onDuplicateResolved,
  className = '' 
}: DuplicateClientCheckerProps) {
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const { toast } = useToast();

  const checkForDuplicates = async () => {
    if (!memberData?.memberFirstName || !memberData?.memberLastName) return;
    
    setIsChecking(true);
    
    try {
      const functions = getFunctions();
      const checkDuplicates = httpsCallable(functions, 'checkForDuplicateClients');
      
      const result = await checkDuplicates({
        firstName: memberData.memberFirstName,
        lastName: memberData.memberLastName,
        email: memberData.memberEmail,
        phone: memberData.memberPhone,
        dob: memberData.memberDob,
        currentClientId: memberData.client_ID2
      });
      
      const data = result.data as any;
      
      if (data.success) {
        setDuplicateCheck(data.duplicateCheck);
        
        if (data.duplicateCheck.hasDuplicates) {
          toast({
            title: 'Potential Duplicates Found',
            description: `Found ${data.duplicateCheck.matches.length} potential duplicate(s)`,
            className: 'bg-yellow-100 text-yellow-900 border-yellow-200',
          });
        }
      }
    } catch (error: any) {
      console.error('Error checking duplicates:', error);
      toast({
        variant: 'destructive',
        title: 'Duplicate Check Failed',
        description: 'Could not check for duplicate clients',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const resolveDuplicate = async (action: 'merge' | 'keep_separate', selectedMatch?: DuplicateMatch) => {
    if (!duplicateCheck || !memberData) return;
    
    setIsResolving(true);
    
    try {
      const functions = getFunctions();
      const resolveDuplicates = httpsCallable(functions, 'resolveDuplicateClients');
      
      const result = await resolveDuplicates({
        action,
        currentMember: memberData,
        selectedMatch,
        allMatches: duplicateCheck.matches
      });
      
      const data = result.data as any;
      
      if (data.success) {
        setDuplicateCheck(null);
        
        toast({
          title: 'Duplicate Resolved',
          description: data.message,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        if (onDuplicateResolved && data.clientId) {
          onDuplicateResolved(data.clientId);
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Resolution Failed',
        description: error.message || 'Could not resolve duplicate',
      });
    } finally {
      setIsResolving(false);
    }
  };

  useEffect(() => {
    checkForDuplicates();
  }, [memberData?.memberFirstName, memberData?.memberLastName, memberData?.memberEmail]);

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.9) return 'bg-red-100 text-red-800 border-red-200';
    if (similarity >= 0.7) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  if (isChecking) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking for duplicate clients...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!duplicateCheck?.hasDuplicates) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>No duplicate clients found</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          Potential Duplicate Clients Found
        </CardTitle>
        <CardDescription>
          Found {duplicateCheck.matches.length} potential duplicate(s). Review and resolve before proceeding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Duplicate Matches */}
        <div className="space-y-3">
          {duplicateCheck.matches.map((match) => (
            <div key={match.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{match.memberName}</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{match.source}</Badge>
                    {match.clientId && (
                      <span>ID: {match.clientId}</span>
                    )}
                  </div>
                </div>
                <Badge className={getSimilarityColor(match.similarity)}>
                  {Math.round(match.similarity * 100)}% match
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                {match.email && (
                  <div>
                    <span className="font-medium">Email:</span> {match.email}
                  </div>
                )}
                {match.phone && (
                  <div>
                    <span className="font-medium">Phone:</span> {match.phone}
                  </div>
                )}
                {match.dob && (
                  <div>
                    <span className="font-medium">DOB:</span> {match.dob}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveDuplicate('merge', match)}
                  disabled={isResolving}
                >
                  <Link2 className="mr-2 h-3 w-3" />
                  Merge Records
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveDuplicate('keep_separate')}
                  disabled={isResolving}
                >
                  <Unlink2 className="mr-2 h-3 w-3" />
                  Keep Separate
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        {duplicateCheck.recommendations.length > 0 && (
          <Alert>
            <Eye className="h-4 w-4" />
            <AlertTitle>Recommendations</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {duplicateCheck.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {duplicateCheck.canProceed ? (
              <span className="text-green-600">✓ Can proceed after resolution</span>
            ) : (
              <span className="text-red-600">⚠ Must resolve duplicates first</span>
            )}
          </div>
          
          {isResolving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Resolving duplicate...</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}