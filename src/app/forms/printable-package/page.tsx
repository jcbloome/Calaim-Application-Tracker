
'use client';

import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Printer, ArrowRight, ExternalLink, Download, FileUp, Send } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';

const forms = [
    { name: 'CS Member Summary', icon: FileText, href: '/forms/cs-summary-form/printable' },
    { name: 'Program Information & Acknowledgment', icon: FileText, href: '/info' },
    { name: 'HIPAA Authorization', icon: FileText, href: '/forms/hipaa-authorization/printable' },
    { name: 'Liability Waiver', icon: FileText, href: '/forms/liability-waiver/printable' },
    { name: 'Freedom of Choice Waiver', icon: FileText, href: '/forms/freedom-of-choice/printable' },
    { name: 'Declaration of Eligibility (for SNF Diversion only)', icon: FileText, href: '/forms/declaration-of-eligibility/printable' },
    { name: 'LIC 602A - Physician\'s Report', icon: ExternalLink, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf', target: '_blank' },
];

const uploadableDocs = [
  { id: 'cs-summary', name: 'CS Member Summary', downloadHref: '/forms/cs-summary-form/printable' },
  { id: 'hipaa', name: 'HIPAA Authorization', downloadHref: '/forms/hipaa-authorization/printable' },
  { id: 'liability-waiver', name: 'Liability Waiver', downloadHref: '/forms/liability-waiver/printable' },
  { id: 'freedom-of-choice', name: 'Freedom of Choice Waiver', downloadHref: '/forms/freedom-of-choice/printable' },
  { id: 'proof-of-income', name: 'Proof of Income (Social Security letter or 3 months bank statements)', downloadHref: null },
  { id: 'physicians-report', name: 'LIC 602A - Physician\'s Report', downloadHref: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
  { id: 'declaration', name: 'Declaration of Eligibility (for SNF Diversion only)', downloadHref: '/forms/declaration-of-eligibility/printable' },
  { id: 'med-list', name: 'Medicine List', downloadHref: null },
  { id: 'snf-facesheet', name: 'SNF Facesheet (for SNF Transition only)', downloadHref: null },
];


export default function ApplicationSubmissionPage() {
  const router = useRouter();

  const handlePrintPackage = () => {
    router.push('/forms/printable-package/full-package');
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
                        <Link href="/applications">
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
                        If you prefer to work offline, you can download the blank forms below, complete and sign them, and then upload them all through the secure portal at the bottom of this section. For security and HIPAA compliance do not email completed forms, instead use our secure upload portal below.
                    </p>

                    <Card className="bg-muted/30">
                        <CardHeader>
                            <CardTitle>Print Blank Forms</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground mb-4">Print individual forms:</p>
                                {forms.map((form) => (
                                    <Button key={form.name} variant="outline" className="w-full justify-start text-left bg-background" asChild>
                                      <Link href={form.href} target={form.target || '_self'}>
                                        <form.icon className="mr-2 h-4 w-4" />
                                        {form.name}
                                      </Link>
                                    </Button>
                                ))}
                                <div className="pt-4">
                                     <Button className="w-full" onClick={handlePrintPackage}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        Print Full Blank Application Package
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Secure Document Upload Portal</CardTitle>
                    <CardDescription>Use this form to securely upload your completed and signed documents without needing to log in.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-6">
                        <div className="p-4 border rounded-lg bg-slate-50">
                            <h3 className="font-semibold text-lg mb-4">Step 1: Provide Your Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Your Full Name</Label>
                                    <Input id="fullName" placeholder="John Doe" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Your Email Address</Label>
                                    <Input id="email" type="email" placeholder="john.doe@example.com" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="memberFullName">Member's Full Name</Label>
                                    <Input id="memberFullName" placeholder="Jane Smith" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mediCalNumber">Member's Medi-Cal or Medical Record Number</Label>
                                    <Input id="mediCalNumber" placeholder="987654321A or MRN" />
                                </div>
                            </div>
                             <div className="space-y-2 mt-6">
                                <Label htmlFor="healthPlan">Member's Health Plan</Label>
                                <Select>
                                    <SelectTrigger id="healthPlan">
                                        <SelectValue placeholder="Select a health plan" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="kaiser">Kaiser Permanente</SelectItem>
                                        <SelectItem value="health-net">Health Net</SelectItem>
                                        <SelectItem value="other">Other (Switching to Kaiser/Health Net)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="p-4 border rounded-lg bg-slate-50">
                             <h3 className="font-semibold text-lg mb-4">Step 2: Upload Documents</h3>
                             <p className="text-sm text-muted-foreground mb-6">
                                For each required document, click "Download" to get the blank form if needed, then "Upload File" to submit the completed version. You can upload multiple files for different documents before submitting.
                            </p>
                            <div className="space-y-4">
                                {uploadableDocs.map((doc) => (
                                    <div key={doc.id} className="p-3 border rounded-md bg-background">
                                        <Label className="font-medium text-base">{doc.name}</Label>
                                        <div className="flex flex-col sm:flex-row gap-2 mt-2">
                                            {doc.downloadHref && (
                                                 <Button asChild variant="secondary" className="flex-1">
                                                    <Link href={doc.downloadHref} target="_blank">
                                                        <Download className="mr-2 h-4 w-4" /> Download Blank Form
                                                    </Link>
                                                </Button>
                                            )}
                                            <div className="flex-1">
                                                <Label htmlFor={doc.id} className="flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                                                    <FileUp className="mr-2 h-4 w-4" />
                                                    <span>Upload File</span>
                                                </Label>
                                                <Input id={doc.id} type="file" className="sr-only" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                         <Button type="submit" className="w-full">
                            <Send className="mr-2 h-4 w-4" />
                            Submit Documents
                        </Button>
                    </form>
                </CardContent>
            </Card>

        </div>
      </main>
    </>
  );
}
