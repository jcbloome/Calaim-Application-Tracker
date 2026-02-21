'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Upload, 
  Mail, 
  User, 
  Calendar,
  FileText,
  Building,
  Search,
  Filter,
  Download,
  Eye,
  Send,
  ExternalLink
} from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';

interface EligibilityCheck {
  id: string;
  memberName?: string;
  memberFirstName: string;
  memberLastName: string;
  memberBirthday: string;
  memberMrn: string;
  healthPlan: 'Kaiser' | 'Health Net';
  county: string;
  requesterName?: string;
  requesterFirstName: string;
  requesterLastName: string;
  requesterEmail: string;
  relationshipToMember: string;
  otherRelationshipSpecification?: string;
  additionalInfo?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'not-eligible';
  result?: 'eligible' | 'not-eligible';
  resultMessage?: string;
  screenshotUrl?: string;
  timestamp: any;
  completedAt?: any;
  assignedTo?: string;
}

export default function EligibilityChecksPage() {
  const { toast } = useToast();
  const { user, isAdmin } = useAdmin();
  const searchParams = useSearchParams();
  const [checks, setChecks] = useState<EligibilityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCheck, setSelectedCheck] = useState<EligibilityCheck | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const toDateSafe = (value: any): Date | null => {
    if (!value) return null;
    try {
      if (typeof value?.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      }
      const seconds =
        typeof value?._seconds === 'number'
          ? value._seconds
          : typeof value?.seconds === 'number'
            ? value.seconds
            : null;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) {
        const d = new Date(seconds * 1000);
        return !Number.isNaN(d.getTime()) ? d : null;
      }
      const ms = Date.parse(String(value));
      if (!Number.isNaN(ms)) return new Date(ms);
      return null;
    } catch {
      return null;
    }
  };

  const formatDob = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Stored as YYYY-MM-DD from <input type="date">; display as MM/DD/YYYY.
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    // Fallback: attempt to parse and format.
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) return raw;
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  };

  const formatRequestedDate = (value: any) => {
    const d = toDateSafe(value);
    if (!d) return 'Date not available';
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  };

  const buildResultEmailMessage = (
    result: 'eligible' | 'not-eligible',
    note: string,
    check: EligibilityCheck
  ) => {
    const memberName = `${String(check.memberFirstName || '').trim()} ${String(check.memberLastName || '').trim()}`.trim();
    const dob = formatDob(check.memberBirthday);
    const plan = String(check.healthPlan || '').trim();
    const county = String(check.county || '').trim();
    const ref = String(check.id || '').trim();

    const baseFacts = `Reference ID: ${ref}\nMember: ${memberName}${dob ? ` (DOB: ${dob})` : ''}\nHealth plan: ${plan}${county ? ` • ${county}` : ''}`;

    const noteTrimmed = String(note || '').trim();
    const noteBlock = noteTrimmed ? `\n\nNote:\n${noteTrimmed}` : '';

    if (result === 'eligible') {
      return [
        `Eligible for CalAIM Community Supports through Connections (based on the health plan portal check).`,
        '',
        baseFacts,
        '',
        `If you would like to proceed with Connections Care Home Consultants, please reply to this email.`,
        '',
        `Note: We do not include portal screenshots via email.`,
      ].join('\n') + noteBlock;
    }

    return [
      `Not eligible for CalAIM Community Supports (based on the health plan portal check).`,
      '',
      baseFacts,
      '',
      `If you have questions, please reply to this email.`,
      '',
      `Note: We do not include portal screenshots via email.`,
    ].join('\n') + noteBlock;
  };

  // Form state for processing eligibility check
  const [resultForm, setResultForm] = useState({
    result: '' as 'eligible' | 'not-eligible' | '',
    resultNote: '',
    screenshot: null as File | null
  });

  useEffect(() => {
    if (isAdmin) {
      fetchEligibilityChecks();
    }
  }, [isAdmin]);

  // Deep-link: /admin/eligibility-checks?checkId=abc
  useEffect(() => {
    const focusId = String(searchParams.get('checkId') || '').trim();
    if (!focusId) return;
    if (!checks || checks.length === 0) return;
    if (selectedCheck?.id === focusId) return;
    const found = checks.find((c) => c.id === focusId) || null;
    if (found) {
      setSelectedCheck(found);
    }
  }, [checks, searchParams, selectedCheck?.id]);

  const fetchEligibilityChecks = async () => {
    try {
      const response = await fetch('/api/admin/eligibility-checks');
      if (response.ok) {
        const data = await response.json();
        setChecks(data.checks || []);
      }
    } catch (error) {
      console.error('Error fetching eligibility checks:', error);
      toast({
        title: "Error",
        description: "Failed to load eligibility checks",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessCheck = async (checkId: string) => {
    if (!resultForm.result) {
      toast({
        title: "Missing Information",
        description: "Please select an eligibility result",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append('checkId', checkId);
      formData.append('result', resultForm.result);
      const resultMessage =
        selectedCheck
          ? buildResultEmailMessage(resultForm.result as 'eligible' | 'not-eligible', resultForm.resultNote, selectedCheck)
          : '';
      formData.append('resultMessage', resultMessage);
      if (resultForm.resultNote.trim()) {
        formData.append('resultNote', resultForm.resultNote.trim());
      }
      if (resultForm.screenshot) {
        formData.append('screenshot', resultForm.screenshot);
      }

      const response = await fetch('/api/admin/eligibility-checks/process', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Eligibility check processed and email sent to requester"
        });
        
        // Reset form and refresh data
        setResultForm({ result: '', resultNote: '', screenshot: null });
        setSelectedCheck(null);
        fetchEligibilityChecks();
      } else {
        throw new Error('Failed to process check');
      }
    } catch (error) {
      console.error('Error processing check:', error);
      toast({
        title: "Error",
        description: "Failed to process eligibility check",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'pending': { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      'in-progress': { color: 'bg-blue-100 text-blue-800', icon: Search },
      'completed': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'not-eligible': { color: 'bg-red-100 text-red-800', icon: XCircle }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace('-', ' ').toUpperCase()}
      </Badge>
    );
  };

  const filteredChecks = checks.filter(check => {
    const matchesStatus = filterStatus === 'all' || check.status === filterStatus;
    const memberName = String(check.memberName || `${check.memberFirstName || ''} ${check.memberLastName || ''}`.trim()).trim();
    const requesterName = String(check.requesterName || `${check.requesterFirstName || ''} ${check.requesterLastName || ''}`.trim()).trim();
    const matchesSearch = searchTerm === '' || 
      memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      requesterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      check.requesterEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-6">
          <CardContent className="text-center">
            <p className="text-red-600">Access denied. Admin privileges required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Eligibility Check Management
        </h1>
        <p className="text-gray-600">
          Review and process CalAIM eligibility check requests
        </p>
      </div>

      {/* Filters and Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by member name, requester name, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="not-eligible">Not Eligible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Eligibility Checks List */}
        <Card>
          <CardHeader>
            <CardTitle>Eligibility Check Requests ({filteredChecks.length})</CardTitle>
            <CardDescription>
              Click on a request to view details and process
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p>Loading eligibility checks...</p>
              </div>
            ) : filteredChecks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-8 w-8 mx-auto mb-2" />
                <p>No eligibility checks found</p>
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-[11px] font-semibold text-slate-700">
                  <div className="col-span-4">Member</div>
                  <div className="col-span-2">Requested</div>
                  <div className="col-span-2">Completed</div>
                  <div className="col-span-2">Requester</div>
                  <div className="col-span-1">Screenshot</div>
                  <div className="col-span-1 text-right">Status</div>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y">
                  {filteredChecks.map((check) => {
                    const memberName = `${check.memberFirstName} ${check.memberLastName}`.trim();
                    const requesterName = `${check.requesterFirstName} ${check.requesterLastName}`.trim();
                    const completedLabel =
                      check.completedAt ? formatRequestedDate(check.completedAt) : '—';
                    return (
                      <button
                        key={check.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 transition-colors ${
                          selectedCheck?.id === check.id ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                        }`}
                        onClick={() => setSelectedCheck(check)}
                      >
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-4 min-w-0">
                            <div className="text-sm font-medium truncate">{memberName}</div>
                            <div className="text-xs text-slate-600 truncate">
                              {check.healthPlan} • {check.county}
                            </div>
                          </div>
                          <div className="col-span-2 text-xs text-slate-700">
                            {formatRequestedDate(check.timestamp)}
                          </div>
                          <div className="col-span-2 text-xs text-slate-700">
                            {completedLabel}
                          </div>
                          <div className="col-span-2 text-xs text-slate-700 truncate" title={requesterName}>
                            {requesterName}
                          </div>
                          <div className="col-span-1 text-xs">
                            {check.screenshotUrl ? (
                              <a
                                href={check.screenshotUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                                View
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                          <div className="col-span-1 flex justify-end">
                            {getStatusBadge(check.status)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Check Details and Processing */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedCheck ? 'Process Eligibility Check' : 'Select a Check'}
            </CardTitle>
            <CardDescription>
              {selectedCheck ? 
                'Review details and provide eligibility results' : 
                'Select an eligibility check from the list to view details'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedCheck ? (
              <div className="space-y-6">
                {/* Member Details */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Member Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="font-medium">Name:</span>
                      <p>{selectedCheck.memberFirstName} {selectedCheck.memberLastName}</p>
                    </div>
                    <div>
                      <span className="font-medium">Birthday:</span>
                      <p>{formatDob(selectedCheck.memberBirthday)}</p>
                    </div>
                    <div>
                      <span className="font-medium">Date requested:</span>
                      <p>{formatRequestedDate(selectedCheck.timestamp)}</p>
                    </div>
                    <div>
                      <span className="font-medium">Health Plan:</span>
                      <p className="flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {selectedCheck.healthPlan}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">County:</span>
                      <p>{selectedCheck.county}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Medical Record Number (MRN):</span>
                      <p>{selectedCheck.memberMrn}</p>
                    </div>
                  </div>
                </div>

                {/* Requester Details */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Requester Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="font-medium">Name:</span>
                      <p>{selectedCheck.requesterFirstName} {selectedCheck.requesterLastName}</p>
                    </div>
                    <div>
                      <span className="font-medium">Email:</span>
                      <p>{selectedCheck.requesterEmail}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Relationship to Member:</span>
                      <p className="capitalize">
                        {selectedCheck.relationshipToMember?.replace('-', ' ')}
                        {selectedCheck.relationshipToMember === 'other' && selectedCheck.otherRelationshipSpecification && 
                          ` (${selectedCheck.otherRelationshipSpecification})`
                        }
                      </p>
                    </div>
                  </div>
                  {selectedCheck.additionalInfo && (
                    <div className="mt-3">
                      <span className="font-medium">Additional Info:</span>
                      <p className="text-sm mt-1 p-2 bg-gray-50 rounded">
                        {selectedCheck.additionalInfo}
                      </p>
                    </div>
                  )}
                </div>

                {/* Processing Form */}
                {selectedCheck.status !== 'completed' && (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Process Eligibility Check
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Result Selection */}
                      <div>
                        <Label htmlFor="result">Eligibility Result *</Label>
                        <Select 
                          value={resultForm.result} 
                          onValueChange={(value) => {
                            const next = value as 'eligible' | 'not-eligible';
                            setResultForm((prev) => ({ ...prev, result: next }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select eligibility result" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="eligible">Eligible for CalAIM</SelectItem>
                            <SelectItem value="not-eligible">Not Eligible for CalAIM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Optional note (included in email) */}
                      <div>
                        <Label htmlFor="resultNote">Note to requester (optional)</Label>
                        <Textarea
                          id="resultNote"
                          value={resultForm.resultNote}
                          onChange={(e) => 
                            setResultForm(prev => ({ ...prev, resultNote: e.target.value }))
                          }
                          placeholder="Optional note to include in the email (no screenshots will be sent)..."
                          rows={3}
                        />
                        <p className="mt-1 text-xs text-slate-600">
                          Screenshots are stored internally and are <span className="font-medium">not</span> included in the email.
                        </p>
                      </div>

                      {/* Screenshot Upload */}
                      <div>
                        <Label htmlFor="screenshot">
                          Screenshot of {selectedCheck.healthPlan} Eligibility Page
                        </Label>
                        <Input
                          id="screenshot"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setResultForm(prev => ({ ...prev, screenshot: file }));
                          }}
                        />
                        <p className="text-xs text-gray-600 mt-1">
                          Upload a screenshot of the eligibility verification from the health plan's system
                        </p>
                        <div className="mt-2 flex flex-col gap-1 text-sm">
                          {[
                            {
                              label: 'Health Net Portal',
                              url: 'https://sso.entrykeyid.com/as/authorization.oauth2?response_type=code&client_id=44eb17c3-cf1e-4479-a811-61d23ae8ffbd&scope=openid%20profile&state=AHTpvDa32bFDvM5ov3mwyNx0K75Gqqp4McPzc6oUgds%3D&redirect_uri=https://provider.healthnetcalifornia.com/careconnect/login/oauth2/code/pingcloud&code_challenge_method=S256&nonce=maCZdZx6F1X7mug7ZQiIcWILmxz29uLnBvZQ6mNj4LE&code_challenge=45qFtSM3GXeNCBHkpyU9vJmOwqtKUwYdcb7VJBbw6YA&app_origin=https://provider.healthnetcalifornia.com/careconnect/login/oauth2/code/pingcloud&brand=healthnet',
                            },
                            {
                              label: 'Kaiser South Portal',
                              url: 'https://healthy.kaiserpermanente.org/southern-california/community-providers/eligibility',
                            },
                            {
                              label: 'Kaiser North Portal',
                              url: 'https://healthy.kaiserpermanente.org/northern-california/community-providers/eligibility',
                            },
                          ].map((link) => (
                            <a
                              key={link.label}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>

                      {/* Submit Button */}
                      <Button 
                        onClick={() => handleProcessCheck(selectedCheck.id)}
                        disabled={isProcessing || !resultForm.result}
                        className="w-full"
                      >
                        {isProcessing ? (
                          <>
                            <Clock className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Send Results to Requester
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Completed Check Results */}
                {selectedCheck.status === 'completed' && (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Completed Results
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <span className="font-medium">Result:</span>
                        <p className="flex items-center gap-2 mt-1">
                          {selectedCheck.result === 'eligible' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          {selectedCheck.result === 'eligible' ? 'Eligible for CalAIM' : 'Not Eligible for CalAIM'}
                        </p>
                      </div>
                      {selectedCheck.resultMessage && (
                        <div>
                          <span className="font-medium">Message:</span>
                          <p className="text-sm mt-1 p-2 bg-gray-50 rounded">
                            {selectedCheck.resultMessage}
                          </p>
                        </div>
                      )}
                      {selectedCheck.screenshotUrl && (
                        <div>
                          <span className="font-medium">Screenshot:</span>
                          <div className="mt-1 text-sm">
                            <a
                              href={selectedCheck.screenshotUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 underline"
                            >
                              <ExternalLink className="h-4 w-4" />
                              View screenshot (internal)
                            </a>
                            <div className="mt-1 text-xs text-slate-600">
                              Screenshots are stored internally and are not included in requester emails.
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedCheck.completedAt && (
                        <div>
                          <span className="font-medium">Completed:</span>
                          <p className="text-sm">
                            {selectedCheck.completedAt.toDate ? 
                              selectedCheck.completedAt.toDate().toLocaleString() : 
                              'Date not available'
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4" />
                <p>Select an eligibility check from the list to view details and process results.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}