
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useEffect, useMemo, useState } from 'react';
import { type FormValues } from '../schema';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PhoneInput } from '@/components/ui/phone-input';
import { FormSection } from '@/components/FormSection';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const MEMBER_LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'Chinese',
  'Tagalog',
  'Vietnamese',
  'Korean',
  'Armenian',
  'Russian',
  'Arabic',
  'Farsi',
] as const;
const MEMBER_LANGUAGE_OTHER_VALUE = '__other__';
const STAFF_DRAFT_AGENCY_NAME = 'Connections Care Home Consultants';

export default function Step1({
  isAdminView,
  onCheckMrnUnique,
  forceSeparatePrimaryContactFromSubmitter,
  applicationIdForDraftUploads,
  appUserIdForDraftUploads,
}: {
  isAdminView?: boolean;
  onCheckMrnUnique?: (mrn: string) => void;
  forceSeparatePrimaryContactFromSubmitter?: boolean;
  applicationIdForDraftUploads?: string;
  appUserIdForDraftUploads?: string;
}) {
  const { control, watch, setValue, getValues, clearErrors, trigger } = useFormContext<FormValues>();
  
  const memberDob = watch('memberDob');
  const memberLanguage = watch('memberLanguage');
  const hasLegalRep = watch('hasLegalRep');
  const isPrimaryContactSameAsReferrer = watch('isPrimaryContactSameAsReferrer');
  const bestContactEmail = watch('bestContactEmail');
  const secondaryContactEmail = watch('secondaryContactEmail');
  const repEmail = watch('repEmail');
  const referrerEmail = watch('referrerEmail');
  const agency = watch('agency');
  const submitterAlsoReceivesDocRequests = watch('submitterAlsoReceivesDocRequests');
  const [isMemberLanguageOther, setIsMemberLanguageOther] = useState(false);

  useEffect(() => {
    if (memberDob && /^\d{2}\/\d{2}\/\d{4}$/.test(memberDob)) {
      const [month, day, year] = memberDob.split('/').map(Number);
      const birthDate = new Date(year, month - 1, day);

      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        setValue('memberAge', age);
      }
    }
  }, [memberDob, setValue]);
  
  useEffect(() => {
    const isSameAsPrimary = hasLegalRep === 'same_as_primary';
    
    if (isSameAsPrimary) {
        setValue('repFirstName', getValues('bestContactFirstName'));
        setValue('repLastName', getValues('bestContactLastName'));
        setValue('repRelationship', getValues('bestContactRelationship'));
        setValue('repPhone', getValues('bestContactPhone'));
        setValue('repEmail', getValues('bestContactEmail'));
        clearErrors(['repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail']);
    } else {
        const currentRepValues = {
            repFirstName: getValues('repFirstName'),
            repLastName: getValues('repLastName'),
            repRelationship: getValues('repRelationship'),
            repPhone: getValues('repPhone'),
            repEmail: getValues('repEmail'),
        };
        const bestContactValues = {
            repFirstName: getValues('bestContactFirstName'),
            repLastName: getValues('bestContactLastName'),
            repRelationship: getValues('bestContactRelationship'),
            repPhone: getValues('bestContactPhone'),
            repEmail: getValues('bestContactEmail'),
        };

        // Only clear if the values were previously auto-filled
        if (JSON.stringify(currentRepValues) === JSON.stringify(bestContactValues)) {
            setValue('repFirstName', '');
            setValue('repLastName', '');
            setValue('repRelationship', '');
            setValue('repPhone', '');
            setValue('repEmail', '');
        }
        
        if (hasLegalRep === 'different') {
          // You might want to trigger validation here if needed, but the main validation happens on submit
        } else {
          // Clear errors for other states
          clearErrors(['repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail']);
        }
    }

  }, [hasLegalRep, setValue, getValues, clearErrors]);

  // When marked as same-as-submitting-user, clear validation errors for primary contact.
  // We intentionally do not auto-populate values; the checkbox itself is the source of truth.
  useEffect(() => {
    if (isPrimaryContactSameAsReferrer) {
      clearErrors([
        'bestContactFirstName',
        'bestContactLastName',
        'bestContactRelationship',
        'bestContactPhone',
        'bestContactEmail',
        'bestContactLanguage',
      ]);
    }
  }, [isPrimaryContactSameAsReferrer, clearErrors]);

  useEffect(() => {
    if (!forceSeparatePrimaryContactFromSubmitter) return;
    if (isPrimaryContactSameAsReferrer) {
      setValue('isPrimaryContactSameAsReferrer', false);
    }
  }, [forceSeparatePrimaryContactFromSubmitter, isPrimaryContactSameAsReferrer, setValue]);

  useEffect(() => {
    if (!forceSeparatePrimaryContactFromSubmitter) return;
    const currentAgency = String(getValues('agency') || '').trim();
    if (currentAgency !== STAFF_DRAFT_AGENCY_NAME) {
      setValue('agency', STAFF_DRAFT_AGENCY_NAME);
    }
  }, [forceSeparatePrimaryContactFromSubmitter, getValues, setValue]);

  useEffect(() => {
    const normalized = String(memberLanguage || '').trim().toLowerCase();
    if (!normalized) return;
    const isPopular = MEMBER_LANGUAGE_OPTIONS.some((option) => option.toLowerCase() === normalized);
    setIsMemberLanguageOther(!isPopular);
  }, [memberLanguage]);

  const selectedMemberLanguage = useMemo(() => {
    const normalized = String(memberLanguage || '').trim().toLowerCase();
    if (!normalized) {
      return isMemberLanguageOther ? MEMBER_LANGUAGE_OTHER_VALUE : '';
    }
    const matched = MEMBER_LANGUAGE_OPTIONS.find((option) => option.toLowerCase() === normalized);
    if (matched) return matched;
    return MEMBER_LANGUAGE_OTHER_VALUE;
  }, [isMemberLanguageOther, memberLanguage]);

  const reminderRecipientPreview = useMemo(() => {
    const primary = String(bestContactEmail || '').trim();
    const secondary = String(secondaryContactEmail || '').trim();
    const legalRep = String(repEmail || '').trim();
    const submitter = String(referrerEmail || '').trim();

    if (primary) {
      return { email: primary, source: 'Primary Contact' };
    }
    if (secondary) {
      return { email: secondary, source: 'Secondary Contact' };
    }
    if (legalRep) {
      return { email: legalRep, source: 'Legal Representative' };
    }
    if (!forceSeparatePrimaryContactFromSubmitter && submitter) {
      return { email: submitter, source: 'Submitting User (fallback)' };
    }
    return { email: '', source: '' };
  }, [bestContactEmail, secondaryContactEmail, repEmail, referrerEmail, forceSeparatePrimaryContactFromSubmitter]);
  const submitterDocRequestPreview = useMemo(() => {
    const submitter = String(referrerEmail || '').trim();
    if (!submitterAlsoReceivesDocRequests) return '';
    if (!submitter) return 'Submitting user additional recipient is enabled, but submitter email is missing.';
    return `Submitting user will also receive missing-document requests: ${submitter}`;
  }, [submitterAlsoReceivesDocRequests, referrerEmail]);
  
  const formatName = (value: string) => {
    if (!value) return '';
    return value
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };


  return (
    <div className="space-y-6">
      {forceSeparatePrimaryContactFromSubmitter ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-900 hover:bg-blue-100">
                Draft Staff Pathway Active
              </Badge>
              <span>
                Submitting user is staff in this draft flow. Keep Primary Contact as the outreach recipient for document and status updates.
              </span>
            </div>
            {applicationIdForDraftUploads ? (
              <Button asChild variant="outline" size="sm" className="border-blue-300 bg-white text-blue-900 hover:bg-blue-100">
                <Link
                  href={`/admin/applications/${encodeURIComponent(applicationIdForDraftUploads)}${
                    appUserIdForDraftUploads ? `?userId=${encodeURIComponent(appUserIdForDraftUploads)}` : ''
                  }`}
                >
                  Upload Eligibility Documents
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-blue-800">
            Use this button to add Eligibility Screenshot files while the application is still in draft.
          </div>
        </div>
      ) : null}

      {/* What is CalAIM Information Card */}
      <Card className="border-l-4 border-blue-500 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-900">What is CalAIM?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800 leading-relaxed">
            California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to 
            transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and 
            creating a more seamless and consistent system. It aims to achieve this through a focus on 
            "whole person care," which includes addressing social determinants of health, integrating physical, 
            mental, and social services, and launching new programs like Enhanced Care Management (ECM) and 
            Community Supports. CS and ECM are administered through managed care plans (MCPs).
            <br /><br />
            For CalAIM assisted living placements, there are usually two payment parts: the managed care plan
            pays the assisted living services portion, and the member pays a room-and-board portion (typically
            from Social Security income). As part of this application, the member (or authorized representative)
            should be prepared to provide monthly income verification, usually either three months of bank
            statements showing Social Security deposits or the annual Social Security award letter.
            <br /><br />
            This is also important because CalAIM enrollment generally does not allow participation for members
            with a Medi-Cal Share of Cost. For more details, please review the appropriate section in Program
            Information.
          </p>
        </CardContent>
      </Card>
      <div className="mt-2">
        <GlossaryDialog className="p-0 h-auto" />
      </div>

      <FormSection 
        title="Section 1: Member Information" 
        required={true}
        description="Basic information about the CalAIM member"
      >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="memberFirstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="memberLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <FormField
              control={control}
              name="memberDob"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} placeholder="MM/DD/YYYY" />
                  </FormControl>
                  <FormDescription>Use MM/DD/YYYY format (example: 01/31/1940).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-4">
               <FormField
                control={control}
                name="memberAge"
                render={({ field }) => (
                  <FormItem className="w-1/2">
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} type="number" readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                  control={control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Sex <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex pt-2 space-x-4">
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl><RadioGroupItem value="Male" /></FormControl>
                            <FormLabel className="font-normal">Male</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl><RadioGroupItem value="Female" /></FormControl>
                            <FormLabel className="font-normal">Female</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="memberPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member Phone</FormLabel>
                  <FormControl>
                    <PhoneInput {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Optional</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="memberEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member Email</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="email" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Optional. If no email, leave blank or enter "N/A".</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={control}
                    name="memberMediCalNum"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Medi-Cal Number <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      value={field.value ?? ''}
                      maxLength={9}
                      onChange={(event) => {
                        field.onChange(event.target.value.toUpperCase());
                      }}
                      onBlur={() => {
                        trigger('memberMediCalNum');
                        trigger('confirmMemberMediCalNum');
                      }}
                    />
                        </FormControl>
                        <FormDescription>This is a 9 character number starting with a '9' and ending with a letter.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="confirmMemberMediCalNum"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Confirm Medi-Cal Number <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      value={field.value ?? ''}
                      maxLength={9}
                      onChange={(event) => {
                        field.onChange(event.target.value.toUpperCase());
                      }}
                      onBlur={() => {
                        trigger('confirmMemberMediCalNum');
                        trigger('memberMediCalNum');
                      }}
                    />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="memberMrn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medical Record Number (MRN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      onChange={(event) => {
                        clearErrors('memberMrn');
                        field.onChange(event.target.value);
                      }}
                      onBlur={() => {
                        trigger('memberMrn');
                        trigger('confirmMemberMrn');
                        onCheckMrnUnique?.(field.value ?? '');
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Health Net uses the Medi-Cal number; Kaiser uses a different MRN (often starts with 0000).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={control}
              name="confirmMemberMrn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Medical Record Number (MRN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                      }}
                      onBlur={() => {
                        trigger('confirmMemberMrn');
                        trigger('memberMrn');
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={control}
                name="memberLanguage"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Preferred Language <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Select
                          value={selectedMemberLanguage || undefined}
                          onValueChange={(value) => {
                            if (value === MEMBER_LANGUAGE_OTHER_VALUE) {
                              setIsMemberLanguageOther(true);
                              field.onChange('');
                              return;
                            }
                            setIsMemberLanguageOther(false);
                            field.onChange(value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select preferred language" />
                          </SelectTrigger>
                          <SelectContent>
                            {MEMBER_LANGUAGE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                            <SelectItem value={MEMBER_LANGUAGE_OTHER_VALUE}>Other</SelectItem>
                          </SelectContent>
                        </Select>
                        {isMemberLanguageOther ? (
                          <Input
                            value={field.value ?? ''}
                            onChange={(event) => field.onChange(formatName(event.target.value))}
                            placeholder="Enter preferred language"
                          />
                        ) : null}
                      </div>
                    </FormControl>
                    <FormDescription>Select a language, or choose Other to type it in.</FormDescription>
                    <FormMessage />
                </FormItem>
                )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="Authorization_Number_T038"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Authorization Number_T038</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Kaiser intake authorization number (if available).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="Diagnostic_Code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diagnostic Code</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Initial diagnosis code, if known.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="Authorization_Start_T2038"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Authorization_Start_T2038</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} placeholder="MM/DD/YYYY" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="Authorization_End_T2038"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Authorization_End_T2038</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} placeholder="MM/DD/YYYY" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
      </FormSection>
      
      <FormSection 
        title="Section 5: Legal Representative" 
        description="A legal representative (e.g., with Power of Attorney) might be distinct from a contact person. If the legal representative is also the primary or secondary contact, please enter their information again here to confirm their legal role."
      >
            <FormField
                control={control}
                name="hasLegalRep"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Does member have a legal representative? <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex flex-col space-y-2">
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="notApplicable" /></FormControl><FormLabel className="font-normal">No, member has capacity and does not need legal representative</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="same_as_primary" /></FormControl><FormLabel className="font-normal">Yes, same as primary contact</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="different" /></FormControl><FormLabel className="font-normal">Yes, not same as primary contact (fill out below fields)</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="no_has_rep" /></FormControl><FormLabel className="font-normal">Member does not have capacity and does not have legal representative</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
            
            <div className="p-4 border rounded-md space-y-4">
                <h3 className="font-medium">Representative's Contact Info</h3>
                <p className="text-sm text-muted-foreground">If the member does not have a legal representative, you can leave these fields blank.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repFirstName" render={({ field }) => (
                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="repLastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField control={control} name="repRelationship" render={({ field }) => (
                    <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repPhone" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><PhoneInput {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name="repEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="text" inputMode="email" {...field} value={field.value ?? ''} /></FormControl>
                           <FormDescription>If no email, enter "N/A".</FormDescription>
                          <FormMessage />
                        </FormItem>
                    )} />
                </div>
            </div>
      </FormSection>
      
      <FormSection 
        title="Section 2: User Submitting This Application" 
        required={!forceSeparatePrimaryContactFromSubmitter}
        description="This identifies who is completing/submitting this application. Status and missing-document updates are sent to the Primary Contact in Section 3."
      >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="referrerFirstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Submitting User First Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      readOnly={!isAdminView || Boolean(forceSeparatePrimaryContactFromSubmitter)}
                      className={!isAdminView || forceSeparatePrimaryContactFromSubmitter ? "bg-muted" : ""}
                      onChange={e => field.onChange(formatName(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="referrerLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Submitting User Last Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      readOnly={!isAdminView || Boolean(forceSeparatePrimaryContactFromSubmitter)}
                      className={!isAdminView || forceSeparatePrimaryContactFromSubmitter ? "bg-muted" : ""}
                      onChange={e => field.onChange(formatName(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="referrerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Submitting User Email</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="email"
                      {...field}
                      value={field.value ?? ''}
                      readOnly={!isAdminView || Boolean(forceSeparatePrimaryContactFromSubmitter)}
                      className={!isAdminView || forceSeparatePrimaryContactFromSubmitter ? "bg-muted" : ""}
                    />
                  </FormControl>
                  <FormDescription>For submitter identity only. Primary contact receives status/document updates.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!forceSeparatePrimaryContactFromSubmitter ? (
              <FormField
                control={control}
                name="referrerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Submitting User Phone
                      {!forceSeparatePrimaryContactFromSubmitter && <span className="text-destructive"> *</span>}
                    </FormLabel>
                    <FormControl>
                      <PhoneInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>
          {!forceSeparatePrimaryContactFromSubmitter ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <FormField
                control={control}
                name="referrerRelationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Submitting User Relationship to Member
                      {!forceSeparatePrimaryContactFromSubmitter && <span className="text-destructive"> *</span>}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
                    </FormControl>
                     <FormDescription>e.g., Son, POA, Self, etc.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="agency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
                    </FormControl>
                     <FormDescription>e.g., Bob's Referral Agency, Hospital Name, etc. If not applicable, leave blank.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : null}
          {!forceSeparatePrimaryContactFromSubmitter ? (
            <FormField
              control={control}
              name="submitterAlsoReceivesDocRequests"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Also send missing-document requests to submitting user</FormLabel>
                    <FormDescription>
                      When enabled, both Primary Contact and Submitting User receive document-request reminders so either can upload required files.
                    </FormDescription>
                    <FormDescription>
                      HIPAA note: submitting users can submit documents but should not be treated as having full visibility into previously uploaded documents unless authorized.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          ) : null}
          {forceSeparatePrimaryContactFromSubmitter ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <FormField
                control={control}
                name="agency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? agency ?? STAFF_DRAFT_AGENCY_NAME} readOnly className="bg-muted" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          ) : null}
      </FormSection>
      
      <FormSection 
        title="Section 3: Primary Contact Person" 
        required={true}
        description="This contact receives application progress updates and missing-document notices. If the member is primary contact, re-enter member name and use N/A for relationship."
      >
          <div className="p-4 border rounded-md space-y-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {reminderRecipientPreview.email ? (
                  <span>
                    Reminder recipient preview: <strong>{reminderRecipientPreview.email}</strong> ({reminderRecipientPreview.source})
                  </span>
                ) : (
                  <span>Reminder recipient preview: No recipient email available yet. Enter Primary Contact email to enable reminders.</span>
                )}
                {!forceSeparatePrimaryContactFromSubmitter && submitterDocRequestPreview ? (
                  <div className="mt-1">{submitterDocRequestPreview}</div>
                ) : null}
              </div>
              {!forceSeparatePrimaryContactFromSubmitter ? (
                <FormField
                  control={control}
                  name="isPrimaryContactSameAsReferrer"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm font-medium">
                          Primary contact is the same as the submitting user
                        </FormLabel>
                        <FormDescription className="text-xs text-muted-foreground">
                          Check this to copy submitting-user details into Primary Contact (recipient of status/document updates)
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Draft intake mode: submitting user is staff. Primary contact is required and receives status/document updates.
                </p>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactFirstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name {!isPrimaryContactSameAsReferrer && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isPrimaryContactSameAsReferrer} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={control} name="bestContactLastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name {!isPrimaryContactSameAsReferrer && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isPrimaryContactSameAsReferrer} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="bestContactRelationship" render={({ field }) => (
                    <FormItem><FormLabel>Relationship {!isPrimaryContactSameAsReferrer && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isPrimaryContactSameAsReferrer} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={control} name="bestContactLanguage" render={({ field }) => (
                    <FormItem><FormLabel>Language {!isPrimaryContactSameAsReferrer && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={isPrimaryContactSameAsReferrer} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactPhone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone {!isPrimaryContactSameAsReferrer && <span className="text-destructive">*</span>}</FormLabel>
                        <FormControl><PhoneInput {...field} disabled={isPrimaryContactSameAsReferrer} /></FormControl>
                        <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={control} name="bestContactEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email {!isPrimaryContactSameAsReferrer && <span className="text-destructive">*</span>}</FormLabel>
                        <FormControl><Input type="text" inputMode="email" {...field} value={field.value ?? ''} disabled={isPrimaryContactSameAsReferrer} /></FormControl>
                        <FormDescription>If no email, enter "N/A".</FormDescription>
                        <FormMessage />
                      </FormItem>
                  )} />
              </div>
          </div>
      </FormSection>

      <FormSection 
        title="Section 4: Secondary Contact Person (Optional)" 
        badge="Optional"
        badgeVariant="secondary"
        description="Provide details for a secondary point of contact if available."
      >
             <div className="p-4 border rounded-md space-y-4 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="secondaryContactFirstName" render={({ field }) => (
                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactLastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="secondaryContactRelationship" render={({ field }) => (
                        <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactLanguage" render={({ field }) => (
                        <FormItem><FormLabel>Language</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="secondaryContactPhone" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><PhoneInput {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactEmail" render={({ field }) => (
                       <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="text" inputMode="email" {...field} value={field.value ?? ''} /></FormControl>
                           <FormDescription>If no email, enter "N/A".</FormDescription>
                          <FormMessage />
                        </FormItem>
                    )} />
                </div>
            </div>
      </FormSection>
      
    </div>
  );
}

    
    
    