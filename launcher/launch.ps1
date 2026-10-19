<#
  Opens Pocket Tools in its own app window. The "Pocket Tools" shortcut runs this.

  1. Rebuilds dist/ if the source changed since the last build.
  2. Serves dist/ on http://localhost:4818 with a hidden local server.
  3. Opens a Chrome (or Edge) app window with its own profile.
  4. Stops the server when that window closes.

  Everything stays on this computer: the server listens on localhost only.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$port = 4818
$url = "http://localhost:$port/"
$browserProfile = Join-Path $env:LOCALAPPDATA 'PocketTools\browser'

function Show-Message([string]$text, [string]$icon = 'Error') {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($text, 'Pocket Tools', 'OK', $icon) | Out-Null
}

function Stop-WithError([string]$text) {
  Show-Message $text
  exit 1
}

# A local table lookup: instant, unlike connecting to a closed port, which Windows retries for seconds.
function Test-PortInUse {
  [bool]([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $port })
}

# True when our app (not some other program) answers on the port.
function Test-PocketTools {
  if (-not (Test-PortInUse)) { return $false }
  try {
    $request = [System.Net.WebRequest]::Create($url + 'manifest.webmanifest')
    $request.Proxy = $null  # skip proxy auto-detection; this is localhost
    $request.Timeout = 2000
    $response = $request.GetResponse()
    try {
      return (New-Object System.IO.StreamReader($response.GetResponseStream())).ReadToEnd() -match '"Pocket Tools"'
    } finally {
      $response.Close()
    }
  } catch {
    return $false
  }
}

function Find-Command([string]$name, [string]$fallback) {
  $found = Get-Command $name -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  if ($fallback -and (Test-Path $fallback)) { return $fallback }
  return $null
}

# Rebuilds when any source file is newer than the last build. Keeps the old build if this one fails.
function Update-Build {
  $built = Join-Path $root 'dist\index.html'
  # Recurse into the folders only: -Recurse on a file name would search the whole tree, node_modules included.
  $sources = @(Get-ChildItem (Join-Path $root 'src'), (Join-Path $root 'public') -Recurse -File) +
    @('index.html', 'vite.config.ts', 'csp.ts', 'package.json' | ForEach-Object { Get-Item (Join-Path $root $_) })
  $newest = $sources | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ((Test-Path $built) -and $newest.LastWriteTime -le (Get-Item $built).LastWriteTime) { return }

  $npm = Find-Command 'npm.cmd' "$env:ProgramFiles\nodejs\npm.cmd"
  if (-not $npm) { Stop-WithError 'Node.js is needed to run Pocket Tools. Install it from https://nodejs.org and try again.' }

  # Building can take a little while; say so in the notification area.
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $notice = New-Object System.Windows.Forms.NotifyIcon
  $notice.Icon = New-Object System.Drawing.Icon (Join-Path $PSScriptRoot 'pocket-tools.ico')
  $notice.Visible = $true
  $notice.ShowBalloonTip(10000, 'Pocket Tools', 'Getting the latest version ready...', 'Info')
  try {
    $build = Start-Process -FilePath $npm -ArgumentList 'run', 'build' -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  } finally {
    $notice.Dispose()
  }
  if ($build.ExitCode -ne 0) {
    if (-not (Test-Path $built)) { Stop-WithError "Pocket Tools couldn't be built. Run 'npm run build' in $root to see why." }
    Show-Message "The latest changes couldn't be built, so the previous version will open. Run 'npm run build' in $root to see why." 'Warning'
  }
}

$server = $null
if (-not (Test-PocketTools)) {
  if (Test-PortInUse) {
    Stop-WithError "Port $port is in use by another program, so Pocket Tools can't start its local server."
  }
  $vite = Join-Path $root 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path $vite)) { Stop-WithError "Pocket Tools isn't installed yet. Run 'npm install' in $root first." }
  $node = Find-Command 'node.exe' "$env:ProgramFiles\nodejs\node.exe"
  if (-not $node) { Stop-WithError 'Node.js is needed to run Pocket Tools. Install it from https://nodejs.org and try again.' }

  Update-Build

  $server = Start-Process -FilePath $node -ArgumentList "`"$vite`"", 'preview', '--port', $port, '--strictPort' -WorkingDirectory $root -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-PocketTools)) {
    if ($server.HasExited -or (Get-Date) -gt $deadline) {
      if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
      Stop-WithError "Pocket Tools' local server didn't start."
    }
    Start-Sleep -Milliseconds 250
  }
}

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
  # No Chrome or Edge: use the default browser. The server then keeps running until you sign out.
  Start-Process $url
  exit 0
}

# Its own profile makes it a separate app window, and lets us tell when it closes.
$app = Start-Process -FilePath $browser -PassThru -ArgumentList @(
  "--app=$url",
  "--user-data-dir=`"$browserProfile`"",
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,900'
)

# Only the launch that started the server stops it. A second click just focuses the open window.
if ($server) {
  $app.WaitForExit()
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
