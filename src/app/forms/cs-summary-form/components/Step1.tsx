
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useEffect } from 'react';
import { type FormValues } from '../schema';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { PhoneInput } from '@/components/ui/phone-input';


export default function Step1() {
  const { control, watch, setValue } = useFormContext<FormValues>();
  
  const memberDob = watch('memberDob');

  useEffect(() => {
    if (memberDob && /^\d{2}\/\d{2}\/\d{4}$/.test(memberDob)) {
      const [month, day, year] = memberDob.split('/').map(Number);
      const birthDate = new Date(year, month - 1, day);

      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        setValue('memberAge', age);
      }
    }
  }, [memberDob, setValue]);

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
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} placeholder="MM/DD/YYYY" />
                  </FormControl>
                  <FormDescription>Must be in MM/DD/YYYY format.</FormDescription>
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
                            <Input {...field} type="text" value={field.value ?? ''} maxLength={9} />
                        </FormControl>
                        <FormDescription>This is a 9 digit number starting with 9.</FormDescription>
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
                            <Input {...field} type="text" value={field.value ?? ''} maxLength={9} />
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
                  <FormDescription>For Health Net use the same Medi-Cal number. For Kaiser this is not the Medi-Cal number but a distinct number oftentimes starting with some zeros.</FormDescription>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <FormField
                control={control}
                name="memberCounty"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>County <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
          </div>
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
                    <PhoneInput {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>(xxx) xxx-xxxx</FormDescription>
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
                  <FormDescription>If not applicable, leave blank.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Primary Contact Person</CardTitle>
          <CardDescription>Provide contact details for the member's main point of contact.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-md space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactFirstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={control} name="bestContactLastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
              <FormField control={control} name="bestContactRelationship" render={({ field }) => (
                  <FormItem><FormLabel>Relationship <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactPhone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
                        <FormControl><PhoneInput {...field} value={field.value ?? ''} /></FormControl>
                        <FormDescription>(xxx) xxx-xxxx</FormDescription>
                        <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={control} name="bestContactEmail" render={({ field }) => (
                      <FormItem><FormLabel>Email <span className="text-destructive">*</span></FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
              <FormField control={control} name="bestContactLanguage" render={({ field }) => (
                  <FormItem><FormLabel>Language <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
            <CardTitle>Secondary Contact Person (Optional)</CardTitle>
            <CardDescription>Provide details for a secondary point of contact if available.</CardDescription>
        </CardHeader>
        <CardContent>
             <div className="p-4 border rounded-md space-y-4 mt-2">
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
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><PhoneInput {...field} value={field.value ?? ''} /></FormControl>
                            <FormDescription>(xxx) xxx-xxxx</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactEmail" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField control={control} name="secondaryContactLanguage" render={({ field }) => (
                    <FormItem><FormLabel>Language</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
            </div>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Legal Representative</CardTitle>
          <CardDescription>
            Information about legal capacity and representation. A legal representative (e.g., with Power of Attorney) is distinct from a contact person.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <FormField
                control={control}
                name="hasCapacity"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Does member have capacity to make their own decisions? <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                        <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <div className="p-4 border rounded-md space-y-4">
                <h3 className="font-medium">Representative's Contact Info</h3>
                 <FormField
                    control={control}
                    name="isRepPrimaryContact"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Is the Legal Rep also the Primary Contact?</FormLabel>
                        </div>
                        </FormItem>
                    )}
                />
                 <FormField
                    control={control}
                    name="hasLegalRep"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                        <FormLabel>
                            Does member have a legal representative? (e.g., power of attorney)
                        </FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex items-center space-x-4">
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Unknown" /></FormControl><FormLabel className="font-normal">Unknown</FormLabel></FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormDescription>If the member does not have a legal representative, you can leave these fields blank.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repFirstName" render={({ field }) => (
                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="repLastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField control={control} name="repRelationship" render={({ field }) => (
                    <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repPhone" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><PhoneInput {...field} value={field.value ?? ''} /></FormControl>
                            <FormDescription>(xxx) xxx-xxxx</FormDescription>
                            <FormMessage />
                        </FormItem>
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
