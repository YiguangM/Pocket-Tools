<#
  Creates "Pocket Tools" shortcuts on the Desktop, in the Start menu and in the project folder.
  They run launch.ps1, which opens the app in its own window.
  Run again any time (npm run shortcut), e.g. after moving the project folder.
#>
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'launch.ps1'
$icon = Join-Path $PSScriptRoot 'pocket-tools.ico'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$places = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('Programs'),  # Start menu
  $root                                      # the project folder itself
)

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $places) {
  $path = Join-Path $folder 'Pocket Tools.lnk'
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $powershell
  # Bypass applies to this one launch only; it lets Windows run the local launch script.
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = "$icon,0"
  $shortcut.WindowStyle = 7  # start minimized, so no console window flashes up
  $shortcut.Description = 'Open Pocket Tools: private tools that run on this computer'
  $shortcut.Save()
  Write-Output "Created $path"
}
