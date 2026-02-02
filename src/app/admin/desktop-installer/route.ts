import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallbackInstallerUrl =
  'https://github.com/jcbloome/Calaim-Application-Tracker/releases/download/v3.0.1/Connect.CalAIM.Desktop.Setup.3.0.1.exe';

const getInstallerUrl = () =>
  process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL || fallbackInstallerUrl;

const getInstallerVersion = (installerUrl: string) => {
  try {
    const decoded = decodeURIComponent(installerUrl);
    const match = decoded.match(/setup\s*([0-9]+(?:\.[0-9]+)+)/i) || decoded.match(/([0-9]+(?:\.[0-9]+)+)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
};

const getDesktopPackageVersion = async () => {
  try {
    const packagePath = path.join(process.cwd(), 'desktop', 'package.json');
    const raw = await fs.readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed?.version || null;
  } catch {
    return null;
  }
};

export async function GET() {
  const installerUrl = getInstallerUrl();
  const version =
    getInstallerVersion(installerUrl) ||
    process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION ||
    process.env.DESKTOP_INSTALLER_VERSION ||
    (await getDesktopPackageVersion());
  const filename = version
    ? `Connect-CalAIM-Desktop-Setup-${version}.exe`
    : 'Connect-CalAIM-Desktop-Setup.exe';

  const response = await fetch(installerUrl, { redirect: 'follow', cache: 'no-store' });
  if (!response.ok || !response.body) {
    return new Response('Installer download unavailable.', { status: 502 });
  }

  const data = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'no-store');

  return new Response(data, {
    status: response.status,
    headers
  });
}
