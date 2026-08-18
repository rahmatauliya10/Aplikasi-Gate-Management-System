# ==============================================================================
# Register GMS Production Health Monitor Scheduled Task
# ==============================================================================
# Schedules gms-health-monitor.ps1 to execute every 2 minutes in background.
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$TaskName = "GMS_Production_Health_Monitor",

    [Parameter(Mandatory=$false)]
    [int]$IntervalMinutes = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$ScriptPath = Join-Path $PSScriptRoot "gms-health-monitor.ps1"
$PsExe = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { "pwsh.exe" } elseif (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

Write-Host "Registering Scheduled Task [$TaskName] to run every $IntervalMinutes minutes..." -ForegroundColor Cyan

# Unregister existing task if present
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

$Action = New-ScheduledTaskAction -Execute $PsExe -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration ([TimeSpan]::MaxValue)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "GMS Production 2-Minute Health & Alert Monitor" | Out-Null

Write-Host "Scheduled Task [$TaskName] registered successfully." -ForegroundColor Green
