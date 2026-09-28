param(
  [Parameter(Mandatory = $true)][string]$InputZip,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][ValidateSet('Windows-x64', 'Linux-x64', 'macOS-Apple-Silicon')][string]$Target
)

$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$desktop = Join-Path $repository 'desktop'
$sourceRoot = (Resolve-Path (Join-Path $desktop 'src')).Path
$version = (Get-Content -LiteralPath (Join-Path $desktop 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$newRoot = "Insight-$version-$Target"
$destination = Join-Path $OutputDirectory "$newRoot.zip"
$outputParent = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
if (Test-Path -LiteralPath $destination) { throw "Output already exists: $destination" }
$temporaryArchive = Join-Path $outputParent "$newRoot.$PID.tmp"
if (Test-Path -LiteralPath $temporaryArchive) { throw "Temporary archive already exists: $temporaryArchive" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$inputArchive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $InputZip).Path)
$first = $inputArchive.Entries | Select-Object -First 1
$oldRoot = $first.FullName.Split('/')[0]
$main = $inputArchive.Entries | Where-Object { $_.FullName.EndsWith('/src/main.cjs') } | Select-Object -First 1
if (-not $main) { $inputArchive.Dispose(); throw 'Archive has no desktop main.cjs.' }
$appPrefix = $main.FullName.Substring($oldRoot.Length + 1)
$appPrefix = $appPrefix.Substring(0, $appPrefix.Length - '/src/main.cjs'.Length)
$replacement = @{}
Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | Where-Object { $_.Name -notmatch '\.test\.cjs$' } | ForEach-Object {
  $relative = $_.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
  $replacement["$appPrefix/src/$relative"] = $_.FullName
}
$replacement["$appPrefix/package.json"] = Join-Path $desktop 'package.json'
$replacement["$appPrefix/release-config.json"] = Join-Path $desktop 'release-config.json'
$replacement["$appPrefix/specialists/sources.json"] = Join-Path $desktop 'specialists/sources.json'
$written = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$utf8 = [Text.UTF8Encoding]::new($false)
$launcher = $null

if ($Target -eq 'Windows-x64') {
  $launcher = Join-Path $outputParent "$newRoot-launcher.$PID.exe"
  if (Test-Path -LiteralPath $launcher) { $inputArchive.Dispose(); throw "Launcher already exists: $launcher" }
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  if (-not (Test-Path -LiteralPath $compiler)) { $inputArchive.Dispose(); throw 'Windows C# compiler is unavailable.' }
  $icon = Join-Path $sourceRoot 'icons/xueshupai.ico'
  & $compiler /nologo /target:winexe /optimize+ "/out:$launcher" "/win32icon:$icon" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'InsightLauncher.cs')
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcher)) { $inputArchive.Dispose(); throw 'Could not compile Insight launcher.' }
}

function Write-TextEntry($archive, [string]$name, [string]$value, $original = $null) {
  $entry = $archive.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
  if ($original) { $entry.ExternalAttributes = $original.ExternalAttributes; $entry.LastWriteTime = $original.LastWriteTime }
  $stream = $entry.Open()
  try {
    $bytes = $utf8.GetBytes($value)
    $stream.Write($bytes, 0, $bytes.Length)
  } finally { $stream.Dispose() }
}

$system = if ($Target -eq 'Linux-x64') { 'Linux' } else { 'Darwin' }
$architecture = if ($Target -eq 'macOS-Apple-Silicon') { 'arm64' } else { 'x86_64' }
$executable = if ($Target -eq 'Linux-x64') { 'runtime/electron' } else { 'runtime/Electron.app/Contents/MacOS/Electron' }
$usageFile = if ($Target -eq 'Windows-x64') { Join-Path $PSScriptRoot 'portable-usage-windows.txt' } else { Join-Path $PSScriptRoot 'portable-usage-unix.txt' }
$usage = Get-Content -LiteralPath $usageFile -Raw -Encoding UTF8
$usage = $usage.Replace('@VERSION@', $version).Replace('@TARGET@', $Target).TrimEnd() + "`n"
$launcherTemplate = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'portable-launch-unix.sh') -Raw -Encoding UTF8
$launcherScript = $launcherTemplate.Replace('@SYSTEM@', $system).Replace('@ARCH@', $architecture).Replace('@EXECUTABLE@', $executable).TrimEnd() + "`n"

