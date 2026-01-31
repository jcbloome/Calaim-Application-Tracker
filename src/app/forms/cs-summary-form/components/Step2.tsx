
'use client';

import { useFormContext } from 'react-hook-form';
import type { FormValues } from '../schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { californiaCounties } from '@/lib/california-counties';

const locationOptions = ["Home", "Hospital", "Skilled Nursing", "Unhoused", "Sub-Acute", "Assisted Living", "Other"];

export default function Step2() {
  const { control, watch, setValue, getValues, clearErrors } = useFormContext<FormValues>();
  
  const copyAddress = watch('copyAddress');
  const currentAddressFields = watch([
    'currentLocation',
    'currentAddress',
    'currentCity',
    'currentState',
    'currentZip',
    'currentCounty'
  ]);

  useEffect(() => {
    if (copyAddress) {
      setValue('customaryLocationType', getValues('currentLocation'));
      setValue('customaryAddress', getValues('currentAddress'));
      setValue('customaryCity', getValues('currentCity'));
      setValue('customaryState', getValues('currentState'));
      setValue('customaryZip', getValues('currentZip'));
      setValue('customaryCounty', getValues('currentCounty'));
      clearErrors(['customaryLocationType', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty']);
    } else {
        setValue('customaryLocationType', '');
        setValue('customaryAddress', '');
        setValue('customaryCity', '');
        setValue('customaryState', '');
        setValue('customaryZip', '');
        setValue('customaryCounty', '');
    }
  }, [copyAddress, ...currentAddressFields, getValues, setValue, clearErrors]);
  
  const formatName = (value: string) => {
    if (!value) return '';
    return value
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };
  
  const formatAddress = (value: string) => {
    if (!value) return '';
    if (/[a-zA-Z]/.test(value.charAt(0))) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return value;
  };


  return (
    <div className="space-y-6">
      <div className="mb-3">
        <GlossaryDialog className="p-0 h-auto" />
      </div>
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Location Information</CardTitle>
          <CardDescription>Details about the member's current and customary residence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 p-4 border rounded-md">
            <h3 className="font-medium">Current Address</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={control}
                  name="currentLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Type <span className="text-destructive">*</span></FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <FormDescription>e.g., Home, Hospital, SNF</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={control} name="currentAddress" render={({ field }) => (
                  <FormItem><FormLabel>Street Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
             </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="currentCity" render={({ field }) => (
                <FormItem><FormLabel>City <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={control} name="currentState" render={({ field }) => (
                <FormItem>
                  <FormLabel>State <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      maxLength={2}
                      onChange={e => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>Use 2-letter state code (e.g., CA).</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={control} name="currentZip" render={({ field }) => (
                <FormItem><FormLabel>ZIP Code <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField control={control} name="currentCounty" render={({ field }) => (
                <FormItem>
                  <FormLabel>County <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a county" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {californiaCounties.map((county) => (
                        <SelectItem key={county} value={county}>
                          {county}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
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
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Same as current location</FormLabel>
                        </div>
                        </FormItem>
                    )}
                />
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={control}
                          name="customaryLocationType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location Type <span className="text-destructive">*</span></FormLabel>
                              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={copyAddress}>
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
                                 <FormDescription>e.g., Home, Hospital, SNF</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField control={control} name="customaryAddress" render={({ field }) => (
                            <FormItem><FormLabel>Street Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} onChange={e => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="customaryCity" render={({ field }) => (
                            <FormItem><FormLabel>City <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name="customaryState" render={({ field }) => (
                            <FormItem>
                              <FormLabel>State <span className="text-destructive">*</span></FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value ?? ''}
                                  disabled={copyAddress}
                                  maxLength={2}
                                  onChange={e => field.onChange(e.target.value.toUpperCase())}
                                />
                              </FormControl>
                              <FormDescription>Use 2-letter state code (e.g., CA).</FormDescription>
                              <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="customaryZip" render={({ field }) => (
                            <FormItem><FormLabel>ZIP Code <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={control} name="customaryCounty" render={({ field }) => (
                            <FormItem>
                              <FormLabel>County <span className="text-destructive">*</span></FormLabel>
                              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={copyAddress}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a county" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {californiaCounties.map((county) => (
                                    <SelectItem key={county} value={county}>
                                      {county}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
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

    
    