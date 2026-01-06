
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useEffect } from 'react';
import { type FormValues } from '../schema';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PhoneInput } from '@/components/ui/phone-input';


export default function Step1({ isAdminView }: { isAdminView?: boolean }) {
  const { control, watch, setValue, getValues, clearErrors } = useFormContext<FormValues>();
  
  const memberDob = watch('memberDob');
  const hasLegalRep = watch('hasLegalRep');

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
  
  useEffect(() => {
    const isSameAsPrimary = hasLegalRep === 'same_as_primary';
    
    if (isSameAsPrimary) {
        setValue('repFirstName', getValues('bestContactFirstName'));
        setValue('repLastName', getValues('bestContactLastName'));
        setValue('repRelationship', getValues('bestContactRelationship'));
        setValue('repPhone', getValues('bestContactPhone'));
        setValue('repEmail', getValues('bestContactEmail'));
        clearErrors(['repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail']);
    } else {
        const currentRepValues = {
            repFirstName: getValues('repFirstName'),
            repLastName: getValues('repLastName'),
            repRelationship: getValues('repRelationship'),
            repPhone: getValues('repPhone'),
            repEmail: getValues('repEmail'),
        };
        const bestContactValues = {
            repFirstName: getValues('bestContactFirstName'),
            repLastName: getValues('bestContactLastName'),
            repRelationship: getValues('bestContactRelationship'),
            repPhone: getValues('bestContactPhone'),
            repEmail: getValues('bestContactEmail'),
        };

        // Only clear if the values were previously auto-filled
        if (JSON.stringify(currentRepValues) === JSON.stringify(bestContactValues)) {
            setValue('repFirstName', '');
            setValue('repLastName', '');
            setValue('repRelationship', '');
            setValue('repPhone', '');
            setValue('repEmail', '');
        }
        
        if (hasLegalRep === 'different') {
          // You might want to trigger validation here if needed, but the main validation happens on submit
        } else {
          // Clear errors for other states
          clearErrors(['repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail']);
        }
    }

  }, [hasLegalRep, setValue, getValues, clearErrors]);
  
  const formatName = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();


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
                    <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
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
                    <Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} />
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
            <div className="flex gap-4">
               <FormField
                control={control}
                name="memberAge"
                render={({ field }) => (
                  <FormItem className="w-1/2">
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} type="number" readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                  control={control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Sex <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex pt-2 space-x-4">
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl><RadioGroupItem value="Male" /></FormControl>
                            <FormLabel className="font-normal">Male</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl><RadioGroupItem value="Female" /></FormControl>
                            <FormLabel className="font-normal">Female</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
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
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Your Information (Person Filling Form)</CardTitle>
           <CardDescription>This is the person that will receive email updates as to the application status, including any missing documents, etc.</CardDescription>
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
                    <Input {...field} value={field.value ?? ''} readOnly={!isAdminView} className={!isAdminView ? "bg-muted" : ""} onChange={e => field.onChange(formatName(e.target.value))}/>
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
                    <Input {...field} value={field.value ?? ''} readOnly={!isAdminView} className={!isAdminView ? "bg-muted" : ""} onChange={e => field.onChange(formatName(e.target.value))}/>
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value ?? ''} readOnly={!isAdminView} className={!isAdminView ? "bg-muted" : ""} />
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
                    <PhoneInput {...field} />
                  </FormControl>
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
                  <FormDescription>e.g., Son, POA, Self, etc.</FormDescription>
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
                      <FormItem><FormLabel>First Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={control} name="bestContactLastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={control} name="bestContactRelationship" render={({ field }) => (
                    <FormItem><FormLabel>Relationship <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={control} name="bestContactLanguage" render={({ field }) => (
                    <FormItem><FormLabel>Language <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={control} name="bestContactPhone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
                        <FormControl><PhoneInput {...field} /></FormControl>
                        <FormDescription>(xxx) xxx-xxxx</FormDescription>
                        <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={control} name="bestContactEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl>
                        <FormDescription>If no email, enter "N/A".</FormDescription>
                        <FormMessage />
                      </FormItem>
                  )} />
              </div>
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
                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactLastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="secondaryContactRelationship" render={({ field }) => (
                        <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactLanguage" render={({ field }) => (
                        <FormItem><FormLabel>Language</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="secondaryContactPhone" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><PhoneInput {...field} /></FormControl>
                            <FormDescription>(xxx) xxx-xxxx</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name="secondaryContactEmail" render={({ field }) => (
                       <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl>
                          <FormDescription>If no email, enter "N/A".</FormDescription>
                          <FormMessage />
                        </FormItem>
                    )} />
                </div>
            </div>
        </CardContent>
      </Card>
      
      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Legal Representative</CardTitle>
          <CardDescription>
            A legal representative (e.g., with Power of Attorney) might be distinct from a contact person. If the legal representative is also the primary or secondary contact, please enter their information again here to confirm their legal role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <FormField
                control={control}
                name="hasLegalRep"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Does member have a legal representative? <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex flex-col space-y-2">
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="notApplicable" /></FormControl><FormLabel className="font-normal">No, member has capacity and does not need legal representative</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="same_as_primary" /></FormControl><FormLabel className="font-normal">Yes, same as primary contact</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="different" /></FormControl><FormLabel className="font-normal">Yes, not same as primary contact (fill out below fields)</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="no_has_rep" /></FormControl><FormLabel className="font-normal">Member does not have capacity and does not have legal representative</FormLabel></FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
            
            <div className="p-4 border rounded-md space-y-4">
                <h3 className="font-medium">Representative's Contact Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repFirstName" render={({ field }) => (
                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={hasLegalRep === 'same_as_primary'} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name="repLastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={hasLegalRep === 'same_as_primary'} onChange={e => field.onChange(formatName(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField control={control} name="repRelationship" render={({ field }) => (
                    <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value ?? ''} disabled={hasLegalRep === 'same_as_primary'} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={control} name="repPhone" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><PhoneInput {...field} disabled={hasLegalRep === 'same_as_primary'} /></FormControl>
                            <FormDescription>(xxx) xxx-xxxx</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name="repEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" {...field} value={field.value ?? ''} disabled={hasLegalRep === 'same_as_primary'} /></FormControl>
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
