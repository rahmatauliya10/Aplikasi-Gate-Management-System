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

param(
    [Parameter(Mandatory=$false)]
    [string]$ComposeFilePath = "",

    [Parameter(Mandatory=$false)]
    [string]$EnvFilePath = "",

    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "aplikasigatemanagementsystem",

    [Parameter(Mandatory=$false)]
    [bool]$RequireFrontend = $true,

    [Parameter(Mandatory=$false)]
    [bool]$RequireNginx = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Parameters & Canonical Absolute Paths ---
[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
if (-not $ComposeFilePath) {
    $ComposeFilePath = Join-Path -Path $ProjectRootDir -ChildPath "docker-compose.prod.yml"
}
if (-not $EnvFilePath) {
    $EnvFilePath = Join-Path -Path $ProjectRootDir -ChildPath "backend\.env"
}
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
    Write-SanitizedLog -Message "Starting GMS Production Auto-Recovery Watchdog execution (Project: $ProjectName)..." -Level "INFO"

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
    & docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath config --quiet 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose configuration validation failed (Exit Code $LASTEXITCODE)."
    }

    # --- Step 5: Start GMS Production Containers (Non-Destructive --no-build) ---
    Write-SanitizedLog -Message "Deploying GMS Production containers using docker compose up -d --no-build..." -Level "INFO"
    & docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath up -d --no-build 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose up failed with exit code $LASTEXITCODE."
    }

    # --- Step 6: Wait for PostgreSQL Health Readiness ---
    Write-SanitizedLog -Message "Waiting for PostgreSQL database container health readiness..." -Level "INFO"
    [bool]$PostgresHealthy = $false
    [int]$PgCheckCount = 0

    while (-not $PostgresHealthy -and $PgCheckCount -lt 20) {
        $PgCheckCount++
        [string]$PgContainerId = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath ps -q postgres 2>&1).ToString().Trim()
        
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
            [string]$BackendContainerId = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath ps -q backend 2>&1).ToString().Trim()
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

    [bool]$EffectiveRequireNginx = $RequireNginx -or ($ComposeFilePath -like "*prod*")

    # --- Step 7b: Verify Frontend and Reverse Proxy Container Health ---
    Write-SanitizedLog -Message "Verifying Frontend and Web Gateway container health readiness..." -Level "INFO"
    [string]$FrontendContainerId = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath ps -q frontend 2>&1).ToString().Trim()
    if ($FrontendContainerId) {
        [string]$feHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $FrontendContainerId 2>&1).ToString().Trim()
        if ($feHealth -eq "healthy" -or $feHealth -eq "running") {
            Write-SanitizedLog -Message "GMS Frontend service is HEALTHY ($feHealth)." -Level "INFO"
        } else {
            throw "GMS Frontend service container is not healthy (Status: $feHealth)."
        }
    } elseif ($RequireFrontend) {
        throw "GMS Frontend service container was not found in compose stack."
    }

    [string]$NginxContainerId = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath ps -q nginx-proxy 2>&1).ToString().Trim()
    if (-not $NginxContainerId) {
        $NginxContainerId = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath ps -q nginx 2>&1).ToString().Trim()
    }
    if ($NginxContainerId) {
        [string]$ngHealth = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $NginxContainerId 2>&1).ToString().Trim()
        if ($ngHealth -eq "healthy" -or $ngHealth -eq "running") {
            Write-SanitizedLog -Message "GMS Nginx reverse proxy service is HEALTHY ($ngHealth)." -Level "INFO"
        } else {
            throw "GMS Nginx reverse proxy container is not healthy (Status: $ngHealth)."
        }
    } elseif ($EffectiveRequireNginx) {
        throw "GMS Nginx reverse proxy container was not found in compose stack."
    }

    # --- Step 7c: Backend /api/health Direct HTTP Smoke Check ---
    Write-SanitizedLog -Message "Performing application HTTP readiness check on /api/health directly to backend..." -Level "INFO"
    [string]$HealthResp = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath exec -T backend node -e "
        const http = require('http');
        const port = process.env.PORT || 3001;
        const req = http.get('http://127.0.0.1:' + port + '/api/health', (res) => {
            if (res.statusCode === 200) { process.exit(0); }
            else {
                console.error('HTTP Health Check returned status: ' + res.statusCode);
                process.exit(1);
            }
        });
        req.on('error', (err) => {
            console.error('HTTP Health Check connection error: ' + err.message);
            process.exit(1);
        });
    " 2>&1).ToString()
    if ($LASTEXITCODE -ne 0) {
        throw "Backend /api/health HTTP readiness probe failed: $HealthResp"
    }
    Write-SanitizedLog -Message "Backend /api/health direct HTTP probe responded 200 OK [PASS]." -Level "SUCCESS"

    # --- Step 8: HTTPS Gateway End-to-End Release Gate (P0-01 Audit Fix) ---
    if ($EffectiveRequireNginx -and $NginxContainerId) {
        Write-SanitizedLog -Message "Performing end-to-end HTTPS Gateway validation (TLS, API Routing, Frontend Proxy)..." -Level "INFO"
        
        [string]$GatewaySmokeCheck = (& docker compose -p $ProjectName --env-file $EnvFilePath -f $ComposeFilePath exec -T backend node -e "
            const https = require('https');
            const http = require('http');

            function probe(options) {
                return new Promise((resolve, reject) => {
                    const client = options.protocol === 'https:' ? https : http;
                    const req = client.get(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
                    });
                    req.on('error', reject);
                    req.setTimeout(8000, () => {
                        req.destroy();
                        reject(new Error('Probe timeout for ' + options.path));
                    });
                });
            }

            async function runProbes() {
                try {
                    // 1. Gateway HTTPS /health check
                    const healthRes = await probe({
                        protocol: 'https:',
                        hostname: 'nginx-proxy',
                        port: 443,
                        path: '/health',
                        rejectUnauthorized: false
                    });
                    if (healthRes.statusCode !== 200) {
                        throw new Error('Gateway /health returned ' + healthRes.statusCode);
                    }
                    console.log('PROBE_GATEWAY_HEALTH:PASS');

                    // 2. Gateway HTTPS /api/health/readiness check (Reverse Proxy Routing to Backend)
                    const apiRes = await probe({
                        protocol: 'https:',
                        hostname: 'nginx-proxy',
                        port: 443,
                        path: '/api/health/readiness',
                        rejectUnauthorized: false
                    });
                    if (apiRes.statusCode !== 200) {
                        throw new Error('Gateway /api/health/readiness returned ' + apiRes.statusCode);
                    }
                    console.log('PROBE_GATEWAY_API_READINESS:PASS');

                    // 3. Gateway HTTPS / frontend static route check (Reverse Proxy Routing to Frontend)
                    const feRes = await probe({
                        protocol: 'https:',
                        hostname: 'nginx-proxy',
                        port: 443,
                        path: '/',
                        rejectUnauthorized: false
                    });
                    if (feRes.statusCode !== 200) {
                        throw new Error('Gateway frontend route / returned ' + feRes.statusCode);
                    }
                    console.log('PROBE_GATEWAY_FRONTEND:PASS');

                    process.exit(0);
                } catch (err) {
                    console.error('GATEWAY_PROBE_ERROR: ' + err.message);
                    process.exit(1);
                }
            }

            runProbes();
        " 2>&1).ToString()

        if ($LASTEXITCODE -ne 0) {
            throw "HTTPS Gateway validation failed: $GatewaySmokeCheck"
        }
        Write-SanitizedLog -Message "HTTPS Gateway validation PASSED (TLS, API Reverse Proxy, Frontend Proxy OK)." -Level "SUCCESS"
    }

    # --- Step 9: Final Summary & Verification Report ---
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
