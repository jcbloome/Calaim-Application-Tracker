import { isHealthNetPlan, isKaiserPlan } from '@/lib/t2038-claims';

type AppLike = Record<string, unknown> | null | undefined;

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeStatus = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

/** Caspio CalAIM_MCO (or mirrored field) on the application / cache row. */
export function getCaspioCalaimMco(app: AppLike): string {
  if (!app) return '';
  return clean(
    app.caspioCalAIM_MCO ||
      app.CalAIM_MCO ||
      app.calaimMco ||
      app.caspioMco ||
      app.previousHealthPlan ||
      ''
  );
}

export function isPendingToSwitchCalaimStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  return status.includes('pending to switch') || status === 'pending switch';
}

/** True when the tracker treats this as a Kaiser file (auth / health plan / Kaiser status). */
export function hasKaiserAuthOrPlan(app: AppLike): boolean {
  if (!app) return false;
  if (isKaiserPlan(app.healthPlan || app.Health_Plan || app.health_plan)) return true;
  if (app.kaiserAuthReceivedViaIls === true) return true;
  if (clean(app.kaiserStatus || app.Kaiser_Status)) return true;
  if (clean(app.Authorization_Number_T038 || app.Authorization_Number_T2038)) return true;
  return false;
}

/**
 * Kaiser auth/work in the tracker while Caspio CalAIM_MCO (by CIN / MCP_CIN) still says Health Net,
 * or we already persisted the Health Net history flag.
 */
export function isFormerlyHealthNet(app: AppLike): boolean {
  if (!app) return false;
  if (app.formerlyHealthNet === true) return true;

  const caspioMco = getCaspioCalaimMco(app);
  const calaimStatus = app.caspioCalAIMStatus || app.CalAIM_Status || app.calaimStatus;

  if (isPendingToSwitchCalaimStatus(calaimStatus) && hasKaiserAuthOrPlan(app)) {
    return true;
  }

  if (!hasKaiserAuthOrPlan(app)) return false;
  return isHealthNetPlan(caspioMco);
}

/** True when Caspio MCO is still Health Net (not yet flipped to Kaiser). */
export function isCurrentlyHealthNetOnCaspio(app: AppLike): boolean {
  return isHealthNetPlan(getCaspioCalaimMco(app));
}

/** Short badge text: Currently Health Net while Caspio MCO is still HN; Formerly after MCO flips. */
export function getHealthNetTransitionBadgeText(app: AppLike): string {
  if (!isFormerlyHealthNet(app)) return '';
  if (isCurrentlyHealthNetOnCaspio(app) || isPendingToSwitchCalaimStatus(app?.caspioCalAIMStatus || app?.CalAIM_Status)) {
    return 'Currently Health Net';
  }
  return 'Formerly Health Net';
}

export function getFormerlyHealthNetLabel(app: AppLike): string {
  if (!isFormerlyHealthNet(app)) return '';
  if (isCurrentlyHealthNetOnCaspio(app)) {
    return 'Currently Health Net on Caspio (MCP_CIN) · Kaiser authorized — update CalAIM_MCO when ready';
  }
  return 'Formerly Health Net · Caspio MCO was Health Net';
}

/** Fields to merge onto an application when Caspio still lists Health Net for this CIN. */
export function buildFormerlyHealthNetPersistPatch(params: {
  caspioMco?: unknown;
  calaimStatus?: unknown;
  force?: boolean;
}): Record<string, unknown> | null {
  const caspioMco = clean(params.caspioMco);
  const isHn = isHealthNetPlan(caspioMco);
  const pendingSwitch = isPendingToSwitchCalaimStatus(params.calaimStatus);
  if (!params.force && !isHn && !pendingSwitch) return null;

  const patch: Record<string, unknown> = {
    formerlyHealthNet: true,
    previousHealthPlan: 'Health Net',
  };
  if (caspioMco) {
    patch.caspioCalAIM_MCO = caspioMco;
    patch.CalAIM_MCO = caspioMco;
  }
  return patch;
}
