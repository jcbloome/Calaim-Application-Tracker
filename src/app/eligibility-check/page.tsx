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
import { PublicHeader } from '@/components/PublicHeader';
import { 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Clock, 
  MapPin, 
  Shield,
  Mail,
  User,
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

const KAISER_CONTRACTED_COUNTIES = [
  'Alameda',
  'Amador',
  'Contra Costa',
  'El Dorado',
  'Fresno',
  'Imperial',
  'Kern',
  'Kings',
  'Los Angeles',
  'Madera',
  'Marin',
  'Mariposa',
  'Napa',
  'Orange',
  'Placer',
  'Riverside',
  'Sacramento',
  'San Bernardino',
  'San Diego',
  'San Francisco',
  'San Joaquin',
  'San Mateo',
  'Santa Clara',
  'Santa Cruz',
  'Solano',
  'Sonoma',
  'Stanislaus',
  'Sutter',
  'Tulare',
  'Ventura',
  'Yolo',
  'Yuba',
] as const;

const HEALTH_NET_SUPPORTED_COUNTIES = ['Los Angeles', 'Sacramento'] as const;
const KAISER_CONTRACTED_COUNTIES_TEXT =
  'Alameda, Amador, Contra Costa, El Dorado, Fresno, Imperial, Kern, Kings, Los Angeles, Madera, Marin, Mariposa, Napa, Orange, Placer, Riverside, Sacramento, San Bernardino, San Diego, San Francisco, San Joaquin, San Mateo, Santa Clara, Santa Cruz, Solano, Sonoma, Stanislaus, Sutter, Tulare, Ventura, Yolo, and Yuba';
const KAISER_MEMBER_STATUS_VALUES = ['snf', 'community-at-risk'] as const;
const COMMUNITY_LOCATION_VALUES = [
  'at-home',
  'hospital',
  'recuperative-care',
  'unhoused',
  'assisted-living',
] as const;

// Form validation schema
const MM_DD_YYYY_REGEX = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
const normalizeDobInput = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;

  const separatedMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (separatedMatch) {
    const mm = separatedMatch[1].padStart(2, '0');
    const dd = separatedMatch[2].padStart(2, '0');
    return `${mm}/${dd}/${separatedMatch[3]}`;
  }

  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  if (digits.length <= 2) return mm;
  if (digits.length <= 4) return `${mm}/${dd}`;
  return `${mm}/${dd}/${yyyy}`;
};

const eligibilityCheckSchema = z.object({
  // Member Information
  memberFirstName: z.string().min(2, 'Member first name must be at least 2 characters'),
  memberLastName: z.string().min(2, 'Member last name must be at least 2 characters'),
  memberBirthday: z
    .string()
    .min(1, 'Member birthday is required')
    .transform(normalizeDobInput)
    .refine((value) => MM_DD_YYYY_REGEX.test(value), 'Use DOB format MM/DD/YYYY (example: 01/31/1950)'),
  memberMrn: z.string().min(1, 'Medical Record Number (MRN) is required'),
  healthPlan: z.enum(['Kaiser', 'Health Net'], {
    required_error: 'Please select a health plan'
  }),
  county: z.string().min(1, 'Please select a county'),
  
  // Requester Information
  requesterFirstName: z.string().min(2, 'Your first name is required'),
  requesterLastName: z.string().min(2, 'Your last name is required'),
  requesterEmail: z.string().email('Please enter a valid email address'),
  confirmEmail: z.string().email('Please enter a valid email address'),
  relationshipToMember: z.string().min(1, 'Relationship to member is required'),
  otherRelationshipSpecification: z.string().optional(),
  kaiserMemberStatus: z.enum(KAISER_MEMBER_STATUS_VALUES).optional(),
  communityAtRiskLocation: z.enum(COMMUNITY_LOCATION_VALUES).optional(),
  communityAtRiskAdlDetails: z.string().optional(),
  
  // Optional additional information
  additionalInfo: z.string().optional()
}).refine((data) => {
  // If relationship is "other", then otherRelationshipSpecification is required
  if (data.relationshipToMember === 'other') {
    return data.otherRelationshipSpecification && data.otherRelationshipSpecification.trim().length > 0;
  }
  return true;
}, {
  message: 'Please specify the relationship when selecting "Other"',
  path: ['otherRelationshipSpecification']
}).refine((data) => {
  // Email addresses must match
  return data.requesterEmail === data.confirmEmail;
}, {
  message: 'Email addresses do not match',
  path: ['confirmEmail']
}).refine((data) => {
  if (data.healthPlan !== 'Kaiser') return true;
  return Boolean(data.kaiserMemberStatus);
}, {
  message: 'Please select whether the Kaiser member is currently in SNF or at risk in the community',
  path: ['kaiserMemberStatus']
}).refine((data) => {
  if (data.healthPlan !== 'Kaiser') return true;
  if (data.kaiserMemberStatus !== 'community-at-risk') return true;
  return Boolean(String(data.communityAtRiskLocation || '').trim());
}, {
  message: 'Please select where the member is currently located',
  path: ['communityAtRiskLocation']
}).refine((data) => {
  if (data.healthPlan !== 'Kaiser') return true;
  if (data.kaiserMemberStatus !== 'community-at-risk') return true;
  return String(data.communityAtRiskAdlDetails || '').trim().length >= 10;
}, {
  message: 'Please provide details about ADL care needs to support CalAIM eligibility review',
  path: ['communityAtRiskAdlDetails']
});

