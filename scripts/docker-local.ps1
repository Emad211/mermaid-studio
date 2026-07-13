param(
  [Parameter(Position = 0)]
  [ValidateSet('help', 'setup', 'doctor', 'up', 'test', 'test-full', 'status', 'logs', 'restart', 'down', 'reset', 'clean', 'credentials')]
  [string]$Command = 'help',
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDirectory = Split-Path -Parent $ScriptDirectory
$EnvFile = Join-Path $RootDirectory '.env.local'
$EnvTemplate = Join-Path $RootDirectory '.env.local.example'
$ComposeFile = Join-Path $RootDirectory 'compose.local.yaml'

function Fail([string]$Message) {
  throw "خطا: $Message"
}

function Invoke-Docker([string[]]$Arguments, [switch]$AllowFailure) {
  & docker @Arguments
  $status = $LASTEXITCODE
  if (-not $AllowFailure -and $status -ne 0) {
    Fail "فرمان Docker با کد $status شکست خورد: docker $($Arguments -join ' ')"
  }
  return $status
}

function Invoke-Compose([string[]]$Arguments, [switch]$AllowFailure) {
  $base = @('compose', '--env-file', $EnvFile, '-f', $ComposeFile)
  return Invoke-Docker ($base + $Arguments) -AllowFailure:$AllowFailure
}

function Require-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'Docker نصب نیست یا در PATH قرار ندارد.'
  }
  Invoke-Docker @('info') | Out-Null
  Invoke-Docker @('compose', 'version') | Out-Null
}

function New-HexSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Get-EnvValue([string]$Key) {
  if (-not (Test-Path $EnvFile)) { return '' }
  $pattern = '^' + [regex]::Escape($Key) + '='
  $line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match $pattern } | Select-Object -Last 1
  if ($null -eq $line) { return '' }
  return $line.Substring($line.IndexOf('=') + 1)
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = if (Test-Path $EnvFile) { @(Get-Content -LiteralPath $EnvFile) } else { @() }
  $pattern = '^' + [regex]::Escape($Key) + '='
  $updated = $false
  $next = foreach ($line in $lines) {
    if ($line -match $pattern) {
      if (-not $updated) { "$Key=$Value"; $updated = $true }
    } else {
      $line
    }
  }
  if (-not $updated) { $next += "$Key=$Value" }
  [System.IO.File]::WriteAllLines($EnvFile, [string[]]$next, [System.Text.UTF8Encoding]::new($false))
}

function Ensure-Environment {
  if (-not (Test-Path $EnvTemplate)) { Fail '.env.local.example پیدا نشد.' }
  if (-not (Test-Path $EnvFile)) {
    Copy-Item -LiteralPath $EnvTemplate -Destination $EnvFile
    Write-Host 'فایل .env.local ساخته شد.' -ForegroundColor Green
  }
  if ([string]::IsNullOrWhiteSpace((Get-EnvValue 'ANALYTICS_ADMIN_PASSWORD'))) {
    Set-EnvValue 'ANALYTICS_ADMIN_PASSWORD' (New-HexSecret)
  }
  if ([string]::IsNullOrWhiteSpace((Get-EnvValue 'ANALYTICS_HASH_SECRET'))) {
    Set-EnvValue 'ANALYTICS_HASH_SECRET' (New-HexSecret)
  }
  $portText = Get-EnvValue 'LOCAL_PORT'
  if ([string]::IsNullOrWhiteSpace($portText)) {
    Set-EnvValue 'LOCAL_PORT' '4321'
    $portText = '4321'
  }
  $port = 0
  if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    Fail 'LOCAL_PORT باید عددی بین 1 و 65535 باشد.'
  }
}

function Show-Access {
  $port = Get-EnvValue 'LOCAL_PORT'
  $user = Get-EnvValue 'ANALYTICS_ADMIN_USER'
  if ([string]::IsNullOrWhiteSpace($user)) { $user = 'admin' }
  $password = Get-EnvValue 'ANALYTICS_ADMIN_PASSWORD'
  Write-Host "`nMermaid Studio روی لوکال آماده است:" -ForegroundColor Green
  Write-Host "  صفحه اصلی:  http://localhost:$port/"
  Write-Host "  ادیتور:     http://localhost:$port/editor"
  Write-Host "  پنل ادمین:  http://localhost:$port/admin/analytics"
  Write-Host "  سلامت:      http://localhost:$port/api/health"
  Write-Host "`nورود پنل ادمین:"
  Write-Host "  نام کاربری: $user"
  Write-Host "  رمز عبور:   $password"
  Write-Host "`nسرویس فقط روی 127.0.0.1 منتشر شده است."
}

function Wait-Healthy([int]$TimeoutSeconds = 150) {
  $started = Get-Date
  while (((Get-Date) - $started).TotalSeconds -lt $TimeoutSeconds) {
    $container = (& docker compose --env-file $EnvFile -f $ComposeFile ps -q app 2>$null | Select-Object -First 1)
    if ($container) {
      $status = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $container 2>$null)
      if ($status -eq 'healthy') { return }
      if ($status -in @('unhealthy', 'exited', 'dead')) {
        Invoke-Compose @('logs', '--tail', '200', 'app') -AllowFailure | Out-Null
        Fail "کانتینر با وضعیت $status متوقف شد."
      }
    }
    Start-Sleep -Seconds 2
  }
  Invoke-Compose @('logs', '--tail', '200', 'app') -AllowFailure | Out-Null
  Fail 'سرویس در زمان مورد انتظار healthy نشد.'
}

