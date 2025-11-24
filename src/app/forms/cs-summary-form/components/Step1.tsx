
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import type { FormValues } from '../page';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


export default function Step1() {
  const { control, watch, setValue } = useFormContext<FormValues>();
  const memberDob = watch('memberDob');
  const bestContactType = watch('bestContactType');
  const memberFirstName = watch('memberFirstName');
  const memberLastName = watch('memberLastName');

  useEffect(() => {
    if (memberDob) {
      try {
        const birthDate = new Date(memberDob);
        if (!isNaN(birthDate.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          setValue('memberAge', age, { shouldValidate: true });
        } else {
          setValue('memberAge', undefined, { shouldValidate: true });
        }
      } catch (e) {
        setValue('memberAge', undefined, { shouldValidate: true });
      }
    } else {
      setValue('memberAge', undefined, { shouldValidate: true });
    }
  }, [memberDob, setValue]);
  
  useEffect(() => {
    if (bestContactType === 'member') {
        setValue('bestContactFirstName', memberFirstName, { shouldValidate: true });
        setValue('bestContactLastName', memberLastName, { shouldValidate: true });
        setValue('bestContactRelationship', 'Self', { shouldValidate: true });
    } else if (bestContactType === 'other') {
        setValue('bestContactFirstName', '', { shouldValidate: true });
        setValue('bestContactLastName', '', { shouldValidate: true });
        setValue('bestContactRelationship', '', { shouldValidate: true });
    }
  }, [bestContactType, memberFirstName, memberLastName, setValue]);

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Member Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="memberFirstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>e.g., John</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="memberLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                   <FormDescription>e.g., Doe</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
             <FormField
                control={control}
                name="memberDob"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Date of Birth <span className="text-destructive">*</span></FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                            variant={'outline'}
                            className={cn(
                                'w-full pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                            )}
                            >
                            {field.value ? format(new Date(field.value), 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={field.onChange}
                            captionLayout="dropdown-buttons"
                            fromYear={1900}
                            toYear={new Date().getFullYear()}
                            disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                    <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
              control={control}
              name="memberAge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Age</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} type="number" readOnly className="bg-muted" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="memberMediCalNum"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medi-Cal Number <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} maxLength={9} />
                  </FormControl>
                   <FormDescription>Format: 9 followed by 7 digits and a letter (e.g. 91234567A).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={control}
              name="confirmMemberMediCalNum"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Medi-Cal Number <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} maxLength={9} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="memberMrn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medical Record Number (MRN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Medical Record Number for Kaiser. If Health Net, repeat Medi-Cal Number.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={control}
              name="confirmMemberMrn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Medical Record Number (MRN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={control}
            name="memberLanguage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred Language <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>e.g., English, Spanish</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Your Information (Person Filling Form)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="referrerFirstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} readOnly className="bg-muted" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="referrerLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} readOnly className="bg-muted" />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="referrerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value ?? ''} readOnly className="bg-muted" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="referrerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="tel" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Format: (xxx) xxx-xxxx</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="referrerRelationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship to Member <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>e.g., Family Member, Social Worker</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="agency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agency</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>If not applicable, enter N/A. (e.g., Bob's Referral Agency, Hospital Name, etc.)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Best Contact Person</CardTitle>
          <CardDescription>Provide contact details for the member's designated best contact person.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-md space-y-4">
              <FormField
                control={control}
                name="bestContactType"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Who is the best contact person? <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="member" /></FormControl><FormLabel className="font-normal">The Member</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="other" /></FormControl><FormLabel className="font-normal">Another Contact Person</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
               />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactFirstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly={bestContactType === 'member'} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={control} name="bestContactLastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly={bestContactType === 'member'} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
              <FormField control={control} name="bestContactRelationship" render={({ field }) => (
                  <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly={bestContactType === 'member'} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactPhone" render={({ field }) => (
                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormDescription>Format: (xxx) xxx-xxxx</FormDescription><FormMessage /></FormItem>
                  )} />
                  <FormField control={control} name="bestContactEmail" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
              <FormField control={control} name="bestContactLanguage" render={({ field }) => (
                  <FormItem><FormLabel>Language</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
                <Button variant="link" className="p-0 text-accent">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add a Secondary Contact (Optional)
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="p-4 border rounded-md space-y-4 mt-2">
                    <h3 className="font-medium">Secondary Contact Person</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="secondaryContactFirstName" render={({ field }) => (
                            <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name="secondaryContactLastName" render={({ field }) => (
                            <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <FormField control={control} name="secondaryContactRelationship" render={({ field }) => (
                        <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={control} name="secondaryContactPhone" render={({ field }) => (
                            <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormDescription>Format: (xxx) xxx-xxxx</FormDescription><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name="secondaryContactEmail" render={({ field }) => (
                            <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <FormField control={control} name="secondaryContactLanguage" render={({ field }) => (
                        <FormItem><FormLabel>Language</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Legal Representative</CardTitle>
          <CardDescription>Information about legal capacity and representation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <FormField
                control={control}
                name="hasCapacity"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Does member have capacity to make their own decisions? <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                        <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="hasLegalRep"
                render={({ field }) => (
                    <FormItem className="space-y-3 p-4 border rounded-md">
                    <FormLabel>Does member have a legal representative? (e.g., power of attorney)</FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex items-center space-x-4">
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Unknown" /></FormControl><FormLabel className="font-normal">Unknown</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <div className="p-4 border rounded-md space-y-4">
                <h3 className="font-medium">Representative's Contact Info</h3>
                <p className="text-sm text-muted-foreground">If the member does not have a legal representative, please enter N/A in the following fields.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repName" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="repRelationship" render={({ field }) => (
                        <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repPhone" render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value ?? ''} /></FormControl><FormDescription>Format: (xxx) xxx-xxxx</FormDescription><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="repEmail" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
