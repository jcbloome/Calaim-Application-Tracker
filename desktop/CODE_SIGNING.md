## Windows Code Signing

Electron-builder supports Windows code signing via environment variables. This helps avoid
SmartScreen warnings when users run the installer.

### Required Environment Variables

- `CSC_LINK`: Path to the `.pfx`/`.p12` certificate file, or a base64-encoded certificate.
- `CSC_KEY_PASSWORD`: Password for the certificate.

### Example (PowerShell)

```powershell
$env:CSC_LINK = "C:\path\to\codesign.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
npm run desktop:dist:win
```

### Notes

- Keep certificates out of the repo.
- If `CSC_LINK` is not set, the installer will be unsigned.
- Use a trusted EV certificate to minimize SmartScreen prompts.

## macOS signing + notarization

If mac installers are unsigned or not notarized, Gatekeeper can show "app is damaged and can't be opened."

### Required Environment Variables

- `CSC_LINK`: Developer ID Application certificate (`.p12`) path or base64.
- `CSC_KEY_PASSWORD`: Password for the certificate.
- `APPLE_ID`: Apple ID email with notarization access.
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

### Build behavior

- `desktop/package.json` uses hardened runtime and entitlements.
- `afterSign` runs `scripts/notarize.js` and notarizes the mac app when the Apple vars above are present.
- CI workflows now validate required mac secrets before publishing release artifacts.

### Local workaround for already-downloaded unsigned app

If you need to open an older unsigned build on macOS:

```bash
xattr -dr com.apple.quarantine "/Applications/Connect CalAIM Desktop.app"
```

Use this only as a temporary workaround; proper fix is signed + notarized release artifacts.
