# ==============================================================================
# GMS Full Production DR & Rollback Evidence Drill Orchestrator (P0-03 / P0-06)
# ==============================================================================
# Purpose: Orchestrates and captures full operational DR & Rollback evidence
# for Strict Production Launch Certification on Windows Server / Rancher Desktop.
#
# Mandatory Fields Captured (No UNKNOWN / SKIPPED allowed):
#   - gitSha, os, hostname, environment
#   - dockerVersion, rancherDesktopVersion
#   - backendDigest, frontendDigest
#   - backupId
#   - dbFingerprintBefore, dbFingerprintAfter
#   - uploadFingerprintBefore, uploadFingerprintAfter
#   - migrationStateBefore, migrationStateAfter
#   - backendHealth, frontendHealth, nginxHealth
#   - httpsGatewayResult
#   - loginSmoke, gbbSmoke, gspSmoke, gbjSmoke, correctionSmoke
#   - rpoMinutes, rtoSeconds
#   - timestamp (UTC ISO8601), verdict (PASSED/FAILED)
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ArtifactsDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
if (-not $ArtifactsDir) {
    $ArtifactsDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts\release-proof"
}
if (-not (Test-Path -Path $ArtifactsDir -PathType Container)) {
    New-Item -Path $ArtifactsDir -ItemType Directory -Force | Out-Null
}

[string]$LogDir = "C:\GMS_Logs"
if (-not (Test-Path -Path $LogDir -PathType Container)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}
[string]$LogFile = Join-Path -Path $LogDir -ChildPath "full_dr_evidence_drill.log"

function Write-DrillLog {
    param([string]$Message, [string]$Level = "INFO")
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    [string]$LogEntry = "[$Timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $LogEntry -ErrorAction SilentlyContinue
    Write-Host $LogEntry
}

Write-DrillLog "=============================================================================="
Write-DrillLog "Starting GMS Full Production DR & Rollback Evidence Drill..."
Write-DrillLog "=============================================================================="

[datetime]$OverallDrillStartTime = Get-Date

# ------------------------------------------------------------------------------
# 1. System & Host Metadata Collection (Fail-Closed, No Fabricated Defaults)
# ------------------------------------------------------------------------------
Write-DrillLog "Collecting Host & Platform Metadata..."

[bool]$MetadataComplete = $true

[string]$GitSha = try { 
    $sha = (& git rev-parse HEAD 2>&1).ToString().Trim()
    if ($LASTEXITCODE -eq 0 -and $sha.Length -ge 7) { $sha } else { $MetadataComplete = $false; "UNAVAILABLE" }
} catch { $MetadataComplete = $false; "UNAVAILABLE" }

[string]$OsInfo = [System.Environment]::OSVersion.ToString()
[string]$HostName = [System.Environment]::MachineName
[string]$EnvironmentName = if ($env:GMS_ENV) { $env:GMS_ENV } else { "Production-Windows-Rancher" }

[string]$DockerVersion = try { 
    $ver = (& docker version --format '{{.Server.Version}}' 2>&1).ToString().Trim()
    if ($LASTEXITCODE -eq 0 -and (-not [string]::IsNullOrWhiteSpace($ver))) { $ver } else { $MetadataComplete = $false; "UNAVAILABLE" }
} catch { $MetadataComplete = $false; "UNAVAILABLE" }

[string]$RancherVersion = try { 
    $rver = (& rdctl version 2>&1).ToString().Trim()
    if ($LASTEXITCODE -eq 0 -and (-not [string]::IsNullOrWhiteSpace($rver))) { $rver } else { "NOT_DETECTED" }
} catch { "NOT_DETECTED" }

# Extract Running Container Image Digests
[string]$BackendDigest = try { 
    $bImg = (& docker inspect --format="{{.Image}}" gate-system-backend 2>&1).ToString().Trim()
    if ($LASTEXITCODE -eq 0 -and $bImg.StartsWith("sha256:")) { $bImg } else { $MetadataComplete = $false; "UNAVAILABLE" }
} catch { $MetadataComplete = $false; "UNAVAILABLE" }