type EligibilityCheckForm = z.infer<typeof eligibilityCheckSchema>;

export default function EligibilityCheckPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedHealthPlan, setSelectedHealthPlan] = useState<string>('');
  const [selectedCounty, setSelectedCounty] = useState<string>('');
  const [submitted, setSubmitted] = useState<{ checkId: string; email: string } | null>(null);

  const form = useForm<EligibilityCheckForm>({
    resolver: zodResolver(eligibilityCheckSchema),
    defaultValues: {
      memberFirstName: '',
      memberLastName: '',
      memberBirthday: '',
      memberMrn: '',
      requesterFirstName: '',
      requesterLastName: '',
      requesterEmail: '',
      confirmEmail: '',
      relationshipToMember: '',
      otherRelationshipSpecification: '',
      kaiserMemberStatus: undefined,
      communityAtRiskLocation: undefined,
      communityAtRiskAdlDetails: '',
      additionalInfo: ''
    }
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch } = form;

  // Check if county is supported for selected health plan
  const isCountySupported = (county: string, healthPlan: string): boolean => {
    if (healthPlan === 'Kaiser') {
      return KAISER_CONTRACTED_COUNTIES.includes(county as typeof KAISER_CONTRACTED_COUNTIES[number]);
    }
    if (healthPlan === 'Health Net') {
      return HEALTH_NET_SUPPORTED_COUNTIES.includes(county as typeof HEALTH_NET_SUPPORTED_COUNTIES[number]);
    }
    return false;
  };

  const onSubmit = async (data: EligibilityCheckForm) => {
    setIsSubmitting(true);
    setSubmitted(null);
    
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

        setSubmitted({ checkId: String(result.checkId || '').trim(), email: String(data.requesterEmail || '').trim() });
        
        // Reset form
        form.reset();
        setSelectedHealthPlan('');
        setSelectedCounty('');
      } else {
        throw new Error(result.message || 'Submission failed');
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again or contact support.';
      console.error('Eligibility check submission error:', error);
      toast({
        title: "Submission Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            <span className="block">CalAIM Eligibility Check</span>
            <span className="block">for Health Net and Kaiser Members</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We&apos;re happy to help verify if a member is eligible for CalAIM Community Supports services.
            Simply provide the member&apos;s information below and we&apos;ll check their eligibility status.
          </p>
          <p className="text-sm text-gray-600 max-w-3xl mx-auto mt-3">
            Please note: while Connections is active for CalAIM with Health Net and Kaiser in various counties,
            other managed care plans and community support providers may cover the same counties and additional
            counties as well.
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
              <div className="space-y-3 text-sm">
                <ul className="space-y-2">
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
                
                <div className="pt-3 border-t border-blue-200">
                  <p className="font-medium text-blue-800 mb-2">What We Check:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Current Medi-Cal enrollment status</li>
                    <li>• CalAIM Community Supports eligibility</li>
                    <li>• Health plan participation requirements</li>
                    <li>• Geographic service area coverage</li>
                  </ul>
                </div>
                
                <div className="p-2 bg-blue-100 rounded border border-blue-300">
                  <p className="text-xs font-medium text-blue-900">
                    💡 Tip: Have your Medi-Cal card and MRN ready before submitting
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Service Areas Card */}
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <MapPin className="h-5 w-5" />
                Service Areas & Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="text-green-700">
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-green-100 rounded border border-green-300">
                  <div className="font-medium flex items-center gap-2 text-green-900 mb-1">
                    <Building className="h-4 w-4" />
                    Kaiser Permanente
                  </div>
                  <p className="ml-6 mb-2">Connections is active in contracted Kaiser counties:</p>
                  <p className="ml-6 text-xs text-green-800 mb-2">
                    {KAISER_CONTRACTED_COUNTIES_TEXT}
                  </p>
                  <p className="ml-6 text-xs text-green-800">
                    Coverage is limited to Kaiser contracted counties listed above
                  </p>
                </div>
                
                <div className="p-3 bg-green-100 rounded border border-green-300">
                  <div className="font-medium flex items-center gap-2 text-green-900 mb-1">
                    <Building className="h-4 w-4" />
                    Health Net
                  </div>
                  <p className="ml-6 mb-2">Connections is active only in Los Angeles and Sacramento counties</p>
                  <p className="ml-6 text-xs text-green-800">
                    Limited geographic coverage - verify county before applying
                  </p>
                </div>
                
                <div className="pt-2 border-t border-green-200">
                  <p className="font-medium text-green-800 mb-1">Coverage Note:</p>
                  <p className="text-xs">
                    You must be enrolled with one of these health plans to access CalAIM Community Supports through Connections Care Home Consultants.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Combined Share of Cost Information Card */}
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-800">
                <DollarSign className="h-5 w-5" />
                Share of Cost (SOC) Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-orange-700">
              <div className="space-y-3 text-sm">
                {/* SOC Threshold */}
                <div className="p-3 bg-orange-100 rounded-md border border-orange-300">
                  <p className="font-semibold text-orange-900 mb-1">SOC Threshold:</p>
                  <p>Share of Cost is usually triggered if a member receives more than <strong>$1,856/month</strong>, although this can vary by county and circumstances.</p>
                </div>
                
                {/* SNF Considerations */}
                <div className="p-3 bg-orange-100 rounded-md border border-orange-300">
                  <p className="font-semibold text-orange-900 mb-1 flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    SNF Residents:
                  </p>
                  <p>SNF residents with any income might not show any SOC since the SNF receives most of the member&apos;s income.</p>
                </div>
                
                {/* BenefitsCal Link */}
                <div className="pt-2 border-t border-orange-200">
                  <p className="mb-2 text-orange-800">
                    For detailed SOC verification and current thresholds:
                  </p>
                  <a 
                    href="https://benefitscal.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-800 underline font-medium"
                  >
                    <ExternalLink className="h-3 w-3" />
                    BenefitsCal.com
                  </a>
                </div>
              </div>
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
              Please provide the member&apos;s information and your contact details below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <Alert className="mb-6 border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-700" />
                <AlertDescription className="text-green-900">
                  <div className="font-semibold">Submitted successfully</div>
                  <div className="text-sm">
                    We sent a confirmation email to <span className="font-medium">{submitted.email}</span>. Reference ID:{' '}
                    <span className="font-mono">{submitted.checkId}</span>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Member Information Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Member Information
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Member First Name */}
                  <div>
                    <Label htmlFor="memberFirstName">Member First Name *</Label>
                    <Input
                      id="memberFirstName"
                      {...register('memberFirstName')}
                      placeholder="Enter member's first name"
                      className={errors.memberFirstName ? 'border-red-500' : ''}
                    />
                    {errors.memberFirstName && (
                      <p className="text-red-500 text-sm mt-1">{errors.memberFirstName.message}</p>
                    )}
                  </div>

                  {/* Member Last Name */}
                  <div>
                    <Label htmlFor="memberLastName">Member Last Name *</Label>
                    <Input
                      id="memberLastName"
                      {...register('memberLastName')}
                      placeholder="Enter member's last name"
                      className={errors.memberLastName ? 'border-red-500' : ''}
                    />
                    {errors.memberLastName && (
                      <p className="text-red-500 text-sm mt-1">{errors.memberLastName.message}</p>
                    )}
                  </div>

                  {/* Member Birthday */}
                  <div>
                    <Label htmlFor="memberBirthday">Date of Birth *</Label>
                    <Input
                      id="memberBirthday"
                      type="text"
                      inputMode="numeric"
                      placeholder="00/00/0000"
                      maxLength={10}
                      {...register('memberBirthday')}
                      onInput={(event) => {
                        const input = event.currentTarget;
                        const normalized = normalizeDobInput(input.value);
                        if (input.value !== normalized) input.value = normalized;
                      }}
                      className={errors.memberBirthday ? 'border-red-500' : ''}
                    />
                    <p className="text-sm text-gray-600 mt-1">Format: MM/DD/YYYY</p>
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
                        if (value !== 'Kaiser') {
                          setValue('kaiserMemberStatus', undefined);
                          setValue('communityAtRiskLocation', undefined);
                          setValue('communityAtRiskAdlDetails', '');
                        }
                        // Reset county when health plan changes to an unsupported option.
                        if (selectedCounty && !isCountySupported(selectedCounty, value)) {
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
                              disabled={Boolean(selectedHealthPlan) && !isSupported}
                            >
                              {county}
                              {Boolean(selectedHealthPlan) && !isSupported && ' (Not Available)'}
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
                    {selectedHealthPlan === 'Kaiser' && selectedCounty && !isCountySupported(selectedCounty, selectedHealthPlan) && (
                      <Alert className="mt-2 border-orange-200 bg-orange-50">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-orange-800">
                          Kaiser services are only available in contracted counties: {KAISER_CONTRACTED_COUNTIES_TEXT}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* Medical Record Number (MRN) */}
                  <div className="md:col-span-2">
                    <Label htmlFor="memberMrn">
                      Medical Record Number (MRN) *
                    </Label>
                    <Input
                      id="memberMrn"
                      {...register('memberMrn')}
                      placeholder={
                        selectedHealthPlan === 'Kaiser' 
                          ? 'Enter MRN (usually starts with 0000...)'
                          : selectedHealthPlan === 'Health Net'
                          ? 'Enter MRN (same as Medi-Cal number)'
                          : 'Enter Medical Record Number (MRN)'
                      }
                      className={errors.memberMrn ? 'border-red-500' : ''}
                    />
                    {errors.memberMrn && (
                      <p className="text-red-500 text-sm mt-1">{errors.memberMrn.message}</p>
                    )}
                    
                    {/* Health Plan Specific Tips */}
                    {selectedHealthPlan === 'Kaiser' && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-800">
                          <strong>Kaiser MRN:</strong> For Kaiser members, the MRN is a different number than the Medi-Cal number and usually begins with a few zeros (0000...).
                        </p>
                      </div>
                    )}
                    
                    {selectedHealthPlan === 'Health Net' && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">
                          <strong>Health Net MRN:</strong> For Health Net members, the MRN is the same as the Medi-Cal number.
                        </p>
                      </div>
                    )}
                    
                    {!selectedHealthPlan && (
                      <p className="text-sm text-gray-600 mt-1">
                        Please select a health plan above to see specific MRN guidance.
                      </p>
                    )}
                  </div>

                  {/* Kaiser-specific CalAIM context */}
                  {selectedHealthPlan === 'Kaiser' ? (
                    <div className="md:col-span-2 space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4">
                      <div>
                        <Label htmlFor="kaiserMemberStatus">
                          Kaiser member is currently *
                        </Label>
                        <Select
                          value={watch('kaiserMemberStatus') || ''}
                          onValueChange={(value) => {
                            setValue('kaiserMemberStatus', value as 'snf' | 'community-at-risk', {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            if (value !== 'community-at-risk') {
                              setValue('communityAtRiskLocation', undefined, { shouldDirty: true, shouldValidate: true });
                              setValue('communityAtRiskAdlDetails', '', { shouldDirty: true, shouldValidate: true });
                            }
                          }}
                        >
                          <SelectTrigger className={errors.kaiserMemberStatus ? 'border-red-500' : ''}>
                            <SelectValue placeholder="Select one option" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="snf">Currently in Skilled Nursing Facility (SNF)</SelectItem>
                            <SelectItem value="community-at-risk">In the community and at risk of premature institutionalization</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors.kaiserMemberStatus && (
                          <p className="text-red-500 text-sm mt-1">{errors.kaiserMemberStatus.message}</p>
                        )}
                      </div>

                      {watch('kaiserMemberStatus') === 'community-at-risk' ? (
                        <>
                          <div>
                            <Label htmlFor="communityAtRiskLocation">Where is the member currently? *</Label>
                            <Select
                              value={watch('communityAtRiskLocation') || ''}
                              onValueChange={(value) =>
                                setValue(
                                  'communityAtRiskLocation',
                                  value as 'at-home' | 'hospital' | 'recuperative-care' | 'unhoused' | 'assisted-living',
                                  { shouldDirty: true, shouldValidate: true }
                                )
                              }
                            >
                              <SelectTrigger className={errors.communityAtRiskLocation ? 'border-red-500' : ''}>
                                <SelectValue placeholder="Select current location" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="at-home">At Home</SelectItem>
                                <SelectItem value="hospital">Hospital</SelectItem>
                                <SelectItem value="recuperative-care">Recuperative Care</SelectItem>
                                <SelectItem value="unhoused">Unhoused</SelectItem>
                                <SelectItem value="assisted-living">At Assisted Living</SelectItem>
                              </SelectContent>
                            </Select>
                            {errors.communityAtRiskLocation && (
                              <p className="text-red-500 text-sm mt-1">{errors.communityAtRiskLocation.message}</p>
                            )}
                          </div>

                          <div>
                            <Label htmlFor="communityAtRiskAdlDetails">
                              Activities of daily living (ADL) care needs details *
                            </Label>
                            <Textarea
                              id="communityAtRiskAdlDetails"
                              {...register('communityAtRiskAdlDetails')}
                              placeholder="Describe ADL support needs (for example: bathing, toileting, dressing, mobility transfers, medication support, supervision needs)."
                              rows={4}
                              className={errors.communityAtRiskAdlDetails ? 'border-red-500' : ''}
                            />
                            {errors.communityAtRiskAdlDetails && (
                              <p className="text-red-500 text-sm mt-1">{errors.communityAtRiskAdlDetails.message}</p>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
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
                  {/* Requester First Name */}
                  <div>
                    <Label htmlFor="requesterFirstName">Your First Name *</Label>
                    <Input
                      id="requesterFirstName"
                      {...register('requesterFirstName')}
                      placeholder="Enter your first name"
                      className={errors.requesterFirstName ? 'border-red-500' : ''}
                    />
                    {errors.requesterFirstName && (
                      <p className="text-red-500 text-sm mt-1">{errors.requesterFirstName.message}</p>
                    )}
                  </div>

                  {/* Requester Last Name */}
                  <div>
                    <Label htmlFor="requesterLastName">Your Last Name *</Label>
                    <Input
                      id="requesterLastName"
                      {...register('requesterLastName')}
                      placeholder="Enter your last name"
                      className={errors.requesterLastName ? 'border-red-500' : ''}
                    />
                    {errors.requesterLastName && (
                      <p className="text-red-500 text-sm mt-1">{errors.requesterLastName.message}</p>
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

                  {/* Confirm Email */}
                  <div>
                    <Label htmlFor="confirmEmail">Confirm Email Address *</Label>
                    <Input
                      id="confirmEmail"
                      type="email"
                      {...register('confirmEmail')}
                      placeholder="Re-enter your email address"
                      className={errors.confirmEmail ? 'border-red-500' : ''}
                    />
                    {errors.confirmEmail && (
                      <p className="text-red-500 text-sm mt-1">{errors.confirmEmail.message}</p>
                    )}
                    <p className="text-sm text-gray-600 mt-1">
                      Please confirm your email to ensure you receive the eligibility results.
                    </p>
                  </div>

                  {/* Relationship to Member */}
                  <div className="md:col-span-2">
                    <Label htmlFor="relationshipToMember">Your Relationship to Member *</Label>
                    <Select 
                      value={watch('relationshipToMember') || ''} 
                      onValueChange={(value) => setValue('relationshipToMember', value)}
                    >
                      <SelectTrigger className={errors.relationshipToMember ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select your relationship to the member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Self (I am the member)</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="spouse">Spouse/Partner</SelectItem>
                        <SelectItem value="child">Adult Child</SelectItem>
                        <SelectItem value="sibling">Sibling</SelectItem>
                        <SelectItem value="guardian">Legal Guardian</SelectItem>
                        <SelectItem value="power-of-attorney">Power of Attorney</SelectItem>
                        <SelectItem value="authorized-representative">Authorized Representative</SelectItem>
                        <SelectItem value="case-manager">Case Manager</SelectItem>
                        <SelectItem value="social-worker">Social Worker</SelectItem>
                        <SelectItem value="referral-agency">Referral Agency</SelectItem>
                        <SelectItem value="other-family">Other Family Member</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.relationshipToMember && (
                      <p className="text-red-500 text-sm mt-1">{errors.relationshipToMember.message}</p>
                    )}
                    
                    {/* Conditional "Other" specification field */}
                    {watch('relationshipToMember') === 'other' && (
                      <div className="mt-3">
                        <Label htmlFor="otherRelationshipSpecification">Please specify your relationship *</Label>
                        <Input
                          id="otherRelationshipSpecification"
                          {...register('otherRelationshipSpecification')}
                          placeholder="Please describe your relationship to the member"
                          className={errors.otherRelationshipSpecification ? 'border-red-500' : ''}
                        />
                        {errors.otherRelationshipSpecification && (
                          <p className="text-red-500 text-sm mt-1">{errors.otherRelationshipSpecification.message}</p>
                        )}
                      </div>
                    )}
                    
                    <p className="text-sm text-gray-600 mt-1">
                      Please specify your relationship to the member for whom you&apos;re requesting the eligibility check.
                    </p>
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