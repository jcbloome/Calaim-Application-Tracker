'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, MessageSquare, Search, Calendar, User, RefreshCw, CheckCircle2, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { useDesktopPresenceMap } from '@/hooks/use-desktop-presence';
import { addDoc, collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, documentId, deleteDoc } from 'firebase/firestore';
import { logSystemNoteAction } from '@/lib/system-note-log';
import { isPriorityOrUrgent, normalizePriorityLabel, notifyNotificationSettingsChanged, WEB_NOTIFICATIONS_MOTHBALLED } from '@/lib/notification-utils';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface StaffNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  source?: string;
  threadId?: string;
  replyToId?: string;
  hiddenFromInbox?: boolean;
  isChatOnly?: boolean;
  memberName?: string;
  memberId?: string;
  healthPlan?: string;
  priority: 'General' | 'Priority' | 'Urgent' | string;
  isRead: boolean;
  createdAt: any;
  desktopDeliveredAt?: any;
  authorName: string;
  recipientName?: string;
  recipientId: string;
  senderId?: string;
  applicationId?: string;
  actionUrl?: string;
  status?: 'Open' | 'Closed';
  isGeneral?: boolean;
  followUpRequired?: boolean;
  followUpDate?: string;
  followUpStatus?: string;
  resolvedAt?: any;
  isDeleted?: boolean;
  deleted?: boolean;
  deletedAt?: any;
}

