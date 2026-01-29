# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.
# Trigger deployment

## Desktop App (Electron)

The desktop wrapper provides a system tray and business-hours notifications.

### Run (local)
- `npm install` in the repo root
- `npm install` in `desktop/`
- `npm run desktop:dev`

### Configure URL
- Production URL defaults to `https://connectcalaim.com`
- Override with `CALAIM_DESKTOP_URL`

### Business hours
- Auto-silent outside 12–8 ET
- Staff can pause/resume notifications from the tray or in the app settings
