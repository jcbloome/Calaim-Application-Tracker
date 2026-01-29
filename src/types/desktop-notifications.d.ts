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
      onChange: (callback: (state: DesktopNotificationState) => void) => () => void;
      onExpand: (callback: () => void) => () => void;
    };
  }
}
