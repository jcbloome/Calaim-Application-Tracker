
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
import { useUser, useStorage } from '@/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    title: 'Room and Board Obligation Statement',
    href: '/forms/room-board-obligation',
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
  "Room and Board Obligation Statement",
  "Proof of Income",
  "LIC 602A - Physician's Report",
  "Medicine List",
  "Declaration of Eligibility",
  "SNF Facesheet",
  "Other",
];


export default function PrintablePackagePage() {
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);
    const [files, setFiles] = useState<FileList | null>(null);
    const [documentType, setDocumentType] = useState<string>('');
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!files || files.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No files selected',
                description: 'Please select one or more documents to upload.',
            });
            return;
        }

        if (!documentType) {
            toast({
                variant: 'destructive',
                title: 'Document type required',
                description: 'Please select the type of document you are uploading.',
            });
            return;
        }

        if (!user) {
            toast({
                variant: 'destructive',
                title: 'Authentication required',
                description: 'Please sign in to upload documents.',
            });
            return;
        }

        if (!storage) {
            toast({
                variant: 'destructive',
                title: 'Upload service unavailable',
                description: 'File upload service is not available. Please try again later.',
            });
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const uploadPromises = Array.from(files).map((file, index) => {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const storagePath = `standalone_uploads/${user.uid}/${documentType}/${timestamp}_${file.name}`;
                const storageRef = ref(storage, storagePath);

                return new Promise<{fileName: string, downloadURL: string}>((resolve, reject) => {
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            // Update progress for the current file (simplified for multiple files)
                            setUploadProgress(Math.round(progress));
                        },
                        (error) => {
                            console.error("Upload failed:", error);
                            reject(error);
                        },
                        async () => {
                            try {
                                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                resolve({ fileName: file.name, downloadURL });
                            } catch (error) {
                                reject(error);
                            }
                        }
                    );
                });
            });

            const results = await Promise.all(uploadPromises);
            const fileNames = results.map(r => r.fileName).join(', ');
            
            toast({
                title: 'Upload Successful',
                description: `Successfully uploaded ${fileNames} as ${documentType}.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });

            // Reset form
            const form = e.target as HTMLFormElement;
            form.reset();
            setFiles(null);
            setDocumentType('');
            setUploadProgress(0);

        } catch (error: any) {
            console.error('Upload error:', error);
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: error.message || 'Failed to upload files. Please try again.',
            });
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handlePrint = (href: string) => {
        // Use window.open to bypass development environment URL issues
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
                                        onClick={() => handlePrint(form.href)}
                                    >
                                        {form.title}
                                    </Button>
                                </li>
                            ))}
                             <li className="pt-2 border-t mt-2">
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm font-bold text-primary"
                                    onClick={() => handlePrint('/forms/printable-package/full-package')}
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
                        <CardTitle>Document Upload & Processing</CardTitle>
                        <CardDescription>Upload completed forms individually for processing and tracking.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!user && !isUserLoading && (
                            <Alert className="mb-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    You need to sign in to upload documents. <Link href="/auth/signin" className="underline text-blue-600">Sign in here</Link>.
                                </AlertDescription>
                            </Alert>
                        )}
                        
                        {isUserLoading && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                <span>Checking authentication...</span>
                            </div>
                        )}

                        {user && (
                            <div className="space-y-4">
                                    <form onSubmit={handleUpload} className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-blue-800">
                                            <p className="font-medium mb-1">Signed in as: {user.email}</p>
                                            <p>Your uploaded documents will be associated with your account for easy tracking.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {isUploading && uploadProgress > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span>Uploading...</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div 
                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                                style={{ width: `${uploadProgress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}
                                
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
                                    <Select value={documentType} onValueChange={setDocumentType} required>
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
                                    <Input 
                                        id="file-upload" 
                                        type="file" 
                                        required 
                                        onChange={(e) => setFiles(e.target.files)} 
                                        multiple 
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    />
                                    <p className="text-sm text-gray-500 mt-1">
                                        Accepted formats: PDF, Word documents, Images (JPG, PNG)
                                    </p>
                                </div>
                                <Button type="submit" className="w-full" disabled={isUploading || !documentType}>
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin"/> 
                                            Uploading... {uploadProgress}%
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="mr-2 h-4 w-4" /> 
                                            Upload Document
                                        </>
                                    )}
                                </Button>
                            </form>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

        </div>

      </main>
    </>
  );
}
