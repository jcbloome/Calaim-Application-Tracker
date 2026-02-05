import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallbackInstallerUrl =
  'https://github.com/jcbloome/Calaim-Application-Tracker/releases/download/v3.0.1/Connect.CalAIM.Desktop.Setup.3.0.1.exe';

const localMetaPath = path.join(process.cwd(), 'public', 'downloads', 'installer.json');

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
  const installerUrl = process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL || fallbackInstallerUrl;
  const meta = await fs.readFile(localMetaPath, 'utf8').then(JSON.parse).catch(() => null);

  const version =
    meta?.version ||
    getInstallerVersion(installerUrl) ||
    process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION ||
    process.env.DESKTOP_INSTALLER_VERSION ||
    (await getDesktopPackageVersion());

  return Response.json({
    version,
    filename: meta?.filename || null,
    releaseUrl: meta?.releaseUrl || installerUrl,
    sha256: meta?.sha256 || null
  });
}
