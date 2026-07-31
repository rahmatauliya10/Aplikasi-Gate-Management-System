# ==============================================================================
# GMS Production Auto-Start Uninstallation Script
# ==============================================================================
# Safely unregisters 'GMS_Production_Autostart' scheduled task.
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[string]$TaskName = "GMS_Production_Autostart"

Write-Host "Unregistering Scheduled Task: $TaskName..."

try {
    [bool]$TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Host "SUCCESS: Scheduled Task '$TaskName' removed successfully." -ForegroundColor Green
} catch {
    Write-Host "Task '$TaskName' was not found or already uninstalled." -ForegroundColor Yellow
}
