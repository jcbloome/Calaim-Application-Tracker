
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
  BellRing,
  Eye,
  EyeOff,
  ChevronDown,
  Target,
  Wrench,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType, StaffTracker, StaffMember } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp, Timestamp, onSnapshot, deleteDoc, getDocs, query, where, documentId, limit } from 'firebase/firestore';
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
import { useDesktopPresenceMap } from '@/hooks/use-desktop-presence';
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
    const { user: adminUser, isSuperAdmin } = useAdmin();
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
    const [canAssignForKaiser, setCanAssignForKaiser] = useState(true);
    const staffUids = useMemo(() => staffList.map((s) => s.uid).filter(Boolean), [staffList]);
    const { isActiveByUid } = useDesktopPresenceMap(staffUids);
    const isKaiserPlan = String(application.healthPlan || '').toLowerCase().includes('kaiser');

    useEffect(() => {
      const run = async () => {
        if (!isKaiserPlan) {
          setCanAssignForKaiser(true);
          return;
        }
        if (isSuperAdmin) {
          setCanAssignForKaiser(true);
          return;
        }
        if (!firestore || !adminUser?.uid) {
          setCanAssignForKaiser(false);
          return;
        }
        try {
          const meSnap = await getDoc(doc(firestore, 'users', adminUser.uid));
          const meData = meSnap.exists() ? (meSnap.data() as any) : null;
          setCanAssignForKaiser(Boolean(meData?.isKaiserAssignmentManager));
        } catch {
          setCanAssignForKaiser(false);
        }
      };
      run().catch(() => setCanAssignForKaiser(false));
    }, [isKaiserPlan, isSuperAdmin, firestore, adminUser?.uid]);

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
                const isHealthNetPlan =
                  planLower.includes('health net') ||
                  planLower.includes('healthnet') ||
                  planLower === 'hn';

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

                if (isKaiserPlan || isHealthNetPlan) {
                  filtered = [...designatedCandidates];
                  // Keep currently assigned staff visible even if designation was later changed.
                  if (currentAssignedId) {
                    const currentAssigned = candidates.find((c) => c.uid === currentAssignedId);
                    if (currentAssigned && !filtered.some((c) => c.uid === currentAssigned.uid)) {
                      filtered.push(currentAssigned);
                    }
                  }
                  if (filtered.length > 0) {
                    label = isKaiserPlan ? 'Showing Kaiser staff cards' : 'Showing Health Net staff cards';
                  } else if (isKaiserPlan) {
                    label = 'No Kaiser staff designated in Staff Management.';
                  } else {
                    label = 'No Health Net staff designated in Staff Management.';
                  }
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

            // For Kaiser assignments, immediately notify assigned staff in Electron and
            // add a follow-up task item so it appears on their daily task calendar.
            if (isKaiserPlan) {
              const memberName = `${application.memberFirstName || ''} ${application.memberLastName || ''}`.trim() || 'Member';
              const dueDate = new Date();
              dueDate.setHours(17, 0, 0, 0);

              const assignedByName = String(
                adminUser?.displayName ||
                adminUser?.email ||
                'Manager'
              ).trim();
              const actionUrl = application.userId
                ? `/admin/applications/${application.id}?userId=${encodeURIComponent(String(application.userId))}`
                : `/admin/applications/${application.id}`;

              await addDoc(collection(firestore, 'staff_notifications'), {
                userId: selectedStaff.uid,
                title: `Kaiser assignment: ${memberName}`,
                message: `You were assigned ${memberName} in Application Pathway. Please review and complete the next step.`,
                memberName,
                clientId2: String((application as any)?.client_ID2 || '').trim() || null,
                healthPlan: 'Kaiser',
                type: 'assignment',
                priority: 'Priority',
                status: 'Open',
                isRead: false,
                requiresStaffAction: true,
                followUpRequired: true,
                followUpDate: dueDate.toISOString(),
                senderName: assignedByName,
                assignedByUid: String(adminUser?.uid || '').trim() || null,
                assignedByName,
                actionUrl,
                applicationId: application.id,
                source: 'application-pathway',
                timestamp: serverTimestamp(),
              });
            }

            onStaffChange(staffId, selectedStaff.displayName);
            
            toast({
                title: "Staff Assigned",
                description: isKaiserPlan
                  ? `Application assigned to ${selectedStaff.displayName}. Electron + daily task calendar notified.`
                  : `Application assigned to ${selectedStaff.displayName}`,
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
          disabled={isLoading || isLoadingStaff || (isKaiserPlan && !canAssignForKaiser)}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoadingStaff ? 'Loading staff…' : 'Assign a staff member...'} />
          </SelectTrigger>
          <SelectContent>
            {staffList.map((staff) => (
              <SelectItem key={staff.uid} value={staff.uid}>
                <div className="flex items-center gap-2">
                  {isActiveByUid[staff.uid] ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                      aria-label="Electron active"
                      title="Electron active"
                    />
                  ) : null}
                  <span>{staff.displayName}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isKaiserPlan && !canAssignForKaiser ? (
          <div className="text-[11px] text-amber-700">
            Kaiser assignment manager access is required to assign Kaiser staff from this portal.
          </div>
        ) : null}
      </div>
    );
}

// Get Kaiser statuses in proper sort order
const kaiserSteps = getKaiserStatusesInOrder().map(status => status.status);

const HEALTH_NET_PROCESS_STATUS_OPTIONS = [
  '1- On Hold (Not Interested)',
  '2- On Hold (Not Yet HN)',
  '3- Waiting for Papers',
  '4- Ready to Process',
  '5- ISP in Progress',
  '6- Submitted, Waiting for Auth',
  '7- Authorized',
];

const parseNumericPrefix = (value: string): number => {
  const match = String(value || '').trim().match(/^(\d+)\s*-/);
  const n = match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

const normalizeHealthNetStatusLabel = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^\d+\s*-\s*/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const healthNetSteps = [...HEALTH_NET_PROCESS_STATUS_OPTIONS].sort((a, b) => {
  const byPrefix = parseNumericPrefix(a) - parseNumericPrefix(b);
  if (byPrefix !== 0) return byPrefix;
  return a.localeCompare(b);
});

const resolveHealthNetStatus = (raw: string): string => {
  const value = String(raw || '').trim();
  if (!value) return '';
  const exact = healthNetSteps.find((s) => s === value);
  if (exact) return exact;
  const normalized = normalizeHealthNetStatusLabel(value);
  return healthNetSteps.find((s) => normalizeHealthNetStatusLabel(s) === normalized) || '';
};

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
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the consolidated HIPAA, Liability, Freedom of Choice, and Room & Board Commitment waiver form.', type: 'online-form', href: '/admin/forms/waivers', icon: FileText },
    { id: 'room-board-obligation', title: 'Room and Board/Tier Level Agreement', description: 'Admin-generated agreement addressed to the member/authorized representative and RCFE. Upload the fully signed copy here.', type: 'Upload', icon: UploadCloud, href: '/forms/room-board-obligation/printable' },
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

  // Proof of income is required for Kaiser but not required for Health Net.
  const normalizedHealthPlan = String(healthPlan || '').trim();
  const filteredCommonRequirements =
    normalizedHealthPlan === 'Health Net'
      ? commonRequirements.filter((req) => req.id !== 'proof-of-income')
      : commonRequirements;
  
  if (pathway === 'SNF Diversion') {
    const isHealthNet = normalizedHealthPlan === 'Health Net';
    return [
      ...filteredCommonRequirements,
      ...(isHealthNet
        ? [
            {
              id: 'declaration-of-eligibility',
              title: 'Declaration of Eligibility',
              description: 'Download the form, have it signed by a PCP, and upload it here.',
              type: 'Upload',
              icon: Printer,
              href: '/forms/declaration-of-eligibility/printable',
            },
          ]
        : []),
    ];
  }
  
  // SNF Transition
  return [
      ...filteredCommonRequirements,
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
  { key: "LIC 602A - Physician's Report", label: '602' },
  { key: 'Medicine List', label: 'Meds' },
  { key: 'Proof of Income', label: 'POI' },
  { key: 'Declaration of Eligibility', label: 'DE' },
  { key: 'SNF Facesheet', label: 'SNF' },
  { key: 'Eligibility Check', label: 'Elig' },
  { key: 'Sent to Caspio', label: 'Caspio' },
  { key: 'Room and Board/Tier Level Agreement', label: 'R&B/Tier' },
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

function PushToCaspioDialog({
    application,
    buttonVariant = "outline",
    buttonClassName = "w-full justify-start gap-2"
}: {
    application: Application;
    buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    buttonClassName?: string;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSendingToCaspio, setIsSendingToCaspio] = useState(false);
    const [caspioMappingPreview, setCaspioMappingPreview] = useState<Record<string, string> | null>(null);

    const docRef = useMemoFirebase(() => {
        if (!firestore || !application.userId || !application.id) return null;
        return doc(firestore, `users/${application.userId}/applications`, application.id);
    }, [firestore, application.id, application.userId]);

    useEffect(() => {
        if (!isOpen || typeof window === 'undefined') return;
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
    }, [isOpen]);

    const sendToCaspio = async (mappingOverride?: Record<string, string> | null) => {
        setIsSendingToCaspio(true);
        try {
            const functions = getFunctions();
            const publishToCaspio = httpsCallable(functions, 'publishCsSummaryToCaspioSimple');

            const result = await publishToCaspio({
                applicationData: application,
                mapping: mappingOverride || caspioMappingPreview || null,
            });
            const data = result.data as any;

            if (data?.success) {
                toast({
                    title: 'Pushed to Caspio',
                    description: data.message || 'Successfully published to Caspio.',
                    className: 'bg-green-100 text-green-900 border-green-200',
                });

                if (docRef) {
                    await setDoc(
                        docRef,
                        {
                            caspioSent: true,
                            caspioSentDate: serverTimestamp(),
                            lastUpdated: serverTimestamp(),
                        },
                        { merge: true }
                    );
                }
                setIsOpen(false);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Caspio Error',
                    description: data?.message || 'Failed to publish to Caspio.',
                });
            }
        } catch (error: any) {
            let errorMessage = 'Failed to send to Caspio';
            if (error?.code === 'functions/already-exists') {
                errorMessage = 'This member already exists in Caspio database';
            } else if (error?.code === 'functions/failed-precondition') {
                errorMessage = 'Caspio credentials not configured properly';
            } else if (error?.message) {
                errorMessage = error.message;
            }
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
        } finally {
            setIsSendingToCaspio(false);
        }
    };

    const isAlreadySent = Boolean((application as any)?.caspioSent);
    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
                <Button variant={buttonVariant} className={buttonClassName} disabled={isSendingToCaspio || isAlreadySent}>
                    {isSendingToCaspio ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Pushing to Caspio...
                        </>
                    ) : isAlreadySent ? (
                        <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Already pushed to Caspio
                        </>
                    ) : (
                        <>
                            <Database className="mr-2 h-4 w-4" />
                            Push to Caspio
                        </>
                    )}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-3xl">
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm push to Caspio</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will publish CS Summary fields into `CalAIM_tbl_Members` using the locked mapping.
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
                            Lock a mapping first in `Admin → Caspio Test` (saves `calaim_cs_caspio_mapping`), then come back here.
                        </AlertDescription>
                    </Alert>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            void sendToCaspio(caspioMappingPreview);
                        }}
                        disabled={!caspioMappingPreview || Object.keys(caspioMappingPreview).length === 0 || isSendingToCaspio}
                    >
                        Confirm & Push
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function getReminderMissingItems(application: Application | null): string[] {
  const forms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];
  if (forms.length === 0) return [];
  const internalExclusions = new Set(['eligibility screenshot', 'eligibility check']);
  return forms
    .filter((form: any) => {
      const name = String(form?.name || '').trim();
      if (!name) return false;
      if (name === 'CS Member Summary' || name === 'CS Summary') return false;
      if (internalExclusions.has(name.toLowerCase())) return false;
      if (String(form?.type || '').trim().toLowerCase() === 'info') return false;
      return String(form?.status || '').trim() !== 'Completed';
    })
    .map((form: any) => String(form?.name || '').trim())
    .filter(Boolean);
}

