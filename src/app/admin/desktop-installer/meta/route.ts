import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallbackInstallerUrl =
  'https://github.com/jcbloome/Calaim-Application-Tracker/releases/latest';

const GITHUB_OWNER = 'jcbloome';
const GITHUB_REPO = 'Calaim-Application-Tracker';

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

const getLatestGithubInstaller = async (): Promise<{
  version: string | null;
  url: string | null;
  name: string | null;
}> => {
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const res = await fetch(apiUrl, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Connect-CalAIM-Tracker'
      }
    });
    if (!res.ok) return { version: null, url: null, name: null };
    const data = await res.json() as any;
    const tag = String(data?.tag_name || '');
    const version = tag.replace(/^v/i, '') || null;
    const assets = Array.isArray(data?.assets) ? data.assets : [];
    const exe = assets.find((a: any) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.exe'));
    return {
      version,
      url: exe?.browser_download_url || null,
      name: exe?.name || null
    };
  } catch {
    return { version: null, url: null, name: null };
  }
};

const getLatestFromLatestYml = async (): Promise<{
  version: string | null;
  url: string | null;
  name: string | null;
}> => {
  try {
    const latestYmlUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/latest.yml`;
    const res = await fetch(latestYmlUrl, { cache: 'no-store' });
    if (!res.ok) return { version: null, url: null, name: null };
    const text = await res.text();
    const versionMatch = text.match(/^\s*version:\s*("?)([0-9]+(?:\.[0-9]+)+)\1\s*$/mi);
    const pathMatch = text.match(/^\s*path:\s*("?)(.+?)\1\s*$/mi);
    const version = versionMatch?.[2] || null;
    const name = pathMatch?.[2] ? String(pathMatch[2]).trim() : null;
    const url = version && name
      ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/${encodeURIComponent(name)}`
      : null;
    return { version, url, name };
  } catch {
    return { version: null, url: null, name: null };
  }
};

export async function GET() {
  const installerUrl = process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL || fallbackInstallerUrl;
  const meta = await fs.readFile(localMetaPath, 'utf8').then(JSON.parse).catch(() => null);

  const latestYml = await getLatestFromLatestYml();
  const latest = latestYml.url ? latestYml : await getLatestGithubInstaller();

  const version =
    latest.version ||
    meta?.version ||
    getInstallerVersion(installerUrl) ||
    process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION ||
    process.env.DESKTOP_INSTALLER_VERSION ||
    (await getDesktopPackageVersion());

  return Response.json({
    version,
    filename: latest.name || meta?.filename || null,
    releaseUrl: latest.url || meta?.releaseUrl || installerUrl,
    sha256: meta?.sha256 || null
  });
}
