## Operations Runbook

This runbook is the practical checklist for day-to-day ops and recovery actions.

---

## Routine Maintenance
- Verify backups are running (Firestore exports).
- Check error dashboards and alerts.
- Confirm update feed is reachable.
- Review `PROJECT_LOG.md` after major changes.

---

## Build and Deploy

### Web App
- `npm run build`
- Deploy using the standard hosting workflow.
- Verify key routes and admin login.

### Firebase Functions
- Deploy functions after web deploy when API changes are included.
- Verify function logs for errors.

---

## Rollback Procedure

### Web
- Roll back in hosting console to last known good release.
- Verify `/admin/login`, `/admin/applications`, and `/forms/cs-summary-form`.

### Functions
- Deploy previous release tag.
- Verify scheduled reminders and core APIs.

### Desktop Update Feed
- Re-point update metadata to the previous version.
- Keep prior installers available in `public/downloads`.

---

## Backup & Restore

### Backup
- Nightly Firestore export to GCS.
- Versioned storage buckets with retention policy.
- Manual export before migrations.

### Restore
- Restore into staging project first.
- Validate auth, users, and applications.
- Promote to production only after verification.

---

## Monitoring and Alerts
- Watch Cloud Logging for spikes in 5xx errors.
- Alert on function failures and auth errors.
- Track update failures in desktop logs.

---

## Incident Response
- Identify impact and scope.
- Roll back quickly if needed.
- Preserve logs and timestamps.
- Update `PROJECT_LOG.md` with a short summary.

---

## Key Paths
- `PROJECT_LOG.md` — ongoing changes log
- `DISASTER_RECOVERY.md` — high-level recovery steps
- `public/downloads` — desktop installer fallback

