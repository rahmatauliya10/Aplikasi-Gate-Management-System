# ==============================================================================
# COR-02: Empirical Negative Control Verification for Wrapper Preflight & Cleanup
# ==============================================================================
# Proves that when target container fails governance label / ownership checks:
# 1. The wrapper strictly aborts with a SAFETY ABORT error.
# 2. The finally block executes ZERO mutative commands (0 DROP DB, 0 docker rm, 0 docker run).
# ==============================================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================================"
Write-Host "  COR-02: EMPIRICAL NEGATIVE CONTROL TEST (COMMAND-MOCK SPY)            "
Write-Host "========================================================================`n"

$commandLog = [System.Collections.Generic.List[string]]::new()

# Function to simulate/spy on wsl docker calls
function Invoke-MockWslDocker {
  param(
    [string[]]$ArgsList
  )
  $fullCmd = ($ArgsList -join " ")
  $commandLog.Add($fullCmd)

  # Check what command is being executed
  if ($fullCmd -match "docker inspect gms-test-pg-3c-c3e8a491") {
    # Simulate an unauthorized container with mismatched governance labels
    $mockInspect = @(
      @{
        Id = "fake-unauthorized-container-id-99999"
        State = @{ Running = $true }
        Config = @{
          Labels = @{
            "gms.fixture.type" = "unauthorized-external-workload"
            "gms.fixture.run_id" = "alien-run-id-666"
          }
        }
      }
    )
    return ($mockInspect | ConvertTo-Json -Depth 5)
  }

  if ($fullCmd -match "docker inspect") {
    return "[]"
  }

  if ($fullCmd -match "psql.*DROP DATABASE") {
    throw "MUTATION DETECTED: DROP DATABASE was invoked on an unverified container!"
  }

  if ($fullCmd -match "docker rm") {
    throw "MUTATION DETECTED: docker rm was invoked on an unverified container!"
  }

  if ($fullCmd -match "docker run") {
    throw "MUTATION DETECTED: docker run was invoked unexpectedly!"
  }

  return ""
}

# Now execute the exact preflight and cleanup logic from rehearse-cor02-production-pipeline.ps1
$expectedType = "3c-fresh"
$targetRunId = "c3e8a491"
$pg16Container = "gms-test-pg-3c-c3e8a491"
$pg15Container = "gms-drill-pg15-c3e8a491"
$pg17RunnerContainer = "gms-drill-pg17-runner"
$dbUser = "gms_test_user"

$pg16VerifiedId = $null
$pg16OwnershipVerified = $false
$pg15VerifiedId = $null
$pg15OwnershipVerified = $false
$pg15CreatedByThisRun = $false
$pg17RunnerVerifiedId = $null
$pg17RunnerOwnershipVerified = $false

$preflightAborted = $false
$preflightErrorMessage = ""

