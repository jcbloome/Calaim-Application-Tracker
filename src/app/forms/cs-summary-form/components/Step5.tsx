'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type FormValues } from '../schema';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { US_STATE_OPTIONS, normalizeUsStateCode } from '@/lib/us-states';
import { Checkbox } from '@/components/ui/checkbox';

const locationOptions = ['Home', 'Hospital', 'Skilled Nursing', 'Unhoused', 'Sub-Acute', 'Assisted Living', 'Other', 'Unknown'];

export default function Step5({
  relaxIspRequiredForDraft = false,
}: {
  relaxIspRequiredForDraft?: boolean;
}) {
  const { control, watch, getValues, setValue, clearErrors } = useFormContext<FormValues>();
  const hasPrefRCFE = watch('hasPrefRCFE');
  const ispContactIsMember = watch('ispContactIsMember');
  const ispLocationSameAsCurrent = watch('ispLocationSameAsCurrent');
  const memberFirstName = watch('memberFirstName');
  const memberLastName = watch('memberLastName');
  const memberPhone = watch('memberPhone');
  const memberEmail = watch('memberEmail');
  const currentLocation = watch('currentLocation');
  const currentLocationName = watch('currentLocationName');
  const currentAddress = watch('currentAddress');
  const currentCity = watch('currentCity');
  const currentState = watch('currentState');
  const currentZip = watch('currentZip');

  useEffect(() => {
    const normalizedState = normalizeUsStateCode(getValues('ispState'));
    if (normalizedState !== (getValues('ispState') || '')) {
      setValue('ispState', normalizedState);
    }
  }, [getValues, setValue]);

  useEffect(() => {
    if (!ispContactIsMember) return;
    setValue('ispFirstName', String(memberFirstName || '').trim());
    setValue('ispLastName', String(memberLastName || '').trim());
    setValue('ispRelationship', 'Self (Member)');
    if (String(memberPhone || '').trim()) {
      setValue('ispPhone', String(memberPhone || '').trim());
    }
    if (String(memberEmail || '').trim()) {
      setValue('ispEmail', String(memberEmail || '').trim());
    }
    clearErrors(['ispFirstName', 'ispLastName', 'ispRelationship']);
  }, [ispContactIsMember, memberFirstName, memberLastName, memberPhone, memberEmail, setValue, clearErrors]);

  useEffect(() => {
    if (!ispLocationSameAsCurrent) return;
    setValue('ispLocationType', String(currentLocation || '').trim());
    setValue('ispFacilityName', String(currentLocationName || '').trim());
    setValue('ispAddress', String(currentAddress || '').trim());
    setValue('ispCity', String(currentCity || '').trim());
    setValue('ispState', normalizeUsStateCode(String(currentState || '').trim()));
    setValue('ispZip', String(currentZip || '').trim());
    clearErrors(['ispLocationType', 'ispFacilityName', 'ispAddress', 'ispCity', 'ispState', 'ispZip']);
  }, [
    ispLocationSameAsCurrent,
    currentLocation,
    currentLocationName,
    currentAddress,
    currentCity,
    currentState,
    currentZip,
    setValue,
    clearErrors,
  ]);

  const formatName = (value: string) => {
    if (!value) return '';
    return value
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
      .join(' ');
  };

  const formatAddress = (value: string) => {
    if (!value) return '';
    if (/[a-zA-Z]/.test(value.charAt(0))) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return value;
  };

  useEffect(() => {
    const rawRcfeName = String(getValues('rcfeName') || '');
    const normalizedRcfeName = formatName(rawRcfeName);
    if (normalizedRcfeName !== rawRcfeName) {
      setValue('rcfeName', normalizedRcfeName, { shouldDirty: false, shouldValidate: false });
    }
  }, [getValues, setValue]);

  return (
    <div className="flex flex-col gap-6">
      <div className="mb-3">
        <GlossaryDialog className="p-0 h-auto" />
      </div>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 11: Individual Service Plan (ISP)</CardTitle>
          <CardDescription>Choose who our RN/MSW should coordinate with and where the assessment discussion should happen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <p className="text-sm font-medium">Why we ask these ISP questions</p>
            <p className="text-sm mt-1">
              ISP details help our RN/MSW complete the care-needs review used for tier level and plan authorization.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
              <li><strong>Health Net:</strong> ISP review is virtual, but we still need the correct contact and location context for the call.</li>
              <li><strong>Kaiser:</strong> ISP review is in-person with the member and/or the best care-needs contact.</li>
              <li><strong>Contact can be the member</strong> or another person (family, SNF social worker, RCFE staff, etc.).</li>
            </ul>
            <p className="text-sm mt-3">
              Examples: “Member at home in Long Beach”, “Daughter is contact, member is at SNF in Glendale”, “SNF social worker is contact; assessment at facility”.
            </p>
          </div>
          <FormField
            control={control}
            name="ispContactIsMember"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                <FormControl>
                  <Checkbox checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked === true)} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-sm font-medium">Only ISP contact is the member</FormLabel>
                  <FormDescription className="text-xs text-muted-foreground">
                    Check this to use member name as ISP contact. You can still update phone/email and must still provide ISP assessment location details below.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={control} name="ispFirstName" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact First Name {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispContactIsMember)} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={control} name="ispLastName" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact Last Name {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispContactIsMember)} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={control} name="ispRelationship" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact Relationship to Member {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispContactIsMember)} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={control} name="ispPhone" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact Phone {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><PhoneInput {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <FormField control={control} name="ispEmail" render={({ field }) => (
            <FormItem>
              <FormLabel>ISP Contact Email</FormLabel>
              <FormControl><Input type="text" inputMode="email" {...field} value={field.value ?? ''} /></FormControl>
              <FormDescription>If no email, enter "N/A".</FormDescription>
              <FormMessage />
            </FormItem>
          )} />

          <div className="space-y-4 p-4 border rounded-md mt-4">
            <h3 className="font-medium text-base">ISP Assessment Location</h3>
            <p className="text-sm text-muted-foreground">
              Enter where the RN/MSW should connect for care-needs review. For Health Net this is the call location/context; for Kaiser this is the in-person assessment location.
            </p>
            <FormField
              control={control}
              name="ispLocationSameAsCurrent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-medium">Same as current location (Section 6)</FormLabel>
                    <FormDescription className="text-xs text-muted-foreground">
                      Auto-populates ISP location type, location name, address, city, state, and zip from Section 6.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="ispLocationType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of Location {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={Boolean(ispLocationSameAsCurrent)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {locationOptions.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>e.g., RCFE, SNF, Home, Hospital, Assisted Living, Other.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={control} name="ispFacilityName" render={({ field }) => (
                <FormItem><FormLabel>Facility Name {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispLocationSameAsCurrent)} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={control} name="ispAddress" render={({ field }) => (
              <FormItem><FormLabel>Street Address {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispLocationSameAsCurrent)} onChange={(e) => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={control} name="ispCity" render={({ field }) => (
                <FormItem><FormLabel>City {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispLocationSameAsCurrent)} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="ispState" render={({ field }) => (
                <FormItem>
                  <FormLabel>State {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel>
                  <Select onValueChange={field.onChange} value={normalizeUsStateCode(field.value ?? '')} disabled={Boolean(ispLocationSameAsCurrent)}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {US_STATE_OPTIONS.map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.code} - {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={control} name="ispZip" render={({ field }) => (
                <FormItem><FormLabel>Zip {!relaxIspRequiredForDraft && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={Boolean(ispLocationSameAsCurrent)} onChange={(e) => field.onChange(String(e.target.value || '').trim())} inputMode="numeric" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>
          {relaxIspRequiredForDraft ? (
            <div className="space-y-3 p-4 border rounded-md bg-amber-50 border-amber-200">
              <h3 className="font-medium text-base text-amber-900">Draft Pre-Assessment Notes (for Kaiser tier planning)</h3>
              <p className="text-sm text-amber-800">
                Capture care-needs observations for internal pre-assessment. These notes are included with Caspio push when a matching notes field is available.
              </p>
              <FormField
                control={control}
                name="preAssessmentCareNeedsNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member care-needs pre-assessment notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ''}
                        rows={5}
                        placeholder="Examples: transfer assist level, ambulation support, cognition/safety concerns, toileting needs, medication supervision, behavior/redirecting needs, overnight support patterns."
                      />
                    </FormControl>
                    <FormDescription>
                      Draft-only planning notes to help estimate likely ISP/tier level before formal assessment.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 12: CalAIM vs. Assisted Living Waiver (ALW)</CardTitle>
          <CardDescription>CalAIM and ALW are duplicative services, a member enrolled in one will not be funded by the other.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="onALWWaitlist"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Is the member currently on the ALW waitlist? <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Unknown" /></FormControl><FormLabel className="font-normal">Unknown</FormLabel></FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Section 13: RCFE Selection</CardTitle>
          <CardDescription>Residential Care Facility for the Elderly selection status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={control}
            name="hasPrefRCFE"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Has a preferred assisted living facility (RCFE) been chosen? <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="p-4 border rounded-md space-y-4">
            <h3 className="font-medium">Preferred Facility Details</h3>
            <p className="text-sm text-muted-foreground">If a facility has not been chosen, you can leave these fields blank. If "Yes" is selected above, all fields are required.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="rcfeName" render={({ field }) => (
                <FormItem><FormLabel>Facility Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="rcfeAddress" render={({ field }) => (
                <FormItem><FormLabel>Facility Address {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={control} name="rcfePreferredCities" render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred RCFE Cities {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel>
                <FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl>
                <FormDescription>Example: Los Angeles, Long Beach, Pasadena</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="rcfeAdminFirstName" render={({ field }) => (
                <FormItem><FormLabel>Administrator First Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="rcfeAdminLastName" render={({ field }) => (
                <FormItem><FormLabel>Administrator Last Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="rcfeAdminPhone" render={({ field }) => (
                <FormItem><FormLabel>Administrator Phone {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><PhoneInput {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="rcfeAdminEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Administrator Email {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel>
                  <FormControl><Input type="text" inputMode="email" {...field} value={field.value ?? ''} /></FormControl>
                  <FormDescription>If no email, enter "N/A".</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