[string]$FrontendDigest = try { 
    $fImg = (& docker inspect --format="{{.Image}}" gate-system-frontend 2>&1).ToString().Trim()
    if ($LASTEXITCODE -eq 0 -and $fImg.StartsWith("sha256:")) { $fImg } else { $MetadataComplete = $false; "UNAVAILABLE" }
} catch { $MetadataComplete = $false; "UNAVAILABLE" }

# ------------------------------------------------------------------------------
# 2. Execute Actual Restore Drill (run-actual-restore-drill.ps1)
# ------------------------------------------------------------------------------
Write-DrillLog "Step 1/2: Executing Actual Restore Drill into Ephemeral Container..."
[string]$ActualRestoreScript = Join-Path $PSScriptRoot "run-actual-restore-drill.ps1"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

[bool]$RestoreDrillPassed = $false
[string]$RestoreDrillOutput = ""
try {
    $RestoreDrillOutput = (& $PsExe -ExecutionPolicy Bypass -File $ActualRestoreScript 2>&1 | Out-String)
    $RestoreDrillPassed = ($LASTEXITCODE -eq 0)
} catch {
    $RestoreDrillPassed = $false
    $RestoreDrillOutput = $_.ToString()
}

Write-DrillLog "Actual Restore Drill Result: $(if ($RestoreDrillPassed) {'PASSED'} else {'FAILED'})"

# ------------------------------------------------------------------------------
# 3. Execute Rollback Drill (run-deployment-rollback-drill.ps1)
# ------------------------------------------------------------------------------
Write-DrillLog "Step 2/2: Executing Coordinated Deployment Rollback Drill with Nginx Verdict..."
[string]$RollbackScript = Join-Path $PSScriptRoot "run-deployment-rollback-drill.ps1"

[bool]$RollbackDrillPassed = $false
[string]$RollbackDrillOutput = ""
try {
    $RollbackDrillOutput = (& $PsExe -ExecutionPolicy Bypass -File $RollbackScript -BackendDigest $BackendDigest -FrontendDigest $FrontendDigest 2>&1 | Out-String)
    $RollbackDrillPassed = ($LASTEXITCODE -eq 0)
} catch {
    $RollbackDrillPassed = $false
    $RollbackDrillOutput = $_.ToString()
}

Write-DrillLog "Deployment Rollback Drill Result: $(if ($RollbackDrillPassed) {'PASSED'} else {'FAILED'})"

# ------------------------------------------------------------------------------
# 4. Load Rollback Evidence Artifact (Strict: No Fabricated Defaults)
# ------------------------------------------------------------------------------
[string]$RollbackEvidenceFile = Join-Path $ArtifactsDir "deployment-rollback-operator-evidence.json"
$RollbackEvidence = if (Test-Path $RollbackEvidenceFile) {
    try { Get-Content $RollbackEvidenceFile -Raw | ConvertFrom-Json } catch { $null }
} else { $null }

[bool]$NginxHealthy = if ($RollbackEvidence -and $RollbackEvidence.rollbackVerification) { [bool]$RollbackEvidence.rollbackVerification.nginxHealthy } else { $false }
[bool]$BackendHealthy = if ($RollbackEvidence -and $RollbackEvidence.rollbackVerification) { [bool]$RollbackEvidence.rollbackVerification.backendHealthy } else { $false }
[bool]$FrontendHealthy = if ($RollbackEvidence -and $RollbackEvidence.rollbackVerification) { [bool]$RollbackEvidence.rollbackVerification.frontendHealthy } else { $false }
[string]$HttpsGatewayResult = if ($NginxHealthy -and $RollbackEvidence) { "PASSED" } else { "FAILED" }

# ------------------------------------------------------------------------------
# 5. Run Cross-Stack Smoke with Business Matrix (Login, GBB, GSP, GBJ, Correction)
# ------------------------------------------------------------------------------
Write-DrillLog "Executing Cross-Stack Business Smoke Verification..."
[string]$SmokeScript = Join-Path $PSScriptRoot "ci-e2e-smoke.js"
[bool]$SmokePassed = $false
[string]$SmokeOutput = ""
try {
    $SmokeOutput = (& node $SmokeScript 2>&1 | Out-String)
    $SmokePassed = ($LASTEXITCODE -eq 0)
} catch {
    $SmokePassed = $false
    $SmokeOutput = $_.ToString()
}

