$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '_tmp_commit_isp_log.txt'
Set-Location $PSScriptRoot
function Log($m) { Add-Content -Path $log -Value $m; Write-Output $m }
'' | Set-Content -Path $log

Log '=== git status ==='
git status 2>&1 | ForEach-Object { Log $_ }

Log '=== git diff --stat ==='
git diff --stat 2>&1 | ForEach-Object { Log $_ }

Log '=== git log -5 --oneline ==='
git log -5 --oneline 2>&1 | ForEach-Object { Log $_ }

$files = @(
  'src/app/admin/tools/isp-tracker/page.tsx',
  'src/app/api/alft/assignment/remove-from-tracker/route.ts',
  'src/app/api/alft/assignment/restore-to-tracker/route.ts',
  'handoff.md'
)
git add -- $files
if ($LASTEXITCODE -ne 0) { Log "git add failed: $LASTEXITCODE"; exit 1 }

git commit -m "fix: keep ISP Tracker soft-deletes sticky" -m "Deleted invite members no longer reappear from historical swEmailDeliveryLog sent status. Loader hides soft-deletes unless a new invite was sent after removal; remove/restore APIs update ispTrackerSoftDeleted and related invite flags."
if ($LASTEXITCODE -ne 0) { Log "main commit failed: $LASTEXITCODE"; exit 1 }

$hash = (git rev-parse --short HEAD).Trim()
Log "MAIN_HASH=$hash"

$handoff = Get-Content -Path 'handoff.md' -Raw
$updated = $handoff.Replace('Commit: _pending_.', "Commit: ``$hash``.")
if ($updated -eq $handoff) { Log 'handoff pending marker not found'; exit 1 }
Set-Content -Path 'handoff.md' -Value $updated -NoNewline

git add -- handoff.md
git commit -m "handoff: record commit $hash"
if ($LASTEXITCODE -ne 0) { Log "handoff commit failed: $LASTEXITCODE"; exit 1 }

$hash2 = (git rev-parse --short HEAD).Trim()
Log "HANDOFF_HASH=$hash2"

Log '=== git push ==='
git push origin HEAD 2>&1 | ForEach-Object { Log $_ }
Log "PUSH_EXIT=$LASTEXITCODE"

Log '=== final status ==='
git status 2>&1 | ForEach-Object { Log $_ }
Log 'DONE'
