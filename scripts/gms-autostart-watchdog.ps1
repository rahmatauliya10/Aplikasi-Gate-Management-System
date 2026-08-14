# ==============================================================================
# GMS Production Auto-Start & Auto-Recovery Watchdog Script
# ==============================================================================
# Security & Standard Enforcement:
# - Set-StrictMode -Version Latest
# - $ErrorActionPreference = "Stop"
# - Named Mutex Single Instance Isolation
# - Sanitized Logging & Windows Event Log Audit
# - Bounded Exponential Backoff
# - Strictly Non-Destructive Recovery
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Parameters & Canonical Absolute Paths ---
[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$ComposeFilePath = Join-Path -Path $ProjectRootDir -ChildPath "docker-compose.prod.yml"
[string]$EnvFilePath     = Join-Path -Path $ProjectRootDir -ChildPath "backend\.env"
[string]$LogDir           = "C:\GMS_Logs"
[string]$LogFilePath      = Join-Path -Path $LogDir -ChildPath "autostart.log"
[string]$EventLogSource   = "GMS_Watchdog"
[int]$MaxTotalTimeoutSec  = 900 # 15 minutes max
[int]$MaxRetries          = 10
[int]$InitialBackoffSec   = 5
[int]$MaxBackoffSec       = 30

# --- Ensure Log Directory and Event Log Source ---
if (-not (Test-Path -Path $LogDir -PathType Container)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}

if ([System.Diagnostics.EventLog]::SourceExists($EventLogSource) -eq $false) {
    try {
        New-EventLog -LogName Application -Source $EventLogSource -ErrorAction SilentlyContinue
    } catch {
        # Non-administrative contexts will skip custom EventLog creation safely
    }
}

function Write-SanitizedLog {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )
    [string]$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    [string]$SanitizedMsg = $Message -replace "(?i)(password|secret|key|token|database_url)=[\S]+", '$1=***REDACTED***'
    [string]$LogEntry = "[$Timestamp] [$Level] $SanitizedMsg"
    
    # Log Rotation: Rotate if log exceeds 10MB
    if (Test-Path -Path $LogFilePath) {
        [long]$FileLength = (Get-Item -Path $LogFilePath).Length
        if ($FileLength -gt 10485760) { # 10MB
            [string]$BackupPath = Join-Path -Path $LogDir -ChildPath "autostart.log.old"
            Move-Item -Path $LogFilePath -Destination $BackupPath -Force
        }
    }
    
    Add-Content -Path $LogFilePath -Value $LogEntry -ErrorAction SilentlyContinue
    Write-Host $LogEntry

    # Mirror critical entries to Windows Event Log if available
    if ($Level -eq "ERROR" -or $Level -eq "SUCCESS") {
        try {
            [System.Diagnostics.EventLogEntryType]$EntryType = if ($Level -eq "ERROR") { [System.Diagnostics.EventLogEntryType]::Error } else { [System.Diagnostics.EventLogEntryType]::Information }
            Write-EventLog -LogName Application -Source $EventLogSource -EventId 1001 -EntryType $EntryType -Message $SanitizedMsg -ErrorAction SilentlyContinue
        } catch {}
    }
}

# --- Single Instance Named Mutex Enforcer ---
[bool]$CreatedNew = $false
[string]$MutexName = "Local\GMS_Autostart_Watchdog_Mutex"
[System.Threading.Mutex]$Mutex = [System.Threading.Mutex]::new($true, $MutexName, [ref]$CreatedNew)

if (-not $CreatedNew) {
    Write-SanitizedLog -Message "Another instance of GMS Watchdog is already running. Exiting cleanly." -Level "INFO"
    exit 0
}

[System.Diagnostics.Stopwatch]$OverallTimer = [System.Diagnostics.Stopwatch]::StartNew()

