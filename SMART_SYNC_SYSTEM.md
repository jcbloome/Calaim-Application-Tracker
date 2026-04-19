# CalAIM Sync Model (Current)

## Overview

This document reflects the current production sync architecture after retiring the legacy manual queue/batch push flow.

## Source-of-Truth Rules

- Caspio is the source of truth for member records.
- Firebase is the app-facing cache for fast UI reads.
- Manual sync actions are cache reconcile tools only (not field-level push tools).

## Members Cache Sync (Production Path)

### Inbound updates (Caspio -> Firebase)

- Webhook-driven updates are handled by:
  - `functions/src/caspio-webhooks.ts`
  - `functions/src/caspio-usersregistration-webhook.ts`
- Webhooks write normalized payloads into cache collections and log processing events.

### Scheduled reconcile (safety net)

- Scheduler functions:
  - `functions/src/caspio-members-cache-sync.ts`
- Cadence:
  - Daily incremental sync
  - Weekly full reconcile
- Endpoint called by scheduler:
  - `POST /api/caspio/members-cache/sync`

### Manual reconcile (admin)

- Admin tools trigger:
  - `POST /api/caspio/members-cache/sync` with `mode: "incremental" | "full"`
- Sync status endpoint:
  - `GET /api/caspio/members-cache/status`
- Full reconcile includes pruning stale cache docs that no longer exist in Caspio.

## Retired Legacy Sync Functions

The following callable functions were retired and removed from active exports:

- `checkSyncStatus`
- `performManualSync`
- `performAutoSync`
- `getPendingSyncs`
- `performBatchSync`

Related legacy implementation file removed:

- `functions/src/auto-batch-sync.ts`

## Duplicate Prevention (Still Active)

These callables remain active in `functions/src/smart-sync.ts`:

- `checkForDuplicateClients`
- `resolveDuplicateClients`

## Notes About Client Notes Sync Utility

The local note-sync helper in `src/lib/member-notes-sync.ts` is separate from members-cache reconcile and should not be interpreted as the member data sync architecture.

---

Last updated: 2026-04-19
