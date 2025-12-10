
'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { type FormValues } from '../schema';
import { PhoneInput } from '@/components/ui/phone-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const locationOptions = ["Home", "Hospital", "Skilled Nursing", "Unhoused", "Sub-Acute", "Assisted Living", "Other"];

export default function Step4() {
  const { control, watch, setValue, getValues, clearErrors } = useFormContext<FormValues>();
  
  const hasPrefRCFE = watch('hasPrefRCFE');
  const ispCopyCurrent = watch('ispCopyCurrent');

  useEffect(() => {
    if (ispCopyCurrent) {
        setValue('ispLocationType', getValues('currentLocation'));
        setValue('ispAddress', getValues('currentAddress'));
        setValue('ispCity', getValues('currentCity'));
        setValue('ispState', getValues('currentState'));
        setValue('ispZip', getValues('currentZip'));
        setValue('ispCounty', getValues('currentCounty'));
        clearErrors(['ispLocationType', 'ispAddress', 'ispCity', 'ispState', 'ispZip', 'ispCounty']);
    } else {
        setValue('ispLocationType', '');
        setValue('ispAddress', '');
        setValue('ispCity', '');
        setValue('ispState', '');
        setValue('ispZip', '');
        setValue('ispCounty', '');
    }
  }, [ispCopyCurrent, getValues, setValue, clearErrors]);


  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
          <CardHeader>
            <CardTitle>Individual Service Plan (ISP) Contact</CardTitle>
            <CardDescription>
                Who is the person we should contact for the ISP?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispFirstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={control} name="ispLastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispRelationship" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Relationship to Member <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                        <FormDescription>e.g., social worker, RN, family member, etc.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />
                 <FormField control={control} name="ispPhone" render={({ field }) => (
                    <FormItem><FormLabel>Phone <span className="text-destructive">*</span></FormLabel><FormControl><PhoneInput placeholder="(xxx) xxx-xxxx" value={field.value ?? ''} {...field} /></FormControl><FormDescription>Format: (xxx) xxx-xxxx</FormDescription><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={control} name="ispEmail" render={({ field }) => (
                <FormItem><FormLabel>Email <span className="text-destructive">*</span></FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />

               <div className="space-y-4 p-4 border rounded-md mt-4">
                 <h3 className="font-medium text-base">ISP Assessment Location</h3>
                  <FormField
                    control={control}
                    name="ispCopyCurrent"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Same as current location</FormLabel>
                        </div>
                        </FormItem>
                    )}
                />
                  <FormField
                    control={control}
                    name="ispLocationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type of Location {!ispCopyCurrent && <span className="text-destructive">*</span>}</FormLabel>
                         <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={ispCopyCurrent}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a location type" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {locationOptions.map(option => (
                                    <SelectItem key={option} value={option}>{option}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                 <FormField control={control} name="ispFacilityName" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Facility Name <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                        <FormDescription>If not applicable, enter N/A.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />
                 <FormField control={control} name="ispAddress" render={({ field }) => (
                    <FormItem><FormLabel>Street Address {!ispCopyCurrent && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={ispCopyCurrent} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={control} name="ispCity" render={({ field }) => (
                        <FormItem><FormLabel>City {!ispCopyCurrent && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={ispCopyCurrent} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="ispState" render={({ field }) => (
                        <FormItem><FormLabel>State {!ispCopyCurrent && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={ispCopyCurrent} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="ispZip" render={({ field }) => (
                        <FormItem><FormLabel>ZIP Code {!ispCopyCurrent && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={ispCopyCurrent} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                 <FormField control={control} name="ispCounty" render={({ field }) => (
                    <FormItem><FormLabel>County {!ispCopyCurrent && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={ispCopyCurrent} /></FormControl><FormMessage /></FormItem>
                )} />
            </div>
          </CardContent>
      </Card>

        <Card className="border-l-4 border-accent">
            <CardHeader>
                <CardTitle>CalAIM vs. Assisted Living Waiver (ALW)</CardTitle>
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
            <CardTitle>RCFE Selection</CardTitle>
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
                  <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex items-center space-x-4">
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
                <FormField control={control} name="rcfeName" render={({ field }) => (
                    <FormItem><FormLabel>Facility Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="rcfeAddress" render={({ field }) => (
                    <FormItem><FormLabel>Facility Address {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="rcfeAdminName" render={({ field }) => (
                    <FormItem><FormLabel>Administrator Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="rcfeAdminPhone" render={({ field }) => (
                        <FormItem><FormLabel>Administrator Phone {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><PhoneInput placeholder="(xxx) xxx-xxxx" value={field.value ?? ''} {...field} /></FormControl><FormDescription>Format: (xxx) xxx-xxxx</FormDescription><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="rcfeAdminEmail" render={({ field }) => (
                        <FormItem><FormLabel>Administrator Email {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
