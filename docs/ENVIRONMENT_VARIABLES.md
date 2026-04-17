# Environment Variables and Secrets

This document is the operational source of truth for environment variables and secrets used by the CalAIM Tracker app.

## Classification Legend

- `required`: app functionality or security breaks without it.
- `optional`: feature-specific or deployment-specific.
- `legacy`: still referenced in limited code paths; preferred replacement exists.

## App Hosting / Next.js Runtime

### Public client (`NEXT_PUBLIC_*`)

- `required` `NEXT_PUBLIC_FIREBASE_API_KEY`
- `required` `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `required` `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `required` `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `required` `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `required` `NEXT_PUBLIC_FIREBASE_APP_ID`
- `required` `NEXT_PUBLIC_APP_URL`
- `required` `NEXT_PUBLIC_BASE_URL`
- `required` `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `optional` `NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY`
- `optional` `NEXT_PUBLIC_CASPIO_BASE_URL` (prefer server-side Caspio vars)
- `optional` `NEXT_PUBLIC_DESKTOP_INSTALLER_URL`
- `optional` `NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION`

### Server-only (web runtime)

- `required` `CASPIO_BASE_URL`
- `required` `CASPIO_CLIENT_ID`
- `required` `CASPIO_CLIENT_SECRET`
- `required` `CASPIO_TABLE_NAME`
- `required` `RESEND_API_KEY`
- `required` `CRON_SECRET`
- `optional` `GOOGLE_API_KEY` (translate endpoint fallback)

- `optional` `CASPIO_READ_ONLY`
- `optional` `GOOGLE_MAPS_API_KEY`
- `optional` `GOOGLE_TRANSLATE_API_KEY`
- `optional` `EMAIL_FROM`
- `optional` `H2022_REJECTION_CC`
- `optional` `H2022_REJECTION_BCC`
- `optional` `ANTHROPIC_API_KEY`

### Firebase Admin credentials (local/self-hosted contexts)

- `optional` `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `optional` `GOOGLE_APPLICATION_CREDENTIALS`
- `optional` `FIREBASE_SERVICE_ACCOUNT_KEY`
- `optional` `FIREBASE_PROJECT_ID`
- `optional` `FIREBASE_DATABASE_URL`
- `optional` `FIREBASE_STORAGE_BUCKET`
- `optional` `FIREBASE_CONFIG`

## Firebase Functions Secrets

Set these with `firebase functions:secrets:set`.

- `required` `CASPIO_BASE_URL`
- `required` `CASPIO_CLIENT_ID`
- `required` `CASPIO_CLIENT_SECRET`
- `required` `CRON_SECRET`
- `required` `RESEND_API_KEY`
- `required` `CASPIO_WEBHOOK_SECRET`

- `optional` `GOOGLE_DRIVE_CLIENT_ID`
- `optional` `GOOGLE_DRIVE_CLIENT_SECRET`
- `optional` `GOOGLE_SERVICE_ACCOUNT_KEY`
- `legacy` `SENDGRID_API_KEY`

## Desktop / Build Pipeline

- `optional` `DESKTOP_APP_URL`
- `optional` `DESKTOP_UPDATE_URL`
- `optional` `DESKTOP_SHOW_DEBUG`
- `optional` `DESKTOP_INSTALLER_VERSION`
- `optional` `CALAIM_DESKTOP_URL`

- `optional` `APPLE_ID`
- `optional` `APPLE_APP_SPECIFIC_PASSWORD`
- `optional` `APPLE_TEAM_ID`

## HIPAA-Oriented Security Defaults

- Generate `CRON_SECRET` and `CASPIO_WEBHOOK_SECRET` as high-entropy random values (at least 32 bytes).
- Store all sensitive values in Firebase/App Hosting secrets, not in committed files.
- Rotate keys/secrets on schedule and after incidents.
- Restrict secret access to minimum required service identities.
- Keep production and non-production secrets fully separated.

## Setup Commands

### Firebase Functions secrets

```bash
firebase functions:secrets:set CASPIO_BASE_URL
firebase functions:secrets:set CASPIO_CLIENT_ID
firebase functions:secrets:set CASPIO_CLIENT_SECRET
firebase functions:secrets:set CRON_SECRET
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set CASPIO_WEBHOOK_SECRET
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_ID
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_SECRET
firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_KEY
```

Optional legacy support:

```bash
firebase functions:secrets:set SENDGRID_API_KEY
```

### Firebase App Hosting secrets

These are mapped in `apphosting.yaml`.

```bash
firebase apphosting:secrets:set CASPIO_BASE_URL
firebase apphosting:secrets:set CASPIO_CLIENT_ID
firebase apphosting:secrets:set CASPIO_CLIENT_SECRET
firebase apphosting:secrets:set CASPIO_TABLE_NAME
firebase apphosting:secrets:set RESEND_API_KEY
firebase apphosting:secrets:set CRON_SECRET
firebase apphosting:secrets:set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
firebase apphosting:secrets:set GOOGLE_API_KEY
```

If your Firebase CLI version does not support App Hosting secret commands yet, set the same values directly in the App Hosting backend secret configuration in Firebase Console.
