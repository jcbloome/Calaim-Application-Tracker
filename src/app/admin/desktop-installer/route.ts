import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallbackInstallerUrl =
  'https://github.com/jcbloome/Calaim-Application-Tracker/releases/download/v3.0.1/Connect.CalAIM.Desktop.Setup.3.0.1.exe';

const localInstallerPath = path.join(process.cwd(), 'public', 'downloads', 'Connect-CalAIM-Desktop-Setup.exe');
const localSha256Path = `${localInstallerPath}.sha256`;
const localMetaPath = path.join(process.cwd(), 'public', 'downloads', 'installer.json');

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

const getLocalInstallerMeta = async () => {
  try {
    const raw = await fs.readFile(localMetaPath, 'utf8');
    return JSON.parse(raw) as {
      version?: string | null;
      filename?: string | null;
      releaseUrl?: string | null;
      sha256?: string | null;
    };
  } catch {
    return null;
  }
};

export async function GET() {
  const installerUrl = getInstallerUrl();
  const localMeta = await getLocalInstallerMeta();
  const version =
    localMeta?.version ||
    getInstallerVersion(installerUrl) ||
    process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION ||
    process.env.DESKTOP_INSTALLER_VERSION ||
    (await getDesktopPackageVersion());
  const filename = version
    ? `Connect-CalAIM-Desktop-Setup-${version}.exe`
    : 'Connect-CalAIM-Desktop-Setup.exe';

  let data: ArrayBuffer;
  let sha256: string | null = localMeta?.sha256 || null;
  let headers = new Headers();

  try {
    const localBuffer = await fs.readFile(localInstallerPath);
    data = localBuffer.buffer.slice(localBuffer.byteOffset, localBuffer.byteOffset + localBuffer.byteLength);
    try {
      if (!sha256) {
        const shaText = await fs.readFile(localSha256Path, 'utf8');
        sha256 = shaText.split(/\s+/)[0] || null;
      }
    } catch {
      sha256 = crypto.createHash('sha256').update(localBuffer).digest('hex');
    }
  } catch {
    const remoteUrl = localMeta?.releaseUrl || installerUrl;
    const response = await fetch(remoteUrl, { redirect: 'follow', cache: 'no-store' });
    if (!response.ok || !response.body) {
      return new Response('Installer download unavailable.', { status: 502 });
    }
    data = await response.arrayBuffer();
    sha256 = crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
    headers = new Headers(response.headers);
  }
  headers.set(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'no-store');
  if (sha256) {
    headers.set('X-Installer-Sha256', sha256);
  }

  return new Response(data, {
    status: 200,
    headers
  });
}
