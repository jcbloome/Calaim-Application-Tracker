
'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  File,
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  Package,
  Database,
  X,
  XCircle,
  FileText,
  Lock,
  Edit,
  Mail,
  AlertTriangle,
  User,
  Calendar as CalendarIcon,
  List,
  Link as LinkIcon,
  Download,
  Bell,
  BellOff,
  MessageSquare,
  BellRing,
  Eye,
  EyeOff,
  ChevronDown,
  Target,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType, StaffTracker, StaffMember } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp, Timestamp, onSnapshot, deleteDoc, getDocs, query, where, documentId } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { MultiUploadCard } from '@/components/MultiUploadCard';
import { useAdmin } from '@/hooks/use-admin';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogTitle, AlertDialogHeader, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import NoteTracker from '@/components/NoteTracker';
import { KAISER_STATUS_PROGRESSION, getKaiserStatusesInOrder, getKaiserStatusProgress } from '@/lib/kaiser-status-progression';

// Staff Assignment Dropdown Component
function StaffAssignmentDropdown({ 
    application, 
    onStaffChange 
}: { 
    application: Application; 
    onStaffChange: (staffId: string, staffName: string) => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    type StaffCandidate = {
      uid: string;
      role: 'Admin' | 'Super Admin' | 'Staff';
      firstName: string;
      lastName: string;
      email: string;
      isKaiserStaff?: boolean;
      isHealthNetStaff?: boolean;
      displayName: string;
    };
    const [staffList, setStaffList] = useState<StaffCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);
    const [staffFilterLabel, setStaffFilterLabel] = useState<string>('Showing all staff');

    useEffect(() => {
        // Filter staff list based on the application's health plan.
        let staff: StaffCandidate[] = [];
        
        const loadStaff = async () => {
            if (!firestore) {
                setIsLoadingStaff(false);
                return;
            }
            try {
                const planLower = String(application.healthPlan || '').toLowerCase();
                const isKaiserPlan = planLower.includes('kaiser');
                const isHealthNetPlan = planLower.includes('health net');

                // Pull three small staff sets and merge:
                // - isStaff (general staff)
                // - isKaiserStaff (designated Kaiser staff)
                // - isHealthNetStaff (designated Health Net staff)
                // This avoids missing staff that are designated but not flagged isStaff.
                const [staffSnap, kaiserSnap, hnSnap, adminRolesSnap, superAdminRolesSnap] = await Promise.all([
                  getDocs(query(collection(firestore, 'users'), where('isStaff', '==', true))),
                  getDocs(query(collection(firestore, 'users'), where('isKaiserStaff', '==', true))),
                  getDocs(query(collection(firestore, 'users'), where('isHealthNetStaff', '==', true))),
                  getDocs(collection(firestore, 'roles_admin')),
                  getDocs(collection(firestore, 'roles_super_admin')),
                ]);

                const adminIds = new Set(adminRolesSnap.docs.map((d) => d.id));
                const superAdminIds = new Set(superAdminRolesSnap.docs.map((d) => d.id));

                const userDataByUid = new Map<string, any>();
                staffSnap.docs.forEach((d) => userDataByUid.set(d.id, d.data()));
                kaiserSnap.docs.forEach((d) => userDataByUid.set(d.id, d.data()));
                hnSnap.docs.forEach((d) => userDataByUid.set(d.id, d.data()));

                // Ensure currently assigned staff is always visible in the dropdown.
                const currentAssignedId = String((application as any)?.assignedStaffId || '').trim();
                if (currentAssignedId && !userDataByUid.has(currentAssignedId)) {
                  try {
                    const snap = await getDoc(doc(firestore, 'users', currentAssignedId));
                    if (snap.exists()) {
                      userDataByUid.set(currentAssignedId, snap.data());
                    }
                  } catch {
                    // ignore
                  }
                }

                const toCandidate = (uid: string, data: any): StaffCandidate | null => {
                  if (!data) return null;
                  const firstName = String(data?.firstName || data?.displayName || data?.name || '').trim();
                  const lastName = String(data?.lastName || '').trim();
                  const email = String(data?.email || '').trim();
                  const displayName = `${firstName} ${lastName}`.trim() || email;
                  if (!displayName) return null;
                  const role: StaffCandidate['role'] =
                    superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
                  return {
                    uid,
                    role,
                    firstName,
                    lastName,
                    email: email || uid,
                    isKaiserStaff: Boolean(data?.isKaiserStaff),
                    isHealthNetStaff: Boolean(data?.isHealthNetStaff),
                    displayName,
                  };
                };

                const candidates: StaffCandidate[] = Array.from(userDataByUid.entries())
                  .map(([uid, data]) => toCandidate(uid, data))
                  .filter(Boolean) as StaffCandidate[];

                const designatedCandidates = isKaiserPlan
                  ? candidates.filter((c) => c.isKaiserStaff)
                  : isHealthNetPlan
                    ? candidates.filter((c) => c.isHealthNetStaff)
                    : [];

                let filtered = candidates;
                let label = 'Showing all staff';

                if ((isKaiserPlan || isHealthNetPlan) && designatedCandidates.length > 0) {
                  filtered = designatedCandidates;
                  label = isKaiserPlan ? 'Showing Kaiser staff' : 'Showing Health Net staff';
                } else if (isKaiserPlan) {
                  label = 'No Kaiser staff designated; showing all staff';
                } else if (isHealthNetPlan) {
                  label = 'No Health Net staff designated; showing all staff';
                }

                staff = [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName));
                setStaffFilterLabel(label);
            } catch (error) {
                console.error('Error loading staff list:', error);
            } finally {
                setStaffList(staff);
                setIsLoadingStaff(false);
            }
        };

        loadStaff();

    }, [application.healthPlan, firestore]);

    const handleStaffAssignment = async (staffId: string) => {
        const selectedStaff = staffList.find(staff => staff.uid === staffId);
        if (!selectedStaff || !firestore) return;

        setIsLoading(true);
        try {
            const docRef = doc(firestore, `users/${application.userId}/applications/${application.id}`);
            const updateData = {
                assignedStaffId: staffId,
                assignedStaffName: selectedStaff.displayName,
                assignedDate: new Date().toISOString()
            };
            
            await setDoc(docRef, updateData, { merge: true });
            onStaffChange(staffId, selectedStaff.displayName);
            
            toast({
                title: "Staff Assigned",
                description: `Application assigned to ${selectedStaff.displayName}`,
            });
        } catch (error) {
            console.error('Error assigning staff:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to assign staff",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const caspioSentDate = (application as any)?.caspioSentDate;
    const caspioSentLabel = caspioSentDate
        ? format(
            typeof caspioSentDate?.toDate === 'function' ? caspioSentDate.toDate() : new Date(caspioSentDate),
            'MMM d, yyyy h:mm a'
        )
        : 'Date unavailable';

    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{staffFilterLabel}</div>
        <Select
          value={(application as any)?.assignedStaffId || ''}
          onValueChange={handleStaffAssignment}
          disabled={isLoading || isLoadingStaff}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoadingStaff ? 'Loading staff…' : 'Assign a staff member...'} />
          </SelectTrigger>
          <SelectContent>
            {staffList.map((staff) => (
              <SelectItem key={staff.uid} value={staff.uid}>
                {staff.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
}

// Get Kaiser statuses in proper sort order
const kaiserSteps = getKaiserStatusesInOrder().map(status => status.status);

const healthNetSteps = [
  'Application Received',
  'in Review',
  'Needs Additional Documents',
  'Requested Additional Documents',
  'Needs RN Virtual Visit',
  'RN Virtual Visit Complete',
  'ISP Reviewed',
  'Need RCFE',
  'RCFEs Sent to Family',
  'RCFE Selected',
  'Needs ISP Sent for Signature',
  'ISP Signed',
  'Needs Auth Request',
  'Auth Request Sent',
  'Auth Received',
  'RCFE/Family Informed Auth Status',
  'Member Placed'
];

const calaimTrackingOptions = [
  'CalAIM Eligible',
  'Not CalAIM Eligible'
];

const notEligibleReasonOptions = [
  'Switching Providers by end of Month',
  'Has SOC',
  'Not in our contracted CalAIM County',
  'Might be eligible',
  'Not with Health Net',
  'Not with Kaiser',
  'Other'
];

const getAuthorizationTypes = (healthPlan?: string) => {
  const normalized = String(healthPlan || '').toLowerCase();
  if (normalized.includes('health net')) {
    return ['T2038', 'H2022'];
  }
  return ['T2038'];
};

const getPathwayRequirements = (
  pathway: 'SNF Transition' | 'SNF Diversion',
  healthPlan?: string
) => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/admin/forms/review', editHref: '/admin/forms/edit', icon: FileText },
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the consolidated HIPAA, Liability, and Freedom of Choice waiver form.', type: 'online-form', href: '/admin/forms/waivers', icon: FileText },
    { id: 'room-board-obligation', title: 'Room and Board Commitment', description: 'Upload the signed room and board commitment form.', type: 'Upload', icon: UploadCloud, href: '/forms/room-board-obligation' },
    { id: 'proof-of-income', title: "Proof of Income", description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'Upload', icon: UploadCloud, href: '#' },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'Upload', icon: Printer, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'Upload', icon: UploadCloud, href: '#' },
     {
      id: 'eligibility-screenshot',
      title: 'Eligibility Screenshot',
      description: 'Upload one or more screenshots from the provider portal showing member eligibility.',
      type: 'Upload',
      icon: LinkIcon,
      links: [
        { name: 'Health Net Portal', url: 'https://sso.entrykeyid.com/as/authorization.oauth2?response_type=code&client_id=44eb17c3-cf1e-4479-a811-61d23ae8ffbd&scope=openid%20profile&state=AHTpvDa32bFDvM5ov3mwyNx0K75Gqqp4McPzc6oUgds%3D&redirect_uri=https://provider.healthnetcalifornia.com/careconnect/login/oauth2/code/pingcloud&code_challenge_method=S256&nonce=maCZdZx6F1X7mug7ZQiIcWILmxz29uLnBvZQ6mNj4LE&code_challenge=45qFtSM3GXeNCBHkpyU9vJmOwqtKUwYdcb7VJBbw6YA&app_origin=https://provider.healthnetcalifornia.com/careconnect/login/oauth2/code/pingcloud&brand=healthnet' },
        { name: 'Kaiser South Portal', url: 'https://healthy.kaiserpermanente.org/southern-california/community-providers/eligibility' },
        { name: 'Kaiser North Portal', url: 'https://healthy.kaiserpermanente.org/northern-california/community-providers/eligibility' },
      ],
      href: '#'
    },
  ];
  
  if (pathway === 'SNF Diversion') {
    return [
      ...commonRequirements,
      { id: 'declaration-of-eligibility', title: 'Declaration of Eligibility', description: 'Download the form, have it signed by a PCP, and upload it here.', type: 'Upload', icon: Printer, href: '/forms/declaration-of-eligibility/printable' },
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

const quickStatusItems = [
  { key: 'CS Member Summary', label: 'CS' },
  { key: 'Waivers & Authorizations', label: 'Waivers' },
  { key: 'Room and Board Commitment', label: 'R&B' },
  { key: 'Proof of Income', label: 'POI' },
  { key: "LIC 602A - Physician's Report", label: '602' },
  { key: 'Medicine List', label: 'Meds' },
  { key: 'SNF Facesheet', label: 'SNF' },
  { key: 'Eligibility Check', label: 'Elig' },
  { key: 'Sent to Caspio', label: 'Caspio' },
];

function StaffApplicationTracker({ application }: { application: Application }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);

    const trackerDocRef = useMemoFirebase(() => {
        if (!firestore || !application.userId || !application.id) return null;
        return doc(firestore, `users/${application.userId}/applications/${application.id}/staffTrackers`, application.id);
    }, [firestore, application.id, application.userId]);

    const { data: tracker, isLoading: isLoadingTracker } = useDoc<StaffTracker>(trackerDocRef);

    const steps = application.healthPlan?.toLowerCase().includes('kaiser') ? kaiserSteps : healthNetSteps;

    useEffect(() => {
        // Set staff list based on health plan
        const getStaffByHealthPlan = () => {
            setIsLoadingStaff(true);
            
            let staff: StaffMember[] = [];
            
            if (application.healthPlan === 'Kaiser') {
                staff = [
                    { uid: 'jesse', firstName: 'Jesse', lastName: '', email: 'jesse@example.com', role: 'Admin' },
                    { uid: 'nick', firstName: 'Nick', lastName: '', email: 'nick@example.com', role: 'Admin' },
                    { uid: 'john', firstName: 'John', lastName: '', email: 'john@example.com', role: 'Admin' },
                ];
            } else if (application.healthPlan === 'Health Net') {
                staff = [
                    { uid: 'monica', firstName: 'Monica', lastName: '', email: 'monica@example.com', role: 'Admin' },
                    { uid: 'leidy', firstName: 'Leidy', lastName: '', email: 'leidy@example.com', role: 'Admin' },
                    { uid: 'letitia', firstName: 'Letitia', lastName: '', email: 'letitia@example.com', role: 'Admin' },
                ];
            }
            
            setStaffList(staff);
            setIsLoadingStaff(false);
        };

        getStaffByHealthPlan();
    }, [application.healthPlan]);


    const handleTrackerUpdate = async (field: keyof StaffTracker, value: any) => {
        if (!trackerDocRef || !user || !application.userId) return;

        const dataToUpdate: Partial<StaffTracker> = {
            [field]: value,
            lastUpdated: Timestamp.now(),
        };

        // Ensure base data exists if creating a new tracker
        if (!tracker) {
            dataToUpdate.id = application.id;
            dataToUpdate.applicationId = application.id;
            dataToUpdate.userId = application.userId;
            dataToUpdate.healthPlan = application.healthPlan as any;
        }
        
        try {
            await setDoc(trackerDocRef, dataToUpdate, { merge: true });
            toast({
                title: "Tracker Updated",
                description: "The application tracker has been updated.",
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not update tracker.",
            });
            console.error("Error updating tracker:", error);
        }
    };
    
    if (isLoadingTracker || isLoadingStaff) {
        return (
            <Card>
                <CardContent className="p-4 text-center">
                    <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Dialog>
            <Card>
                 <CardHeader>
                    <CardTitle>Staff Application Tracker</CardTitle>
                    <CardDescription>Internal progress for the {application.healthPlan} pathway.</CardDescription>
                </CardHeader>
                <CardContent>
                     <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">View/Edit Progress</Button>
                    </DialogTrigger>
                </CardContent>
            </Card>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Staff Application Tracker</DialogTitle>
                    <DialogDescription>Internal progress for the {application.healthPlan} pathway.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="staff-assignment">Assigned Staff</Label>
                            <Select
                                value={tracker?.assignedStaffId}
                                onValueChange={(value) => handleTrackerUpdate('assignedStaffId', value)}
                            >
                                <SelectTrigger id="staff-assignment">
                                    <SelectValue placeholder="Assign a staff member..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {staffList.map(staff => (
                                        <SelectItem key={staff.uid} value={staff.uid}>
                                            {staff.firstName} {staff.lastName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="next-step">Next Step</Label>
                            <Select
                                value={tracker?.nextStep}
                                onValueChange={(value) => handleTrackerUpdate('nextStep', value)}
                            >
                                <SelectTrigger id="next-step">
                                    <SelectValue placeholder="Select next step..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="contact-referrer">Contact Referrer</SelectItem>
                                    <SelectItem value="review-documents">Review Documents</SelectItem>
                                    <SelectItem value="schedule-isp">Schedule ISP</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="next-step-date">Next Step Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="next-step-date"
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !tracker?.nextStepDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {tracker?.nextStepDate ? format(tracker.nextStepDate.toDate(), "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={tracker?.nextStepDate?.toDate()}
                                        onSelect={(date) => handleTrackerUpdate('nextStepDate', date ? Timestamp.fromDate(date) : null)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <Separator />
                    <RadioGroup
                        value={tracker?.status}
                        onValueChange={(value) => handleTrackerUpdate('status', value)}
                        className="space-y-2"
                    >
                        {steps.map((step, index) => (
                            <div key={`${step}-${index}`} className="flex items-center space-x-2">
                                <RadioGroupItem value={step} id={`step-${index}`} />
                                <Label htmlFor={`step-${index}`}>{step}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function AdminActions({ application }: { application: Application }) {
    const { isAdmin, isSuperAdmin } = useAdmin();
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<Application['status'] | ''>('');
    const [isSending, setIsSending] = useState(false);
    const [isSendingToCaspio, setIsSendingToCaspio] = useState(false);
    const [emailRemindersEnabled, setEmailRemindersEnabled] = useState((application as any)?.emailRemindersEnabled ?? false);
    const [reviewNotificationSent, setReviewNotificationSent] = useState((application as any)?.reviewNotificationSent ?? false);
    const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
    const [isCaspioDialogOpen, setIsCaspioDialogOpen] = useState(false);
    const [caspioMappingPreview, setCaspioMappingPreview] = useState<Record<string, string> | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [testReminderEmail, setTestReminderEmail] = useState('jcbloome@gmail.com');
    const [isSendingTestReminder, setIsSendingTestReminder] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const firestore = useFirestore();
    const docRef = useMemoFirebase(() => {
        if (!firestore || !application.userId || !application.id) return null;
        return doc(firestore, `users/${application.userId}/applications`, application.id);
    }, [firestore, application.id, application.userId]);

    const kaiserStatusOptions: Application['status'][] = [
        'Application in Review',
        'Authorization Requested',
        'Authorization Received (Doc Collection)',
        'RN/Visit Scheduled',
        'Tier Level Requested',
        'Tier Level Recieved',
        'Locating RCFEs',
        'RCFE Found',
        'Room and Board Committment Letter Required',
        'Room and Board Letter Completed',
        'RCFE Connected with ILS for Contracting',
        'RCFE Contract Received',
        '(Ready for Placement)',
        'Member Placed at RCFE',
    ];

    const standardStatusOptions: Application['status'][] = [
        'In Progress',
        'Requires Revision',
        'Approved',
        'Completed & Submitted',
    ];

    const statusOptions = application.healthPlan?.toLowerCase().includes('kaiser')
        ? kaiserStatusOptions
        : standardStatusOptions;

    useEffect(() => {
        if (!isCaspioDialogOpen || typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem('calaim_cs_caspio_mapping');
            if (!stored) {
                setCaspioMappingPreview(null);
                return;
            }
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object') {
                setCaspioMappingPreview(parsed);
                return;
            }
            setCaspioMappingPreview(null);
        } catch (error) {
            console.warn('Failed to load Caspio mapping preview:', error);
            setCaspioMappingPreview(null);
        }
    }, [isCaspioDialogOpen]);

    const handleNotificationUpdate = async (type: 'emailReminders' | 'reviewNotification' | 'statusReminders', enabled: boolean) => {
        setIsUpdatingNotifications(true);
        try {
            const response = await fetch('/api/admin/update-notification-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    applicationId: application.id,
                    userId: application.userId,
                    ...(type === 'emailReminders' && { emailRemindersEnabled: enabled }),
                    ...(type === 'statusReminders' && { statusRemindersEnabled: enabled }),
                    ...(type === 'reviewNotification' && { reviewNotificationSent: enabled }),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update notification settings');
            }

            if (type === 'emailReminders') {
                setEmailRemindersEnabled(enabled);
            } else if (type === 'statusReminders') {
                // Update local state for status reminders if needed
                // setStatusRemindersEnabled(enabled);
            } else {
                setReviewNotificationSent(enabled);
            }

            toast({
                title: type === 'emailReminders' ?
                    (enabled ? 'Email Reminders Enabled' : 'Email Reminders Disabled') :
                    type === 'statusReminders' ?
                    (enabled ? 'Status Reminders Enabled' : 'Status Reminders Disabled') :
                    (enabled ? 'Review Notification Sent' : 'Review Notification Cleared'),
                description: type === 'emailReminders' ?
                    (enabled ? 'User will receive email reminders for missing documents' : 'User will not receive email reminders for missing documents') :
                    type === 'statusReminders' ?
                    (enabled ? 'User will receive application status updates' : 'User will not receive status updates') :
                    (enabled ? 'User has been notified that we are reviewing their CS Summary and application' : 'Review notification status cleared'),
                className: enabled ? 'bg-green-100 text-green-900 border-green-200' : 'bg-orange-100 text-orange-900 border-orange-200'
            });
        } catch (error) {
            console.error('Error updating notification settings:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to update notification settings'
            });
        } finally {
            setIsUpdatingNotifications(false);
        }
    };

    const sendTestMissingDocsReminder = async () => {
        if (!testReminderEmail) {
            toast({ variant: 'destructive', title: 'Error', description: 'Enter a test email address.' });
            return;
        }
        setIsSendingTestReminder(true);
        try {
            const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
            const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
            const fallbackBaseUrl = origin?.includes('localhost:3001')
              ? 'http://localhost:3000'
              : origin;
            const baseUrl = envBaseUrl || fallbackBaseUrl;
            const response = await fetch('/api/admin/send-document-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicationId: application.id,
                    userId: application.userId,
                    overrideEmail: testReminderEmail,
                    baseUrl
                })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to send test reminder');
            }
            toast({
                title: 'Test Reminder Sent',
                description: `Email sent to ${testReminderEmail}.`,
                className: 'bg-green-100 text-green-900 border-green-200'
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Send Failed',
                description: error.message || 'Could not send test reminder.'
            });
        } finally {
            setIsSendingTestReminder(false);
        }
    };

    if (!isAdmin && !isSuperAdmin) {
        return null;
    }
    
    const sendEmailAndUpdateStatus = async () => {
        if (!status) {
             toast({ variant: 'destructive', title: 'Error', description: 'Please select a status before sending.' });
            return;
        }

        if (status === 'Requires Revision' && !notes) {
            toast({ variant: 'destructive', title: 'Error', description: 'Notes are required when requesting a revision.' });
            return;
        }
        
        if (!application.referrerEmail) {
            toast({ variant: 'destructive', title: 'Error', description: 'Referrer email is not available for this application.' });
            return;
        }

        setIsSending(true);

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: application.referrerEmail,
                    subject: `Update on CalAIM Application for ${application.memberFirstName} ${application.memberLastName}`,
                    memberName: application.referrerName || 'there',
                    staffName: "The Connections Team",
                    message: notes || 'Your application status has been updated. Please log in to your dashboard for more details.',
                    status: status as any, // Cast because we know it's valid
                }),
            });
            
            const result = await response.json();
            
            if (result.success) {
                if (docRef) {
                     await setDoc(docRef, { status: status, lastUpdated: serverTimestamp() }, { merge: true });
                }

                toast({
                    title: 'Success!',
                    description: `Application status set to "${status}" and an email has been sent.`,
                    className: 'bg-green-100 text-green-900',
                });
                setNotes('');
                setStatus('');
            } else {
                throw new Error(result.message);
            }

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Email Error',
                description: `Could not send email: ${error.message}`,
            });
        } finally {
            setIsSending(false);
        }
    };

    const sendToCaspio = async (mappingOverride?: Record<string, string> | null) => {
        setIsSendingToCaspio(true);
        
        try {
            const functions = getFunctions();
            const publishToCaspio = httpsCallable(functions, 'publishCsSummaryToCaspioSimple');
            
            console.log('📤 Sending application data to Caspio:', application);
            const result = await publishToCaspio({
                applicationData: application,
                mapping: mappingOverride || caspioMappingPreview || null
            });
            const data = result.data as any;
            console.log('📥 Caspio response:', data);
            
            if (data.success) {
                toast({
                    title: 'Success!',
                    description: data.message,
                    className: 'bg-green-100 text-green-900 border-green-200',
                });
                
                // Update the application to mark it as sent to Caspio
                if (docRef) {
                    await setDoc(docRef, { 
                        caspioSent: true,
                        caspioSentDate: serverTimestamp(),
                        lastUpdated: serverTimestamp() 
                    }, { merge: true });
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Caspio Error',
                    description: data.message,
                });
            }
        } catch (error: any) {
            // Handle Firebase Functions errors
            let errorMessage = 'Failed to send to Caspio';
            
            if (error.code === 'functions/already-exists') {
                errorMessage = 'This member already exists in Caspio database';
            } else if (error.code === 'functions/failed-precondition') {
                errorMessage = 'Caspio credentials not configured properly';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            toast({
                variant: 'destructive',
                title: 'Error',
                description: errorMessage,
            });
        } finally {
            setIsSendingToCaspio(false);
        }
    };

    const handleDeleteApplication = async () => {
        if (!firestore) {
            toast({ variant: 'destructive', title: 'Error', description: 'Firestore not available.' });
            return;
        }

        try {
            if (application.userId) {
                const userDocRef = doc(firestore, `users/${application.userId}/applications`, application.id);
                await deleteDoc(userDocRef);
            }

            const isAdminSource =
                (application as any)?.source === 'admin' ||
                application.id.startsWith('admin_app_') ||
                !application.userId;

            if (isAdminSource) {
                const adminDocRef = doc(firestore, 'applications', application.id);
                await deleteDoc(adminDocRef);
            }

            toast({
                title: 'Application Deleted',
                description: 'The application has been removed.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            router.push('/admin/applications');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Delete Failed',
                description: error.message || 'Could not delete the application.',
            });
        }
    };

    return (
        <Dialog>
            <Card>
                <CardHeader
                    className="cursor-pointer select-none"
                    onClick={() => setIsOpen((prev) => !prev)}
                    role="button"
                    aria-expanded={isOpen}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle>Admin Actions</CardTitle>
                            <CardDescription>Update status and notify the referrer.</CardDescription>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </div>
                </CardHeader>
                {isOpen && (
                <CardContent className="space-y-3">
                    <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">Update Status</Button>
                    </DialogTrigger>
                    
                    <AlertDialog open={isCaspioDialogOpen} onOpenChange={setIsCaspioDialogOpen}>
                        <AlertDialogTrigger asChild>
                            <Button
                                disabled={isSendingToCaspio || (application as any)?.caspioSent}
                                className="w-full"
                                variant={(application as any)?.caspioSent ? "secondary" : "default"}
                            >
                                {isSendingToCaspio ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Sending to Caspio...
                                    </>
                                ) : (application as any)?.caspioSent ? (
                                    <>
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Verified Sent
                                    </>
                                ) : (
                                    <>
                                        <Database className="mr-2 h-4 w-4" />
                                        Send CS Summary to Caspio
                                    </>
                                )}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-3xl">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Send to Caspio</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Review the field mapping that will be used for this submission before sending.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            {caspioMappingPreview && Object.keys(caspioMappingPreview).length > 0 ? (
                                <div className="space-y-3">
                                    <div className="text-sm text-muted-foreground">
                                        Mapped fields: {Object.keys(caspioMappingPreview).length}
                                    </div>
                                    <div className="max-h-64 overflow-y-auto rounded border p-3 text-xs">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                                            {Object.entries(caspioMappingPreview).map(([csField, caspioField]) => {
                                                const value = (application as any)?.[csField];
                                                return (
                                                    <div key={`${csField}-${caspioField}`} className="font-mono">
                                                        {csField} → {caspioField}
                                                        <span className="text-muted-foreground">: {value ?? '—'}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Alert variant="destructive">
                                    <AlertTitle>No locked mapping found</AlertTitle>
                                    <AlertDescription>
                                        Save and lock your CS Summary mapping before sending to Caspio.
                                    </AlertDescription>
                                </Alert>
                            )}
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                    onClick={() => {
                                        sendToCaspio(caspioMappingPreview);
                                    }}
                                    disabled={!caspioMappingPreview || Object.keys(caspioMappingPreview).length === 0}
                                >
                                    Confirm & Send
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full">
                                Delete Application
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete this application?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently remove the application record. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteApplication}>
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Update Status Reminders Toggle */}
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                        <div className="flex items-center space-x-2">
                            <Bell className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Label htmlFor="status-reminders" className="text-sm font-medium">
                                    Update Status Reminders
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Send application status updates to user
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            {isUpdatingNotifications && <Loader2 className="h-4 w-4 animate-spin" />}
                            <Switch
                                id="status-reminders"
                                checked={(application as any)?.statusRemindersEnabled ?? false}
                                onCheckedChange={(enabled) => handleNotificationUpdate('statusReminders', enabled)}
                                disabled={isUpdatingNotifications}
                            />
                        </div>
                    </div>

                    {/* Email Reminders for Missing Documents Toggle */}
                    <div className="flex flex-col p-3 border rounded-lg bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <Label htmlFor="email-reminders" className="text-sm font-medium">
                                        Email Reminders for Missing Documents
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Current cadence: every {(application as any)?.documentReminderFrequencyDays ? Number((application as any)?.documentReminderFrequencyDays) : 2} days.
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Recipient: {(application as any)?.referrerEmail || 'Email not available'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                {isUpdatingNotifications && <Loader2 className="h-4 w-4 animate-spin" />}
                                <Switch
                                    id="email-reminders"
                                    checked={emailRemindersEnabled}
                                    onCheckedChange={(enabled) => handleNotificationUpdate('emailReminders', enabled)}
                                    disabled={isUpdatingNotifications}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="test-reminder-email" className="text-xs text-muted-foreground">
                                Test reminder email
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="test-reminder-email"
                                    type="email"
                                    value={testReminderEmail}
                                    onChange={(event) => setTestReminderEmail(event.target.value)}
                                    placeholder="name@example.com"
                                />
                                <Button
                                    variant="outline"
                                    onClick={sendTestMissingDocsReminder}
                                    disabled={isSendingTestReminder}
                                >
                                    {isSendingTestReminder ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        'Send Test'
                                    )}
                                </Button>
                            </div>
                        </div>
                        
                        {/* Show missing documents when reminders are enabled */}
                        {emailRemindersEnabled && (() => {
                            const missingDocs = application.forms?.filter(form => 
                                form.status === 'Pending' && form.type !== 'online-form'
                            ) || [];
                            
                            return missingDocs.length > 0 ? (
                                <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                                    <p className="text-xs font-medium text-orange-800 mb-1">Missing Documents:</p>
                                    <ul className="text-xs text-orange-700 space-y-1">
                                        {missingDocs.map(doc => (
                                            <li key={doc.name} className="flex items-center gap-1">
                                                <div className="w-1 h-1 bg-orange-400 rounded-full"></div>
                                                {doc.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                                    <p className="text-xs text-green-700">✅ All documents completed</p>
                                </div>
                            );
                        })()}
                    </div>
                    
                    {(application as any)?.caspioSent && (
                        <div className="flex items-center justify-center gap-2 text-xs text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Verified sent to Caspio</span>
                            <span className="text-muted-foreground">• {caspioSentLabel}</span>
                        </div>
                    )}
                    
                    {/* Sync Status */}
                    <SyncStatusIndicator
                      applicationId={application.id}
                      clientId={(application as any)?.client_ID2}
                      memberData={application}
                      onSyncComplete={() => {
                        // Refresh data or show success message
                        window.location.reload();
                      }}
                    />
                    
                </CardContent>
                )}
            </Card>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Admin Actions</DialogTitle>
                    <DialogDescription>Update status and notify the referrer.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="status-select">Application Status</Label>
                        <Select value={status} onValueChange={(value) => setStatus(value as Application['status'])}>
                            <SelectTrigger id="status-select">
                                <SelectValue placeholder="Select new status..." />
                            </SelectTrigger>
                        <SelectContent>
                            {statusOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="status-notes">Notes for Referrer (Optional)</Label>
                        <Textarea
                            id="status-notes"
                            placeholder="e.g., 'Congratulations! The application is approved.' or 'Please upload a clearer copy of the Proof of Income document.'"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                        />
                        <p className="text-xs text-muted-foreground">This message will be sent in the email to the referrer.</p>
                    </div>
                    <Button className="w-full" onClick={sendEmailAndUpdateStatus} disabled={isSending || !status}>
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        Send Status Update
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function ApplicationDetailPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const currentUserId = user?.uid || '';
  const { toast } = useToast();
  
  const applicationId = params.applicationId as string;
  const appUserId = searchParams.get('userId');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string; email: string; role?: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [interofficeNote, setInterofficeNote] = useState<{
    recipientIds: string[];
    priority: 'Regular' | 'Immediate';
    message: string;
    followUpDate?: string;
  }>({
    recipientIds: [],
    priority: 'Regular',
    message: '',
    followUpDate: ''
  });
  const [authorizationUpload, setAuthorizationUpload] = useState<{
    type: string;
    startDate: string;
    endDate: string;
    file: File | null;
  }>({
    type: '',
    startDate: '',
    endDate: '',
    file: null
  });
  const [authorizationUploading, setAuthorizationUploading] = useState(false);
  const [authorizationUploadProgress, setAuthorizationUploadProgress] = useState(0);
  const [authorizationSearch, setAuthorizationSearch] = useState('');
  const [ispUpload, setIspUpload] = useState<{
    planDate: string;
    file: File | null;
  }>({
    planDate: '',
    file: null
  });
  const [ispUploading, setIspUploading] = useState(false);
  const [ispUploadProgress, setIspUploadProgress] = useState(0);
  const [memberNotifications, setMemberNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    priority: string;
    createdAt: any;
    createdByName?: string;
    type?: string;
  }>>([]);

  const mergeCurrentUserIntoStaff = (
    staff: Array<{ uid: string; name: string; email: string; role?: string }>
  ) => {
    if (!user) return staff;
    const currentUid = user.uid || user.email || 'current-user';
    const currentEmail = user.email || '';
    const exists = staff.some(
      (member) => member.uid === currentUid || (currentEmail && member.email === currentEmail)
    );
    if (exists) return staff;
    return [
      ...staff,
      {
        uid: currentUid,
        name: user.displayName || user.email || 'Current User',
        email: currentEmail,
        role: 'Admin'
      }
    ];
  };
  
  const [consolidatedUploadChecks, setConsolidatedUploadChecks] = useState<Record<string, boolean>>({
    'LIC 602A - Physician\'s Report': false,
    'Medicine List': false,
    'SNF Facesheet': false,
    'Declaration of Eligibility': false,
  });

  const [isUpdatingProgression, setIsUpdatingProgression] = useState(false);
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [isSendingEligibilityNote, setIsSendingEligibilityNote] = useState(false);
  const [isUpdatingReminderControls, setIsUpdatingReminderControls] = useState(false);
  const [nextStepDateMissing, setNextStepDateMissing] = useState(false);

  const reminderFrequencyOptions = useMemo(() => [2, 7] as const, []);
  const documentReminderFrequencyDays = useMemo(() => {
    const raw = Number((application as any)?.documentReminderFrequencyDays);
    if (!Number.isFinite(raw) || raw <= 0) return 2;
    return Math.max(1, Math.min(30, Math.round(raw)));
  }, [application]);
  const statusReminderFrequencyDays = useMemo(() => {
    const raw = Number((application as any)?.statusReminderFrequencyDays);
    if (!Number.isFinite(raw) || raw <= 0) return 7;
    return Math.max(1, Math.min(30, Math.round(raw)));
  }, [application]);

  const updateReminderSettings = async (patch: Record<string, any>) => {
    if (!application?.id) return;
    setIsUpdatingReminderControls(true);
    try {
      const res = await fetch('/api/admin/update-notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          ...patch,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update reminder settings');
      }
      setApplication((prev) => (prev ? ({ ...(prev as any), ...patch } as any) : prev));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to update reminder settings.',
      });
    } finally {
      setIsUpdatingReminderControls(false);
    }
  };
  const ensureAdminClaim = async () => {
    if (!user) return;
    try {
      const tokenResult = await user.getIdTokenResult();
      const hasAdminClaim = Boolean((tokenResult?.claims as any)?.admin);
      if (hasAdminClaim) return;

      const idToken = await user.getIdToken();
      await fetch('/api/auth/admin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      await user.getIdToken(true);
    } catch (error) {
      console.warn('Failed to refresh admin claims:', error);
    }
  };

  const docRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !applicationId || !appUserId) return null;
    return doc(firestore, `users/${appUserId}/applications`, applicationId);
  }, [firestore, applicationId, appUserId, isUserLoading]);

  const staffTrackerRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !applicationId || !appUserId) return null;
    return doc(firestore, `users/${appUserId}/applications/${applicationId}/staffTrackers`, applicationId);
  }, [firestore, applicationId, appUserId, isUserLoading]);

  const { data: staffTracker } = useDoc<StaffTracker>(staffTrackerRef);

  const assignedStaffSettingsRef = useMemoFirebase(() => {
    const staffId = String((application as any)?.assignedStaffId || '').trim();
    if (isUserLoading || !firestore || !staffId) return null;
    return doc(firestore, 'users', staffId);
  }, [firestore, isUserLoading, (application as any)?.assignedStaffId]);

  const { data: assignedStaffSettings } = useDoc<any>(assignedStaffSettingsRef);
  // NOTE: next step date is now mandatory whenever a next step is assigned.
  // We still load staff settings in case you want to re-enable conditional behavior later.

  const nextStepDateInputValue = useMemo(() => {
    try {
      const raw: any = (staffTracker as any)?.nextStepDate;
      const d: Date | null = raw?.toDate?.() || (raw ? new Date(raw) : null);
      const ms = d?.getTime?.();
      if (!ms || Number.isNaN(ms)) return '';
      const yyyy = String(d!.getFullYear());
      const mm = String(d!.getMonth() + 1).padStart(2, '0');
      const dd = String(d!.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '';
    }
  }, [staffTracker]);

  const NEXT_STEP_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'none', label: '— None —' },
    { value: 'contact-referrer', label: 'Contact referrer' },
    { value: 'review-documents', label: 'Review documents' },
    { value: 'schedule-isp', label: 'Schedule ISP' },
    { value: 'other', label: 'Other' },
  ];

  const planLower = String((application as any)?.healthPlan || '').toLowerCase();
  const isKaiserPlan = planLower.includes('kaiser');
  const isHealthNetPlan = planLower.includes('health net');

  const kaiserCurrentStatus = String((application as any)?.kaiserStatus || kaiserSteps[0] || '').trim();
  const kaiserWorkflowOptions = useMemo(() => {
    return getKaiserStatusesInOrder()
      .filter((s) => Boolean((s as any)?.isActive))
      .map((s) => String(s.status || '').trim())
      .filter(Boolean);
  }, []);
  const kaiserNextStatus = useMemo(() => {
    if (!isKaiserPlan) return '';
    const idx = kaiserWorkflowOptions.findIndex((s) => s === kaiserCurrentStatus);
    if (idx === -1) return '';
    if (idx >= kaiserWorkflowOptions.length - 1) return '';
    return String(kaiserWorkflowOptions[idx + 1] || '').trim();
  }, [isKaiserPlan, kaiserCurrentStatus, kaiserWorkflowOptions]);

  const healthNetCurrentStatus = String((application as any)?.healthNetStatus || healthNetSteps[0] || '').trim();
  const healthNetNextStatus = useMemo(() => {
    if (!isHealthNetPlan) return '';
    const idx = healthNetSteps.findIndex((s) => s === healthNetCurrentStatus);
    if (idx === -1) return '';
    if (idx >= healthNetSteps.length - 1) return '';
    return String(healthNetSteps[idx + 1] || '').trim();
  }, [isHealthNetPlan, healthNetCurrentStatus]);

  const effectiveNextStep = useMemo(() => {
    if (isKaiserPlan) return String(kaiserNextStatus || '').trim();
    if (isHealthNetPlan) return String(healthNetNextStatus || '').trim();
    return String((staffTracker as any)?.nextStep || '').trim();
  }, [isKaiserPlan, isHealthNetPlan, kaiserNextStatus, healthNetNextStatus, staffTracker]);

  const nextStepSuggestedLabel = useMemo(() => {
    if (isKaiserPlan) return kaiserNextStatus ? `Suggested: ${kaiserNextStatus}` : 'Suggested: —';
    if (isHealthNetPlan) return healthNetNextStatus ? `Suggested: ${healthNetNextStatus}` : 'Suggested: —';
    return '';
  }, [isKaiserPlan, isHealthNetPlan, kaiserNextStatus, healthNetNextStatus]);

  const nextStepSelectOptions = useMemo(() => {
    if (isKaiserPlan) {
      return [
        { value: 'none', label: '— None —' },
        ...kaiserWorkflowOptions.map((s) => ({ value: s, label: s })),
      ];
    }
    if (isHealthNetPlan) {
      return [
        { value: 'none', label: '— None —' },
        ...healthNetSteps.map((s) => ({ value: s, label: s })),
      ];
    }
    return NEXT_STEP_OPTIONS;
  }, [isKaiserPlan, isHealthNetPlan, kaiserWorkflowOptions]);

  const nextStepSelectValue = useMemo(() => {
    const stored = String((staffTracker as any)?.nextStep || '').trim();
    if (stored) return stored;
    if (isKaiserPlan) return String(kaiserNextStatus || '').trim() || 'none';
    if (isHealthNetPlan) return String(healthNetNextStatus || '').trim() || 'none';
    return 'none';
  }, [staffTracker, isKaiserPlan, isHealthNetPlan, kaiserNextStatus, healthNetNextStatus]);

  const updateStaffTracker = async (patch: Partial<StaffTracker>) => {
    if (!staffTrackerRef || !applicationId || !appUserId || !application) return;
    try {
      const memberName = `${(application as any)?.memberFirstName || ''} ${(application as any)?.memberLastName || ''}`.trim();
      const memberClientId = String((application as any)?.client_ID2 || '').trim();
      const base: any = {
        id: applicationId,
        applicationId,
        userId: appUserId,
        healthPlan: String((application as any)?.healthPlan || '').trim(),
        memberName,
        memberClientId,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(staffTrackerRef, { ...base, ...(patch as any) }, { merge: true });
    } catch (e) {
      // non-fatal; page can still operate without tracker updates
      console.warn('Failed to update staff tracker:', e);
    }
  };

  useEffect(() => {
    // If no next step is set yet, seed it with the suggested workflow next step.
    if (!isKaiserPlan && !isHealthNetPlan) return;
    const desired = String(effectiveNextStep || '').trim();
    if (!desired) return;
    const current = String((staffTracker as any)?.nextStep || '').trim();
    if (current) return;
    updateStaffTracker({ nextStep: desired } as any);
    if (!nextStepDateInputValue) setNextStepDateMissing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKaiserPlan, isHealthNetPlan, effectiveNextStep, staffTrackerRef]);

  const getStaffOptions = () => {
    if (staffList.length > 0) {
      return staffList.map((staff) => staff.name).filter(Boolean);
    }
    return [];
  };

  const activityLog = useMemo(() => {
    if (!application?.forms) return [];
    
    return application.forms
      .filter(form => form.status === 'Completed' && form.dateCompleted)
      .map(form => ({
        id: form.name,
        component: form.name,
        user: application.referrerName || 'User', // Placeholder
        date: form.dateCompleted!.toDate(),
        action: form.type === 'Upload' ? `Uploaded ${form.fileName}` : 'Completed online form',
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [application]);

  const uploadedFiles = useMemo(() => {
    if (!application?.forms) return [];
    return application.forms.filter(
        (form) => form.type === 'Upload' && form.status === 'Completed' && form.fileName
    );
  }, [application]);

  const authorizationTypes = useMemo(
    () => getAuthorizationTypes(application?.healthPlan),
    [application?.healthPlan]
  );

  const authorizationRecords = useMemo(() => {
    return ((application as any)?.authorizationRecords || []) as Array<{
      id?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
      fileName?: string;
      downloadURL?: string;
      uploadedAt?: any;
      createdByName?: string;
      expiryNotifiedAt?: string;
    }>;
  }, [application]);

  const ispRecords = useMemo(() => {
    return ((application as any)?.ispRecords || []) as Array<{
      id?: string;
      planDate?: string;
      fileName?: string;
      downloadURL?: string;
      uploadedAt?: any;
      createdByName?: string;
    }>;
  }, [application]);

  const interofficeNotes = useMemo(() => {
    return ((application as any)?.interofficeNotes || []) as Array<{
      id?: string;
      message?: string;
      priority?: 'Regular' | 'Immediate';
      createdAt?: string;
      createdByName?: string;
      recipientId?: string;
      recipientName?: string;
      followUpDate?: string;
      followUpNotifiedAt?: string;
    }>;
  }, [application]);

  const memberIdForNotes = useMemo(() => {
    return (application as any)?.client_ID2 || application?.id || '';
  }, [application]);

  const filteredAuthorizationRecords = useMemo(() => {
    if (!authorizationSearch.trim()) return authorizationRecords;
    const query = authorizationSearch.toLowerCase();
    return authorizationRecords.filter((record) => {
      const fields = [
        record.type,
        record.fileName,
        record.startDate,
        record.endDate,
        record.createdByName
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return fields.includes(query);
    });
  }, [authorizationRecords, authorizationSearch]);

  useEffect(() => {
    if (!docRef) {
      if (!isUserLoading) setIsLoading(false);
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
    if (!firestore || !memberIdForNotes) return;
    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('clientId2', '==', memberIdForNotes)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title || 'Note',
            message: data.message || '',
            priority: data.priority || 'Medium',
            createdAt: data.timestamp || data.createdAt,
            createdByName: data.createdByName || data.senderName,
            type: data.type
          };
        }).sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
        setMemberNotifications(items);
      },
      (error) => {
        console.error('Failed to load member notifications:', error);
      }
    );

    return () => unsubscribe();
  }, [firestore, memberIdForNotes]);

  useEffect(() => {
    const STAFF_CACHE_KEY = 'interoffice_admin_staff_cache_v1';
    const STAFF_CACHE_TTL_MS = 5 * 60 * 1000;

    const readCache = () => {
      try {
        const raw = sessionStorage.getItem(STAFF_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { timestamp: number; staff: typeof staffList };
        if (!parsed?.staff?.length) return null;
        return {
          ...parsed,
          staff: mergeCurrentUserIntoStaff(parsed.staff)
        };
      } catch (error) {
        console.warn('Staff cache read failed:', error);
        return null;
      }
    };

    const writeCache = (staff: typeof staffList) => {
      try {
        sessionStorage.setItem(
          STAFF_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), staff })
        );
      } catch (error) {
        console.warn('Staff cache write failed:', error);
      }
    };

    const chunkArray = <T,>(items: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
      }
      return chunks;
    };

    const fetchStaffFromFirestore = async () => {
      if (!firestore) return [];
      try {
        const usersSnap = await getDocs(
          query(collection(firestore, 'users'), where('isStaff', '==', true))
        );
        const users: Array<{ uid: string; name: string; email: string; role: string }> = [];

        usersSnap.forEach((docItem) => {
          const data = docItem.data() as any;
          users.push({
            uid: docItem.id,
            name: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : data.email || 'Unknown Staff',
            email: data.email || '',
            role: data.role || 'Staff'
          });
        });

        return users.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error) {
        console.error('Firestore staff load failed:', error);
        return [];
      }
    };

    const loadStaffMembers = async () => {
      try {
        setIsLoadingStaff(true);
        const fallback = await fetchStaffFromFirestore();
        if (fallback.length > 0) {
          const merged = mergeCurrentUserIntoStaff(fallback);
          setStaffList(merged);
          writeCache(merged);
          return;
        }
      } catch (loadError) {
        console.error('Error loading staff members:', loadError);
      } finally {
        setIsLoadingStaff(false);
      }
    };

    const cached = readCache();
    if (cached?.staff?.length) {
      setStaffList(cached.staff);
    }

    if (cached && Date.now() - cached.timestamp < STAFF_CACHE_TTL_MS) {
      setIsLoadingStaff(false);
      return;
    }

    loadStaffMembers();
  }, [user, firestore]);

  const handleSendInterofficeNote = async () => {
    if (!firestore || !application || !applicationId || !docRef) return;
    if (interofficeNote.recipientIds.length === 0 || !interofficeNote.message.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Details',
        description: 'Select at least one staff member and enter a message.'
      });
      return;
    }

    const memberName = `${application.memberFirstName} ${application.memberLastName}`;
    const clientId2 = (application as any)?.client_ID2 || application.id;
    const recipients = staffList.filter((staff) => interofficeNote.recipientIds.includes(staff.uid));
    if (recipients.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Recipients',
        description: 'Selected staff members were not found.'
      });
      return;
    }
    const priorityValue = interofficeNote.priority === 'Immediate' ? 'Urgent' : 'Low';
    const noteRecords = recipients.map((recipient) => ({
      id: `interoffice-${Date.now()}-${recipient.uid}`,
      message: interofficeNote.message.trim(),
      priority: interofficeNote.priority,
      createdAt: new Date().toISOString(),
      createdBy: user?.uid || 'system',
      createdByName: user?.displayName || user?.email || 'Admin',
      recipientId: recipient.uid,
      recipientName: recipient.name,
      followUpDate: interofficeNote.followUpDate || '',
      followUpNotifiedAt: ''
    }));

    try {
      const existingNotes = ((application as any)?.interofficeNotes || []) as Array<any>;
      await setDoc(docRef!, { interofficeNotes: [...existingNotes, ...noteRecords] }, { merge: true });

      await Promise.all(
        recipients.map((recipient) =>
          addDoc(collection(firestore, 'staff_notifications'), {
            userId: recipient.uid,
            title: `Interoffice Note: ${memberName}`,
            message: interofficeNote.message.trim(),
            memberName,
            clientId2,
            applicationId,
            type: 'interoffice_note',
            priority: priorityValue,
            status: 'Open',
            isRead: false,
            createdBy: user?.uid || 'system',
            createdByName: user?.displayName || user?.email || 'Admin',
            senderName: user?.displayName || user?.email || 'Admin',
            timestamp: serverTimestamp(),
            actionUrl: `/admin/applications/${applicationId}?userId=${appUserId}`
          })
        )
      );

      toast({
        title: 'Interoffice Note Sent',
        description: `Sent to ${recipients.length} staff member${recipients.length === 1 ? '' : 's'}.`
      });

      setInterofficeNote((prev) => ({
        ...prev,
        message: '',
        recipientIds: [],
        priority: 'Regular',
        followUpDate: ''
      }));
    } catch (sendError) {
      console.error('Error sending interoffice note:', sendError);
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: 'Could not send the interoffice note.'
      });
    }
  };

  const formatAuthorizationDate = (value?: any) => {
    if (!value) return 'N/A';
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
    }
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleDateString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
  };

  const getDaysUntil = (value?: any) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const now = new Date();
    const diffMs = parsed.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleAuthorizationUpload = async () => {
    if (!application || !docRef || !storage || !firestore) return;

    if (!authorizationUpload.type || !authorizationUpload.startDate || !authorizationUpload.endDate) {
      toast({
        variant: 'destructive',
        title: 'Missing Details',
        description: 'Select an authorization type and enter start/end dates.'
      });
      return;
    }

    if (!authorizationUpload.file) {
      toast({
        variant: 'destructive',
        title: 'Missing File',
        description: 'Upload the authorization document.'
      });
      return;
    }

    try {
      setAuthorizationUploading(true);
      setAuthorizationUploadProgress(0);

      const file = authorizationUpload.file;
      const safeType = authorizationUpload.type.replace(/[^a-z0-9-_]/gi, '_');
      const filePath = `authorizations/${appUserId}/${applicationId}/${safeType}-${Date.now()}-${file.name}`;
      const fileRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setAuthorizationUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      const existingRecords = ((application as any)?.authorizationRecords || []) as Array<any>;
      const newRecord = {
        id: `auth-${Date.now()}`,
        type: authorizationUpload.type,
        startDate: authorizationUpload.startDate,
        endDate: authorizationUpload.endDate,
        fileName: file.name,
        downloadURL,
        uploadedAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email || 'Admin'
      };

      await setDoc(docRef, { authorizationRecords: [...existingRecords, newRecord] }, { merge: true });

      toast({
        title: 'Authorization Uploaded',
        description: `${authorizationUpload.type} authorization saved.`
      });

      setAuthorizationUpload({
        type: '',
        startDate: '',
        endDate: '',
        file: null
      });
      setAuthorizationUploadProgress(0);
    } catch (uploadError) {
      console.error('Authorization upload failed:', uploadError);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: 'Could not upload the authorization.'
      });
    } finally {
      setAuthorizationUploading(false);
    }
  };

  const handleIspUpload = async () => {
    if (!application || !docRef || !storage || !firestore) return;

    if (!ispUpload.planDate) {
      toast({
        variant: 'destructive',
        title: 'Missing Date',
        description: 'Enter the ISP date.'
      });
      return;
    }

    if (!ispUpload.file) {
      toast({
        variant: 'destructive',
        title: 'Missing File',
        description: 'Upload the ISP document.'
      });
      return;
    }

    try {
      setIspUploading(true);
      setIspUploadProgress(0);

      const file = ispUpload.file;
      const safeDate = ispUpload.planDate.replace(/[^0-9-]/g, '');
      const filePath = `isps/${appUserId}/${applicationId}/${safeDate}-${Date.now()}-${file.name}`;
      const fileRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setIspUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      const existingRecords = ((application as any)?.ispRecords || []) as Array<any>;
      const newRecord = {
        id: `isp-${Date.now()}`,
        planDate: ispUpload.planDate,
        fileName: file.name,
        downloadURL,
        uploadedAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email || 'Admin'
      };

      await setDoc(docRef, { ispRecords: [...existingRecords, newRecord] }, { merge: true });

      toast({
        title: 'ISP Uploaded',
        description: 'Individual Service Plan saved.'
      });

      setIspUpload({
        planDate: '',
        file: null
      });
      setIspUploadProgress(0);
    } catch (uploadError) {
      console.error('ISP upload failed:', uploadError);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: 'Could not upload the ISP.'
      });
    } finally {
      setIspUploading(false);
    }
  };

  useEffect(() => {
    const notifyExpiringAuthorizations = async () => {
      if (!firestore || !docRef) return;
      if (authorizationRecords.length === 0) return;

      const deydry = staffList.find((staff) =>
        staff.name?.toLowerCase().includes('deydry')
      );
      if (!deydry) return;

      const memberName = `${application?.memberFirstName} ${application?.memberLastName}`;
      const clientId2 = (application as any)?.client_ID2 || application?.id;
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(threshold.getDate() + 30);

      let hasUpdates = false;
      const updatedRecords = authorizationRecords.map((record) => {
        if (!record.endDate || record.expiryNotifiedAt) return record;
        const endDate = new Date(record.endDate);
        if (Number.isNaN(endDate.getTime())) return record;
        if (endDate <= threshold) {
          hasUpdates = true;
          return { ...record, expiryNotifiedAt: new Date().toISOString() };
        }
        return record;
      });

      if (!hasUpdates) return;

      try {
        const expiringRecords = authorizationRecords.filter((record) => {
          if (!record.endDate || record.expiryNotifiedAt) return false;
          const endDate = new Date(record.endDate);
          if (Number.isNaN(endDate.getTime())) return false;
          return endDate <= threshold;
        });

        await Promise.all(
          expiringRecords.map((record) =>
            addDoc(collection(firestore, 'staff_notifications'), {
              userId: deydry.uid,
              title: `Authorization expiring soon: ${memberName}`,
              message: `${record.type || 'Authorization'} expires on ${formatAuthorizationDate(record.endDate)}.`,
              memberName,
              clientId2,
              type: 'authorization_expiry',
              priority: 'Urgent',
              status: 'Open',
              isRead: false,
              createdBy: user?.uid || 'system',
              createdByName: user?.displayName || user?.email || 'System',
              senderName: user?.displayName || user?.email || 'System',
              timestamp: serverTimestamp(),
              actionUrl: `/admin/applications/${applicationId}?userId=${appUserId}`
            })
          )
        );

        await setDoc(docRef, { authorizationRecords: updatedRecords }, { merge: true });
      } catch (error) {
        console.error('Failed to notify expiring authorizations:', error);
      }
    };

    notifyExpiringAuthorizations();
  }, [authorizationRecords, staffList, firestore, docRef, application, appUserId, applicationId, user]);

  useEffect(() => {
    const notifyFollowUps = async () => {
      if (!firestore || !docRef || interofficeNotes.length === 0) return;
      const today = new Date();

      const pendingNotes = interofficeNotes.filter((note) => {
        if (!note.followUpDate || note.followUpNotifiedAt) return false;
        const followUp = new Date(note.followUpDate);
        if (Number.isNaN(followUp.getTime())) return false;
        return followUp <= today;
      });

      if (pendingNotes.length === 0) return;

      try {
        const memberName = `${application?.memberFirstName} ${application?.memberLastName}`;
        const clientId2 = (application as any)?.client_ID2 || application?.id;

        await Promise.all(
          pendingNotes.map((note) =>
            addDoc(collection(firestore, 'staff_notifications'), {
              userId: note.recipientId,
              title: `Follow-up due: ${memberName}`,
              message: note.message || 'Follow-up is due.',
              memberName,
              clientId2,
              type: 'interoffice_followup',
              priority: 'High',
              status: 'Open',
              isRead: false,
              createdBy: user?.uid || 'system',
              createdByName: user?.displayName || user?.email || 'System',
              senderName: user?.displayName || user?.email || 'System',
              timestamp: serverTimestamp(),
              actionUrl: `/admin/applications/${applicationId}?userId=${appUserId}`
            })
          )
        );

        const updatedNotes = interofficeNotes.map((note) => {
          if (!note.followUpDate || note.followUpNotifiedAt) return note;
          const followUp = new Date(note.followUpDate);
          if (Number.isNaN(followUp.getTime()) || followUp > today) return note;
          return { ...note, followUpNotifiedAt: new Date().toISOString() };
        });

        await setDoc(docRef, { interofficeNotes: updatedNotes }, { merge: true });
      } catch (error) {
        console.error('Failed to send follow-up reminders:', error);
      }
    };

    notifyFollowUps();
  }, [interofficeNotes, firestore, docRef, application, appUserId, applicationId, user]);

  // Auto-assign staff useEffect temporarily disabled to prevent endless looping
  // useEffect(() => {
  //   const checkAutoAssignment = async () => {
  //     if (!application || (application as any)?.assignedStaff) return;
  //     
  //     const settings = localStorage.getItem('staffAssignmentNotificationSettings');
  //     if (settings) {
  //       try {
  //         const parsedSettings = JSON.parse(settings);
  //         if (parsedSettings.enabled && parsedSettings.autoAssignmentEnabled) {
  //           console.log('🤖 Auto-assigning staff for application:', application.id);
  //           setTimeout(() => {
  //             handleStaffAssignment();
  //           }, 2000);
  //         }
  //       } catch (error) {
  //         console.error('Error parsing auto-assignment settings:', error);
  //       }
  //     }
  //   };
  //
  //   checkAutoAssignment();
  // }, [application]);
  
    const handleFormStatusUpdate = async (updates: Partial<FormStatusType>[]) => {
      if (!docRef || !application) return;

      const existingForms = new Map(application.forms?.map(f => [f.name, f]) || []);
      
      updates.forEach(update => {
          const existingForm = existingForms.get(update.name!);
          if (existingForm) {
              // Staff internal uploads should not trigger "needs review" notifications.
              const shouldAutoAcknowledge = update.status === 'Completed' && Boolean(update.filePath || update.downloadURL);
              existingForms.set(update.name!, {
                ...existingForm,
                ...update,
                ...(shouldAutoAcknowledge ? { acknowledged: true } : {})
              });
          } else if (update.name) {
              const shouldAutoAcknowledge = update.status === 'Completed' && Boolean((update as any).filePath || (update as any).downloadURL);
              existingForms.set(update.name, {
                name: update.name,
                status: update.status || 'Pending',
                ...update,
                ...(shouldAutoAcknowledge ? { acknowledged: true } : {})
              });
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
              lastDocumentUpload: serverTimestamp(),
              // Derived fields for staff review workflows
              pendingDocReviewCount,
              pendingDocReviewUpdatedAt: serverTimestamp(),
          }, { merge: true });
      } catch (e: any) {
          console.error("Failed to update form status:", e);
          toast({ variant: 'destructive', title: 'Update Error', description: 'Could not update form status.' });
      }
  };

  const formatMemberName = () => {
    const firstName = String(application?.memberFirstName || '').trim();
    const lastName = String(application?.memberLastName || '').trim();
    if (lastName && firstName) return `${lastName}, ${firstName}`;
    if (lastName) return lastName;
    if (firstName) return firstName;
    return 'Member';
  };

  const getDocumentLabel = (formName: string) => {
    const labels: Record<string, string> = {
      'CS Member Summary': 'CS Summary Form',
      'CS Summary': 'CS Summary Form',
      'Waivers & Authorizations': 'Waivers',
      'Room and Board Commitment': 'Room and Board Commitment',
      'Proof of Income': 'Proof of Income',
      "LIC 602A - Physician's Report": 'LIC 602A',
      'Medicine List': 'Med List',
      'SNF Facesheet': 'SNF Facesheet',
      'Eligibility Screenshot': 'Eligibility Screenshot',
      'Declaration of Eligibility': 'Declaration of Eligibility',
      consolidated_medical: 'Medical Documents'
    };
    return labels[formName] || formName;
  };

  const getFileExtension = (fileName: string) => {
    const idx = fileName.lastIndexOf('.');
    if (idx <= 0) return '';
    return fileName.slice(idx).toLowerCase();
  };

  const sanitizeFileComponent = (value: string) =>
    value.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, ' ');

  const buildStandardFileName = (formName: string, originalFileName: string) => {
    const memberName = sanitizeFileComponent(formatMemberName());
    const label = sanitizeFileComponent(getDocumentLabel(formName));
    const ext = getFileExtension(originalFileName);
    return `${memberName} - ${label}${ext}`;
  };

  const buildStorageFileName = (standardFileName: string) =>
    standardFileName.replace(/[^\w.-]/g, '_');

  const getComponentStatus = (componentKey: string): 'Completed' | 'Pending' | 'Not Applicable' => {
    const form = application?.forms?.find(f => f.name === componentKey);

    if (componentKey === 'Eligibility Check') {
      return (application as any)?.calaimTrackingStatus ? 'Completed' : 'Pending';
    }
    if (componentKey === 'Sent to Caspio') {
      return (application as any)?.caspioSent ? 'Completed' : 'Pending';
    }
    if (componentKey === 'Declaration of Eligibility' && application?.pathway !== 'SNF Diversion') {
      return 'Not Applicable';
    }
    if (componentKey === 'SNF Facesheet' && application?.pathway !== 'SNF Transition') {
      return 'Not Applicable';
    }

    if (form?.status === 'Completed') {
      return 'Completed';
    }

    return 'Pending';
  };

  const doUpload = async (files: File[], requirementTitle: string) => {
      if (!storage || !applicationId || !currentUserId) {
        console.error('Upload prerequisites missing:', { storage: !!storage, applicationId, currentUserId });
        throw new Error('Upload configuration error: Missing storage, application ID, or user ID');
      }
      await ensureAdminClaim();

      const file = files[0];
      
      // Validate file
      if (!file) {
        throw new Error('No file selected');
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File size exceeds 10MB limit');
      }

      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif'
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error(`File type "${file.type}" not supported. Please upload PDF, Word documents, or images.`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const standardFileName = buildStandardFileName(requirementTitle, file.name);
      const safeFileName = buildStorageFileName(standardFileName);
      const uploadRoot = appUserId
        ? `user_uploads/${appUserId}`
        : `documents/applications/${applicationId}`;
      const storagePath = `${uploadRoot}/${requirementTitle}/${timestamp}_${safeFileName}`;
      const storageRef = ref(storage, storagePath);

      console.log('🔄 Starting file upload:', {
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        fileType: file.type,
        storagePath,
        appUserId,
        applicationId
      });

      return new Promise<{ downloadURL: string, path: string, fileName: string }>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, file);

          // Set timeout for upload
          const timeout = setTimeout(() => {
            console.error('❌ Upload timeout after 5 minutes');
            reject(new Error('Upload timeout - please try again with a smaller file'));
          }, 5 * 60 * 1000);

          uploadTask.on('state_changed',
              (snapshot) => {
                  const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                  console.log(`📊 Upload progress: ${progress.toFixed(1)}%`);
                  setUploadProgress(prev => ({ ...prev, [requirementTitle]: progress }));
              },
              (error) => {
                  clearTimeout(timeout);
                  console.error('❌ Upload error:', error);
                  
                  // Provide more specific error messages
                  let errorMessage = 'Upload failed';
                  if (error.code === 'storage/unauthorized') {
                    errorMessage = 'Upload permission denied. Please contact support.';
                  } else if (error.code === 'storage/canceled') {
                    errorMessage = 'Upload was canceled';
                  } else if (error.code === 'storage/unknown') {
                    errorMessage = 'Unknown upload error. Please try again.';
                  } else if (error.code === 'storage/invalid-format') {
                    errorMessage = 'Invalid file format';
                  } else if (error.code === 'storage/invalid-argument') {
                    errorMessage = 'Invalid upload parameters';
                  }
                  
                  reject(new Error(errorMessage));
              },
              async () => {
                  clearTimeout(timeout);
                  try {
                      console.log('✅ Upload completed, getting download URL...');
                      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                      console.log('✅ Download URL obtained:', downloadURL);
                      resolve({ downloadURL, path: storagePath, fileName: standardFileName });
                  } catch (error) {
                      console.error('❌ Error getting download URL:', error);
                      reject(new Error('Upload completed but failed to get download URL'));
                  }
              }
          );
      });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, requirementTitle: string) => {
    if (!event.target.files?.length || !appUserId) return;
    const files = Array.from(event.target.files);
    
    setUploading(prev => ({ ...prev, [requirementTitle]: true }));
    setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
    
    try {
        const uploadResult = await doUpload(files, requirementTitle);
        if (uploadResult) {
            await handleFormStatusUpdate([{
                name: requirementTitle,
                status: 'Completed',
                type: 'Upload',
                fileName: uploadResult.fileName,
                filePath: uploadResult.path,
                downloadURL: uploadResult.downloadURL,
                dateCompleted: Timestamp.now(),
            }]);
            toast({ title: 'Upload Successful', description: `${requirementTitle} has been uploaded.` });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload file.' });
    } finally {
        setUploading(prev => ({ ...prev, [requirementTitle]: false }));
        setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
        event.target.value = '';
    }
  };

  const handleConsolidatedUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length || !appUserId) return;
    const files = Array.from(event.target.files);

    const formsToUpdate = Object.entries(consolidatedUploadChecks)
      .filter(([, isChecked]) => isChecked)
      .map(([formName]) => formName);
      
    if (formsToUpdate.length === 0) return;

    const consolidatedId = 'consolidated-medical-upload';
    setUploading(prev => ({ ...prev, [consolidatedId]: true }));
    setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));

    try {
        // We'll just use the first file's name for display purposes if multiple are selected
        const file = files[0];
        const uploadResult = await doUpload(files, 'consolidated_medical');
        if (uploadResult) {
            const updates: Partial<FormStatusType>[] = formsToUpdate.map(formName => ({
                name: formName,
                status: 'Completed',
                type: 'Upload',
                fileName: buildStandardFileName(formName, file.name),
                filePath: uploadResult.path,
                downloadURL: uploadResult.downloadURL,
                dateCompleted: Timestamp.now(),
            }));
            await handleFormStatusUpdate(updates);
            toast({ title: 'Upload Successful', description: 'Consolidated documents have been uploaded.' });
        }
    } catch(error) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload consolidated documents.' });
    } finally {
        setUploading(prev => ({ ...prev, [consolidatedId]: false }));
        setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));
        setConsolidatedUploadChecks({ 'LIC 602A - Physician\'s Report': false, 'Medicine List': false, 'SNF Facesheet': false, 'Declaration of Eligibility': false });
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
          toast({ title: 'File Removed', description: `${form.fileName} has been removed.` });
      } catch (error) {
          console.error("Error removing file:", error);
          const errorCode = (error as any)?.code;
          await handleFormStatusUpdate([{ name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null }]);
          if (errorCode === 'storage/unauthorized') {
            toast({ title: 'File Reset', description: 'Access denied to delete the original file. The card was reset so you can re-upload.' });
            return;
          }
          toast({ variant: 'destructive', title: 'Error', description: 'Could not remove file. It may have already been deleted.' });
      }
  };

  const markFormAsComplete = async (formName: string) => {
    if (!application || !applicationId || !appUserId) return;
    
    try {
      await handleFormStatusUpdate([{
        name: formName,
        status: 'Completed',
        fileName: 'Marked complete by admin',
        dateCompleted: Timestamp.now(),
        completedBy: user?.displayName || 'Admin'
      }]);
      
      toast({
        title: 'Form Marked Complete',
        description: `${formName} has been marked as completed.`,
        className: "bg-green-100 text-green-900 border-green-200",
      });
    } catch (error) {
      console.error('Error marking form as complete:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not mark form as complete. Please try again.',
      });
    }
  };

  if (isLoading || isUserLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Details...</p>
        </div>
    );
  }

  if (error) {
     return (
        <div className="flex items-center justify-center h-full">
            <p className="text-destructive">Error: {error.message}</p>
        </div>
     );
  }
  
  if (!application) {
    return (
        <div className="flex items-center justify-center h-full">
          <p>{applicationId ? 'Application not found.' : 'No application ID provided.'}</p>
        </div>
    );
  }
  
  const pathwayRequirements = getPathwayRequirements(
    application.pathway as 'SNF Transition' | 'SNF Diversion',
    application.healthPlan
  );
  const eligibilityRequirementIds = new Set(['eligibility-screenshot', 'declaration-of-eligibility']);
  const eligibilityRequirements = pathwayRequirements.filter(req => eligibilityRequirementIds.has(req.id));
  const formStatusMap = new Map(application.forms?.map(f => [f.name, f]));
  
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const form = formStatusMap.get(req.title);
    if (form?.status === 'Completed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  const waiverFormStatus = formStatusMap.get('Waivers & Authorizations') as FormStatusType | undefined;
  const servicesDeclined = waiverFormStatus?.choice === 'decline';

  // "New CS Summary" indicator: CS Summary completed in last 24h and not yet reviewed
  const csSummaryForm = (application.forms || []).find(
    (form: any) =>
      (form.name === 'CS Member Summary' || form.name === 'CS Summary') &&
      form.status === 'Completed' &&
      form.dateCompleted
  ) as any;
  const csSummaryCompletedAt: Date | null = (() => {
    const raw = csSummaryForm?.dateCompleted;
    if (!raw) return null;
    if (typeof raw?.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  const isNewCsSummary =
    Boolean(csSummaryCompletedAt) &&
    !application.applicationChecked &&
    Date.now() - (csSummaryCompletedAt as Date).getTime() < 24 * 60 * 60 * 1000;

  const needsUrgentAttention = application.hasLegalRep === 'no_has_rep';

  const completedForms = (application.forms || []).filter((form) => form.status === 'Completed');
  const pendingFormAlerts = completedForms.filter((form) => {
    const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
    if (isSummary) {
      return !application.applicationChecked;
    }
    return !form.acknowledged;
  });

  const getReviewerMeta = (reqTitle: string, formInfo?: any) => {
    const isSummary = reqTitle === 'CS Member Summary' || reqTitle === 'CS Summary';
    const rawName = isSummary ? (application as any)?.applicationCheckedBy : formInfo?.acknowledgedBy;
    const rawDate = isSummary ? (application as any)?.applicationCheckedDate : formInfo?.acknowledgedDate;

    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : '';
    const iso = typeof rawDate === 'string' && rawDate.trim() ? rawDate.trim() : '';

    let dateLabel = '';
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        dateLabel = format(d, 'MMM d, yyyy');
      }
    }

    return { name, dateLabel };
  };

  const handleApplicationReviewed = async (checked: boolean) => {
    try {
      const hasCompletedSummary = (application.forms || []).some((form: any) => {
        const name = String(form?.name || '').trim();
        const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
        return isSummary && form?.status === 'Completed';
      });
      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      const updateData = {
        applicationChecked: checked,
        applicationCheckedDate: checked ? new Date().toISOString() : null,
        applicationCheckedBy: checked ? reviewerName : null,
        applicationCheckedByUid: checked ? reviewerUid : null,
        // Derived field for staff review workflows
        pendingCsReview: !checked && hasCompletedSummary,
      };

      if (docRef) {
        await setDoc(docRef, updateData, { merge: true });
        setApplication(prev => prev ? { ...prev, ...updateData } : null);

        toast({
          title: checked ? "Application Marked as Checked" : "Application Check Removed",
          description: checked ? "Application has been marked as reviewed" : "Application check status removed",
        });
      }
    } catch (error) {
      console.error('Error updating application checked status:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update application status",
      });
    }
  };

  const handleFormReviewed = async (formName: string, checked: boolean) => {
    if (!docRef) return;
    try {
      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      const updatedForms = (application.forms || []).map((form) =>
        form.name === formName
          ? {
              ...form,
              acknowledged: checked,
              acknowledgedBy: checked ? reviewerName : null,
              acknowledgedByUid: checked ? reviewerUid : null,
              acknowledgedDate: checked ? new Date().toISOString() : null,
            }
          : form
      );

      const pendingDocReviewCount = updatedForms.filter((form: any) => {
        const isCompleted = form?.status === 'Completed';
        const name = String(form?.name || '').trim();
        const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
        const acknowledged = Boolean(form?.acknowledged);
        return isCompleted && !isSummary && !acknowledged;
      }).length;

      await setDoc(docRef, {
        forms: updatedForms,
        pendingDocReviewCount,
        pendingDocReviewUpdatedAt: serverTimestamp(),
      }, { merge: true });
      setApplication(prev => prev ? { ...prev, forms: updatedForms } : null);

      toast({
        title: checked ? 'Document marked as reviewed' : 'Review removed',
        description: `${formName} ${checked ? 'acknowledged' : 'set back to pending'}.`,
      });
    } catch (error) {
      console.error('Error updating form review status:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update document review status",
      });
    }
  };

  const waiverSubTasks = [
      { id: 'hipaa', label: 'HIPAA Authorization', completed: !!waiverFormStatus?.ackHipaa },
      { id: 'liability', label: 'Liability Waiver', completed: !!waiverFormStatus?.ackLiability },
      { id: 'foc', label: 'Freedom of Choice', completed: !!waiverFormStatus?.ackFoc }
  ];
  
    const consolidatedMedicalDocuments = [
      { id: 'lic-602a-check', name: "LIC 602A - Physician's Report" },
      { id: 'med-list-check', name: 'Medicine List' },
      { id: 'facesheet-check', name: 'SNF Facesheet' },
      { id: 'decl-elig-check', name: 'Declaration of Eligibility' },
  ].filter(doc => pathwayRequirements.some(req => req.title === doc.name));

  // Update application progression status
  const updateProgressionStatus = async (status: string, statusType: 'kaiser' | 'healthNet') => {
    if (!docRef || !application) return;
    
    setIsUpdatingProgression(true);
    try {
      const updateData = statusType === 'kaiser' 
        ? { kaiserStatus: status }
        : { healthNetStatus: status };
      
      await setDoc(docRef, updateData, { merge: true });
      
      // Update local state
      setApplication(prev => prev ? { ...prev, ...updateData } : null);

      if (statusType === 'kaiser') {
        const oldSuggested = String(kaiserNextStatus || '').trim();
        const currentNext = String((staffTracker as any)?.nextStep || '').trim();
        const idx = kaiserWorkflowOptions.findIndex((s) => s === status);
        const next = idx !== -1 && idx < kaiserWorkflowOptions.length - 1 ? String(kaiserWorkflowOptions[idx + 1] || '').trim() : '';
        // Only auto-update nextStep if it was empty OR it matched the previous suggestion.
        if (next && (!currentNext || currentNext === oldSuggested)) {
          updateStaffTracker({ nextStep: next } as any);
          if (!nextStepDateInputValue) setNextStepDateMissing(true);
        }
      } else if (statusType === 'healthNet') {
        const oldSuggested = String(healthNetNextStatus || '').trim();
        const currentNext = String((staffTracker as any)?.nextStep || '').trim();
        const idx = healthNetSteps.findIndex((s) => s === status);
        const next = idx !== -1 && idx < healthNetSteps.length - 1 ? String(healthNetSteps[idx + 1] || '').trim() : '';
        if (next && (!currentNext || currentNext === oldSuggested)) {
          updateStaffTracker({ nextStep: next } as any);
          if (!nextStepDateInputValue) setNextStepDateMissing(true);
        }
      }
      
      toast({
        title: "Status Updated",
        description: `${statusType === 'kaiser' ? 'Kaiser' : 'Health Net'} progression status updated to: ${status}`,
        className: "bg-green-100 text-green-900 border-green-200",
      });
    } catch (error: any) {
      console.error('Error updating progression status:', error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update progression status. Please try again.",
      });
    } finally {
      setIsUpdatingProgression(false);
    }
  };

  const updateTrackingStatus = async (status: string) => {
    if (!docRef || !application) return;

    setIsUpdatingTracking(true);
    try {
      const updateData = {
        calaimTrackingStatus: status,
        calaimTrackingReason:
          status === 'Not CalAIM Eligible'
            ? (application as any)?.calaimTrackingReason || ''
            : '',
        calaimNotEligibleSwitchingProviders:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleSwitchingProviders)
            : false,
        calaimNotEligibleHasSoc:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleHasSoc)
            : false,
        calaimNotEligibleOutOfCounty:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleOutOfCounty)
            : false,
        calaimNotEligibleOther:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleOther)
            : false,
        calaimNotEligibleOtherReason:
          status === 'Not CalAIM Eligible'
            ? (application as any)?.calaimNotEligibleOtherReason || ''
            : ''
      };

      await setDoc(docRef, updateData, { merge: true });
      setApplication(prev => prev ? { ...prev, ...updateData } : null);

      toast({
        title: 'Tracking Updated',
        description: `Application tracking set to: ${status}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Error updating tracking status:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update application tracking. Please try again.',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const updateTrackingReason = async (reason: string) => {
    if (!docRef || !application) return;

    setIsUpdatingTracking(true);
    try {
      const updateData = { calaimTrackingReason: reason };
      await setDoc(docRef, updateData, { merge: true });
      setApplication(prev => prev ? { ...prev, ...updateData } : null);
    } catch (error) {
      console.error('Error updating tracking reason:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update eligibility reason. Please try again.',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const updateNotEligibleFlags = async (updates: {
    calaimNotEligibleSwitchingProviders?: boolean;
    calaimNotEligibleHasSoc?: boolean;
    calaimNotEligibleOutOfCounty?: boolean;
    calaimNotEligibleOther?: boolean;
    calaimNotEligibleReason?: string;
    calaimNotEligibleOtherReason?: string;
  }) => {
    if (!docRef || !application) return;
    setIsUpdatingTracking(true);
    try {
      const updateData = { ...updates };
      await setDoc(docRef, updateData, { merge: true });
      setApplication(prev => prev ? { ...prev, ...updateData } : null);
    } catch (error) {
      console.error('Error updating not-eligible flags:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update eligibility flags. Please try again.',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const sendEligibilityNote = async () => {
    if (!application?.referrerEmail) {
      toast({ variant: 'destructive', title: 'Error', description: 'Referrer email is not available for this application.' });
      return;
    }
    const note = String((application as any)?.calaimTrackingReason || '').trim();
    if (!note) {
      toast({ variant: 'destructive', title: 'Missing Note', description: 'Add a note before sending.' });
      return;
    }
    setIsSendingEligibilityNote(true);
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: application.referrerEmail,
          subject: `CalAIM Eligibility Update for ${application.memberFirstName} ${application.memberLastName}`,
          memberName: application.referrerName || 'there',
          staffName: 'The Connections Team',
          message: note,
          status: (application.status || 'In Progress') as any
        })
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to send note');
      }
      toast({
        title: 'Note Sent',
        description: 'Your eligibility note was sent to the referrer.',
        className: 'bg-green-100 text-green-900 border-green-200'
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error.message || 'Could not send the eligibility note.'
      });
    } finally {
      setIsSendingEligibilityNote(false);
    }
  };

  // Handle staff assignment - TEMPORARILY DISABLED
  const handleStaffAssignment = async () => {
    console.log('🚫 Staff assignment is temporarily disabled to prevent looping');
    return; // Early return to disable functionality
    
    if (!docRef || !application) return;
    
    setIsUpdatingProgression(true);
    try {
      const response = await fetch('/api/staff-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: application.id,
          memberFirstName: application.memberFirstName,
          memberLastName: application.memberLastName,
          memberEmail: application.memberEmail || '',
          healthPlan: application.healthPlan,
          pathway: application.pathway
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        const updateData = {
          assignedStaffId: data.assignedStaffId,
          assignedStaffName: data.assignedStaffName,
          assignedStaffEmail: data.assignedStaffEmail,
          assignedDate: new Date().toISOString()
        };
        
        await setDoc(docRef, updateData, { merge: true });
        
        // Update local state
        setApplication(prev => prev ? { ...prev, ...updateData } : null);
        
        toast({
          title: "Staff Assigned",
          description: `Application assigned to ${data.assignedStaffName} (${data.assignedStaffEmail})`,
          className: "bg-green-100 text-green-900 border-green-200",
        });

        // Show success notification with assignment details
        if (data.notificationSent) {
          setTimeout(() => {
            toast({
              title: "🔔 Notification Sent",
              description: `${data.assignedStaff.name} has been notified of the new assignment via email and system notifications.`,
              className: "bg-blue-100 text-blue-900 border-blue-200",
            });
          }, 1500);
        }
        
      } else {
        throw new Error(data.error || 'Failed to assign staff');
      }
    } catch (error: any) {
      console.error('Error assigning staff:', error);
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: "Could not assign staff. Please try again.",
      });
    } finally {
      setIsUpdatingProgression(false);
    }
  };
  
  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = formInfo?.status === 'Completed';

    let baseQueryParams = `?applicationId=${applicationId}&userId=${appUserId}`;
    let viewHref = req.href ? `${req.href}${baseQueryParams}` : '#';
    let editHref = req.editHref ? `${req.editHref}${baseQueryParams}` : viewHref;

    if (isCompleted && req.editHref) {
      viewHref = editHref; // If completed, view and edit might be the same
    }

    const isUploading = uploading[req.title];
    const currentProgress = uploadProgress[req.title];
    const isMultiple = req.title === 'Proof of Income' || req.title === 'Eligibility Screenshot';

    const recommendedFileName = buildStandardFileName(req.title, 'document.pdf');

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
                        <Button asChild variant="secondary" className="w-full">
                          <Link href={viewHref}>View/Edit Waivers</Link>
                      </Button>
                    </div>
                );
            }
            return (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100 flex-1">
                        <Link href={viewHref}>View</Link>
                    </Button>
                    {req.editHref && (
                      <Button asChild variant="secondary" className="flex-1">
                          <Link href={editHref}>Edit</Link>
                      </Button>
                    )}
                </div>
            );
        case 'Upload':
             if (formInfo?.status === 'Completed') {
                 return (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        {formInfo.downloadURL ? (
                            <a href={formInfo.downloadURL} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-green-800 font-medium hover:underline">
                                {formInfo?.fileName || 'Completed'}
                            </a>
                        ) : (
                            <span className="truncate flex-1 text-green-800 font-medium">{formInfo?.fileName || 'Completed'}</span>
                        )}
                         <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleFileRemove(formInfo)}>
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
                    {req.id === 'eligibility-screenshot' && 'links' in req && req.links && (
                        <div className="flex flex-col space-y-1">
                            {(req.links as { name: string; url: string }[]).map(link => (
                                <Button key={link.name} asChild variant="link" size="sm" className="h-auto justify-start p-0 text-xs">
                                    <Link href={link.url} target="_blank" rel="noopener noreferrer">
                                        <LinkIcon className="mr-1 h-3 w-3"/> {link.name}
                                    </Link>
                                </Button>
                            ))}
                        </div>
                    )}
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", isUploading && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading} multiple={isMultiple} />
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
    <div className="grid w-full min-w-0 grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 min-w-0 space-y-8">
         {servicesDeclined && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Services Declined</AlertTitle>
                <AlertDescription>
                    The member or their representative has declined Community Support services in the Freedom of Choice waiver. Immediate follow-up may be required.
                </AlertDescription>
            </Alert>
        )}
        {needsUrgentAttention && (
             <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Urgent Attention Required</AlertTitle>
                <AlertDescription>
                    The member has been identified as not having the capacity to make their own decisions, and no legal representative has been assigned. This requires immediate administrative review.
                </AlertDescription>
            </Alert>
        )}
        <Card className="shadow-sm">
            <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold text-primary flex items-center gap-2">
                Application for {application.memberFirstName} {application.memberLastName}
                {(application as any)?.calaimTrackingStatus === 'CalAIM Eligible' && (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                )}
                {(application as any)?.calaimTrackingStatus === 'Not CalAIM Eligible' && (
                    <span title="Not CalAIM Eligible">
                        <CheckCircle2 className="h-6 w-6 text-red-600" />
                    </span>
                )}
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardDescription>
                Submitted by {application.referrerName || user?.displayName} | {application.pathway} ({application.healthPlan})
                </CardDescription>
            </div>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="truncate"><strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span></div>
                <div><strong>Submission Status:</strong> <span className="font-semibold">{application.status}</span></div>
            </div>
            
            {/* Notification Status Icons */}
            <div className="flex items-center gap-4 pt-2 border-t">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div className="leading-tight">
                      <div className="text-xs font-medium">
                        {(application as any)?.emailRemindersEnabled === true ? 'Email reminders: On' : 'Email reminders: Off'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {(application as any)?.emailRemindersEnabled === true
                          ? documentReminderFrequencyDays === 7
                            ? 'Weekly'
                            : 'Every 2 days'
                          : 'None'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isUpdatingReminderControls && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={Boolean((application as any)?.emailRemindersEnabled)}
                      onCheckedChange={(enabled) => updateReminderSettings({ emailRemindersEnabled: Boolean(enabled) })}
                      disabled={isUpdatingReminderControls}
                    />
                  </div>
                  <Select
                    value={Boolean((application as any)?.emailRemindersEnabled) ? String(documentReminderFrequencyDays) : 'none'}
                    onValueChange={(v) => {
                      if (v === 'none') {
                        updateReminderSettings({ emailRemindersEnabled: false });
                        return;
                      }
                      updateReminderSettings({
                        emailRemindersEnabled: true,
                        documentReminderFrequencyDays: Number(v),
                      });
                    }}
                    disabled={isUpdatingReminderControls}
                  >
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {reminderFrequencyOptions.map((d) => (
                        <SelectItem key={`doc-freq-${d}`} value={String(d)}>
                          {d === 7 ? 'Weekly' : 'Every 2 days'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <div className="leading-tight">
                      <div className="text-xs font-medium">
                        {(application as any)?.statusRemindersEnabled === true ? 'Status updates: On' : 'Status updates: Off'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {(application as any)?.statusRemindersEnabled === true
                          ? statusReminderFrequencyDays === 2
                            ? 'Every 2 days'
                            : 'Weekly'
                          : 'None'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isUpdatingReminderControls && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={Boolean((application as any)?.statusRemindersEnabled)}
                      onCheckedChange={(enabled) => updateReminderSettings({ statusRemindersEnabled: Boolean(enabled) })}
                      disabled={isUpdatingReminderControls}
                    />
                  </div>
                  <Select
                    value={Boolean((application as any)?.statusRemindersEnabled) ? String(statusReminderFrequencyDays) : 'none'}
                    onValueChange={(v) => {
                      if (v === 'none') {
                        updateReminderSettings({ statusRemindersEnabled: false });
                        return;
                      }
                      updateReminderSettings({
                        statusRemindersEnabled: true,
                        statusReminderFrequencyDays: Number(v),
                      });
                    }}
                    disabled={isUpdatingReminderControls}
                  >
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {reminderFrequencyOptions.map((d) => (
                        <SelectItem key={`status-freq-${d}`} value={String(d)}>
                          {d === 7 ? 'Weekly' : 'Every 2 days'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Application Progression Field */}
            {/* Application progression moved to Quick actions */}

            <div className="space-y-2">
                <Label className="text-sm font-medium">Documents needing acknowledgement</Label>
                {pendingFormAlerts.length === 0 ? (
                    <div className="text-xs text-muted-foreground ml-6">No documents pending acknowledgement.</div>
                ) : (
                    <div className="space-y-1 ml-6">
                        {pendingFormAlerts.map((form) => (
                            <div key={`${form.name}-${form.status}-${form.dateCompleted?.seconds || form.dateCompleted || ''}`} className="flex items-center gap-2 text-sm">
                                <span className="h-2 w-2 rounded-full bg-blue-600" />
                                {form.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Staff assignment moved to Quick actions */}
            <Card className="border-dashed">
            <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Assigned staff</div>
                    <div className="font-medium">{(application as any)?.assignedStaffName || 'Unassigned'}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {application.healthPlan?.toLowerCase().includes('kaiser')
                      ? `Progression: ${(application as any)?.kaiserStatus || kaiserSteps[0]}`
                      : application.healthPlan?.toLowerCase().includes('health net')
                        ? `Progression: ${(application as any)?.healthNetStatus || healthNetSteps[0]}`
                        : null}
                  </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">User-Submitted Documents</span>
                          {isNewCsSummary && (
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                              New CS
                            </Badge>
                          )}
                        </div>
                        <span>{completedCount} of {totalCount} required items completed</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {quickStatusItems.map((item) => {
                    const status = getComponentStatus(item.key);
                    if (status === 'Not Applicable') return null;
                    return (
                      <span key={item.key} className="flex items-center gap-1" title={`${item.key}: ${status}`}>
                        {status === 'Completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-orange-500" />
                        )}
                        <span>{item.label}</span>
                      </span>
                    );
                  })}
                </div>
            </CardContent>
            </Card>
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pathwayRequirements.filter(req => !eligibilityRequirementIds.has(req.id)).map((req) => {
                const formInfo = formStatusMap.get(req.title);
                const status = formInfo?.status || 'Pending';
                const isSummary = req.title === 'CS Member Summary' || req.title === 'CS Summary';
                const isReviewed = isSummary
                  ? Boolean((application as any)?.applicationChecked)
                  : Boolean(formInfo?.acknowledged);
                const needsReview = status === 'Completed' && !isReviewed;
                
                return (
                    <Card key={req.id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  {req.title}
                                  {isSummary && isNewCsSummary && (
                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                      New
                                    </Badge>
                                  )}
                                </CardTitle>
                                {status === 'Completed' && (
                                  <div className="flex items-center gap-2">
                                    {isReviewed ? (
                                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">
                                        Reviewed
                                      </Badge>
                                    ) : needsReview ? (
                                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                        Needs review
                                      </Badge>
                                    ) : null}
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        id={`reviewed-${req.id}`}
                                        checked={isReviewed}
                                        onCheckedChange={(checked) => {
                                          if (isSummary) {
                                            handleApplicationReviewed(Boolean(checked));
                                          } else {
                                            handleFormReviewed(req.title, Boolean(checked));
                                          }
                                        }}
                                      />
                                      <Label
                                        htmlFor={`reviewed-${req.id}`}
                                        className="text-xs text-muted-foreground cursor-pointer select-none"
                                      >
                                        {isReviewed ? 'Reviewed' : 'Mark reviewed'}
                                      </Label>
                                    </div>
                                    {isReviewed && (() => {
                                      const meta = getReviewerMeta(req.title, formInfo);
                                      if (!meta.name && !meta.dateLabel) return null;
                                      const parts = [meta.dateLabel, meta.name].filter(Boolean);
                                      return (
                                        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                                          {parts.join(' · ')}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                            </div>
                            <CardDescription>{req.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-grow justify-end gap-4">
                            <StatusIndicator status={status} />
                            {getFormAction(req)}
                            {status === 'Pending' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-green-200 text-green-700 hover:bg-green-50"
                                    onClick={() => markFormAsComplete(req.title)}
                                >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Mark as Complete
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )
            })}
             {consolidatedMedicalDocuments.length > 0 && (
              <Card key="consolidated-medical" className="flex flex-col shadow-sm hover:shadow-md transition-shadow md:col-span-2">
                  <CardHeader className="pb-4">
                      <div className="flex justify-between items-start gap-4">
                          <CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5 text-muted-foreground"/>Consolidated Medical Documents (Optional)</CardTitle>
                      </div>
                      <CardDescription>For convenience, you can upload multiple medical forms at once. Select the documents you are uploading below.</CardDescription>
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
                                      disabled={formStatusMap.get(doc.name)?.status === 'Completed'}
                                  />
                                  <label htmlFor={doc.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                      {doc.name}
                                  </label>
                              </div>
                          ))}
                      </div>
                      <Label htmlFor="consolidated-upload" className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isConsolidatedUploading || !isAnyConsolidatedChecked) && "opacity-50 pointer-events-none")}>
                          {isConsolidatedUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                          <span>{isConsolidatedUploading ? `Uploading... ${consolidatedProgress?.toFixed(0)}%` : 'Upload Consolidated Documents'}</span>
                      </Label>
                      <Input id="consolidated-upload" type="file" className="sr-only" onChange={handleConsolidatedUpload} disabled={isConsolidatedUploading || !isAnyConsolidatedChecked} multiple />
                  </CardContent>
              </Card>
            )}

            {/* Multi Upload Card */}
            <MultiUploadCard
                applicationComponents={pathwayRequirements
                    .filter(req => req.type === 'Upload')
                    .map(req => ({
                        id: req.id,
                        title: req.title,
                        description: req.description,
                        required: true
                    }))
                }
                onUploadComplete={(files) => {
                    // Handle the uploaded files
                    console.log('Uploaded files:', files);
                    // TODO: Update form status for each component
                    files.forEach(({ components, url }) => {
                        const updates = components.map(componentId => {
                            const requirement = pathwayRequirements.find(req => req.id === componentId);
                            return {
                                name: requirement?.title,
                                status: 'Completed' as const,
                                uploadUrl: url
                            };
                        });
                        handleFormStatusUpdate(updates);
                    });
                    
                    toast({
                        title: "Documents Uploaded",
                        description: "Your documents have been successfully uploaded and assigned to the application components.",
                    });
                }}
                className="md:col-span-2"
            />
        </div>
      </div>

      <aside className="lg:col-span-1 min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>
              Keep this page focused. Open tools only when needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Eligibility check & uploads
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Eligibility check</DialogTitle>
                  <DialogDescription>Track CalAIM eligibility status and supporting uploads.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">CalAIM Status</label>
                      {isUpdatingTracking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    <Select
                      value={(application as any)?.calaimTrackingStatus || ''}
                      onValueChange={updateTrackingStatus}
                      disabled={isUpdatingTracking}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select CalAIM status" />
                      </SelectTrigger>
                      <SelectContent>
                        {calaimTrackingOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {(application as any)?.calaimTrackingStatus === 'Not CalAIM Eligible' && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Reason</Label>
                        <Select
                          value={(application as any)?.calaimNotEligibleReason || ''}
                          onValueChange={(value) => {
                            const nextReason = value || '';
                            const nextFlags = {
                              calaimNotEligibleSwitchingProviders: nextReason === 'Switching Providers by end of Month',
                              calaimNotEligibleHasSoc: nextReason === 'Has SOC',
                              calaimNotEligibleOutOfCounty: nextReason === 'Not in our contracted CalAIM County',
                              calaimNotEligibleOther: nextReason === 'Other',
                              calaimNotEligibleReason: nextReason,
                              calaimNotEligibleOtherReason:
                                nextReason === 'Other' ? (application as any)?.calaimNotEligibleOtherReason || '' : '',
                            };
                            setApplication((prev) => (prev ? { ...prev, ...nextFlags } : null));
                            updateNotEligibleFlags(nextFlags);
                          }}
                          disabled={isUpdatingTracking}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {notEligibleReasonOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(application as any)?.calaimNotEligibleReason === 'Other' && (
                          <Textarea
                            id="not-eligible-other-reason"
                            rows={2}
                            placeholder="Describe the reason..."
                            value={(application as any)?.calaimNotEligibleOtherReason || ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setApplication((prev) => (prev ? { ...prev, calaimNotEligibleOtherReason: nextValue } : null));
                            }}
                            onBlur={(event) =>
                              updateNotEligibleFlags({ calaimNotEligibleOtherReason: event.target.value })
                            }
                            disabled={isUpdatingTracking}
                          />
                        )}
                        <div className="space-y-2 pt-2">
                          <Label className="text-sm font-medium">Note to Member (optional)</Label>
                          <Textarea
                            rows={3}
                            placeholder="Add a message that explains the eligibility outcome..."
                            value={(application as any)?.calaimTrackingReason || ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setApplication((prev) => (prev ? { ...prev, calaimTrackingReason: nextValue } : null));
                            }}
                            onBlur={(event) => updateTrackingReason(event.target.value)}
                            disabled={isUpdatingTracking}
                          />
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={sendEligibilityNote}
                            disabled={isSendingEligibilityNote}
                          >
                            {isSendingEligibilityNote ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending Note...
                              </>
                            ) : (
                              'Send Note to Referrer'
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {eligibilityRequirements.length > 0 && (
                    <div className="space-y-3 border-t pt-4">
                      <Label className="text-sm font-medium">Eligibility Uploads</Label>
                      <div className="space-y-3">
                        {eligibilityRequirements.map((req) => {
                          const formInfo = formStatusMap.get(req.title);
                          const status = formInfo?.status || 'Pending';
                          return (
                            <div key={req.id} className="rounded-md border p-3 space-y-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium">{req.title}</div>
                                  <StatusIndicator status={status} />
                                </div>
                                <p className="text-xs text-muted-foreground">{req.description}</p>
                              </div>
                              {getFormAction(req)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <User className="h-4 w-4" />
                  Assigned staff
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Assigned staff</DialogTitle>
                  <DialogDescription>Assign primary staff for this application.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        const memberName = `${application.memberFirstName || ''} ${application.memberLastName || ''}`.trim();
                        const assignedStaff = String((application as any)?.assignedStaffName || '').trim();
                        const assignedStaffId = String((application as any)?.assignedStaffId || '').trim();

                        const rows = [
                          ['applicationId', application.id],
                          ['memberName', memberName],
                          ['assignedStaffName', assignedStaff],
                          ['assignedStaffId', assignedStaffId],
                          ['exportedAt', new Date().toISOString()],
                        ];

                        const csv = rows.map(([k, v]) => `"${String(k).replace(/"/g, '""')}","${String(v).replace(/"/g, '""')}"`).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `assignment-${application.id}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Download
                  </Button>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="main-staff-assignment" className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Assigned Staff
                    </Label>
                    <StaffAssignmentDropdown
                      application={application}
                      onStaffChange={(staffId, staffName) => {
                        setApplication((prev) =>
                          prev
                            ? {
                                ...prev,
                                assignedStaffId: staffId,
                                assignedStaffName: staffName,
                                assignedDate: new Date().toISOString(),
                              }
                            : null
                        );
                        updateStaffTracker({ assignedStaffId: staffId, assignedStaffName: staffName } as any);
                      }}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Target className="h-4 w-4" />
                  Application progression
                  <span className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {String((application as any)?.assignedStaffName || '').trim() || 'Unassigned'}
                    </Badge>
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Application progression</DialogTitle>
                  <DialogDescription>
                    View Caspio workflow status and tracking fields. Updates should be made in the tracker pages (Caspio-backed), not here.
                    <div className="mt-2 text-xs text-muted-foreground">
                      Assigned staff:{' '}
                      <span className="font-medium text-foreground">
                        {String((application as any)?.assignedStaffName || '').trim() || 'Unassigned'}
                      </span>
                    </div>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Workflow status</label>
                      <span className="text-xs text-muted-foreground">{application.healthPlan} workflow</span>
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                      {Boolean((application as any)?.caspioSent) ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">Current status</div>
                              <div className="text-sm font-medium">
                                {String(
                                  (application as any)?.healthPlan?.toLowerCase?.().includes('kaiser')
                                    ? ((application as any)?.kaiserStatus || '')
                                    : (application as any)?.healthPlan?.toLowerCase?.().includes('health net')
                                      ? ((application as any)?.healthNetStatus || '')
                                      : ''
                                ).trim() || '—'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(application as any)?.healthPlan?.toLowerCase?.().includes('kaiser') ? (
                                <Button asChild variant="outline" size="sm">
                                  <Link href="/admin/kaiser-tracker">Open Kaiser Tracker</Link>
                                </Button>
                              ) : (application as any)?.healthPlan?.toLowerCase?.().includes('health net') ? (
                                <Button asChild variant="outline" size="sm">
                                  <Link href="/admin/progress-tracker">Open Progress Tracker</Link>
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            This page is read-only for workflow status and next-step tracking. Edits are handled in the tracker pages after the application is in Caspio.
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Not yet sent to Caspio. Workflow status / next step tracking will appear after the application is pushed to Caspio.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="text-sm font-medium">Next step tracking (Caspio)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Suggested next step</div>
                        <div className="text-sm font-medium">
                          {String((isKaiserPlan || isHealthNetPlan) ? (effectiveNextStep || '') : '').trim() || '—'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Next step due date</div>
                        <div className="text-sm font-medium">
                          {(() => {
                            const raw: any =
                              (application as any)?.Next_Step_Due_Date ||
                              (application as any)?.nextStepDueDate ||
                              (application as any)?.Kaiser_Next_Step_Date ||
                              (application as any)?.kaiserNextStepDate ||
                              (application as any)?.nextStepDate ||
                              (staffTracker as any)?.nextStepDate ||
                              null;
                            try {
                              const d: Date | null = raw?.toDate?.() || (raw ? new Date(raw) : null);
                              const ms = d?.getTime?.();
                              if (!ms || Number.isNaN(ms)) return '—';
                              return format(d as Date, 'MMM d, yyyy');
                            } catch {
                              return '—';
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      To change workflow, next step, next step date, or assigned staff, use the tracker pages (Caspio-backed).
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Mail className="h-4 w-4" />
                  Interoffice notes
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Interoffice notes</DialogTitle>
                  <DialogDescription>Send staff-only notes tied to this application.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="interoffice-recipient">Recipients</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="interoffice-recipient"
                          variant="outline"
                          className="w-full justify-between"
                          disabled={isLoadingStaff}
                        >
                          {isLoadingStaff
                            ? 'Loading staff...'
                            : interofficeNote.recipientIds.length === 0
                              ? 'Select staff members'
                              : `${interofficeNote.recipientIds.length} selected`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-2 w-72">
                        <div className="max-h-56 overflow-auto space-y-2">
                          {staffList.map((staff) => {
                            const checked = interofficeNote.recipientIds.includes(staff.uid);
                            return (
                              <label key={staff.uid} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    setInterofficeNote((prev) => ({
                                      ...prev,
                                      recipientIds: value
                                        ? [...prev.recipientIds, staff.uid]
                                        : prev.recipientIds.filter((id) => id !== staff.uid),
                                    }));
                                  }}
                                />
                                <span>{staff.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interoffice-priority">Priority</Label>
                    <Select
                      value={interofficeNote.priority}
                      onValueChange={(value: 'Regular' | 'Immediate') =>
                        setInterofficeNote((prev) => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger id="interoffice-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Regular">Regular (no desktop popup)</SelectItem>
                        <SelectItem value="Immediate">Immediate (desktop popup)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interoffice-message">Message</Label>
                    <Textarea
                      id="interoffice-message"
                      rows={4}
                      value={interofficeNote.message}
                      onChange={(event) => setInterofficeNote((prev) => ({ ...prev, message: event.target.value }))}
                      placeholder="Enter staff-only instructions or updates..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interoffice-followup">Follow-up date (optional)</Label>
                    <Input
                      id="interoffice-followup"
                      type="date"
                      value={interofficeNote.followUpDate || ''}
                      onChange={(event) => setInterofficeNote((prev) => ({ ...prev, followUpDate: event.target.value }))}
                    />
                  </div>
                  <Button onClick={handleSendInterofficeNote} className="w-full">
                    Send Interoffice Note
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <UploadCloud className="h-4 w-4" />
                  Authorization uploads
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Authorization uploads</DialogTitle>
                  <DialogDescription>
                    Track authorization windows and upload documents. Use search to find previous auths for reauthorizations.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="authorization-type">Authorization Type</Label>
                    <Select
                      value={authorizationUpload.type}
                      onValueChange={(value) => setAuthorizationUpload((prev) => ({ ...prev, type: value }))}
                    >
                      <SelectTrigger id="authorization-type">
                        <SelectValue placeholder="Select authorization type" />
                      </SelectTrigger>
                      <SelectContent>
                        {authorizationTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="authorization-start">Start Date</Label>
                      <Input
                        id="authorization-start"
                        type="date"
                        value={authorizationUpload.startDate}
                        onChange={(event) => setAuthorizationUpload((prev) => ({ ...prev, startDate: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="authorization-end">End Date</Label>
                      <Input
                        id="authorization-end"
                        type="date"
                        value={authorizationUpload.endDate}
                        onChange={(event) => setAuthorizationUpload((prev) => ({ ...prev, endDate: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authorization-file">Authorization Document</Label>
                    <Input
                      id="authorization-file"
                      type="file"
                      onChange={(event) => setAuthorizationUpload((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                    />
                  </div>
                  {authorizationUploading && <Progress value={authorizationUploadProgress} className="h-1 w-full" />}
                  <Button onClick={handleAuthorizationUpload} className="w-full" disabled={authorizationUploading}>
                    {authorizationUploading ? 'Uploading...' : 'Save Authorization'}
                  </Button>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="authorization-search">Search Previous Authorizations</Label>
                    <Input
                      id="authorization-search"
                      value={authorizationSearch}
                      onChange={(event) => setAuthorizationSearch(event.target.value)}
                      placeholder="Search by type, date, or file name..."
                    />
                  </div>

                  {filteredAuthorizationRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No authorization records found.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredAuthorizationRecords.map((record) => {
                        const daysUntilEnd = getDaysUntil(record.endDate);
                        const isExpiringSoon = typeof daysUntilEnd === 'number' && daysUntilEnd <= 30;
                        return (
                          <div key={record.id || `${record.type}-${record.startDate}`} className="rounded-md border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">
                                {record.type || 'Authorization'}
                                {isExpiringSoon && (
                                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                                    Expiring in {daysUntilEnd} days
                                  </span>
                                )}
                              </div>
                              {record.downloadURL && (
                                <Button asChild variant="ghost" size="sm">
                                  <a href={record.downloadURL} target="_blank" rel="noopener noreferrer">
                                    <Download className="mr-2 h-4 w-4" />
                                    View
                                  </a>
                                </Button>
                              )}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground space-y-1">
                              <div>Start: {formatAuthorizationDate(record.startDate)}</div>
                              <div>End: {formatAuthorizationDate(record.endDate)}</div>
                              <div>Uploaded: {formatAuthorizationDate(record.uploadedAt)}</div>
                              {record.fileName && <div>File: {record.fileName}</div>}
                              {record.createdByName && <div>Uploaded by: {record.createdByName}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileText className="h-4 w-4" />
                  Individual service plans (ISP)
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Individual service plans</DialogTitle>
                  <DialogDescription>
                    Upload Individual Service Plans for backend record-keeping (not part of the pathway).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="isp-date">ISP Date</Label>
                    <Input
                      id="isp-date"
                      type="date"
                      value={ispUpload.planDate}
                      onChange={(event) => setIspUpload((prev) => ({ ...prev, planDate: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="isp-file">ISP Document</Label>
                    <Input
                      id="isp-file"
                      type="file"
                      onChange={(event) => setIspUpload((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                    />
                  </div>
                  {ispUploading && <Progress value={ispUploadProgress} className="h-1 w-full" />}
                  <Button onClick={handleIspUpload} className="w-full" disabled={ispUploading}>
                    {ispUploading ? 'Uploading...' : 'Save ISP'}
                  </Button>

                  <Separator />

                  {ispRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No ISP records uploaded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {ispRecords.map((record) => (
                        <div key={record.id || `${record.planDate}-${record.fileName}`} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">ISP {formatAuthorizationDate(record.planDate)}</div>
                            {record.downloadURL && (
                              <Button asChild variant="ghost" size="sm">
                                <a href={record.downloadURL} target="_blank" rel="noopener noreferrer">
                                  <Download className="mr-2 h-4 w-4" />
                                  View
                                </a>
                              </Button>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground space-y-1">
                            {record.fileName && <div>File: {record.fileName}</div>}
                            {record.createdByName && <div>Uploaded by: {record.createdByName}</div>}
                            <div>Uploaded: {formatAuthorizationDate(record.uploadedAt)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Wrench className="h-4 w-4" />
                  Admin actions
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Admin actions</DialogTitle>
                  <DialogDescription>Operational tools for this application.</DialogDescription>
                </DialogHeader>
                <AdminActions application={application} />
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Notes & communication
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Notes & communication</DialogTitle>
                  <DialogDescription>Member notes and notification-system communication.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {(application as any)?.client_ID2 ? (
                    <NoteTracker
                      memberId={(application as any)?.client_ID2}
                      memberName={`${application.memberFirstName} ${application.memberLastName}`}
                    />
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="h-5 w-5" />
                          Notes & Communication
                        </CardTitle>
                        <CardDescription>
                          Notes load once a Caspio Client_ID2 is linked to this application.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          This member is not yet linked to a Caspio record, so notes cannot be fetched.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/my-notes?member=${encodeURIComponent(`${application.memberFirstName} ${application.memberLastName}`)}`}>
                        Open notifications (member)
                      </Link>
                    </Button>
                    {(application as any)?.client_ID2 && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/member-notes?clientId2=${encodeURIComponent(String((application as any)?.client_ID2 || ''))}`}>
                          Member notes lookup
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function AdminApplicationDetailPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application...</p>
        </div>
    }>
      <ApplicationDetailPageContent />
    </Suspense>
  );
}
