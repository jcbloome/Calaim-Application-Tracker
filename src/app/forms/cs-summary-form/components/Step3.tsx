
'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { FormValues } from '../schema';

export default function Step3() {
  const { control, watch } = useFormContext<FormValues>();
  const healthPlan = watch('healthPlan');
  const pathway = watch('pathway');
  
  return (
    <div className="space-y-6">
       <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Health Plan</CardTitle>
          <CardDescription>Select the member's Managed Care Plan (MCP).</CardDescription>
          <p className="text-sm text-muted-foreground pt-2">
            Connections is contracted with the managed care plans (MCPs), Health Net and Kaiser, and member must be enrolled with either health plan or plan to switch to those plans to continue this application.
          </p>
        </CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="healthPlan"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Health Plan <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Kaiser" /></FormControl><FormLabel className="font-normal">Kaiser Permanente</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Health Net" /></FormControl><FormLabel className="font-normal">Health Net</FormLabel></FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Other" /></FormControl><FormLabel className="font-normal">Other</FormLabel></FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {healthPlan === 'Other' && (
            <div className="space-y-4 mt-4 p-4 border rounded-md bg-muted/50">
                <FormField
                    control={control}
                    name="existingHealthPlan"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name of existing health plan <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="switchingHealthPlan"
                    render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>Will member be switching Health Plan by end of month? <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value ?? undefined} className="flex items-center space-x-4">
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Yes" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="No" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                             <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-accent">
        <CardHeader>
          <CardTitle>Pathway & Eligibility</CardTitle>
          <CardDescription>Choose the pathway that best describes the member's situation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField
            control={control}
            name="pathway"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Pathway Selection <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col space-y-2">
                    <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="SNF Transition" /></FormControl>
                        <FormLabel className="font-normal">SNF Transition - For members currently in a Skilled Nursing Facility who want to move to a community setting.</FormLabel>
                    </FormItem>
                     <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="SNF Diversion" /></FormControl>
                        <FormLabel className="font-normal">SNF Diversion - For members at risk of SNF admission who can be safely cared for in the community.</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

            <div className="space-y-6">
                <div className="p-4 border rounded-md">
                    <h3 className="font-semibold text-lg">SNF Transition Eligibility Requirements</h3>
                    <p className="text-sm text-muted-foreground mt-1">Enables a current SNF resident to transfer to a RCFE or ARF.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                        <li>Has resided in a SNF for at least 60 consecutive days (which can include a combination of Medicare and Medi-Cal days and back and forth from SNF-hospital-SNF); and</li>
                        <li>Is willing to live in RCFE as an alternative to a SNF; and</li>
                        <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services.</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">(Members recently discharged from SNFs, with the 60-day consecutive stay requirement, should also be considered as SNF transition)</p>
                </div>
                <div className="p-4 border rounded-md">
                    <h3 className="font-semibold text-lg">SNF Diversion Eligibility Requirements</h3>
                    <p className="text-sm text-muted-foreground mt-1">Transition a member who, without this support, would need to reside in a SNF and instead transitions him/her to RCFE or ARF.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                        <li>Interested in remaining in the community; and</li>
                        <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services; and</li>
                        <li>Must be currently at medically necessary SNF level of care: e.g., require substantial help with activities of daily living (help with dressing, bathing, incontinence, etc.) or at risk of premature institutionalization; and meet the criteria to receive those services in RCFE or ARF.</li>
                    </ul>
                </div>

                <FormField
                    control={control}
                    name="meetsPathwayCriteria"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>All criteria for the selected pathway have been met. <span className="text-destructive">*</span></FormLabel>
                                <FormMessage />
                            </div>
                        </FormItem>
                    )}
                />
            </div>
          
            {pathway === 'SNF Diversion' && (
                <div className="space-y-4 p-4 border rounded-md">
                    <FormField
                        control={control}
                        name="snfDiversionReason"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Reason for SNF Diversion</FormLabel>
                             <FormDescription>
                                Reason for SNF Diversion must be included below if this is pathway selected.
                            </FormDescription>
                            <FormControl>
                                <Textarea {...field} value={field.value ?? ''} placeholder="Provide a brief explanation for why the member is at risk for institutionalization..." />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