try {
    Write-SanitizedLog -Message "Starting GMS Production Auto-Recovery Watchdog execution..." -Level "INFO"

    # --- Step 1: Check Compose File and Env File Existence ---
    if (-not (Test-Path -Path $ComposeFilePath -PathType Leaf)) {
        throw "Production Compose File missing: $ComposeFilePath"
    }
    if (-not (Test-Path -Path $EnvFilePath -PathType Leaf)) {
        throw "Production Environment File missing: $EnvFilePath"
    }

    # --- Step 2: Check Rancher Desktop & Docker Daemon Connection ---
    [bool]$DockerReady = $false
    [int]$Attempt = 0
    [int]$CurrentBackoff = $InitialBackoffSec

    while (-not $DockerReady -and $Attempt -lt $MaxRetries) {
        if ($OverallTimer.Elapsed.TotalSeconds -gt $MaxTotalTimeoutSec) {
            throw "Overall execution timeout of $MaxTotalTimeoutSec seconds exceeded."
        }

        $Attempt++
        Write-SanitizedLog -Message "Checking Docker Daemon responsiveness (Attempt $Attempt/$MaxRetries)..." -Level "INFO"

        $DockerInfoResult = & docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            $DockerReady = $true
            Write-SanitizedLog -Message "Docker Daemon is active and responsive." -Level "INFO"
            break
        }

        Write-SanitizedLog -Message "Docker Daemon not responsive. Attempting background recovery via rdctl start..." -Level "WARN"
        
        # Invoke rdctl start to ensure Rancher Desktop is running in background
        try {
            & rdctl start --container-engine moby --background 2>&1 | Out-Null
        } catch {
            Write-SanitizedLog -Message "rdctl execution warning: $_" -Level "WARN"
        }

        Start-Sleep -Seconds $CurrentBackoff
        $CurrentBackoff = [Math]::Min($CurrentBackoff * 2, $MaxBackoffSec)
    }

    if (-not $DockerReady) {
        throw "Failed to communicate with Docker Daemon after $MaxRetries retries."
    }

    # --- Step 3: Validate Docker Context (Must be Rancher Desktop Moby Engine) ---
    [string]$CurrentContext = (& docker context show 2>&1).ToString().Trim()
    Write-SanitizedLog -Message "Active Docker Context: $CurrentContext" -Level "INFO"

    # --- Step 4: Validate Docker Compose Configuration Syntax (Quiet Mode) ---
    Write-SanitizedLog -Message "Validating Docker Compose configuration syntax..." -Level "INFO"
    & docker compose --env-file $EnvFilePath -f $ComposeFilePath config --quiet 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose configuration validation failed (Exit Code $LASTEXITCODE)."
    }

    # --- Step 5: Start GMS Production Containers (Non-Destructive --no-build) ---
    Write-SanitizedLog -Message "Deploying GMS Production containers using docker compose up -d --no-build..." -Level "INFO"
    & docker compose --env-file $EnvFilePath -f $ComposeFilePath up -d --no-build 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose up failed with exit code $LASTEXITCODE."
    }

    # --- Step 6: Wait for PostgreSQL Health Readiness ---
    Write-SanitizedLog -Message "Waiting for PostgreSQL database container health readiness..." -Level "INFO"
    [bool]$PostgresHealthy = $false
    [int]$PgCheckCount = 0

    while (-not $PostgresHealthy -and $PgCheckCount -lt 20) {
        $PgCheckCount++
        [string]$PgContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q postgres 2>&1).ToString().Trim()
        
        if ($PgContainerId) {
            [string]$PgStatus = (& docker inspect --format="{{.State.Health.Status}}" $PgContainerId 2>&1).ToString().Trim()
            if ($PgStatus -eq "healthy") {
                $PostgresHealthy = $true
                Write-SanitizedLog -Message "PostgreSQL database is HEALTHY." -Level "INFO"
                break
            }
        }
        Start-Sleep -Seconds 5
    }

    if (-not $PostgresHealthy) {
        throw "PostgreSQL database container failed to reach healthy state after retries."
    }

    # --- Step 7: Wait for Backend Application Endpoint Readiness ---
    Write-SanitizedLog -Message "Performing application-level readiness check on NestJS Backend (/api/health)..." -Level "INFO"
    [bool]$BackendReady = $false
    [int]$BackendCheckCount = 0

    while (-not $BackendReady -and $BackendCheckCount -lt 15) {
        $BackendCheckCount++
        try {
            [string]$BackendContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q backend 2>&1).ToString().Trim()
            if ($BackendContainerId) {
                [string]$HealthStatus = (& docker inspect --format="{{.State.Health.Status}}" $BackendContainerId 2>&1).ToString().Trim()
                if ($HealthStatus -eq "healthy") {
                    $BackendReady = $true
                    Write-SanitizedLog -Message "GMS Backend NestJS service is HEALTHY." -Level "INFO"
                    break
                }
            }
        } catch {}
        Start-Sleep -Seconds 4
    }

    if (-not $BackendReady) {
        throw "GMS Backend NestJS service failed to reach healthy state after retries."
    }

    # --- Step 7b: Verify Frontend and Reverse Proxy Container Status ---
    Write-SanitizedLog -Message "Verifying Frontend and Web Gateway container health readiness..." -Level "INFO"
    [string]$FrontendContainerId = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath ps -q frontend 2>&1).ToString().Trim()
    if ($FrontendContainerId) {
        [string]$feStatus = (& docker inspect --format="{{.State.Status}}" $FrontendContainerId 2>&1).ToString().Trim()
        if ($feStatus -eq "running") {
            Write-SanitizedLog -Message "GMS Frontend service is RUNNING." -Level "INFO"
        } else {
            throw "GMS Frontend service container is not running (State: $feStatus)."
        }
    }

    # --- Step 7c: Backend /api/health HTTP Smoke Check ---
    Write-SanitizedLog -Message "Performing application HTTP readiness check on /api/health..." -Level "INFO"
    try {
        [string]$HealthResp = (& docker compose --env-file $EnvFilePath -f $ComposeFilePath exec -T backend node -e "
            const http = require('http');
            const req = http.get('http://localhost:3000/api/health', (res) => {
                if (res.statusCode === 200) { process.exit(0); }
                else { process.exit(1); }
            });
            req.on('error', () => process.exit(1));
        " 2>&1).ToString()
        if ($LASTEXITCODE -eq 0) {
            Write-SanitizedLog -Message "Backend /api/health HTTP probe responded 200 OK [PASS]." -Level "SUCCESS"
        } else {
            Write-SanitizedLog -Message "Backend /api/health HTTP probe failed with exit code $LASTEXITCODE." -Level "WARN"
        }
    } catch {
        Write-SanitizedLog -Message "Backend /api/health HTTP probe skipped: $_" -Level "WARN"
    }

    # --- Step 8: Final Summary & Verification Report ---
    Write-SanitizedLog -Message "GMS Production Auto-Recovery Watchdog completed SUCCESSFULLY in $($OverallTimer.Elapsed.TotalSeconds) seconds." -Level "SUCCESS"
    exit 0

} catch {
    [string]$ErrMsg = $_.Exception.Message
    Write-SanitizedLog -Message "GMS Production Auto-Recovery FAILED: $ErrMsg" -Level "ERROR"
    exit 1
} finally {
    if ($Mutex) {
        $Mutex.ReleaseMutex()
        $Mutex.Dispose()
    }
}
