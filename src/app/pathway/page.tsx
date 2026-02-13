
'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  X,
  FileText,
  Package,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { doc, setDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

const getPathwayRequirements = (pathway: 'SNF Transition' | 'SNF Diversion') => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/forms/cs-summary-form/review', icon: FileText },
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the consolidated HIPAA, Liability, and Freedom of Choice waiver form.', type: 'online-form', href: '/forms/waivers', icon: FileText },
    { id: 'room-board-obligation', title: 'Room and Board Commitment', description: 'Complete and sign this required financial commitment form online.', type: 'online-form', icon: FileText, href: '/forms/room-board-obligation' },
    { id: 'proof-of-income', title: 'Proof of Income', description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'Upload', icon: UploadCloud, href: '#' },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'Upload', icon: Printer, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'Upload', icon: UploadCloud, href: '#' },
  ];
  
  if (pathway === 'SNF Diversion') {
    return [
      ...commonRequirements,
      { id: 'declaration-of-eligibility', title: 'Declaration of Eligibility', description: "Required for SNF Diversion. Download, have it signed by a PCP, and upload. Note: This form is not required for any Kaiser members.", type: 'Upload', icon: Printer, href: '/forms/declaration-of-eligibility/printable' },
    ];
  }
  
  // SNF Transition
  return [
      ...commonRequirements,
      { id: 'snf-facesheet', title: 'SNF Facesheet', description: "Upload the resident's facesheet from the Skilled Nursing Facility.", type: 'Upload', icon: UploadCloud, href: '#' },
  ];
};

function StatusIndicator({ status }: { status: FormStatusType['status'] }) {
    const isCompleted = status === 'Completed';
    return (
      <div className={cn(
        "flex items-center gap-2 text-sm font-medium",
        isCompleted ? 'text-green-600' : 'text-orange-500'
      )}>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <div className="h-5 w-5 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full border-2 border-current" />
          </div>
        )}
        <span>{isCompleted ? 'Completed' : 'Pending'}</span>
      </div>
    );
}

function PathwayPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applicationId = searchParams.get('applicationId');
  const { user, isUserLoading } = useUser();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const firestore = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const enhancedToast = useEnhancedToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [consolidatedUploadChecks, setConsolidatedUploadChecks] = useState({
    'LIC 602A - Physician\'s Report': false,
    'Medicine List': false,
    'SNF Facesheet': false,
  });

  const isAdminCreatedApp = applicationId?.startsWith('admin_app_');
  
  const docRef = useMemoFirebase(() => {
    if (!firestore || !applicationId) return null;
    
    // Admin-created applications are stored directly in the applications collection
    if (isAdminCreatedApp) {
      return doc(firestore, 'applications', applicationId);
    }
    
    // Regular user applications are stored in user subcollections
    if (!user) return null;
    return doc(firestore, `users/${user.uid}/applications`, applicationId);
  }, [firestore, applicationId, user, isAdminCreatedApp]);

  useEffect(() => {
    if (!docRef) {
      if (!isUserLoading || isAdminCreatedApp) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setApplication({ id: docSnap.id, ...docSnap.data() } as Application);
      } else {
        setApplication(null);
        setError(new Error("Application not found or you don't have access."));
      }
      setIsLoading(false);
    }, (err) => {
      console.error(err);
      setError(err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [docRef, isUserLoading]);

  useEffect(() => {
    if (!isLoading && !application && (!isUserLoading || isAdminCreatedApp)) {
      // For admin-created applications, redirect to admin applications page
      if (isAdminCreatedApp) {
        router.push('/admin/applications');
      } else {
        router.push('/applications');
      }
    }
  }, [isLoading, application, isUserLoading, router, isAdminCreatedApp]);

  useEffect(() => {
    if (application && docRef && application.pathway && (!application.forms || application.forms.length === 0)) {
        const pathwayRequirements = getPathwayRequirements(application.pathway as 'SNF Transition' | 'SNF Diversion');
        const initialForms: FormStatusType[] = pathwayRequirements.map(req => ({
            name: req.title,
            status: 'Pending',
            type: req.type as FormStatusType['type'],
            href: req.href || '#',
        }));

        const summaryIndex = initialForms.findIndex(f => f.name === 'CS Member Summary');
        if (summaryIndex !== -1) {
            initialForms[summaryIndex].status = 'Completed';
        }

        setDoc(docRef, { forms: initialForms }, { merge: true });
    }
  }, [application, docRef]);

  const handleFormStatusUpdate = async (updates: Partial<FormStatusType>[]) => {
      if (!docRef || !application) return;

      const existingForms = new Map(application.forms?.map(f => [f.name, f]) || []);
      
      updates.forEach(update => {
          const existingForm = existingForms.get(update.name!);
          if (existingForm) {
              existingForms.set(update.name!, { ...existingForm, ...update });
          }
      });

      const updatedForms = Array.from(existingForms.values());
      const pendingDocReviewCount = updatedForms.filter((form: any) => {
        const isCompleted = form?.status === 'Completed';
        const name = String(form?.name || '').trim();
        const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
        const acknowledged = Boolean(form?.acknowledged);
        return isCompleted && !isSummary && !acknowledged;
      }).length;
      
      try {
          await setDoc(docRef, {
              forms: updatedForms,
              lastUpdated: serverTimestamp(),
              // Track new document uploads for dashboard
              hasNewDocuments: true,
              newDocumentCount: updates.length,
              lastDocumentUpload: serverTimestamp(),
              // Derived fields for staff review workflows
              pendingDocReviewCount,
              pendingDocReviewUpdatedAt: serverTimestamp(),
          }, { merge: true });
      } catch (e: any) {
          console.error("Failed to update form status:", e);
          enhancedToast.error('Update Error', 'Could not update form status.');
      }
  };

  const doUpload = async (files: File[], requirementTitle: string) => {
      console.log('doUpload called with:', { 
        fileCount: files.length, 
        requirementTitle,
        hasUser: !!user?.uid, 
        hasApplicationId: !!applicationId, 
        hasStorage: !!storage,
        hasFirestore: !!firestore
      });

      if (!user?.uid || !applicationId || !storage) {
        console.error('Upload prerequisites not met:', { 
          hasUser: !!user?.uid, 
          hasApplicationId: !!applicationId, 
          hasStorage: !!storage,
          userEmail: user?.email
        });
        throw new Error('Upload service not available. Please refresh the page and try again.');
      }

      if (files.length === 0) {
        throw new Error('No files selected for upload.');
      }

      const file = files[0];
      
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the maximum limit of 10MB.`);
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`File type "${file.type}" is not supported. Please upload PDF, Word documents, or images (JPG, PNG).`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const storagePath = `user_uploads/${user.uid}/${applicationId}/${requirementTitle}/${timestamp}_${file.name}`;
      
      console.log('Creating storage reference:', storagePath);
      console.log('File info:', { name: file.name, size: file.size, type: file.type });
      
      const storageRef = ref(storage, storagePath);

      return new Promise<{ downloadURL: string, path: string }>((resolve, reject) => {
            console.log('Starting upload task for file:', file.name, 'Size:', file.size, 'Type:', file.type);
            console.log('Storage instance details:', {
                app: storage.app.name,
                bucket: storage.app.options.storageBucket,
                project: storage.app.options.projectId
            });
            console.log('User details:', {
                uid: user.uid,
                email: user.email,
                isAnonymous: user.isAnonymous
            });
            
            // Add timeout to prevent hanging uploads
            const uploadTimeout = setTimeout(() => {
                console.error('Upload timeout after 5 minutes');
                reject(new Error('Upload timeout - please try again with a smaller file'));
            }, 5 * 60 * 1000); // 5 minutes

            console.log('Creating uploadBytesResumable task...');
            const uploadTask = uploadBytesResumable(storageRef, file);
            console.log('Upload task created successfully:', uploadTask);

          uploadTask.on('state_changed',
              (snapshot) => {
                  const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                  console.log(`Upload progress for ${requirementTitle}: ${progress}% (${snapshot.bytesTransferred}/${snapshot.totalBytes} bytes)`);
                  console.log('Upload state:', snapshot.state);
                  setUploadProgress(prev => ({ ...prev, [requirementTitle]: progress }));
              },
              (error) => {
                  console.error("Upload failed:", error);
                  console.error("Error code:", error.code);
                  console.error("Error message:", error.message);
                  clearTimeout(uploadTimeout);
                  
                  // Provide more specific error messages
                  let errorMessage = 'Upload failed. Please try again.';
                  if (error.code === 'storage/unauthorized') {
                      errorMessage = 'Upload permission denied. Please check your authentication.';
                  } else if (error.code === 'storage/canceled') {
                      errorMessage = 'Upload was canceled.';
                  } else if (error.code === 'storage/unknown') {
                      errorMessage = 'Unknown upload error. Please check your internet connection.';
                  } else if (error.code === 'storage/quota-exceeded') {
                      errorMessage = 'Storage quota exceeded. Please contact support.';
                  }
                  
                  reject(new Error(errorMessage));
              },
              async () => {
                  try {
                      clearTimeout(uploadTimeout);
                      console.log('Upload completed, getting download URL...');
                      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                      console.log('Download URL obtained:', downloadURL);
                      resolve({ downloadURL, path: storagePath });
                  } catch (error: any) {
                      console.error('Error getting download URL:', error);
                      clearTimeout(uploadTimeout);
                      reject(new Error(`Failed to get download URL: ${error.message}`));
                  }
              }
          );
      });
  };






  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, requirementTitle: string) => {
    if (!event.target.files?.length || !user?.uid) {
      console.log('Upload blocked:', { 
        hasFiles: !!event.target.files?.length, 
        hasUser: !!user?.uid,
        userEmail: user?.email 
      });
      if (!user?.uid) {
        toast({ 
          variant: 'destructive', 
          title: 'Authentication Required', 
          description: 'Please sign in to upload files.' 
        });
      }
      return;
    }

    if (!applicationId) {
      toast({ 
        variant: 'destructive', 
        title: 'Application Required', 
        description: 'No application ID found. Please create an application first.' 
      });
      return;
    }

    if (!storage) {
      toast({ 
        variant: 'destructive', 
        title: 'Upload Service Unavailable', 
        description: 'File upload service is not available. Please try again later.' 
      });
      return;
    }

    const files = Array.from(event.target.files);
    console.log('Starting upload:', { requirementTitle, fileCount: files.length, applicationId });
    
    setUploading(prev => ({...prev, [requirementTitle]: true}));
    setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
    
    try {
        console.log('Attempting upload with user:', user?.email, 'applicationId:', applicationId);
        const uploadResult = await doUpload(files, requirementTitle);
        console.log('Upload result:', uploadResult);
        
        if (uploadResult) {
            console.log('Updating form status...');
            await handleFormStatusUpdate([{
                name: requirementTitle,
                status: 'Completed',
                fileName: files.map(f => f.name).join(', '),
                filePath: uploadResult.path,
                downloadURL: uploadResult.downloadURL,
                dateCompleted: Timestamp.now(),
            }]);
            console.log('Form status updated successfully');
            toast({ 
              title: 'Upload Successful', 
              description: `${requirementTitle} has been uploaded successfully.`,
              className: 'bg-green-100 text-green-900 border-green-200'
            });
        } else {
          throw new Error('Upload failed - no result returned');
        }
    } catch (error: any) {
        console.error('Upload error details:', {
          error: error,
          message: error.message,
          code: error.code,
          stack: error.stack,
          user: user?.email,
          applicationId: applicationId,
          requirementTitle: requirementTitle,
          fileInfo: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
        });
        
        toast({ 
          variant: 'destructive', 
          title: 'Upload Failed', 
          description: error.message || 'Could not upload file. Please try again.' 
        });
    } finally {
        setUploading(prev => ({...prev, [requirementTitle]: false}));
        setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
        event.target.value = '';
    }
  };

  const handleConsolidatedUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length || !user?.uid) return;
    const files = Array.from(event.target.files);

    const formsToUpdate = Object.entries(consolidatedUploadChecks)
      .filter(([, isChecked]) => isChecked)
      .map(([formName]) => formName);

    if (formsToUpdate.length === 0) return;

    const consolidatedId = 'consolidated-medical-upload';
    setUploading(prev => ({ ...prev, [consolidatedId]: true }));
    setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));

    try {
      const uploadResult = await doUpload(files, 'consolidated_medical');
      if (uploadResult) {
        const updates: Partial<FormStatusType>[] = formsToUpdate.map(formName => ({
          name: formName,
          status: 'Completed',
          fileName: files.map(f => f.name).join(', '),
          filePath: uploadResult.path,
          downloadURL: uploadResult.downloadURL,
          dateCompleted: Timestamp.now(),
        }));
        await handleFormStatusUpdate(updates);
        toast({ title: 'Upload Successful', description: 'Consolidated documents have been uploaded.' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload consolidated documents.' });
    } finally {
      setUploading(prev => ({ ...prev, [consolidatedId]: false }));
      setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));
      setConsolidatedUploadChecks({ 'LIC 602A - Physician\'s Report': false, 'Medicine List': false, 'SNF Facesheet': false });
      event.target.value = '';
    }
  };

  const handleFileRemove = async (form: FormStatusType) => {
    if (!form.filePath) {
      await handleFormStatusUpdate([{ name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null }]);
      return;
    }
    
    const storageRef = ref(storage, form.filePath);
    try {
      await deleteObject(storageRef);
      await handleFormStatusUpdate([{ name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null }]);
      toast({ title: 'File Removed', description: `${form.fileName} has been removed.`});
    } catch (error) {
      console.error("Error removing file:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not remove file. It may have already been deleted.'});
      // Force update Firestore record even if storage deletion fails
      await handleFormStatusUpdate([{ name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null }]);
    }
  };


  const handleSubmitApplication = async () => {
    if (!docRef) return;
    if (waiverFormStatus?.choice === 'decline') {
      toast({
        variant: 'destructive',
        title: 'Community Support Services Declined',
        description: 'This application cannot be submitted because Community Support services were declined in the Freedom of Choice waiver.'
      });
      return;
    }
    setIsSubmitting(true);
    try {
        await setDoc(docRef, {
            status: 'Completed & Submitted',
            lastUpdated: serverTimestamp(),
        }, { merge: true });

        // Trigger Health Net notifications if this is a Health Net application
        if (application?.healthPlan === 'Health Net') {
          try {
            console.log('🏥 Triggering Health Net notifications for:', application.memberFirstName, application.memberLastName);
            
            const notificationData = {
              memberName: `${application.memberFirstName} ${application.memberLastName}`.trim(),
              memberClientId: application.memberMediCalNum || application.memberMrn,
              applicationId: applicationId,
              submittedBy: application.referrerName || `${application.referrerFirstName} ${application.referrerLastName}`.trim(),
              submittedDate: new Date().toLocaleDateString(),
              pathway: application.pathway,
              currentLocation: `${application.currentCity}, ${application.currentState}`.trim(),
              healthPlan: application.healthPlan,
              applicationUrl: `${window.location.origin}/admin/applications/${applicationId}?userId=${application.userId}`,
            };

            // Send Health Net notifications (email + system tray + bell)
            fetch('/api/notifications/health-net', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(notificationData),
            }).then(response => {
              if (response.ok) {
                console.log('✅ Health Net notifications sent successfully');
              } else {
                console.error('❌ Failed to send Health Net notifications');
              }
            }).catch(error => {
              console.error('❌ Health Net notification error:', error);
            });

          } catch (notificationError) {
            console.error('❌ Health Net notification setup error:', notificationError);
            // Don't block the submission if notifications fail
          }
        }

        router.push('/applications/completed');
    } catch (e: any) {
        console.error(e);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (isLoading || isUserLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Pathway...</p>
        </div>
    );
  }

  if (error) {
     return (
        <div className="flex items-center justify-center h-screen">
            <p className="text-destructive">Error: {error.message}</p>
        </div>
     );
  }
  
  if (!application) {
    return (
        <div className="flex items-center justify-center h-screen">
          <p>{applicationId ? 'Application not found or you do not have permission to view it.' : 'No application ID provided.'}</p>
        </div>
    );
  }
  
  const isReadOnly = application.status === 'Completed & Submitted' || application.status === 'Approved';

  const pathwayRequirements = getPathwayRequirements(application.pathway as 'SNF Transition' | 'SNF Diversion');
  const formStatusMap = new Map(application.forms?.map(f => [f.name, f]));
  
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const form = formStatusMap.get(req.title);
    if (form?.status === 'Completed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allRequiredFormsComplete = completedCount === totalCount;

  const waiverFormStatus = formStatusMap.get('Waivers & Authorizations') as FormStatusType | undefined;
  const servicesDeclined = waiverFormStatus?.choice === 'decline';

  const waiverSubTasks = [
      { id: 'hipaa', label: 'HIPAA Authorization', completed: !!waiverFormStatus?.ackHipaa },
      { id: 'liability', label: 'Liability Waiver', completed: !!waiverFormStatus?.ackLiability },
      { id: 'foc', label: 'Freedom of Choice', completed: !!waiverFormStatus?.ackFoc }
  ];

  const consolidatedMedicalDocuments = [
      { id: 'lic-602a-check', name: "LIC 602A - Physician's Report" },
      { id: 'med-list-check', name: 'Medicine List' },
      { id: 'facesheet-check', name: 'SNF Facesheet' },
  ].filter(doc => pathwayRequirements.some(req => req.title === doc.name));

  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = formInfo?.status === 'Completed';
    const href = req.href ? `${req.href}${req.href.includes('?') ? '&' : '?'}applicationId=${applicationId}` : '#';
    
    if (isReadOnly) {
       if (req.type === 'Upload') {
           return (
                <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                    {formInfo?.downloadURL && (isAdmin || isSuperAdmin) ? (
                        <a href={formInfo.downloadURL} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-green-800 font-medium hover:underline">
                            {formInfo?.fileName || 'Completed'}
                        </a>
                    ) : (
                        <span className="truncate flex-1 text-green-800 font-medium">
                            {formInfo?.fileName || 'Completed'}
                            {!isAdmin && !isSuperAdmin && formInfo?.downloadURL && (
                                <span className="block text-xs text-gray-500 mt-1">Document submitted - accessible by staff only</span>
                            )}
                        </span>
                    )}
                </div>
           );
       }
       return (
            <Button asChild variant="outline" className="w-full bg-slate-50">
                <Link href={href}>View</Link>
            </Button>
        );
    }

    const isUploading = uploading[req.title];
    const currentProgress = uploadProgress[req.title];
    const isMultiple = req.title === 'Proof of Income';
    
    switch (req.type) {
        case 'online-form':
            if (req.id === 'waivers') {
                return (
                    <div className="space-y-3">
                        <div className="space-y-2 rounded-md border p-3">
                            {waiverSubTasks.map(task => (
                                <div key={task.id} className="flex items-center space-x-2">
                                    <Checkbox id={`waiver-${task.id}`} checked={task.completed} disabled />
                                    <label htmlFor={`waiver-${task.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {task.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                         <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                            <Link href={href}>
                                {isCompleted ? 'View/Edit Waivers' : 'Complete Waivers'} &rarr;
                            </Link>
                        </Button>
                    </div>
                );
            }
            return (
                <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                    <Link href={href}>{isCompleted ? 'View/Edit' : 'Start'} &rarr;</Link>
                </Button>
            );
        case 'Upload':
             if (isCompleted) {
                 return (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        {formInfo?.downloadURL && (isAdmin || isSuperAdmin) ? (
                            <a href={formInfo.downloadURL} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-green-800 font-medium hover:underline">
                                {formInfo?.fileName || 'Completed'}
                            </a>
                        ) : (
                             <span className="truncate flex-1 text-green-800 font-medium">
                                {formInfo?.fileName || 'Completed'}
                                {!isAdmin && !isSuperAdmin && formInfo?.downloadURL && (
                                    <span className="block text-xs text-gray-500 mt-1">Document submitted - accessible by staff only</span>
                                )}
                             </span>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleFileRemove(formInfo!)}>
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remove file</span>
                        </Button>
                    </div>
                 )
             }
             return (
                <div className="space-y-2">
                    {isUploading && (
                        <Progress value={currentProgress} className="h-1 w-full" />
                    )}
                    {req.href && req.href !== '#' && (
                        <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                           <Link href={req.href} target="_blank">
                               <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                           </Link>
                       </Button>
                    )}
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isUploading || isReadOnly) && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading || isReadOnly} multiple={isMultiple} />
                </div>
            );
        default:
            return null;
    }
};

  const isConsolidatedUploading = uploading['consolidated-medical-upload'];
  const consolidatedProgress = uploadProgress['consolidated-medical-upload'];
  const isAnyConsolidatedChecked = Object.values(consolidatedUploadChecks).some(v => v);

  return (
    <>
      <Header />
      <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8 max-w-full overflow-x-hidden">
          {/* Back to Applications Hub Link */}
          <div className="flex items-center">
            <Link 
              href="/applications" 
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Applications Hub
            </Link>
          </div>
            <Card className="shadow-sm">
                <CardHeader>
                <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
                    Application for {application.memberFirstName} {application.memberLastName}
                </CardTitle>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardDescription>
                    Submitted by {application.referrerName || user?.displayName} | {application.pathway} ({application.healthPlan})
                    </CardDescription>
                </div>
                </CardHeader>
                <CardContent className="space-y-4">
                {servicesDeclined && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Community Support Services Declined</AlertTitle>
                        <AlertDescription>
                            This application cannot be submitted because Community Support services were declined in the Freedom of Choice waiver.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="truncate col-span-2 sm:col-span-1"><strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span></div>
                    <div><strong>Status:</strong> <span className="font-semibold">{application.status}</span></div>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span className="font-medium">Document Checklist</span>
                        <span>{completedCount} of {totalCount} completed</span>
                    </div>
                    <div className="space-y-2 rounded-md border p-3">
                        {pathwayRequirements.map((req) => {
                            const formInfo = formStatusMap.get(req.title);
                            const isCompleted = formInfo?.status === 'Completed';
                            return (
                                <div key={req.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={isCompleted} disabled />
                                    <span className={cn(isCompleted ? 'text-green-700' : 'text-muted-foreground')}>
                                        {req.title}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                </CardContent>
                {(!isReadOnly && (application.status === 'In Progress' || application.status === 'Requires Revision')) && (
                    <CardFooter>
                        <Button 
                            className="w-full bg-emerald-600 text-white hover:bg-emerald-700" 
                            disabled={!allRequiredFormsComplete || isSubmitting || servicesDeclined}
                            onClick={handleSubmitApplication}
                        >
                            {isSubmitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                            ) : (
                                <><Send className="mr-2 h-4 w-4" /> Submit Application for Review</>
                            )}
                        </Button>
                    </CardFooter>
                )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pathwayRequirements.map((req) => {
                    const formInfo = formStatusMap.get(req.title);
                    const status = formInfo?.status || 'Pending';
                    
                    return (
                        <Card key={req.id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="pb-4">
                                <div className="flex justify-between items-start gap-4">
                                    <CardTitle className="text-lg">{req.title}</CardTitle>
                                </div>
                                <CardDescription>{req.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col flex-grow justify-end gap-4">
                                <StatusIndicator status={status} />
                                {getFormAction(req)}
                            </CardContent>
                        </Card>
                    )
                })}

                {!isReadOnly && consolidatedMedicalDocuments.length > 0 && (
                    <Card key="consolidated-medical" className="flex flex-col shadow-sm hover:shadow-md transition-shadow md:col-span-2">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5 text-muted-foreground"/>Consolidated Medical Documents (Optional)</CardTitle>
                            </div>
                            <CardDescription>Upload LIC 602A, medicine list, and SNF facesheet together when applicable.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-grow justify-end gap-4">
                            {isConsolidatedUploading && (
                                <Progress value={consolidatedProgress} className="h-1 w-full" />
                            )}
                            <div className="space-y-2 rounded-md border p-3">
                                {consolidatedMedicalDocuments.map(doc => (
                                     <div key={doc.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={doc.id}
                                            checked={consolidatedUploadChecks[doc.name as keyof typeof consolidatedUploadChecks]}
                                            onCheckedChange={(checked) => {
                                                setConsolidatedUploadChecks(prev => ({ ...prev, [doc.name]: !!checked }))
                                            }}
                                            disabled={isReadOnly || formStatusMap.get(doc.name)?.status === 'Completed'}
                                        />
                                        <label htmlFor={doc.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {doc.name}
                                        </label>
                                    </div>
                                ))}
                            </div>
                            <Label htmlFor="consolidated-upload" className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isConsolidatedUploading || isReadOnly || !isAnyConsolidatedChecked) && "opacity-50 pointer-events-none")}>
                                {isConsolidatedUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                                <span>{isConsolidatedUploading ? `Uploading... ${consolidatedProgress?.toFixed(0)}%` : 'Upload Consolidated Documents'}</span>
                            </Label>
                            <Input id="consolidated-upload" type="file" className="sr-only" onChange={handleConsolidatedUpload} disabled={isConsolidatedUploading || isReadOnly || !isAnyConsolidatedChecked} multiple />
                        </CardContent>
                    </Card>
                )}
            </div>

        </div>
      </main>
    </>
  );
}

export default function PathwayPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Pathway...</p>
        </div>
    }>
      <PathwayPageContent />
    </Suspense>
  );
}
