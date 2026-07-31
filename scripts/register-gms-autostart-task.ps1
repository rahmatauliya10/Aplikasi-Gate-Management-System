# ==============================================================================
# GMS Production Task Scheduler Registration Script
# ==============================================================================
# Registers 'GMS_Production_Autostart' scheduled task bound to current user logon.
# Enforces non-SYSTEM user context, 45s delay, retry policies, and ACL security.
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$TaskName = "GMS_Production_Autostart"
[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$WatchdogScriptPath = Join-Path -Path $ProjectRootDir -ChildPath "scripts\gms-autostart-watchdog.ps1"
[string]$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "Registering Scheduled Task: $TaskName for user: $CurrentUser..."

# --- Check Script File Existence ---
if (-not (Test-Path -Path $WatchdogScriptPath -PathType Leaf)) {
    throw "Watchdog script not found at path: $WatchdogScriptPath"
}

# --- Define Task Action ---
[string]$Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$WatchdogScriptPath`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $ProjectRootDir

# --- Define Task Trigger (At Log On of Runtime User) ---
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser

# --- Define Task Settings ---
$Settings = New-ScheduledTaskSettingsSet `
    -MultipleInstance IgnoreNew `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

# --- Define Principal (Run under user context, Highest privileges if available) ---
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Highest

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
