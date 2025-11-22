
'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { FormValues } from '../page';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';

export default function Step3() {
  const { control, setValue, watch } = useFormContext<FormValues>();
  const pathway = watch('pathway');
  
  const ispCopyCurrent = useWatch({ control, name: 'ispCopyCurrent' });
  const ispCopyCustomary = useWatch({ control, name: 'ispCopyCustomary' });
  const currentAddress = {
    address: watch('currentAddress'),
    city: watch('currentCity'),
    state: watch('currentState'),
    zip: watch('currentZip'),
  };
  const customaryAddress = {
    address: watch('customaryAddress'),
    city: watch('customaryCity'),
    state: watch('customaryState'),
    zip: watch('customaryZip'),
  };

  useEffect(() => {
    if (ispCopyCurrent) {
      setValue('ispAddress', currentAddress.address);
      setValue('ispCity', currentAddress.city);
      setValue('ispState', currentAddress.state);
      setValue('ispZip', currentAddress.zip);
      setValue('ispCopyCustomary', false);
    }
  }, [ispCopyCurrent, currentAddress.address, currentAddress.city, currentAddress.state, currentAddress.zip, setValue]);
  
  useEffect(() => {
    if (ispCopyCustomary) {
      setValue('ispAddress', customaryAddress.address);
      setValue('ispCity', customaryAddress.city);
      setValue('ispState', customaryAddress.state);
      setValue('ispZip', customaryAddress.zip);
      setValue('ispCopyCurrent', false);
    }
  }, [ispCopyCustomary, customaryAddress.address, customaryAddress.city, customaryAddress.state, customaryAddress.zip, setValue]);

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Pathway & Eligibility</CardTitle>
          <CardDescription>Choose the pathway that best describes the member's situation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField
            control={control}
            name="pathway"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Pathway Selection</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormItem>
                      <RadioGroupItem value="SNF Transition" id="snf_transition" className="peer sr-only" />
                      <Label htmlFor="snf_transition" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                        <h3 className="font-semibold">SNF Transition</h3>
                        <p className="text-sm text-muted-foreground mt-2 text-center">For members currently in a Skilled Nursing Facility who want to move to a community setting.</p>
                      </Label>
                    </FormItem>
                    <FormItem>
                      <RadioGroupItem value="SNF Diversion" id="snf_diversion" className="peer sr-only" />
                      <Label htmlFor="snf_diversion" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                        <h3 className="font-semibold">SNF Diversion</h3>
                        <p className="text-sm text-muted-foreground mt-2 text-center">For members at risk of SNF admission who can be safely cared for in the community.</p>
                      </Label>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {pathway === 'SNF Transition' && (
            <div className="space-y-4 p-4 border rounded-md">
                <FormField
                    control={control}
                    name="snfTransitionEligibility"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                        <FormLabel>Does the member meet all criteria for SNF Transition?</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="N/A" /></FormControl><FormLabel className="font-normal">N/A</FormLabel></FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
          )}
          
          {pathway === 'SNF Diversion' && (
            <div className="space-y-4 p-4 border rounded-md">
                 <FormField
                    control={control}
                    name="snfDiversionEligibility"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                        <FormLabel>Does the member meet all criteria for SNF Diversion?</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="N/A" /></FormControl><FormLabel className="font-normal">N/A</FormLabel></FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={control}
                    name="snfDiversionReason"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Reason for SNF Diversion</FormLabel>
                        <FormControl>
                            <Textarea {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
          <CardHeader><CardTitle>Individual Service Plan (ISP) Contact</CardTitle></CardHeader>
          <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispFirstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={control} name="ispLastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispRelationship" render={({ field }) => (
                    <FormItem><FormLabel>Relationship to Member</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="ispFacilityName" render={({ field }) => (
                    <FormItem><FormLabel>Facility Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispPhone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="ispEmail" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
          </CardContent>
      </Card>
       <Card className="border-l-4 border-accent">
          <CardHeader><CardTitle>ISP Assessment Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField control={control} name="ispCopyCurrent" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>ISP contact location is same as member's current location</FormLabel></div></FormItem>
            )} />
            <FormField control={control} name="ispCopyCustomary" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>ISP contact location is same as member's customary residence</FormLabel></div></FormItem>
            )} />
            <div className="space-y-4 p-4 border rounded-md">
                <FormField control={control} name="ispAddress" render={({ field }) => (
                    <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="ispCity" render={({ field }) => (
                        <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="ispState" render={({ field }) => (
                        <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="ispZip" render={({ field }) => (
                        <FormItem><FormLabel>Zip Code</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="ispCounty" render={({ field }) => (
                        <FormItem><FormLabel>County</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>
          </CardContent>
       </Card>

        <Card className="border-l-4 border-accent">
            <CardHeader><CardTitle>Assisted Living Waiver (ALW) Status</CardTitle></CardHeader>
            <CardContent>
                <FormField
                    control={control}
                    name="onALWWaitlist"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                        <FormLabel>Is the member currently on the ALW waitlist?</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
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
        <CardHeader><CardTitle>RCFE Selection</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={control}
            name="hasPrefRCFE"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Has a preferred assisted living facility (RCFE) been chosen?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex items-center space-x-4">
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
              <FormField control={control} name="rcfeName" render={({ field }) => (
                  <FormItem><FormLabel>Facility Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="rcfeAddress" render={({ field }) => (
                  <FormItem><FormLabel>Facility Address</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField control={control} name="rcfeAdminName" render={({ field }) => (
                  <FormItem><FormLabel>Administrator Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="rcfeAdminPhone" render={({ field }) => (
                      <FormItem><FormLabel>Administrator Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={control} name="rcfeAdminEmail" render={({ field }) => (
                      <FormItem><FormLabel>Administrator Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
