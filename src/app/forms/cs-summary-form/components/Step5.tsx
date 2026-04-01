'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { type FormValues } from '../schema';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { US_STATE_OPTIONS, normalizeUsStateCode } from '@/lib/us-states';

const locationOptions = ['Home', 'Hospital', 'Skilled Nursing', 'Unhoused', 'Sub-Acute', 'Assisted Living', 'Other', 'Unknown'];

export default function Step5() {
  const { control, watch, getValues, setValue } = useFormContext<FormValues>();
  const hasPrefRCFE = watch('hasPrefRCFE');

  useEffect(() => {
    const normalizedState = normalizeUsStateCode(getValues('ispState'));
    if (normalizedState !== (getValues('ispState') || '')) {
      setValue('ispState', normalizedState);
    }
  }, [getValues, setValue]);

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
          <CardDescription>Please review the ISP contact instructions below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <p className="text-sm">
              An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP)
              clinical team to determine the member's care needs and to approve them for the program. The ISP assessment
              is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or
              in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the
              MCP will pay for the "assisted living" portion). For Health Net, the tiered level is determined by
              Connections. For Kaiser, the tiered level is determined by Kaiser.
            </p>
            <p className="text-sm mt-3">
              Our MSW/RN needs to know who to contact to discuss the care needs of the member, review the Physician's
              report (602), and other clinical notes. Who is the best person to contact for the ISP? Please note this is
              not the primary care doctor but could be a SNF social worker, etc.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={control} name="ispFirstName" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact First Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={control} name="ispLastName" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact Last Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={control} name="ispRelationship" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact Relationship to Member <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={control} name="ispPhone" render={({ field }) => (
              <FormItem><FormLabel>ISP Contact Phone <span className="text-destructive">*</span></FormLabel><FormControl><PhoneInput {...field} /></FormControl><FormMessage /></FormItem>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="ispLocationType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of Location <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
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
                <FormItem><FormLabel>Facility Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={control} name="ispAddress" render={({ field }) => (
              <FormItem><FormLabel>Street Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={control} name="ispCity" render={({ field }) => (
                <FormItem><FormLabel>City <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="ispState" render={({ field }) => (
                <FormItem>
                  <FormLabel>State <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={normalizeUsStateCode(field.value ?? '')}>
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
                <FormItem><FormLabel>Zip <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={(e) => field.onChange(String(e.target.value || '').trim())} inputMode="numeric" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>
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
