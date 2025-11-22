
'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { FormValues } from '../page';
import { useEffect } from 'react';

export default function Step2() {
  const { control, setValue, watch } = useFormContext<FormValues>();
  const copyAddress = useWatch({ control, name: 'copyAddress' });

  const currentLocation = {
    address: watch('currentAddress'),
    city: watch('currentCity'),
    state: watch('currentState'),
    zip: watch('currentZip'),
  };

  useEffect(() => {
    if (copyAddress) {
      setValue('customaryAddress', currentLocation.address);
      setValue('customaryCity', currentLocation.city);
      setValue('customaryState', currentLocation.state);
      setValue('customaryZip', currentLocation.zip);
    }
  }, [copyAddress, currentLocation.address, currentLocation.city, currentLocation.state, currentLocation.zip, setValue]);

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Location Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <FormField
              control={control}
              name="currentLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member's Current Location</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select a location type" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="SNF">Skilled Nursing Facility (SNF)</SelectItem>
                      <SelectItem value="Hospital">Hospital</SelectItem>
                      <SelectItem value="Home">Home / Own Residence</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-4 p-4 border rounded-md">
            <h3 className="font-medium">Current Address</h3>
            <FormField control={control} name="currentAddress" render={({ field }) => (
              <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={control} name="currentCity" render={({ field }) => (
                <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="currentState" render={({ field }) => (
                <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="currentZip" render={({ field }) => (
                <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Customary Residence</h3>
            <div className="p-4 border rounded-md space-y-4">
                <FormField
                    control={control}
                    name="copyAddress"
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
                {!copyAddress && (
                    <div className="space-y-4">
                        <FormField control={control} name="customaryAddress" render={({ field }) => (
                            <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={control} name="customaryCity" render={({ field }) => (
                                <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={control} name="customaryState" render={({ field }) => (
                                <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={control} name="customaryZip" render={({ field }) => (
                                <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                    </div>
                )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Health Plan</CardTitle>
          <CardDescription>Select the member's Managed Care Plan (MCP).</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="healthPlan"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Kaiser" /></FormControl><FormLabel className="font-normal">Kaiser Permanente</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Health Net" /></FormControl><FormLabel className="font-normal">Health Net</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Other" /></FormControl><FormLabel className="font-normal">Other</FormLabel></FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
