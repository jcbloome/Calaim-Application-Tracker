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
import { Loader2, MessageSquare, Search, Calendar, User, RefreshCw, CheckCircle2, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, Suspense, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { addDoc, collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, getDocs, documentId, deleteDoc } from 'firebase/firestore';
import { isPriorityOrUrgent, normalizePriorityLabel, notifyNotificationSettingsChanged } from '@/lib/notification-utils';
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
import { ToastAction } from '@/components/ui/toast';

interface StaffNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  memberName?: string;
  memberId?: string;
  healthPlan?: string;
  priority: 'General' | 'Priority' | 'Urgent' | string;
  isRead: boolean;
  createdAt: any;
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
}

function MyNotesContent() {
  const fallbackInstallerUrl =
    'https://github.com/jcbloome/Calaim-Application-Tracker/releases/download/v3.0.1/Connect.CalAIM.Desktop.Setup.3.0.1.exe';
  const installerUrl = process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL || fallbackInstallerUrl;
  const installerVersion = (() => {
    if (!installerUrl) return null;
    try {
      const decoded = decodeURIComponent(installerUrl);
      const match = decoded.match(/setup\s*([0-9]+(?:\.[0-9]+)+)/i) || decoded.match(/([0-9]+(?:\.[0-9]+)+)/);
      return match?.[1] || process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION || null;
    } catch {
      return process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION || null;
    }
  })();
  const installerDownloadUrl = (() => {
    if (!installerUrl) return null;
    try {
      const url = new URL(installerUrl);
      const version = installerVersion;
      const filename = version
        ? `Connect-CalAIM-Desktop-Setup-${version}.exe`
        : 'Connect-CalAIM-Desktop-Setup.exe';
      url.searchParams.set('response-content-disposition', `attachment; filename="${filename}"`);
      url.searchParams.set('response-content-type', 'application/octet-stream');
      return url.toString();
    } catch {
      return installerUrl;
    }
  })();
  const { user, isAdmin, loading, isUserLoading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [isSendingReply, setIsSendingReply] = useState<Record<string, boolean>>({});
  const [replyPriority, setReplyPriority] = useState<Record<string, 'General' | 'Priority'>>({});
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [generalNote, setGeneralNote] = useState<{
    recipientIds: string[];
    title: string;
    message: string;
    priority: 'General' | 'Priority' | 'Urgent';
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
  const [followUpFilter, setFollowUpFilter] = useState<'all' | 'required'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'sender' | 'priority'>('newest');
  const [desktopActive, setDesktopActive] = useState(false);
  const [suppressWebWhenDesktopActive, setSuppressWebWhenDesktopActive] = useState(false);
  const [webAppNotificationsEnabled, setWebAppNotificationsEnabled] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<StaffNotification | null>(null);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const deletedNotesRef = useRef<Map<string, StaffNotification>>(new Map());

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
            memberName: data.memberName || undefined,
            memberId: data.clientId2 || data.memberId || undefined,
            healthPlan: data.healthPlan || undefined,
            priority: data.priority || 'General',
            isRead: Boolean(data.isRead),
            createdAt: data.timestamp || data.createdAt,
            authorName: data.createdByName || data.senderName || 'System',
            recipientName: data.recipientName || data.recipient || data.recipientDisplayName || undefined,
            recipientId: data.userId || user.uid,
            senderId: data.createdBy || data.senderId,
            applicationId: data.applicationId || undefined,
            actionUrl: data.actionUrl || undefined,
            status: data.status === 'Closed' ? 'Closed' : 'Open',
            isGeneral: Boolean(data.isGeneral),
            followUpRequired: Boolean(data.followUpRequired),
            followUpDate: data.followUpDate?.toDate?.()?.toISOString?.() || data.followUpDate || ''
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
    if (!window.desktopNotifications) {
      setDesktopActive(false);
      return;
    }
    setDesktopActive(true);
    let unsubscribe: (() => void) | undefined;
    window.desktopNotifications.getState()
      .then(() => setDesktopActive(true))
      .catch(() => setDesktopActive(true));
    unsubscribe = window.desktopNotifications.onChange(() => {
      setDesktopActive(true);
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
      deletedNotesRef.current.delete(notification.id);
    } catch (error) {
      console.error('❌ Failed to delete notification:', error);
      deletedNotesRef.current.delete(notification.id);
      setNotifications(prev => [notification, ...prev]);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    }
  };

  const requestDeleteNotification = (notification: StaffNotification) => {
    deletedNotesRef.current.set(notification.id, notification);
    setNotifications(prev => prev.filter(item => item.id !== notification.id));
    const timer = setTimeout(() => {
      deleteTimersRef.current.delete(notification.id);
      commitDeleteNotification(notification);
    }, 5000);
    deleteTimersRef.current.set(notification.id, timer);

    toast({
      title: "Note Deleted",
      description: "You can undo this action for a few seconds.",
      action: (
        <ToastAction
          altText="Undo delete"
          onClick={() => {
            const existingTimer = deleteTimersRef.current.get(notification.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
              deleteTimersRef.current.delete(notification.id);
            }
            const cached = deletedNotesRef.current.get(notification.id);
            if (cached) {
              deletedNotesRef.current.delete(notification.id);
              setNotifications(prev => [cached, ...prev]);
            }
          }}
        >
          Undo
        </ToastAction>
      )
    });
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (!firestore) return;
    
    try {
      const unreadNotifications = notifications.filter(n => !n.isRead);
      
      if (unreadNotifications.length === 0) {
        toast({
          title: "Info",
          description: "No unread notifications to mark",
        });
        return;
      }

      const batch = writeBatch(firestore);
      unreadNotifications.forEach(notification => {
        batch.update(doc(firestore, 'staff_notifications', notification.id), { isRead: true });
      });
      
      await batch.commit();
      
      toast({
        title: "Success",
        description: `Marked ${unreadNotifications.length} notifications as read`,
      });
    } catch (error) {
      console.error('❌ Failed to mark all notifications as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive",
      });
    }
  };

  const handleReplySend = async (notification: StaffNotification) => {
    if (!firestore || !user?.uid) return;
    const replyTargetId = notification.senderId || notification.recipientId || user.uid;
    if (!replyTargetId) {
      toast({
        title: "Missing Sender",
        description: "This note does not have a sender to reply to.",
        variant: "destructive",
      });
      return;
    }
    const message = replyDrafts[notification.id]?.trim();
    const priority = replyPriority[notification.id] || 'General';
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
        priority: priority === 'Priority' ? 'Priority' : 'General',
        status: 'Open',
        isRead: false,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Staff',
        senderName: user.displayName || user.email || 'Staff',
        senderId: user.uid,
        recipientName: notification.authorName || user.displayName || user.email || 'Staff',
        timestamp: serverTimestamp(),
        replyToId: notification.id,
        threadId: notification.id,
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
      await addDoc(collection(firestore, 'staff_notifications'), payload);

      toast({
        title: "Reply Sent",
        description: "Your reply was sent to the original sender.",
      });
      setReplyDrafts((prev) => ({ ...prev, [notification.id]: '' }));
      setReplyPriority((prev) => ({ ...prev, [notification.id]: 'General' }));
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
            title: generalNote.title?.trim() || 'General Note',
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

  const isInterofficeNotification = (notification: StaffNotification) => {
    const originType = String(notification.type || '').toLowerCase();
    return Boolean(notification.isGeneral) || originType.includes('interoffice');
  };

  // Filter notifications based on search term
  const filteredNotifications = notifications.filter(notification => {
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
    if (sortBy === 'sender') {
      const aSender = (a.authorName || '').toLowerCase();
      const bSender = (b.authorName || '').toLowerCase();
      if (aSender !== bSender) return aSender.localeCompare(bSender);
      return bTime.getTime() - aTime.getTime();
    }
    if (sortBy === 'priority') {
      const aPriority = normalizePriorityLabel(a.priority);
      const bPriority = normalizePriorityLabel(b.priority);
      const aRank = aPriority === 'Priority' || aPriority === 'Urgent' ? 1 : 0;
      const bRank = bPriority === 'Priority' || bPriority === 'Urgent' ? 1 : 0;
      if (aRank !== bRank) return bRank - aRank;
      return bTime.getTime() - aTime.getTime();
    }
    return bTime.getTime() - aTime.getTime();
  });

  const recentNotifications = showAllNotes ? sortedNotifications : sortedNotifications.slice(0, 5);
  const desktopActiveDisplay = desktopActive || suppressWebWhenDesktopActive;

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

  if (loading || isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (!user && !loading && !isUserLoading) {
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
          <h1 className="text-3xl font-bold">My Notifications</h1>
          <p className="text-muted-foreground">
            View and manage your personal notifications and member-related alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {installerDownloadUrl && (
            <Button asChild variant="outline" size="sm">
              <a
                href={installerDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download Desktop Installer{installerVersion ? ` (${installerVersion})` : ''}
              </a>
            </Button>
          )}
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {filteredNotifications.some(n => !n.isRead) && (
            <Button onClick={markAllAsRead} variant="outline" size="sm">
              Mark All Read
            </Button>
          )}
        </div>
      </div>

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
                  variant={followUpFilter === 'required' ? 'default' : 'outline'}
                  onClick={() => setFollowUpFilter((prev) => (prev === 'required' ? 'all' : 'required'))}
                >
                  Follow-up Required
                </Button>
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
                const priorityLabel = normalizePriorityLabel(notification.priority);
                const displayTitle = `Re: ${notification.memberName || 'General Note'}`;
                return (
                  <Card
                    key={notification.id}
                    id={`note-${notification.id}`}
                    className={`transition-colors hover:bg-accent/50 ${
                      !notification.isRead ? 'border-blue-200 bg-blue-50/30' : ''
                    } ${highlightNoteId === notification.id ? 'ring-2 ring-blue-200' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <h3 className={`font-medium ${!notification.isRead ? 'text-blue-900' : ''}`}>
                              {displayTitle}
                            </h3>
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
                            <Badge variant="outline">
                              {notification.status || 'Open'}
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
                        </div>
                        <div className="flex flex-col gap-2">
                          {notification.isRead && (
                            <div className="flex items-center gap-2 text-xs text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Viewed</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {notification.status === 'Closed' ? 'Closed' : 'Open'}
                            </span>
                            <Switch
                              checked={notification.status !== 'Closed'}
                              onCheckedChange={() => toggleStatus(notification)}
                            />
                          </div>
                          <Button
                            onClick={() => toggleFollowUpRequired(notification)}
                            variant="ghost"
                            size="sm"
                            className={hasFollowUpRequired(notification) ? 'text-yellow-700' : 'text-muted-foreground'}
                          >
                            {hasFollowUpRequired(notification) ? 'Follow-up set' : 'Mark follow-up'}
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
                                  This removes the note from your notifications. You will have a brief chance to undo.
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
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Priority</Label>
                            <Select
                              value={replyPriority[notification.id] || 'General'}
                              onValueChange={(value) =>
                                setReplyPriority((prev) => ({
                                  ...prev,
                                  [notification.id]: value as 'General' | 'Priority'
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="General">General (no popup)</SelectItem>
                                <SelectItem value="Priority">Priority (popup)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
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
                    Showing {recentNotifications.length} of {tagFilteredNotifications.length} notification{tagFilteredNotifications.length !== 1 ? 's' : ''}
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
                <Label htmlFor="general-priority">Priority</Label>
                <Select
                  value={generalNote.priority}
                  onValueChange={(value: 'General' | 'Priority' | 'Urgent') =>
                    setGeneralNote((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger id="general-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General (no popup)</SelectItem>
                    <SelectItem value="Priority">Priority (popup)</SelectItem>
                    <SelectItem value="Urgent">Urgent (popup + top)</SelectItem>
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