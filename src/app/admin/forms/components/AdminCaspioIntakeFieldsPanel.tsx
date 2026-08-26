'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocumentReference } from 'firebase/firestore';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, Database, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDoc } from '@/firebase';
import {
  emptyCaspioIntakeFields,
  readCaspioIntakeFields,
  type CaspioIntakeFieldValues,
} from '@/lib/caspio-intake-fields';

type AdminCaspioIntakeFieldsPanelProps = {
  docRef: DocumentReference;
};

export function AdminCaspioIntakeFieldsPanel({ docRef }: AdminCaspioIntakeFieldsPanelProps) {
  const { toast } = useToast();
  const { data: application, isLoading } = useDoc<Record<string, unknown>>(docRef);
  const [fields, setFields] = useState<CaspioIntakeFieldValues>(emptyCaspioIntakeFields);
  const [savedFields, setSavedFields] = useState<CaspioIntakeFieldValues>(emptyCaspioIntakeFields);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!application) return;
    const loaded = readCaspioIntakeFields(application);
    setFields(loaded);
    setSavedFields(loaded);
  }, [application]);

  const isDirty = useMemo(
    () => JSON.stringify(fields) !== JSON.stringify(savedFields),
    [fields, savedFields]
  );

  const handleSave = useCallback(async () => {
    if (!docRef) return;
    setIsSaving(true);
    try {
      await setDoc(
        docRef,
        {
          Authorization_Number_T038: fields.Authorization_Number_T038 || null,
          Authorization_Start_T2038: fields.Authorization_Start_T2038 || null,
          Authorization_End_T2038: fields.Authorization_End_T2038 || null,
          Diagnostic_Code: fields.Diagnostic_Code || null,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setSavedFields(fields);
      toast({
        title: 'Caspio intake details saved',
        description: 'Authorization and diagnostic fields were saved separately from the CS Summary form.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: String(error?.message || 'Could not save Caspio intake details.'),
      });
    } finally {
      setIsSaving(false);
    }
  }, [docRef, fields, toast]);

  return (
    <Card className="mb-6 border-dashed border-primary/30 bg-muted/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <Database className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Caspio Intake Details (Admin Only)</CardTitle>
            <CardDescription>
              These fields are stored on the application for Caspio push. They are not part of the CS Member
              Summary form that members and families complete.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading intake details...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="admin-auth-number-t038">Authorization Number T038</Label>
                <Input
                  id="admin-auth-number-t038"
                  value={fields.Authorization_Number_T038}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      Authorization_Number_T038: event.target.value,
                    }))
                  }
                  placeholder="Kaiser authorization number (if available)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-diagnostic-code">Diagnostic Code</Label>
                <Input
                  id="admin-diagnostic-code"
                  value={fields.Diagnostic_Code}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      Diagnostic_Code: event.target.value,
                    }))
                  }
                  placeholder="Initial diagnosis code, if known"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-auth-start-t2038">Authorization Start T2038</Label>
                <Input
                  id="admin-auth-start-t2038"
                  value={fields.Authorization_Start_T2038}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      Authorization_Start_T2038: event.target.value,
                    }))
                  }
                  placeholder="MM/DD/YYYY"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-auth-end-t2038">Authorization End T2038</Label>
                <Input
                  id="admin-auth-end-t2038"
                  value={fields.Authorization_End_T2038}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      Authorization_End_T2038: event.target.value,
                    }))
                  }
                  placeholder="MM/DD/YYYY"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void handleSave()} disabled={!isDirty || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Caspio Intake Details'
                )}
              </Button>
              {!isDirty && !isSaving ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Intake details saved
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
