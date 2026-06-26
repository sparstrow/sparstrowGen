# Daily off-laptop backup: a consistent DB snapshot (WAL folded in) + push the
# vault repo (markdown notes + the DB snapshot) to the private backup repo.
# Pushes over the github-agent SSH key (no passphrase, non-interactive).
# Register with Task Scheduler to run daily. Runs as the logged-in user so it
# can use ~/.ssh.

$ErrorActionPreference = 'Stop'
$gen    = 'C:\Sparstrow\Sparstrowgen'
$vault  = 'C:\Sparstrow\memory'
$dbDest = 'C:/Sparstrow/memory/.db-backup/sparstrow.db'

# 1) Consistent DB snapshot into the vault's (watcher-ignored) .db-backup/ folder.
Set-Location $gen
node packages/core/scripts/backup-db.mjs 'data/sparstrow.db' $dbDest
if ($LASTEXITCODE -ne 0) { throw "DB snapshot failed (exit $LASTEXITCODE)" }

# 2) Commit + push the vault repo if anything changed.
Set-Location $vault
git add -A
if (git status --porcelain) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm'
  git commit -q -m "chore: daily backup $ts"
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE)" }
  Write-Output "backup pushed: $ts"
} else {
  Write-Output "no changes to back up"
}