function MyNotesContent() {
  // Use the smart installer endpoint that redirects to the latest GitHub asset.
  const installerDownloadUrl = '/installapp';
  const macInstallerDownloadUrl = '/installapp?platform=mac';
  const [installerMeta, setInstallerMeta] = useState<{
    version: string | null;
    sha256: string | null;
    macReleaseUrl: string | null;
  }>({ version: null, sha256: null, macReleaseUrl: null });
  const hasMacInstaller = Boolean(installerMeta.macReleaseUrl);
  const { user, isAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [isSendingReply, setIsSendingReply] = useState<Record<string, boolean>>({});
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const staffUids = useMemo(() => {
    const all = [
      ...staffList.map((s) => s.uid).filter(Boolean),
      String(user?.uid || '').trim(),
    ].filter(Boolean);
    return Array.from(new Set(all));
  }, [staffList, user?.uid]);
  const { isActiveByUid: isElectronActiveByUid } = useDesktopPresenceMap(staffUids);
  const [generalNote, setGeneralNote] = useState<{
    recipientIds: string[];
    title: string;
    message: string;
    priority: 'General' | 'Priority';
    followUpRequired: boolean;
    followUpDate: string;
  }>({
    recipientIds: [],
    title: '',
    message: '',
    priority: 'General',
    followUpRequired: false,
    followUpDate: ''
  });
  const [isSendingGeneral, setIsSendingGeneral] = useState(false);

  const [showAllNotes, setShowAllNotes] = useState(false);
  const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);
  const [quickStatusFilter, setQuickStatusFilter] = useState<'all' | 'unread' | 'open' | 'closed'>('all');
  const [noteTypeFilter, setNoteTypeFilter] = useState<'all' | 'general' | 'priority'>('all');
  const [followUpFilter, setFollowUpFilter] = useState<'all' | 'required'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'sender' | 'priority'>('newest');
  const [originFilter, setOriginFilter] = useState<'all' | 'caspio' | 'interoffice'>('all');
  const [senderFilter, setSenderFilter] = useState<string>('all');
  const [desktopActive, setDesktopActive] = useState(false);
  const [desktopState, setDesktopState] = useState<DesktopNotificationState | null>(null);
  const [suppressWebWhenDesktopActive, setSuppressWebWhenDesktopActive] = useState(false);
  const [webAppNotificationsEnabled, setWebAppNotificationsEnabled] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<StaffNotification | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/admin/desktop-installer/meta')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!isMounted || !data) return;
        setInstallerMeta({
          version: data.version || null,
          sha256: data.sha256 || null,
          macReleaseUrl: data.macReleaseUrl || null,
        });
      })
      .catch(() => null);
    return () => {
      isMounted = false;
    };
  }, []);

  // Load notifications from Firestore
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoadingNotes(false);
      return;
    }

    setIsLoadingNotes(true);
    
    try {
      // Query notifications sent TO the current user
      const notificationsQuery = query(
        collection(firestore, 'staff_notifications'),
        where('userId', '==', user.uid)
      );

      const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const userNotifications: StaffNotification[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          userNotifications.push({
            id: doc.id,
            type: data.type || 'notification',
            title: data.title || 'Notification',
            content: data.message || data.content || '',
            source: data.source || undefined,
            threadId: data.threadId || undefined,
            replyToId: data.replyToId || undefined,
            memberName: data.memberName || undefined,
            memberId: data.clientId2 || data.memberId || undefined,
            healthPlan: data.healthPlan || undefined,
            priority: data.priority || 'General',
            isRead: Boolean(data.isRead),
            createdAt: data.timestamp || data.createdAt,
            desktopDeliveredAt: data.desktopDeliveredAt || undefined,
            authorName: data.createdByName || data.senderName || 'System',
            recipientName: data.recipientName || data.recipient || data.recipientDisplayName || undefined,
            recipientId: data.userId || user.uid,
            senderId: data.createdBy || data.senderId,
            applicationId: data.applicationId || undefined,
            actionUrl: data.actionUrl || undefined,
            status: data.status === 'Closed' ? 'Closed' : 'Open',
            isGeneral: Boolean(data.isGeneral),
            followUpRequired: Boolean(data.followUpRequired),
            followUpDate: data.followUpDate?.toDate?.()?.toISOString?.() || data.followUpDate || '',
            followUpStatus: data.followUpStatus || undefined,
            resolvedAt: data.resolvedAt || undefined,
            isDeleted: Boolean(data.isDeleted),
            deleted: Boolean(data.deleted),
            deletedAt: data.deletedAt || undefined,
            hiddenFromInbox: Boolean(data.hiddenFromInbox),
            isChatOnly: Boolean(data.isChatOnly),
          });
        });

        userNotifications.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setNotifications(userNotifications);
        setIsLoadingNotes(false);
        
        console.log(`📋 Loaded ${userNotifications.length} notifications for user`);
      }, (error) => {
        console.warn('⚠️ Error loading notifications:', error instanceof Error ? error.message : String(error));
        setIsLoadingNotes(false);
        toast({
          title: "Error",
          description: "Failed to load notifications. Please refresh the page.",
          variant: "destructive"
        });
      });

      return () => unsubscribe();
    } catch (error) {
      console.warn('⚠️ Error setting up notifications listener:', error instanceof Error ? error.message : String(error));
      setIsLoadingNotes(false);
      toast({
        title: "Error", 
        description: "Failed to load notifications. Please refresh the page.",
        variant: "destructive"
      });
    }
  }, [firestore, user?.uid, toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readSettings = () => {
      try {
        const raw = localStorage.getItem('notificationSettings');
        if (!raw) return;
        const parsed = JSON.parse(raw) as any;
        const nextValue = parsed?.userControls?.suppressWebWhenDesktopActive;
        const nextWebEnabled = parsed?.userControls?.webAppNotificationsEnabled;
        setSuppressWebWhenDesktopActive(nextValue === undefined ? true : Boolean(nextValue));
        setWebAppNotificationsEnabled(nextWebEnabled === undefined ? true : Boolean(nextWebEnabled));
      } catch {
        setSuppressWebWhenDesktopActive(true);
        setWebAppNotificationsEnabled(true);
      }
    };
    readSettings();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'notificationSettings') {
        readSettings();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isRealDesktop = Boolean(window.desktopNotifications && !window.desktopNotifications.__shim);
    if (!isRealDesktop) {
      setDesktopActive(false);
      return;
    }
    setDesktopActive(true);
    let unsubscribe: (() => void) | undefined;
    window.desktopNotifications.getState()
      .then((state) => {
        setDesktopActive(true);
        setDesktopState(state);
      })
      .catch(() => setDesktopActive(true));
    unsubscribe = window.desktopNotifications.onChange((state) => {
      setDesktopActive(true);
      setDesktopState(state);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const updateSuppressSetting = (nextValue: boolean) => {
    setSuppressWebWhenDesktopActive(nextValue);
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('notificationSettings');
      const parsed = raw ? JSON.parse(raw) as any : {};
      const updated = {
        ...parsed,
        userControls: {
          ...(parsed?.userControls || {}),
          suppressWebWhenDesktopActive: nextValue
        }
      };
      localStorage.setItem('notificationSettings', JSON.stringify(updated));
      notifyNotificationSettingsChanged();
    } catch (error) {
      console.warn('Failed to update notification settings:', error);
    }
  };

  const updateWebAppSetting = (nextValue: boolean) => {
    setWebAppNotificationsEnabled(nextValue);
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('notificationSettings');
      const parsed = raw ? JSON.parse(raw) as any : {};
      const updated = {
        ...parsed,
        userControls: {
          ...(parsed?.userControls || {}),
          webAppNotificationsEnabled: nextValue
        }
      };
      localStorage.setItem('notificationSettings', JSON.stringify(updated));
      notifyNotificationSettingsChanged();
    } catch (error) {
      console.warn('Failed to update notification settings:', error);
    }
  };

  const updateAfterHoursSetting = async (nextValue: boolean) => {
    if (typeof window === 'undefined') return;
    if (!window.desktopNotifications?.setAllowAfterHours) {
      toast({
        title: 'Desktop app update needed',
        description: 'Please update/restart Electron to use after-hours activation.',
        variant: 'destructive'
      });
      return;
    }
    try {
      const nextState = await window.desktopNotifications.setAllowAfterHours(nextValue);
      setDesktopState(nextState);
      toast({
        title: nextValue ? 'After-hours alerts enabled' : 'After-hours alerts disabled',
        description: nextValue
          ? 'Electron will stay active outside business hours.'
          : 'Electron will be silent outside business hours unless re-enabled.'
      });
    } catch {
      toast({
        title: 'Could not update Electron setting',
        description: 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('notificationSettings');
      const parsed = raw ? JSON.parse(raw) as any : {};
      if (parsed?.userControls?.webAppNotificationsEnabled !== undefined) return;
      const defaultValue = !(desktopActive || suppressWebWhenDesktopActive);
      localStorage.setItem('notificationSettings', JSON.stringify({
        ...parsed,
        userControls: {
          ...(parsed?.userControls || {}),
          webAppNotificationsEnabled: defaultValue
        }
      }));
      notifyNotificationSettingsChanged();
      setWebAppNotificationsEnabled(defaultValue);
    } catch (error) {
      console.warn('Failed to default web app setting:', error);
    }
  }, [desktopActive, suppressWebWhenDesktopActive]);

  useEffect(() => {
    const replyTo = searchParams.get('replyTo');
    if (!replyTo || notifications.length === 0) return;
    const target = notifications.find((note) => note.id === replyTo);
    if (!target) return;
    setReplyOpen((prev) => ({ ...prev, [replyTo]: true }));
  }, [searchParams, notifications]);

  useEffect(() => {
    const noteId = searchParams.get('noteId');
    if (!noteId) return;
    setHighlightNoteId(noteId);
    setShowAllNotes(true);
    const element = document.getElementById(`note-${noteId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchParams]);

  useEffect(() => {
    const compose = searchParams.get('compose');
    if (compose !== '1') return;
    if (typeof window === 'undefined') return;
    const element = document.getElementById('compose-note');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams]);

  useEffect(() => {
    const loadAdminStaff = async () => {
      if (!firestore) return;
      try {
        setIsLoadingStaff(true);
        const [adminSnap, superAdminSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')),
          getDocs(collection(firestore, 'roles_super_admin'))
        ]);
        const adminIds = adminSnap.docs.map((docItem) => docItem.id);
        const superAdminIds = superAdminSnap.docs.map((docItem) => docItem.id);
        const allIds = Array.from(new Set([...adminIds, ...superAdminIds]));
        if (allIds.length === 0) {
          setStaffList([]);
          return;
        }

        const chunks: string[][] = [];
        for (let i = 0; i < allIds.length; i += 10) {
          chunks.push(allIds.slice(i, i + 10));
        }

        const users: Array<{ uid: string; name: string }> = [];
        for (const chunk of chunks) {
          const usersSnap = await getDocs(
            query(collection(firestore, 'users'), where(documentId(), 'in', chunk))
          );
          usersSnap.forEach((docItem) => {
            const data = docItem.data() as any;
            users.push({
              uid: docItem.id,
              name: data.firstName && data.lastName
                ? `${data.firstName} ${data.lastName}`
                : data.email || 'Unknown Staff'
            });
          });
        }

        users.sort((a, b) => a.name.localeCompare(b.name));
        setStaffList(users);
      } catch (error) {
        console.error('Failed to load admin staff:', error);
        setStaffList([]);
      } finally {
        setIsLoadingStaff(false);
      }
    };

    loadAdminStaff();
  }, [firestore]);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    if (!firestore) return;
    
    try {
      await updateDoc(doc(firestore, 'staff_notifications', notificationId), { isRead: true });
      toast({
        title: "Success",
        description: "Notification marked as read",
      });
    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  const toggleStatus = async (notification: StaffNotification) => {
    if (!firestore) return;
    const nextStatus = notification.status === 'Closed' ? 'Open' : 'Closed';
    try {
      await updateDoc(doc(firestore, 'staff_notifications', notification.id), {
        status: nextStatus,
        resolvedAt: nextStatus === 'Closed' ? serverTimestamp() : null
      });
      await logSystemNoteAction({
        action: 'Staff notification status updated',
        noteId: notification.id,
        memberName: notification.memberName,
        status: nextStatus,
        actorName: user?.displayName || user?.email || 'Staff',
        actorEmail: user?.email || ''
      });
      toast({
        title: `Note ${nextStatus === 'Closed' ? 'Closed' : 'Reopened'}`,
        description: `Status set to ${nextStatus}.`
      });
    } catch (error) {
      console.error('❌ Failed to update status:', error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const toggleFollowUpRequired = async (notification: StaffNotification) => {
    if (!firestore) return;
    const isCurrentlyRequired = Boolean(notification.followUpRequired) || Boolean(notification.followUpDate);
    const nextRequired = !isCurrentlyRequired;
    try {
      await updateDoc(doc(firestore, 'staff_notifications', notification.id), {
        followUpRequired: nextRequired,
        followUpDate: nextRequired ? (notification.followUpDate || null) : null
      });
      toast({
        title: nextRequired ? 'Follow-up required' : 'Follow-up cleared',
        description: nextRequired
          ? 'This note will show in your follow-up list.'
          : 'This note was removed from follow-up.'
      });
    } catch (error) {
      console.error('❌ Failed to update follow-up status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update follow-up status.',
        variant: 'destructive'
      });
    }
  };

  const commitDeleteNotification = async (notification: StaffNotification) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'staff_notifications', notification.id));
      await logSystemNoteAction({
        action: 'Staff notification deleted',
        noteId: notification.id,
        memberName: notification.memberName,
        status: notification.status || 'Open',
        actorName: user?.displayName || user?.email || 'Staff',
        actorEmail: user?.email || ''
      });
    } catch (error) {
      console.error('❌ Failed to delete notification:', error);
      setNotifications(prev => [notification, ...prev]);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    }
  };

  const requestDeleteNotification = (notification: StaffNotification) => {
    setNotifications(prev => prev.filter(item => item.id !== notification.id));
    commitDeleteNotification(notification);
    toast({
      title: "Note Deleted",
      description: "The note was removed from your notifications."
    });
  };

  const handleReplySend = async (notification: StaffNotification) => {
    if (!firestore || !user?.uid) return;
    const threadId = notification.threadId || notification.id;
    const threadNotes = notifications
      .filter((note) => String(note.threadId || note.id) === String(threadId))
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return aTime.getTime() - bTime.getTime();
      });

    let replyTargetId = notification.senderId || notification.recipientId || user.uid;
    let replyTargetName = notification.authorName || user.displayName || user.email || 'Staff';
    for (let i = threadNotes.length - 1; i >= 0; i--) {
      const note = threadNotes[i];
      if (note.senderId && note.senderId !== user.uid) {
        replyTargetId = note.senderId;
        replyTargetName = note.authorName || replyTargetName;
        break;
      }
    }
    if (!replyTargetId) {
      toast({
        title: "Missing Sender",
        description: "This note does not have a sender to reply to.",
        variant: "destructive",
      });
      return;
    }
    const message = replyDrafts[notification.id]?.trim();
    if (!message) {
      toast({
        title: "Missing Reply",
        description: "Enter a reply message before sending.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingReply((prev) => ({ ...prev, [notification.id]: true }));
      const payload: Record<string, any> = {
        userId: replyTargetId,
        title: `Reply: ${notification.title}`,
        message,
        type: 'interoffice_reply',
        priority: 'General',
        status: 'Open',
        isRead: false,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Staff',
        senderName: user.displayName || user.email || 'Staff',
        senderId: user.uid,
        recipientName: replyTargetName,
        timestamp: serverTimestamp(),
        replyToId: notification.id,
        threadId,
        actionUrl: notification.actionUrl || (notification.applicationId ? `/admin/applications/${notification.applicationId}` : '/admin/my-notes')
      };
      if (notification.memberName) {
        payload.memberName = notification.memberName;
      }
      if (notification.memberId) {
        payload.clientId2 = notification.memberId;
      }
      if (notification.applicationId) {
        payload.applicationId = notification.applicationId;
      }

      // If this thread is tied to a Caspio client, also write the reply into Caspio client notes.
      if (notification.memberId) {
        try {
          await fetch('/api/client-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId2: notification.memberId,
              comments: message,
              followUpStatus: 'Open',
              userId: user.uid,
              actorName: user.displayName || user.email || 'Staff',
              actorEmail: user.email || '',
            }),
          });
        } catch (error) {
          console.warn('Failed to post reply to Caspio client notes:', error);
        }
      }
      const myName = user.displayName || user.email || 'Staff';
      const myCopy: Record<string, any> = {
        ...payload,
        userId: user.uid,
        recipientName: myName,
        isRead: true,
      };

      await Promise.all([
        addDoc(collection(firestore, 'staff_notifications'), payload),
        replyTargetId === user.uid ? Promise.resolve() : addDoc(collection(firestore, 'staff_notifications'), myCopy),
      ]);

      toast({
        title: "Reply Sent",
        description: "Your reply was sent and saved in your notifications.",
      });
      setReplyDrafts((prev) => ({ ...prev, [notification.id]: '' }));
      setReplyOpen((prev) => ({ ...prev, [notification.id]: false }));
    } catch (error) {
      console.error('❌ Failed to send reply:', error);
      toast({
        title: "Error",
        description: "Failed to send reply.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply((prev) => ({ ...prev, [notification.id]: false }));
    }
  };

  const handleSendGeneralNote = async () => {
    if (!firestore || !user?.uid) return;
    if (generalNote.recipientIds.length === 0 || !generalNote.message.trim()) {
      toast({
        title: "Missing Details",
        description: "Select a staff member and enter a message.",
        variant: "destructive",
      });
      return;
    }

    const recipients = staffList.filter((staff) => generalNote.recipientIds.includes(staff.uid));
    if (recipients.length === 0) {
      toast({
        title: "Recipient Not Found",
        description: "Selected staff member was not found.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingGeneral(true);
      await Promise.all(
        recipients.map((recipient) =>
          addDoc(collection(firestore, 'staff_notifications'), {
            userId: recipient.uid,
            title: generalNote.title?.trim() || (generalNote.priority === 'Priority' ? 'Priority Note' : 'General Note'),
            message: generalNote.message.trim(),
            type: 'interoffice_note',
            priority: generalNote.priority,
            status: 'Open',
            isRead: false,
            createdBy: user.uid,
            createdByName: user.displayName || user.email || 'Staff',
            senderName: user.displayName || user.email || 'Staff',
            recipientName: recipient.name,
            timestamp: serverTimestamp(),
            isGeneral: true,
            followUpRequired: generalNote.followUpRequired || Boolean(generalNote.followUpDate),
            followUpDate: generalNote.followUpDate || null,
            actionUrl: '/admin/my-notes'
          })
        )
      );

      toast({
        title: "Note Sent",
        description: `Sent to ${recipients.length} staff member${recipients.length === 1 ? '' : 's'}.`,
      });

      setGeneralNote({
        recipientIds: [],
        title: '',
        message: '',
        priority: 'General',
        followUpRequired: false,
        followUpDate: ''
      });
    } catch (error) {
      console.error('Failed to send general note:', error);
      toast({
        title: "Error",
        description: "Failed to send note.",
        variant: "destructive",
      });
    } finally {
      setIsSendingGeneral(false);
    }
  };

  // Refresh notifications
  const refresh = () => {
    setIsLoadingNotes(true);
    // The useEffect will handle reloading
  };

  const tagParam = searchParams.get('tags') || '';
  const activeTags = tagParam
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const chatMode = searchParams.get('chat') === '1';

  const isChatNotification = useCallback((notification: StaffNotification) => {
    if (Boolean(notification.isChatOnly)) return true;
    const originType = String(notification.type || '').toLowerCase();
    if (originType.includes('chat')) return true;
    return false;
  }, []);

  const viewNotifications = useMemo(() => {
    const base = notifications || [];
    if (chatMode) {
      return base.filter((n) => isChatNotification(n));
    }
    // Default: keep notifications "pure" (exclude chat-only threads and hidden inbox items).
    return base.filter((n) => !isChatNotification(n) && !Boolean(n.hiddenFromInbox));
  }, [chatMode, isChatNotification, notifications]);

  const isDesktopNotifiable = useCallback((notification: StaffNotification) => {
    const type = String(notification.type || '').toLowerCase();
    const interoffice = Boolean(notification.isGeneral) || type.includes('interoffice');
    const priority = normalizePriorityLabel(String(notification.priority || ''));
    return interoffice || priority === 'Priority' || priority === 'Urgent';
  }, []);

  const isClosedLike = useCallback((notification: StaffNotification) => {
    const status = String(notification.status || '').trim().toLowerCase();
    const followUpStatus = String(notification.followUpStatus || '').trim().toLowerCase();
    return (
      status === 'closed' ||
      status === 'resolved' ||
      status === 'done' ||
      status === 'archived' ||
      status === 'deleted' ||
      followUpStatus === 'closed' ||
      Boolean(notification.resolvedAt)
    );
  }, []);

  const syncElectronCount = useCallback(() => {
    if (typeof window === 'undefined' || !window.desktopNotifications) {
      toast({
        title: 'Electron not detected',
        description: 'Open the Electron desktop app to sync its pending note count.',
        variant: 'destructive'
      });
      return;
    }

    const pending = (notifications || [])
      .filter((n) => !Boolean(n.isChatOnly))
      .filter((n) => !String(n.type || '').toLowerCase().includes('chat'))
      .filter((n) => !Boolean(n.hiddenFromInbox))
      .filter((n) => !Boolean(n.isDeleted || n.deleted || n.deletedAt))
      .filter((n) => !isClosedLike(n))
      .filter((n) => !n.isRead)
      .filter((n) => isDesktopNotifiable(n));

    const sortedPending = [...pending].sort((a, b) => {
      const aMs = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt || 0).getTime() || 0;
      const bMs = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt || 0).getTime() || 0;
      return bMs - aMs;
    });

    const effectivePaused = Boolean(desktopState?.effectivePaused);
    const count = effectivePaused ? 0 : sortedPending.length;
    const notes = effectivePaused
      ? []
      : sortedPending.slice(0, 25).map((note) => ({
          kind: 'note' as const,
          source: note.source,
          clientId2: note.memberId,
          title: note.title || 'Interoffice note',
          message: note.content || '',
          author: note.authorName || undefined,
          recipientName: note.recipientName || undefined,
          memberName: note.memberName || undefined,
          timestamp: formatTimestamp(note.createdAt),
          noteId: note.id,
          senderId: note.senderId,
          replyUrl: note.id ? `/admin/my-notes?replyTo=${encodeURIComponent(note.id)}` : undefined,
          actionUrl: note.id ? `/admin/my-notes?noteId=${encodeURIComponent(note.id)}` : '/admin/my-notes',
          type: note.type,
          priority: note.priority,
        }));

    window.desktopNotifications.setPendingCount?.(count);
    window.desktopNotifications.setPillSummary?.({
      count,
      openPanel: false,
      notes,
      title: count === 1 ? 'Priority note' : 'Priority notes',
      message: count === 1 ? '1 priority note pending' : `${count} priority notes pending`,
      actionUrl: '/admin/my-notes',
    });

    toast({
      title: 'Electron count synced',
      description: count === 0 ? 'Desktop pending notes reset to 0.' : `Desktop pending notes set to ${count}.`,
    });
  }, [desktopState?.effectivePaused, isClosedLike, isDesktopNotifiable, notifications, toast]);

  const isInterofficeNotification = (notification: StaffNotification) => {
    const originType = String(notification.type || '').toLowerCase();
    return Boolean(notification.isGeneral) || originType.includes('interoffice');
  };

  const isCaspioClientRecordNote = (notification: StaffNotification) => {
    return String(notification.source || '').trim().toLowerCase() === 'caspio';
  };

  const getOriginLabel = (notification: StaffNotification) => {
    return isCaspioClientRecordNote(notification) ? 'Caspio Client Record' : 'Interoffice';
  };

  const availableSenders = useMemo(() => {
    const names = Array.from(
      new Set(
        viewNotifications
          .map((n) => String(n.authorName || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return names;
  }, [viewNotifications]);

  // Filter notifications based on search term
  const filteredNotifications = viewNotifications.filter(notification => {
    const normalizedPriority = normalizePriorityLabel(notification.priority);
    const isPriority = normalizedPriority === 'Priority' || normalizedPriority === 'Urgent';

    if (originFilter === 'caspio' && !isCaspioClientRecordNote(notification)) return false;
    if (originFilter === 'interoffice' && isCaspioClientRecordNote(notification)) return false;
    if (senderFilter !== 'all' && String(notification.authorName || '').trim() !== senderFilter) return false;
    if (noteTypeFilter === 'priority' && !isPriority) return false;
    if (noteTypeFilter === 'general' && isPriority) return false;

    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      notification.title?.toLowerCase().includes(searchLower) ||
      notification.content?.toLowerCase().includes(searchLower) ||
      notification.memberName?.toLowerCase().includes(searchLower) ||
      notification.authorName?.toLowerCase().includes(searchLower)
    );
  });

  const hasPriority = (notification: StaffNotification) => {
    return isPriorityOrUrgent(notification.priority);
  };

  const hasGeneral = (notification: StaffNotification) => {
    const originType = String(notification.type || '').toLowerCase();
    return Boolean(notification.isGeneral) || originType.includes('interoffice');
  };

  const hasFollowUpRequired = (notification: StaffNotification) => {
    return Boolean(notification.followUpRequired) || Boolean(notification.followUpDate);
  };

  const statusFilteredNotifications = filteredNotifications.filter((notification) => {
    if (quickStatusFilter === 'all') return true;
    if (quickStatusFilter === 'unread') return !notification.isRead;
    if (quickStatusFilter === 'open') return notification.status !== 'Closed';
    if (quickStatusFilter === 'closed') return notification.status === 'Closed';
    return true;
  });

  const followUpFilteredNotifications = followUpFilter === 'required'
    ? statusFilteredNotifications.filter((notification) => hasFollowUpRequired(notification))
    : statusFilteredNotifications;

  const tagFilteredNotifications = activeTags.length === 0
    ? followUpFilteredNotifications
    : followUpFilteredNotifications.filter((notification) => {
        const matchesPriority = activeTags.includes('priority') && hasPriority(notification);
        const matchesGeneral = activeTags.includes('general') && hasGeneral(notification);
        return matchesPriority || matchesGeneral;
      });

  const sortedNotifications = [...tagFilteredNotifications].sort((a, b) => {
    const aTime = a.createdAt?.toDate?.() || new Date(0);
    const bTime = b.createdAt?.toDate?.() || new Date(0);
    const aPriorityLabel = normalizePriorityLabel(a.priority);
    const bPriorityLabel = normalizePriorityLabel(b.priority);
    const aPriorityRank = aPriorityLabel === 'Priority' || aPriorityLabel === 'Urgent' ? 1 : 0;
    const bPriorityRank = bPriorityLabel === 'Priority' || bPriorityLabel === 'Urgent' ? 1 : 0;

    // Business rule: priority notes are always above general notes.
    if (aPriorityRank !== bPriorityRank) return bPriorityRank - aPriorityRank;

    if (sortBy === 'sender') {
      const aSender = (a.authorName || '').toLowerCase();
      const bSender = (b.authorName || '').toLowerCase();
      if (aSender !== bSender) return aSender.localeCompare(bSender);
      return bTime.getTime() - aTime.getTime();
    }
    if (sortBy === 'priority') {
      return bTime.getTime() - aTime.getTime();
    }
    return bTime.getTime() - aTime.getTime();
  });

  const threadHeadNotifications = useMemo(() => {
    const seen = new Set<string>();
    const heads: StaffNotification[] = [];
    for (const note of sortedNotifications) {
      const key = String(note.threadId || note.id);
      if (seen.has(key)) continue;
      seen.add(key);
      heads.push(note);
    }
    return heads;
  }, [sortedNotifications]);

  const recentNotifications = showAllNotes ? threadHeadNotifications : threadHeadNotifications.slice(0, 5);
  const activeElectronCount = staffList.filter((staff) => Boolean(isElectronActiveByUid[staff.uid])).length;
  const inactiveElectronCount = Math.max(0, staffList.length - activeElectronCount);
  const electronActiveForMyAccount = Boolean(user?.uid && isElectronActiveByUid[user.uid]);

  const threadMap = useMemo(() => {
    const map = new Map<string, StaffNotification[]>();
    for (const note of viewNotifications) {
      const key = String(note.threadId || note.id);
      const existing = map.get(key);
      if (existing) {
        existing.push(note);
      } else {
        map.set(key, [note]);
      }
    }
    for (const [, notes] of map.entries()) {
      notes.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return aTime.getTime() - bTime.getTime();
      });
    }
    return map;
  }, [viewNotifications]);

  const getMemberLink = (notification: StaffNotification) => {
    if (notification.applicationId) {
      return `/admin/applications/${notification.applicationId}`;
    }
    if (notification.memberId) {
      return `/admin/member-notes?clientId2=${encodeURIComponent(notification.memberId)}`;
    }
    if (notification.actionUrl && !notification.actionUrl.includes('/admin/my-notes')) {
      return notification.actionUrl;
    }
    return null;
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    const label = normalizePriorityLabel(priority);
    if (label === 'Urgent') return 'bg-red-100 text-red-800 border-red-200';
    if (label === 'Priority') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Format timestamp
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (!user && !isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Sign In Required</h3>
              <p className="text-muted-foreground">
                Please sign in to view your notifications.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {isAdmin && <PWAInstallPrompt />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Interoffice Notes</h1>
          <p className="text-muted-foreground">
            View and manage your personal notifications and member-related alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1 text-right">
            <Button asChild variant="outline" size="sm">
              <a href={installerDownloadUrl} target="_blank" rel="noreferrer">
                Download Windows Installer{installerMeta.version ? ` (${installerMeta.version})` : ''}
              </a>
            </Button>
            {hasMacInstaller ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={installerMeta.macReleaseUrl || macInstallerDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Mac Installer{installerMeta.version ? ` (${installerMeta.version})` : ''}
                </a>
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Mac installer not published yet for this release.
              </span>
            )}
            {installerMeta.sha256 && (
              <span className="text-[10px] text-muted-foreground">
                Windows SHA256: {installerMeta.sha256.slice(0, 10)}…
              </span>
            )}
          </div>
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={syncElectronCount} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Electron Count
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Caspio priority notes assigned to you will appear on this page. Notes created from this page using
        <span className="font-medium"> Send Staff Note </span>
        or
        <span className="font-medium"> Reply </span>
        stay in Interoffice Notes inside this app and are not written into the Caspio member record.
      </div>

      {WEB_NOTIFICATIONS_MOTHBALLED ? null : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Web Notifications</CardTitle>
            <CardDescription>
              Toggle on to suppress web alerts and the header bell.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {webAppNotificationsEnabled ? 'Web alerts are enabled' : 'Web alerts are suppressed'}
            </div>
            <Switch
              checked={!webAppNotificationsEnabled}
              onCheckedChange={(nextValue) => {
                updateWebAppSetting(!nextValue);
                if (nextValue) {
                  updateSuppressSetting(true);
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Recent Notes</CardTitle>
                  <CardDescription>Newest notifications assigned to you.</CardDescription>
                  {activeTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllNotes((prev) => !prev)}
                >
                  {showAllNotes ? 'Show Recent' : 'Open Full List'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notifications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={quickStatusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setQuickStatusFilter('all')}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={quickStatusFilter === 'unread' ? 'default' : 'outline'}
                  onClick={() => setQuickStatusFilter('unread')}
                >
                  Unread
                </Button>
                <Button
                  size="sm"
                  variant={quickStatusFilter === 'open' ? 'default' : 'outline'}
                  onClick={() => setQuickStatusFilter('open')}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant={quickStatusFilter === 'closed' ? 'default' : 'outline'}
                  onClick={() => setQuickStatusFilter('closed')}
                >
                  Closed
                </Button>
                <Button
                  size="sm"
                  variant={noteTypeFilter === 'general' ? 'default' : 'outline'}
                  onClick={() => setNoteTypeFilter((prev) => (prev === 'general' ? 'all' : 'general'))}
                >
                  General
                </Button>
                <Button
                  size="sm"
                  variant={noteTypeFilter === 'priority' ? 'default' : 'outline'}
                  onClick={() => setNoteTypeFilter((prev) => (prev === 'priority' ? 'all' : 'priority'))}
                >
                  Priority
                </Button>
                <Button
                  size="sm"
                  variant={followUpFilter === 'required' ? 'default' : 'outline'}
                  onClick={() => setFollowUpFilter((prev) => (prev === 'required' ? 'all' : 'required'))}
                >
                  Follow-up Required
                </Button>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Origin</Label>
                  <Select value={originFilter} onValueChange={(value) => setOriginFilter(value as 'all' | 'caspio' | 'interoffice')}>
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All origins</SelectItem>
                      <SelectItem value="caspio">Caspio Client Record</SelectItem>
                      <SelectItem value="interoffice">Interoffice Notes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Generated by</Label>
                  <Select value={senderFilter} onValueChange={setSenderFilter}>
                    <SelectTrigger className="h-8 w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All staff</SelectItem>
                      {availableSenders.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Sort</Label>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'newest' | 'sender' | 'priority')}>
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Most recent</SelectItem>
                      <SelectItem value="sender">Sender (A–Z)</SelectItem>
                      <SelectItem value="priority">Priority first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!isLoadingNotes && recentNotifications.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                  {searchTerm ? 'No notifications match your search.' : 'No notifications found.'}
                </div>
              )}
              {recentNotifications.map((notification) => {
                const memberLink = getMemberLink(notification);
                const isGeneralNote = hasGeneral(notification);
                const isPriorityNote = hasPriority(notification);
                const isChatNote =
                  Boolean(notification.isChatOnly)
                  || String(notification.type || '').toLowerCase().includes('chat');
                const priorityLabel = normalizePriorityLabel(notification.priority);
                const displayTitle = `Re: ${notification.memberName || 'General Note'}`;
                const threadKey = String(notification.threadId || notification.id);
                const threadNotes = threadMap.get(threadKey) || [notification];
                return (
                  <Card
                    key={notification.id}
                    id={`note-${notification.id}`}
                    className={`transition-colors hover:bg-accent/50 ${
                      !notification.isRead ? 'border-blue-200 bg-blue-50/30' : ''
                    } ${highlightNoteId === notification.id ? 'ring-2 ring-blue-200' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <h3 className={`font-medium ${!notification.isRead ? 'text-blue-900' : ''}`}>
                              {displayTitle}
                            </h3>
                            <Badge
                              variant="outline"
                              className={
                                isCaspioClientRecordNote(notification)
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }
                            >
                              {getOriginLabel(notification)}
                            </Badge>
                            {isPriorityNote && (
                              <Badge variant="outline" className={getPriorityColor(notification.priority)}>
                                {priorityLabel}
                              </Badge>
                            )}
                          {hasFollowUpRequired(notification) && (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              Follow-up
                            </Badge>
                          )}
                            {isGeneralNote && (
                              <Badge variant="secondary">
                                General
                              </Badge>
                            )}
                            {isChatNote && (
                              <Badge variant="secondary" className="bg-violet-100 text-violet-800 border border-violet-200">
                                Chat
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {notification.status || 'Open'}
                            </Badge>
                            <Badge variant="outline" className={
                              notification.isRead
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : notification.desktopDeliveredAt
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }>
                              {notification.isRead ? 'Read' : notification.desktopDeliveredAt ? 'Delivered' : 'Queued'}
                            </Badge>
                            {!notification.isRead && (
                              <Badge variant="default" className="bg-blue-600">
                                New
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="grid grid-cols-4 gap-x-3 uppercase tracking-wide text-[10px] text-muted-foreground/70">
                              <span>From</span>
                              <span>To</span>
                              <span>Re</span>
                              <span>Sent</span>
                            </div>
                            <div className="grid grid-cols-4 gap-x-3">
                              <span>{notification.authorName || '-'}</span>
                              <span>{notification.recipientName || '-'}</span>
                              <span>{notification.memberName || notification.title || 'General Note'}</span>
                              <span>{formatTimestamp(notification.createdAt)}</span>
                            </div>
                            {notification.followUpDate && (
                              <div>Follow-up: {formatTimestamp(notification.followUpDate)}</div>
                            )}
                          </div>
                          <p className="text-sm text-slate-900 line-clamp-2">
                            {notification.content}
                          </p>
                          {threadNotes.length > 1 && (
                            <details className="rounded-md border bg-muted/30 p-2">
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                Conversation ({threadNotes.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {threadNotes.map((note) => {
                                  const isMe = Boolean(user?.uid) && note.senderId === user?.uid;
                                  return (
                                    <div key={note.id} className={isMe ? 'flex justify-end' : 'flex justify-start'}>
                                      <div
                                        className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                                          isMe ? 'bg-blue-600 text-white' : 'bg-white border'
                                        }`}
                                      >
                                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
                                          <span>{isMe ? 'You' : note.authorName || 'Staff'}</span>
                                          <span>{formatTimestamp(note.createdAt)}</span>
                                        </div>
                                        <div>{note.content}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">
                            {notification.status === 'Closed' ? 'Closed' : 'Open'}
                          </span>
                          <Switch
                            checked={notification.status !== 'Closed'}
                            onCheckedChange={() => toggleStatus(notification)}
                          />
                          <Button
                            onClick={() => toggleFollowUpRequired(notification)}
                            variant="ghost"
                            size="sm"
                            className={hasFollowUpRequired(notification) ? 'text-yellow-700' : 'text-muted-foreground'}
                          >
                            {hasFollowUpRequired(notification) ? 'Follow-up set' : 'Mark follow-up'}
                          </Button>
                          {memberLink && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={async () => {
                                if (!notification.isRead) {
                                  await markAsRead(notification.id);
                                }
                                window.location.href = memberLink;
                              }}
                            >
                              View Member
                            </Button>
                          )}
                          <Button
                            onClick={() =>
                              setReplyOpen((prev) => ({
                                ...prev,
                                [notification.id]: !prev[notification.id]
                              }))
                            }
                            variant="outline"
                            size="sm"
                          >
                            Reply
                          </Button>
                          <AlertDialog open={deleteTarget?.id === notification.id} onOpenChange={(open) => {
                            if (!open) setDeleteTarget(null);
                          }}>
                            <AlertDialogTrigger asChild>
                              <Button
                                onClick={() => setDeleteTarget(notification)}
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the note from your notifications.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteTarget) {
                                      requestDeleteNotification(deleteTarget);
                                    }
                                    setDeleteTarget(null);
                                  }}
                                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {replyOpen[notification.id] && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            rows={3}
                            value={replyDrafts[notification.id] || ''}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({ ...prev, [notification.id]: e.target.value }))
                            }
                            placeholder="Write a reply to the sender..."
                          />
                          <Button
                            onClick={() => handleReplySend(notification)}
                            size="sm"
                            disabled={isSendingReply[notification.id]}
                          >
                            {isSendingReply[notification.id] ? 'Sending...' : 'Send Reply'}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
          {!isLoadingNotes && tagFilteredNotifications.length > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Showing {recentNotifications.length} of {threadHeadNotifications.length} conversation{threadHeadNotifications.length !== 1 ? 's' : ''}
                    {searchTerm && ` matching "${searchTerm}"`}
                  </span>
                  <span>
                    {tagFilteredNotifications.filter(n => !n.isRead).length} unread
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Electron Status</CardTitle>
              <CardDescription>
                Quick controls and status checks for Electron notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {desktopActive ? (
                <div className="space-y-2 rounded border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      {desktopState?.allowAfterHours
                        ? 'After-hours activation is ON'
                        : 'After-hours activation is OFF'}
                    </div>
                    <Switch
                      checked={Boolean(desktopState?.allowAfterHours)}
                      onCheckedChange={(next) => {
                        void updateAfterHoursSetting(Boolean(next));
                      }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={syncElectronCount}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Electron Count
                    </Button>
                  </div>
                </div>
              ) : electronActiveForMyAccount ? (
                <div className="space-y-2 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-xs text-amber-900">
                    Electron is active for your account, but this page is not currently running inside the Electron window.
                  </div>
                  <div className="text-[11px] text-amber-800">
                    Open Interoffice Notes from the Electron app to use local desktop controls on this device.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground rounded border px-3 py-2">
                  Electron desktop app not detected on this device.
                </div>
              )}

              <details className="rounded border px-3 py-2">
                <summary className="cursor-pointer list-none text-sm font-medium flex items-center justify-between">
                  <span>Staff Electron status</span>
                  <span className="text-xs text-muted-foreground">
                    {activeElectronCount} active / {inactiveElectronCount} inactive
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  {isLoadingStaff ? (
                    <div className="text-sm text-muted-foreground">Loading staff list...</div>
                  ) : staffList.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No staff found.</div>
                  ) : (
                    staffList.map((staff) => {
                      const active = Boolean(isElectronActiveByUid[staff.uid]);
                      return (
                        <div key={`status-${staff.uid}`} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                          <span className="truncate pr-2">{staff.name}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {active ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </details>
            </CardContent>
          </Card>

          <Card id="compose-note">
            <CardHeader>
              <CardTitle>Send Staff Note</CardTitle>
              <CardDescription>
                Message one or more staff members directly from here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Recipients</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between" disabled={isLoadingStaff}>
                      {isLoadingStaff
                        ? 'Loading staff...'
                        : generalNote.recipientIds.length === 0
                          ? 'Select staff'
                          : `${generalNote.recipientIds.length} selected`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2 w-72">
                    <div className="max-h-56 overflow-auto space-y-2">
                      {staffList.map((staff) => {
                        const checked = generalNote.recipientIds.includes(staff.uid);
                        return (
                          <label key={staff.uid} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                setGeneralNote((prev) => ({
                                  ...prev,
                                  recipientIds: value
                                    ? [...prev.recipientIds, staff.uid]
                                    : prev.recipientIds.filter((id) => id !== staff.uid)
                                }));
                              }}
                            />
                            {isElectronActiveByUid[staff.uid] ? (
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                                aria-label="Electron active"
                                title="Electron active"
                              />
                            ) : null}
                            <span>{staff.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="general-title">Title (optional)</Label>
                <Input
                  id="general-title"
                  value={generalNote.title}
                  onChange={(e) => setGeneralNote((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="General Note"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="general-message">Message</Label>
                <Textarea
                  id="general-message"
                  rows={4}
                  value={generalNote.message}
                  onChange={(e) => setGeneralNote((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="Write a note for staff..."
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="general-priority"
                  title="Priority takes precedence over General notes and appears above General in lists."
                >
                  Note Priority
                </Label>
                <Select
                  value={generalNote.priority}
                  onValueChange={(value) =>
                    setGeneralNote((prev) => ({
                      ...prev,
                      priority: value === 'Priority' ? 'Priority' : 'General'
                    }))
                  }
                >
                  <SelectTrigger id="general-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Priority">Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="general-followup">Follow-up required</Label>
                  <Switch
                    id="general-followup"
                    checked={generalNote.followUpRequired}
                    onCheckedChange={(checked) =>
                      setGeneralNote((prev) => ({
                        ...prev,
                        followUpRequired: checked
                      }))
                    }
                  />
                </div>
                <Input
                  type="date"
                  value={generalNote.followUpDate}
                  onChange={(e) =>
                    setGeneralNote((prev) => ({
                      ...prev,
                      followUpDate: e.target.value,
                      followUpRequired: prev.followUpRequired || Boolean(e.target.value)
                    }))
                  }
                />
              </div>

              <Button onClick={handleSendGeneralNote} disabled={isSendingGeneral} className="w-full">
                {isSendingGeneral ? 'Sending...' : 'Send Note'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingNotes && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading notifications...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MyNotesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" />Loading...</div>}>
      <MyNotesContent />
    </Suspense>
  );
}