## Disaster Recovery Guide

This guide covers the minimum steps to restore service after a critical failure.

### Scope
- Web app (Next.js)
- Firebase (Auth, Firestore, Storage, Functions)
- Electron desktop auto-update feed

---

## 1) Immediate Triage (First 15 minutes)
- Confirm impact: web app down, Firebase errors, auth failures, update feed issues.
- Check current deploy and version: note `NEXT_PUBLIC_BUILD_TIME` (web) and desktop version.
- Identify blast radius: only admin, only users, or full outage.

---

## 2) Fast Rollback Options

### Web App (Hosting/App Hosting)
- Roll back to last known good release in the hosting console.
- If needed, redeploy from last tagged git release.

### Firebase Functions
- Re-deploy the last known good version.
- Prefer deploy from a git tag to avoid drift.

### Desktop App
- Keep at least 2 previous installers and update metadata in the update feed.
- If needed, re-point update metadata to prior version.

---

## 3) Data Recovery (Firestore)

### Backup Strategy
- Nightly exports to a versioned GCS bucket.
- Keep 30–90 days of backups.
- Take a manual export before any migration.

### Restore Strategy
- Restore to a staging project first.
- Validate data integrity.
- Restore to production only when verified.

---

## 4) Incident Checklist
- [ ] Capture error logs and timestamps.
- [ ] Identify affected services (web, functions, auth, storage).
- [ ] Roll back or redeploy known good build.
- [ ] Confirm data health and auth.
- [ ] Notify stakeholders once stable.
- [ ] Log incident and root cause.

---

## 5) Required Documentation
- `RUNBOOK.md` for operational procedures.
- Release tags in git (e.g., `vYYYY.MM.DD`).
- Environment variable and secret change log.

---

## 6) Post-Incident Actions
- Add a summary to `PROJECT_LOG.md`.
- Add a root cause analysis (RCA) and prevention steps.
- Update this guide if new failure modes are discovered.

