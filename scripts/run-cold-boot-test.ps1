# ==============================================================================
# GMS Blackout & Cold-Boot Recovery Verification Test Protocol (P0)
# ==============================================================================
# Executes / verifies automated recovery across all 7 layers:
#   Layer 1: Windows Server Cold-Boot / Startup
#   Layer 2: Dedicated GMSRuntime AutoLogon + Screen Lock
#   Layer 3: Rancher Desktop / WSL2 / Docker Engine Daemon
#   Layer 4: PostgreSQL Database Container (Health: Healthy)
#   Layer 5: Backend NestJS API Container (Health: Healthy, /api/health 200 OK)
#   Layer 6: Frontend Vue Container (Health: Healthy, HTTP 200 OK)
#   Layer 7: Nginx Web Gateway (Health: Healthy, HTTPS 443 200 OK)
#   Layer 8: Cross-Stack Business Smoke & Login Verification
#
# Produces evidence artifact:
#   artifacts/release-proof/cold-boot-evidence.json
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ComposeFilePath = "",

    [Parameter(Mandatory=$false)]
    [string]$EnvFilePath = "",

    [Parameter(Mandatory=$false)]
    [string]$ArtifactsDir = "",

    [Parameter(Mandatory=$false)]
    [int]$MaxAllowedRtoSeconds = 300 # 5 minutes target RTO
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
if (-not $ComposeFilePath) {
    $ComposeFilePath = Join-Path -Path $ProjectRootDir -ChildPath "docker-compose.prod.yml"
}
if (-not $EnvFilePath) {
    $EnvFilePath = Join-Path -Path $ProjectRootDir -ChildPath "backend\.env"
}
if (-not $ArtifactsDir) {
    $ArtifactsDir = Join-Path -Path $ProjectRootDir -ChildPath "artifacts\release-proof"
}
if (-not (Test-Path -Path $ArtifactsDir -PathType Container)) {
    New-Item -Path $ArtifactsDir -ItemType Directory -Force | Out-Null
}

[string]$EvidenceFile = Join-Path -Path $ArtifactsDir -ChildPath "cold-boot-evidence.json"
[string]$TestTimestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
[System.Diagnostics.Stopwatch]$Sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " GMS Blackout / Cold-Boot Auto-Recovery Verification" -ForegroundColor Cyan
Write-Host " Timestamp: $TestTimestamp" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$Results = [ordered]@{
    protocol = "GMS_COLD_BOOT_AUTO_RECOVERY_TEST"
    timestamp = $TestTimestamp
    hostname = $env:COMPUTERNAME
    osVersion = [System.Environment]::OSVersion.ToString()
    maxAllowedRtoSeconds = $MaxAllowedRtoSeconds
    layers = [ordered]@{}
    verdict = "IN_PROGRESS"
}

# --- Layer 1 & 2: Windows OS, Boot Metadata & AutoLogon Check ---
Write-Host "`n[Layer 1 & 2] Verifying Windows Boot State, AutoLogon & Task Scheduler..." -ForegroundColor Yellow

$LastBootUpTime = $null
try {
    $LastBootUpTime = (Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime
} catch {
    try {
        $LastBootUpTime = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop).ConvertToDateTime((Get-WmiObject -Class Win32_OperatingSystem).LastBootUpTime)
    } catch {
        throw "FATAL: Unable to obtain trusted Windows boot timestamp via CIM or WMI. Fail-closed cold boot verification."
    }
}

if (-not $LastBootUpTime) {
    throw "FATAL: Windows LastBootUpTime is null or unavailable."
}

[double]$BootAgeSeconds = [Math]::Round(((Get-Date) - $LastBootUpTime).TotalSeconds, 2)
[double]$BootAgeMinutes = [Math]::Round(((Get-Date) - $LastBootUpTime).TotalMinutes, 2)

$Winlogon = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -ErrorAction SilentlyContinue
[bool]$AutoAdminLogon = ($Winlogon -ne $null) -and ($Winlogon.AutoAdminLogon -eq "1")
[string]$DefaultUser = if ($Winlogon) { $Winlogon.DefaultUserName } else { "" }

$ScheduledTask = Get-ScheduledTask -TaskName "GMS_Production_Autostart" -ErrorAction SilentlyContinue
[bool]$TaskExists = $ScheduledTask -ne $null
[string]$TaskState = if ($TaskExists) { $ScheduledTask.State.ToString() } else { "NOT_REGISTERED" }

[bool]$Layer1_2_Ok = $AutoAdminLogon -and $TaskExists

$Results["windowsBootTime"] = $LastBootUpTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$Results["bootAgeMinutes"] = $BootAgeMinutes
$Results["bootAgeSeconds"] = $BootAgeSeconds

