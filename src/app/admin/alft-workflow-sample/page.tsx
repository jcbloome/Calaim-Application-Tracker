'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, CheckCircle2, Mail, RotateCcw } from 'lucide-react';

type FlowStep = {
  id: string;
  step: string;
  title: string;
  details: string;
  href: string;
  cta: string;
  roleLabel: string;
  defaultName: string;
  defaultEmail: string;
  colorClass: string;
  routeLabel: string;
};

const FLOW_STEPS: FlowStep[] = [
  {
    id: 'assigner',
    step: '1',
    title: 'Open verification tool',
    details: 'Staff opens verification tool and confirms all required prefill fields are correct for ALFT prefill.',
    href: '/admin/alft-assignment',
    cta: 'Open ALFT Intake Queue',
    roleLabel: 'Intake Staff',
    defaultName: 'Intake Staff',
    defaultEmail: 'intake@carehomefinders.com',
    colorClass: 'border-blue-500 bg-blue-50',
    routeLabel: 'Verification review before SW email send',
  },
  {
    id: 'verification_checkbox',
    step: '2',
    title: 'Verification checkbox sign-off',
    details: 'Staff checks verification checkbox with staff name and timestamp to confirm prefill is ready.',
    href: '/admin/alft-tracker',
    cta: 'Open ALFT Workflow Intake',
    roleLabel: 'Verified By',
    defaultName: 'Intake Staff',
    defaultEmail: 'intake@carehomefinders.com',
    colorClass: 'border-cyan-500 bg-cyan-50',
    routeLabel: 'Verification signer + timestamp captured',
  },
  {
    id: 'sw_email_preview',
    step: '3',
    title: 'Preview SW email',
    details: 'Review SW email content and confirm the preview does not include a manager queue link line.',
    href: '/admin/alft-tracker',
    cta: 'Open SW Email Preview',
    roleLabel: 'Intake Staff',
    defaultName: 'Intake Staff',
    defaultEmail: 'intake@carehomefinders.com',
    colorClass: 'border-sky-500 bg-sky-50',
    routeLabel: 'SW email preview approved',
  },
  {
    id: 'sw_email_send',
    step: '4',
    title: 'Send SW email with timestamp',
    details: 'Send SW email invite and capture timestamp for the send event.',
    href: '/admin/alft-tracker',
    cta: 'Send SW Notice',
    roleLabel: 'Intake Staff',
    defaultName: 'Intake Staff',
    defaultEmail: 'intake@carehomefinders.com',
    colorClass: 'border-indigo-500 bg-indigo-50',
    routeLabel: 'SW notice sent (timestamped)',
  },
  {
    id: 'social_worker_submit',
    step: '5',
    title: 'SW completes and signs',
    details: 'Social Worker completes ALFT and signs, then routes to ALTA manager (John) for first review.',
    href: '/admin/alft-tracker',
    cta: 'Track SW Submission',
    roleLabel: 'Social Worker',
    defaultName: 'Bob Wizard',
    defaultEmail: 'bob.wizard@carehomefinders.com',
    colorClass: 'border-emerald-500 bg-emerald-50',
    routeLabel: 'Submission routes to John first review',
  },
  {
    id: 'john_first_review',
    step: '6',
    title: 'John first review (approve/reject)',
    details: 'John reviews first and either approves or rejects with needed SW changes.',
    href: '/admin/alft-tracker',
    cta: 'Run First Review',
    roleLabel: 'ALTA Manager',
    defaultName: 'John',
    defaultEmail: 'john@carehomefinders.com',
    colorClass: 'border-amber-500 bg-amber-50',
    routeLabel: 'First review decision + timestamp',
  },
  {
    id: 'john_recheck_send_rn',
    step: '7',
    title: 'John re-check and send to RN',
    details: 'After SW corrections, John re-checks and sends packet to RN.',
    href: '/admin/alft-tracker',
    cta: 'Re-check and Send to RN',
    roleLabel: 'ALTA Manager',
    defaultName: 'John',
    defaultEmail: 'john@carehomefinders.com',
    colorClass: 'border-orange-500 bg-orange-50',
    routeLabel: 'Re-check complete before RN handoff',
  },
  {
    id: 'rn_review',
    step: '8',
    title: 'RN review, edits, and signature',
    details: 'RN reviews packet, makes edits if needed, and signs with timestamp.',
    href: '/admin/alft-tracker',
    cta: 'Run RN Review',
    roleLabel: 'RN',
    defaultName: 'Leslie (RN)',
    defaultEmail: 'rn@carehomefinders.com',
    colorClass: 'border-violet-500 bg-violet-50',
    routeLabel: 'RN sign-off complete',
  },
  {
    id: 'final_send',
    step: '9',
    title: 'Final review by Deydry/Jason',
    details: 'Deydry/Jason performs final review before final delivery.',
    href: '/admin/alft-tracker',
    cta: 'Run Final Review',
    roleLabel: 'Final Reviewer',
    defaultName: 'Deydry',
    defaultEmail: 'deydry@carehomefinders.com',
    colorClass: 'border-fuchsia-500 bg-fuchsia-50',
    routeLabel: 'Final review approval + timestamp',
  },
  {
    id: 'jocelyn_receive',
    step: '10',
    title: 'Send completed PDF to Jocelyn',
    details: 'Completed ALFT PDF is sent to Jocelyn and final send timestamp is recorded.',
    href: '/admin/alft-tracker',
    cta: 'Send Completed PDF',
    roleLabel: 'Final Receiver',
    defaultName: 'Jocelyn',
    defaultEmail: 'jocelyn@carehomefinders.com',
    colorClass: 'border-green-500 bg-green-50',
    routeLabel: 'Workflow completed',
  },
];

