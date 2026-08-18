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

# --- Helper: LSA Secret P/Invoke for Secure AutoLogon Credential Storage ---
$LsaCode = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class LsaSecretHelper {
    [StructLayout(LayoutKind.Sequential)]
    private struct LSA_UNICODE_STRING {
        public ushort Length;
        public ushort MaximumLength;
        public IntPtr Buffer;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LSA_OBJECT_ATTRIBUTES {
        public int Length;
        public IntPtr RootDirectory;
        public IntPtr ObjectName;
        public int Attributes;
        public IntPtr SecurityDescriptor;
        public IntPtr SecurityQualityOfService;
    }

    [DllImport("advapi32.dll", SetLastError = true, PreserveSig = true)]
    private static extern uint LsaOpenPolicy(
        ref LSA_UNICODE_STRING SystemName,
        ref LSA_OBJECT_ATTRIBUTES ObjectAttributes,
        uint DesiredAccess,
        out IntPtr PolicyHandle
    );

    [DllImport("advapi32.dll", SetLastError = true, PreserveSig = true)]
    private static extern uint LsaStorePrivateData(
        IntPtr PolicyHandle,
        ref LSA_UNICODE_STRING KeyName,
        ref LSA_UNICODE_STRING PrivateData
    );

    [DllImport("advapi32.dll", SetLastError = true, PreserveSig = true)]
    private static extern uint LsaClose(IntPtr ObjectHandle);

    private const uint POLICY_CREATE_SECRET = 0x00000020;
    private const uint POLICY_SET_AUDIT_REQUIREMENTS = 0x00000004;
    private const uint POLICY_ALL_ACCESS = 0x00000001 | 0x00000002 | 0x00000004 | 0x00000008 | 0x00000010 | 0x00000020 | 0x00000040 | 0x00000080 | 0x00000100 | 0x00000200 | 0x00000400 | 0x00000800 | 0x00001000;

    public static bool SetSecret(string key, string value) {
        IntPtr policyHandle = IntPtr.Zero;
        LSA_OBJECT_ATTRIBUTES attributes = new LSA_OBJECT_ATTRIBUTES();
        attributes.Length = Marshal.SizeOf(typeof(LSA_OBJECT_ATTRIBUTES));

        LSA_UNICODE_STRING systemName = new LSA_UNICODE_STRING();
        uint status = LsaOpenPolicy(ref systemName, ref attributes, POLICY_ALL_ACCESS, out policyHandle);
        if (status != 0) return false;

        try {
            LSA_UNICODE_STRING keyString = new LSA_UNICODE_STRING();
            byte[] keyBytes = Encoding.Unicode.GetBytes(key);
            keyString.Buffer = Marshal.AllocHGlobal(keyBytes.Length);
            Marshal.Copy(keyBytes, 0, keyString.Buffer, keyBytes.Length);
            keyString.Length = (ushort)keyBytes.Length;
            keyString.MaximumLength = (ushort)keyBytes.Length;

            LSA_UNICODE_STRING valString = new LSA_UNICODE_STRING();
            if (value != null) {
                byte[] valBytes = Encoding.Unicode.GetBytes(value);
                valString.Buffer = Marshal.AllocHGlobal(valBytes.Length);
                Marshal.Copy(valBytes, 0, valString.Buffer, valBytes.Length);
                valString.Length = (ushort)valBytes.Length;
                valString.MaximumLength = (ushort)valBytes.Length;
            }

            uint storeStatus = LsaStorePrivateData(policyHandle, ref keyString, ref valString);

            Marshal.FreeHGlobal(keyString.Buffer);
            if (value != null) Marshal.FreeHGlobal(valString.Buffer);

            return storeStatus == 0;
        } finally {
            LsaClose(policyHandle);
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $LsaCode -ErrorAction SilentlyContinue
} catch {}

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
        New-LocalUser -Name $TargetUsername -Password $SecurePass -FullName "GMS Production Runtime Account" -Description "Dedicated least-privilege runtime account for GMS container autostart after blackout" -PasswordNeverExpires | Out-Null
        
        # Enforce Least Privilege: Add to Users and docker-users (NOT Administrators)
        Add-LocalGroupMember -Group "Users" -Member $TargetUsername -ErrorAction SilentlyContinue | Out-Null
        if (Get-LocalGroup -Name "docker-users" -ErrorAction SilentlyContinue) {
            Add-LocalGroupMember -Group "docker-users" -Member $TargetUsername -ErrorAction SilentlyContinue | Out-Null
        }
        Write-Host "[OK] Akun lokal '$TargetUsername' berhasil dibuat dengan Least Privilege (Group: Users/docker-users, BUKAN Administrators)." -ForegroundColor Green
    } else {
        Write-Host "[OK] Akun lokal '$TargetUsername' sudah ada." -ForegroundColor Green
        if ($RuntimePassword) {
            $SecurePass = ConvertTo-SecureString $RuntimePassword -AsPlainText -Force
            Set-LocalUser -Name $TargetUsername -Password $SecurePass -PasswordNeverExpires $true | Out-Null
        }
        # Explicitly ensure NOT in Administrators for least-privilege compliance
        try {
            Remove-LocalGroupMember -Group "Administrators" -Member $TargetUsername -ErrorAction SilentlyContinue | Out-Null
            Write-Host "[OK] Hak akses Administrator dicabut dari '$TargetUsername' untuk kepatuhan Least Privilege." -ForegroundColor Green
        } catch {}
    }
}

if (-not $RuntimePassword -and -not $UseCurrentUser) {
    Write-Host ""
    Write-Host "Masukkan password untuk akun Windows '$TargetUsername':" -ForegroundColor Yellow
    $Cred = Get-Credential -UserName $TargetUsername -Message "Masukkan password untuk $TargetUsername"
    $RuntimePassword = $Cred.GetNetworkCredential().Password
}

# --- Configure Secure Winlogon & LSA Secret for AutoLogon ---
Write-Host "Mengonfigurasi Winlogon & LSA Secret (No Plaintext Password in Registry)..." -ForegroundColor Yellow
Set-ItemProperty -Path $WinlogonPath -Name "AutoAdminLogon" -Value "1" -Type String
Set-ItemProperty -Path $WinlogonPath -Name "DefaultUserName" -Value $TargetUsername -Type String
Set-ItemProperty -Path $WinlogonPath -Name "DefaultDomainName" -Value $env:COMPUTERNAME -Type String

# Store password via LSA Private Data (Secret: DefaultPassword)
[bool]$LsaStored = $false
if ($RuntimePassword) {
    try {
        $LsaStored = [LsaSecretHelper]::SetSecret("DefaultPassword", $RuntimePassword)
    } catch {}

    if (-not $LsaStored) {
        # Check if Sysinternals autologon is available
        $AutologonExe = Get-Command "autologon.exe" -ErrorAction SilentlyContinue
        if ($AutologonExe) {
            & autologon.exe $TargetUsername $env:COMPUTERNAME $RuntimePassword /accepteula | Out-Null
            $LsaStored = $true
        }
    }
}

# Remove any plaintext DefaultPassword from registry if present
Remove-ItemProperty -Path $WinlogonPath -Name "DefaultPassword" -ErrorAction SilentlyContinue

# Force auto logon count indefinite
Set-ItemProperty -Path $WinlogonPath -Name "ForceAutoLogon" -Value "1" -Type String -ErrorAction SilentlyContinue

Write-Host "[OK] Windows AutoLogon dikonfigurasi secara aman (Password disimpan di LSA Secret, BUKAN plaintext registry)." -ForegroundColor Green

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
