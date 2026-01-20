'use client';

import React, { useState } from 'react';
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
  Upload, 
  Eye, 
  AlertTriangle,
  Shield,
  FileImage,
  Trash2,
  Save
} from 'lucide-react';

export interface EligibilityData {
  id?: string;
  memberName: string;
  memberMrn: string;
  healthPlan: 'Kaiser' | 'Health Net';
  eligibilityStatus?: 'eligible' | 'not-eligible' | 'pending' | 'unknown';
  eligibilityMessage?: string;
  screenshotUrl?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
}

interface EligibilityVerificationCardProps {
  memberData: EligibilityData;
  onEligibilityUpdate?: (data: EligibilityData) => void;
  onSave?: (data: EligibilityData) => Promise<void>;
  readonly?: boolean;
  showTitle?: boolean;
  className?: string;
}

export function EligibilityVerificationCard({
  memberData,
  onEligibilityUpdate,
  onSave,
  readonly = false,
  showTitle = true,
  className = ''
}: EligibilityVerificationCardProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(!memberData.eligibilityStatus || memberData.eligibilityStatus === 'pending');
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    eligibilityStatus: memberData.eligibilityStatus || 'pending',
    eligibilityMessage: memberData.eligibilityMessage || '',
    screenshot: null as File | null
  });

  const handleStatusChange = (status: 'eligible' | 'not-eligible') => {
    setFormData(prev => ({ ...prev, eligibilityStatus: status }));
  };

  const handleMessageChange = (message: string) => {
    setFormData(prev => ({ ...prev, eligibilityMessage: message }));
  };

  const handleScreenshotUpload = (file: File | null) => {
    setFormData(prev => ({ ...prev, screenshot: file }));
  };

  const handleSave = async () => {
    if (!formData.eligibilityStatus || formData.eligibilityStatus === 'pending') {
      toast({
        title: "Missing Information",
        description: "Please select an eligibility status",
        variant: "destructive"
      });
      return;
    }

    if (!formData.eligibilityMessage.trim()) {
      toast({
        title: "Missing Information", 
        description: "Please provide an eligibility message",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const updatedData: EligibilityData = {
        ...memberData,
        eligibilityStatus: formData.eligibilityStatus as 'eligible' | 'not-eligible',
        eligibilityMessage: formData.eligibilityMessage,
        verifiedAt: new Date()
      };

      // Handle screenshot upload if provided
      if (formData.screenshot) {
        // This would typically upload to Firebase Storage
        // For now, we'll simulate the upload
        const screenshotUrl = await uploadScreenshot(formData.screenshot, memberData.id || 'temp');
        updatedData.screenshotUrl = screenshotUrl;
      }

      // Call the save function if provided
      if (onSave) {
        await onSave(updatedData);
      }

      // Call the update callback
      if (onEligibilityUpdate) {
        onEligibilityUpdate(updatedData);
      }

      setIsEditing(false);
      
      toast({
        title: "Success",
        description: "Eligibility verification saved successfully"
      });

    } catch (error) {
      console.error('Error saving eligibility verification:', error);
      toast({
        title: "Error",
        description: "Failed to save eligibility verification",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'eligible': { color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
      'not-eligible': { color: 'bg-red-100 text-red-800 border-red-300', icon: XCircle },
      'pending': { color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: AlertTriangle },
      'unknown': { color: 'bg-gray-100 text-gray-800 border-gray-300', icon: AlertTriangle }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} border`}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace('-', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card className={`border-blue-200 bg-blue-50 ${className}`}>
      {showTitle && (
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              CalAIM Eligibility Verification
            </div>
            {memberData.eligibilityStatus && getStatusBadge(memberData.eligibilityStatus)}
          </CardTitle>
          <CardDescription>
            Verify CalAIM eligibility for {memberData.memberName} ({memberData.healthPlan})
          </CardDescription>
        </CardHeader>
      )}
      
      <CardContent className={showTitle ? '' : 'pt-6'}>
        {/* Member Information Summary */}
        <div className="mb-4 p-3 bg-white rounded-lg border">
          <h4 className="font-medium text-sm text-gray-700 mb-2">Member Information</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Name:</span>
              <p className="font-medium">{memberData.memberName}</p>
            </div>
            <div>
              <span className="text-gray-600">Health Plan:</span>
              <p className="font-medium">{memberData.healthPlan}</p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-600">MRN:</span>
              <p className="font-medium">{memberData.memberMrn}</p>
            </div>
          </div>
        </div>

        {/* Eligibility Verification Form */}
        {isEditing && !readonly ? (
          <div className="space-y-4">
            {/* Eligibility Status */}
            <div>
              <Label htmlFor="eligibilityStatus">Eligibility Status *</Label>
              <Select 
                value={formData.eligibilityStatus} 
                onValueChange={handleStatusChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select eligibility status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eligible">✅ Eligible for CalAIM</SelectItem>
                  <SelectItem value="not-eligible">❌ Not Eligible for CalAIM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Eligibility Message */}
            <div>
              <Label htmlFor="eligibilityMessage">Eligibility Details *</Label>
              <Textarea
                id="eligibilityMessage"
                value={formData.eligibilityMessage}
                onChange={(e) => handleMessageChange(e.target.value)}
                placeholder="Provide details about the eligibility verification..."
                rows={3}
              />
            </div>

            {/* Screenshot Upload */}
            <div>
              <Label htmlFor="screenshot">
                {memberData.healthPlan} Eligibility Screenshot
              </Label>
              <Input
                id="screenshot"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleScreenshotUpload(file);
                }}
              />
              <p className="text-xs text-gray-600 mt-1">
                Upload a screenshot of the eligibility verification from {memberData.healthPlan}'s system
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleSave}
                disabled={isSaving}
                size="sm"
              >
                {isSaving ? (
                  <>
                    <Save className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Verification
                  </>
                )}
              </Button>
              
              {memberData.eligibilityStatus && memberData.eligibilityStatus !== 'pending' && (
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  size="sm"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Display Mode */
          <div className="space-y-4">
            {memberData.eligibilityStatus && memberData.eligibilityStatus !== 'pending' ? (
              <>
                {/* Current Status */}
                <div>
                  <Label>Current Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(memberData.eligibilityStatus)}
                  </div>
                </div>

                {/* Eligibility Message */}
                {memberData.eligibilityMessage && (
                  <div>
                    <Label>Eligibility Details</Label>
                    <div className="mt-1 p-3 bg-white rounded border text-sm">
                      {memberData.eligibilityMessage}
                    </div>
                  </div>
                )}

                {/* Screenshot Display */}
                {memberData.screenshotUrl && (
                  <div>
                    <Label>Verification Screenshot</Label>
                    <div className="mt-1">
                      <img 
                        src={memberData.screenshotUrl} 
                        alt="Eligibility verification screenshot"
                        className="max-w-full h-auto border rounded cursor-pointer"
                        onClick={() => window.open(memberData.screenshotUrl, '_blank')}
                      />
                    </div>
                  </div>
                )}

                {/* Verification Info */}
                {memberData.verifiedAt && (
                  <div className="text-xs text-gray-600">
                    Verified on {memberData.verifiedAt.toLocaleDateString()} 
                    {memberData.verifiedBy && ` by ${memberData.verifiedBy}`}
                  </div>
                )}

                {/* Edit Button */}
                {!readonly && (
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditing(true)}
                    size="sm"
                  >
                    <FileImage className="h-4 w-4 mr-2" />
                    Update Verification
                  </Button>
                )}
              </>
            ) : (
              /* Pending State */
              <div className="text-center py-6">
                <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-3">
                  Eligibility verification required to complete this pathway
                </p>
                {!readonly && (
                  <Button 
                    onClick={() => setIsEditing(true)}
                    size="sm"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Verify Eligibility
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Utility function to upload screenshot (placeholder)
async function uploadScreenshot(file: File, memberId: string): Promise<string> {
  // This would integrate with Firebase Storage
  // For now, return a placeholder URL
  console.log('Uploading screenshot for member:', memberId, file.name);
  
  // Simulate upload delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return placeholder URL (in real implementation, this would be the Firebase Storage URL)
  return `https://storage.googleapis.com/calaim-tracker/eligibility-screenshots/${memberId}-${Date.now()}-${file.name}`;
}

export default EligibilityVerificationCard;