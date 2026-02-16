import { NotificationProvider } from '@/components/NotificationProvider';
import DesktopNotificationWindowClient from './DesktopNotificationWindowClient';

export default function DesktopNotificationWindowPage() {
  return (
    <NotificationProvider>
      <DesktopNotificationWindowClient />
    </NotificationProvider>
  );
}

