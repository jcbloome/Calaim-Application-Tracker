export {};

declare global {
  interface DesktopNotificationState {
    pausedByUser: boolean;
    isWithinBusinessHours: boolean;
    allowAfterHours: boolean;
    effectivePaused: boolean;
  }

  interface Window {
    desktopNotifications?: {
      getState: () => Promise<DesktopNotificationState>;
      setPaused: (paused: boolean) => Promise<DesktopNotificationState>;
      notify: (payload: { title: string; body: string; openOnNotify?: boolean }) => Promise<boolean>;
      setPendingCount: (count: number) => void;
      setPillSummary?: (payload: {
        count: number;
        notes?: Array<{
          title: string;
          message: string;
          author?: string;
          recipientName?: string;
          memberName?: string;
          timestamp?: string;
          noteId?: string;
          senderId?: string;
          replyUrl?: string;
          actionUrl?: string;
        }>;
        title?: string;
        message?: string;
        author?: string;
        recipientName?: string;
        memberName?: string;
        timestamp?: string;
        replyUrl?: string;
        actionUrl?: string;
      }) => void;
      checkForUpdates?: () => Promise<void>;
      onChange: (callback: (state: DesktopNotificationState) => void) => () => void;
      onExpand: (callback: () => void) => () => void;
      onQuickReply?: (callback: (payload: { noteId?: string; senderId?: string; message: string }) => void) => () => void;
    };
  }
}
