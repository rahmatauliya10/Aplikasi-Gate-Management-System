# ==============================================================================
# GMS Dedicated Production Account & Secure Auto-Logon Setup Script
# ==============================================================================
# Resolves P0 Blackout / Cold-Boot Recovery Gap for Rancher Desktop & Windows Server.
#
# Background:
# Rancher Desktop (WSL2/Moby Engine) requires an active Windows user session.
# Under headless NT AUTHORITY\SYSTEM at computer startup, WSL2 mounts and GUI hooks fail.
#
# Solution:
# 1. Configures a dedicated production local account (e.g., 'GMSRuntime' or current user).
# 2. Configures secure Windows AutoLogon via Winlogon registry.
# 3. Sets an immediate screen-lock trigger so physical server display remains locked.
# 4. Registers the GMS_Production_Autostart scheduled task to execute gms-autostart-watchdog.ps1 upon logon.
#
# Result:
# Upon cold-boot / power-loss restart, Windows automatically logs in GMSRuntime,
# locks the screen, initializes Rancher Desktop/Docker daemon, and launches GMS
# full-stack containers without any manual operator intervention.
# ==============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$RuntimeUser = "GMSRuntime",

    [Parameter(Mandatory=$false)]
    [string]$RuntimePassword = "",

    [Parameter(Mandatory=$false)]
    [switch]$UseCurrentUser,

    [Parameter(Mandatory=$false)]
    [switch]$EnableScreenLock = $true,

    [Parameter(Mandatory=$false)]
    [switch]$DisableAutoLogon
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Administrator Check ---
$IsAdmin = ([Security.Principal.WindowsPrincipal][System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "[ERROR] Script ini memerlukan hak akses Administrator." -ForegroundColor Red
    Write-Host "Silakan jalankan PowerShell sebagai Administrator ('Run as Administrator')." -ForegroundColor Yellow
    exit 1
}

$WinlogonPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

# --- Disable AutoLogon Mode ---
if ($DisableAutoLogon) {
    Write-Host "Menonaktifkan Windows AutoLogon..." -ForegroundColor Yellow
    Set-ItemProperty -Path $WinlogonPath -Name "AutoAdminLogon" -Value "0" -Type String
    Remove-ItemProperty -Path $WinlogonPath -Name "DefaultPassword" -ErrorAction SilentlyContinue
    Write-Host "[SUCCESS] Windows AutoLogon dinonaktifkan." -ForegroundColor Green
    exit 0
}

# --- Determine Target User ---
[string]$TargetUsername = $RuntimeUser
if ($UseCurrentUser) {
    $TargetUsername = [System.Environment]::UserName
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " GMS Production Auto-Logon & Cold-Boot Recovery Setup" -ForegroundColor Cyan
Write-Host " Target User: $TargetUsername" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# --- Check or Create User if needed ---
if (-not $UseCurrentUser) {
    $UserExists = $null
    try {
        $UserExists = Get-LocalUser -Name $TargetUsername -ErrorAction SilentlyContinue
    } catch {}

    if (-not $UserExists) {
        if (-not $RuntimePassword) {
            Write-Host "Membuat password acak 24-karakter untuk akun dedicated '$TargetUsername'..." -ForegroundColor Yellow
            $RandomBytes = New-Object byte[] 18
            [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($RandomBytes)
            $RuntimePassword = [System.Convert]::ToBase64String($RandomBytes) + "!A1a"
        }

        $SecurePass = ConvertTo-SecureString $RuntimePassword -AsPlainText -Force
        New-LocalUser -Name $TargetUsername -Password $SecurePass -FullName "GMS Production Runtime Account" -Description "Dedicated runtime account for GMS container autostart after blackout" -PasswordNeverExpires | Out-Null
        Add-LocalGroupMember -Group "Administrators" -Member $TargetUsername | Out-Null
        Write-Host "[OK] Akun lokal '$TargetUsername' berhasil dibuat dan ditambahkan ke grup Administrators." -ForegroundColor Green
    } else {
        Write-Host "[OK] Akun lokal '$TargetUsername' sudah ada." -ForegroundColor Green
        if ($RuntimePassword) {
            $SecurePass = ConvertTo-SecureString $RuntimePassword -AsPlainText -Force
            Set-LocalUser -Name $TargetUsername -Password $SecurePass -PasswordNeverExpires $true | Out-Null
        }
    }
}

if (-not $RuntimePassword -and -not $UseCurrentUser) {
    Write-Host ""
    Write-Host "Masukkan password untuk akun Windows '$TargetUsername':" -ForegroundColor Yellow
    $Cred = Get-Credential -UserName $TargetUsername -Message "Masukkan password untuk $TargetUsername"
    $RuntimePassword = $Cred.GetNetworkCredential().Password
}

# --- Configure Winlogon Registry for AutoLogon ---
Write-Host "Mengonfigurasi Registry Winlogon..." -ForegroundColor Yellow
Set-ItemProperty -Path $WinlogonPath -Name "AutoAdminLogon" -Value "1" -Type String
Set-ItemProperty -Path $WinlogonPath -Name "DefaultUserName" -Value $TargetUsername -Type String
Set-ItemProperty -Path $WinlogonPath -Name "DefaultDomainName" -Value $env:COMPUTERNAME -Type String

if ($RuntimePassword) {
    Set-ItemProperty -Path $WinlogonPath -Name "DefaultPassword" -Value $RuntimePassword -Type String
}

# Force auto logon count indefinite
Set-ItemProperty -Path $WinlogonPath -Name "ForceAutoLogon" -Value "1" -Type String -ErrorAction SilentlyContinue

Write-Host "[OK] Registry Winlogon berhasil dikonfigurasi untuk auto-logon '$TargetUsername'." -ForegroundColor Green

# --- Setup Auto Screen Lock on Logon if requested ---
if ($EnableScreenLock) {
    Write-Host "Mengonfigurasi penguncian layar otomatis (LockWorkStation) pasca Auto-Logon..." -ForegroundColor Yellow
    [string]$LockTaskName = "GMS_Security_LockScreen_OnLogon"
    [string]$LockAction = "rundll32.exe"
    [string]$LockArgs = "user32.dll,LockWorkStation"

    $Action = New-ScheduledTaskAction -Execute $LockAction -Argument $LockArgs
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $TargetUsername
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $Principal = New-ScheduledTaskPrincipal -UserId $TargetUsername -LogonType Interactive -RunLevel Highest

    Unregister-ScheduledTask -TaskName $LockTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Register-ScheduledTask -TaskName $LockTaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Immediately locks Windows console after AutoLogon for security" | Out-Null
    Write-Host "[OK] Scheduled Task '$LockTaskName' berhasil didaftarkan (Layar otomatis terkunci saat boot)." -ForegroundColor Green
}

# --- Register GMS Production Watchdog Task ---
[string]$ProjectRootDir = (Get-Item "$PSScriptRoot\..").FullName
[string]$WatchdogScriptPath = Join-Path -Path $ProjectRootDir -ChildPath "scripts\gms-autostart-watchdog.ps1"
[string]$GmsTaskName = "GMS_Production_Autostart"

Write-Host "Mendaftarkan Scheduled Task '$GmsTaskName'..." -ForegroundColor Yellow
[string]$Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$WatchdogScriptPath`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $ProjectRootDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $TargetUsername
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
$Principal = New-ScheduledTaskPrincipal -UserId $TargetUsername -LogonType Interactive -RunLevel Highest

Unregister-ScheduledTask -TaskName $GmsTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $GmsTaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "GMS Production Auto-Recovery Watchdog for Rancher Desktop & Docker Containers" | Out-Null
Write-Host "[OK] Scheduled Task '$GmsTaskName' berhasil didaftarkan untuk user '$TargetUsername'." -ForegroundColor Green

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " SUCCESS: Cold-Boot Auto-Recovery Configuration COMPLETED!" -ForegroundColor Green
Write-Host " Akun Auto-Logon : $TargetUsername" -ForegroundColor Green
Write-Host " Screen Lock     : Aktif (Konsol aman saat boot)" -ForegroundColor Green
Write-Host " Watchdog Script : $WatchdogScriptPath" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