function Show-Help {
  @'
استفاده:
  .\scripts\docker-local.ps1 setup       ساخت .env.local و تولید Secretها
  .\scripts\docker-local.ps1 doctor      بررسی Docker و اعتبار Compose
  .\scripts\docker-local.ps1 up          Build و اجرای سرویس لوکال
  .\scripts\docker-local.ps1 test        Smoke test سریع
  .\scripts\docker-local.ps1 test-full   تست کامل شامل PDF و ممیزی SEO
  .\scripts\docker-local.ps1 status      وضعیت کانتینر و Health
  .\scripts\docker-local.ps1 logs        نمایش زنده لاگ‌ها
  .\scripts\docker-local.ps1 restart     راه‌اندازی مجدد سرویس
  .\scripts\docker-local.ps1 down        توقف کانتینر؛ داده‌ها حفظ می‌شوند
  .\scripts\docker-local.ps1 reset       حذف کانتینر و دادهٔ آنالیتیکس لوکال
  .\scripts\docker-local.ps1 clean       حذف کانتینر، volume و image لوکال
  .\scripts\docker-local.ps1 credentials نمایش آدرس‌ها و اطلاعات ورود
'@ | Write-Host
}

switch ($Command) {
  'setup' {
    Require-Docker
    Ensure-Environment
    Write-Host "تنظیمات لوکال آماده شد: $EnvFile" -ForegroundColor Green
    Show-Access
  }
  'doctor' {
    Require-Docker
    Ensure-Environment
    Invoke-Compose @('config', '--quiet') | Out-Null
    Write-Host 'Docker، Compose و تنظیمات لوکال معتبرند.' -ForegroundColor Green
    & docker version --format 'Docker Engine: {{.Server.Version}}'
    & docker compose version
  }
  'up' {
    Require-Docker
    Ensure-Environment
    Invoke-Compose @('config', '--quiet') | Out-Null
    Invoke-Compose @('up', '-d', '--build', '--remove-orphans') | Out-Null
    Wait-Healthy
    Show-Access
  }
  'test' {
    Require-Docker
    Ensure-Environment
    Wait-Healthy 30
    Invoke-Compose @('exec', '-T', 'app', 'node', 'scripts/docker-local-smoke.mjs') | Out-Null
  }
  'test-full' {
    Require-Docker
    Ensure-Environment
    Wait-Healthy 30
    Invoke-Compose @('exec', '-T', 'app', 'node', 'scripts/docker-local-smoke.mjs', '--full') | Out-Null
  }
  'status' {
    Require-Docker
    Ensure-Environment
    Invoke-Compose @('ps') | Out-Null
    $container = (& docker compose --env-file $EnvFile -f $ComposeFile ps -q app 2>$null | Select-Object -First 1)
    if ($container) { & docker inspect --format 'Health: {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $container }
  }
  'logs' {
    Require-Docker
    Ensure-Environment
    Invoke-Compose @('logs', '-f', '--tail', '200', 'app') | Out-Null
  }
  'restart' {
    Require-Docker
    Ensure-Environment
    Invoke-Compose @('restart', 'app') | Out-Null
    Wait-Healthy
    Show-Access
  }
  'down' {
    Require-Docker
    Ensure-Environment
    Invoke-Compose @('down', '--remove-orphans') | Out-Null
    Write-Host 'سرویس متوقف شد؛ دادهٔ لوکال حفظ شده است.' -ForegroundColor Green
  }
  'reset' {
    Require-Docker
    Ensure-Environment
    if (-not $Yes) {
      $answer = Read-Host 'تمام دادهٔ آنالیتیکس لوکال حذف شود؟ [y/N]'
      if ($answer -notmatch '^[Yy]$') { Write-Host 'لغو شد.'; break }
    }
    Invoke-Compose @('down', '--volumes', '--remove-orphans') | Out-Null
    Write-Host 'کانتینرها و دادهٔ لوکال حذف شدند؛ .env.local حفظ شد.' -ForegroundColor Green
  }
  'clean' {
    Require-Docker
    Ensure-Environment
    if (-not $Yes) {
      $answer = Read-Host 'کانتینر، volume و image لوکال حذف شوند؟ [y/N]'
      if ($answer -notmatch '^[Yy]$') { Write-Host 'لغو شد.'; break }
    }
    Invoke-Compose @('down', '--volumes', '--rmi', 'local', '--remove-orphans') | Out-Null
    Write-Host 'منابع Docker لوکال پاک شدند؛ .env.local حفظ شد.' -ForegroundColor Green
  }
  'credentials' {
    Require-Docker
    Ensure-Environment
    Show-Access
  }
  default { Show-Help }
}
