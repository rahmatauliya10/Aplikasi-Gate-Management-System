# Git Add, Commit and Push Script for GMS Production Pack 2
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Get-Item "$PSScriptRoot\..").FullName
Set-Location -Path $WorkspaceRoot

Write-Host "Staging files..."
& git add .

Write-Host "Committing changes..."
& git commit -m "feat(audit): implement production pack 2 remediation for REOPEN UI, attachment DR, historical DB rehearsal & immutable deployment"

Write-Host "Pushing to remote origin update-v1.0.0..."
& git push origin update-v1.0.0

Write-Host "Git push completed successfully!"
