
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import type { FormValues } from '../page';

export default function Step4() {
  const { control, watch } = useFormContext<FormValues>();
  const hasPrefRCFE = watch('hasPrefRCFE');
  const healthPlan = watch('healthPlan');
  const isKaiser = healthPlan === 'Kaiser';
  
  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
          <CardHeader>
            <CardTitle>Individual Service Plan (ISP) Contact</CardTitle>
            <CardDescription>
                All applications are required to have ISP (which eventually determines the tiered level of care and the amount paid for &quot;assisted living&quot; to the RCFE/ARF) conducted in-person (Kaiser) or virtually (Health Net) by RN or MSW (with sign-off by RN). The ISP contact is usually the SNF or hospital RN, social worker or case manager, or, if the member is in the community with the family member or caregiver. Once finalized the ISP requires signatures by the ISP contact.
                <br/><br/>
                Who is the person we should contact for the ISP?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispFirstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name {isKaiser && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={control} name="ispLastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name {isKaiser && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispRelationship" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Relationship to Member {isKaiser && <span className="text-destructive">*</span>}</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                        <FormDescription>e.g., social worker, RN, family member, etc.</FormDescription>
                        <FormMessage />
                    </FormItem>
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

               <div className="space-y-4 p-4 border rounded-md mt-4">
                 <h3 className="font-medium text-base">ISP Assessment Location {isKaiser && <span className="text-destructive font-normal text-sm">(Required for Kaiser)</span>}</h3>
                 <FormField control={control} name="ispAddress" render={({ field }) => (
                    <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={control} name="ispCity" render={({ field }) => (
                        <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="ispState" render={({ field }) => (
                        <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="ispZip" render={({ field }) => (
                        <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                 <FormField control={control} name="ispCounty" render={({ field }) => (
                    <FormItem><FormLabel>County</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
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
                        <FormLabel>Is the member currently on the ALW waitlist?</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value ?? undefined} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
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
                <FormLabel>Has a preferred assisted living facility (RCFE) been chosen?</FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4">
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {hasPrefRCFE === 'Yes' && (
            <div className="p-4 border rounded-md space-y-4">
                <h3 className="font-medium">Preferred Facility Details</h3>
                <FormField control={control} name="rcfeName" render={({ field }) => (
                    <FormItem><FormLabel>Facility Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="rcfeAddress" render={({ field }) => (
                    <FormItem><FormLabel>Facility Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="rcfeAdminName" render={({ field }) => (
                    <FormItem><FormLabel>Administrator Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="rcfeAdminPhone" render={({ field }) => (
                        <FormItem><FormLabel>Administrator Phone <span className="text-destructive">*</span></FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="rcfeAdminEmail" render={({ field }) => (
                        <FormItem><FormLabel>Administrator Email <span className="text-destructive">*</span></FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