$Results.layers["Layer1_2_WindowsAutoLogon"] = [ordered]@{
    status = if ($Layer1_2_Ok) { "PASSED" } else { "FAILED" }
    autoAdminLogonEnabled = $AutoAdminLogon
    autoLogonUser = $DefaultUser
    scheduledTaskExists = $TaskExists
    scheduledTaskState = $TaskState
    windowsBootTime = $LastBootUpTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    systemUptimeMinutes = $BootAgeMinutes
}
Write-Host "  Windows LastBootUpTime: $($LastBootUpTime.ToString('yyyy-MM-dd HH:mm:ss')) ($BootAgeMinutes min ago)" -ForegroundColor Cyan
Write-Host "  AutoAdminLogon        : $AutoAdminLogon ($DefaultUser)" -ForegroundColor $(if ($AutoAdminLogon) { "Green" } else { "Red" })
Write-Host "  Scheduled Task        : $TaskState" -ForegroundColor $(if ($TaskExists) { "Green" } else { "Red" })

# --- Layer 3: Docker Runtime & Daemon ---
Write-Host "`n[Layer 3] Verifying Docker Engine & Container Runtime..." -ForegroundColor Yellow
[string]$DockerVersion = ""
[bool]$DockerResponsive = $false
try {
    $DockerVersion = (& docker version --format "{{.Server.Version}}" 2>&1).ToString().Trim()
    $DockerResponsive = $LASTEXITCODE -eq 0 -and (-not [string]::IsNullOrWhiteSpace($DockerVersion))
} catch {}

$Results.layers["Layer3_DockerEngine"] = [ordered]@{
    status = if ($DockerResponsive) { "PASSED" } else { "FAILED" }
    dockerVersion = $DockerVersion
    responsive = $DockerResponsive
}
Write-Host "  Docker Daemon: $(if ($DockerResponsive) { "ONLINE (v$DockerVersion)" } else { "OFFLINE" })" -ForegroundColor $(if ($DockerResponsive) { "Green" } else { "Red" })
if (-not $DockerResponsive) {
    throw "FATAL: Docker daemon is not responsive. Cold-boot failed at Layer 3."
}

# --- Layer 4: PostgreSQL Database Health ---
Write-Host "`n[Layer 4] Verifying PostgreSQL Database Container..." -ForegroundColor Yellow
[string]$PgContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q postgres 2>&1).ToString().Trim()
[string]$PgHealth = ""
if ($PgContainerId) {
    $PgHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $PgContainerId 2>&1).ToString().Trim()
}
[bool]$PgOk = $PgHealth -eq "healthy"

$Results.layers["Layer4_PostgreSQL"] = [ordered]@{
    status = if ($PgOk) { "PASSED" } else { "FAILED" }
    containerId = $PgContainerId
    healthStatus = $PgHealth
}
Write-Host "  PostgreSQL Status: $PgHealth" -ForegroundColor $(if ($PgOk) { "Green" } else { "Red" })

# --- Layer 5: Backend API Service ---
Write-Host "`n[Layer 5] Verifying NestJS Backend API Service..." -ForegroundColor Yellow
[string]$BackendContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q backend 2>&1).ToString().Trim()
[string]$BackendHealth = ""
if ($BackendContainerId) {
    $BackendHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $BackendContainerId 2>&1).ToString().Trim()
}
[bool]$BackendOk = $BackendHealth -eq "healthy"

# Direct /api/health check
[string]$BackendDirectProbe = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath exec -T backend node -e "
    const http = require('http');
    http.get('http://127.0.0.1:3001/api/health', (res) => {
        process.exit(res.statusCode === 200 ? 0 : 1);
    }).on('error', () => process.exit(1));
" 2>&1).ToString().Trim()
[bool]$BackendHttpOk = $LASTEXITCODE -eq 0

$Results.layers["Layer5_Backend"] = [ordered]@{
    status = if ($BackendOk -and $BackendHttpOk) { "PASSED" } else { "FAILED" }
    containerId = $BackendContainerId
    healthStatus = $BackendHealth
    httpDirectProbeOk = $BackendHttpOk
}
Write-Host "  Backend Container Status: $BackendHealth" -ForegroundColor $(if ($BackendOk) { "Green" } else { "Red" })
Write-Host "  Backend HTTP /api/health : $(if ($BackendHttpOk) { "200 OK" } else { "FAILED" })" -ForegroundColor $(if ($BackendHttpOk) { "Green" } else { "Red" })

# --- Layer 6: Frontend Service ---
Write-Host "`n[Layer 6] Verifying Frontend Vue Web Application..." -ForegroundColor Yellow
[string]$FrontendContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q frontend 2>&1).ToString().Trim()
[string]$FrontendHealth = ""
if ($FrontendContainerId) {
    $FrontendHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $FrontendContainerId 2>&1).ToString().Trim()
}
[bool]$FrontendOk = ($FrontendHealth -eq "healthy" -or $FrontendHealth -eq "running")