type RouteInput = Record<string, { name: string; email: string }>;

export default function AlftWorkflowSamplePage() {
  const initialInputs = useMemo<RouteInput>(
    () =>
      FLOW_STEPS.reduce<RouteInput>((acc, step) => {
        acc[step.id] = { name: step.defaultName, email: step.defaultEmail };
        return acc;
      }, {}),
    []
  );
  const [testerName, setTesterName] = useState('');
  const [testerEmail, setTesterEmail] = useState('');
  const [dummyMemberName, setDummyMemberName] = useState('Forrest Kendrick');
  const [memberInfoSource, setMemberInfoSource] = useState<'App CS Summary' | 'Caspio only'>('App CS Summary');
  const [finalManagerName, setFinalManagerName] = useState('Deydry/Jason');
  const [finalManagerEmail, setFinalManagerEmail] = useState('deydry@carehomefinders.com');
  const [routeInputs, setRouteInputs] = useState<RouteInput>(initialInputs);
  const [finishedSteps, setFinishedSteps] = useState<Set<string>>(new Set());
  const [eventLog, setEventLog] = useState<string[]>([]);

  const applyTesterToAll = () => {
    const name = testerName.trim();
    const email = testerEmail.trim().toLowerCase();
    if (!name && !email) return;
    setRouteInputs((prev) => {
      const next: RouteInput = { ...prev };
      FLOW_STEPS.forEach((step) => {
        next[step.id] = {
          name: name || prev[step.id]?.name || step.defaultName,
          email: email || prev[step.id]?.email || step.defaultEmail,
        };
      });
      return next;
    });
  };

  const updateRouteInput = (stepId: string, field: 'name' | 'email', value: string) => {
    setRouteInputs((prev) => ({
      ...prev,
      [stepId]: {
        name: prev[stepId]?.name || '',
        email: prev[stepId]?.email || '',
        [field]: value,
      },
    }));
  };

  const markStepProcessed = (step: FlowStep) => {
    const receiver = routeInputs[step.id] || { name: '', email: '' };
    const stepIndex = FLOW_STEPS.findIndex((s) => s.id === step.id);
    const nextStep = stepIndex >= 0 ? FLOW_STEPS[stepIndex + 1] : null;
    const nextTarget = nextStep
      ? `${routeInputs[nextStep.id]?.name || nextStep.defaultName} (${routeInputs[nextStep.id]?.email || nextStep.defaultEmail})`
      : 'Completed';
    setFinishedSteps((prev) => new Set([...prev, step.id]));
    setEventLog((prev) => [
      `${new Date().toLocaleTimeString()} - ${dummyMemberName}: Step ${step.step} processed by ${receiver.name || 'Unassigned'} (${receiver.email || 'no-email'}) -> next: ${nextTarget}`,
      `${new Date().toLocaleTimeString()} - ${dummyMemberName}: member info source = ${memberInfoSource}`,
      ...prev,
    ]);
  };

  const resetDemo = () => {
    setRouteInputs(initialInputs);
    setFinishedSteps(new Set());
    setEventLog([]);
    setTesterName('');
    setTesterEmail('');
    setDummyMemberName('Forrest Kendrick');
    setMemberInfoSource('App CS Summary');
    setFinalManagerName('Deydry/Jason');
    setFinalManagerEmail('deydry@carehomefinders.com');
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ALFT Dummy Pathway Tool</CardTitle>
            <Badge variant="outline">Kaiser Only</Badge>
          </div>
          <CardDescription>
            End-to-end dry-run with color-coded routing so one tester can simulate the full ALFT process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              className="h-9 rounded-md border px-3 text-sm"
              value={dummyMemberName}
              onChange={(e) => setDummyMemberName(e.target.value)}
              placeholder="Dummy member name"
            />
            <select
              className="h-9 rounded-md border px-3 text-sm"
              value={memberInfoSource}
              onChange={(e) => setMemberInfoSource(e.target.value as 'App CS Summary' | 'Caspio only')}
            >
              <option value="App CS Summary">Source: App CS Summary</option>
              <option value="Caspio only">Source: Caspio only</option>
            </select>
            <input
              className="h-9 rounded-md border px-3 text-sm"
              value={finalManagerName}
              onChange={(e) => setFinalManagerName(e.target.value)}
              placeholder="Final ALFT manager name"
            />
            <input
              className="h-9 rounded-md border px-3 text-sm"
              value={finalManagerEmail}
              onChange={(e) => setFinalManagerEmail(e.target.value)}
              placeholder="Final ALFT manager email"
            />
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Routing policy for this test flow: Intake verifies first, SW signs, John runs first review and re-check, RN signs, then Deydry/Jason final review before PDF send to Jocelyn.
          </div>
          <div className={`rounded-md border p-3 text-sm ${memberInfoSource === 'App CS Summary' ? 'border-green-300 bg-green-50 text-green-900' : 'border-blue-300 bg-blue-50 text-blue-900'}`}>
            {memberInfoSource === 'App CS Summary' ? 'Member info source in this flow: App CS Summary' : 'Member info source in this flow: Caspio only'}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Tester name (optional)"
              value={testerName}
              onChange={(e) => setTesterName(e.target.value)}
            />
            <input
              className="h-9 rounded-md border px-3 text-sm"
              placeholder="Tester email (optional)"
              value={testerEmail}
              onChange={(e) => setTesterEmail(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={applyTesterToAll} className="w-full">
                Apply to all steps
              </Button>
              <Button variant="outline" onClick={resetDemo} title="Reset pathway">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {FLOW_STEPS.map((item, idx) => {
          const person = routeInputs[item.id] || { name: '', email: '' };
          const done = finishedSteps.has(item.id);
          const nextStep = FLOW_STEPS[idx + 1];
          const nextName =
            item.id === 'rn_review'
              ? finalManagerName
              : nextStep
                ? routeInputs[nextStep.id]?.name || nextStep.defaultName
                : 'Completed';
          const nextEmail =
            item.id === 'rn_review'
              ? finalManagerEmail
              : nextStep
                ? routeInputs[nextStep.id]?.email || nextStep.defaultEmail
                : '';
          return (
            <div key={item.step} className="space-y-2">
          <Card className={`border-2 ${item.colorClass}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Badge className="min-w-6 justify-center">{item.step}</Badge>
                <CardTitle className="text-base">{item.title}</CardTitle>
                {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{item.details}</p>
              <div className="rounded-md border bg-white/80 p-2 text-xs font-medium">
                {item.routeLabel}
              </div>
              <div className="rounded-md border border-dashed bg-white/70 p-2 text-xs text-zinc-700">
                Next in line: {nextName || 'Unassigned'}{nextEmail ? ` (${nextEmail})` : ''}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="h-9 rounded-md border px-3 text-sm"
                  value={person.name}
                  onChange={(e) => updateRouteInput(item.id, 'name', e.target.value)}
                  placeholder={`${item.roleLabel} name`}
                />
                <input
                  className="h-9 rounded-md border px-3 text-sm"
                  value={person.email}
                  onChange={(e) => updateRouteInput(item.id, 'email', e.target.value)}
                  placeholder={`${item.roleLabel} email`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => markStepProcessed(item)}>
                  <Mail className="mr-2 h-4 w-4" />
                  Process step
                </Button>
                <Button asChild variant="outline">
                  <Link href={item.href}>{item.cta}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          {idx < FLOW_STEPS.length - 1 ? (
            <div className="flex justify-center text-muted-foreground">
              <ArrowDown className="h-5 w-5" />
            </div>
          ) : null}
          </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Processing Log</CardTitle>
          <CardDescription>Each simulated step writes a timestamped routing event.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps processed yet.</p>
          ) : (
            <div className="space-y-2">
              {eventLog.map((row, idx) => (
                <div key={`${row}-${idx}`} className="rounded-md border bg-muted/30 p-2 text-sm">
                  {row}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

