'use client';

import { Label } from '@/components/ui/label';
import { type Dispatch, type SetStateAction } from 'react';

export interface IntakeTypeSelectorProps {
  setIntakeType: Dispatch<SetStateAction<"standard" | "kaiser_auth_received_via_ils">>;
  setKaiserIlsPath: Dispatch<SetStateAction<"" | "single_auth" | "pull_from_mif">>;
  intakeType: "standard" | "kaiser_auth_received_via_ils";
  kaiserIlsPath: "" | "single_auth" | "pull_from_mif";
}

export function IntakeTypeSelector({
  setIntakeType,
  setKaiserIlsPath,
  intakeType,
  kaiserIlsPath,
}: IntakeTypeSelectorProps) {
  return (
    <div className="rounded-lg border-2 border-sky-600 bg-sky-50 p-4 shadow-sm space-y-3">
      <div>
        <Label className="text-base font-semibold text-sky-950">
          Intake Type — select one
        </Label>
        <p className="mt-1 text-sm text-sky-900/80">
          Choose how this application starts. You must pick <span className="font-medium">Option 1</span> or{' '}
          <span className="font-medium">Option 2</span> before continuing.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            setIntakeType('standard');
            setKaiserIlsPath('');
          }}
          className={`rounded-lg border-2 px-4 py-3 text-left transition-colors ${
            intakeType === 'standard'
              ? 'border-sky-700 bg-sky-700 text-white shadow-md'
              : 'border-sky-200 bg-white text-slate-900 hover:border-sky-400 hover:bg-sky-50'
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${
            intakeType === 'standard' ? 'text-sky-100' : 'text-sky-700'
          }`}>
            Option 1
          </div>
          <div className="mt-0.5 text-sm font-semibold">Standard CS Summary Intake</div>
          <div className={`mt-1 text-xs ${
            intakeType === 'standard' ? 'text-sky-100' : 'text-muted-foreground'
          }`}>
            Family/caregiver intake for a full CS Summary application.
          </div>
        </button>
        <button
          type="button"
          id="kaiser-auth-received-via-ils"
          onClick={() => setIntakeType('kaiser_auth_received_via_ils')}
          className={`rounded-lg border-2 px-4 py-3 text-left transition-colors scroll-mt-24 ${
            intakeType === 'kaiser_auth_received_via_ils'
              ? 'border-sky-700 bg-sky-700 text-white shadow-md'
              : 'border-sky-200 bg-white text-slate-900 hover:border-sky-400 hover:bg-sky-50'
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${
            intakeType === 'kaiser_auth_received_via_ils' ? 'text-sky-100' : 'text-sky-700'
          }`}>
            Option 2
          </div>
          <div className="mt-0.5 text-sm font-semibold">Kaiser Auth Received (via ILS)</div>
          <div className={`mt-1 text-xs ${
            intakeType === 'kaiser_auth_received_via_ils' ? 'text-sky-100' : 'text-muted-foreground'
          }`}>
            MIF consolidator / single-auth PDF workflow after Kaiser authorization.
          </div>
        </button>
      </div>
      {intakeType === 'standard' ? (
        <p className="text-xs text-sky-950/80">
          Option 1 selected — enter member and primary contact details for a standard CS Summary intake.
        </p>
      ) : (
        <>
          <p className="text-xs text-sky-950/80">
            Option 2 selected — creates an early tracking application with authorization already received.
            Supports staff assignment, task notifications, and optional early Caspio push.
          </p>
          <div className="rounded-md border-2 border-emerald-600/40 bg-white p-3 space-y-2">
            <div className="text-sm font-semibold text-sky-950">Next — select one</div>
            <p className="text-xs text-sky-900/80">
              How will you load this member? Pick <span className="font-medium">1) Upload Single Auth</span> or{' '}
              <span className="font-medium">2) Pull from MIF</span>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKaiserIlsPath('single_auth')}
                className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                  kaiserIlsPath === 'single_auth'
                    ? 'border-emerald-700 bg-emerald-600 text-white shadow-md'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100'
                }`}
              >
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${
                  kaiserIlsPath === 'single_auth' ? 'text-emerald-100' : 'text-emerald-700'
                }`}>
                  1) Upload Single Auth
                </div>
                <div className="mt-0.5 text-sm font-semibold">PDF authorization sheet</div>
                <div className={`mt-1 text-xs ${
                  kaiserIlsPath === 'single_auth' ? 'text-emerald-50' : 'text-emerald-900/70'
                }`}>
                  Parse one or more single-auth PDFs into the form.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setKaiserIlsPath('pull_from_mif')}
                className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                  kaiserIlsPath === 'pull_from_mif'
                    ? 'border-sky-700 bg-sky-700 text-white shadow-md'
                    : 'border-sky-200 bg-sky-50/80 text-sky-950 hover:border-sky-400 hover:bg-sky-100'
                }`}
              >
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${
                  kaiserIlsPath === 'pull_from_mif' ? 'text-sky-100' : 'text-sky-700'
                }`}>
                  2) Pull from MIF
                </div>
                <div className="mt-0.5 text-sm font-semibold">Consolidator / spreadsheet run</div>
                <div className={`mt-1 text-xs ${
                  kaiserIlsPath === 'pull_from_mif' ? 'text-sky-100' : 'text-sky-900/70'
                }`}>
                  Load a consolidated MIF run and pick a member to parse.
                </div>
              </button>
            </div>
            {!kaiserIlsPath ? (
              <p className="text-xs font-medium text-amber-800">
                Select Upload Single Auth or Pull from MIF to continue.
              </p>
            ) : kaiserIlsPath === 'single_auth' ? (
              <p className="text-xs text-emerald-900">
                Path 1 selected — use the Single Auth section below.
              </p>
            ) : (
              <p className="text-xs text-sky-900">
                Path 2 selected — use the Pull from MIF section below.
              </p>
            )}
          </div>
          <p className="text-xs font-medium text-blue-800">
            Workflow order: create skeleton draft first, then complete eligibility check and uploads from Quick Actions on the main application page.
          </p>
        </>
      )}
    </div>
  );
}
