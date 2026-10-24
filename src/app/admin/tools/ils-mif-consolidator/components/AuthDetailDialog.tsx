'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Send } from 'lucide-react';
import { type IlsMifMasterRow } from '@/lib/ils-mif-parse';
import { type Dispatch, type SetStateAction } from 'react';

export interface AuthDetailDialogProps {
  authDetailRow: IlsMifMasterRow | null;
  setAuthDetailRow: Dispatch<SetStateAction<IlsMifMasterRow | null>>;
  copyText: (label: string, value: string) => Promise<void>;
  canPushAuthToCaspio: (row: IlsMifMasterRow) => boolean;
  pushingAuthRowId: string;
  pushAuthFieldsToCaspio: (row: IlsMifMasterRow) => Promise<void>;
}

export function AuthDetailDialog({
  authDetailRow,
  setAuthDetailRow,
  copyText,
  canPushAuthToCaspio,
  pushingAuthRowId,
  pushAuthFieldsToCaspio,
}: AuthDetailDialogProps) {
  return (
    <Dialog open={Boolean(authDetailRow)} onOpenChange={(open) => !open && setAuthDetailRow(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>MIF line → Caspio auth fields</DialogTitle>
          <DialogDescription>
            {authDetailRow
              ? `${authDetailRow.memberLastName}, ${authDetailRow.memberFirstName}`
              : 'Member'}{' '}
            · values from the MIF line for pasting into Caspio when auth is received.
          </DialogDescription>
        </DialogHeader>
        {authDetailRow ? (
          <div className="space-y-4 text-sm">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Source file:{' '}
              <span className="font-mono text-slate-900">{authDetailRow.sourceFileName || '—'}</span>
              {authDetailRow.memberMrn ? (
                <>
                  {' '}
                  · MRN <span className="font-mono text-slate-900">{authDetailRow.memberMrn}</span>
                </>
              ) : null}
              {authDetailRow.memberMediCalNum ? (
                <>
                  {' '}
                  · CIN <span className="font-mono text-slate-900">{authDetailRow.memberMediCalNum}</span>
                </>
              ) : null}
            </div>
            <div className="overflow-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Caspio field</th>
                    <th className="px-3 py-2">MIF value</th>
                    <th className="px-3 py-2">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      caspio: 'Authorization_Number_T038',
                      label: 'Auth number',
                      value: authDetailRow.authorizationNumberT2038,
                    },
                    {
                      caspio: 'Authorization_Start_T2038',
                      label: 'Auth start',
                      value: authDetailRow.authorizationStartT2038,
                    },
                    {
                      caspio: 'Authorization_End_T2038',
                      label: 'Auth end',
                      value: authDetailRow.authorizationEndT2038,
                    },
                    {
                      caspio: 'Date Received Request for Authorization (MIF)',
                      label: 'Date received request',
                      value: authDetailRow.dateReceivedRequestForAuthorization,
                    },
                    {
                      caspio: 'Date of Referral Authorization Decision (MIF)',
                      label: 'Referral decision date',
                      value: authDetailRow.dateOfReferralAuthorizationDecision,
                    },
                    {
                      caspio: 'connect_tbl_clientnotes',
                      label: 'Referring organization',
                      value: authDetailRow.referringOrganization,
                    },
                    {
                      caspio: 'connect_tbl_clientnotes',
                      label: 'Referring individual',
                      value: [
                        authDetailRow.careManagerName,
                        authDetailRow.careManagerPhone,
                        authDetailRow.careManagerEmail,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    },
                  ].map((field) => (
                    <tr key={`${field.caspio}-${field.label}`} className="border-t align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{field.label}</div>
                        <div className="font-mono text-[11px] text-slate-500">{field.caspio}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{field.value || '—'}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          disabled={!String(field.value || '').trim()}
                          onClick={() => void copyText(field.label, field.value || '')}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Copy these MIF auth values into Caspio and set CalAIM_Status to Authorized there, so the assigned
              staff are informed. Then use Refresh Caspio on the row to clear it from the update list.
            </p>
          </div>
        ) : null}
        <DialogFooter>
          {authDetailRow && canPushAuthToCaspio(authDetailRow) ? (
            <Button
              type="button"
              className="bg-fuchsia-700 hover:bg-fuchsia-800"
              disabled={Boolean(pushingAuthRowId)}
              onClick={() => {
                const row = authDetailRow;
                setAuthDetailRow(null);
                void pushAuthFieldsToCaspio(row);
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              Update Caspio (auth # + dates)
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setAuthDetailRow(null)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
