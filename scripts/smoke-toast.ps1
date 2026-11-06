#requires -Version 5.1
<# Smoke test: spawn the toast host, show one 4s toast, assert it appears and auto-closes. #>
param([int]$TimeoutSeconds = 15)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'lib\toast_host.ps1'
if (-not (Test-Path $script)) { Write-Error "missing $script"; exit 2 }
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ToastProbe {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
function Count-ToastWindows([int]$ProcessId) {
  $script:count = 0
  $cb = [ToastProbe+EnumWindowsProc]{
    param($h, $l)
    $owner = 0
    [void][ToastProbe]::GetWindowThreadProcessId($h, [ref]$owner)
    if ($owner -eq $ProcessId -and [ToastProbe]::IsWindowVisible($h)) {
      $r = New-Object ToastProbe+RECT
      [void][ToastProbe]::GetWindowRect($h, [ref]$r)
      if (($r.Right - $r.Left) -gt 300) { $script:count++ }
    }
    return $true
  }
  [void][ToastProbe]::EnumWindows($cb, [IntPtr]::Zero)
  return $script:count
}
$cmdFile = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString("N") + ".jsonl")
$payload = '{"cmd":"show","id":"smoke","kind":"completed","title":"smoke test","text":"should close in 4s","durationMs":4000}'
[IO.File]::WriteAllText($cmdFile, $payload + [char]10, (New-Object Text.UTF8Encoding($false)))
$proc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile","-STA","-ExecutionPolicy","Bypass","-File",$script,"-HoldSeconds","20") -RedirectStandardInput $cmdFile -PassThru -WindowStyle Hidden
try {
  $deadline = (Get-Date).AddSeconds(6)
  $seen = 0
  while ((Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200; $seen = Count-ToastWindows $proc.Id; if ($seen -ge 1) { break } }
  if ($seen -lt 1) { Write-Host "FAIL: toast window never appeared"; exit 1 }
  $deadline = (Get-Date).AddSeconds(10)
  $left = $seen
  while ((Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250; $left = Count-ToastWindows $proc.Id; if ($left -eq 0) { break } }
  if ($left -ne 0) { Write-Host "FAIL: toast did not auto-close (left=$left)"; exit 1 }
  Write-Host "PASS: toast appeared and auto-closed"
  exit 0
} finally {
  try { if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force } } catch { }
  Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue
}
