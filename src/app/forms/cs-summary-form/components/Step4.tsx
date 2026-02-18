
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { type FormValues } from '../schema';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { GlossaryDialog } from '@/components/GlossaryDialog';


const locationOptions = ["Home", "Hospital", "Skilled Nursing", "Unhoused", "Sub-Acute", "Assisted Living", "Other"];

export default function Step4() {
  const { control, watch } = useFormContext<FormValues>();
  
  const hasPrefRCFE = watch('hasPrefRCFE');

  const formatName = (value: string) => {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  };
  
  const formatAddress = (value: string) => {
    if (!value) return '';
    // Only capitalize if the first character is a letter
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
            <CardTitle>Individual Service Plan (ISP) Contact</CardTitle>
          <CardDescription>Please review the ISP contact instructions below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-900">
                <p className="text-sm">
                    An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's (MCP) clinical team to determine the member's care needs and to approve them for the program. The ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care (the amount the MCP will pay for the "assisted living" portion). For Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is determined by Kaiser.
                </p>
                <p className="text-sm mt-3">
                    Our MSW/RN needs to know who to contact to discuss the care needs of the member, review the Physician's report (602), and other clinical notes. Who is the best person to contact for the ISP? Please note this is not the primary care doctor but could be a SNF social worker, etc.
                </p>
            </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispFirstName" render={({ field }) => (
                    <FormItem><FormLabel>ISP Contact First Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={control} name="ispLastName" render={({ field }) => (
                    <FormItem><FormLabel>ISP Contact Last Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="ispRelationship" render={({ field }) => (
                    <FormItem>
                        <FormLabel>ISP Contact Relationship to Member <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                 <FormField control={control} name="ispPhone" render={({ field }) => (
                    <FormItem><FormLabel>ISP Contact Phone <span className="text-destructive">*</span></FormLabel><FormControl><PhoneInput placeholder="(xxx) xxx-xxxx" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={control} name="ispEmail" render={({ field }) => (
                <FormItem>
              <FormLabel>ISP Contact Email <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl>
                  <FormDescription>If no email, enter "N/A".</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

               <div className="space-y-4 p-4 border rounded-md mt-4">
                <h3 className="font-medium text-base">ISP Assessment Location</h3>
                 <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-900">
                    <p className="text-sm">
                        The street address for the ISP assessment is only required for Kaiser members (which requires an in-person visit). For Health Net members, please put N/A in the below boxes.
                    </p>
                 </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={control}
                      name="ispLocationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type of Location <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
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
                          <FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl>
                          <FormMessage />
                      </FormItem>
                  )} />
                  </div>
                 <FormField control={control} name="ispAddress" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Street Address <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatAddress(e.target.value))} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
          </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Room & Board Payments</CardTitle>
          <CardDescription>Understanding the member's financial responsibility.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose prose-sm max-w-none text-gray-700 space-y-3 p-4 border rounded-lg bg-muted/30">
            <p>The MCP member is responsible for paying the RCFE the "room and board" portion and the MCP is responsible for paying the RCFE the "assisted living" portion.</p>
            <p>For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for "room and board" for a private room or to open up RCFEs in more expensive areas.</p>
            <p>Members not eligible for the NMOHC will still have a "room and board" obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.</p>
            <p>Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a "room and board" payment from the member (or their family).</p>
            <p>Working with CalAIM is at the discretion of the RCFEs. RCFEs, especially in more expensive areas, might not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas. Before accepting CalAIM members, RCFEs will need to know the "room and board" payment.</p>
          </div>

          <div className="rounded-md border border-gray-300 p-4 text-foreground">
            <p className="text-sm">
              Proof of income (annual award letter or 3 months of bank statements showing Social Security income)
              will need to be submitted as part of this application.
            </p>
          </div>
            <FormField
              control={control}
              name="ackRoomAndBoard"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-blue-700">
                      I have read and understood the financial obligation for Room and Board. <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="rcfeName" render={({ field }) => (
                        <FormItem><FormLabel>Facility Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="rcfeAddress" render={({ field }) => (
                        <FormItem><FormLabel>Facility Address {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatAddress(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField
                  control={control}
                  name="rcfePreferredCities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Preferred RCFE Cities {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          onChange={e => field.onChange(formatName(e.target.value))}
                          placeholder="Enter up to 3 cities, separated by commas"
                        />
                      </FormControl>
                      <FormDescription>Example: Los Angeles, Long Beach, Pasadena</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="rcfeAdminFirstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Administrator First Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={control} name="rcfeAdminLastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Administrator Last Name {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="rcfeAdminPhone" render={({ field }) => (
                        <FormItem><FormLabel>Administrator Phone {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel><FormControl><PhoneInput placeholder="(xxx) xxx-xxxx" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="rcfeAdminEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Administrator Email {hasPrefRCFE === 'Yes' && <span className="text-destructive">*</span>}</FormLabel>
                          <FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl>
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

    
    
    