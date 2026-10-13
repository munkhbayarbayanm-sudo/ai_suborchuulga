$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
New-Item -ItemType Directory -Path '.tools' -Force | Out-Null
npm install --prefix .tools --no-audit --no-fund embedded-postgres@18.4.0-beta.17 ffmpeg-static@5.3.0 ffprobe-static@3.1.0
if ($LASTEXITCODE -ne 0) { throw 'Local tool installation failed.' }
$taskArchive = Join-Path $taskRoot '.tools\redis.zip'
Invoke-WebRequest -Uri 'https://github.com/redis-windows/redis-windows/releases/download/8.10.2/Redis-8.10.2-Windows-x64-msys2.zip' -OutFile $taskArchive
$taskExpectedHash = '7C8CEBD50347EAA1D9E784DA842ED47A4F33394637835531D6614777B950EE85'
if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ne $taskExpectedHash) { throw 'Redis archive integrity check failed.' }
Expand-Archive -LiteralPath $taskArchive -DestinationPath (Join-Path $taskRoot '.tools\redis') -Force
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
$taskConfig = [IO.File]::ReadAllText((Join-Path $taskRoot '.env'))
$taskProbe = (Join-Path $taskRoot '.tools\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe').Replace('\','/')
$taskFfmpeg = (Join-Path $taskRoot '.tools\node_modules\ffmpeg-static\ffmpeg.exe').Replace('\','/')
$taskConfig = $taskConfig -replace '(?m)^FFPROBE_PATH=.*$', ('FFPROBE_PATH=' + $taskProbe) -replace '(?m)^FFMPEG_PATH=.*$', ('FFMPEG_PATH=' + $taskFfmpeg)
[IO.File]::WriteAllText((Join-Path $taskRoot '.env'), $taskConfig)
Write-Host 'Local tools installed. Run pnpm dev:local-infra, then migrate and start apps in another terminal.'
