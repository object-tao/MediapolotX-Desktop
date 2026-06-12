param(
  [string]$InstallPath = "E:\Tools\MediapolotX-Desktop"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sourcePath = Join-Path $repoRoot "release\win-unpacked"
$businessDataPath = Join-Path $InstallPath "data"

Set-Location $repoRoot

Write-Host "Building renderer..."
npm.cmd run build
if ($LASTEXITCODE -ne 0) {
  throw "Renderer build failed with exit code $LASTEXITCODE"
}

Write-Host "Packaging unpacked desktop app..."
$packageStarted = Get-Date
npx.cmd electron-builder --config electron.config.js --dir --publish never
$packageExit = $LASTEXITCODE

$appAsar = Join-Path $sourcePath "resources\app.asar"
if (!(Test-Path $appAsar)) {
  throw "Package output not found: $appAsar"
}

$appAsarInfo = Get-Item $appAsar
if ($packageExit -ne 0 -and $appAsarInfo.LastWriteTime -lt $packageStarted) {
  throw "Packaging failed and no fresh app.asar was produced."
}

Write-Host "Stopping installed app if running..."
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -like "$InstallPath\*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
New-Item -ItemType Directory -Force -Path $businessDataPath | Out-Null

Write-Host "Copying program files to $InstallPath"
robocopy $sourcePath $InstallPath /E /COPY:DAT /R:2 /W:1 /NFL /NDL /NP
if ($LASTEXITCODE -gt 7) {
  throw "Robocopy failed with exit code $LASTEXITCODE"
}

Write-Host "Update completed."
Write-Host "Business data was not modified: $businessDataPath"
