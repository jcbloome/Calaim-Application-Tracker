
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Printer, FileText, Info, FileQuestion, UploadCloud, FileSymlink, Package, AlertCircle, Send, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const individualForms = [
  {
    title: 'CS Member Summary Form',
    href: '/forms/cs-summary-form/printable',
    icon: FileText,
  },
  {
    title: 'Waivers & Authorizations',
    href: '/forms/waivers/printable',
    icon: FileText,
  },
  {
    title: 'Declaration of Eligibility',
    href: '/forms/declaration-of-eligibility/printable',
    icon: FileText,
  },
   {
    title: 'Acronym Glossary',
    href: '/forms/acronym-glossary/printable',
    icon: FileQuestion,
  },
  {
    title: 'Program Information Sheet',
    href: '/info/printable',
    icon: Info,
  },
];

const uploadableDocumentTypes = [
  "CS Member Summary",
  "Waivers & Authorizations",
  "Proof of Income",
  "LIC 602A - Physician's Report",
  "Medicine List",
  "Declaration of Eligibility",
  "SNF Facesheet",
  "Other",
];


export default function PrintablePackagePage() {
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [files, setFiles] = useState<FileList | null>(null);

    const handleUpload = (e: React.FormEvent) => {
        e.preventDefault();
        if (!files || files.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No files selected',
                description: 'Please select one or more documents to upload.',
            });
            return;
        }

        setIsUploading(true);
        // Simulate upload
        setTimeout(() => {
            setIsUploading(false);
            const fileNames = Array.from(files).map(f => f.name).join(', ');
            toast({
                title: 'Upload Successful',
                description: `Successfully uploaded ${fileNames}.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            // Reset form
            const form = e.target as HTMLFormElement;
            form.reset();
            setFiles(null);
        }, 2000);
    };

    const handleOpenPrintable = (href: string) => {
        window.open(href, '_blank', 'noopener,noreferrer');
    };

  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Printable Forms & Resources</h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-3xl mx-auto">
            Access printable versions of application forms, informational documents, or upload completed documents here.
          </p>
        </div>
        
        <div className="space-y-8">
            <Card className="border-primary border-2 shadow-lg">
                <CardHeader className="flex-row items-start gap-4">
                        <AlertCircle className="h-8 w-8 text-primary mt-1" />
                    <div>
                        <CardTitle className="text-primary">Important Note on Online Applications</CardTitle>
                        <CardDescription className="text-foreground/80 mt-2">
                           For the fastest and most secure experience, we strongly recommend completing the application through our online portal. Even if the CS Summary Form is uploaded, the information must be inputted online for quicker processing and application tracking.
                           <br/><br/>
                           1. Either print individual forms or select 2. The entire printable package.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex items-center justify-start gap-4">
                     <Button asChild className="w-full sm:w-auto" variant="default">
                        <Link href="/applications">Go to My Applications</Link>
                    </Button>
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Individual Forms & Resources</CardTitle>
                            <CardDescription>Print specific forms as needed or view informational sheets.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-1">
                            {individualForms.map((form) => (
                                <li key={form.title}>
                                    <Button
                                        variant="link"
                                        className="p-0 h-auto text-sm font-medium text-foreground hover:text-primary"
                                        onClick={() => handleOpenPrintable(form.href)}
                                    >
                                        {form.title}
                                    </Button>
                                </li>
                            ))}
                             <li className="pt-2 border-t mt-2">
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm font-bold text-primary"
                                    onClick={() => handleOpenPrintable('/forms/printable-package/full-package')}
                                >
                                    Print Full Application Package
                                </Button>
                            </li>
                          </ul>
                        </CardContent>
                    </Card>
                </div>

                <Card className="sticky top-28">
                    <CardHeader>
                        <CardTitle>Secure Upload Portal</CardTitle>
                        <CardDescription>If you've completed a printable form, you can upload it here. Please note this does not link it to a specific application automatically.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpload} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="uploader-first-name">Your First Name</Label>
                                    <Input id="uploader-first-name" required />
                                </div>
                                <div>
                                    <Label htmlFor="uploader-last-name">Your Last Name</Label>
                                    <Input id="uploader-last-name" required />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="member-name">Member's Full Name</Label>
                                <Input id="member-name" required />
                            </div>
                             <div>
                                <Label htmlFor="document-type">Name of Document</Label>
                                 <Select name="document-type" required>
                                    <SelectTrigger id="document-type">
                                        <SelectValue placeholder="Select document type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {uploadableDocumentTypes.map(docType => (
                                            <SelectItem key={docType} value={docType}>
                                                {docType}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="file-upload">Document File(s)</Label>
                                <Input id="file-upload" type="file" required onChange={(e) => setFiles(e.target.files)} multiple />
                            </div>
                            <Button type="submit" className="w-full" disabled={isUploading}>
                                {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Uploading...</> : <><UploadCloud className="mr-2 h-4 w-4" /> Upload Document</>}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

        </div>

      </main>
    </>
  );
}
