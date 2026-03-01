import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MapPin, ClipboardCheck, Users, FileBarChart, DollarSign } from 'lucide-react';

export default function SWInstructionsPage() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Social Worker Portal Instructions</h1>
        <p className="text-sm text-muted-foreground">
          Quick guide for monthly questionnaires, RCFE sign-off, and claim submission.
        </p>
      </div>

      <Alert>
        <AlertDescription className="flex items-start gap-2">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Geolocation is required for sign-off.</div>
            <div className="text-sm text-muted-foreground">
              The MSW must allow location services in the browser/app when completing Sign Off.
            </div>
          </div>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">1</Badge>
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              SW Assignments (RCFEs + members)
            </span>
          </CardTitle>
          <CardDescription>See your assigned RCFEs and the members at each RCFE.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Open <strong>SW Assignments</strong> to view your RCFE list and member roster.</li>
            <li>Use this list as your source of truth for which homes/members you’re assigned to visit.</li>
          </ul>
          <Button asChild variant="outline">
            <Link href="/sw-portal/roster">Open SW Assignments</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">2</Badge>
            <span className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Monthly Questionnaire (visit verification)
            </span>
          </CardTitle>
          <CardDescription>Select an RCFE, then select a member to complete the short questionnaire.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Select the RCFE you’re visiting.</li>
            <li>Select the member from the list to start or continue their questionnaire draft.</li>
            <li>Complete the questionnaire and save the draft.</li>
          </ul>
          <Button asChild>
            <Link href="/sw-visit-verification">Start Monthly Questionnaire</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">3</Badge>
            Next member at the same RCFE
          </CardTitle>
          <CardDescription>After saving a draft for a member, continue to the next member at the home.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li>After a member is visited and their draft is saved, choose <strong>Next member</strong>.</li>
            <li>Repeat until all visits for the RCFE are complete.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">4</Badge>
            <span className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4" />
              RCFE staff Sign Off (visit attestation)
            </span>
          </CardTitle>
          <CardDescription>
            When you’re done visiting members at the RCFE, request staff attestation and submit the claim.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Open <strong>Sign Off</strong> for the RCFE/day.</li>
            <li>Staff selects the members visited (drafts) and provides name/signature.</li>
            <li>
              Capture geolocation at sign-off time. If location is blocked, sign-off may fail or be incomplete.
            </li>
            <li>Submit questionnaires &amp; claim.</li>
          </ul>
          <Button asChild variant="outline">
            <Link href="/sw-portal/sign-off">Open Sign Off</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">5</Badge>
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Submit Claims + track status
            </span>
          </CardTitle>
          <CardDescription>Submit from your list and track claim status (submitted vs not-submitted, etc.).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Go to <strong>Submit Claims</strong> to view items ready to submit.</li>
            <li>Track claim status in the portal (e.g., submitted / not submitted / paid when available).</li>
          </ul>
          <Button asChild variant="outline">
            <Link href="/sw-portal/submit-claims">Open Submit Claims</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

