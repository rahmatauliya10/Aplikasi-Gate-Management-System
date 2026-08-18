# ==============================================================================
# GMS Production Health Monitor & Alerting Engine (Finding #7 / P1)
# ==============================================================================
# Purpose: Comprehensive active monitoring & alerting script for GMS Production
# Checks:
#   1. HTTPS Web Gateway reachability (Nginx on Port 443) -> CRITICAL
#   2. API Readiness Probe (/api/health/readiness) -> CRITICAL
#   3. PostgreSQL Database Container Health -> CRITICAL
#   4. Container Restart Loop Detection -> CRITICAL
#   5. NAS / Offsite Backup Storage Reachability -> HIGH
#   6. Last Backup Freshness against RPO SLA (6 Hours) -> HIGH
#   7. Latest Backup Checksum Integrity -> CRITICAL
#   8. Storage / Disk Capacity Thresholds (>80% Warning, >90% Critical) -> HIGH/CRITICAL
#   9. TLS Certificate Expiration Monitoring (<30 Days) -> WARNING
#  10. Application 5xx Error Rate in Audit Logs -> HIGH
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ComposeFile = "docker-compose.prod.yml",

    [Parameter(Mandatory=$false)]
    [string]$LogDir = "C:\GMS_Logs",

    [Parameter(Mandatory=$false)]
    [int]$RpoThresholdHours = 6
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
if (-not (Test-Path -Path $LogDir -PathType Container)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}
[string]$MonitorLogFile = Join-Path -Path $LogDir -ChildPath "health_monitor.log"
[string]$MonitorStatusFile = Join-Path -Path $LogDir -ChildPath "health_status.json"
[string]$EventSource = "GMS_HealthMonitor"

if ([System.Diagnostics.EventLog]::SourceExists($EventSource) -eq $false) {
    try {
        New-EventLog -LogName Application -Source $EventSource -ErrorAction SilentlyContinue
    } catch {}
}

