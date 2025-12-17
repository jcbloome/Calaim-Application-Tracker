
'use client';

import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Printer, ArrowRight, ExternalLink, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const forms = [
    { name: 'Program Information', icon: FileText, href: '/info' },
    { name: 'CS Member Summary', icon: FileText, href: '/forms/cs-summary-form/printable' },
    { name: 'Acronym Glossary', icon: BookOpen, href: '/forms/acronym-glossary/printable' },
    { name: 'Waivers & Authorizations (HIPAA, Liability, FOC)', icon: FileText, href: '/forms/waivers/printable' },
    { name: 'Declaration of Eligibility', description: 'For SNF Diversion only', icon: FileText, href: '/forms/declaration-of-eligibility/printable' },
    { name: "LIC 602A - Physician's Report", icon: ExternalLink, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf', target: '_blank', download: true },
];


export default function ApplicationSubmissionPage() {
  const router = useRouter();

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
                        This is the fastest and most direct way to submit your application. It guides you through all the necessary steps and allows for secure document uploads.
                    </p>
                    <Button asChild>
                        <Link href="/applications">
                            Go to My Applications <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">2. Manual Download & Print</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-6">
                        If you prefer to work offline, you can download and print the blank forms below. For security and HIPAA compliance, please do not email completed forms. Instead, start an online application and use our secure upload portal.
                    </p>

                    <Card className="bg-muted/30">
                        <CardHeader>
                            <CardTitle>Print Blank Forms</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground mb-4">Print individual forms:</p>
                                {forms.map((form) => (
                                    <Button key={form.name} variant="outline" className="w-full justify-start text-left bg-background h-auto" asChild>
                                      <Link href={form.href} target={form.target || '_self'} download={!!form.download}>
                                        <div className='flex items-start py-2'>
                                            <form.icon className="mr-2 h-4 w-4 mt-1" />
                                            <div>
                                                <span>{form.name}</span>
                                                {form.description && <p className='text-xs text-muted-foreground'>{form.description}</p>}
                                            </div>
                                        </div>
                                      </Link>
                                    </Button>
                                ))}
                                <div className="pt-4">
                                     <Button className="w-full" onClick={() => window.print()}>
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
