
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
import { US_STATE_OPTIONS, normalizeUsStateCode } from '@/lib/us-states';
import { findCountyByCity } from '@/lib/california-cities';

const locationOptions = ["Home", "Hospital", "Skilled Nursing", "Unhoused", "Sub-Acute", "Assisted Living", "Other"];
const UNKNOWN_VALUE = 'Unknown';

export default function Step2() {
  const { control, watch, setValue, getValues, clearErrors } = useFormContext<FormValues>();
  
  const copyAddress = watch('copyAddress');
  const currentAddressFields = watch([
    'currentLocation',
    'currentLocationName',
    'currentAddress',
    'currentCity',
    'currentState',
    'currentZip',
    'currentCounty'
  ]);
  const currentLocation = watch('currentLocation');
  const customaryLocationType = watch('customaryLocationType');
  const currentCity = watch('currentCity');
  const customaryCity = watch('customaryCity');
  const currentSubacuteSelected = String(currentLocation || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'subacute';
  const customarySubacuteSelected = String(customaryLocationType || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'subacute';

  useEffect(() => {
    if (copyAddress) {
      setValue('customaryLocationType', getValues('currentLocation'));
      setValue('customaryLocationName', getValues('currentLocationName'));
      setValue('customaryAddress', getValues('currentAddress'));
      setValue('customaryCity', getValues('currentCity'));
      setValue('customaryState', getValues('currentState'));
      setValue('customaryZip', getValues('currentZip'));
      setValue('customaryCounty', getValues('currentCounty'));
      clearErrors(['customaryLocationType', 'customaryLocationName', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty']);
    }
  }, [copyAddress, ...currentAddressFields, getValues, setValue, clearErrors]);

  useEffect(() => {
    const normalizedCurrent = normalizeUsStateCode(getValues('currentState'));
    const normalizedCustomary = normalizeUsStateCode(getValues('customaryState'));
    if (normalizedCurrent !== (getValues('currentState') || '')) {
      setValue('currentState', normalizedCurrent);
    }
    if (normalizedCustomary !== (getValues('customaryState') || '')) {
      setValue('customaryState', normalizedCustomary);
    }
  }, [getValues, setValue]);

  useEffect(() => {
    // Clean legacy values from older records that allowed "Unknown".
    const unknown = UNKNOWN_VALUE.toLowerCase();
    const fields: Array<keyof FormValues> = [
      'currentLocation',
      'customaryLocationType',
      'currentAddress',
      'currentCity',
      'currentState',
      'currentZip',
      'currentCounty',
      'customaryAddress',
      'customaryCity',
      'customaryState',
      'customaryZip',
      'customaryCounty',
    ];
    const changed: Array<keyof FormValues> = [];
    for (const fieldName of fields) {
      const value = String(getValues(fieldName) || '').trim().toLowerCase();
      if (value === unknown) {
        setValue(fieldName, '' as FormValues[typeof fieldName]);
        changed.push(fieldName);
      }
    }
    if (changed.length > 0) {
      clearErrors(changed);
    }
  }, [getValues, setValue, clearErrors]);

  useEffect(() => {
    const county = findCountyByCity(String(currentCity || '').trim());
    if (!county) return;
    setValue('currentCounty', county);
    clearErrors('currentCounty');
  }, [currentCity, setValue, clearErrors]);

  useEffect(() => {
    if (copyAddress) return;
    const county = findCountyByCity(String(customaryCity || '').trim());
    if (!county) return;
    setValue('customaryCounty', county);
    clearErrors('customaryCounty');
  }, [customaryCity, copyAddress, setValue, clearErrors]);
  
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
          <CardTitle>Section 6: Current Location Information</CardTitle>
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
                                    <SelectValue />
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
                <FormField
                  control={control}
                  name="currentLocationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Current Location Name {currentSubacuteSelected ? <span className="text-destructive">*</span> : '(if applicable)'}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
                      </FormControl>
                      {currentSubacuteSelected && (
                        <FormDescription>Required when location type is Sub-Acute.</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
             </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <Select onValueChange={field.onChange} value={normalizeUsStateCode(field.value ?? '')}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                    </FormControl>
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
                        <SelectValue />
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
            <h3 className="font-medium mb-2">Section 6A: Normal Long Term Mailing Address (e.g., where member normally resides if not at the current location)</h3>
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
                              <FormLabel>Normal Long Term Mailing Address Location Type <span className="text-destructive">*</span></FormLabel>
                              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={copyAddress}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
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
                        <FormField
                          control={control}
                          name="customaryLocationName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Normal Long Term Mailing Address Location Name {customarySubacuteSelected ? <span className="text-destructive">*</span> : '(if applicable)'}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value ?? ''}
                                  disabled={copyAddress}
                                  onChange={e => field.onChange(formatName(e.target.value))}
                                />
                              </FormControl>
                              {customarySubacuteSelected && (
                                <FormDescription>Required when location type is Sub-Acute.</FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={control} name="customaryAddress" render={({ field }) => (
                          <FormItem><FormLabel>Normal Long Term Mailing Street Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} onChange={e => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="customaryCity" render={({ field }) => (
                            <FormItem><FormLabel>Normal Long Term Mailing City <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name="customaryState" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Normal Long Term Mailing State <span className="text-destructive">*</span></FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={normalizeUsStateCode(field.value ?? '')}
                                disabled={copyAddress}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select state" />
                                  </SelectTrigger>
                                </FormControl>
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
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="customaryZip" render={({ field }) => (
                            <FormItem><FormLabel>Normal Long Term Mailing ZIP Code <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={copyAddress} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={control} name="customaryCounty" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Normal Long Term Mailing County <span className="text-destructive">*</span></FormLabel>
                              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={copyAddress}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
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

    
    