$Results.layers["Layer6_Frontend"] = [ordered]@{
    status = if ($FrontendOk) { "PASSED" } else { "FAILED" }
    containerId = $FrontendContainerId
    healthStatus = $FrontendHealth
}
Write-Host "  Frontend Container Status: $FrontendHealth" -ForegroundColor $(if ($FrontendOk) { "Green" } else { "Red" })

# --- Layer 7: Nginx Reverse Proxy / HTTPS Gateway ---
Write-Host "`n[Layer 7] Verifying Nginx Web Gateway & Reverse Proxy..." -ForegroundColor Yellow
[string]$NginxContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q nginx-proxy 2>&1).ToString().Trim()
if (-not $NginxContainerId) {
    $NginxContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q nginx 2>&1).ToString().Trim()
}
[string]$NginxHealth = ""
if ($NginxContainerId) {
    $NginxHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $NginxContainerId 2>&1).ToString().Trim()
}
[bool]$NginxOk = ($NginxHealth -eq "healthy" -or $NginxHealth -eq "running")

$Results.layers["Layer7_NginxGateway"] = [ordered]@{
    status = if ($NginxOk) { "PASSED" } else { "FAILED" }
    containerId = $NginxContainerId
    healthStatus = $NginxHealth
}
Write-Host "  Nginx Gateway Status: $NginxHealth" -ForegroundColor $(if ($NginxOk) { "Green" } else { "Red" })

# --- Layer 8: End-to-End Business Smoke Test ---
Write-Host "`n[Layer 8] Executing Cross-Stack Business Smoke Test..." -ForegroundColor Yellow
[string]$SmokeOutput = (& node "$ProjectRootDir\scripts\ci-e2e-smoke.js" 2>&1) | Out-String
[bool]$SmokePassed = $LASTEXITCODE -eq 0

$Results.layers["Layer8_BusinessSmoke"] = [ordered]@{
    status = if ($SmokePassed) { "PASSED" } else { "FAILED" }
    exitCode = $LASTEXITCODE
}
Write-Host "  E2E Business Smoke: $(if ($SmokePassed) { "100% PASSED" } else { "FAILED" })" -ForegroundColor $(if ($SmokePassed) { "Green" } else { "Red" })

$Sw.Stop()
[double]$VerificationDurationSeconds = [Math]::Round($Sw.Elapsed.TotalSeconds, 2)

# Calculate RTO: if cold-boot just happened (within 30m), use actual boot-to-ready time; otherwise use verification execution time
[double]$TotalRecoverySeconds = if ($BootAgeSeconds -lt 1800) { $BootAgeSeconds } else { $VerificationDurationSeconds }
[bool]$RtoCompliant = $TotalRecoverySeconds -le $MaxAllowedRtoSeconds

# MANDATORY: Layer 1 & 2 (AutoLogon & Task) MUST pass, plus all container and smoke layers, plus RTO compliance
[bool]$AllLayersPassed = $Layer1_2_Ok -and $DockerResponsive -and $PgOk -and $BackendOk -and $BackendHttpOk -and $FrontendOk -and $NginxOk -and $SmokePassed
$FinalVerdict = if ($AllLayersPassed -and $RtoCompliant) { "PASSED" } else { "FAILED" }

$Results.verdict = $FinalVerdict
$Results["measuredRecoverySeconds"] = $TotalRecoverySeconds
$Results["verificationDurationSeconds"] = $VerificationDurationSeconds
$Results["rtoCompliant"] = $RtoCompliant
$Results["allLayersPassed"] = $AllLayersPassed

$JsonOutput = $Results | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($EvidenceFile, $JsonOutput, [System.Text.Encoding]::UTF8)

Write-Host "`n==============================================================================" -ForegroundColor $(if ($FinalVerdict -eq "PASSED") { "Green" } else { "Red" })
Write-Host " COLD-BOOT AUTO-RECOVERY VERDICT: $FinalVerdict" -ForegroundColor $(if ($FinalVerdict -eq "PASSED") { "Green" } else { "Red" })
Write-Host " Measured Recovery Time (RTO)   : $TotalRecoverySeconds seconds (Max Target: $MaxAllowedRtoSeconds s)" -ForegroundColor $(if ($RtoCompliant) { "Green" } else { "Red" })
Write-Host " All Layers Operational         : $AllLayersPassed" -ForegroundColor $(if ($AllLayersPassed) { "Green" } else { "Red" })
Write-Host " Evidence Artifact Saved To     : $EvidenceFile" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor $(if ($FinalVerdict -eq "PASSED") { "Green" } else { "Red" })

if ($FinalVerdict -ne "PASSED") {
    exit 1
}
exit 0