$outputArchive = [IO.Compression.ZipFile]::Open($temporaryArchive, [IO.Compression.ZipArchiveMode]::Create)
$launcherEntryName = $null
$failed = $false
try {
  foreach ($oldEntry in $inputArchive.Entries) {
    $relative = $oldEntry.FullName.Substring($oldRoot.Length).TrimStart('/')
    if (-not $relative) { continue }
    if ($Target -eq 'Windows-x64' -and $relative -notmatch '/' -and $relative -match '\.exe$') { if (-not $launcherEntryName) { $launcherEntryName = $relative }; continue }
    if ($Target -eq 'Windows-x64' -and $relative -eq 'runtime/Jarod-Pi.exe') { $relative = 'runtime/Insight.exe' }
    $name = "$newRoot/$relative"
    if ($relative -notmatch '/' -and $relative -match '\.txt$') { Write-TextEntry $outputArchive $name $usage $oldEntry; continue }
    if ($relative -notmatch '/' -and $relative -match '\.sh$') { Write-TextEntry $outputArchive $name $launcherScript $oldEntry; continue }
    $newEntry = $outputArchive.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
    $newEntry.LastWriteTime = $oldEntry.LastWriteTime
    $newEntry.ExternalAttributes = $oldEntry.ExternalAttributes
    if ($oldEntry.FullName.EndsWith('/')) { continue }
    $key = if ($Target -eq 'Windows-x64' -and $relative -eq 'runtime/Insight.exe') { 'runtime/Jarod-Pi.exe' } else { $relative }
    $newFile = $replacement[$key]
    if ($newFile) { [void]$written.Add($key) }
    $source = if ($newFile) { [IO.File]::OpenRead($newFile) } else { $oldEntry.Open() }
    $outputStream = $newEntry.Open()
    try { $source.CopyTo($outputStream) } finally { $source.Dispose(); $outputStream.Dispose() }
  }
  foreach ($key in $replacement.Keys) {
    if ($written.Contains($key)) { continue }
    $entry = $outputArchive.CreateEntry("$newRoot/$key", [IO.Compression.CompressionLevel]::Optimal)
    $source = [IO.File]::OpenRead($replacement[$key])
    $outputStream = $entry.Open()
    try { $source.CopyTo($outputStream) } finally { $source.Dispose(); $outputStream.Dispose() }
  }
  if ($launcher) {
    if (-not $launcherEntryName) { throw 'Windows archive has no root launcher entry.' }
    $entry = $outputArchive.CreateEntry("$newRoot/$launcherEntryName", [IO.Compression.CompressionLevel]::Optimal)
    $source = [IO.File]::OpenRead($launcher)
    $outputStream = $entry.Open()
    try { $source.CopyTo($outputStream) } finally { $source.Dispose(); $outputStream.Dispose() }
  }
} catch {
  $failed = $true
  throw
} finally {
  $outputArchive.Dispose()
  $inputArchive.Dispose()
  if ($launcher -and (Test-Path -LiteralPath $launcher)) { Remove-Item -LiteralPath $launcher -Force }
  if ($failed -and (Test-Path -LiteralPath $temporaryArchive)) { Remove-Item -LiteralPath $temporaryArchive -Force }
}
Move-Item -LiteralPath $temporaryArchive -Destination $destination
$file = Get-Item -LiteralPath $destination
[pscustomobject]@{ Path = $file.FullName; Bytes = $file.Length; Sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() }