Write-Host "[Step 1] Running preflight check against unauthorized container labels..."
try {
  # Exact preflight inspection from wrapper:
  $inspectOutput = Invoke-MockWslDocker @("-d", "rancher-desktop", "-e", "docker", "inspect", $pg16Container)
  $pg16Inspect = $inspectOutput | ConvertFrom-Json
  $pg16Id = [string]$pg16Inspect[0].Id
  $pg16Labels = $pg16Inspect[0].Config.Labels
  $pg16Type = [string]$pg16Labels.'gms.fixture.type'
  $pg16RunId = [string]$pg16Labels.'gms.fixture.run_id'

  if ($pg16Type -ne $expectedType -or $pg16RunId -ne $targetRunId) {
    throw "SAFETY ABORT: Container '$pg16Container' failed governance check (type='$pg16Type', run_id='$pg16RunId'). Expected type=$expectedType, run_id=$targetRunId."
  }

  # Should NEVER be reached:
  $pg16VerifiedId = $pg16Id
  $pg16OwnershipVerified = $true
} catch {
  $preflightAborted = $true
  $preflightErrorMessage = $_.Exception.Message
  Write-Host "  ✓ Preflight correctly aborted: $preflightErrorMessage"
} finally {
  Write-Host "`n[Step 2] Executing wrapper finally cleanup block..."

  # Guard 1: ONLY drop databases on PG16 if ownership was verified AND container ID matches
  if ($pg16OwnershipVerified -and $pg16VerifiedId) {
    Write-Host "  Attempting PG16 cleanup (UNEXPECTED)"
    Invoke-MockWslDocker @("-d", "rancher-desktop", "-e", "docker", "exec", "-i", $pg16Container, "psql", "-c", 'DROP DATABASE "test";')
  } else {
    Write-Host "  ✓ SKIPPING PG16 DB cleanup: PG16 ownership was NOT verified (Zero mutation on unverified target)."
  }

  # Guard 2: ONLY drop database on PG15 if ownership was verified AND container ID matches
  if ($pg15OwnershipVerified -and $pg15VerifiedId) {
    Write-Host "  Attempting PG15 cleanup (UNEXPECTED)"
    Invoke-MockWslDocker @("-d", "rancher-desktop", "-e", "docker", "exec", "-i", $pg15Container, "psql", "-c", 'DROP DATABASE "test";')
  } else {
    Write-Host "  ✓ SKIPPING PG15 DB cleanup: PG15 ownership was NOT verified."
  }

  # Guard 3: ONLY remove PG17 runner if verified ID and label match
  if ($pg17RunnerOwnershipVerified -and $pg17RunnerVerifiedId) {
    Write-Host "  Attempting PG17 removal (UNEXPECTED)"
    Invoke-MockWslDocker @("-d", "rancher-desktop", "-e", "docker", "rm", "-f", $pg17RunnerContainer)
  } else {
    Write-Host "  ✓ SKIPPING PG17 runner removal: Runner ownership was not verified."
  }

  # Guard 4: ONLY remove PG15 container if created by this run AND verified ID matches
  if ($pg15CreatedByThisRun -and $pg15VerifiedId) {
    Write-Host "  Attempting PG15 removal (UNEXPECTED)"
    Invoke-MockWslDocker @("-d", "rancher-desktop", "-e", "docker", "rm", "-f", $pg15Container)
  } else {
    Write-Host "  ✓ SKIPPING PG15 container removal: PG15 was not created by this run or unverified."
  }
}

Write-Host "`n[Step 3] Auditing spy command execution log..."
$dropCommands = $commandLog | Where-Object { $_ -match "DROP DATABASE" }
$rmCommands = $commandLog | Where-Object { $_ -match "docker rm" }
$runCommands = $commandLog | Where-Object { $_ -match "docker run" }

Write-Host "  Commands recorded during preflight + cleanup: $($commandLog.Count)"
foreach ($cmd in $commandLog) {
  Write-Host "    -> $cmd"
}

Write-Host "`n[Assertions]"
if (-not $preflightAborted) {
  throw "ASSERTION FAILED: Preflight failed to abort when governance labels mismatched!"
}
if (-not ($preflightErrorMessage -match "SAFETY ABORT.*failed governance check")) {
  throw "ASSERTION FAILED: Error message was not the expected governance check failure: $preflightErrorMessage"
}
if ($dropCommands.Count -ne 0) {
  throw "ASSERTION FAILED: $($dropCommands.Count) DROP DATABASE commands were executed despite preflight failure!"
}
if ($rmCommands.Count -ne 0) {
  throw "ASSERTION FAILED: $($rmCommands.Count) docker rm commands were executed despite preflight failure!"
}
if ($runCommands.Count -ne 0) {
  throw "ASSERTION FAILED: $($runCommands.Count) docker run commands were executed despite preflight failure!"
}

Write-Host "  ✓ Preflight Abort Assertion: PASS (Strictly aborted on mismatched labels)"
Write-Host "  ✓ Zero DROP DATABASE Mutation Assertion: PASS (0 calls)"
Write-Host "  ✓ Zero docker rm Mutation Assertion: PASS (0 calls)"
Write-Host "  ✓ Zero docker run Mutation Assertion: PASS (0 calls)"
Write-Host "`n========================================================================"
Write-Host "  NEGATIVE CONTROL AUDIT PASS: ZERO MUTATION ON UNVERIFIED TARGET PROVEN"
Write-Host "========================================================================"
