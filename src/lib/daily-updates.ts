export type DailyUpdateRunner = 'github-actions' | 'firebase-scheduler';

export type DailyUpdateJob = {
  id: string;
  name: string;
  schedule: string;
  runner: DailyUpdateRunner;
  /** Where the schedule lives (workflow file or Firebase function name). */
  scheduledBy: string;
  description: string;
  /** Endpoint the scheduler calls. */
  endpoint: string;
  /** Super admins can trigger it from /admin/super-admin-tools/daily-updates. Email reminder jobs are list-only. */
  canRunNow: boolean;
  /** Run-now loops batches until the endpoint returns nextOffset = null. */
  batched?: boolean;
  /** Existing admin-settings doc the job already writes its own last-run info to. */
  legacySettingsDocId?: string;
};

export const DAILY_UPDATE_RUNS_COLLECTION = 'daily_update_runs';

export const DAILY_UPDATE_JOBS: DailyUpdateJob[] = [
  {
    id: 'social-workers-cache',
    name: 'Social worker directory cache',
    schedule: 'Daily 8:45 PM ET',
    runner: 'firebase-scheduler',
    scheduledBy: 'syncCaspioSocialWorkersCacheDaily',
    description: 'Refreshes SW_ID / email / name for social workers from Caspio (syncedSocialWorkers).',
    endpoint: '/api/caspio/social-workers-cache/sync',
    canRunNow: true,
  },
  {
    id: 'members-cache-incremental',
    name: 'Caspio members cache (incremental)',
    schedule: 'Daily 9:00 PM ET (full sync Sundays 9:35 PM ET)',
    runner: 'firebase-scheduler',
    scheduledBy: 'syncCaspioMembersCacheIncremental / syncCaspioMembersCacheFull',
    description:
      'Pulls members changed in Caspio since the last run into caspio_members_cache (Kaiser_Status, CalAIM_Status, staff, RCFE, authorizations). Status deltas are copied onto applications.',
    endpoint: '/api/caspio/members-cache/sync',
    canRunNow: true,
    legacySettingsDocId: 'caspio-members-sync',
  },
  {
    id: 'kaiser-cache-refresh',
    name: 'Kaiser members + notes cache refresh',
    schedule: 'Daily ~4:30 AM PT',
    runner: 'github-actions',
    scheduledBy: '.github/workflows/daily-updates.yml',
    description:
      'Re-syncs Kaiser members from Caspio (Kaiser_Status, CalAIM_Status, assignments) and then pulls the latest Caspio notes for every Kaiser member into the notes cache, in batches.',
    endpoint: '/api/cron/kaiser-morning-notes-sync',
    canRunNow: true,
    batched: true,
  },
  {
    id: 'application-status-check',
    name: 'Application Kaiser / CalAIM status check',
    schedule: 'Daily ~5:30 AM PT (after the Kaiser cache refresh)',
    runner: 'github-actions',
    scheduledBy: '.github/workflows/daily-updates.yml',
    description:
      'Compares every pushed application against the members cache and corrects Kaiser_Status / CalAIM_Status on the application (step 3 / 4 of the application page). Each change goes to the Global Change Log.',
    endpoint: '/api/cron/application-status-check',
    canRunNow: true,
  },
  {
    id: 'first-contact-staff-reminders',
    name: 'First-contact staff reminders',
    schedule: 'Daily 13:00 UTC (~6 AM PT)',
    runner: 'github-actions',
    scheduledBy: '.github/workflows/first-contact-staff-reminders.yml',
    description: 'Emails staff about members still waiting on a first contact.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'pending-document-staff-reminders',
    name: 'Pending document staff reminders',
    schedule: 'Daily 13:15 UTC (~6:15 AM PT)',
    runner: 'github-actions',
    scheduledBy: '.github/workflows/pending-document-staff-reminders.yml',
    description: 'Emails staff about applications with uploaded documents that still need review.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'isp-daily-action-reminders',
    name: 'ISP daily action reminders',
    schedule: 'Daily 9:05 AM PT',
    runner: 'github-actions',
    scheduledBy: '.github/workflows/isp-daily-action-reminders.yml',
    description: 'Emails ISP workflow owners about next actions due.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'alft-rn-reminders',
    name: 'ALFT RN reminders',
    schedule: 'Twice daily 13:00 + 21:00 UTC',
    runner: 'github-actions',
    scheduledBy: '.github/workflows/alft-rn-reminders.yml',
    description: 'Emails RNs about ALFT items waiting on review / signature.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'document-reminders',
    name: 'Family document reminders',
    schedule: 'Daily 9:00 AM PT',
    runner: 'firebase-scheduler',
    scheduledBy: 'sendDocumentReminders',
    description: 'Emails families about missing application documents.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'cs-summary-reminders',
    name: 'CS summary reminders',
    schedule: 'Daily 9:00 AM PT',
    runner: 'firebase-scheduler',
    scheduledBy: 'sendCsSummaryReminders',
    description: 'Reminds families / staff to finish the CS Member Summary.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'missing-forms-check',
    name: 'Missing forms check',
    schedule: 'Daily 9:00 AM PT',
    runner: 'firebase-scheduler',
    scheduledBy: 'checkMissingForms',
    description: 'Flags applications that are missing required forms.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'morning-note-digest',
    name: 'Morning note digest',
    schedule: 'Daily 12:00 PM ET',
    runner: 'firebase-scheduler',
    scheduledBy: 'sendMorningNoteDigest',
    description: 'Emails staff a digest of new member notes.',
    endpoint: '',
    canRunNow: false,
  },
  {
    id: 'priority-notes-monitor',
    name: 'Priority notes monitor',
    schedule: 'Every 15 minutes',
    runner: 'firebase-scheduler',
    scheduledBy: 'monitorCaspioPriorityNotes',
    description: 'Watches Caspio for priority notes and notifies assigned staff.',
    endpoint: '',
    canRunNow: false,
  },
];

export const getDailyUpdateJob = (id: string) => DAILY_UPDATE_JOBS.find((job) => job.id === id) || null;

export type DailyUpdateRunRecord = {
  ok: boolean;
  trigger: 'cron' | 'manual';
  startedAt?: string;
  finishedAt: string;
  durationMs?: number;
  summary?: Record<string, unknown>;
  error?: string;
  triggeredByEmail?: string;
};

/** Best-effort: keeps the latest run on daily_update_runs/{jobId} and appends a history row. */
export async function recordDailyUpdateRun(adminDb: any, jobId: string, run: DailyUpdateRunRecord) {
  try {
    const ref = adminDb.collection(DAILY_UPDATE_RUNS_COLLECTION).doc(jobId);
    const clean = JSON.parse(JSON.stringify(run));
    await Promise.all([
      ref.set(
        {
          jobId,
          lastRun: clean,
          ...(run.ok ? { lastSuccessAt: run.finishedAt } : { lastFailureAt: run.finishedAt }),
        },
        { merge: true }
      ),
      ref.collection('history').add(clean),
    ]);
  } catch (error) {
    console.warn(`[daily-updates] could not record run for ${jobId}:`, error);
  }
}

export const isCronRequest = (authHeader: string | null) =>
  Boolean(process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);
