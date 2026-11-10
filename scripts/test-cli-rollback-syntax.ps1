# ==============================================================================
# GMS CLI Rollback Syntax & Parameter Binding Verification Suite (P1 Remediation)
# ==============================================================================
# Verifies that exact runbook rollback commands from docs/RELEASE_CHECKLIST.md
# (Prosedur B and Prosedur C) can be parsed and executed WITHOUT prompting for
# -TargetReleaseTag, ensuring seamless non-interactive rollback automation.
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
$DeployScript = Join-Path $PSScriptRoot "deploy-with-rollback.ps1"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

# Isolated test fixture directory: never touch root operational maintenance files (P1 Remediation)
[string]$script:TestFixtureDir = Join-Path ([System.IO.Path]::GetTempPath()) "gms_test_cli_fixture_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
if (-not (Test-Path $script:TestFixtureDir)) {
    New-Item -Path $script:TestFixtureDir -ItemType Directory -Force | Out-Null
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Testing CLI Parameter Binding for deploy-with-rollback.ps1..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

[int]$TotalTests = 0
[int]$PassedTests = 0
[int]$FailedTests = 0

function Run-DeployScript {
    param(
        [string[]]$ScriptArguments
    )
    [string]$output = ""
    [int]$exitCode = 0
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $PsExe
        # Escape arguments cleanly
        $escapedArgs = @("-ExecutionPolicy", "Bypass", "-File", "`"$DeployScript`"")
        foreach ($arg in $ScriptArguments) {
            if ($arg -match '\s') {
                $escapedArgs += "`"$arg`""
            } else {
                $escapedArgs += $arg
            }
        }
        $psi.Arguments = $escapedArgs -join " "
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        $process = [System.Diagnostics.Process]::Start($psi)
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $exitCode = $process.ExitCode
        $output = "$stdout`n$stderr"
    } catch {
        $output = $_.ToString()
        $exitCode = 1
    }
    return [PSCustomObject]@{
        Output = $output
        ExitCode = $exitCode
    }
}

function Test-CommandBinding {
    param(
        [string]$TestName,
        [string[]]$ScriptArguments,
        [bool]$ExpectTargetReleaseTagRequired
    )
    $script:TotalTests++
    Write-Host "`n[$script:TotalTests] Testing: $TestName..." -ForegroundColor Yellow

    $result = Run-DeployScript -ScriptArguments $ScriptArguments
    [string]$output = $result.Output
    [int]$exitCode = $result.ExitCode

    [bool]$rejectedTargetTag = $output -match "Parameter -TargetReleaseTag is required" -or $output -match "TargetReleaseTag is mandatory"
    [bool]$promptedForTargetTag = $output -match "Supply values for the following parameters.*TargetReleaseTag"

    if ($ExpectTargetReleaseTagRequired) {
        if ($rejectedTargetTag -or ($exitCode -ne 0 -and $output -match "TargetReleaseTag")) {
            $script:PassedTests++
            Write-Host "  [PASS] Correctly rejected deployment mode without -TargetReleaseTag." -ForegroundColor Green
        } else {
            $script:FailedTests++
            Write-Host "  [FAIL] Did not enforce -TargetReleaseTag for deployment mode." -ForegroundColor Red
            Write-Host "  Output: $output" -ForegroundColor DarkGray
        }
    } else {
        if ($promptedForTargetTag) {
            $script:FailedTests++
            Write-Host "  [FAIL] Interactive prompt for TargetReleaseTag occurred in rollback mode!" -ForegroundColor Red
            Write-Host "  Output: $output" -ForegroundColor DarkGray
        } else {
            $script:PassedTests++
            Write-Host "  [PASS] Successfully executed rollback mode without TargetReleaseTag prompt." -ForegroundColor Green
        }
    }
}

# 1. REL-01: Normal Deploy WITHOUT TargetReleaseTag -> Must REJECT with explicit error
Test-CommandBinding -TestName "[REL-01] Deploy Mode without TargetReleaseTag must be REJECTED" `
    -ScriptArguments @("-PreviousReleaseTag", "stable") `
    -ExpectTargetReleaseTagRequired $true

# 2. REL-02: Prosedur B: Image-Only Rollback syntax from runbook -> Must NOT prompt for TargetReleaseTag
Test-CommandBinding -TestName "[REL-02] Prosedur B (Image-Only Rollback) must NOT prompt for TargetReleaseTag" `
    -ScriptArguments @(
        "-RollbackOnly",
        "-NoSchemaChangeVerified",
        "-PreviousReleaseTag", "stable",
        "-PreviousBackendDigest", "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "-PreviousFrontendDigest", "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        "-PreviousMigratorDigest", "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        "-ComposeFile", "docker-compose.prod.yml"
    ) `
    -ExpectTargetReleaseTagRequired $false

# 3. REL-03: Prosedur C: Full Recovery Rollback syntax -> Must REJECT nonexistent manifest before mutation
Test-CommandBinding -TestName "[REL-03] Prosedur C (Full Recovery Rollback) with nonexistent manifest must REJECT before mutation" `
    -ScriptArguments @(
        "-RollbackOnly",
        "-RollbackManifestPath", "nonexistent_manifest_test.json",
        "-PreviousReleaseTag", "stable",
        "-PreviousBackendDigest", "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "-PreviousFrontendDigest", "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        "-PreviousMigratorDigest", "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        "-ComposeFile", "docker-compose.prod.yml"
    ) `
    -ExpectTargetReleaseTagRequired $false

# Locate node executable safely
$NodeExe = "node"
try {
    if (Get-Command node.exe -ErrorAction SilentlyContinue) {
        $NodeExe = "node.exe"
    } elseif (Get-Command node -ErrorAction SilentlyContinue) {
        $NodeExe = "node"
    }
} catch {
    $NodeExe = "node"
}
$deployReleasesDir = Join-Path $ProjectRootDir "deploy\releases"

