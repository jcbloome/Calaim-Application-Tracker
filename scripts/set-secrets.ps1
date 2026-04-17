param(
  [switch]$IncludeLegacy
)

$ErrorActionPreference = "Stop"

function Set-Secret {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][ValidateSet("functions", "apphosting")][string]$Target
  )

  Write-Host ""
  Write-Host "Setting $Target secret: $Name" -ForegroundColor Cyan
  $value = Read-Host -Prompt "Enter value for $Name"

  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "Skipped $Name (empty input)." -ForegroundColor Yellow
    return
  }

  # Pass value via stdin so it is not persisted in shell history.
  $value | firebase "$Target`:secrets:set" $Name
}

$functionsRequired = @(
  "CASPIO_BASE_URL",
  "CASPIO_CLIENT_ID",
  "CASPIO_CLIENT_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "CASPIO_WEBHOOK_SECRET"
)

$functionsOptional = @(
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_KEY"
)

$legacy = @(
  "SENDGRID_API_KEY"
)

$appHostingRequired = @(
  "CASPIO_BASE_URL",
  "CASPIO_CLIENT_ID",
  "CASPIO_CLIENT_SECRET",
  "CASPIO_TABLE_NAME",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "GOOGLE_API_KEY"
)

Write-Host "CalAIM secret setup helper" -ForegroundColor Green
Write-Host "Make sure you ran: firebase login && firebase use <project-id>" -ForegroundColor DarkYellow

Write-Host "`n=== Firebase Functions (required) ===" -ForegroundColor Green
foreach ($secret in $functionsRequired) { Set-Secret -Name $secret -Target "functions" }

Write-Host "`n=== Firebase Functions (optional) ===" -ForegroundColor Green
foreach ($secret in $functionsOptional) { Set-Secret -Name $secret -Target "functions" }

if ($IncludeLegacy) {
  Write-Host "`n=== Firebase Functions (legacy) ===" -ForegroundColor Green
  foreach ($secret in $legacy) { Set-Secret -Name $secret -Target "functions" }
}

Write-Host "`n=== Firebase App Hosting ===" -ForegroundColor Green
foreach ($secret in $appHostingRequired) { Set-Secret -Name $secret -Target "apphosting" }

Write-Host "`nDone. Redeploy after updates:" -ForegroundColor Green
Write-Host "  firebase deploy --only apphosting,functions"
