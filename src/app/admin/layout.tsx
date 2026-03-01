'use client';

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import appPackage from '../../../package.json';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/hooks/use-admin';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { DesktopNotificationsDevShim } from '@/components/DesktopNotificationsDevShim';
import { WebNotificationsDevTester } from '@/components/WebNotificationsDevTester';
import { RealTimeNotifications } from '@/components/RealTimeNotifications';
import {
  LayoutDashboard,
  Shield,
  Loader2,
  LogOut,
  User as UserIcon,
  FolderKanban,
  BarChart3,
  ListChecks,
  Menu,
  ShieldAlert,
  Kanban,
  ClipboardList,
  ClipboardCheck,
  Heart,
  Printer,
  FolderSync,
  Bell,
  BellRing,
  Database,
  FileEdit,
  Mail,
  Brain,
  ChevronDown,
  ChevronRight,
  Activity,
  Settings,
  MessageSquareText,
  FileText,
  TestTube2,
  Map as MapIcon,
  Calendar,
  DollarSign,
  Navigation,
  Wrench,
  UserPlus,
  CalendarCheck,
  RefreshCw,
  Users,
  RotateCcw,
  UserCheck,
  FileBarChart,
  UploadCloud
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth, useFirestore } from '@/firebase';
import { useGlobalNotifications } from '@/components/NotificationProvider';
import { StaffNotificationBell } from '@/components/StaffNotificationBell';
import { SocialWorkerRedirect } from '@/components/SocialWorkerRedirect';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Image from 'next/image';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { collection, collectionGroup, doc, getDocs, limit, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { CaspioUsageAlert } from '@/components/admin/CaspioUsageAlert';
import { DesktopPresenceBeacon } from '@/components/admin/DesktopPresenceBeacon';
import { isPriorityOrUrgent } from '@/lib/notification-utils';

const adminNavLinks = [
  { 
    label: 'Dashboard', 
    icon: LayoutDashboard, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin', label: 'Activity Dashboard', icon: Activity },
      { href: '/admin/applications', label: 'All Applications', icon: FolderKanban },
      { href: '/admin/incomplete-cs-summary', label: 'Incomplete CS Summary', icon: FileText },
      { href: '/admin/missing-documents', label: 'Missing Documents', icon: FolderKanban },
      { href: '/admin/standalone-uploads', label: 'Standalone Upload Intake', icon: UploadCloud },
      { href: '/admin/progress-tracker', label: 'Progress Tracker', icon: ListChecks },
      { href: '/admin/applications/create', label: 'Create Application', icon: UserPlus },
      { href: '/admin/member-notes', label: 'Member Notes Lookup', icon: MessageSquareText },
      { href: '/admin/eligibility-checks', label: 'Eligibility Checks', icon: Shield }
    ]
  },
  { 
    label: 'My Tasks', 
    icon: ClipboardList, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/my-notes', label: 'My Notifications', icon: Bell },
      { href: '/admin/tasks', label: 'Daily Task Tracker', icon: ClipboardList }
    ]
  },
  { 
    label: 'Tools', 
    icon: Wrench, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/tools', label: 'Tools Home', icon: Wrench },
      { href: '/admin/ils-report-editor', label: 'ILS Report Editor', icon: FileEdit },
      { href: '/admin/kaiser-tracker', label: 'Kaiser Tracker', icon: Heart },
      { href: '/admin/social-worker-assignments', label: 'Social Worker Assignments', icon: UserPlus },
      { href: '/admin/sw-roster', label: 'SW Weekly Roster', icon: Printer },
      { href: '/admin/tools/sw-proximity', label: 'SW Proximity (EFT setup)', icon: Navigation },
      { href: '/admin/sw-visit-tracking', label: 'SW Visit Tracking', icon: FileBarChart },
      { href: '/admin/sw-claims-tracking', label: 'SW Claims Tracker', icon: FileBarChart },
      { href: '/admin/member-activity', label: 'Member Activity', icon: Activity },
      { href: '/admin/authorization-tracker', label: 'Authorization Tracker', icon: Shield },
      { href: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
      { href: '/admin/california-map-enhanced', label: 'Map Intelligence', icon: Navigation },
      { href: '/admin/california-counties', label: 'County Analysis', icon: MapIcon },
      { href: '/admin/reports', label: 'Reports', icon: FileText }
    ]
  },
];

const superAdminNavLinks = [
  { 
    label: 'Super Admin', 
    icon: ShieldAlert, 
    isSubmenu: true,
    submenuItems: [
      // Consolidated Management Pages
      { href: '/admin/user-staff-management', label: 'User & Staff Management', icon: Users },
      { href: '/admin/operations-dashboard', label: 'Operations Dashboard', icon: Kanban },
      { href: '/admin/application-progression', label: 'Application Progression', icon: ListChecks },
      { href: '/admin/global-task-tracker', label: 'Global Task Tracker', icon: ClipboardList },
      { href: '/admin/activity-log', label: 'System Activity Log', icon: Activity },
      { href: '/admin/system-configuration', label: 'System Configuration', icon: Settings },
      { href: '/admin/data-integration', label: 'Data & Integration Tools', icon: Database },
      { href: '/admin/communication-notes', label: 'Communication & Notes', icon: MessageSquareText },
      { href: '/admin/development-testing', label: 'Development & Testing', icon: TestTube2 }
    ]
  }
];

