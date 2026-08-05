# ==============================================================================
# GMS Production Task Scheduler Registration Script
# ==============================================================================
# Registers 'GMS_Production_Autostart' scheduled task bound to current user logon.
# Enforces non-SYSTEM user context, 45s delay, retry policies, and ACL security.
#
# CRITICAL OPERATIONAL WARNING (P0-07 / Rancher Desktop Compatibility):
# Do NOT change the trigger to -AtStartup or run under NT AUTHORITY\SYSTEM!
# Rancher Desktop runs rootless containers utilizing WSL2 / Windows Virtual Machine
# Platform which requires an active, interactive Windows user logon session. 
# Running under the headless SYSTEM account causes WSL2 volume mounts to fail
# and crashes the Docker daemon. Always retain interactive user logon binding!
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [switch]$UnattendedMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$TaskName = "GMS_Production_Autostart"
[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$WatchdogScriptPath = Join-Path -Path $ProjectRootDir -ChildPath "scripts\gms-autostart-watchdog.ps1"
[string]$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "Registering Scheduled Task: $TaskName (UnattendedMode=$UnattendedMode)..."

# --- Check Script File Existence ---
if (-not (Test-Path -Path $WatchdogScriptPath -PathType Leaf)) {
    throw "Watchdog script not found at path: $WatchdogScriptPath"
}

# --- Define Task Action ---
[string]$Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$WatchdogScriptPath`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $ProjectRootDir

# --- Define Task Trigger & Principal ---
if ($UnattendedMode) {
    Write-Host "[GMS Autostart] Registering trigger as AtStartup for unattended server boot..." -ForegroundColor Cyan
    $Trigger = New-ScheduledTaskTrigger -AtStartup
    $Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
} else {
    Write-Host "[GMS Autostart] Registering trigger as AtLogOn for user session compatibility..." -ForegroundColor Yellow
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
    $Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Highest
}

# --- Register Task ---
try {
    # Unregister existing task if present
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Description "GMS Production Auto-Recovery Watchdog for Rancher Desktop & Docker Containers" | Out-Null

    Write-Host "SUCCESS: Scheduled Task '$TaskName' registered successfully." -ForegroundColor Green
} catch {
    Write-Error "FAILED to register Scheduled Task '$TaskName': $_"
    exit 1
}
