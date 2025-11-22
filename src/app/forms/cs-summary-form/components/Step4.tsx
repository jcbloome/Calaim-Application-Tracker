'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { FormValues } from '../page';
import { Label } from '@/components/ui/label';

const snfTransitionCriteria = [
  { id: 'snf_criteria_1', label: 'Currently resides in an SNF' },
  { id: 'snf_criteria_2', label: 'Expresses a desire to move to the community' },
  { id: 'snf_criteria_3', label: 'Has needs that can be safely met in the community' },
];

const snfDiversionCriteria = [
  { id: 'div_criteria_1', label: 'At risk of SNF admission' },
  { id: 'div_criteria_2', label: 'Requires assistance with ADLs/IADLs' },
  { id: 'div_criteria_3', label: 'Community-based care is a viable alternative' },
];

export default function Step4() {
  const { control } = useFormContext<FormValues>();
  const pathway = useWatch({ control, name: 'pathway' });
  const hasPrefRCFE = useWatch({ control, name: 'hasPrefRCFE' });

  const eligibilityItems = pathway === 'SNF Transition' ? snfTransitionCriteria : snfDiversionCriteria;

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Pathway Selection</CardTitle>
          <CardDescription>Choose the pathway that best describes the member's situation.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="pathway"
            render={({ field }) => (
              <FormItem className="space-y-3">
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
        </CardContent>
      </Card>
      
      {pathway && (
        <Card className="border-l-4 border-accent">
            <CardHeader>
                <CardTitle>Eligibility Screening</CardTitle>
                <CardDescription>Check all criteria that apply based on the selected pathway.</CardDescription>
            </CardHeader>
            <CardContent>
                <FormField
                    control={control}
                    name="eligibilityCriteria"
                    render={() => (
                        <FormItem>
                        {eligibilityItems.map((item) => (
                            <FormField
                            key={item.id}
                            control={control}
                            name="eligibilityCriteria"
                            render={({ field }) => {
                                return (
                                <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value?.includes(item.id)}
                                            onCheckedChange={(checked) => {
                                                return checked
                                                ? field.onChange([...(field.value || []), item.id])
                                                : field.onChange(
                                                    (field.value || [])?.filter(
                                                    (value) => value !== item.id
                                                    )
                                                )
                                            }}
                                        />
                                    </FormControl>
                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                </FormItem>
                                )
                            }}
                            />
                        ))}
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
      )}

      <Card className="border-l-4 border-accent">
          <CardHeader><CardTitle>ISP Contact</CardTitle><CardDescription>Person coordinating the Individual Service Plan.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="ispContactName" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="ispContactAgency" render={({ field }) => (
                  <FormItem><FormLabel>Agency</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="ispContactPhone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField control={control} name="ispContactEmail" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
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

          {hasPrefRCFE === 'Yes' && (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}