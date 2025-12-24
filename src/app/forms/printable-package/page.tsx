
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
            <Card className="border-primary border-2">
                <CardHeader className="flex-row items-center gap-4">
                        <AlertCircle className="h-8 w-8 text-primary" />
                    <CardTitle className="text-primary">Important Note on Online Applications</CardTitle>
                </CardHeader>
                <CardContent>
                    <CardDescription className="text-foreground/80 mb-4">
                        For the fastest and most secure experience, we strongly recommend completing the application through our online portal. Even if the CS Summary Form is uploaded, the information must be inputted online for quicker processing and application tracking. This ensures your data is saved as you go and allows for real-time status updates.
                    </CardDescription>
                    <Button asChild className="w-full sm:w-auto" variant="secondary">
                        <Link href="/applications">Go to My Applications</Link>
                    </Button>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-8">
                     <Card className="border-l-4 border-primary">
                        <CardHeader>
                            <CardTitle>Bundled Application Package</CardTitle>
                            <CardDescription>A single PDF containing all necessary forms and program information. Recommended for most users.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild className="w-full">
                                <Link href="/forms/printable-package/full-package" target="_blank" rel="noopener noreferrer">
                                <Printer className="mr-2 h-4 w-4" />
                                Print Full Package
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>

                     <Card>
                        <CardHeader>
                            <CardTitle>Individual Forms</CardTitle>
                            <CardDescription>Print specific forms as needed.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-3">
                            {individualForms.map((form) => {
                                const Icon = form.icon;
                                return (
                                  <li key={form.title}>
                                    <Link href={form.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-medium text-primary hover:underline underline-offset-4">
                                      <Icon className="h-4 w-4 text-muted-foreground" />
                                      {form.title}
                                    </Link>
                                  </li>
                                )
                            })}
                          </ul>
                        </CardContent>
                    </Card>
                </div>

                <Card>
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
