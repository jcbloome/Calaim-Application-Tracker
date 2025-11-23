
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import type { FormValues } from '../page';

export default function Step4() {
  const { control, watch } = useFormContext<FormValues>();
  const hasPrefRCFE = watch('hasPrefRCFE');
  
  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
          <CardHeader>
            <CardTitle>Individual Service Plan (ISP) Contact</CardTitle>
            <CardDescription>
                All applications are required to have an ISP filled out by a RN employed by Connections who will review all medical documentation the 602 Physician's report, medicine list and diagnostic codes. The RN will also a conduct a virtual visit with the member (if he/she has capacity), social worker, primary caregiver and/or AR to determine tier level of care (e.g., how much Medi-Cal will pay for the "assisted living" portion). Once finalized, the ISP requires signatures from the RN, the member or AR and, eventually, a representative from the assisted living home.
                <br/><br/>
                Who is the most convenient person to contact for the ISP to be signed by the member if he/she has capacity? For example, if the member is in a SNF but does not have email, the SNF social worker is usually the best contact person.
                <br/><br/>
                <strong>Kaiser requires in-person visits by RN or MSW (with sign-off by RN) and Health Net allows for virtual assessments by RN.</strong>
            </CardDescription>
          </CardHeader>
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
          <CardHeader>
            <CardTitle>ISP Assessment Location</CardTitle>
            <CardDescription>Where the ISP assessment will take place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={control} name="ispAssessmentLocation" render={({ field }) => (
                <FormItem>
                    <FormLabel>Name of ISP Assessment Location</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="e.g., Bob's Nursing Home, at home, Nano's Hospital, etc." /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
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