function AdminHeader() {
  const { user, isSuperAdmin } = useAdmin();
  const { isSocialWorker } = useSocialWorker();
  const auth = useAuth();
  const firestore = useFirestore();
  const { showNotification } = useGlobalNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set());
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);
  const [newCsSummaryCount, setNewCsSummaryCount] = useState(0);
  const [newUploadCount, setNewUploadCount] = useState(0);
  const [hnCsCount, setHnCsCount] = useState(0);
  const [hnDocCount, setHnDocCount] = useState(0);
  const [kaiserCsCount, setKaiserCsCount] = useState(0);
  const [kaiserDocCount, setKaiserDocCount] = useState(0);
  const [eligibilityPendingCount, setEligibilityPendingCount] = useState(0);
  const [priorityNotesCount, setPriorityNotesCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [csIsNewFlag, setCsIsNewFlag] = useState(false);
  const [reviewPopupPrefs, setReviewPopupPrefs] = useState<{
    enabled: boolean;
    recipientEnabled: boolean;
    allowDocs: boolean;
    allowCs: boolean;
  }>({ enabled: true, recipientEnabled: false, allowDocs: false, allowCs: false });
  // In admin, show the review popup whenever there are pending review items.
  // Use an in-memory baseline so we don't spam repeatedly while the page is open,
  // but refreshing the page will show the reminder again (like interoffice notes).
  const reviewNotifyRef = useRef<{
    initialized: boolean;
    docs: { count: number; latestMs: number };
    cs: { count: number; latestMs: number };
  }>({ initialized: false, docs: { count: 0, latestMs: 0 }, cs: { count: 0, latestMs: 0 } });
  // Track whether we have ever set the review pill on desktop for this session.
  // This is used only to avoid sending redundant payloads during steady state.
  const desktopReviewInitializedRef = useRef(false);

  // Throttle doc-upload popups so staff isn't spammed by multiple files.
  // Deliver at most once per window; aggregate by application.
  const DOC_UPLOAD_THROTTLE_MS = 10 * 60 * 1000;
  const docsByAppRef = useRef<
    Map<
      string,
      {
        appId: string;
        url: string;
        memberName: string;
        uploader: string;
        labels: Set<string>;
        count: number;
        latestMs: number;
      }
    >
  >(new Map());
  const docsBatchRef = useRef<{
    lastSentAt: number;
    timer: ReturnType<typeof setTimeout> | null;
    pending: Map<
      string,
      {
        url: string;
        memberName: string;
        uploader: string;
        labels: Set<string>;
        count: number;
        latestMs: number;
      }
    >;
  }>({ lastSentAt: 0, timer: null, pending: new Map() });

  const toMs = (value: any): number => {
    if (!value) return 0;
    try {
      if (typeof value?.toMillis === 'function') return value.toMillis();
      if (typeof value?.toDate === 'function') return value.toDate().getTime();
      const d = new Date(value);
      const ms = d.getTime();
      return Number.isNaN(ms) ? 0 : ms;
    } catch {
      return 0;
    }
  };

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const reviewRef = doc(firestore, 'system_settings', 'review_notifications');
    const unsubscribe = onSnapshot(
      reviewRef,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const enabled = data?.enabled === undefined ? true : Boolean(data?.enabled);
        const recipients = (data?.recipients || {}) as Record<string, any>;
        const email = String(user.email || '').trim().toLowerCase();
        const byUid = recipients?.[user.uid] || null;
        const byEmailKey = email ? recipients?.[email] || null : null;
        const byEmailField =
          !byUid && !byEmailKey && email
            ? (Object.values(recipients).find((r: any) => String(r?.email || '').trim().toLowerCase() === email) || null)
            : null;
        const recipient = byUid || byEmailKey || byEmailField || null;
        setReviewPopupPrefs({
          enabled,
          recipientEnabled: Boolean(recipient?.enabled),
          allowDocs: Boolean(recipient?.documents),
          allowCs: Boolean(recipient?.csSummary),
        });
      },
      () => {
        // If prefs cannot be loaded, keep notifications disabled (explicit authorization required).
        setReviewPopupPrefs({ enabled: true, recipientEnabled: false, allowDocs: false, allowCs: false });
      }
    );
    return () => unsubscribe();
  }, [firestore, user?.uid, user?.email]);

  // Action item counter: pending Eligibility Checks
  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, 'eligibilityChecks'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setEligibilityPendingCount(snap.size || 0);
      },
      () => {
        setEligibilityPendingCount(0);
      }
    );
    return () => unsubscribe();
  }, [firestore]);

  // Keep Action items counts aligned with the Electron pill summary (Chat + Priority Notes).
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const qy = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', user.uid),
      limit(500)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        let nextPriority = 0;
        let nextChat = 0;
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const isRead = Boolean(data?.isRead);
          const status = String(data?.status || 'Open').toLowerCase();
          if (status === 'closed') return;
          if (Boolean(data?.isChatOnly)) {
            if (!isRead) nextChat += 1;
            return;
          }
          if (!isRead && isPriorityOrUrgent(data?.priority)) {
            nextPriority += 1;
          }
        });
        setPriorityNotesCount(nextPriority);
        setChatUnreadCount(nextChat);
      },
      () => {
        setPriorityNotesCount(0);
        setChatUnreadCount(0);
      }
    );
    return () => unsub();
  }, [firestore, user?.uid]);

  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
    }
    const isRealDesktop =
      typeof window !== 'undefined' &&
      Boolean((window as any).desktopNotifications) &&
      !Boolean((window as any).desktopNotifications?.__shim);
    // In Electron, keep users in the admin flow (full-size window), not the public site.
    window.location.href = isRealDesktop ? '/admin/login' : '/';
  };

  const toggleSubmenu = (label: string) => {
    const newOpenSubmenus = new Set(openSubmenus);
    if (newOpenSubmenus.has(label)) {
      newOpenSubmenus.delete(label);
    } else {
      newOpenSubmenus.add(label);
    }
    setOpenSubmenus(newOpenSubmenus);
  };

  const handleMouseEnter = (label: string) => {
    setHoveredSubmenu(label);
  };

  const handleMouseLeave = () => {
    setHoveredSubmenu(null);
  };

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const userAppsQuery = collectionGroup(firestore, 'applications');
    const adminAppsQuery = collection(firestore, 'applications');
    const standaloneUploadsQuery = query(
      collection(firestore, 'standalone_upload_submissions'),
      where('status', '==', 'pending'),
      limit(500)
    );

    let userApps: any[] = [];
    let adminApps: any[] = [];
    let standaloneUploads: any[] = [];
    let unsubUserApps: (() => void) | undefined;
    let unsubAdminApps: (() => void) | undefined;
    let unsubStandaloneUploads: (() => void) | undefined;
    let isActive = true;

    const computeCount = () => {
      const combined = [...userApps, ...adminApps];
      const deduped = new Map<string, any>();
      combined.forEach((app) => {
        const key = `${app.id}-${app.userId || 'admin'}`;
        deduped.set(key, app);
      });

      const dedupedApps = Array.from(deduped.values());
      let nextHnCs = 0;
      let nextHnDocs = 0;
      let nextKaiserCs = 0;
      let nextKaiserDocs = 0;

      let csSummaryCount = 0;
      let csLatestMs = 0;
      const csNotes: Array<{ message: string; timestampMs: number; url: string; author: string }> = [];
      let uploadCount = 0;
      let docsLatestMs = 0;
      const docNotes: Array<{ message: string; timestampMs: number; url: string; author: string }> = [];

      const docsByApp = new Map<
        string,
        {
          appId: string;
          url: string;
          memberName: string;
          uploader: string;
          labels: Set<string>;
          count: number;
          latestMs: number;
        }
      >();

      dedupedApps.forEach((app: any) => {
        const memberName = `${app.memberFirstName || 'Unknown'} ${app.memberLastName || 'Member'}`.trim();
        const plan = String(app.healthPlan || '').toLowerCase();
        const isKaiser = plan.includes('kaiser');
        const isHn = plan.includes('health net');
        const ownerUid = app.__ownerUid || app.userId || null;
        const appUrl = ownerUid
          ? `/admin/applications/${app.id}?userId=${encodeURIComponent(ownerUid)}`
          : `/admin/applications/${app.id}`;
        const appKey = `${app.id}-${ownerUid || 'admin'}`;

        const forms = app.forms || [];

        // CS Summary needs review: completed CS Summary + not checked.
        const hasCompletedSummary = forms.some((form: any) =>
          (form.name === 'CS Member Summary' || form.name === 'CS Summary') && form.status === 'Completed'
        );
        const reviewed = Boolean(app.applicationChecked);
        if (hasCompletedSummary && !reviewed) {
          csSummaryCount += 1;
          if (isKaiser) nextKaiserCs += 1;
          else if (isHn) nextHnCs += 1;

          const ms = Math.max(
            toMs(app.csSummaryCompletedAt),
            toMs(app.lastUpdated),
            toMs(app.lastModified),
            toMs(app.createdAt)
          );
          csLatestMs = Math.max(csLatestMs, ms);
          const csAuthor = String(app.csSummarySubmittedByName || app.csSummarySubmittedByEmail || app.referrerName || app.referrerEmail || '').trim() || 'User';
          csNotes.push({ message: memberName, timestampMs: ms, url: appUrl, author: csAuthor });
        }

        // Documents need review: any non-CS form completed + not acknowledged.
        forms.forEach((form: any) => {
          const isCompleted = form.status === 'Completed';
          const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
          const isPending = isCompleted && !isSummary && !form.acknowledged;
          if (!isPending) return;

          uploadCount += 1;
          if (isKaiser) nextKaiserDocs += 1;
          else if (isHn) nextHnDocs += 1;

          const ms = Math.max(
            toMs(form.dateCompleted),
            toMs(form.uploadedAt),
            toMs(app.pendingDocReviewUpdatedAt),
            toMs(app.lastDocumentUpload),
            toMs(app.lastUpdated),
            toMs(app.lastModified),
            toMs(app.createdAt)
          );
          docsLatestMs = Math.max(docsLatestMs, ms);
          const docLabel = String(form.name || '').trim();
          const docAuthor = String(form.uploadedByName || form.uploadedByEmail || app.referrerName || app.referrerEmail || '').trim() || 'User';
          docNotes.push({ message: docLabel ? `${memberName} — ${docLabel}` : memberName, timestampMs: ms, url: appUrl, author: docAuthor });

          const current = docsByApp.get(appKey) || {
            appId: app.id,
            url: appUrl,
            memberName,
            uploader: docAuthor,
            labels: new Set<string>(),
            count: 0,
            latestMs: 0,
          };
          current.count += 1;
          current.latestMs = Math.max(current.latestMs, ms);
          if (docLabel) current.labels.add(docLabel);
          // If different files came from different uploaders, show "Multiple".
          if (current.uploader !== docAuthor) current.uploader = 'Multiple';
          docsByApp.set(appKey, current);
        });
      });

      // Standalone uploads (not yet attached to an application).
      standaloneUploads.forEach((u: any) => {
        const memberName = String(u?.memberName || '').trim() || 'Unknown Member';
        const plan = String(u?.healthPlan || '').toLowerCase();
        const isKaiser = plan.includes('kaiser');
        const isHn = plan.includes('health net');
        const url = `/admin/standalone-uploads?focus=${encodeURIComponent(String(u?.id || ''))}`;
        const docType = String(u?.documentType || '').trim();
        const docTypeLower = docType.toLowerCase();
        const isCs = docTypeLower.includes('cs') && docTypeLower.includes('summary');

        const ms = Math.max(toMs(u?.createdAt), toMs(u?.updatedAt), toMs(u?.timestamp));
        const author = String(u?.uploaderName || u?.uploaderEmail || '').trim() || 'User';

        if (isCs) {
          csSummaryCount += 1;
          if (isKaiser) nextKaiserCs += 1;
          else if (isHn) nextHnCs += 1;
          csLatestMs = Math.max(csLatestMs, ms);
          csNotes.push({ message: memberName, timestampMs: ms, url, author });
          return;
        }

        uploadCount += 1;
        if (isKaiser) nextKaiserDocs += 1;
        else if (isHn) nextHnDocs += 1;
        docsLatestMs = Math.max(docsLatestMs, ms);
        const label = docType || 'Document';
        docNotes.push({ message: `${memberName} — ${label}`, timestampMs: ms, url, author });

        const key = `standalone-${String(u?.id || '')}`;
        const current = docsByApp.get(key) || {
          appId: key,
          url,
          memberName,
          uploader: author,
          labels: new Set<string>(),
          count: 0,
          latestMs: 0,
        };
        current.count += 1;
        current.latestMs = Math.max(current.latestMs, ms);
        if (label) current.labels.add(label);
        docsByApp.set(key, current);
      });

      
      setNewCsSummaryCount(csSummaryCount);
      setNewUploadCount(uploadCount);
      setHnCsCount(nextHnCs);
      setHnDocCount(nextHnDocs);
      setKaiserCsCount(nextKaiserCs);
      setKaiserDocCount(nextKaiserDocs);

      // Review notifications (CS + documents) are only for recipients explicitly enabled in system settings.
      // - CS: can auto-expand (low volume).
      // - Docs: show in pill, but DO NOT auto-expand (high volume/noisy).
      const allowDocsDesktop = Boolean(reviewPopupPrefs.enabled && reviewPopupPrefs.recipientEnabled && reviewPopupPrefs.allowDocs);
      const allowCsDesktop = Boolean(reviewPopupPrefs.enabled && reviewPopupPrefs.recipientEnabled && reviewPopupPrefs.allowCs);

      // Web popups for document uploads are intentionally disabled (too noisy).
      const allowDocsPopup = false;
      const allowCsPopup = allowCsDesktop;

      // CS summary popups are low volume; fire immediately.
      const prev = reviewNotifyRef.current;
      const csIsNew =
        allowCsDesktop &&
        csSummaryCount > 0 &&
        (csSummaryCount > prev.cs.count || csLatestMs > prev.cs.latestMs);
      setCsIsNewFlag(csIsNew);
      reviewNotifyRef.current = {
        initialized: true,
        docs: prev.docs,
        cs: allowCsDesktop ? { count: csSummaryCount, latestMs: csLatestMs } : prev.cs,
      };

      // Always keep the Electron review pill summary updated (CS + Docs),
      // but only auto-expand on newly-arrived CS (docs never auto-expand).
      try {
        const isRealDesktop =
          typeof window !== 'undefined' &&
          Boolean((window as any).desktopNotifications) &&
          !Boolean((window as any).desktopNotifications?.__shim);
        if (isRealDesktop) {
          const csItems = allowCsDesktop
            ? csNotes
                .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
                .slice(0, 6)
                .map((n) => ({
                  title: 'CS Summary received',
                  message: n.message,
                  kind: 'cs',
                  isNew: Boolean(csIsNew),
                  memberName: '',
                  timestamp: n.timestampMs ? new Date(n.timestampMs).toLocaleString() : undefined,
                  actionUrl: n.url || '/admin/applications?review=cs',
                }))
            : [];
          const docItems = allowDocsDesktop
            ? docNotes
                .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
                .slice(0, 6)
                .map((d) => ({
                  title: 'Documents received',
                  message: d.message,
                  kind: 'docs',
                  memberName: '',
                  timestamp: d.timestampMs ? new Date(d.timestampMs).toLocaleString() : undefined,
                  actionUrl: d.url || '/admin/applications?review=docs',
                }))
            : [];
          const reviewCount = (allowCsDesktop ? csSummaryCount : 0) + (allowDocsDesktop ? uploadCount : 0);
          const notes = [...csItems, ...docItems];
          const shouldSend = reviewCount > 0 || desktopReviewInitializedRef.current;
          if (shouldSend) {
            window.desktopNotifications?.setReviewPillSummary?.({
              count: reviewCount,
              // Auto-expand only when CS is newly received.
              openPanel: Boolean(csIsNew),
              notes,
            });
            desktopReviewInitializedRef.current = true;
          }
        }
      } catch {
        // ignore
      }

      if (csIsNew && allowCsPopup) {
        const actionUrl = '/admin/applications?review=cs';
        const items = csNotes
          .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
          .slice(0, 6);
        const primaryUrl = items.length === 1 ? items[0].url : actionUrl;
        const fromLabel = items.length === 1 ? items[0].author : 'Multiple';
        showNotification({
          keyId: 'review-cs-summary',
          type: 'task',
          title: 'CS Summary received',
          message: `${csSummaryCount} CS Summary${csSummaryCount === 1 ? '' : 'ies'} to review`,
          author: fromLabel,
          recipientName: 'System',
          notes: items.map((n) => ({
            message: n.message,
            author: n.author,
            timestamp: n.timestampMs ? new Date(n.timestampMs).toLocaleString() : undefined,
          })),
          duration: 0,
          minimizeAfter: 12000,
          startMinimized: true,
          pendingLabel: `${csSummaryCount} CS Summary${csSummaryCount === 1 ? '' : 'ies'} to review`,
          sound: true,
          animation: 'slide',
          onClick: () => {
            if (typeof window === 'undefined') return;
            window.location.href = primaryUrl;
          }
        });
      }

      // Docs popups can be noisy; throttle and batch per application.
      if (allowDocsPopup) {
        const prevByApp = docsByAppRef.current;
        const newlyChanged: string[] = [];
        docsByApp.forEach((nextVal, key) => {
          const prevVal = prevByApp.get(key);
          const isNew = !prevVal || nextVal.count > prevVal.count || nextVal.latestMs > prevVal.latestMs;
          if (isNew) newlyChanged.push(key);
        });

        // Update per-app baseline.
        docsByAppRef.current = docsByApp;

        if (newlyChanged.length > 0) {
          const batch = docsBatchRef.current;
          newlyChanged.forEach((key) => {
            const nextVal = docsByApp.get(key);
            if (!nextVal) return;
            const existing = batch.pending.get(key);
            if (!existing) {
              batch.pending.set(key, {
                url: nextVal.url,
                memberName: nextVal.memberName,
                uploader: nextVal.uploader,
                labels: new Set(nextVal.labels),
                count: nextVal.count,
                latestMs: nextVal.latestMs,
              });
              return;
            }
            existing.count = Math.max(existing.count, nextVal.count);
            existing.latestMs = Math.max(existing.latestMs, nextVal.latestMs);
            nextVal.labels.forEach((l) => existing.labels.add(l));
            if (existing.uploader !== nextVal.uploader) existing.uploader = 'Multiple';
          });

          const sendDocsBatch = () => {
            const now = Date.now();
            const current = docsBatchRef.current;
            const items = Array.from(current.pending.values())
              .sort((a, b) => (b.latestMs || 0) - (a.latestMs || 0))
              .slice(0, 6);
            const totalUploads = Array.from(current.pending.values()).reduce((sum, v) => sum + (v.count || 0), 0);
            const appCount = current.pending.size;

            current.pending.clear();
            current.lastSentAt = now;
            if (current.timer) {
              clearTimeout(current.timer);
              current.timer = null;
            }

            const title = 'Documents received';
            const message =
              appCount <= 1
                ? `${totalUploads} upload${totalUploads === 1 ? '' : 's'} to acknowledge`
                : `${appCount} applications have new uploads • ${totalUploads} uploads to acknowledge`;

            const primaryUrl = appCount === 1 ? items[0]?.url : '/admin/applications?review=docs';
            const fromLabel = appCount === 1 ? (items[0]?.uploader || 'User') : 'Multiple';

            // Do NOT trigger the Electron review pill for non-CS document uploads.
            // Documents can be high volume/noisy; keep them as action items only.

            showNotification({
              keyId: 'review-docs-batch',
              type: 'success',
              title,
              message,
              author: fromLabel,
              recipientName: 'System',
              notes: items.map((it) => {
                const labels = Array.from(it.labels || []);
                const first = labels[0] || 'Documents';
                const extra = labels.length > 1 ? ` (+${labels.length - 1} more)` : '';
                return {
                  message: `${it.memberName} — ${first}${extra}`,
                  author: it.uploader,
                  timestamp: it.latestMs ? new Date(it.latestMs).toLocaleString() : undefined,
                };
              }),
              duration: 0,
              minimizeAfter: 12000,
              startMinimized: true,
              pendingLabel: message,
              sound: true,
              animation: 'slide',
              onClick: () => {
                if (typeof window === 'undefined') return;
                window.location.href = primaryUrl || '/admin/applications?review=docs';
              }
            });
          };

          const now = Date.now();
          const earliest = batch.lastSentAt > 0 ? batch.lastSentAt + DOC_UPLOAD_THROTTLE_MS : now;
          const delay = Math.max(0, earliest - now);
          if (delay === 0) {
            sendDocsBatch();
          } else if (!batch.timer) {
            batch.timer = setTimeout(sendDocsBatch, delay);
          }
        }
      }
    };

    unsubUserApps = onSnapshot(userAppsQuery, (snapshot) => {
      userApps = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        __ownerUid: docSnap.ref?.parent?.parent?.id || null,
        ...docSnap.data(),
      }));
      computeCount();
    });

    unsubAdminApps = onSnapshot(adminAppsQuery, (snapshot) => {
      adminApps = snapshot.docs.map((docSnap) => ({ id: docSnap.id, __ownerUid: null, ...docSnap.data() }));
      computeCount();
    });

    unsubStandaloneUploads = onSnapshot(standaloneUploadsQuery, (snapshot) => {
      standaloneUploads = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      computeCount();
    });

    return () => {
      isActive = false;
      unsubUserApps?.();
      unsubAdminApps?.();
      unsubStandaloneUploads?.();
    };
  }, [firestore, user?.uid, reviewPopupPrefs.enabled, reviewPopupPrefs.recipientEnabled, reviewPopupPrefs.allowDocs, reviewPopupPrefs.allowCs, showNotification]);

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    if (typeof window === 'undefined') return;
    const cacheKey = `purged-system-notifications-${user.uid}`;
    if (sessionStorage.getItem(cacheKey) === 'true') return;

    const purgeSystemNotifications = async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(firestore, 'staff_notifications'),
            where('userId', '==', user.uid),
            where('type', 'in', ['cs_summary', 'document_upload'])
          )
        );

        if (snapshot.empty) {
          sessionStorage.setItem(cacheKey, 'true');
          return;
        }

        const batch = writeBatch(firestore);
        snapshot.docs.forEach((docSnap) => {
          batch.delete(doc(firestore, 'staff_notifications', docSnap.id));
        });
        await batch.commit();
        sessionStorage.setItem(cacheKey, 'true');
      } catch (error) {
        console.warn('Failed to purge system notifications:', error);
      }
    };

    purgeSystemNotifications();
  }, [firestore, user?.uid]);

  const renderCsSummaryBadge = () => {
    if (newCsSummaryCount <= 0) return null;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
        title="CS Summary forms need review"
      >
        <BellRing className="h-3 w-3" />
        {newCsSummaryCount}
      </span>
    );
  };

  const renderUploadBadge = () => {
    if (newUploadCount <= 0) return null;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
        title="New uploaded documents need acknowledgement"
      >
        <Bell className="h-3 w-3" />
        {newUploadCount}
      </span>
    );
  };

  const renderPlanBadges = () => {
    const items = [
      {
        key: 'hn-doc',
        label: 'HN(D)',
        count: hnDocCount,
        dot: 'bg-green-600',
        href: '/admin/applications?plan=health-net&review=docs',
      },
      {
        key: 'hn-cs',
        label: 'HN(CS)',
        count: hnCsCount,
        dot: 'bg-green-600',
        href: '/admin/applications?plan=health-net&review=cs',
      },
      {
        key: 'k-doc',
        label: 'K(D)',
        count: kaiserDocCount,
        dot: 'bg-blue-600',
        href: '/admin/applications?plan=kaiser&review=docs',
      },
      {
        key: 'k-cs',
        label: 'K(CS)',
        count: kaiserCsCount,
        dot: 'bg-blue-600',
        href: '/admin/applications?plan=kaiser&review=cs',
      },
      {
        key: 'eligibility',
        label: 'E',
        count: eligibilityPendingCount,
        dot: 'bg-amber-600',
        href: '/admin/eligibility-checks',
      },
    ];

    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 hover:bg-accent",
              item.count > 0 ? "" : "opacity-60"
            )}
            title={item.count > 0 ? "View matching applications" : "No matching applications right now"}
          >
            <span className={`h-2 w-2 rounded-full ${item.dot}`} />
            <span className="font-semibold text-foreground">{item.label}</span>
            <span className="text-muted-foreground">{item.count}</span>
          </Link>
        ))}
      </div>
    );
  };

  const renderPillAlignedBadges = () => {
    const allowReviewForMe = Boolean(reviewPopupPrefs.enabled && reviewPopupPrefs.recipientEnabled);
    const showCs = allowReviewForMe && Boolean(reviewPopupPrefs.allowCs) && newCsSummaryCount > 0;
    const showDocs = allowReviewForMe && Boolean(reviewPopupPrefs.allowDocs) && newUploadCount > 0;
    const csLabel = showCs
      ? (newCsSummaryCount === 1 && csIsNewFlag ? 'CS(!)' : `CS(${newCsSummaryCount})`)
      : null;
    const dLabel = showDocs ? `D(${newUploadCount})` : null;
    const notesLabel = priorityNotesCount > 0 ? `Notes(${priorityNotesCount})` : null;

    const items: Array<{ key: string; label: string; href: string; dot: string }> = [];
    if (csLabel) items.push({ key: 'cs', label: csLabel, href: '/admin/applications?review=cs', dot: 'bg-orange-500' });
    if (dLabel) items.push({ key: 'docs', label: dLabel, href: '/admin/applications?review=docs', dot: 'bg-green-600' });
    if (notesLabel) items.push({ key: 'notes', label: notesLabel, href: '/admin/my-notes', dot: 'bg-blue-600' });

    if (items.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 hover:bg-accent"
            title="Open related action items"
          >
            <span className={`h-2 w-2 rounded-full ${item.dot}`} />
            <span className="font-semibold text-foreground">{item.label}</span>
          </Link>
        ))}
      </div>
    );
  };

  const isHrefActive = (href?: string | null) => {
    const h = String(href || '').trim();
    if (!h) return false;
    // Special-case: '/admin' should only be active on the dashboard root,
    // not for every admin route.
    if (h === '/admin') return pathname === '/admin';
    return pathname === h || pathname.startsWith(`${h}/`);
  };

  const isSubmenuActive = (navItem: any) => {
    const items = Array.isArray(navItem?.submenuItems) ? navItem.submenuItems : [];
    return items.some((it: any) => !it?.isDivider && isHrefActive(it?.href));
  };

  // Filter navigation based on user role
  let combinedNavLinks = adminNavLinks;
  
  if (isSocialWorker) {
    // Social workers only see the SW tab
    combinedNavLinks = adminNavLinks.filter(nav => nav.label === 'SW');
  } else if (isSuperAdmin) {
    // Super admins see everything
    combinedNavLinks = [...adminNavLinks, ...superAdminNavLinks];
  } else {
    // Regular admins see admin nav links, hide SW tab for all regular admins
    combinedNavLinks = adminNavLinks.filter(nav => nav.label !== 'SW');
  }

  return (
    <div className="bg-card border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between min-h-16 gap-3 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/admin" className="shrink-0">
            <Image
              src="/calaimlogopdf.png"
              alt="Connect CalAIM Logo"
              width={240}
              height={67}
              className="w-32 sm:w-40 md:w-48 h-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList className="flex gap-1">
              {combinedNavLinks.map((navItem) => (
                <NavigationMenuItem key={navItem.label}>
                  {navItem.isSubmenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className={cn(
                            navigationMenuTriggerStyle(),
                            "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary focus:text-primary focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50",
                            isSubmenuActive(navItem) && "bg-accent text-accent-foreground"
                          )}
                        >
                          <navItem.icon className="h-4 w-4" />
                          {navItem.label}
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64 z-40">
                        {navItem.submenuItems?.map((item, index) => (
                          item.isDivider ? (
                            <div key={index}>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                                {item.label}
                              </DropdownMenuLabel>
                            </div>
                          ) : (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                                  isHrefActive(item.href) && "bg-accent text-accent-foreground font-medium"
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                                {navItem.label === 'Dashboard' && item.href === '/admin' && (
                                  <span className="ml-auto flex items-center gap-2" />
                                )}
                              </Link>
                            </DropdownMenuItem>
                          )
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <NavigationMenuLink asChild>
                      <Link
                        href={navItem.href || '#'}
                        className={cn(
                          navigationMenuTriggerStyle(),
                          "flex items-center gap-2",
                          pathname === navItem.href && "bg-accent text-accent-foreground"
                        )}
                      >
                        <navItem.icon className="h-4 w-4" />
                        {navItem.label}
                      </Link>
                    </NavigationMenuLink>
                  )}
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-3 relative z-50">
          {/* Staff Notification Bell removed in favor of quick icons */}
          
          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                <span className="hidden sm:inline-block text-sm">
                  {user?.displayName || user?.email || 'Admin'}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-45">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.displayName || 'Admin User'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/admin/profile')}>
                <UserIcon className="h-4 w-4 mr-2" />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>
                  Access all admin features and tools
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {combinedNavLinks.map((navItem) => (
                  <div key={navItem.label}>
                    {navItem.isSubmenu ? (
                      <div>
                        <Button
                          variant="ghost"
                          onClick={() => toggleSubmenu(navItem.label)}
                          onMouseEnter={() => handleMouseEnter(navItem.label)}
                          onMouseLeave={handleMouseLeave}
                          className="w-full justify-between text-left font-medium"
                        >
                          <div className="flex items-center gap-3">
                            <navItem.icon className="h-4 w-4" />
                            {navItem.label}
                          </div>
                          <ChevronRight 
                            className={cn(
                              "h-4 w-4 transition-transform",
                              openSubmenus.has(navItem.label) && "rotate-90"
                            )}
                          />
                        </Button>
                        {openSubmenus.has(navItem.label) && (
                          <div className="ml-6 mt-2 space-y-2">
                            {navItem.submenuItems?.map((item, index) => (
                              item.isDivider ? (
                                <div key={index} className="py-2">
                                  <div className="border-t border-border" />
                                  <p className="mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {item.label}
                                  </p>
                                </div>
                              ) : (
                                <SheetClose asChild key={item.href}>
                                  <Link
                                    href={item.href}
                                    className={cn(
                                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                                      isHrefActive(item.href) && "bg-accent text-accent-foreground font-medium"
                                    )}
                                  >
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                    {navItem.label === 'Dashboard' && item.href === '/admin' && (
                                      <span className="ml-auto flex items-center gap-2" />
                                    )}
                                  </Link>
                                </SheetClose>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <SheetClose asChild>
                        <Link
                          href={navItem.href || '#'}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            pathname === navItem.href && "bg-accent text-accent-foreground"
                          )}
                        >
                          <navItem.icon className="h-4 w-4" />
                          {navItem.label}
                        </Link>
                      </SheetClose>
                    )}
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Action items:
            </span>
            <div className="flex items-center gap-2">
              {renderPillAlignedBadges()}
              <Link href="/admin/tasks?range=daily">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 text-red-600 hover:text-red-700"
                  title="Daily Tasks Due"
                >
                  <CalendarCheck className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          {renderPlanBadges()}
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAdmin } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const claimsSyncRef = useRef(false);
  const adminBootstrapRef = useRef<string>('');
  const adminBootstrapStartedAtRef = useRef<number>(0);
  const adminRedirectGraceRef = useRef<{ uid: string; startedAt: number }>({ uid: '', startedAt: 0 });
  const [adminBootstrap, setAdminBootstrap] = useState<{ inProgress: boolean; failed: boolean }>({
    inProgress: false,
    failed: false,
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; open: boolean }>({
    x: 0,
    y: 0,
    open: false
  });

  const appVersion = appPackage?.version || 'unknown';
  const buildTimeRaw = process.env.NEXT_PUBLIC_BUILD_TIME;
  const buildTimeLabel = buildTimeRaw && !Number.isNaN(Date.parse(buildTimeRaw))
    ? new Date(buildTimeRaw).toLocaleString()
    : 'Unknown';

  // Allow access to login page without authentication
  const isLoginPage = pathname === '/admin/login';
  const isDesktopNotificationWindow = pathname === '/admin/desktop-notification-window';
  const isDesktopChatWindow = pathname === '/admin/desktop-chat-window';

  // Debug logging for admin layout
  useEffect(() => {
    console.log('🔍 Admin Layout Debug:', {
      pathname,
      isLoginPage,
      isLoading,
      isAdmin,
      userEmail: user?.email,
      timestamp: new Date().toLocaleTimeString()
    });
  }, [pathname, isLoginPage, isLoading, isAdmin, user?.email]);

  // Redirect grace: right after login/navigation, allow a brief window for persistence + claims
  // to settle before we redirect back to /admin/login.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLoading) return;
    if (isLoginPage) return;
    const uid = String(user?.uid || '').trim();
    if (!uid) {
      adminRedirectGraceRef.current = { uid: '', startedAt: 0 };
      return;
    }
    if (adminRedirectGraceRef.current.uid !== uid) {
      adminRedirectGraceRef.current = { uid, startedAt: Date.now() };
    }
  }, [isLoading, isLoginPage, user?.uid]);

  useEffect(() => {
    if (!user || !isAdmin || isLoginPage) return;
    if (claimsSyncRef.current) return;
    claimsSyncRef.current = true;

    const syncAdminClaims = async () => {
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
        console.warn('Failed to sync admin claims:', error);
      }
    };

    syncAdminClaims();
  }, [user, isAdmin, isLoginPage]);

  // Bootstrap admin claims after login to avoid redirect loops.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLoading) return;
    if (!user) return;
    if (isLoginPage) return;

    const allowNonAdmin =
      pathname?.startsWith('/admin/my-notes') ||
      pathname === '/admin/desktop-notification-window' ||
      pathname === '/admin/desktop-chat-window';

    // If the page requires admin and we don't have admin yet, attempt to sync claims once.
    if (isAdmin || allowNonAdmin) return;
    const uid = String(user.uid || '').trim();
    if (!uid) return;
    if (adminBootstrapRef.current === uid) return;
    adminBootstrapRef.current = uid;
    adminBootstrapStartedAtRef.current = Date.now();

    setAdminBootstrap({ inProgress: true, failed: false });
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/admin-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (!res.ok) {
          setAdminBootstrap({ inProgress: false, failed: true });
          return;
        }
        await user.getIdToken(true);
        // Keep the gate up briefly to avoid redirect loops while hooks observe updated claims.
        setTimeout(() => {
          setAdminBootstrap((prev) => (prev.inProgress ? { inProgress: false, failed: false } : prev));
        }, 5000);
      } catch {
        setAdminBootstrap({ inProgress: false, failed: true });
      }
    })();
  }, [isAdmin, isLoading, isLoginPage, pathname, user]);

  useEffect(() => {
    if (!adminBootstrap.inProgress) return;
    if (!isAdmin) return;
    setAdminBootstrap({ inProgress: false, failed: false });
  }, [adminBootstrap.inProgress, isAdmin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, open: true });
    };
    const handleClose = () => setContextMenu((prev) => ({ ...prev, open: false }));
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
      const intendedPath = `${pathname}${currentSearch}`;
      const redirectParam = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('redirect')
        : null;
      const safeRedirect =
        redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('/admin/login')
          ? redirectParam
          : '/admin';

      const allowNonAdmin =
        pathname?.startsWith('/admin/my-notes') ||
        pathname === '/admin/desktop-notification-window' ||
        pathname === '/admin/desktop-chat-window';

      const bootstrapUid = String(adminBootstrapRef.current || '');
      const bootstrapAgeMs = adminBootstrapStartedAtRef.current ? Date.now() - adminBootstrapStartedAtRef.current : 0;
      const bootstrapGraceActive =
        Boolean(user?.uid) && bootstrapUid === String(user.uid) && bootstrapAgeMs > 0 && bootstrapAgeMs < 9000;

      const redirectGraceAgeMs = adminRedirectGraceRef.current.startedAt ? Date.now() - adminRedirectGraceRef.current.startedAt : 0;
      const redirectGraceActive =
        Boolean(user?.uid) &&
        adminRedirectGraceRef.current.uid === String(user.uid) &&
        redirectGraceAgeMs >= 0 &&
        redirectGraceAgeMs < 12000;

      console.log('🔍 Admin Layout Auth Check:', {
        isAdmin,
        isLoginPage,
        userEmail: user?.email,
        willRedirect:
          !user ||
          (!isAdmin && !isLoginPage && !allowNonAdmin && !adminBootstrap.inProgress && !bootstrapGraceActive && !redirectGraceActive)
      });

      if (!user && !isLoginPage) {
        console.log('🚫 Redirecting to login - user not signed in');
        router.replace(`/admin/login?redirect=${encodeURIComponent(intendedPath)}`);
      } else if (!isAdmin && !isLoginPage && !allowNonAdmin) {
        // Important: bootstrap state updates don't apply until the next render.
        // Use a short grace period keyed to the current UID to avoid immediate redirect loops right after login.
        if (adminBootstrap.inProgress || bootstrapGraceActive || redirectGraceActive) return;
        console.log('🚫 Redirecting to login - user not recognized as admin');
        router.replace(`/admin/login?redirect=${encodeURIComponent(intendedPath)}`);
      } else if (isAdmin && isLoginPage) {
        console.log('✅ Admin detected on login page - redirecting to dashboard');
        router.replace(safeRedirect);
      }
    }
  }, [isLoading, isAdmin, isLoginPage, router, user, pathname, adminBootstrap.inProgress]);

  // Show loading spinner while checking authentication (but not for login page)
  if (isLoading && !isLoginPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (adminBootstrap.inProgress && !isLoginPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // If this is the login page, render it without the admin layout
  if (isLoginPage) {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  // Desktop windows should be a minimal shell (no header/sidebar/context menu).
  if (isDesktopNotificationWindow) {
    return <div className="min-h-screen bg-transparent">{children}</div>;
  }
  if (isDesktopChatWindow) {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }
  
  // If loading is done and user is an admin, show the full admin layout.
  return (
    <>
      <SocialWorkerRedirect />
      <DesktopNotificationsDevShim />
      <WebNotificationsDevTester />
      <RealTimeNotifications />
      <CaspioUsageAlert />
      <DesktopPresenceBeacon />
      <div className="flex flex-col min-h-screen">
        <AdminHeader />
        <main className="flex-grow min-w-0 p-4 sm:p-6 md:p-8 bg-slate-50/50 overflow-x-hidden">
          {children}
        </main>
      </div>
      {contextMenu.open && (
        <div
          className="fixed z-[999] min-w-[240px] rounded-md border bg-white shadow-lg text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-2 font-medium">About Connect CalAIM</div>
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            Version: {appVersion}
            <br />
            Last update: {buildTimeLabel}
          </div>
          <div className="border-t" />
          <button
            className="w-full px-3 py-2 text-left hover:bg-muted"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            Check for updates
          </button>
        </div>
      )}
    </>
  );
}