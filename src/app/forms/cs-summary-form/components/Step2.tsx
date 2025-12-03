
'use client';

import { useFormContext } from 'react-hook-form';
import type { FormValues } from '../schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export default function Step2() {
  const { control, watch, setValue, getValues } = useFormContext<FormValues>();
  const copyAddress = watch('copyAddress');

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Location Information</CardTitle>
          <CardDescription>Details about the member's current and customary residence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <FormField
              control={control}
              name="currentLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member's Current Location <span className="text-destructive">*</span></FormLabel>
                   <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder="e.g., SNF, Home, Hospital" />
                   </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-4 p-4 border rounded-md">
            <h3 className="font-medium">Current Address</h3>
            <FormField control={control} name="currentAddress" render={({ field }) => (
              <FormItem><FormLabel>Street Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="currentCity" render={({ field }) => (
                <FormItem><FormLabel>City <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="currentState" render={({ field }) => (
                <FormItem><FormLabel>State <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="currentZip" render={({ field }) => (
                <FormItem><FormLabel>ZIP Code <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField control={control} name="currentCounty" render={({ field }) => (
                <FormItem><FormLabel>County <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Customary Residence (where is the member's normal long term address)</h3>
            <div className="p-4 border rounded-md space-y-4">
                <FormField
                    control={control}
                    name="copyAddress"
                    render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                        <Checkbox 
                            checked={field.value} 
                            onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                    const { currentAddress, currentCity, currentState, currentZip, currentCounty } = getValues();
                                    setValue('customaryAddress', currentAddress);
                                    setValue('customaryCity', currentCity);
                                    setValue('customaryState', currentState);
                                    setValue('customaryZip', currentZip);
                                    setValue('customaryCounty', currentCounty);
                                } else {
                                    setValue('customaryAddress', '');
                                    setValue('customaryCity', '');
                                    setValue('customaryState', '');
                                    setValue('customaryZip', '');
                                    setValue('customaryCounty', '');
                                }
                            }}
                        />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                        <FormLabel>Same as current location</FormLabel>
                        </div>
                    </FormItem>
                    )}
                />
                <div className="space-y-4">
                    <FormField control={control} name="customaryAddress" render={({ field }) => (
                        <FormItem><FormLabel>Street Address {!copyAddress && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="customaryCity" render={({ field }) => (
                            <FormItem><FormLabel>City {!copyAddress && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name="customaryState" render={({ field }) => (
                            <FormItem><FormLabel>State {!copyAddress && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="customaryZip" render={({ field }) => (
                            <FormItem><FormLabel>ZIP Code {!copyAddress && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={control} name="customaryCounty" render={({ field }) => (
                            <FormItem><FormLabel>County {!copyAddress && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
