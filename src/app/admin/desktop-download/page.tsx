import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const fallbackInstallerUrl = '/downloads/Connect-CalAIM-Desktop-Setup.exe';
const installerUrl = process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL || fallbackInstallerUrl;

export default function DesktopDownloadPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Desktop Notifications App</CardTitle>
          <CardDescription>
            Install the Windows desktop app to receive system tray alerts for priority notes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {installerUrl ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild>
                <a href={installerUrl} target="_blank" rel="noreferrer">
                  Download Windows Installer
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">
                Share this link with staff to install the tray notification app.
              </p>
            </div>
          ) : (
            <Alert>
              <AlertTitle>Installer link not configured</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono">NEXT_PUBLIC_DESKTOP_INSTALLER_URL</code> to the hosted
                installer URL (e.g., a Google Drive or website link).
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Install steps</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Download the installer (.exe) using the link above.</li>
              <li>Run the installer and follow the prompts.</li>
              <li>After install, the app appears in the Windows tray.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phone Install (PWA)</CardTitle>
          <CardDescription>
            Add the admin or user portal to a phone home screen for quick access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="font-medium">Admin app</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button asChild variant="outline">
                <a href="/admin/login" target="_blank" rel="noreferrer">
                  Open Admin Login
                </a>
              </Button>
              <span className="text-sm text-muted-foreground">
                Use browser install → Add to Home Screen.
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium">User app</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button asChild variant="outline">
                <a href="/login" target="_blank" rel="noreferrer">
                  Open User Login
                </a>
              </Button>
              <span className="text-sm text-muted-foreground">
                Use browser install → Add to Home Screen.
              </span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Android: tap Install in Chrome menu or address bar.</p>
            <p>iPhone: Share → Add to Home Screen.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