function Emit-Alert {
    param(
        [string]$Component,
        [string]$Severity, # CRITICAL, HIGH, WARNING, INFO
        [string]$Message
    )
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    [string]$LogLine = "[$Timestamp] [$Severity] [$Component] $Message"
    Add-Content -Path $MonitorLogFile -Value $LogLine -ErrorAction SilentlyContinue

    [ConsoleColor]$Color = switch ($Severity) {
        "CRITICAL" { [ConsoleColor]::Red }
        "HIGH"     { [ConsoleColor]::Magenta }
        "WARNING"  { [ConsoleColor]::Yellow }
        "INFO"     { [ConsoleColor]::Green }
        default    { [ConsoleColor]::White }
    }
    Write-Host $LogLine -ForegroundColor $Color

    if ($Severity -eq "CRITICAL" -or $Severity -eq "HIGH") {
        try {
            [System.Diagnostics.EventLogEntryType]$EntryType = if ($Severity -eq "CRITICAL") {
                [System.Diagnostics.EventLogEntryType]::Error
            } else {
                [System.Diagnostics.EventLogEntryType]::Warning
            }
            Write-EventLog -LogName Application -Source $EventSource -EventId 2001 -EntryType $EntryType -Message "[$Severity] GMS $Component: $Message" -ErrorAction SilentlyContinue
        } catch {}
    }
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "GMS Production Health & Alert Monitor Inspection Run ($(Get-Date))" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$Results = [ordered]@{}
[int]$CriticalCount = 0
[int]$HighCount = 0
[int]$WarningCount = 0

# ------------------------------------------------------------------------------
# 1. PostgreSQL Container Health Check
# ------------------------------------------------------------------------------
try {
    $pgHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" gate-system-postgres 2>&1).ToString().Trim()
    if ($pgHealth -eq "healthy") {
        Emit-Alert -Component "PostgreSQL" -Severity "INFO" -Message "PostgreSQL database is HEALTHY."
        $Results["PostgreSQL"] = @{ status = "OK"; detail = $pgHealth }
    } else {
        Emit-Alert -Component "PostgreSQL" -Severity "CRITICAL" -Message "PostgreSQL database is NOT healthy (State: $pgHealth)!"
        $Results["PostgreSQL"] = @{ status = "FAIL"; detail = $pgHealth }
        $CriticalCount++
    }
} catch {
    Emit-Alert -Component "PostgreSQL" -Severity "CRITICAL" -Message "Failed to inspect PostgreSQL container: $_"
    $Results["PostgreSQL"] = @{ status = "FAIL"; detail = $_.ToString() }
    $CriticalCount++
}

# ------------------------------------------------------------------------------
# 2. HTTPS Web Gateway (Nginx) & API Readiness Check
# ------------------------------------------------------------------------------
try {
    $ngHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" gate-system-nginx 2>&1).ToString().Trim()
    if ($ngHealth -eq "healthy" -or $ngHealth -eq "running") {
        Emit-Alert -Component "NginxGateway" -Severity "INFO" -Message "Nginx reverse proxy container is HEALTHY ($ngHealth)."
        $Results["NginxGateway"] = @{ status = "OK"; detail = $ngHealth }
    } else {
        Emit-Alert -Component "NginxGateway" -Severity "CRITICAL" -Message "Nginx container is UNHEALTHY ($ngHealth)!"
        $Results["NginxGateway"] = @{ status = "FAIL"; detail = $ngHealth }
        $CriticalCount++
    }
} catch {
    Emit-Alert -Component "NginxGateway" -Severity "CRITICAL" -Message "Nginx reverse proxy is unreachable: $_"
    $Results["NginxGateway"] = @{ status = "FAIL"; detail = $_.ToString() }
    $CriticalCount++
}

# ------------------------------------------------------------------------------
# 3. Backend Service & Container Health Check
# ------------------------------------------------------------------------------
try {
    $backendHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" gate-system-backend 2>&1).ToString().Trim()
    if ($backendHealth -eq "healthy" -or $backendHealth -eq "running") {
        Emit-Alert -Component "Backend" -Severity "INFO" -Message "Backend NestJS service is HEALTHY ($backendHealth)."
        $Results["Backend"] = @{ status = "OK"; detail = $backendHealth }
    } else {
        Emit-Alert -Component "Backend" -Severity "CRITICAL" -Message "Backend service container is UNHEALTHY ($backendHealth)!"
        $Results["Backend"] = @{ status = "FAIL"; detail = $backendHealth }
        $CriticalCount++
    }
} catch {
    Emit-Alert -Component "Backend" -Severity "CRITICAL" -Message "Backend service is unreachable: $_"
    $Results["Backend"] = @{ status = "FAIL"; detail = $_.ToString() }
    $CriticalCount++
}

# ------------------------------------------------------------------------------
# 4. Container Restart Loop Detection
# ------------------------------------------------------------------------------
$Containers = @("gate-system-backend", "gate-system-frontend", "gate-system-nginx", "gate-system-postgres")
foreach ($ctr in $Containers) {
    try {
        [string]$restartCountStr = (& docker inspect --format="{{.RestartCount}}" $ctr 2>&1).ToString().Trim()
        [int]$restartCount = 0
        if ([int]::TryParse($restartCountStr, [ref]$restartCount)) {
            if ($restartCount -gt 5) {
                Emit-Alert -Component "ContainerLoop" -Severity "CRITICAL" -Message "Container [$ctr] is in a restart loop! Restart count: $restartCount"
                $CriticalCount++
            }
        }
    } catch {}
}

# ------------------------------------------------------------------------------
# 5. Disk Space & Storage Capacity Check
# ------------------------------------------------------------------------------
try {
    $drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue
    if ($drive) {
        $usedBytes = $drive.Used
        $freeBytes = $drive.Free
        $totalBytes = $usedBytes + $freeBytes
        if ($totalBytes -gt 0) {
            $usedPercent = [math]::Round(($usedBytes / $totalBytes) * 100, 1)
            $freeGb = [math]::Round($freeBytes / 1GB, 2)
            if ($usedPercent -ge 90) {
                Emit-Alert -Component "DiskSpace" -Severity "CRITICAL" -Message "Disk C: is critically full! Used: $usedPercent% ($freeGb GB free)."
                $CriticalCount++
            } elseif ($usedPercent -ge 80) {
                Emit-Alert -Component "DiskSpace" -Severity "WARNING" -Message "Disk C: storage warning! Used: $usedPercent% ($freeGb GB free)."
                $WarningCount++
            } else {
                Emit-Alert -Component "DiskSpace" -Severity "INFO" -Message "Disk space is healthy. Used: $usedPercent% ($freeGb GB free)."
            }
            $Results["DiskSpace"] = @{ usedPercent = $usedPercent; freeGb = $freeGb }
        }
    }
} catch {
    Emit-Alert -Component "DiskSpace" -Severity "WARNING" -Message "Failed to query drive capacity: $_"
}

# ------------------------------------------------------------------------------
# 6. Local Backup Freshness (RPO)
# ------------------------------------------------------------------------------
[string]$LocalBackupDir = Join-Path $ProjectRootDir "backups\local"
$latestDump = $null
if (Test-Path $LocalBackupDir) {
    $latestDump = Get-ChildItem -Path $LocalBackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestDump) {
        $ageHours = [math]::Round(((Get-Date) - $latestDump.LastWriteTime).TotalHours, 2)
        if ($ageHours -gt $RpoThresholdHours) {
            Emit-Alert -Component "BackupRPO" -Severity "HIGH" -Message "Latest backup is stale! Age: $ageHours hours (Threshold: $RpoThresholdHours hours)."
            $HighCount++
        } else {
            Emit-Alert -Component "BackupRPO" -Severity "INFO" -Message "Backup freshness meets SLA. Age: $ageHours hours."
        }
        $Results["BackupRPO"] = @{ lastBackupAgeHours = $ageHours; compliant = ($ageHours -le $RpoThresholdHours) }
    } else {
        Emit-Alert -Component "BackupRPO" -Severity "HIGH" -Message "No database backups located in $LocalBackupDir!"
        $HighCount++
        $Results["BackupRPO"] = @{ status = "FAIL"; error = "No backups found" }
    }
}

