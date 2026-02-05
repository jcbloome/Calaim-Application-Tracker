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