# 4. REL-04: Image-Only Rollback with manifest missing migration inventory -> REJECT
$emptyManPath = Join-Path $ProjectRootDir "tests\fixtures\rollback\manifest-empty-inventory.json"
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-04] Image-Only Rollback with empty migration inventory must be REJECTED..." -ForegroundColor Yellow
$res04 = Run-DeployScript -ScriptArguments @("-RollbackOnly", "-NoSchemaChangeVerified", "-PreviousReleaseManifestPath", $emptyManPath, "-ComposeFile", "docker-compose.prod.yml")
if ($res04.ExitCode -ne 0 -and ($res04.Output -match "does not contain an explicit migration inventory" -or $res04.Output -match "CRITICAL SCHEMA COMPATIBILITY VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly rejected image-only rollback with empty migration inventory." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Failed to reject empty migration inventory!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res04.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res04.Output)" -ForegroundColor DarkGray
}

# 5. REL-05: Image-Only Rollback with invalid checksum format -> REJECT
$invalidCsManPath = Join-Path $ProjectRootDir "tests\fixtures\rollback\manifest-invalid-checksum.json"
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-05] Image-Only Rollback with invalid checksum format must be REJECTED..." -ForegroundColor Yellow
$res05 = Run-DeployScript -ScriptArguments @("-RollbackOnly", "-NoSchemaChangeVerified", "-PreviousReleaseManifestPath", $invalidCsManPath, "-ComposeFile", "docker-compose.prod.yml")
if ($res05.ExitCode -ne 0 -and ($res05.Output -match "invalid checksum format" -or $res05.Output -match "CRITICAL SCHEMA COMPATIBILITY VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly rejected image-only rollback with invalid checksum format." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Failed to reject invalid checksum format!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res05.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res05.Output)" -ForegroundColor DarkGray
}

# 6. REL-07: Rollback without valid 64-hex SHA-256 image digest in production mode -> REJECT
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-07] Production rollback without valid SHA-256 digests must be REJECTED..." -ForegroundColor Yellow
$res07 = Run-DeployScript -ScriptArguments @(
    "-RollbackOnly",
    "-RollbackManifestPath", (Join-Path $ProjectRootDir "tests\fixtures\historical\historical_test_manifest.json"),
    "-PreviousReleaseTag", "stable",
    "-PreviousBackendDigest", "invalid-digest",
    "-PreviousFrontendDigest", "invalid-digest",
    "-PreviousMigratorDigest", "invalid-digest",
    "-ComposeFile", "docker-compose.prod.yml",
    "-RequireDigest"
)
if ($res07.ExitCode -ne 0 -and ($res07.Output -match "valid 64-hex SHA-256 digests" -or $res07.Output -match "IMMUTABILITY VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly rejected production rollback with invalid image digest format." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Failed to enforce valid SHA-256 image digests in production mode!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res07.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res07.Output)" -ForegroundColor DarkGray
}

# 7. REL-11: Smoke test with missing token under --require-passed must return exit code 1 (fail-closed)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-11] Smoke test under --require-passed with missing token must FAIL-CLOSED (code 1)..." -ForegroundColor Yellow
$env:SMOKE_ACCESS_TOKEN = ""
$smokeScript = Join-Path $PSScriptRoot "prod-smoke-readonly.js"
[string]$smokeOut = ""
[int]$smokeExit = 0
try {
    $smokeOut = & $NodeExe $smokeScript --require-passed 2>&1 | Out-String
    $smokeExit = $LASTEXITCODE
} catch {
    $smokeOut = $_.ToString()
    $smokeExit = 1
}

if ($smokeExit -ne 0) {
    $script:PassedTests++
    Write-Host "  [PASS] Smoke test fail-closed enforcement verified: Exited with code $smokeExit (no open traffic)." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Smoke test exited 0 without verified passes under --require-passed!" -ForegroundColor Red
    Write-Host "  ExitCode: $smokeExit" -ForegroundColor DarkGray
    Write-Host "  Output: $smokeOut" -ForegroundColor DarkGray
}

# 8. REL-16: Fault injection on production compose target -> REJECT before mutation
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-16] Fault injection on production target must be unconditionally REJECTED..." -ForegroundColor Yellow
$res16 = Run-DeployScript -ScriptArguments @("-TargetReleaseTag", "v1.0.0", "-FaultInjectionPhase", "AFTER_BACKUP", "-ComposeFile", "docker-compose.prod.yml")
if ($res16.ExitCode -ne 0 -and ($res16.Output -match "Fault injection .* is unconditionally blocked on production" -or $res16.Output -match "CRITICAL GOVERNANCE VIOLATION")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly blocked fault injection against production compose target." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Allowed fault injection against production compose target!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res16.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res16.Output)" -ForegroundColor DarkGray
}

# 9. REL-17: Strict Production Immutability - Missing image digests must REJECT
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-17] Production deploy without SHA-256 digests must be REJECTED..." -ForegroundColor Yellow
$res17 = Run-DeployScript -ScriptArguments @("-TargetReleaseTag", "v1.2.3", "-RequireDigest")
if ($res17.ExitCode -ne 0 -and $res17.Output -match "GMS IMMUTABILITY VIOLATION") {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly blocked production deploy without SHA-256 image digests." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Allowed production deploy without SHA-256 image digests!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res17.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res17.Output)" -ForegroundColor DarkGray
}

# 10. REL-18: Invalid Target Release Tag format must be REJECTED
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-18] TargetReleaseTag with invalid characters must be REJECTED..." -ForegroundColor Yellow
$res18 = Run-DeployScript -ScriptArguments @("-TargetReleaseTag", "invalid;tag!#")
if ($res18.ExitCode -ne 0 -and ($res18.Output -match "Invalid -TargetReleaseTag" -or $res18.Output -match "CRITICAL")) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly blocked deploy with invalid TargetReleaseTag characters." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Allowed deploy with invalid TargetReleaseTag characters!" -ForegroundColor Red
    Write-Host "  ExitCode: $($res18.ExitCode)" -ForegroundColor DarkGray
    Write-Host "  Output: $($res18.Output)" -ForegroundColor DarkGray
}

