$ErrorActionPreference = 'Stop'
$bflRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupDir = Join-Path $bflRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupDir "bfl-$stamp.dump"
Push-Location $bflRoot
try {
    docker compose exec -T db pg_dump -U bfl -d bfl -Fc -f /tmp/bfl-backup.dump
    if ($LASTEXITCODE -ne 0) { throw 'Database dump failed.' }
    docker compose cp db:/tmp/bfl-backup.dump $backupPath
    if ($LASTEXITCODE -ne 0) { throw 'Copying backup failed.' }
    Write-Output $backupPath
} finally { Pop-Location }
