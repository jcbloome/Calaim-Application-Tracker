
'use client';

import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, FileWarning, PenSquare, ArrowLeft, Trash2, Send, Loader2 } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Application } from '@/lib/definitions';
import { applications as mockApplications } from '@/lib/data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CsSummaryView } from './CsSummaryView';


// This is a temporary solution for the demo to find the mock application data
// In a real app, you would fetch this from a central 'applications' collection or use a backend search function.
const getMockApplicationById = (id: string): (Application & { [key: string]: any }) | undefined => {
  const app = mockApplications.find(app => app.id === id);
  if (app) {
      // For the demo, let's just create a more complete object.
      // In a real app this data would come from firestore.
      return { 
        ...app, 
        memberName: app.memberName,
        memberFirstName: app.memberName?.split(' ')[0] || '',
        memberLastName: app.memberName?.split(' ')[1] || '',
        memberDob: new Date(1980, 1, 1),
        memberAge: 44,
        memberMediCalNum: '91234567A',
        memberMrn: 'MRN12345',
        memberLanguage: 'English',
        memberCounty: 'Los Angeles',
        referrerFirstName: 'Jason',
        referrerLastName: 'Bloome',
        referrerEmail: 'jason@carehomefinders.com',
        referrerPhone: '(555) 123-4567',
        referrerRelationship: 'Social Worker',
        agency: 'Care Home Finders',
        bestContactType: 'other',
        bestContactFirstName: 'Contact',
        bestContactLastName: 'Person',
        bestContactRelationship: 'Family Member',
        bestContactPhone: '(555) 555-5555',
        bestContactEmail: 'contact@example.com',
        bestContactLanguage: 'English',
        currentLocation: 'SNF',
        currentAddress: '123 Nursing Way',
        currentCity: 'Healthville',
        currentState: 'CA',
        currentZip: '90210',
        currentCounty: 'Los Angeles',
      };
  }
  return undefined;
};


export default function AdminApplicationDetailPage() {
  const params = useParams();
  const { id } = params as { id: string };
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  // In a real app, you'd likely fetch the application from a root collection
  // or have a more robust way to get the userId. For this demo, we find it from mock data.
  const application = useMemo(() => {
    if (!id) return undefined;
    return getMockApplicationById(id);
  }, [id]);

  const handleSendToCaspio = async () => {
    const webhookUrl = 'https://hook.us2.make.com/mqif1rouo1wh762k2eze1y7568gwq6kx';
    
    if (!application) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Application data is not available to send.',
        });
        return;
    }

    setIsSending(true);

    try {
        // This part is tricky without knowing the real user ID.
        // We will send the mock data for the demo.
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(application),
        });

        if (!response.ok) {
            throw new Error(`Webhook server responded with status ${response.status}.`);
        }

        toast({
            title: 'Success!',
            description: 'Application data has been sent to Caspio.',
            className: 'bg-green-100 text-green-900 border-green-200',
        });
    } catch (err: any) {
        toast({
            variant: 'destructive',
            title: 'Webhook Error',
            description: err.message || 'Failed to send data to Caspio.',
        });
    } finally {
        setIsSending(false);
    }
  };

  if (!application) {
    // If the ID was present but no application was found, show not found.
    if (id) {
      notFound();
    }
    // If there's no ID yet (e.g. during initial render), show a loader or nothing
    return <div>Loading...</div>;
  }

  console.log('Application data being passed to summary view:', application);

  const completedForms = application.forms.filter(f => f.status === 'Completed').length;
  const totalForms = application.forms.length;
  const progress = totalForms > 0 ? (completedForms / totalForms) * 100 : 0;

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <Button asChild variant="outline">
                <Link href="/admin/applications">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to All Applications
                </Link>
            </Button>
            <div className="flex gap-2">
                 <Button onClick={handleSendToCaspio} disabled={isSending}>
                    {isSending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="mr-2 h-4 w-4" />
                    )}
                    Send to Caspio
                </Button>
                <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Application
                </Button>
            </div>
        </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">Application: {application.id}</CardTitle>
              <CardDescription>
                Member: <strong>{application.memberName}</strong> | Pathway: <strong>{application.pathway}</strong> | Status: <strong>{application.status}</strong>
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">Completion</p>
              <p className="text-2xl font-bold">{Math.round(progress)}%</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={progress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forms & Documents</CardTitle>
          <CardDescription>Review submitted materials and request revisions if needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {application.forms.map(form => (
              <div key={form.name} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-4">
                  {form.status === 'Completed' ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <PenSquare className="h-6 w-6 text-yellow-500" />
                  )}
                  <div>
                    <p className="font-medium">{form.name}</p>
                    <p className="text-sm text-muted-foreground">Type: {form.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">View</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                            <DialogHeader>
                                <DialogTitle>CS Member Summary: Read-Only</DialogTitle>
                            </DialogHeader>
                            <CsSummaryView application={application} />
                        </DialogContent>
                    </Dialog>
                    <Button variant="secondary" size="sm">
                        <FileWarning className="mr-2 h-4 w-4" />
                        Request Revision
                    </Button>
                </div>
              </div>
            ))}
            {application.forms.length === 0 && (
                <div className="text-center p-8 text-muted-foreground">No forms required for this pathway yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
