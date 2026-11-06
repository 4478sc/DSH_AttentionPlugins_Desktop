#requires -Version 5.1
<# Pack as a self-contained tarball and install into a DSH profile (never link:). #>
param(
  [string]$Profile = 'desktop',
  [string]$DshCli = "A:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd",
  [string]$PackScript = "$env:USERPROFILE\.dsh\skills\dsh-plugin-install\scripts\pack-plugin.ps1",
  [switch]$Repack
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$outDir = Join-Path $env:USERPROFILE ".dsh\plugin-packages"
New-Item -ItemType Directory -Force $outDir | Out-Null
if (-not (Test-Path $DshCli)) { throw "dsh CLI not found: $DshCli (pass -DshCli)" }
$tarball = Join-Path $outDir ("{0}-{1}.tgz" -f $pkg.name, $pkg.version)
if ($Repack -or -not (Test-Path $tarball)) {
  if (Test-Path $PackScript) {
    & $PackScript -Source $root -IncludeNodeModules -DropDependency zod -OutDir $outDir
  } else {
    Push-Location $root
    try { npm pack --pack-destination $outDir | Out-Null } finally { Pop-Location }
  }
  if (-not (Test-Path $tarball)) { throw "pack did not produce $tarball" }
}
Write-Host "installing $tarball into profile $Profile"
& $DshCli plugin --profile $Profile add $tarball
if ($LASTEXITCODE -ne 0) { throw "dsh plugin add failed ($LASTEXITCODE)" }
$links = Join-Path $env:USERPROFILE '.dsh\skills\dsh-plugin-install\scripts\profile-links.ps1'
if (Test-Path $links) { & $links }
Write-Host "Restart DSH to load or update the host half of the plugin."
