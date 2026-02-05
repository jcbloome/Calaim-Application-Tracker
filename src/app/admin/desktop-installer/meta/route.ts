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

const localInstallerPath = path.join(process.cwd(), 'public', 'downloads', 'Connect-CalAIM-Desktop-Setup.exe');
const localSha256Path = `${localInstallerPath}.sha256`;

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

  let sha256: string | null = null;
  let source: 'local' | 'remote' = 'remote';

  try {
    const shaText = await fs.readFile(localSha256Path, 'utf8');
    sha256 = shaText.split(/\s+/)[0] || null;
    source = 'local';
  } catch {
    try {
      await fs.stat(localInstallerPath);
      source = 'local';
    } catch {
      source = 'remote';
    }
  }

  return Response.json({
    version,
    filename,
    sha256,
    source,
    downloadUrl: '/admin/desktop-installer'
  });
}