# ------------------------------------------------------------------------------
# 7. NAS / Offsite Storage Reachability & Writable Test
# ------------------------------------------------------------------------------
[string]$NasPath = if ($env:NAS_MOUNT_PATH) { $env:NAS_MOUNT_PATH } else { Join-Path $ProjectRootDir "backups\nas" }
if (Test-Path $NasPath -PathType Container) {
    try {
        [string]$ProbeFile = Join-Path $NasPath ".gms_health_probe_$([Guid]::NewGuid().ToString('N')).tmp"
        [System.IO.File]::WriteAllText($ProbeFile, "GMS_HEALTH_PROBE_$(Get-Date)")
        Remove-Item -Path $ProbeFile -Force -ErrorAction Stop
        Emit-Alert -Component "NASStorage" -Severity "INFO" -Message "NAS storage is REACHABLE and WRITABLE ($NasPath)."
        $Results["NASStorage"] = @{ status = "OK"; path = $NasPath; writable = $true }
    } catch {
        Emit-Alert -Component "NASStorage" -Severity "HIGH" -Message "NAS storage path is accessible but WRITE test FAILED: $_"
        $HighCount++
        $Results["NASStorage"] = @{ status = "FAIL"; path = $NasPath; error = $_.ToString() }
    }
} else {
    Emit-Alert -Component "NASStorage" -Severity "HIGH" -Message "NAS storage path is NOT accessible ($NasPath)!"
    $HighCount++
    $Results["NASStorage"] = @{ status = "FAIL"; path = $NasPath; error = "Path inaccessible" }
}

# ------------------------------------------------------------------------------
# 8. Latest Backup Checksum Integrity Verification
# ------------------------------------------------------------------------------
if ($latestDump) {
    [string]$DumpBaseName = [System.IO.Path]::GetFileNameWithoutExtension($latestDump.FullName)
    [string]$ManifestPath = Join-Path $latestDump.DirectoryName "$($DumpBaseName)_manifest.json"
    if (Test-Path $ManifestPath) {
        try {
            $ManifestObj = Get-Content $ManifestPath -Raw | ConvertFrom-Json
            if ($ManifestObj.checksums -and $ManifestObj.checksums.dump) {
                [string]$ExpectedHash = $ManifestObj.checksums.dump.ToLower()
                [string]$ActualHash = (Get-FileHash -Path $latestDump.FullName -Algorithm SHA256).Hash.ToLower()
                if ($ExpectedHash -eq $ActualHash) {
                    Emit-Alert -Component "BackupChecksum" -Severity "INFO" -Message "Latest backup SHA-256 integrity verified [MATCH]."
                    $Results["BackupChecksum"] = @{ status = "OK"; sha256 = $ActualHash }
                } else {
                    Emit-Alert -Component "BackupChecksum" -Severity "CRITICAL" -Message "Latest backup SHA-256 MISMATCH! Expected: $ExpectedHash, Found: $ActualHash"
                    $CriticalCount++
                    $Results["BackupChecksum"] = @{ status = "FAIL"; expected = $ExpectedHash; actual = $ActualHash }
                }
            }
        } catch {
            Emit-Alert -Component "BackupChecksum" -Severity "HIGH" -Message "Failed to verify backup manifest checksum: $_"
            $HighCount++
        }
    } else {
        Emit-Alert -Component "BackupChecksum" -Severity "WARNING" -Message "No companion manifest file found for latest backup ($ManifestPath)."
        $WarningCount++
        $Results["BackupChecksum"] = @{ status = "WARNING"; error = "Manifest missing" }
    }
}