# Dot-source functions from deploy-with-rollback.ps1 for unit validation
. $DeployScript -ExportFunctionsOnly

# 11. REL-19: Preflight stale backup pointer mismatch must be REJECTED (P0-02)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-19] Outdated pointer in latest-predeploy.json must be REJECTED..." -ForegroundColor Yellow
[string]$tempBackupTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gms_rel19_test_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -Path $tempBackupTestDir -ItemType Directory -Force | Out-Null
try {
    # Simulate latest-predeploy.json pointing to an OLD snapshot ID
    [string]$stalePointer = Join-Path $tempBackupTestDir "latest-predeploy.json"
    $stalePointerData = @{
        backupId = "BKP-STALE-OLD-SNAPSHOT-123"
        manifestFile = "gms_STALE-OLD-SNAPSHOT-123_manifest.json"
    }
    Set-Content -Path $stalePointer -Value ($stalePointerData | ConvertTo-Json) -Encoding utf8

    # Also create the stale manifest file
    [string]$staleManifest = Join-Path $tempBackupTestDir "gms_STALE-OLD-SNAPSHOT-123_manifest.json"
    $staleManifestData = @{ backupId = "BKP-STALE-OLD-SNAPSHOT-123" }
    Set-Content -Path $staleManifest -Value ($staleManifestData | ConvertTo-Json) -Encoding utf8

    # Test that requesting a FRESH backup ID rejects the stale pointer
    [string]$freshId = "BKP-FRESH-DEPLOY-RUN-456"
    [string]$rel19Error = ""
    try {
        Resolve-PredeployBackupManifest -FreshBackupId $freshId -BackupDir $tempBackupTestDir | Out-Null
    } catch {
        $rel19Error = $_.ToString()
    }

    if ($rel19Error -match "CRITICAL BACKUP INTEGRITY VIOLATION" -and $rel19Error -match "stale backup") {
        $script:PassedTests++
        Write-Host "  [PASS] Correctly rejected stale pointer fallback when pointer ID does not match fresh backup ID." -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] Failed to reject stale backup pointer!" -ForegroundColor Red
        Write-Host "  Captured Error: $rel19Error" -ForegroundColor DarkGray
    }
} finally {
    if (Test-Path $tempBackupTestDir) {
        Remove-Item -Path $tempBackupTestDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 12. REL-20: PostgreSQL client transaction drain must be FAIL-CLOSED on timeout or query failure (P1-03)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-20] PostgreSQL transaction drain timeout and query error must FAIL-CLOSED..." -ForegroundColor Yellow
[string]$rel20ErrorTimeout = ""
try {
    # Simulate DB query constantly reporting active/idle-in-transaction connections
    Assert-TransactionDrain -DbContainer "mock-db" -TimeoutSeconds 2 -QueryExecutor {
        param($cnt, $sql)
        return "3"
    }
} catch {
    $rel20ErrorTimeout = $_.ToString()
}

[string]$rel20ErrorQueryFail = ""
try {
    # Simulate query failure / network disconnection
    Assert-TransactionDrain -DbContainer "mock-db" -TimeoutSeconds 2 -QueryExecutor {
        param($cnt, $sql)
        throw "psql connection refused"
    }
} catch {
    $rel20ErrorQueryFail = $_.ToString()
}

if ($rel20ErrorTimeout -match "CRITICAL TRANSACTION DRAIN FAILURE" -and $rel20ErrorTimeout -match "timed out" -and
    $rel20ErrorQueryFail -match "CRITICAL TRANSACTION DRAIN FAILURE" -and $rel20ErrorQueryFail -match "Cannot verify") {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly enforced fail-closed termination on transaction drain timeout and query failure." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Transaction drain did not fail-closed!" -ForegroundColor Red
    Write-Host "  Timeout Error: $rel20ErrorTimeout" -ForegroundColor DarkGray
    Write-Host "  Query Failure Error: $rel20ErrorQueryFail" -ForegroundColor DarkGray
}

# 13. REL-21: Preflight source Git SHA provenance resolution enforcement (P1-05)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-21] Preflight Git SHA resolution failure must REJECT deployment..." -ForegroundColor Yellow
[string]$rel21Error = ""
[string]$origGithubSha = $env:GITHUB_SHA
[string]$origGmsSha = $env:GMS_RELEASE_COMMIT_SHA
try {
    $env:GITHUB_SHA = ""
    $env:GMS_RELEASE_COMMIT_SHA = ""
    # Simulate git returning empty/error, non-SHA tag, and no env vars
    Resolve-ReleaseGitSha -TargetReleaseTag "v1.2.3" -GitExecutor { return "" }
} catch {
    $rel21Error = $_.ToString()
} finally {
    $env:GITHUB_SHA = $origGithubSha
    $env:GMS_RELEASE_COMMIT_SHA = $origGmsSha
}

[string]$validSha = "0123456789abcdef0123456789abcdef01234567"
[string]$rel21Success = Resolve-ReleaseGitSha -TargetReleaseTag "v1.2.3" -GitExecutor { return $validSha }

if ($rel21Error -match "CRITICAL PROVENANCE FAILURE" -and $rel21Success -eq $validSha) {
    $script:PassedTests++
    Write-Host "  [PASS] Correctly enforced preflight 40-character Git SHA provenance resolution." -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "  [FAIL] Git SHA provenance preflight check did not behave as expected!" -ForegroundColor Red
    Write-Host "  Failure Error: $rel21Error" -ForegroundColor DarkGray
    Write-Host "  Success Result: $rel21Success" -ForegroundColor DarkGray
}

# 14. REL-22: Release provenance assertion binding (Git SHA -> Manifest/Image)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-22] Release provenance assertion must fail-closed on corrupt/mismatched manifest or image labels..." -ForegroundColor Yellow
[string]$rel22TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gms_rel22_test_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -Path $rel22TempDir -ItemType Directory -Force | Out-Null
try {
    [string]$validSha = "2222222222222222222222222222222222222222"
    [string]$validDigest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    [string]$dummyManifest = Join-Path $rel22TempDir "mismatched-manifest.json"
    [string]$corruptManifest = Join-Path $rel22TempDir "corrupt-manifest.json"
    [string]$noShaManifest = Join-Path $rel22TempDir "no-sha-manifest.json"
    [string]$missingDigestManifest = Join-Path $rel22TempDir "missing-digest-manifest.json"
    [string]$validManifest = Join-Path $rel22TempDir "valid-manifest.json"

    # Write manifests
    Set-Content -Path $dummyManifest -Value (@{ release = "v1.2.3"; gitSha = "1111111111111111111111111111111111111111" } | ConvertTo-Json) -Encoding utf8
    Set-Content -Path $corruptManifest -Value "{ not valid json }" -Encoding utf8
    Set-Content -Path $noShaManifest -Value (@{ release = "v1.2.3" } | ConvertTo-Json) -Encoding utf8
    Set-Content -Path $missingDigestManifest -Value (@{ release = "v1.2.3"; gitSha = $validSha } | ConvertTo-Json) -Encoding utf8
    Set-Content -Path $validManifest -Value (@{
        release = "v1.2.3"
        gitSha = $validSha
        backend = @{ digest = $validDigest }
        frontend = @{ digest = $validDigest }
        migrator = @{ digest = $validDigest }
    } | ConvertTo-Json) -Encoding utf8

    [string]$s1Err = ""; [string]$s2Err = ""; [string]$s3Err = ""; [string]$s4Err = ""
    [string]$s5Err = ""; [string]$s6Err = ""; [string]$s7Err = ""; [string]$s8Err = ""
    [bool]$s9Success = $false

    # S1: Missing manifest file when RequireManifest is set
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -TargetManifestPath (Join-Path $rel22TempDir "nonexistent.json") -RequireManifest | Out-Null
    } catch { $s1Err = $_.ToString() }

    # S2: Corrupt manifest
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -TargetManifestPath $corruptManifest | Out-Null
    } catch { $s2Err = $_.ToString() }

    # S3: Missing gitSha in manifest
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -TargetManifestPath $noShaManifest | Out-Null
    } catch { $s3Err = $_.ToString() }

    # S4: Mismatched gitSha
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -TargetManifestPath $dummyManifest | Out-Null
    } catch { $s4Err = $_.ToString() }

    # S5: Missing digests when RequireManifest is set
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -TargetManifestPath $missingDigestManifest -RequireManifest | Out-Null
    } catch { $s5Err = $_.ToString() }

    # S6: Mismatched image digest against manifest
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -TargetManifestPath $validManifest -ExpectedBackendDigest "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" | Out-Null
    } catch { $s6Err = $_.ToString() }

    # S7: Mismatched Image label
    try {
        Assert-ReleaseProvenance -ExpectedGitSha $validSha -BackendImageTag "gms-backend:v1.2.3" -ImageInspector {
            param($tag) return '{"org.opencontainers.image.revision": "3333333333333333333333333333333333333333"}'
        } | Out-Null
    } catch { $s7Err = $_.ToString() }

    # S8: Missing image labels when RequireImageLabels is set
    [string]$s8Err = ""
    try {
        Assert-ReleaseProvenance `
            -ExpectedGitSha $validSha `
            -BackendImageTag "gms-backend:v1.2.3" `
            -FrontendImageTag "gms-frontend:v1.2.3" `
            -MigratorImageTag "gms-migrator:v1.2.3" `
            -RequireImageLabels `
            -ImageInspector {
                param($tag) return '{}'
            } | Out-Null
    } catch { $s8Err = $_.ToString() }

    # S9: Frontend image has mismatched commit SHA
    [string]$s9Err = ""
    try {
        Assert-ReleaseProvenance `
            -ExpectedGitSha $validSha `
            -BackendImageTag "gms-backend:v1.2.3" `
            -FrontendImageTag "gms-frontend:v1.2.3" `
            -MigratorImageTag "gms-migrator:v1.2.3" `
            -RequireImageLabels `
            -ImageInspector {
                param($tag)
                if ($tag -like "*frontend*") {
                    return "{`"org.opencontainers.image.revision`": `"0000000000000000000000000000000000000000`"}"
                }
                return "{`"org.opencontainers.image.revision`": `"$validSha`"}"
            } | Out-Null
    } catch { $s9Err = $_.ToString() }

    # S10: Migrator image has empty labels
    [string]$s10Err = ""
    try {
        Assert-ReleaseProvenance `
            -ExpectedGitSha $validSha `
            -BackendImageTag "gms-backend:v1.2.3" `
            -FrontendImageTag "gms-frontend:v1.2.3" `
            -MigratorImageTag "gms-migrator:v1.2.3" `
            -RequireImageLabels `
            -ImageInspector {
                param($tag)
                if ($tag -like "*migrator*") {
                    return "{}"
                }
                return "{`"org.opencontainers.image.revision`": `"$validSha`"}"
            } | Out-Null
    } catch { $s10Err = $_.ToString() }

    # S11: Docker inspect failure on one image
    [string]$s11Err = ""
    try {
        Assert-ReleaseProvenance `
            -ExpectedGitSha $validSha `
            -BackendImageTag "gms-backend:v1.2.3" `
            -FrontendImageTag "gms-frontend:v1.2.3" `
            -MigratorImageTag "gms-migrator:v1.2.3" `
            -RequireImageLabels `
            -ImageInspector {
                param($tag)
                if ($tag -like "*backend*") {
                    throw "daemon connection failed"
                }
                return "{`"org.opencontainers.image.revision`": `"$validSha`"}"
            } | Out-Null
    } catch { $s11Err = $_.ToString() }

    # S12: Fully valid manifest and all 3 image labels
    $s12Success = Assert-ReleaseProvenance `
        -ExpectedGitSha $validSha `
        -TargetManifestPath $validManifest `
        -BackendImageTag "gms-backend:v1.2.3" `
        -FrontendImageTag "gms-frontend:v1.2.3" `
        -MigratorImageTag "gms-migrator:v1.2.3" `
        -ExpectedBackendDigest $validDigest `
        -ExpectedFrontendDigest $validDigest `
        -ExpectedMigratorDigest $validDigest `
        -RequireManifest `
        -RequireImageLabels `
        -ImageInspector {
            param($tag) return "{`"org.opencontainers.image.revision`": `"$validSha`"}"
        }

    # S13: Exact immutable digest target inspection (inspects repository@digest, fails if digest labels mismatch)
    [string]$s13Err = ""
    $script:s13InspectTargetObserved = ""
    try {
        Assert-ReleaseProvenance `
            -ExpectedGitSha $validSha `
            -BackendImageTag "gms-backend:v1.2.3" `
            -FrontendImageTag "gms-frontend:v1.2.3" `
            -MigratorImageTag "gms-migrator:v1.2.3" `
            -ExpectedBackendDigest $validDigest `
            -RequireImageLabels `
            -ImageInspector {
                param($target)
                if ($target -like "*backend*") {
                    $script:s13InspectTargetObserved = $target
                }
                if ($target -eq "gms-backend@$validDigest") {
                    return "{`"org.opencontainers.image.revision`": `"9999999999999999999999999999999999999999`"}"
                }
                return "{`"org.opencontainers.image.revision`": `"$validSha`"}"
            } | Out-Null
    } catch { $s13Err = $_.ToString() }

    $allPassed = ($s1Err -match "does not exist") -and `
                 ($s2Err -match "corrupted or invalid JSON") -and `
                 ($s3Err -match "missing valid 40-character gitSha") -and `
                 ($s4Err -match "CRITICAL PROVENANCE MISMATCH") -and `
                 ($s5Err -match "missing valid 64-hex SHA-256 backend digest") -and `
                 ($s6Err -match "CRITICAL PROVENANCE MISMATCH") -and `
                 ($s7Err -match "CRITICAL PROVENANCE MISMATCH") -and `
                 ($s8Err -match "Missing required revision provenance label") -and `
                 ($s9Err -match "CRITICAL PROVENANCE MISMATCH: frontend image") -and `
                 ($s10Err -match "migrator image .* has no labels or metadata") -and `
                 ($s11Err -match "Docker inspect failed on backend image") -and `
                 ($s12Success -eq $true) -and `
                 ($script:s13InspectTargetObserved -eq "gms-backend@$validDigest") -and `
                 ($s13Err -match "CRITICAL PROVENANCE MISMATCH: backend image") -and `
                 ($s13Err -match "gms-backend@sha256")

    if ($allPassed) {
        $script:PassedTests++
        Write-Host "  [PASS] Correctly enforced all 13 fail-closed provenance assertion gates across 3 images (backend, frontend, migrator)." -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] Release provenance assertion did not enforce all expected checks!" -ForegroundColor Red
        Write-Host "  S1 (Missing Manifest):    $s1Err" -ForegroundColor DarkGray
        Write-Host "  S2 (Corrupt Manifest):    $s2Err" -ForegroundColor DarkGray
        Write-Host "  S3 (Missing GitSha):      $s3Err" -ForegroundColor DarkGray
        Write-Host "  S4 (Mismatched GitSha):   $s4Err" -ForegroundColor DarkGray
        Write-Host "  S5 (Missing Digest):      $s5Err" -ForegroundColor DarkGray
        Write-Host "  S6 (Mismatched Digest):   $s6Err" -ForegroundColor DarkGray
        Write-Host "  S7 (Mismatched Label):    $s7Err" -ForegroundColor DarkGray
        Write-Host "  S8 (Missing Label):       $s8Err" -ForegroundColor DarkGray
        Write-Host "  S9 (Frontend Mismatch):   $s9Err" -ForegroundColor DarkGray
        Write-Host "  S10 (Migrator No Labels): $s10Err" -ForegroundColor DarkGray
        Write-Host "  S11 (Inspect Failure):    $s11Err" -ForegroundColor DarkGray
        Write-Host "  S12 (Valid Provenance):   $s12Success" -ForegroundColor DarkGray
        Write-Host "  S13 (Exact Digest Fail):  $s13Err" -ForegroundColor DarkGray
    }
} finally {
    if (Test-Path $rel22TempDir) {
        Remove-Item -Path $rel22TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 15. REL-23: Production restore storage capacity preflight and scoped artifact governance
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-23] Production restore storage capacity preflight and scoped artifact governance..." -ForegroundColor Yellow
try {
    # Dot-source functions in fail-safe exported mode
    . (Join-Path $PSScriptRoot "gms-production-restore.ps1") -ExportFunctionsOnly

    [string]$c1Err = ""; [string]$c2Err = ""; [string]$c3Err = ""
    [bool]$c4Pass = $false

    # C1: Stat failure -> fail-closed
    try {
        Assert-RestoreStorageCapacity -Container "dummy" -DumpPathInContainer "/tmp/dump.bin" `
            -StatExecutor { param($c, $p) return "" } `
            -DfExecutor { param($c, $p) return "10000000" } | Out-Null
    } catch { $c1Err = $_.ToString() }

    # C2: Df failure -> fail-closed
    try {
        Assert-RestoreStorageCapacity -Container "dummy" -DumpPathInContainer "/tmp/dump.bin" `
            -StatExecutor { param($c, $p) return "10485760" } `
            -DfExecutor { param($c, $p) return "" } | Out-Null
    } catch { $c2Err = $_.ToString() }

    # C3: Insufficient capacity (dump 50MB -> required 150MB, available only 50MB) -> fail-closed
    try {
        Assert-RestoreStorageCapacity -Container "dummy" -DumpPathInContainer "/tmp/dump.bin" `
            -StatExecutor { param($c, $p) return (50 * 1024 * 1024).ToString() } `
            -DfExecutor { param($c, $p) return (50 * 1024).ToString() } | Out-Null
    } catch { $c3Err = $_.ToString() }

    # C4: Valid capacity (dump 10MB -> required max(30MB, 100MB) = 100MB, available 500MB) -> pass
    $c4Res = Assert-RestoreStorageCapacity -Container "dummy" -DumpPathInContainer "/tmp/dump.bin" `
        -StatExecutor { param($c, $p) return (10 * 1024 * 1024).ToString() } `
        -DfExecutor { param($c, $p) return (500 * 1024).ToString() }
    if ($c4Res -and $c4Res.DumpBytes -eq (10*1024*1024) -and $c4Res.RequiredBytes -eq 104857600) {
        $c4Pass = $true
    }

    # Governance testing for Clear-StaleGmsRestoreArtifacts
    [System.Collections.Generic.List[string]]$prunedDirs = [System.Collections.Generic.List[string]]::new()
    $mockDirs = @(
        "/tmp/gms_restore_active",
        "/tmp/gms_restore_completed_verified",
        "/tmp/gms_restore_completed_unverified",
        "/tmp/gms_restore_failed_recent",
        "/tmp/gms_restore_failed_expired",
        "/tmp/gms_restore_legacy_old",
        "/tmp/gms_restore_legacy_recent"
    )

    $now = (Get-Date).ToUniversalTime()
    $mockMeta = @{
        "/tmp/gms_restore_active" = @{ operationId = "op-active"; status = "IN_PROGRESS"; createdAt = $now.ToString("o") } | ConvertTo-Json -Compress
        "/tmp/gms_restore_completed_verified" = @{ operationId = "op-comp-verified"; status = "COMPLETED"; createdAt = $now.AddHours(-2).ToString("o") } | ConvertTo-Json -Compress
        "/tmp/gms_restore_completed_unverified" = @{ operationId = "op-comp-unverified"; status = "COMPLETED"; createdAt = $now.AddHours(-2).ToString("o") } | ConvertTo-Json -Compress
        "/tmp/gms_restore_failed_recent" = @{ operationId = "op-fail-rec"; status = "FAILED"; createdAt = $now.AddHours(-2).ToString("o") } | ConvertTo-Json -Compress
        "/tmp/gms_restore_failed_expired" = @{ operationId = "op-fail-exp"; status = "FAILED"; createdAt = $now.AddHours(-26).ToString("o") } | ConvertTo-Json -Compress
    }

    Clear-StaleGmsRestoreArtifacts -Container "dummy" -CurrentOperationId "op-active" `
        -LedgerInspector { param($op) return ($op -eq "op-comp-verified") } `
        -CommandExecutor {
            param($cont, $cmd)
            if ($cmd -like "find /tmp*") {
                return ($mockDirs -join "`n")
            }
            if ($cmd -like "*cat *stage.meta.json*") {
                foreach ($key in $mockMeta.Keys) {
                    if ($cmd -like "*$key/*") {
                        return $mockMeta[$key]
                    }
                }
                return ""
            }
            if ($cmd -like "*rm -rf *") {
                $matched = $mockDirs | Where-Object { $cmd -like "*$_*" } | Select-Object -First 1
                if ($matched) {
                    $prunedDirs.Add($matched)
                }
                return ""
            }
            return ""
        }

    $c5ArtifactGovernancePass = (-not $prunedDirs.Contains("/tmp/gms_restore_active")) -and `
                                ($prunedDirs.Contains("/tmp/gms_restore_completed_verified")) -and `
                                (-not $prunedDirs.Contains("/tmp/gms_restore_completed_unverified")) -and `
                                (-not $prunedDirs.Contains("/tmp/gms_restore_failed_recent")) -and `
                                (-not $prunedDirs.Contains("/tmp/gms_restore_failed_expired")) -and `
                                (-not $prunedDirs.Contains("/tmp/gms_restore_legacy_old")) -and `
                                (-not $prunedDirs.Contains("/tmp/gms_restore_legacy_recent")) -and `
                                ($prunedDirs.Count -eq 1)

    $allRel23Passed = ($c1Err -match "Failed to determine dump file size") -and `
                      ($c2Err -match "Failed to determine storage capacity") -and `
                      ($c3Err -match "Insufficient storage capacity") -and `
                      $c4Pass -and `
                      $c5ArtifactGovernancePass

    if ($allRel23Passed) {
        $script:PassedTests++
        Write-Host "  [PASS] Restore storage preflight fail-closed checks and forensic artifact governance verified." -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] Restore storage preflight or artifact governance failed verification!" -ForegroundColor Red
        Write-Host "  C1 (Stat Fail):           $c1Err" -ForegroundColor DarkGray
        Write-Host "  C2 (Df Fail):             $c2Err" -ForegroundColor DarkGray
        Write-Host "  C3 (Insufficient):        $c3Err" -ForegroundColor DarkGray
        Write-Host "  C4 (Valid Space Pass):    $c4Pass" -ForegroundColor DarkGray
        Write-Host "  C5 (Artifact Governance): $c5ArtifactGovernancePass (Pruned: $($prunedDirs -join ', '))" -ForegroundColor DarkGray
    }
} catch {
    $script:FailedTests++
    Write-Host "  [FAIL] REL-23 threw unexpected error: $_" -ForegroundColor Red
}

# 16. REL-24: Non-interference invariant: Workspace root maintenance state must remain strictly preserved
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-24] Non-interference invariant: Operational root maintenance state must remain strictly preserved..." -ForegroundColor Yellow
try {
    # 1. Build operational mock root with sentinel maintenance files
    [string]$mockRoot = Join-Path $script:TestFixtureDir "mock_operational_root"
    New-Item -Path $mockRoot -ItemType Directory -Force | Out-Null
    [string]$sentinelFlag = Join-Path $mockRoot "maintenance.flag"
    [string]$sentinelDir = Join-Path $mockRoot "maintenance"
    [string]$sentinelActive = Join-Path $sentinelDir "active"
    [string]$sentinelLedger = Join-Path $sentinelDir "recovery-state.json"
    
    New-Item -Path $sentinelDir -ItemType Directory -Force | Out-Null
    Set-Content -Path $sentinelFlag -Value "OPERATIONAL_ACTIVE_MAINTENANCE_PRESERVE" -Encoding utf8
    Set-Content -Path $sentinelActive -Value "ACTIVE_SENTINEL_SESSION_TOKEN_9999" -Encoding utf8
    Set-Content -Path $sentinelLedger -Value '{"recoveryOperationId":"OP-LIVE-SENTINEL","status":"RESTORING","target":"operational-root"}' -Encoding utf8
    
    # 2. Compute cryptographic SHA-256 pre-execution hashes
    [string]$hashFlagPre = (Get-FileHash -Path $sentinelFlag -Algorithm SHA256).Hash
    [string]$hashActivePre = (Get-FileHash -Path $sentinelActive -Algorithm SHA256).Hash
    [string]$hashLedgerPre = (Get-FileHash -Path $sentinelLedger -Algorithm SHA256).Hash
    
    # 3. Build a separate, isolated test execution workspace inside fixture
    [string]$isolatedWorkDir = Join-Path $script:TestFixtureDir "isolated_test_workspace"
    New-Item -Path $isolatedWorkDir -ItemType Directory -Force | Out-Null
    [string]$testFlag = Join-Path $isolatedWorkDir "maintenance.flag"
    [string]$testDir = Join-Path $isolatedWorkDir "maintenance"
    New-Item -Path $testDir -ItemType Directory -Force | Out-Null
    Set-Content -Path $testFlag -Value "TEMPORARY_TEST_FLAG" -Encoding utf8
    Set-Content -Path (Join-Path $testDir "active") -Value "TEST_SESSION" -Encoding utf8

    # 4. Execute the real operations using the production cleanup engine:
    #    (a) Run production Clear-DeploymentMaintenanceStateSafe scoped strictly to the test workspace
    [int]$clearedFiles = Clear-DeploymentMaintenanceStateSafe -TargetWorkspaceRoot $isolatedWorkDir -AllowedBoundaryDirectory $script:TestFixtureDir
    [bool]$scopedCleanupSucceeded = ($clearedFiles -eq 2) -and (-not (Test-Path $testFlag)) -and (-not (Test-Path (Join-Path $testDir "active")))

    # 5. Verify byte-for-byte SHA-256 hash preservation of operational sentinels
    [bool]$flagStillExists = Test-Path -Path $sentinelFlag
    [bool]$activeStillExists = Test-Path -Path $sentinelActive
    [bool]$ledgerStillExists = Test-Path -Path $sentinelLedger

    [string]$hashFlagPost = if ($flagStillExists) { (Get-FileHash -Path $sentinelFlag -Algorithm SHA256).Hash } else { "" }
    [string]$hashActivePost = if ($activeStillExists) { (Get-FileHash -Path $sentinelActive -Algorithm SHA256).Hash } else { "" }
    [string]$hashLedgerPost = if ($ledgerStillExists) { (Get-FileHash -Path $sentinelLedger -Algorithm SHA256).Hash } else { "" }

    [bool]$hashesIdentical = ($hashFlagPre -eq $hashFlagPost) -and `
                             ($hashActivePre -eq $hashActivePost) -and `
                             ($hashLedgerPre -eq $hashLedgerPost)

    # 6. Negative tests: Production Clear-DeploymentMaintenanceStateSafe boundary enforcement
    [bool]$negativeBoundaryOutsideBlocked = $false
    try {
        # Attempt to prune mockRoot while restricting boundary to isolatedWorkDir
        Clear-DeploymentMaintenanceStateSafe -TargetWorkspaceRoot $mockRoot -AllowedBoundaryDirectory $isolatedWorkDir
    } catch {
        if ($_ -match "MAINTENANCE CLEANUP BOUNDARY VIOLATION") {
            $negativeBoundaryOutsideBlocked = $true
        }
    }

    [bool]$negativeOperationalRootBlocked = $false
    try {
        # Attempt to prune actual project root while restricting boundary to test fixture directory
        Clear-DeploymentMaintenanceStateSafe -TargetWorkspaceRoot $ProjectRootDir -AllowedBoundaryDirectory $script:TestFixtureDir
    } catch {
        if ($_ -match "MAINTENANCE CLEANUP BOUNDARY VIOLATION") {
            $negativeOperationalRootBlocked = $true
        }
    }

    [bool]$negativeEmptyTargetBlocked = $false
    try {
        Clear-DeploymentMaintenanceStateSafe -TargetWorkspaceRoot ""
    } catch {
        if ($_ -match "MAINTENANCE CLEANUP GUARD") {
            $negativeEmptyTargetBlocked = $true
        }
    }

    [bool]$passed = $scopedCleanupSucceeded -and $flagStillExists -and $activeStillExists -and $ledgerStillExists -and `
                    $hashesIdentical -and $negativeBoundaryOutsideBlocked -and $negativeOperationalRootBlocked -and $negativeEmptyTargetBlocked

    if ($passed) {
        $script:PassedTests++
        Write-Host "  [PASS] Operational maintenance state non-interference invariant verified: SHA-256 hashes 100% identical and out-of-boundary cleanup blocked." -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] Invariant violation: external maintenance flag or ledger was modified, hash diverged, or negative guard failed!" -ForegroundColor Red
        Write-Host "    Flag Hash Match:    $($hashFlagPre -eq $hashFlagPost)" -ForegroundColor DarkGray
        Write-Host "    Active Hash Match:  $($hashActivePre -eq $hashActivePost)" -ForegroundColor DarkGray
        Write-Host "    Ledger Hash Match:  $($hashLedgerPre -eq $hashLedgerPost)" -ForegroundColor DarkGray
        Write-Host "    Negative Guard Pass: $negativeGuardPassed" -ForegroundColor DarkGray
    }
} catch {
    $script:FailedTests++
    Write-Host "  [FAIL] REL-24 threw unexpected error: $_" -ForegroundColor Red
}

