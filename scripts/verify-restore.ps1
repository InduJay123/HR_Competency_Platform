param([Parameter(Mandatory=$true)][string]$Backup)
$ErrorActionPreference = 'Stop'
$bflRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupPath = (Resolve-Path -LiteralPath $Backup).Path
$expectedDir = [IO.Path]::GetFullPath((Join-Path $bflRoot 'backups')) + [IO.Path]::DirectorySeparatorChar
if (-not $backupPath.StartsWith($expectedDir,[StringComparison]::OrdinalIgnoreCase)) { throw 'Use a backup inside this project backups directory.' }
$verifyDb = 'bfl_restore_' + (Get-Date -Format 'yyyyMMddHHmmss')
if ($verifyDb -notmatch '^bfl_restore_[0-9]{14}$') { throw 'Invalid verification database name.' }
$created = $false
Push-Location $bflRoot
try {
    docker compose cp $backupPath db:/tmp/bfl-restore.dump
    if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed.' }
    docker compose exec -T db createdb -U bfl $verifyDb
    if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated verification database.' }
    $created = $true
    docker compose exec -T db pg_restore -U bfl --exit-on-error -d $verifyDb /tmp/bfl-restore.dump
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
    docker compose exec -T db psql -U bfl -d $verifyDb -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS migrations FROM django_migrations; SELECT COUNT(*) AS companies FROM companies_company; SELECT COUNT(*) AS tasks FROM tasks_workitem; SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname;'
    if ($LASTEXITCODE -ne 0) { throw 'Restored database verification failed.' }
    Write-Output 'Restore smoke check passed in an isolated database. The active database was not changed.'
} finally {
    if ($created -and $verifyDb -match '^bfl_restore_[0-9]{14}$') {
        docker compose exec -T db dropdb -U bfl $verifyDb
    }
    Pop-Location
}
