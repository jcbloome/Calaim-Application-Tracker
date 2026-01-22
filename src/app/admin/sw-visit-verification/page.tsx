'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  MapPin, 
  Users, 
  CheckCircle, 
  Clock, 
  FileText,
  PenTool,
  Calendar,
  Home,
  User,
  AlertCircle,
  Save,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

interface RCFEFacility {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  licenseNumber?: string;
  contactPhone?: string;
}

interface VisitMember {
  id: string;
  name: string;
  roomNumber?: string;
  careLevel: 'Low' | 'Medium' | 'High';
  lastVisit?: string;
  notes?: string;
  visited: boolean;
}

interface VisitVerification {
  id: string;
  socialWorkerEmail: string;
  socialWorkerName: string;
  rcfeId: string;
  rcfeName: string;
  visitDate: string;
  visitTime: string;
  members: VisitMember[];
  generalNotes: string;
  signature: string;
  signatureDate: string;
  status: 'Draft' | 'Completed' | 'Submitted';
}

export default function SWVisitVerificationPage() {
  const [rcfeFacilities, setRCFEFacilities] = useState<RCFEFacility[]>([]);
  const [selectedRCFE, setSelectedRCFE] = useState<string>('');
  const [visitMembers, setVisitMembers] = useState<VisitMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generalNotes, setGeneralNotes] = useState('');
  const [signature, setSignature] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitTime, setVisitTime] = useState(new Date().toTimeString().slice(0, 5));
  
  const { user } = useUser();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load RCFE facilities and members on component mount
  useEffect(() => {
    if (user?.email) {
      loadRCFEFacilities();
    }
  }, [user]);

  // Load members when RCFE is selected
  useEffect(() => {
    if (selectedRCFE) {
      loadMembersForRCFE(selectedRCFE);
    }
  }, [selectedRCFE]);

  const loadRCFEFacilities = async () => {
    if (!user?.email) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/sw-assignments?email=${encodeURIComponent(user.email)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch SW assignments');
      }
      
      const data = await response.json();
      console.log('📊 Loaded SW assignments:', data);
      
      if (data.success && data.facilities) {
        const facilities: RCFEFacility[] = data.facilities.map((facility: any) => ({
          id: facility.id,
          name: facility.name,
          address: facility.address,
          city: facility.city,
          county: facility.county,
          licenseNumber: facility.licenseNumber,
          contactPhone: facility.contactPhone
        }));
        
        setRCFEFacilities(facilities);
        
        // Store facility members for later use
        data.facilities.forEach((facility: any) => {
          if (facility.members) {
            // Store members data for when RCFE is selected
            (window as any)[`members_${facility.id}`] = facility.members;
          }
        });
      }
    } catch (error) {
      console.error('Error loading RCFE facilities:', error);
      toast({
        title: "Error",
        description: "Failed to load your assigned RCFE facilities",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMembersForRCFE = async (rcfeId: string) => {
    setLoading(true);
    try {
      // Get members from stored data (loaded when facilities were fetched)
      const storedMembers = (window as any)[`members_${rcfeId}`];
      
      if (storedMembers && Array.isArray(storedMembers)) {
        const members: VisitMember[] = storedMembers.map((member: any) => ({
          id: member.id,
          name: member.name,
          roomNumber: member.roomNumber,
          careLevel: member.careLevel || 'Medium',
          lastVisit: member.lastVisit,
          notes: member.notes || '',
          visited: false
        }));
        
        setVisitMembers(members);
        console.log(`📋 Loaded ${members.length} members for RCFE: ${rcfeId}`);
      } else {
        console.log('⚠️ No members found for RCFE:', rcfeId);
        setVisitMembers([]);
      }
    } catch (error) {
      console.error('Error loading members:', error);
      toast({
        title: "Error",
        description: "Failed to load members for selected RCFE",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const syncFromCaspio = async () => {
    setSyncing(true);
    try {
      // Fetch RCFE facilities and members assigned to this social worker
      const response = await fetch(`/api/sw-assignments?email=${encodeURIComponent(user?.email || '')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch assignments from Caspio');
      }
      
      const data = await response.json();
      console.log('📊 Synced SW assignments from Caspio:', data);
      
      // Transform data (will implement when API is ready)
      
      toast({
        title: "Sync Complete",
        description: `Synced assignments from Caspio`,
      });
      
    } catch (error) {
      console.error('❌ Error syncing from Caspio:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync data from Caspio. Using local data.",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleMemberVisitToggle = (memberId: string, visited: boolean) => {
    setVisitMembers(prev => prev.map(member => 
      member.id === memberId ? { ...member, visited } : member
    ));
  };

  const handleMemberNotesChange = (memberId: string, notes: string) => {
    setVisitMembers(prev => prev.map(member => 
      member.id === memberId ? { ...member, notes } : member
    ));
  };

  // Signature pad functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature('');
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dataURL = canvas.toDataURL();
    setSignature(dataURL);
  };

  const submitVisitVerification = async () => {
    // READ-ONLY MODE: Submission is disabled
    toast({
      title: "Read-Only Mode",
      description: "Visit verification submission is disabled in read-only mode. This page only displays assignment data from Caspio.",
      variant: "destructive"
    });
    return;
  };

  const visitedCount = visitMembers.filter(m => m.visited).length;
  const totalMembers = visitMembers.length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Visit Verification</h1>
          <p className="text-muted-foreground">
            View your assigned RCFE members - {user?.displayName || user?.email}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              📖 Read-Only Mode
            </Badge>
            <span className="text-sm text-muted-foreground">Data synced from Caspio - verification submission disabled</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={syncFromCaspio} 
            disabled={syncing}
            variant="outline"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync Assignments'}
          </Button>
        </div>
      </div>

      {/* Visit Summary */}
      {selectedRCFE && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Selected RCFE</p>
                  <p className="font-semibold">{rcfeFacilities.find(f => f.id === selectedRCFE)?.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Members to Visit</p>
                  <p className="text-2xl font-bold">{totalMembers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Visited Today</p>
                  <p className="text-2xl font-bold">{visitedCount}/{totalMembers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* RCFE Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Select RCFE Facility
          </CardTitle>
          <CardDescription>
            Choose the RCFE facility you are visiting today
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="rcfe-select">RCFE Facility</Label>
              <Select value={selectedRCFE} onValueChange={setSelectedRCFE}>
                <SelectTrigger id="rcfe-select">
                  <SelectValue placeholder="Select an RCFE facility..." />
                </SelectTrigger>
                <SelectContent>
                  {rcfeFacilities.map(facility => (
                    <SelectItem key={facility.id} value={facility.id}>
                      {facility.name} - {facility.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="visit-date">Visit Date</Label>
              <Input
                id="visit-date"
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="visit-time">Visit Time</Label>
              <Input
                id="visit-time"
                type="time"
                value={visitTime}
                onChange={(e) => setVisitTime(e.target.value)}
              />
            </div>
          </div>

          {selectedRCFE && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start gap-3">
                <Home className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900">
                    {rcfeFacilities.find(f => f.id === selectedRCFE)?.name}
                  </h3>
                  <p className="text-blue-700 text-sm">
                    {rcfeFacilities.find(f => f.id === selectedRCFE)?.address}, {' '}
                    {rcfeFacilities.find(f => f.id === selectedRCFE)?.city}
                  </p>
                  {rcfeFacilities.find(f => f.id === selectedRCFE)?.contactPhone && (
                    <p className="text-blue-600 text-sm">
                      Phone: {rcfeFacilities.find(f => f.id === selectedRCFE)?.contactPhone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members List */}
      {selectedRCFE && visitMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Members to Visit ({visitedCount}/{totalMembers} completed)
            </CardTitle>
            <CardDescription>
              Check off each member you visit and add any notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {visitMembers.map((member) => (
              <div key={member.id} className="border rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <Checkbox
                    id={`member-${member.id}`}
                    checked={member.visited}
                    onCheckedChange={(checked) => 
                      handleMemberVisitToggle(member.id, checked as boolean)
                    }
                    className="mt-1"
                  />
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{member.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span>{member.roomNumber}</span>
                          <Badge variant="outline" className={
                            member.careLevel === 'High' ? 'border-red-200 text-red-700' :
                            member.careLevel === 'Medium' ? 'border-yellow-200 text-yellow-700' :
                            'border-green-200 text-green-700'
                          }>
                            {member.careLevel} Care
                          </Badge>
                        </div>
                      </div>
                      {member.lastVisit && (
                        <div className="text-right text-sm text-gray-600">
                          <p>Last Visit:</p>
                          <p>{new Date(member.lastVisit).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor={`notes-${member.id}`} className="text-sm">
                        Visit Notes (Optional)
                      </Label>
                      <Textarea
                        id={`notes-${member.id}`}
                        placeholder="Add any notes about this visit..."
                        value={member.notes || ''}
                        onChange={(e) => handleMemberNotesChange(member.id, e.target.value)}
                        className="mt-1"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* General Notes */}
      {selectedRCFE && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              General Visit Notes
            </CardTitle>
            <CardDescription>
              Add any general observations about the facility or overall visit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="General notes about the facility, staff, or overall visit conditions..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>
      )}

      {/* Electronic Signature */}
      {selectedRCFE && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Electronic Signature
            </CardTitle>
            <CardDescription>
              Sign below to verify your visit to this RCFE facility
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="border border-gray-200 rounded cursor-crosshair w-full"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                style={{ touchAction: 'none' }}
              />
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={clearSignature}>
                  Clear Signature
                </Button>
                <Button variant="outline" size="sm" onClick={saveSignature}>
                  Save Signature
                </Button>
              </div>
            </div>
            
            <div className="text-sm text-gray-600">
              <p>By signing above, I verify that I have visited the selected RCFE facility on {visitDate} at {visitTime} and have checked on the indicated members.</p>
              <p className="mt-1">Social Worker: {user?.displayName || user?.email}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      {selectedRCFE && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Ready to Submit?</h3>
                <p className="text-sm text-gray-600">
                  {visitedCount > 0 
                    ? `You have verified visits to ${visitedCount} member${visitedCount !== 1 ? 's' : ''}`
                    : 'Please check off at least one member as visited'
                  }
                </p>
              </div>
              <Button 
                onClick={submitVisitVerification}
                disabled={true}
                size="lg"
                variant="outline"
              >
                <Save className="h-4 w-4 mr-2" />
                Submit Visit Verification (Read-Only)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}