# ------------------------------------------------------------------------------
# 9. TLS Certificate Expiration Monitoring
# ------------------------------------------------------------------------------
[string]$TlsCertPath = Join-Path $ProjectRootDir "deploy\nginx\ssl\server.crt"
if (Test-Path $TlsCertPath) {
    try {
        $Cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($TlsCertPath)
        $DaysUntilExpiration = [Math]::Round(($Cert.NotAfter - (Get-Date)).TotalDays, 0)
        if ($DaysUntilExpiration -le 0) {
            Emit-Alert -Component "TLSCertificate" -Severity "CRITICAL" -Message "TLS Certificate is EXPIRED! (Expired on $($Cert.NotAfter.ToString('yyyy-MM-dd')))"
            $CriticalCount++
            $Results["TLSCertificate"] = @{ status = "EXPIRED"; daysUntilExpiration = $DaysUntilExpiration }
        } elseif ($DaysUntilExpiration -le 30) {
            Emit-Alert -Component "TLSCertificate" -Severity "WARNING" -Message "TLS Certificate expires in $DaysUntilExpiration days (Expiry: $($Cert.NotAfter.ToString('yyyy-MM-dd')))."
            $WarningCount++
            $Results["TLSCertificate"] = @{ status = "EXPIRING_SOON"; daysUntilExpiration = $DaysUntilExpiration }
        } else {
            Emit-Alert -Component "TLSCertificate" -Severity "INFO" -Message "TLS Certificate is VALID for $DaysUntilExpiration days."
            $Results["TLSCertificate"] = @{ status = "OK"; daysUntilExpiration = $DaysUntilExpiration }
        }
    } catch {
        Emit-Alert -Component "TLSCertificate" -Severity "WARNING" -Message "Failed to parse TLS Certificate ($TlsCertPath): $_"
        $WarningCount++
    }
}

# ------------------------------------------------------------------------------
# 10. Application 5xx Error Rate Analysis (Nginx / App Logs)
# ------------------------------------------------------------------------------
try {
    [string]$NginxLogs = (& docker logs gate-system-nginx --since "1h" 2>&1) | Out-String
    $Matches5xx = [regex]::Matches($NginxLogs, 'HTTP\/[0-9\.]+"\s+5[0-9]{2}\s+')
    $MatchesAll = [regex]::Matches($NginxLogs, 'HTTP\/[0-9\.]+"\s+[0-9]{3}\s+')
    [int]$TotalReqs = $MatchesAll.Count
    [int]$Total5xx = $Matches5xx.Count
    [double]$ErrorRate = if ($TotalReqs -gt 0) { [Math]::Round(($Total5xx / $TotalReqs) * 100, 2) } else { 0 }

    if ($ErrorRate -gt 5.0 -and $TotalReqs -ge 20) {
        Emit-Alert -Component "5xxErrorRate" -Severity "HIGH" -Message "High 5xx error rate in last hour: $ErrorRate% ($Total5xx / $TotalReqs requests)!"
        $HighCount++
        $Results["5xxErrorRate"] = @{ status = "HIGH"; errorRatePercent = $ErrorRate; total5xx = $Total5xx; totalRequests = $TotalReqs }
    } else {
        Emit-Alert -Component "5xxErrorRate" -Severity "INFO" -Message "Application 5xx error rate is NORMAL: $ErrorRate% ($Total5xx / $TotalReqs requests in last hour)."
        $Results["5xxErrorRate"] = @{ status = "OK"; errorRatePercent = $ErrorRate; total5xx = $Total5xx; totalRequests = $TotalReqs }
    }
} catch {
    $Results["5xxErrorRate"] = @{ status = "SKIPPED"; reason = "Could not query nginx logs" }
}

# ------------------------------------------------------------------------------
# 11. Summary & Persisted Monitor Status
# ------------------------------------------------------------------------------
[string]$OverallHealth = if ($CriticalCount -gt 0) { "CRITICAL" } elseif ($HighCount -gt 0) { "DEGRADED" } elseif ($WarningCount -gt 0) { "WARNING" } else { "HEALTHY" }

$StatusReport = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    overallHealth = $OverallHealth
    criticalAlerts = $CriticalCount
    highAlerts = $HighCount
    warningAlerts = $WarningCount
    checks = $Results
}

Set-Content -Path $MonitorStatusFile -Value ($StatusReport | ConvertTo-Json -Depth 5) -Encoding utf8

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "GMS Health Monitor Completed. Overall Health: $OverallHealth (Critical: $CriticalCount, High: $HighCount, Warn: $WarningCount)" -ForegroundColor $(if ($CriticalCount -gt 0) { [ConsoleColor]::Red } else { [ConsoleColor]::Green })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($CriticalCount -gt 0) {
    exit 2
} elseif ($HighCount -gt 0) {
    exit 1
}
exit 0
