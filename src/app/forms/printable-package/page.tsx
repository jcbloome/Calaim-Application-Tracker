'use client';

import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Printer, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const forms = [
    { name: 'CS Member Summary', icon: FileText },
    { name: 'Program Information & Acknowledgment', icon: FileText },
    { name: 'HIPAA Authorization', icon: FileText },
    { name: 'Liability Waiver', icon: FileText },
    { name: 'Freedom of Choice Waiver', icon: FileText },
    { name: 'Declaration of Eligibility (for SNF Diversion only)', icon: FileText },
    { name: 'LIC 602A - Physician\'s Report', icon: ExternalLink },
];


export default function ApplicationSubmissionPage() {

  const handlePrint = () => {
    // This would ideally print a curated package of all forms.
    // For now, it can just print this page or a specific component.
    window.print();
  };

  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Application Submission Methods</h1>
                <p className="text-muted-foreground">There are two ways to submit your application documents. Please choose the one that works best for you.</p>
            </div>

            <Card className="border-green-500 border-2 bg-green-50/30">
                <CardHeader>
                    <CardTitle className="text-xl">1. Online Application (Recommended)</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-4">
                        This is the fastest and most direct way to submit your application. The CS Member Summary form can be downloaded, filled out and uploaded but since the data does need to be inputted through the online portal (by the Connections staff) consider using the online form for the quickest processing for the application.
                    </p>
                    <Button asChild>
                        <Link href="/forms/cs-summary-form">
                            Start Online Application <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">2. Manual Download & Upload</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-6">
                        If you prefer to work offline, you can download the blank forms below, complete and sign them, and then upload them all through the secure portal at the bottom of this section. <strong>Do not email completed forms;</strong> for security and HIPAA compliance, please only use the secure upload portal. If you have questions, you may email us at calaim@carehomefinders.com.
                    </p>

                    <Card className="bg-muted/30">
                        <CardHeader>
                            <CardTitle>Print Blank Forms</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground mb-4">Print individual forms:</p>
                                {forms.map((form) => (
                                    <Button key={form.name} variant="outline" className="w-full justify-start text-left bg-background">
                                        <form.icon className="mr-2 h-4 w-4" />
                                        {form.name}
                                    </Button>
                                ))}
                                <div className="pt-4">
                                     <Button className="w-full" onClick={handlePrint}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        Print Full Blank Application Package
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </CardContent>
            </Card>
        </div>
      </main>
    </>
  );
}
