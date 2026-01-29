import fs from 'fs/promises';
import path from 'path';

const projectRoot = process.cwd();
const releaseDir = path.join(projectRoot, 'desktop', 'release');
const targetDir = path.join(projectRoot, 'public', 'downloads');
const targetName = 'Connect-CalAIM-Desktop-Setup.exe';
const targetPath = path.join(targetDir, targetName);

const versionRegex = /Connect CalAIM Desktop Setup ([\d.]+)\.exe$/i;

const parseVersion = (value) => value.split('.').map((segment) => Number(segment));
const compareVersions = (a, b) => {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aValue = aParts[index] ?? 0;
    const bValue = bParts[index] ?? 0;
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }

  return 0;
};

const getInstallerCandidates = async () => {
  const entries = await fs.readdir(releaseDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.exe') && !name.endsWith('.blockmap'))
    .filter((name) => versionRegex.test(name));
};

const pickLatestInstaller = async (candidates) => {
  if (candidates.length === 0) {
    return null;
  }

  const parsed = candidates
    .map((name) => {
      const match = name.match(versionRegex);
      return { name, version: match?.[1] ?? '' };
    })
    .filter((item) => item.version);

  if (parsed.length === 0) {
    return null;
  }

  parsed.sort((a, b) => compareVersions(a.version, b.version));
  return parsed.at(-1)?.name ?? null;
};

const run = async () => {
  const candidates = await getInstallerCandidates();
  const latest = await pickLatestInstaller(candidates);

  if (!latest) {
    console.error('No desktop installer .exe found in desktop/release.');
    process.exit(1);
  }

  const sourcePath = path.join(releaseDir, latest);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(sourcePath, targetPath);

  console.log(`Copied ${latest} -> ${path.relative(projectRoot, targetPath)}`);
};

run().catch((error) => {
  console.error('Failed to update desktop installer:', error);
  process.exit(1);
});
