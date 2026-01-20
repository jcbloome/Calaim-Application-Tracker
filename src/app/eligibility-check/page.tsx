'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Clock, 
  MapPin, 
  Shield,
  Mail,
  User,
  Calendar,
  FileText,
  Building,
  ExternalLink,
  Home,
  DollarSign
} from 'lucide-react';

// California counties
const CALIFORNIA_COUNTIES = [
  'Alameda', 'Alpine', 'Amador', 'Butte', 'Calaveras', 'Colusa', 'Contra Costa',
  'Del Norte', 'El Dorado', 'Fresno', 'Glenn', 'Humboldt', 'Imperial', 'Inyo',
  'Kern', 'Kings', 'Lake', 'Lassen', 'Los Angeles', 'Madera', 'Marin',
  'Mariposa', 'Mendocino', 'Merced', 'Modoc', 'Mono', 'Monterey', 'Napa',
  'Nevada', 'Orange', 'Placer', 'Plumas', 'Riverside', 'Sacramento', 'San Benito',
  'San Bernardino', 'San Diego', 'San Francisco', 'San Joaquin', 'San Luis Obispo',
  'San Mateo', 'Santa Barbara', 'Santa Clara', 'Santa Cruz', 'Shasta', 'Sierra',
  'Siskiyou', 'Solano', 'Sonoma', 'Stanislaus', 'Sutter', 'Tehama', 'Trinity',
  'Tulare', 'Tuolumne', 'Ventura', 'Yolo', 'Yuba'
];

// Form validation schema
const eligibilityCheckSchema = z.object({
  // Member Information
  memberName: z.string().min(2, 'Member name must be at least 2 characters'),
  memberBirthday: z.string().min(1, 'Member birthday is required'),
  memberMrn: z.string().min(1, 'MRN/Medi-Cal number is required'),
  healthPlan: z.enum(['Kaiser', 'Health Net'], {
    required_error: 'Please select a health plan'
  }),
  county: z.string().min(1, 'Please select a county'),
  
  // Requester Information
  requesterName: z.string().min(2, 'Your full name is required'),
  requesterEmail: z.string().email('Please enter a valid email address'),
  
  // Optional additional information
  additionalInfo: z.string().optional()
});

type EligibilityCheckForm = z.infer<typeof eligibilityCheckSchema>;