function AdminActions({ application }: { application: Application }) {
    const { isAdmin, isSuperAdmin } = useAdmin();
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<Application['status'] | ''>('');
    const [isSending, setIsSending] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
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
            const surveyUrl =
              status === 'Approved'
                ? `${window.location.origin.replace(/\/$/, '')}/forms/customer-feedback?applicationId=${encodeURIComponent(String(application.id || ''))}`
                : undefined;
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: application.referrerEmail,
                    includeBcc: false,
                    subject: `Update on CalAIM Application for ${application.memberFirstName} ${application.memberLastName}`,
                    memberName: application.referrerName || 'there',
                    staffName: "The Connections Team",
                    message: notes || 'Your application status has been updated. Please log in to your dashboard for more details.',
                    status: status as any, // Cast because we know it's valid
                    surveyUrl,
                }),
            });
            
            const result = await response.json();
            
            if (result.success) {
                if (docRef) {
                     await setDoc(docRef, { status: status, lastUpdated: serverTimestamp() }, { merge: true });
                }

                toast({
                    title: 'Success!',
                    description: `Application status set to "${status}" and email sent to ${application.referrerEmail}.`,
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

  type StandaloneUploadRow = {
    id: string;
    status: string;
    documentType?: string;
    memberName?: string;
    healthPlan?: string;
    medicalRecordNumber?: string;
    createdAtMs: number;
    files: Array<{ fileName: string; downloadURL: string; storagePath?: string }>;
  };
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [intakeImportOpen, setIntakeImportOpen] = useState(false);
  const [intakeRequirementTitle, setIntakeRequirementTitle] = useState<string>('');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string>('');
  const [intakeUploads, setIntakeUploads] = useState<StandaloneUploadRow[]>([]);
  const [intakeSearch, setIntakeSearch] = useState<string>('');
  const [intakeSelectedFileKey, setIntakeSelectedFileKey] = useState<string>(''); // `${uploadId}:${index}`
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string; email: string; role?: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [interofficeNote, setInterofficeNote] = useState<{
    recipientIds: string[];
    priority: 'Regular' | 'Priority' | 'Immediate';
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
  const [isUpdatingKaiserTierLevel, setIsUpdatingKaiserTierLevel] = useState(false);
  const [isGeneratingRoomBoardPreview, setIsGeneratingRoomBoardPreview] = useState(false);
  const [roomBoardPreview, setRoomBoardPreview] = useState<{
    clientId2?: string;
    memberName?: string;
    mrn?: string | null;
    authorizedRepName?: string;
    authorizedRepEmail?: string;
    rcfeName?: string;
    rcfeSignerEmailDefault?: string;
    mcoAndTier?: string;
    tierLevel?: string;
    assistedLivingDailyRate?: string;
    assistedLivingMonthlyRate?: string;
    agreedRoomBoardAmountDefault?: string;
  } | null>(null);
  const [roomBoardPreviewWarnings, setRoomBoardPreviewWarnings] = useState<string[]>([]);
  const [isSendingRoomBoardInvites, setIsSendingRoomBoardInvites] = useState(false);
  const [isSendingRoomBoardIls, setIsSendingRoomBoardIls] = useState(false);
  const [roomBoardWorkspaceOpen, setRoomBoardWorkspaceOpen] = useState(false);
  const [rcfeSignerEmailInput, setRcfeSignerEmailInput] = useState('');
  const [agreedRoomBoardAmountInput, setAgreedRoomBoardAmountInput] = useState('');
  const [isSendingEligibilityNote, setIsSendingEligibilityNote] = useState(false);
  const [isUpdatingReminderControls, setIsUpdatingReminderControls] = useState(false);
  const [isSendingTestReminder, setIsSendingTestReminder] = useState(false);
  const [isLoadingReminderPreview, setIsLoadingReminderPreview] = useState(false);
  const [reminderPreview, setReminderPreview] = useState<{
    recipientEmail: string;
    referrerName: string;
    memberName: string;
    subject: string;
    missingItems: string[];
  } | null>(null);
  const [nextStepDateMissing, setNextStepDateMissing] = useState(false);
  const [isSendingFamilyStatusNow, setIsSendingFamilyStatusNow] = useState(false);
  const [rejectReasonByForm, setRejectReasonByForm] = useState<Record<string, string>>({});
  const [rejectingByForm, setRejectingByForm] = useState<Record<string, boolean>>({});
  const [rejectDialogForm, setRejectDialogForm] = useState<string | null>(null);

  const reminderFrequencyOptions = useMemo(() => [2, 7] as const, []);
  const staffTestReminderEmail = String(user?.email || '').trim();
  const currentReminderMissingItems = useMemo(() => getReminderMissingItems(application), [application]);
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

  const loadTestMissingDocsPreview = async () => {
    if (!staffTestReminderEmail || !application?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Staff email is required.' });
      return;
    }
    setIsLoadingReminderPreview(true);
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
          userId: (application as any)?.userId || null,
          overrideEmail: staffTestReminderEmail,
          baseUrl,
          previewOnly: true,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load reminder preview');
      }
      setReminderPreview({
        recipientEmail: String(result.recipientEmail || staffTestReminderEmail),
        referrerName: String(result.referrerName || 'there'),
        memberName: String(result.memberName || 'CalAIM Member'),
        subject: String(result.subject || 'Missing Documents Reminder'),
        missingItems: Array.isArray(result.missingItems) ? result.missingItems : [],
      });
    } catch (error: any) {
      setReminderPreview(null);
      toast({
        variant: 'destructive',
        title: 'Preview Failed',
        description: error?.message || 'Could not load reminder preview.',
      });
    } finally {
      setIsLoadingReminderPreview(false);
    }
  };

  const sendTestMissingDocsReminder = async () => {
    if (!staffTestReminderEmail || !application?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Staff email is required.' });
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
          userId: (application as any)?.userId || null,
          overrideEmail: staffTestReminderEmail,
          baseUrl,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to send test reminder');
      }
      toast({
        title: 'Test Reminder Sent',
        description: `Email sent to ${staffTestReminderEmail}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error?.message || 'Could not send test reminder.',
      });
    } finally {
      setIsSendingTestReminder(false);
    }
  };
  const sendFamilyStatusUpdateEmail = async (
    statusValue: string,
    deniedReason?: string,
    trigger: 'auto' | 'manual' = 'auto'
  ) => {
    if (!application?.id) return;
    try {
      const response = await fetch('/api/admin/send-family-status-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          statusValue,
          deniedReason: String(deniedReason || ''),
          trigger,
          sentByUid: String(user?.uid || ''),
          sentByName: String(user?.displayName || user?.email || 'The Connections Team'),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || result?.message || 'Failed to send status reminder');
      }
      if (result?.skippedDisabled) {
        return;
      }
      if (result?.skippedDueToDedupe) {
        if (trigger === 'manual') {
          toast({
            title: 'Recently sent',
            description: 'Same status update was sent recently. Try again in a few minutes.',
          });
        }
        return;
      }
      setApplication((prev) =>
        prev
          ? ({
              ...(prev as any),
              familyStatusLastEmail: result?.lastEmail || (prev as any)?.familyStatusLastEmail,
              familyStatusReminderHistory: result?.history || (prev as any)?.familyStatusReminderHistory,
            } as any)
          : prev
      );
      toast({
        title: 'Status reminder sent',
        description: `Family update sent to ${String((application as any)?.referrerEmail || '').trim() || 'recipient'}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Status reminder failed',
        description: error?.message || 'Could not send family status reminder.',
      });
    }
  };

  const handleFamilyStatusProgressChange = async (value: string) => {
    const previousStatus = familyStatusProgressValue;
    if (value === 'none') {
      await updateReminderSettings({
        familyStatusProgress: '',
        familyStatusDeniedReason: '',
      });
      return;
    }

    const needsDeniedReason = /authorization denied/i.test(value);
    const existingReason = needsDeniedReason ? familyStatusDeniedReason : '';
    if (needsDeniedReason && !String(existingReason || '').trim()) {
      setApplication((prev) =>
        prev ? ({ ...(prev as any), familyStatusProgress: value } as any) : prev
      );
      toast({
        variant: 'destructive',
        title: 'Denied reason required',
        description: 'Enter a denial reason before saving Authorization Denied.',
      });
      return;
    }
    await updateReminderSettings({
      familyStatusProgress: value,
      familyStatusDeniedReason: needsDeniedReason ? existingReason : '',
    });

    if (Boolean((application as any)?.statusRemindersEnabled) !== true) return;
    if (value === previousStatus) return;
    if (needsDeniedReason && !String(existingReason || '').trim()) {
      return;
    }
    await sendFamilyStatusUpdateEmail(value, existingReason);
  };

  const handleFamilyDeniedReasonBlur = async (value: string) => {
    await updateReminderSettings({
      familyStatusProgress: familyStatusProgressValue,
      familyStatusDeniedReason: value,
    });
    if (Boolean((application as any)?.statusRemindersEnabled) !== true) return;
    if (!familyProgressNeedsDeniedReason || !familyStatusProgressValue) return;
    if (!String(value || '').trim()) return;
    await sendFamilyStatusUpdateEmail(familyStatusProgressValue, value);
  };
  const handleManualFamilyStatusSend = async () => {
    if (!familyStatusProgressValue) return;
    if (familyProgressNeedsDeniedReason && !String(familyStatusDeniedReason || '').trim()) {
      toast({
        variant: 'destructive',
        title: 'Denied reason required',
        description: 'Enter a denial reason before sending Authorization Denied.',
      });
      return;
    }
    setIsSendingFamilyStatusNow(true);
    try {
      await sendFamilyStatusUpdateEmail(familyStatusProgressValue, familyStatusDeniedReason, 'manual');
    } finally {
      setIsSendingFamilyStatusNow(false);
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
  const isHealthNetPlan =
    planLower.includes('health net') ||
    planLower.includes('healthnet') ||
    planLower === 'hn';
  const kaiserFamilyProgressOptions = useMemo(
    () => [
      'Application Received',
      'Requesting Documents',
      'Authorization Request to MCP',
      'Authorization Received',
      'Authorization Denied',
      'RN/MSW Visit Scheduled',
      'RN/MSW Visit Complete',
      'Tier Level Requested from MCP',
      'Tier Level Received',
      'Locating RCFEs',
      'RCFE Located',
      'R&B/Tier Level Commitment Sent for Signatures',
      'Member Ready for Move-In',
      'Member Moved into RCFE',
    ],
    []
  );
  const healthNetFamilyProgressOptions = useMemo(
    () => [
      'Application Received',
      'Requesting Documents',
      'RN ISP Scheduled',
      'RN ISP Complete',
      'Authorization Request to MCP',
      'Authorization Received',
      'Authorization Denied',
    ],
    []
  );
  const familyProgressOptions = isKaiserPlan
    ? kaiserFamilyProgressOptions
    : isHealthNetPlan
      ? healthNetFamilyProgressOptions
      : [];
  const familyStatusProgressValue = String((application as any)?.familyStatusProgress || '').trim();
  const familyProgressNeedsDeniedReason = /authorization denied/i.test(familyStatusProgressValue);
  const familyStatusDeniedReason = String((application as any)?.familyStatusDeniedReason || '');
  const familyStatusLastEmail = (application as any)?.familyStatusLastEmail || null;
  const familyStatusHistory = Array.isArray((application as any)?.familyStatusReminderHistory)
    ? ((application as any)?.familyStatusReminderHistory as any[])
    : [];
  const familyStatusLastSentLabel = useMemo(() => {
    const raw = familyStatusLastEmail?.sentAtMs ?? familyStatusLastEmail?.sentAtIso ?? null;
    if (!raw) return '';
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return '';
      return format(d, 'MMM d, yyyy h:mm a');
    } catch {
      return '';
    }
  }, [familyStatusLastEmail?.sentAtMs, familyStatusLastEmail?.sentAtIso]);
  const authorizedRepInviteEmail = useMemo(() => {
    const candidates = [
      String((application as any)?.repEmail || '').trim(),
      String((application as any)?.bestContactEmail || '').trim(),
      String((application as any)?.referrerEmail || '').trim(),
    ];
    return candidates.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || '';
  }, [application]);
  const roomBoardAgreementMeta = (application as any)?.roomBoardTierAgreement || null;

  const kaiserCurrentStatus = String((application as any)?.kaiserStatus || '').trim();
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

  const healthNetCurrentStatus = useMemo(() => {
    const raw = String(
      (application as any)?.Health_Net_Process_Status ||
      (application as any)?.healthNetProcessStatus ||
      (application as any)?.healthNetStatus ||
      ''
    ).trim();
    // Do not default to "On Hold (Not Interested)" when status is empty.
    // Empty means not yet set/synced from process status source.
    return resolveHealthNetStatus(raw) || '';
  }, [application]);
  const healthNetNextStatus = useMemo(() => {
    if (!isHealthNetPlan) return '';
    const idx = healthNetSteps.findIndex((s) => s === healthNetCurrentStatus);
    if (idx === -1) return '';
    if (idx >= healthNetSteps.length - 1) return '';
    return String(healthNetSteps[idx + 1] || '').trim();
  }, [isHealthNetPlan, healthNetCurrentStatus]);

  const processStatusLabel = useMemo(() => {
    if (isKaiserPlan) return String((application as any)?.kaiserStatus || '').trim();
    if (isHealthNetPlan) return String(healthNetCurrentStatus || '').trim();
    return '';
  }, [application, isKaiserPlan, isHealthNetPlan, healthNetCurrentStatus]);

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
      priority?: 'Regular' | 'Priority' | 'Immediate';
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

    let interofficeEnabled = true;
    let allowedRecipients: Set<string> | null = null;
    try {
      const settingsSnap = await getDoc(doc(firestore, 'system_settings', 'notifications'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data() as any;
        interofficeEnabled = Boolean(data?.interofficeElectronEnabled ?? data?.interofficeNotificationsEnabled ?? true);
        const recipientsField = (data?.recipientUids || []) as unknown;
        if (Array.isArray(recipientsField) && recipientsField.length > 0) {
          allowedRecipients = new Set(recipientsField.map((v) => String(v || '').trim()).filter(Boolean));
        }
      }
    } catch {
      // Fail-open if settings are unreadable.
    }

    if (!interofficeEnabled) {
      toast({
        variant: 'destructive',
        title: 'Interoffice Notes Disabled',
        description: 'Global interoffice note activation is currently turned off.'
      });
      return;
    }

    const memberName = `${application.memberFirstName} ${application.memberLastName}`;
    const clientId2 = (application as any)?.client_ID2 || application.id;
    const recipients = staffList.filter((staff) => {
      if (!interofficeNote.recipientIds.includes(staff.uid)) return false;
      if (!allowedRecipients) return true;
      return allowedRecipients.has(String(staff.uid || '').trim());
    });
    if (recipients.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Recipients',
        description: 'Selected staff members were not found.'
      });
      return;
    }
    const priorityValue =
      interofficeNote.priority === 'Immediate'
        ? 'Urgent'
        : interofficeNote.priority === 'Priority'
          ? 'Priority'
          : 'Low';
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
              // Standalone intake imports MUST remain un-acknowledged so they appear in staff review queues.
              const source = String((update as any)?.source || (existingForm as any)?.source || '').trim().toLowerCase();
              const isStandalone =
                source === 'standalone_upload' ||
                Boolean((update as any)?.standaloneUploadId) ||
                Boolean((existingForm as any)?.standaloneUploadId);
              const shouldAutoAcknowledge =
                update.status === 'Completed' && Boolean(update.filePath || update.downloadURL) && !isStandalone;
              existingForms.set(update.name!, {
                ...existingForm,
                ...update,
                ...(shouldAutoAcknowledge ? { acknowledged: true } : {})
              });
          } else if (update.name) {
              const source = String((update as any)?.source || '').trim().toLowerCase();
              const isStandalone = source === 'standalone_upload' || Boolean((update as any)?.standaloneUploadId);
              const shouldAutoAcknowledge =
                update.status === 'Completed' &&
                Boolean((update as any).filePath || (update as any).downloadURL) &&
                !isStandalone;
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
      'Room and Board/Tier Level Agreement': 'Room and Board Tier Level Agreement',
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

  const loadMemberStandaloneIntakes = async () => {
    if (!firestore || !application) return;
    const mrn = String(application.memberMrn || '').trim();
    const memberLast = String(application.memberLastName || '').trim().toLowerCase();
    const memberFirst = String(application.memberFirstName || '').trim().toLowerCase();
    const memberNeedle = `${memberFirst} ${memberLast}`.trim();

    setIntakeLoading(true);
    setIntakeError('');
    try {
      const snap = await getDocs(
        query(collection(firestore, 'standalone_upload_submissions'), where('status', '==', 'pending'), limit(250))
      );
      const rows: StandaloneUploadRow[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const createdAtMs = (() => {
          const raw = data?.createdAt || data?.submittedAt || data?.updatedAt || null;
          try {
            if (raw?.toDate) return raw.toDate().getTime();
            const ms = new Date(raw).getTime();
            return Number.isNaN(ms) ? 0 : ms;
          } catch {
            return 0;
          }
        })();
        const files = Array.isArray(data?.files) ? data.files : [];
        const normalizedFiles = files
          .map((f: any) => ({
            fileName: String(f?.fileName || '').trim(),
            downloadURL: String(f?.downloadURL || '').trim(),
            storagePath: String(f?.storagePath || '').trim() || undefined,
          }))
          .filter((f: any) => Boolean(f.fileName && f.downloadURL))
          .slice(0, 15);

        return {
          id: d.id,
          status: String(data?.status || 'pending'),
          documentType: String(data?.documentType || '').trim() || undefined,
          memberName: String(data?.memberName || '').trim() || undefined,
          healthPlan: String(data?.healthPlan || '').trim() || undefined,
          medicalRecordNumber:
            String(data?.medicalRecordNumber || data?.mrn || data?.memberMrn || data?.kaiserMrn || '').trim() || undefined,
          createdAtMs,
          files: normalizedFiles,
        };
      });

      const filtered = rows
        .filter((r) => r.status === 'pending')
        .filter((r) => {
          if (mrn && r.medicalRecordNumber) return r.medicalRecordNumber === mrn;
          const name = String(r.memberName || '').toLowerCase();
          if (memberLast && name.includes(memberLast)) return true;
          if (memberNeedle && name.includes(memberNeedle)) return true;
          return false;
        })
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

      setIntakeUploads(filtered);
    } catch (e: any) {
      console.error('Failed to load standalone intakes:', e);
      setIntakeError(e?.message || 'Failed to load standalone uploads.');
      setIntakeUploads([]);
    } finally {
      setIntakeLoading(false);
    }
  };

  const importStandaloneIntoSlot = async (params: { fileKey: string; requirementTitle: string }) => {
    if (!firestore || !application || !docRef || !user?.uid) return;
    const [uploadId, idxRaw] = String(params.fileKey || '').split(':');
    const idx = Number(idxRaw);
    const row = intakeUploads.find((r) => r.id === uploadId);
    const file = row?.files?.[idx];
    if (!row || !file || !params.requirementTitle) {
      toast({ variant: 'destructive', title: 'Select a file', description: 'Choose a standalone upload file to import.' });
      return;
    }

    const standardFileName = buildStandardFileName(params.requirementTitle, file.fileName || 'document.pdf');

    try {
      await handleFormStatusUpdate([
        {
          name: params.requirementTitle,
          status: 'Completed',
          type: 'Upload',
          fileName: standardFileName,
          filePath: file.storagePath || null,
          downloadURL: file.downloadURL || null,
          dateCompleted: Timestamp.now(),
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          source: 'standalone_upload',
          standaloneUploadId: row.id,
        } as any,
      ]);

      await setDoc(
        doc(firestore, 'standalone_upload_submissions', row.id),
        {
          status: 'assigned',
          assignedAt: serverTimestamp(),
          assignedByUid: user.uid,
          assignedApplicationId: applicationId,
          assignedApplicationUserId: appUserId || null,
          assignedRequirementTitle: params.requirementTitle,
          updatedAt: serverTimestamp(),
        } as any,
        { merge: true }
      );

      toast({
        title: 'Imported',
        description: `Standalone upload attached to "${params.requirementTitle}".`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      setIntakeImportOpen(false);
      setIntakeSelectedFileKey('');
      setIntakeSearch('');
    } catch (e: any) {
      console.error('Failed to import standalone upload:', e);
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: e?.message || 'Unable to attach standalone upload to this slot.',
      });
    }
  };

  const buildStorageFileName = (standardFileName: string) =>
    standardFileName.replace(/[^\w.-]/g, '_');

  const getComponentStatus = (componentKey: string): 'Completed' | 'Pending' | 'Not Applicable' => {
    const form = application?.forms?.find((f) => {
      const name = String(f?.name || '').trim();
      if (name === componentKey) return true;
      // Backward compatibility with older naming in existing applications.
      if (
        componentKey === 'Room and Board/Tier Level Agreement' &&
        (name === 'Room and Board/Tier Level Commitment' || name === 'Room and Board Commitment')
      ) {
        return true;
      }
      return false;
    });

    if (componentKey === 'Eligibility Check') {
      const hasEligibilityUpload = Boolean(
        application?.forms?.some((f) => String(f?.name || '').trim() === 'Eligibility Screenshot' && String(f?.status || '').trim() === 'Completed')
      );
      const eligibilityStatus = String((application as any)?.calaimTrackingStatus || '').trim().toLowerCase();
      const isMemberEligible = eligibilityStatus === 'calaim eligible';
      return hasEligibilityUpload && isMemberEligible ? 'Completed' : 'Pending';
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
  const eligibilityRequirementIds = new Set(['eligibility-screenshot']);
  const eligibilityRequirements = pathwayRequirements.filter(req => eligibilityRequirementIds.has(req.id));
  const displayedPathwayRequirements = (() => {
    const items = pathwayRequirements.filter((req) => req.id !== 'eligibility-screenshot');
    const roomBoardIdx = items.findIndex((req) => req.id === 'room-board-obligation');
    if (roomBoardIdx > -1) {
      const [roomBoard] = items.splice(roomBoardIdx, 1);
      items.push(roomBoard);
    }
    return items;
  })();
  const formStatusMap = new Map(application.forms?.map(f => [f.name, f]));
  if (!formStatusMap.get('Room and Board/Tier Level Agreement') && formStatusMap.get('Room and Board/Tier Level Commitment')) {
    formStatusMap.set('Room and Board/Tier Level Agreement', formStatusMap.get('Room and Board/Tier Level Commitment') as any);
  } else if (!formStatusMap.get('Room and Board/Tier Level Agreement') && formStatusMap.get('Room and Board Commitment')) {
    formStatusMap.set('Room and Board/Tier Level Agreement', formStatusMap.get('Room and Board Commitment') as any);
  }
  
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const form = formStatusMap.get(req.title);
    if (form?.status === 'Completed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const processTrackerStatuses = quickStatusItems.map((item) => ({
    item,
    status: getComponentStatus(item.key),
  }));
  const processTrackerApplicable = processTrackerStatuses.filter((entry) => entry.status !== 'Not Applicable');
  const processTrackerCompletedCount = processTrackerApplicable.filter((entry) => entry.status === 'Completed').length;
  const processTrackerTotalCount = processTrackerApplicable.length;
  const processTrackerProgress = processTrackerTotalCount > 0 ? (processTrackerCompletedCount / processTrackerTotalCount) * 100 : 0;
  const eligibilityCompleted = getComponentStatus('Eligibility Check') === 'Completed';
  const caspioPushed = Boolean((application as any)?.caspioSent);
  const caspioSentDateRaw = (application as any)?.caspioSentDate;
  const caspioSentDateLabel = caspioSentDateRaw
    ? format(
        typeof caspioSentDateRaw?.toDate === 'function'
          ? caspioSentDateRaw.toDate()
          : new Date(caspioSentDateRaw),
        'MMM d, yyyy h:mm a'
      )
    : '';
  
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
  const formatDateTimeValue = (value: any): string => {
    if (!value) return '';
    const parsed =
      typeof value?.toDate === 'function'
        ? value.toDate()
        : value instanceof Date
          ? value
          : new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : format(parsed, 'PPP p');
  };
  const isNewCsSummary =
    Boolean(csSummaryCompletedAt) &&
    !application.applicationChecked &&
    Date.now() - (csSummaryCompletedAt as Date).getTime() < 24 * 60 * 60 * 1000;

  const needsUrgentAttention = application.hasLegalRep === 'no_has_rep';

  const completedForms = (application.forms || []).filter((form) => form.status === 'Completed');
  const requiredPathwayFormTitles = new Set(pathwayRequirements.map((req) => req.title));
  if (requiredPathwayFormTitles.has('Room and Board/Tier Level Agreement')) {
    requiredPathwayFormTitles.add('Room and Board/Tier Level Commitment');
    requiredPathwayFormTitles.add('Room and Board Commitment');
  }
  const pendingFormAlerts = completedForms.filter((form) => {
    const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
    const isRequiredForPathway = requiredPathwayFormTitles.has(form.name);
    if (!isSummary && !isRequiredForPathway) return false;
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

  const handleRejectFormRedo = async (formName: string, sendEmail: boolean) => {
    if (!docRef || !application) return;
    const reason = String(rejectReasonByForm[formName] || '').trim();
    if (!reason) {
      toast({
        variant: 'destructive',
        title: 'Description required',
        description: 'Enter a description so the member/applicant knows what to redo.',
      });
      return;
    }

    const recipientEmail = String((application as any)?.referrerEmail || '').trim();
    if (sendEmail && !recipientEmail) {
      toast({
        variant: 'destructive',
        title: 'Email not available',
        description: 'Referrer/member email is not available for this application.',
      });
      return;
    }

    setRejectingByForm((prev) => ({ ...prev, [formName]: true }));
    try {
      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      const isSummary = formName === 'CS Member Summary' || formName === 'CS Summary';
      const rejectedAtIso = new Date().toISOString();
      let sentAtIso: string | null = null;

      if (sendEmail) {
        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientEmail,
            includeBcc: false,
            subject: `Action needed: Please redo ${formName}`,
            memberName: application.referrerName || 'there',
            staffName: reviewerName,
            message: `Please redo the "${formName}" form.\n\nReason: ${reason}\n\nLog in to the application portal and update this form so we can continue processing.`,
            status: 'Requires Revision',
          }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || 'Could not send redo email from local environment.');
        }
        sentAtIso = new Date().toISOString();
      }

      let found = false;
      const updatedForms = (application.forms || []).map((form: any) => {
        if (String(form?.name || '').trim() !== formName) return form;
        found = true;
        const existingHistory = Array.isArray((form as any)?.revisionHistory)
          ? ((form as any).revisionHistory as any[])
          : [];
        const historyEntry = {
          reason,
          rejectedAt: rejectedAtIso,
          rejectedBy: reviewerName,
          rejectedByUid: reviewerUid,
          emailed: Boolean(sentAtIso),
          emailTo: sentAtIso ? recipientEmail : null,
          emailSentAt: sentAtIso,
        };
        return {
          ...form,
          status: 'Pending',
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          revisionRequestedReason: reason,
          revisionRequestedAt: rejectedAtIso,
          revisionRequestedBy: reviewerName,
          revisionRequestedByUid: reviewerUid,
          revisionEmailTo: sentAtIso ? recipientEmail : null,
          revisionEmailSentAt: sentAtIso,
          revisionHistory: [historyEntry, ...existingHistory].slice(0, 10),
        };
      });

      if (!found) {
        throw new Error('Could not find this form on the application.');
      }

      const pendingDocReviewCount = updatedForms.filter((form: any) => {
        const isCompleted = form?.status === 'Completed';
        const name = String(form?.name || '').trim();
        const summary = name === 'CS Member Summary' || name === 'CS Summary';
        const acknowledged = Boolean(form?.acknowledged);
        return isCompleted && !summary && !acknowledged;
      }).length;

      const patch: Record<string, any> = {
        forms: updatedForms,
        status: 'Requires Revision',
        lastUpdated: serverTimestamp(),
        pendingDocReviewCount,
        pendingDocReviewUpdatedAt: serverTimestamp(),
      };

      if (isSummary) {
        patch.applicationChecked = false;
        patch.applicationCheckedDate = null;
        patch.applicationCheckedBy = null;
        patch.applicationCheckedByUid = null;
        patch.pendingCsReview = false;
      }

      await setDoc(docRef, patch, { merge: true });
      setApplication((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...patch,
          forms: updatedForms,
        };
      });

      setRejectReasonByForm((prev) => ({ ...prev, [formName]: '' }));
      setRejectDialogForm(null);
      toast({
        title: sendEmail ? 'Form rejected and email sent' : 'Form rejected',
        description: sendEmail
          ? `${formName} set to pending and email sent to ${recipientEmail}.`
          : `${formName} set to pending. Applicant can now redo the form.`,
      });
    } catch (error: any) {
      console.error('Reject form redo error:', error);
      toast({
        variant: 'destructive',
        title: 'Could not reject form',
        description: error?.message || 'Failed to process rejection.',
      });
    } finally {
      setRejectingByForm((prev) => ({ ...prev, [formName]: false }));
    }
  };

  const waiverSubTasks = [
      { id: 'hipaa', label: 'HIPAA Authorization', completed: !!waiverFormStatus?.ackHipaa },
      { id: 'liability', label: 'Liability Waiver', completed: !!waiverFormStatus?.ackLiability },
      { id: 'foc', label: 'Freedom of Choice', completed: !!waiverFormStatus?.ackFoc },
      { id: 'rb', label: 'Room & Board Commitment', completed: !!(waiverFormStatus as any)?.ackRoomAndBoard || !!(application as any)?.ackRoomAndBoard }
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

  const updateKaiserTierLevel = async (tierLevel: string) => {
    if (!docRef || !application || !user || !isKaiserPlan) return;
    const clientId2 = String((application as any)?.client_ID2 || (application as any)?.clientId2 || '').trim();
    if (!clientId2) {
      toast({
        variant: 'destructive',
        title: 'Missing Client ID',
        description: 'Cannot update Kaiser tier level because client_ID2 is missing.',
      });
      return;
    }

    setIsUpdatingKaiserTierLevel(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/kaiser-ils-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          clientId2,
          memberName: `${application.memberFirstName || ''} ${application.memberLastName || ''}`.trim(),
          tierLevel: tierLevel || '',
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to update tier level (HTTP ${response.status})`);
      }

      const localUpdate = { Kaiser_Tier_Level: tierLevel || '' } as any;
      await setDoc(docRef, localUpdate, { merge: true });
      setApplication((prev) => (prev ? ({ ...prev, ...localUpdate } as any) : prev));

      toast({
        title: 'Kaiser tier level updated',
        description: tierLevel ? `Set to Tier ${tierLevel}.` : 'Tier level cleared.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error updating Kaiser tier level:', error);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error?.message || 'Could not update Kaiser tier level.',
      });
    } finally {
      setIsUpdatingKaiserTierLevel(false);
    }
  };

  const generateRoomBoardAgreementPreview = async () => {
    if (!user || !applicationId || !application) return;
    setIsGeneratingRoomBoardPreview(true);
    try {
      await ensureAdminClaim();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/room-board-agreement/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,
          userId: appUserId || null,
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to generate preview (HTTP ${response.status})`);
      }
      const preview = (data?.preview || {}) as any;
      const warnings = Array.isArray(data?.warnings) ? data.warnings.map((w: any) => String(w || '').trim()).filter(Boolean) : [];
      setRoomBoardPreview(preview);
      setRoomBoardPreviewWarnings(warnings);
      toast({
        title: 'Preview generated',
        description: warnings.length > 0 ? `Preview loaded with ${warnings.length} warning(s).` : 'Preview is ready for review.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error generating room board agreement preview:', error);
      toast({
        variant: 'destructive',
        title: 'Preview failed',
        description: error?.message || 'Could not generate agreement preview.',
      });
    } finally {
      setIsGeneratingRoomBoardPreview(false);
    }
  };

  const sendRoomBoardAgreementInvites = async () => {
    if (!user || !applicationId || !application) return;
    if (!roomBoardPreview) {
      toast({
        variant: 'destructive',
        title: 'Preview required',
        description: 'Generate and review the agreement preview before sending invites.',
      });
      return;
    }
    const rcfeEmail = String(rcfeSignerEmailInput || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rcfeEmail)) {
      toast({
        variant: 'destructive',
        title: 'RCFE email required',
        description: 'Enter a valid RCFE signer email before sending invites.',
      });
      return;
    }
    const agreedAmount = String(agreedRoomBoardAmountInput || '').trim();
    if (!agreedAmount) {
      toast({
        variant: 'destructive',
        title: 'Agreed amount required',
        description: 'Enter the agreed room and board amount before sending invites.',
      });
      return;
    }
    if (!authorizedRepInviteEmail) {
      toast({
        variant: 'destructive',
        title: 'Authorized rep email missing',
        description: 'No authorized representative email was found on this application.',
      });
      return;
    }

    setIsSendingRoomBoardInvites(true);
    try {
      await ensureAdminClaim();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/room-board-agreement/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,
          userId: appUserId || null,
          rcfeSignerEmail: rcfeEmail,
          agreedRoomBoardAmount: agreedAmount,
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send invites (HTTP ${response.status})`);
      }

      setApplication((prev) =>
        prev
          ? ({
              ...(prev as any),
              roomBoardTierAgreement: {
                requestId: data.requestId,
                status: data.status || 'invited',
                memberRepEmail: data.memberRepEmail || authorizedRepInviteEmail,
                rcfeSignerEmail: data.rcfeSignerEmail || rcfeEmail,
                rcfeName: data.rcfeName || null,
                mcoAndTier: data.mcoAndTier || null,
                tierLevel: data.tierLevel || null,
                assistedLivingDailyRate: data.assistedLivingDailyRate || null,
                assistedLivingMonthlyRate: data.assistedLivingMonthlyRate || null,
                agreedRoomBoardAmount: data.agreedRoomBoardAmount || null,
                invitedAt: new Date().toISOString(),
              },
            } as any)
          : prev
      );

      toast({
        title: 'Invites sent',
        description: `Agreement invites sent to ${data.memberRepEmail || authorizedRepInviteEmail} and ${data.rcfeSignerEmail || rcfeEmail}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error sending room board agreement invites:', error);
      toast({
        variant: 'destructive',
        title: 'Invite failed',
        description: error?.message || 'Could not generate and send agreement invites.',
      });
    } finally {
      setIsSendingRoomBoardInvites(false);
    }
  };

  const sendRoomBoardAgreementToIls = async () => {
    if (!user || !applicationId || !application) return;
    setIsSendingRoomBoardIls(true);
    try {
      await ensureAdminClaim();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/room-board-agreement/notify-ils', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,
          userId: appUserId || null,
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send to ILS (HTTP ${response.status})`);
      }
      const result = data?.result || {};
      const status = String(result?.status || '');
      if (status === 'sent') {
        setApplication((prev) =>
          prev
            ? ({
                ...(prev as any),
                roomBoardTierAgreement: {
                  ...((prev as any)?.roomBoardTierAgreement || {}),
                  ilsDispatch: {
                    ...(((prev as any)?.roomBoardTierAgreement || {}).ilsDispatch || {}),
                    sentAt: new Date().toISOString(),
                    recipient: 'jocelyn@ilshealth.com',
                  },
                },
              } as any)
            : prev
        );
        toast({
          title: 'Sent to ILS',
          description: 'Signed agreement and proof of income were emailed to jocelyn@ilshealth.com.',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else if (status === 'already_sent') {
        toast({
          title: 'Already sent',
          description: 'These documents were already sent to ILS for this application.',
        });
      } else if (status === 'not_ready') {
        toast({
          variant: 'destructive',
          title: 'Not ready to send',
          description: String(result?.reason || 'Agreement and proof of income must be ready first.'),
        });
      } else {
        toast({
          title: 'No action taken',
          description: 'No ILS send action was performed.',
        });
      }
    } catch (error: any) {
      console.error('Error sending room board agreement to ILS:', error);
      toast({
        variant: 'destructive',
        title: 'Send failed',
        description: error?.message || 'Could not send documents to ILS.',
      });
    } finally {
      setIsSendingRoomBoardIls(false);
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
          includeBcc: false,
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
    const isCsSummaryReq = req.id === 'cs-summary';

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
                    {isCsSummaryReq && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="secondary" className="flex-1">
                            Quick View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-xl">
                              CS Summary: {application.memberFirstName} {application.memberLastName}
                            </DialogTitle>
                            <DialogDescription>
                              Complete CS Member Summary form data • {application.healthPlan} • {application.pathway}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-6 py-4 px-2">
                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Member Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">First Name</p><p className="font-semibold">{application.memberFirstName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Last Name</p><p className="font-semibold">{application.memberLastName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Date of Birth</p><p className="font-semibold">{application.memberDob ? format(new Date(String(application.memberDob)), 'PPP') : <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Age</p><p className="font-semibold">{(application as any).memberAge || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Medi-Cal Number</p><p className="font-semibold">{application.memberMediCalNum || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Medical Record Number (MRN)</p><p className="font-semibold">{application.memberMrn || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Preferred Language</p><p className="font-semibold">{application.memberLanguage || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">County</p><p className="font-semibold">{application.currentCounty || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Referrer Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Name</p><p className="font-semibold">{`${application.referrerFirstName || ''} ${application.referrerLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Email</p><p className="font-semibold">{application.referrerEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Phone</p><p className="font-semibold">{application.referrerPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Relationship</p><p className="font-semibold">{application.referrerRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Agency</p><p className="font-semibold">{application.agency || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Primary Contact</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Name</p><p className="font-semibold">{`${application.bestContactFirstName || ''} ${application.bestContactLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Relationship</p><p className="font-semibold">{application.bestContactRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Phone</p><p className="font-semibold">{application.bestContactPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Email</p><p className="font-semibold">{application.bestContactEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Language</p><p className="font-semibold">{application.bestContactLanguage || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Legal Representative</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Member Has Capacity</p><p className="font-semibold">{(['notApplicable', 'same_as_primary', 'different'].includes(String(application.hasLegalRep || '')) ? 'Yes, member has capacity' : String(application.hasLegalRep || '') === 'no_has_rep' ? 'No, member lacks capacity' : 'Yes, member has capacity')}</p></div>
                                <div><p className="text-sm text-muted-foreground">Has Legal Representative</p><p className="font-semibold">{String(application.hasLegalRep || '') || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Name</p><p className="font-semibold">{`${application.repFirstName || ''} ${application.repLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Relationship</p><p className="font-semibold">{application.repRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Phone</p><p className="font-semibold">{application.repPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Email</p><p className="font-semibold">{application.repEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Location Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Current Location Type</p><p className="font-semibold">{application.currentLocation || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Current Location Name</p><p className="font-semibold">{application.currentLocationName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Current Address</p><p className="font-semibold">{[
                                  String(application.currentAddress || '').trim(),
                                  String(application.currentCity || '').trim(),
                                  [String(application.currentState || '').trim(), String(application.currentZip || '').trim()].filter(Boolean).join(' '),
                                  String(application.currentCounty || '').trim(),
                                ].filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Customary Residence Type</p><p className="font-semibold">{application.customaryLocationType || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Customary Location Name</p><p className="font-semibold">{application.customaryLocationName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Customary Address</p><p className="font-semibold">{[
                                  String(application.customaryAddress || '').trim(),
                                  String(application.customaryCity || '').trim(),
                                  [String(application.customaryState || '').trim(), String(application.customaryZip || '').trim()].filter(Boolean).join(' '),
                                  String(application.customaryCounty || '').trim(),
                                ].filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Health Plan & Pathway</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Health Plan</p><p className="font-semibold">{application.healthPlan || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Pathway</p><p className="font-semibold">{application.pathway || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                {application.pathway === 'SNF Diversion' ? (
                                  <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Reason for Diversion</p><p className="font-semibold">{application.snfDiversionReason || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                ) : null}
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">ISP Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">ISP Contact Name</p><p className="font-semibold">{`${application.ispFirstName || ''} ${application.ispLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">ISP Contact Phone</p><p className="font-semibold">{application.ispPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">ISP Assessment Location</p><p className="font-semibold">{[
                                  String(application.ispAddress || '').trim(),
                                  String(application.ispCity || '').trim(),
                                  [String(application.ispState || '').trim(), String(application.ispZip || '').trim()].filter(Boolean).join(' '),
                                ].filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">RCFE Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">On ALW Waitlist?</p><p className="font-semibold">{application.onALWWaitlist || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Has Preferred RCFE?</p><p className="font-semibold">{application.hasPrefRCFE || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">RCFE Name</p><p className="font-semibold">{application.rcfeName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">RCFE Address</p><p className="font-semibold">{application.rcfeAddress || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Preferred RCFE Cities</p><p className="font-semibold">{application.rcfePreferredCities || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin First Name</p><p className="font-semibold">{application.rcfeAdminFirstName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin Last Name</p><p className="font-semibold">{application.rcfeAdminLastName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin Phone</p><p className="font-semibold">{application.rcfeAdminPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin Email</p><p className="font-semibold">{application.rcfeAdminEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Financial Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Income Source</p><p className="font-semibold">{application.incomeSource || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Has Medi-Cal</p><p className="font-semibold">{application.hasMediCal ? 'Yes' : 'No'}</p></div>
                                <div><p className="text-sm text-muted-foreground">Medi-Cal Number</p><p className="font-semibold">{application.memberMediCalNum || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Share of Cost</p><p className="font-semibold">{application.shareOfCost || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Room & Board Agreement</p><p className="font-semibold">{(() => {
                                  const forms = (application as any)?.forms || [];
                                  const form = forms.find((f: any) => {
                                    const name = String(f?.name || '').trim();
                                    return name === 'Room and Board/Tier Level Agreement' || name === 'Room and Board/Tier Level Commitment' || name === 'Room and Board Commitment';
                                  });
                                  const ack = form?.ackRoomAndBoard ?? (application as any)?.ackRoomAndBoard;
                                  if (ack === true) return 'Agrees';
                                  if (ack === false) return 'Does not agree';
                                  return 'Not provided';
                                })()}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Application Status & Tracking</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Submission Status</p><p className="font-semibold">{application.status || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Submitted Date</p><p className="font-semibold">{formatDateTimeValue(application.submissionDate) || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Last Updated</p><p className="font-semibold">{formatDateTimeValue(application.lastUpdated) || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Submitted By</p><p className="font-semibold">{application.referrerName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Application ID</p><p className="font-semibold">{application.id || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            {(application.additionalNotes || application.specialInstructions) ? (
                              <div>
                                <h3 className="text-lg font-semibold mb-2 text-primary">Additional Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                  {application.additionalNotes ? (
                                    <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Additional Notes</p><p className="font-semibold whitespace-pre-wrap">{application.additionalNotes}</p></div>
                                  ) : null}
                                  {application.specialInstructions ? (
                                    <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Special Instructions</p><p className="font-semibold whitespace-pre-wrap">{application.specialInstructions}</p></div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                </div>
            );
        case 'Upload':
             const isRoomBoardAgreementReq = req.id === 'room-board-obligation';
             if (formInfo?.status === 'Completed') {
                 const hasViewableFile = Boolean(formInfo.downloadURL);
                 return (
                    <div className="space-y-2">
                      <div className={cn(
                        'flex items-center justify-between gap-2 p-2 rounded-md border text-sm',
                        hasViewableFile ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                      )}>
                          {hasViewableFile ? (
                              <a href={formInfo.downloadURL} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-green-800 font-medium hover:underline">
                                  {formInfo?.fileName || 'Completed'}
                              </a>
                          ) : (
                              <span className="truncate flex-1 text-amber-800 font-medium">
                                No file available to view (this item was marked complete without an upload).
                              </span>
                          )}
                           <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleFileRemove(formInfo)}>
                              <X className="h-4 w-4" />
                              <span className="sr-only">Remove file</span>
                          </Button>
                      </div>
                      {req.href && req.href !== '#' && (
                          <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                            <Link href={req.href} target="_blank">
                                <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                            </Link>
                        </Button>
                      )}
                      {isRoomBoardAgreementReq ? (
                        <div className="space-y-2 rounded-md border p-2 bg-muted/20">
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => setRoomBoardWorkspaceOpen(true)}
                          >
                            Open Agreement Workspace
                          </Button>
                          <div className="flex flex-wrap gap-1">
                            {roomBoardAgreementMeta?.requestId ? (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                Req {String(roomBoardAgreementMeta.requestId)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                No request yet
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Status: {String(roomBoardAgreementMeta?.status || 'invited')}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              ILS: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Sent' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                      ) : null}
                      {!hasViewableFile && (
                        <>
                          {isUploading && (
                            <Progress value={currentProgress} className="h-1 w-full" />
                          )}
                          <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", isUploading && "opacity-50 pointer-events-none")}>
                              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                              <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload File(s)'}</span>
                          </Label>
                          <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading} multiple={isMultiple} />
                        </>
                      )}
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
                    {isRoomBoardAgreementReq ? (
                      <div className="space-y-2 rounded-md border p-2 bg-muted/20">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() => setRoomBoardWorkspaceOpen(true)}
                        >
                          Open Agreement Workspace
                        </Button>
                        <div className="flex flex-wrap gap-1">
                          {roomBoardAgreementMeta?.requestId ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Req {String(roomBoardAgreementMeta.requestId)}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              No request yet
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Status: {String(roomBoardAgreementMeta?.status || 'invited')}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            ILS: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Sent' : 'Pending'}
                          </Badge>
                        </div>
                      </div>
                    ) : null}
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", isUploading && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading} multiple={isMultiple} />
                    {req.id !== 'eligibility-screenshot' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setIntakeRequirementTitle(req.title);
                          setIntakeImportOpen(true);
                          setIntakeSelectedFileKey('');
                          setIntakeSearch('');
                          void loadMemberStandaloneIntakes();
                        }}
                        disabled={isUploading || !firestore}
                      >
                        Import from Standalone Uploads
                      </Button>
                    ) : null}
                </div>
            );
        default:
            return null;
    }
};

  const isConsolidatedUploading = uploading['consolidated-medical-upload'];
  const consolidatedProgress = uploadProgress['consolidated-medical-upload'];
  const isAnyConsolidatedChecked = Object.values(consolidatedUploadChecks).some(v => v);
  const adminPrimaryCardsCount =
    displayedPathwayRequirements.length + (consolidatedMedicalDocuments.length > 0 ? 1 : 0);
  const showAdminPlaceholderCard = adminPrimaryCardsCount % 2 === 1;
  const workspaceKaiserTierLevelValue = String((application as any)?.Kaiser_Tier_Level || (application as any)?.Tier_Level || '').trim();

  return (
    <div className="grid w-full min-w-0 grid-cols-1 lg:grid-cols-3 gap-8">
      <Dialog
        open={intakeImportOpen}
        onOpenChange={(open) => {
          setIntakeImportOpen(open);
          if (!open) {
            setIntakeSelectedFileKey('');
            setIntakeSearch('');
            setIntakeError('');
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="min-w-0">
              Import from Standalone Uploads
            </DialogTitle>
            <DialogDescription className="min-w-0">
              Attach a pending standalone intake upload into this slot: <span className="font-medium">{intakeRequirementTitle || '—'}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex-1 min-w-0">
                <Label htmlFor="intake-search" className="sr-only">Search</Label>
                <Input
                  id="intake-search"
                  value={intakeSearch}
                  onChange={(e) => setIntakeSearch(e.target.value)}
                  placeholder="Search document type / filename…"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => void loadMemberStandaloneIntakes()} disabled={intakeLoading || !firestore}>
                {intakeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>

            {intakeError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Unable to load standalone uploads</AlertTitle>
                <AlertDescription className="break-words">{intakeError}</AlertDescription>
              </Alert>
            )}

            {!intakeError && !intakeLoading && intakeUploads.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No pending standalone uploads found for this member.
              </div>
            )}

            <RadioGroup value={intakeSelectedFileKey} onValueChange={setIntakeSelectedFileKey} className="space-y-3">
              {(intakeUploads || [])
                .filter((u) => {
                  const q = String(intakeSearch || '').trim().toLowerCase();
                  if (!q) return true;
                  const hay = `${u.documentType || ''} ${u.memberName || ''} ${u.medicalRecordNumber || ''} ${u.files.map(f => f.fileName).join(' ')}`.toLowerCase();
                  return hay.includes(q);
                })
                .slice(0, 50)
                .map((u) => (
                  <Card key={u.id} className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-start justify-between gap-2 min-w-0">
                        <span className="truncate">{u.documentType || 'Standalone upload'}</span>
                        <Badge variant="outline" className="shrink-0">
                          {u.createdAtMs ? new Date(u.createdAtMs).toLocaleDateString() : '—'}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="min-w-0">
                        <span className="truncate block">{u.memberName || '—'}</span>
                        <span className="truncate block">
                          {u.healthPlan ? `${u.healthPlan} • ` : ''}{u.medicalRecordNumber ? `MRN ${u.medicalRecordNumber}` : 'MRN —'}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {u.files.map((f, idx) => {
                          const key = `${u.id}:${idx}`;
                          return (
                            <div key={key} className="flex items-start gap-2">
                              <RadioGroupItem value={key} id={`intake-file-${key}`} />
                              <label htmlFor={`intake-file-${key}`} className="min-w-0 text-sm leading-snug cursor-pointer">
                                <span className="block truncate font-medium">{f.fileName}</span>
                                <span className="block text-xs text-muted-foreground truncate">{u.id}</span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </RadioGroup>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIntakeImportOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void importStandaloneIntoSlot({ fileKey: intakeSelectedFileKey, requirementTitle: intakeRequirementTitle })}
                disabled={!intakeSelectedFileKey || !intakeRequirementTitle}
              >
                Attach to slot
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={roomBoardWorkspaceOpen} onOpenChange={setRoomBoardWorkspaceOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Room and Board/Tier Level Agreement</DialogTitle>
            <DialogDescription>
              Enter required fields, generate preview, and send invites from one workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-normal">
                  Status: {String(roomBoardAgreementMeta?.status || 'invited')}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-normal">
                  ILS: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Sent' : 'Pending'}
                </Badge>
                {roomBoardAgreementMeta?.requestId ? (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Request {String(roomBoardAgreementMeta.requestId)}
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                Authorized rep email (auto): {authorizedRepInviteEmail || 'Not found'}
              </div>
            </div>

            {isKaiserPlan ? (
              <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">Kaiser Tier Level</Label>
                  {isUpdatingKaiserTierLevel ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                </div>
                <Select
                  value={workspaceKaiserTierLevelValue || 'none'}
                  onValueChange={(value) => void updateKaiserTierLevel(value === 'none' ? '' : value)}
                  disabled={isUpdatingKaiserTierLevel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-[11px] text-muted-foreground">
                  Use this once Kaiser determines the member tier level.
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="room-board-rcfe-email-dialog" className="text-xs">RCFE signer email</Label>
              <Input
                id="room-board-rcfe-email-dialog"
                value={rcfeSignerEmailInput}
                onChange={(e) => setRcfeSignerEmailInput(e.target.value)}
                placeholder="rcfe-signer@example.com"
                disabled={isSendingRoomBoardInvites}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="room-board-agreed-amount-dialog" className="text-xs">Agreed room and board amount (manual)</Label>
              <Input
                id="room-board-agreed-amount-dialog"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={agreedRoomBoardAmountInput}
                onChange={(e) => setAgreedRoomBoardAmountInput(e.target.value)}
                placeholder="Enter amount manually"
                disabled={isSendingRoomBoardInvites}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void generateRoomBoardAgreementPreview()}
                disabled={isGeneratingRoomBoardPreview || isSendingRoomBoardInvites}
              >
                {isGeneratingRoomBoardPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Generate Preview
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void sendRoomBoardAgreementInvites()}
                disabled={isSendingRoomBoardInvites || !roomBoardPreview}
              >
                {isSendingRoomBoardInvites ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Generate + Send Invites
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Generate preview first, then send invites.
            </div>

            {roomBoardPreview ? (
              <div className="rounded-md border bg-background p-3 text-xs space-y-1">
                <div><span className="font-medium">Member:</span> {String(roomBoardPreview.memberName || '—')}</div>
                <div><span className="font-medium">MRN:</span> {String(roomBoardPreview.mrn || '—')}</div>
                <div><span className="font-medium">RCFE Name:</span> {String(roomBoardPreview.rcfeName || '—')}</div>
                <div><span className="font-medium">MCO/Tier:</span> {String(roomBoardPreview.mcoAndTier || '—')}</div>
                <div><span className="font-medium">Assisted living:</span> {roomBoardPreview.assistedLivingMonthlyRate ? `$${roomBoardPreview.assistedLivingMonthlyRate} monthly` : '—'}{roomBoardPreview.assistedLivingDailyRate ? ` / $${roomBoardPreview.assistedLivingDailyRate} daily` : ''}</div>
              </div>
            ) : null}

            {roomBoardPreviewWarnings.length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                {roomBoardPreviewWarnings.map((warning, idx) => (
                  <div key={`rb-preview-warn-dialog-${idx}`}>- {warning}</div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void sendRoomBoardAgreementToIls()}
                disabled={isSendingRoomBoardIls}
              >
                {isSendingRoomBoardIls ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send Signed Docs to ILS
              </Button>
            </div>

            {roomBoardAgreementMeta?.requestId ? (
              <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                <div>Latest request: {String(roomBoardAgreementMeta.requestId)} ({String(roomBoardAgreementMeta.status || 'invited')})</div>
                <div>MCO/Tier: {String(roomBoardAgreementMeta.mcoAndTier || '—')}</div>
                <div>Assisted living: {roomBoardAgreementMeta.assistedLivingMonthlyRate ? `$${roomBoardAgreementMeta.assistedLivingMonthlyRate} monthly` : '—'}{roomBoardAgreementMeta.assistedLivingDailyRate ? ` / $${roomBoardAgreementMeta.assistedLivingDailyRate} daily` : ''}</div>
                <div>ILS sent: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Yes' : 'No'}</div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
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
                {(() => {
                  const name = String(application.referrerName || user?.displayName || 'User').trim();
                  const email = String((application as any)?.referrerEmail || '').trim();
                  const by = email ? `${name} (${email})` : name;
                  return (
                    <>
                      Submitted by {by} | {application.pathway} ({application.healthPlan})
                      {processStatusLabel ? ` • Process: ${processStatusLabel}` : ''}
                    </>
                  );
                })()}
                </CardDescription>
            </div>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="truncate"><strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span></div>
                <div><strong>Submission Status:</strong> <span className="font-semibold">{application.status}</span></div>
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
                <div className="space-y-1 border-b pb-3">
                  <div className={cn('flex items-center gap-2 text-base font-semibold', eligibilityCompleted ? 'text-green-700' : 'text-amber-700')}>
                    {eligibilityCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <span>{eligibilityCompleted ? 'Eligibility Check: Complete' : 'Eligibility Check: Pending'}</span>
                  </div>
                  <div className={cn('flex items-center gap-2 text-base font-semibold', caspioPushed ? 'text-green-700' : 'text-amber-700')}>
                    {caspioPushed ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <span>{caspioPushed ? 'Caspio: Pushed' : 'Caspio: Pending'}</span>
                  </div>
                  {caspioPushed && caspioSentDateLabel ? (
                    <div className="text-xs text-muted-foreground pl-7">{caspioSentDateLabel}</div>
                  ) : null}
                  <div
                    className={cn(
                      'flex items-center gap-2 text-base font-semibold',
                      (application as any)?.emailRemindersEnabled === true ? 'text-green-700' : 'text-amber-700'
                    )}
                  >
                    {(application as any)?.emailRemindersEnabled === true ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <span>
                      Email reminders: {(application as any)?.emailRemindersEnabled === true
                        ? (documentReminderFrequencyDays === 7 ? 'On (weekly)' : 'On (every 2 days)')
                        : 'Off'}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-2 text-base font-semibold',
                      (application as any)?.statusRemindersEnabled === true ? 'text-green-700' : 'text-amber-700'
                    )}
                  >
                    {(application as any)?.statusRemindersEnabled === true ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <span>
                      Status updates: {(application as any)?.statusRemindersEnabled === true
                        ? (statusReminderFrequencyDays === 7 ? 'On (weekly)' : 'On (every 2 days)')
                        : 'Off'}
                    </span>
                  </div>
                  {familyStatusLastSentLabel ? (
                    <div className="text-xs text-muted-foreground pl-7">
                      Last family status email: {familyStatusLastSentLabel}
                      {String(familyStatusLastEmail?.to || '').trim() ? ` to ${String(familyStatusLastEmail?.to || '').trim()}` : ''}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Assigned staff</div>
                    <div className="font-medium">{(application as any)?.assignedStaffName || 'Unassigned'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      {application.healthPlan?.toLowerCase().includes('kaiser')
                        ? `Progression: ${(application as any)?.kaiserStatus || 'Unassigned'}`
                        : application.healthPlan?.toLowerCase().includes('health net')
                          ? `Progression: ${healthNetCurrentStatus || 'Unassigned'}`
                          : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Process Tracker</span>
                          {isNewCsSummary && (
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                              New CS
                            </Badge>
                          )}
                        </div>
                        <span>{processTrackerCompletedCount} of {processTrackerTotalCount} required items completed</span>
                    </div>
                    <Progress value={processTrackerProgress} className="h-2" />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {processTrackerStatuses.map(({ item, status }) => {
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
            {displayedPathwayRequirements.map((req) => {
                const formInfo = formStatusMap.get(req.title);
                const status = formInfo?.status || 'Pending';
                const isSummary = req.title === 'CS Member Summary' || req.title === 'CS Summary';
                const isReviewed = isSummary
                  ? Boolean((application as any)?.applicationChecked)
                  : Boolean(formInfo?.acknowledged);
                const needsReview = status === 'Completed' && !isReviewed;
                const roomBoardAck =
                  req.title === 'Room and Board/Tier Level Agreement'
                    ? (formInfo as any)?.ackRoomAndBoard ?? (application as any)?.ackRoomAndBoard
                    : null;
                
                return (
                    <Card key={req.id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start gap-4 min-w-0">
                                <CardTitle className="text-lg flex items-center gap-2 min-w-0">
                                  {req.title}
                                  {isSummary && isNewCsSummary && (
                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                      New
                                    </Badge>
                                  )}
                                  {req.title === 'Room and Board/Tier Level Agreement' && status === 'Completed' && roomBoardAck === false ? (
                                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                                      Does not agree
                                    </Badge>
                                  ) : null}
                                </CardTitle>
                                {status === 'Completed' && (
                                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    <div className="flex flex-wrap items-center justify-end gap-2 max-w-[260px]">
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
                                    </div>
                                    {isReviewed && (() => {
                                      const meta = getReviewerMeta(req.title, formInfo);
                                      if (!meta.name && !meta.dateLabel) return null;
                                      const parts = [meta.dateLabel, meta.name].filter(Boolean);
                                      return (
                                        <div className="text-[11px] text-muted-foreground leading-tight text-right max-w-[260px] whitespace-normal break-words">
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
                            {(
                                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-3">
                                    <Dialog
                                      open={rejectDialogForm === req.title}
                                      onOpenChange={(open) => setRejectDialogForm(open ? req.title : null)}
                                    >
                                      <DialogTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="w-full border-amber-300 text-amber-800 hover:bg-amber-100"
                                        >
                                          Reject card / request redo
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent className="sm:max-w-xl">
                                        <DialogHeader>
                                          <DialogTitle>Reject {req.title}</DialogTitle>
                                          <DialogDescription>
                                            Add a reason for rejection. You can reject the card only, or reject and email the member/applicant to redo this form.
                                          </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-3">
                                          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                                            <div>
                                              <span className="font-medium">Sending to:</span>{' '}
                                              {String((application as any)?.referrerEmail || '').trim() || 'No email on file'}{' '}
                                              <span className="text-muted-foreground">(BCC disabled)</span>
                                            </div>
                                            {formInfo && (
                                              <>
                                                {String((formInfo as any)?.revisionEmailSentAt || '').trim() ? (
                                                  <div>
                                                    <span className="font-medium">Last rejection email sent:</span>{' '}
                                                    {format(new Date(String((formInfo as any).revisionEmailSentAt)), 'MMM d, yyyy h:mm a')}
                                                    {String((formInfo as any)?.revisionEmailTo || '').trim()
                                                      ? ` to ${String((formInfo as any).revisionEmailTo).trim()}`
                                                      : ''}
                                                  </div>
                                                ) : (
                                                  <div>
                                                    <span className="font-medium">Last rejection email sent:</span> Not sent yet
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </div>
                                          <div className="space-y-1">
                                            <Label htmlFor={`reject-reason-${req.id}`} className="text-xs font-medium">
                                              Description (required)
                                            </Label>
                                            <Textarea
                                              id={`reject-reason-${req.id}`}
                                              value={rejectReasonByForm[req.title] || ''}
                                              onChange={(e) =>
                                                setRejectReasonByForm((prev) => ({ ...prev, [req.title]: e.target.value }))
                                              }
                                              placeholder="Explain what needs to be corrected before this form can be approved."
                                              className="min-h-[110px]"
                                            />
                                          </div>
                                          <div className="flex flex-wrap justify-end gap-2 pt-2">
                                            <Button
                                              variant="ghost"
                                              onClick={() => setRejectDialogForm(null)}
                                              disabled={Boolean(rejectingByForm[req.title])}
                                            >
                                              Cancel
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={Boolean(rejectingByForm[req.title])}
                                              onClick={() => handleRejectFormRedo(req.title, false)}
                                            >
                                              {rejectingByForm[req.title] ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                              Reject only
                                            </Button>
                                            <Button
                                              size="sm"
                                              className="bg-amber-600 text-white hover:bg-amber-700"
                                              disabled={Boolean(rejectingByForm[req.title])}
                                              onClick={() => handleRejectFormRedo(req.title, true)}
                                            >
                                              {rejectingByForm[req.title] ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                              Reject + Email applicant
                                            </Button>
                                          </div>
                                        </div>
                                      </DialogContent>
                                    </Dialog>
                                    {(() => {
                                      const latest = Array.isArray((formInfo as any)?.revisionHistory)
                                        ? (formInfo as any).revisionHistory[0]
                                        : null;
                                      if (!latest || !latest?.emailed) return null;
                                      const sentLabel = formatDateTimeValue(latest?.emailSentAt);
                                      return (
                                        <div className="text-xs text-green-700">
                                          Email sent successfully{sentLabel ? ` at ${sentLabel}` : ''}.
                                        </div>
                                      );
                                    })()}
                                    {Array.isArray((formInfo as any)?.revisionHistory) && (formInfo as any).revisionHistory.length > 0 && (
                                      <Dialog>
                                        <DialogTrigger asChild>
                                          <button
                                            type="button"
                                            className="text-xs text-amber-800 underline underline-offset-2 hover:text-amber-900 w-fit"
                                          >
                                            View reject history ({(formInfo as any).revisionHistory.length})
                                          </button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-2xl">
                                          <DialogHeader>
                                            <DialogTitle>Reject history: {req.title}</DialogTitle>
                                            <DialogDescription>
                                              Recent rejection requests and email delivery details for this card.
                                            </DialogDescription>
                                          </DialogHeader>
                                          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                                            {(formInfo as any).revisionHistory.map((entry: any, idx: number) => {
                                              const when = String(entry?.rejectedAt || '').trim();
                                              const dateLabel = when && !Number.isNaN(new Date(when).getTime())
                                                ? format(new Date(when), 'MMM d, yyyy h:mm a')
                                                : 'Unknown date';
                                              const who = String(entry?.rejectedBy || '').trim() || 'Unknown sender';
                                              const why = String(entry?.reason || '').trim() || 'No reason';
                                              const emailed = Boolean(entry?.emailed);
                                              const to = String(entry?.emailTo || '').trim();
                                              const sentAt = String(entry?.emailSentAt || '').trim();
                                              const sentLabel = sentAt && !Number.isNaN(new Date(sentAt).getTime())
                                                ? format(new Date(sentAt), 'MMM d, yyyy h:mm a')
                                                : '';
                                              return (
                                                <div
                                                  key={`reject-history-dialog-${req.id}-${idx}`}
                                                  className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground leading-snug"
                                                >
                                                  <div>
                                                    <span className="font-medium text-foreground">{dateLabel}</span> - {who}
                                                  </div>
                                                  <div>{why}</div>
                                                  <div className={emailed ? 'text-red-700' : ''}>
                                                    {emailed
                                                      ? `Emailed ${to || 'applicant'}${sentLabel ? ` at ${sentLabel}` : ''}`
                                                      : 'Email not sent'}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    )}
                                </div>
                            )}
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
              <Card key="consolidated-medical" className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
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
            {showAdminPlaceholderCard && (
              <Card
                aria-hidden="true"
                className="hidden md:flex border-dashed border-muted-foreground/20 bg-transparent shadow-none pointer-events-none"
              >
                <CardContent className="h-full min-h-[120px]" />
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

            <PushToCaspioDialog
              application={application}
              buttonVariant="outline"
              buttonClassName="w-full justify-start gap-2"
            />

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
                    <span className="mt-2 block text-xs text-muted-foreground">
                      Assigned staff:{' '}
                      <span className="font-medium text-foreground">
                        {String((application as any)?.assignedStaffName || '').trim() || 'Unassigned'}
                      </span>
                    </span>
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
                                      ? (healthNetCurrentStatus || '')
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
                  Missing Docs and status reminders
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Missing Docs and status reminders</DialogTitle>
                  <DialogDescription>
                    Configure reminder cadence and preview reminder content before test-sending.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <Label htmlFor="email-reminders-quick" className="text-sm font-medium">
                          Email reminders for missing documents
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Recipient: {(application as any)?.referrerEmail || 'Email not available'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isUpdatingReminderControls && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Switch
                        id="email-reminders-quick"
                        checked={Boolean((application as any)?.emailRemindersEnabled)}
                        onCheckedChange={(enabled) => updateReminderSettings({ emailRemindersEnabled: Boolean(enabled) })}
                        disabled={isUpdatingReminderControls}
                      />
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                    <p className="text-xs font-medium text-slate-800 mb-1">Currently required missing documents (email content):</p>
                    {currentReminderMissingItems.length > 0 ? (
                      <ul className="text-xs text-slate-700 space-y-1">
                        {currentReminderMissingItems.map((doc) => (
                          <li key={doc} className="flex items-center gap-1">
                            <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                            {doc}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-green-700">All required documents are currently complete.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email-reminder-frequency-quick">Email reminder frequency</Label>
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
                      <SelectTrigger id="email-reminder-frequency-quick" className="w-full">
                        <SelectValue placeholder="Frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {reminderFrequencyOptions.map((d) => (
                          <SelectItem key={`quick-doc-freq-${d}`} value={String(d)}>
                            {d === 7 ? 'Weekly' : 'Every 2 days'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
                    <Label htmlFor="staff-test-reminder-email" className="text-sm font-medium">
                      Staff test reminder email
                    </Label>
                    <Input
                      id="staff-test-reminder-email"
                      type="email"
                      value={staffTestReminderEmail}
                      readOnly
                      disabled
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={loadTestMissingDocsPreview}
                        disabled={isLoadingReminderPreview || !staffTestReminderEmail}
                      >
                        {isLoadingReminderPreview ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Eye className="mr-2 h-4 w-4" />
                            Preview Test
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={sendTestMissingDocsReminder}
                        disabled={isSendingTestReminder || !staffTestReminderEmail}
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

                  {reminderPreview && (
                    <div className="rounded border bg-white p-3 space-y-2">
                      <div className="text-xs font-semibold">Reminder email preview (what applicant sees)</div>
                      <div className="text-xs text-muted-foreground">To: {reminderPreview.recipientEmail}</div>
                      <div className="text-xs text-muted-foreground">Subject: {reminderPreview.subject}</div>
                      <div className="text-xs">
                        Hi {reminderPreview.referrerName}, this is a reminder that the application for {reminderPreview.memberName} is still missing:
                      </div>
                      {reminderPreview.missingItems.length > 0 ? (
                        <ul className="text-xs space-y-1">
                          {reminderPreview.missingItems.map((item) => (
                            <li key={item} className="flex items-center gap-1">
                              <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-muted-foreground">No missing items.</div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center space-x-2">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <Label htmlFor="status-reminders-quick" className="text-sm font-medium">
                          Status update reminders
                        </Label>
                        <p className="text-xs text-muted-foreground">Send application status updates to user</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isUpdatingReminderControls && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Switch
                        id="status-reminders-quick"
                        checked={Boolean((application as any)?.statusRemindersEnabled)}
                        onCheckedChange={(enabled) => updateReminderSettings({ statusRemindersEnabled: Boolean(enabled) })}
                        disabled={isUpdatingReminderControls}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status-reminder-frequency-quick">Status reminder frequency</Label>
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
                      <SelectTrigger id="status-reminder-frequency-quick" className="w-full">
                        <SelectValue placeholder="Frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {reminderFrequencyOptions.map((d) => (
                          <SelectItem key={`quick-status-freq-${d}`} value={String(d)}>
                            {d === 7 ? 'Weekly' : 'Every 2 days'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(isKaiserPlan || isHealthNetPlan) && (
                    <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
                      <Label htmlFor="family-status-progress" className="text-sm font-medium">
                        Application progress (status reminders to families)
                      </Label>
                      <Select
                        value={familyStatusProgressValue || 'none'}
                        onValueChange={(value) => {
                          void handleFamilyStatusProgressChange(value);
                        }}
                        disabled={isUpdatingReminderControls}
                      >
                        <SelectTrigger id="family-status-progress">
                          <SelectValue placeholder="Select progress status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {familyProgressOptions.map((option) => (
                            <SelectItem key={`family-progress-${option}`} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {familyProgressNeedsDeniedReason && (
                        <div className="space-y-2">
                          <Label htmlFor="family-status-denied-reason" className="text-sm font-medium">
                            Authorization denied reason
                          </Label>
                          <Textarea
                            id="family-status-denied-reason"
                            rows={3}
                            placeholder="Enter denial reason for family status updates..."
                            value={familyStatusDeniedReason}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setApplication((prev) =>
                                prev ? ({ ...(prev as any), familyStatusDeniedReason: nextValue } as any) : prev
                              );
                            }}
                            onBlur={(event) => {
                              void handleFamilyDeniedReasonBlur(event.target.value);
                            }}
                            disabled={isUpdatingReminderControls}
                          />
                        </div>
                      )}
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          void handleManualFamilyStatusSend();
                        }}
                        disabled={
                          isSendingFamilyStatusNow ||
                          !familyStatusProgressValue ||
                          (familyProgressNeedsDeniedReason && !String(familyStatusDeniedReason || '').trim())
                        }
                      >
                        {isSendingFamilyStatusNow ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending status...
                          </>
                        ) : (
                          'Send status update now'
                        )}
                      </Button>

                      {familyStatusHistory.length > 0 && (
                        <div className="space-y-1 rounded border p-2 bg-white">
                          <div className="text-xs font-medium text-muted-foreground">Recent status emails</div>
                          {familyStatusHistory.slice(0, 5).map((entry: any, idx: number) => {
                            const when = (() => {
                              try {
                                const d = new Date(entry?.sentAtMs || entry?.sentAtIso || '');
                                return Number.isNaN(d.getTime()) ? '' : format(d, 'MMM d, h:mm a');
                              } catch {
                                return '';
                              }
                            })();
                            return (
                              <div key={`family-status-history-${idx}`} className="text-xs text-muted-foreground">
                                {when ? `${when} - ` : ''}{String(entry?.status || 'Status update')}
                                {String(entry?.reason || '').trim() ? ` (Reason: ${String(entry.reason).trim()})` : ''}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
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
