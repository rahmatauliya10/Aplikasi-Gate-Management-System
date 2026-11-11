#!/usr/bin/env pwsh
# ==============================================================================
# GMS PowerShell AST Syntax Validator (CI & Local Regression Gate)
# ==============================================================================
# Verifies that every single .ps1 script in the repository parses without AST
# syntax errors across both Windows PowerShell and pwsh on Linux/CI.
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
$ScriptsDir = Join-Path $ProjectRoot "scripts"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Validating PowerShell AST Syntax across $ScriptsDir..." -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

[int]$TotalScripts = 0
[int]$PassedScripts = 0
[int]$FailedScripts = 0

$PsFiles = Get-ChildItem -Path $ScriptsDir -Filter "*.ps1" -Recurse

foreach ($file in $PsFiles) {
    $TotalScripts++
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)

    if ($errors.Count -gt 0) {
        $FailedScripts++
        Write-Host "  [FAIL] $($file.Name): $($errors.Count) syntax error(s) found!" -ForegroundColor Red
        foreach ($err in $errors) {
            Write-Host "         Line $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor DarkRed
        }
    } else {
        $PassedScripts++
        Write-Host "  [PASS] $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "PowerShell AST Validation Summary:" -ForegroundColor Cyan
Write-Host "  Total:  $TotalScripts" -ForegroundColor Cyan
Write-Host "  Passed: $PassedScripts" -ForegroundColor Green
Write-Host "  Failed: $FailedScripts" -ForegroundColor $(if ($FailedScripts -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($FailedScripts -eq 0) {
    exit 0
} else {
    exit 1
}