export default function EligibilityCheckPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedHealthPlan, setSelectedHealthPlan] = useState<string>('');
  const [selectedCounty, setSelectedCounty] = useState<string>('');

  const form = useForm<EligibilityCheckForm>({
    resolver: zodResolver(eligibilityCheckSchema),
    defaultValues: {
      memberName: '',
      memberBirthday: '',
      memberMrn: '',
      requesterName: '',
      requesterEmail: '',
      additionalInfo: ''
    }
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch } = form;
  const watchedHealthPlan = watch('healthPlan');

  // Check if county is supported for selected health plan
  const isCountySupported = (county: string, healthPlan: string): boolean => {
    if (healthPlan === 'Kaiser') return true; // Kaiser active in all counties
    if (healthPlan === 'Health Net') {
      return county === 'Los Angeles' || county === 'Sacramento';
    }
    return false;
  };

  const onSubmit = async (data: EligibilityCheckForm) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/eligibility-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Eligibility Check Submitted",
          description: `We'll email you the results within 1 business day. Reference ID: ${result.checkId}`,
        });
        
        // Reset form
        form.reset();
        setSelectedHealthPlan('');
        setSelectedCounty('');
      } else {
        throw new Error(result.message || 'Submission failed');
      }
      
    } catch (error: any) {
      console.error('Eligibility check submission error:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again or contact support.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            CalAIM Eligibility Check
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We're happy to help verify if a member is eligible for CalAIM Community Supports services.
            Simply provide the member's information below and we'll check their eligibility status.
          </p>
        </div>

          {/* Important Information Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Requirements Card */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Info className="h-5 w-5" />
                Important Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="text-blue-700">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Member must currently have active Medi-Cal coverage</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>If ineligible, we cannot determine the specific reason (e.g., share of cost)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Results provided within 1 business day via email</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Service Areas Card */}
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <MapPin className="h-5 w-5" />
                Service Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="text-green-700">
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Kaiser Permanente
                  </div>
                  <p className="ml-6">Active in all California counties</p>
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Health Net
                  </div>
                  <p className="ml-6">Los Angeles and Sacramento counties only</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Share of Cost Information Card */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <ExternalLink className="h-5 w-5" />
                Share of Cost Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-blue-700">
              <p className="text-sm mb-3">
                For detailed share of cost (SOC) information, members or authorized representatives should visit:
              </p>
              <a 
                href="https://benefitscal.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline font-medium text-sm"
              >
                BenefitsCal.com
              </a>
            </CardContent>
          </Card>

          {/* SNF Residents Information Card */}
          <Card className="border-purple-200 bg-purple-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-800">
                <Home className="h-5 w-5" />
                SNF Residents - Important Note
              </CardTitle>
            </CardHeader>
            <CardContent className="text-purple-700">
              <p className="text-sm">
                Members in Skilled Nursing Facilities (SNFs) with income above $1,800/month may not show a Share of Cost since the SNF receives most of their income. However, this may change when transitioning to community living.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Eligibility Check Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Eligibility Check Request
            </CardTitle>
            <CardDescription>
              Please provide the member's information and your contact details below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Member Information Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Member Information
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Member Name */}
                  <div>
                    <Label htmlFor="memberName">Member Full Name *</Label>
                    <Input
                      id="memberName"
                      {...register('memberName')}
                      placeholder="Enter member's full name"
                      className={errors.memberName ? 'border-red-500' : ''}
                    />
                    {errors.memberName && (
                      <p className="text-red-500 text-sm mt-1">{errors.memberName.message}</p>
                    )}
                  </div>

                  {/* Member Birthday */}
                  <div>
                    <Label htmlFor="memberBirthday">Date of Birth *</Label>
                    <Input
                      id="memberBirthday"
                      type="date"
                      {...register('memberBirthday')}
                      className={errors.memberBirthday ? 'border-red-500' : ''}
                    />
                    {errors.memberBirthday && (
                      <p className="text-red-500 text-sm mt-1">{errors.memberBirthday.message}</p>
                    )}
                  </div>

                  {/* Health Plan */}
                  <div>
                    <Label htmlFor="healthPlan">Health Plan *</Label>
                    <Select 
                      value={selectedHealthPlan} 
                      onValueChange={(value) => {
                        setSelectedHealthPlan(value);
                        setValue('healthPlan', value as 'Kaiser' | 'Health Net');
                        // Reset county when health plan changes
                        if (value === 'Health Net' && selectedCounty && !['Los Angeles', 'Sacramento'].includes(selectedCounty)) {
                          setSelectedCounty('');
                          setValue('county', '');
                        }
                      }}
                    >
                      <SelectTrigger className={errors.healthPlan ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select health plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kaiser">Kaiser Permanente</SelectItem>
                        <SelectItem value="Health Net">Health Net</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.healthPlan && (
                      <p className="text-red-500 text-sm mt-1">{errors.healthPlan.message}</p>
                    )}
                  </div>

                  {/* County */}
                  <div>
                    <Label htmlFor="county">County *</Label>
                    <Select 
                      value={selectedCounty} 
                      onValueChange={(value) => {
                        setSelectedCounty(value);
                        setValue('county', value);
                      }}
                    >
                      <SelectTrigger className={errors.county ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select county" />
                      </SelectTrigger>
                      <SelectContent>
                        {CALIFORNIA_COUNTIES.map((county) => {
                          const isSupported = isCountySupported(county, selectedHealthPlan);
                          return (
                            <SelectItem 
                              key={county} 
                              value={county}
                              disabled={selectedHealthPlan === 'Health Net' && !isSupported}
                            >
                              {county}
                              {selectedHealthPlan === 'Health Net' && !isSupported && ' (Not Available)'}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {errors.county && (
                      <p className="text-red-500 text-sm mt-1">{errors.county.message}</p>
                    )}
                    {selectedHealthPlan === 'Health Net' && selectedCounty && !isCountySupported(selectedCounty, selectedHealthPlan) && (
                      <Alert className="mt-2 border-orange-200 bg-orange-50">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-orange-800">
                          Health Net services are only available in Los Angeles and Sacramento counties.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* MRN/Medi-Cal Number */}
                  <div className="md:col-span-2">
                    <Label htmlFor="memberMrn">
                      {selectedHealthPlan === 'Kaiser' ? 'MRN (Medical Record Number)' : 'Medi-Cal Number'} *
                    </Label>
                    <Input
                      id="memberMrn"
                      {...register('memberMrn')}
                      placeholder={
                        selectedHealthPlan === 'Kaiser' 
                          ? 'Enter MRN (usually starts with 000...)'
                          : 'Enter Medi-Cal number'
                      }
                      className={errors.memberMrn ? 'border-red-500' : ''}
                    />
                    {errors.memberMrn && (
                      <p className="text-red-500 text-sm mt-1">{errors.memberMrn.message}</p>
                    )}
                    {selectedHealthPlan === 'Kaiser' && (
                      <p className="text-sm text-gray-600 mt-1">
                        For Kaiser members, the MRN is different from the Medi-Cal number and usually begins with 000.
                      </p>
                    )}
                    {selectedHealthPlan === 'Health Net' && (
                      <p className="text-sm text-gray-600 mt-1">
                        For Health Net members, the MRN is the same as the Medi-Cal number.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Requester Information Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Your Contact Information
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Requester Name */}
                  <div>
                    <Label htmlFor="requesterName">Your Full Name *</Label>
                    <Input
                      id="requesterName"
                      {...register('requesterName')}
                      placeholder="Enter your full name"
                      className={errors.requesterName ? 'border-red-500' : ''}
                    />
                    {errors.requesterName && (
                      <p className="text-red-500 text-sm mt-1">{errors.requesterName.message}</p>
                    )}
                  </div>

                  {/* Requester Email */}
                  <div>
                    <Label htmlFor="requesterEmail">Your Email Address *</Label>
                    <Input
                      id="requesterEmail"
                      type="email"
                      {...register('requesterEmail')}
                      placeholder="Enter your email address"
                      className={errors.requesterEmail ? 'border-red-500' : ''}
                    />
                    {errors.requesterEmail && (
                      <p className="text-red-500 text-sm mt-1">{errors.requesterEmail.message}</p>
                    )}
                  </div>
                </div>

                {/* Additional Information */}
                <div className="mt-4">
                  <Label htmlFor="additionalInfo">Additional Information (Optional)</Label>
                  <Textarea
                    id="additionalInfo"
                    {...register('additionalInfo')}
                    placeholder="Any additional information that might help with the eligibility check..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center pt-4">
                <Button 
                  type="submit" 
                  size="lg"
                  disabled={isSubmitting}
                  className="min-w-48"
                >
                  {isSubmitting ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Submit Eligibility Check
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer Information */}
        <Card className="mt-8 border-gray-200 bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-gray-600">
              <p className="mb-2">
                <strong>Response Time:</strong> We will email you the eligibility results within 1 business day.
              </p>
              <p>
                <strong>Privacy:</strong> All member information is handled in accordance with HIPAA regulations and our privacy policy.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}