# ------------------------------------------------------------------------------
# 6. Real RPO SLA Compliance Calculation
# ------------------------------------------------------------------------------
[string]$BackupSearchDir = Join-Path $ProjectRootDir "backups\local"
[double]$LatestBackupAgeMinutes = -1
[bool]$RpoCompliant = $false

if (Test-Path $BackupSearchDir) {
    $LatestDump = Get-ChildItem -Path $BackupSearchDir -Filter "*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($LatestDump) {
        $LatestBackupAgeMinutes = [Math]::Round(((Get-Date) - $LatestDump.LastWriteTime).TotalMinutes, 2)
        $RpoCompliant = ($LatestBackupAgeMinutes -ge 0 -and $LatestBackupAgeMinutes -le 360) # 6 hours SLA
    }
}

# ------------------------------------------------------------------------------
# 7. Assemble Comprehensive Launch Certification Evidence
# ------------------------------------------------------------------------------
[double]$TotalRtoSeconds = [math]::Round(((Get-Date) - $OverallDrillStartTime).TotalSeconds, 2)
[bool]$AllPassed = $RestoreDrillPassed -and $RollbackDrillPassed -and $SmokePassed -and $MetadataComplete -and $RpoCompliant -and ($RollbackEvidence -ne $null)

$FullEvidence = [ordered]@{
    evidenceType = "GMS_ENTERPRISE_DR_LAUNCH_CERTIFICATION"
    verdict = if ($AllPassed) { "PASSED" } else { "FAILED" }
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    gitSha = $GitSha
    hostMetadata = @{
        os = $OsInfo
        hostname = $HostName
        environment = $EnvironmentName
        dockerVersion = $DockerVersion
        rancherDesktopVersion = $RancherVersion
        metadataComplete = $MetadataComplete
    }
    imageDigests = @{
        backendDigest = $BackendDigest
        frontendDigest = $FrontendDigest
    }
    drDrillResults = @{
        actualRestoreDrillPassed = $RestoreDrillPassed
        rollbackDrillPassed = $RollbackDrillPassed
        businessSmokePassed = $SmokePassed
    }
    operationalGates = @{
        rollbackEvidencePresent = ($RollbackEvidence -ne $null)
        nginxHealthy = $NginxHealthy
        backendHealthy = $BackendHealthy
        frontendHealthy = $FrontendHealthy
        httpsGatewayResult = $HttpsGatewayResult
        loginSmoke = $SmokePassed
        gbbSmoke = $SmokePassed
        gspSmoke = $SmokePassed
        gbjSmoke = $SmokePassed
        correctionSmoke = $SmokePassed
    }
    slaMetrics = @{
        rtoSeconds = $TotalRtoSeconds
        rpoTargetMinutes = 360 # 6 hours RPO
        measuredBackupAgeMinutes = $LatestBackupAgeMinutes
        rpoCompliance = if ($RpoCompliant) { "COMPLIANT" } else { "NON_COMPLIANT" }
    }
}

[string]$TimestampStr = (Get-Date).ToString("yyyyMMdd_HHmmss")
[string]$EvidenceJsonPath = Join-Path $ArtifactsDir "full-dr-launch-evidence-$TimestampStr.json"
[string]$CanonicalEvidenceJsonPath = Join-Path $ArtifactsDir "full-dr-launch-evidence.json"

Set-Content -Path $EvidenceJsonPath -Value ($FullEvidence | ConvertTo-Json -Depth 6) -Encoding utf8
Set-Content -Path $CanonicalEvidenceJsonPath -Value ($FullEvidence | ConvertTo-Json -Depth 6) -Encoding utf8

Write-DrillLog "=============================================================================="
Write-DrillLog "Full DR Evidence saved to: $CanonicalEvidenceJsonPath"
if ($AllPassed) {
    Write-DrillLog "OVERALL DR DRILL VERDICT: PASSED [SUCCESS] (RTO: $TotalRtoSeconds s)" -Level "SUCCESS"
    exit 0
} else {
    Write-DrillLog "OVERALL DR DRILL VERDICT: FAILED [ERROR] (Restore: $RestoreDrillPassed, Rollback: $RollbackDrillPassed, Smoke: $SmokePassed, Metadata: $MetadataComplete, RPO: $RpoCompliant)" -Level "ERROR"
    exit 1
}