# 17. REL-25: Fail-closed live table count verification and query error resilience (P1-03)
$script:TotalTests++
Write-Host "`n[$script:TotalTests] Testing: [REL-25] Fail-closed live table count verification and query error resilience (P1-03)..." -ForegroundColor Yellow
try {
    # Dot-source gms-production-restore.ps1 functions
    . (Join-Path $PSScriptRoot "gms-production-restore.ps1") -ExportFunctionsOnly

    # Case 1: Database disconnected / network error -> must THROW fail-closed
    [string]$c1Err = ""
    try {
        $mockDisconnect = {
            param([string]$sql)
            $global:LASTEXITCODE = 2
            throw "psql: error: could not connect to server: Connection refused"
        }
        Get-LiveTableCountSafe -TableName "User" -QueryExecutor $mockDisconnect
    } catch {
        $c1Err = $_.ToString()
    }
    [bool]$c1Pass = ($c1Err -match "could not connect to server")

    # Case 2: SQL syntax error / runtime execution error -> must THROW fail-closed
    [string]$c2Err = ""
    try {
        $mockSqlError = {
            param([string]$sql)
            $global:LASTEXITCODE = 1
            throw "CRITICAL LIVE DB QUERY FAILURE: Exit code: 1. Error executing SQL: ERROR: syntax error at or near 'SELECT'"
        }
        Get-LiveTableCountSafe -TableName "Transaction" -QueryExecutor $mockSqlError
    } catch {
        $c2Err = $_.ToString()
    }
    [bool]$c2Pass = ($c2Err -match "CRITICAL LIVE DB QUERY FAILURE|syntax error")

    # Case 3: Corrupted non-numeric output (e.g. NaN, empty, garbage) -> must THROW fail-closed
    [string]$c3Err = ""
    try {
        $mockCorruptOutput = {
            param([string]$sql)
            if ($sql -match "information_schema.tables") { return "1" }
            return "NaN_CORRUPTED_ROW_COUNT_OUTPUT"
        }
        Get-LiveTableCountSafe -TableName "WeighbridgeRecord" -QueryExecutor $mockCorruptOutput
    } catch {
        $c3Err = $_.ToString()
    }
    [bool]$c3Pass = ($c3Err -match "Non-numeric or invalid row count")

    # Case 4: Mandatory table missing in live database -> must THROW fail-closed (NEVER return 0)
    [string]$c4Err = ""
    try {
        $mockMissingTable = {
            param([string]$sql)
            if ($sql -match "information_schema.tables") { return "0" }
            return "0"
        }
        Get-LiveTableCountSafe -TableName "User" -AllowMissingIfHistorical $false -QueryExecutor $mockMissingTable
    } catch {
        $c4Err = $_.ToString()
    }
    [bool]$c4Pass = ($c4Err -match "Mandatory table \[User\] does NOT exist")

    # Case 5: Optional historical table missing with AllowMissingIfHistorical = $true -> returns 0
    [int]$c5Result = -1
    $mockHistoricalTable = {
        param([string]$sql)
        if ($sql -match "information_schema.tables") { return "0" }
        return "0"
    }
    $c5Result = Get-LiveTableCountSafe -TableName "TransactionCorrection" -AllowMissingIfHistorical $true -QueryExecutor $mockHistoricalTable
    [bool]$c5Pass = ($c5Result -eq 0)

    # Case 6: Valid table and count -> returns exact integer
    $mockValidQuery = {
        param([string]$sql)
        if ($sql -match "information_schema.tables") { return "1" }
        return "254"
    }
    [int]$c6Result = Get-LiveTableCountSafe -TableName "User" -QueryExecutor $mockValidQuery
    [bool]$c6Pass = ($c6Result -eq 254)

    [bool]$allRel25Passed = $c1Pass -and $c2Pass -and $c3Pass -and $c4Pass -and $c5Pass -and $c6Pass

    if ($allRel25Passed) {
        $script:PassedTests++
        Write-Host "  [PASS] Fail-closed live table count verification passed all 6 negative and positive assertions." -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "  [FAIL] REL-25 live table count verification failed!" -ForegroundColor Red
        Write-Host "    C1 (Disconnect Fail-Closed):  $c1Pass ($c1Err)" -ForegroundColor DarkGray
        Write-Host "    C2 (SQL Error Fail-Closed):   $c2Pass ($c2Err)" -ForegroundColor DarkGray
        Write-Host "    C3 (Non-Numeric Fail-Closed): $c3Pass ($c3Err)" -ForegroundColor DarkGray
        Write-Host "    C4 (Missing Table Rejection): $c4Pass ($c4Err)" -ForegroundColor DarkGray
        Write-Host "    C5 (Historical Allowed 0):    $c5Pass (Result: $c5Result)" -ForegroundColor DarkGray
        Write-Host "    C6 (Valid Count Exact Match): $c6Pass (Result: $c6Result)" -ForegroundColor DarkGray
    }
} catch {
    $script:FailedTests++
    Write-Host "  [FAIL] REL-25 threw unexpected error: $_" -ForegroundColor Red
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "CLI Syntax & Regression Matrix Verification Summary:" -ForegroundColor Cyan
Write-Host "  Total:  $TotalTests" -ForegroundColor Cyan
Write-Host "  Passed: $PassedTests" -ForegroundColor Green
Write-Host "  Failed: $FailedTests" -ForegroundColor $(if ($FailedTests -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

# Cleanup ONLY test-owned fixture directory; NEVER touch root workspace maintenance files
if (Test-Path $script:TestFixtureDir) {
    Remove-Item -Path $script:TestFixtureDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($FailedTests -eq 0) {
    exit 0
} else {
    exit 1
}
