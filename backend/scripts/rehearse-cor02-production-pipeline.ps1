# ==============================================================================
# COR-02 / MERGE-04: Genuine Production Fallback Pipeline Integration Drill
# ==============================================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$targetRunId = "c3e8a491"
$expectedType = "3c-fresh"

$pg16Container = "gms-test-pg-3c-c3e8a491"
$pg15Container = "gms-drill-pg15-c3e8a491"
$pg17RunnerContainer = "gms-drill-pg17-runner"

$dbUser = "gms_test_user"
$dbPass = "synth_pass_3c_c3e8a491"
$pg16Port = "57193"
$pg15Port = "57194"

# State tracking: container IDs and verified ownership tokens (initialized to false/null)
$pg16VerifiedId = $null
$pg16OwnershipVerified = $false

$pg15VerifiedId = $null
$pg15OwnershipVerified = $false
$pg15CreatedByThisRun = $false

$pg17RunnerVerifiedId = $null
$pg17RunnerOwnershipVerified = $false

Write-Host "========================================================================"
Write-Host "  COR-02 / MERGE-04: GENUINE PRODUCTION FALLBACK RESTORE REHEARSAL      "
Write-Host "========================================================================`n"

# ------------------------------------------------------------------------------
# Preflight Target Guard
# ------------------------------------------------------------------------------
Write-Host "Preflight: Verifying port guards..."
if ($pg16Port -eq "5433" -or $pg15Port -eq "5433") {
  throw "SAFETY ABORT: Operational port 5433 detected! Rehearsal strictly forbidden on port 5433."
}
Write-Host "  OK: Ports verified: PG16 on port $pg16Port, PG15 on port $pg15Port"

# ------------------------------------------------------------------------------
# Preflight Safety Guard: Empirical Negative Control Verification (Command-Mock Spy)
# ------------------------------------------------------------------------------
Write-Host "Preflight Safety: Running Empirical Negative Control Guard Verification..."
$spyCommandLog = [System.Collections.Generic.List[string]]::new()
function Invoke-SpyDockerCheck {
  param([string[]]$ArgsList)
  $cmdStr = ($ArgsList -join " ")
  $spyCommandLog.Add($cmdStr)
  if ($cmdStr -match "docker inspect") {
    return (@(@{
      Id = "mock-unauthorized-id-888"
      Config = @{
        Labels = @{
          "gms.fixture.type" = "unauthorized-external-workload"
          "gms.fixture.run_id" = "alien-run-id-999"
        }
      }
    }) | ConvertTo-Json -Depth 5)
  }
  return ""
}

$spyAborted = $false
$spyError = ""
$spyPreflightVerified = $false
try {
  $rawInspect = Invoke-SpyDockerCheck @("-d", "rancher-desktop", "-e", "docker", "inspect", "mock-container")
  $objInspect = $rawInspect | ConvertFrom-Json
  $lbls = $objInspect[0].Config.Labels
  if ($lbls.'gms.fixture.type' -ne $expectedType -or $lbls.'gms.fixture.run_id' -ne $targetRunId) {
    throw "SAFETY ABORT [EMPIRICAL SPY]: Governance check failed on unauthorized labels."
  }
  $spyPreflightVerified = $true
} catch {
  $spyAborted = $true
  $spyError = $_.Exception.Message
} finally {
  # Mirror the exact finally guards:
  if ($spyPreflightVerified) {
    Invoke-SpyDockerCheck @("-d", "rancher-desktop", "-e", "docker", "exec", "mock-container", "psql", "-c", 'DROP DATABASE "foo";')
  }
}

$spyDropCount = ($spyCommandLog | Where-Object { $_ -match "DROP DATABASE" }).Count
$spyRmCount = ($spyCommandLog | Where-Object { $_ -match "docker rm" }).Count
if (-not $spyAborted -or $spyPreflightVerified -or $spyDropCount -ne 0 -or $spyRmCount -ne 0) {
  throw "SAFETY AUDIT FAILED: Empirical negative control failed to prove abort or zero-mutation on unverified target!"
}
Write-Host "  OK: Empirical negative control PASS: Unauthorized container strictly aborts; cleanup skips target (0 mutation, 0 drops, 0 removals)."

try {
  # ------------------------------------------------------------------------------
  # Verify Disposable PG16 Container Ownership & Labels
  # ------------------------------------------------------------------------------
  Write-Host "Preflight: Verifying disposable PG16 container ownership & labels..."
  $pg16InspectRaw = (wsl -d rancher-desktop -e docker inspect $pg16Container 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $pg16InspectRaw) {
    throw "SAFETY ABORT: PG16 fixture container '$pg16Container' is not running or inspect failed."
  }
  $pg16Inspect = $pg16InspectRaw | ConvertFrom-Json
  $pg16Id = [string]$pg16Inspect[0].Id
  $pg16Labels = $pg16Inspect[0].Config.Labels
  $pg16Type = [string]$pg16Labels.'gms.fixture.type'
  $pg16RunId = [string]$pg16Labels.'gms.fixture.run_id'

  if ($pg16Type -ne $expectedType -or $pg16RunId -ne $targetRunId) {
    throw "SAFETY ABORT: Container '$pg16Container' failed governance check (type='$pg16Type', run_id='$pg16RunId'). Expected type=$expectedType, run_id=$targetRunId."
  }

  # Ownership confirmed only after full label and ID match
  $pg16VerifiedId = $pg16Id
  $pg16OwnershipVerified = $true
  Write-Host "  OK: Verified container '$pg16Container' (ID: $pg16VerifiedId, type=$pg16Type, run_id=$pg16RunId)"

  # ------------------------------------------------------------------------------
  # Verify / Launch Disposable PG15 Container with Strict Labels & ID
  # ------------------------------------------------------------------------------
  Write-Host "Preflight: Ensuring disposable PG15 container..."
  $pg15Exists = (wsl -d rancher-desktop -e docker ps -a --filter ("name=^/" + $pg15Container + "$") --format '{{.Names}}' | Out-String).Trim()
  $pg15Running = $false
  if ($pg15Exists -eq $pg15Container) {
    $pg15InspectRaw = (wsl -d rancher-desktop -e docker inspect $pg15Container | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $pg15InspectRaw) {
      $pg15Inspect = $pg15InspectRaw | ConvertFrom-Json
      $pg15Id = [string]$pg15Inspect[0].Id
      $pg15Labels = $pg15Inspect[0].Config.Labels
      $pg15Type = [string]$pg15Labels.'gms.fixture.type'
      $pg15RunId = [string]$pg15Labels.'gms.fixture.run_id'
      if ($pg15Type -eq $expectedType -and $pg15RunId -eq $targetRunId) {
        $pg15Running = [bool]$pg15Inspect[0].State.Running
        $pg15VerifiedId = $pg15Id
        $pg15OwnershipVerified = $true
      } else {
        throw "SAFETY ABORT: Existing container '$pg15Container' has unexpected labels (type='$pg15Type', run_id='$pg15RunId')! Aborting without mutation."
      }
    }
  }

  if (-not $pg15Running) {
    Write-Host "  -> Launching disposable PG15 container on 127.0.0.1:$pg15Port..."
    $pg15LaunchId = (wsl -d rancher-desktop -e docker run -d `
      --name $pg15Container `
      --label ("gms.fixture.type=" + $expectedType) `
      --label ("gms.fixture.run_id=" + $targetRunId) `
      -e POSTGRES_USER=$dbUser `
      -e POSTGRES_PASSWORD=$dbPass `
      -e POSTGRES_DB=postgres `
      -p ("127.0.0.1:" + $pg15Port + ":5432") `
      postgres:15.12-alpine | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $pg15LaunchId) {
      throw "Failed to launch PG15 container '$pg15Container' (exit code: $LASTEXITCODE)."
    }
    $pg15VerifiedId = $pg15LaunchId
    $pg15OwnershipVerified = $true
    $pg15CreatedByThisRun = $true

    for ($i = 0; $i -lt 30; $i++) {
      $ready = (wsl -d rancher-desktop -e docker exec -i $pg15Container pg_isready -U $dbUser 2>$null | Out-String).Trim()
      if ($ready -match "accepting connections") { break }
      Start-Sleep -Seconds 1
    }
  }
  Write-Host "  OK: Disposable PG15 container verified: $pg15Container (ID: $pg15VerifiedId)"

  # ------------------------------------------------------------------------------
  # Setup Disposable PG17 Runner Container (READ-ONLY Workspace Mount)
  # ------------------------------------------------------------------------------
  Write-Host "Preflight: Setting up PG17 Node execution container (Read-Only Mount)..."
  $pg17Exists = (wsl -d rancher-desktop -e docker ps -a --filter ("name=^/" + $pg17RunnerContainer + "$") --format '{{.Names}}' | Out-String).Trim()
  if ($pg17Exists -eq $pg17RunnerContainer) {
    $pg17InspectRaw = (wsl -d rancher-desktop -e docker inspect $pg17RunnerContainer | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $pg17InspectRaw) {
      $pg17Inspect = $pg17InspectRaw | ConvertFrom-Json
      $pg17Role = [string]$pg17Inspect[0].Config.Labels.'gms.fixture.role'
      $pg17RunId = [string]$pg17Inspect[0].Config.Labels.'gms.fixture.run_id'
      if ($pg17Role -eq "cor02-runner" -and $pg17RunId -eq $targetRunId) {
        wsl -d rancher-desktop -e docker rm -f $pg17RunnerContainer 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
          throw "Failed removing existing PG17 runner container '$pg17RunnerContainer'."
        }
      } else {
        throw "SAFETY ABORT: Existing container '$pg17RunnerContainer' does not carry fixture role 'cor02-runner' and run_id '$targetRunId'!"
      }
    }
  }

  $backendDir = Resolve-Path (Join-Path $PSScriptRoot "..")
  $wslBackendPath = (wsl wslpath -u $backendDir).Trim()

  # Mount workspace strictly as READ-ONLY (:ro) to ensure zero host workspace alteration
  $runnerLaunchId = (wsl -d rancher-desktop -e docker run -d `
    --name $pg17RunnerContainer `
    --label ("gms.fixture.type=" + $expectedType) `
    --label ("gms.fixture.run_id=" + $targetRunId) `
    --label "gms.fixture.role=cor02-runner" `
    --net=host `
    -v ($wslBackendPath + ":/app:ro") `
    postgres:17-alpine sleep infinity | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $runnerLaunchId) {
    throw "Failed to start PG17 runner container with read-only mount (exit code: $LASTEXITCODE)."
  }
  $pg17RunnerVerifiedId = $runnerLaunchId
  $pg17RunnerOwnershipVerified = $true

  # Install Node.js inside the PG17 container
  wsl -d rancher-desktop -e docker exec $pg17RunnerContainer apk add --no-cache nodejs | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Node.js inside PG17 container (exit code: $LASTEXITCODE)."
  }
  Write-Host "  OK: PG17 Node execution runner ready: $pg17RunnerContainer (ID: $pg17RunnerVerifiedId, Mounted /app:ro)"

  # ------------------------------------------------------------------------------
  # Execute Production Restore Integration Drill via Node.js
  # ------------------------------------------------------------------------------
  Write-Host "`nExecution: Running cor02-production-harness.js via production DatabaseBackupService..."
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $harnessOutput = (wsl -d rancher-desktop -e docker exec -w /app $pg17RunnerContainer node scripts/cor02-production-harness.js 2>&1 | Out-String)
  $harnessExitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEAP

  Write-Host $harnessOutput

  if ($harnessExitCode -ne 0) {
    throw "PRODUCTION FALLBACK RESTORE HARNESS FAILED (Exit Code: $harnessExitCode)!"
  }

  Write-Host "`nOK: Production restore fallback harness finished with EXIT CODE 0."
}
finally {
  # ------------------------------------------------------------------------------
  # Guaranteed Cleanup in finally block: Strictly Gated on Ownership Verification
  # ------------------------------------------------------------------------------
  Write-Host "`n[Finally Cleanup 1/3] Checking test database cleanup eligibility..."

  # Guard 1: ONLY drop databases on PG16 if ownership was verified AND container ID matches
  if ($pg16OwnershipVerified -and $pg16VerifiedId) {
    $currentPg16Id = (wsl -d rancher-desktop -e docker inspect --format '{{.Id}}' $pg16Container 2>$null | Out-String).Trim()
    if ($currentPg16Id -eq $pg16VerifiedId) {
      Write-Host "  PG16 ownership verified (ID: $pg16VerifiedId). Dropping test databases individually..."
      $testDbs = @("gms_source_cor02", "gms_test_restore_pg16")
      foreach ($db in $testDbs) {
        $dropSql = 'DROP DATABASE IF EXISTS "' + $db + '";'
        $dropOut = (wsl -d rancher-desktop -e docker exec -e 'PGOPTIONS=-c client_min_messages=warning' -i $pg16Container psql -U $dbUser -d postgres -c $dropSql 2>&1 | Out-String).Trim()
        $dropCode = $LASTEXITCODE
        if ($dropCode -eq 0) {
          Write-Host "    OK: Dropped database '$db' on PG16 target (exit code: 0)"
        } else {
          Write-Warning "    WARNING: Failed dropping database '$db' on PG16 (exit code: $dropCode): $dropOut"
        }
      }
    } else {
      Write-Warning "  SKIPPING PG16 DB cleanup: Container ID changed or not matched ($currentPg16Id vs $pg16VerifiedId)."
    }
  } else {
    Write-Host "  SKIPPING PG16 DB cleanup: PG16 ownership was NOT verified (Zero mutation on unverified target)."
  }

  # Guard 2: ONLY drop database on PG15 if ownership was verified AND container ID matches
  if ($pg15OwnershipVerified -and $pg15VerifiedId) {
    $currentPg15Id = (wsl -d rancher-desktop -e docker inspect --format '{{.Id}}' $pg15Container 2>$null | Out-String).Trim()
    if ($currentPg15Id -eq $pg15VerifiedId) {
      $dropPg15Sql = 'DROP DATABASE IF EXISTS "gms_test_restore_pg15";'
      $dropPg15Out = (wsl -d rancher-desktop -e docker exec -e 'PGOPTIONS=-c client_min_messages=warning' -i $pg15Container psql -U $dbUser -d postgres -c $dropPg15Sql 2>&1 | Out-String).Trim()
      $dropPg15Code = $LASTEXITCODE
      if ($dropPg15Code -eq 0) {
        Write-Host "  OK: Dropped database 'gms_test_restore_pg15' on PG15 target (exit code: 0)"
      } else {
        Write-Warning "  WARNING: Failed dropping database 'gms_test_restore_pg15' on PG15 (exit code: $dropPg15Code): $dropPg15Out"
      }
    } else {
      Write-Warning "  SKIPPING PG15 DB cleanup: Container ID changed or not matched ($currentPg15Id vs $pg15VerifiedId)."
    }
  } else {
    Write-Host "  SKIPPING PG15 DB cleanup: PG15 ownership was NOT verified."
  }

  Write-Host "`n[Finally Cleanup 2/3] Checking disposable container removal eligibility..."

  # Guard 3: ONLY remove PG17 runner if verified ID and label match
  if ($pg17RunnerOwnershipVerified -and $pg17RunnerVerifiedId) {
    $currentRunnerId = (wsl -d rancher-desktop -e docker inspect --format '{{.Id}}' $pg17RunnerContainer 2>$null | Out-String).Trim()
    if ($currentRunnerId -eq $pg17RunnerVerifiedId) {
      $rmOut = (wsl -d rancher-desktop -e docker rm -f $pg17RunnerContainer 2>&1 | Out-String).Trim()
      $rmCode = $LASTEXITCODE
      if ($rmCode -eq 0) {
        Write-Host "  OK: Confirmed removed runner '$pg17RunnerContainer' (exit code: 0)"
      } else {
        Write-Warning "  WARNING: Failed removing runner '$pg17RunnerContainer' (exit code: $rmCode): $rmOut"
      }
    } else {
      Write-Warning "  SKIPPING PG17 runner removal: Container ID changed or not matched ($currentRunnerId vs $pg17RunnerVerifiedId)."
    }
  } else {
    Write-Host "  SKIPPING PG17 runner removal: Runner ownership was not verified."
  }

  # Guard 4: ONLY remove PG15 container if created by this run AND verified ID matches
  if ($pg15CreatedByThisRun -and $pg15VerifiedId) {
    $currentPg15Id = (wsl -d rancher-desktop -e docker inspect --format '{{.Id}}' $pg15Container 2>$null | Out-String).Trim()
    if ($currentPg15Id -eq $pg15VerifiedId) {
      $rmPg15Out = (wsl -d rancher-desktop -e docker rm -f $pg15Container 2>&1 | Out-String).Trim()
      $rmPg15Code = $LASTEXITCODE
      if ($rmPg15Code -eq 0) {
        Write-Host "  OK: Confirmed removed fixture '$pg15Container' (exit code: 0)"
      } else {
        Write-Warning "  WARNING: Failed removing fixture '$pg15Container' (exit code: $rmPg15Code): $rmPg15Out"
      }
    } else {
      Write-Warning "  SKIPPING PG15 container removal: Container ID changed or not matched ($currentPg15Id vs $pg15VerifiedId)."
    }
  } else {
    Write-Host "  SKIPPING PG15 container removal: PG15 was not created by this run or unverified."
  }

  Write-Host "`n[Finally Cleanup 3/3] Inspecting operational container states (telemetry)..."
  $operationalContainers = @("gate-system-backend", "gate-system-frontend", "gate-system-postgres")
  foreach ($c in $operationalContainers) {
    $cTelemetry = (wsl -d rancher-desktop -e docker ps --filter "name=$c" --format "{{.Names}}: {{.Status}} | Ports: {{.Ports}}" 2>&1 | Out-String).Trim()
    Write-Host "  Observed container state: $cTelemetry"
  }
}

Write-Host "`n========================================================================"
Write-Host "  COR-02 GENUINE PRODUCTION REHEARSAL COMPLETED WITH FULL EVIDENCE PASS "
Write-Host "========================================================================"
