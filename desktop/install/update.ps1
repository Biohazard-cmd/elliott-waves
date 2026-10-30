# Обновление уже установленных «Волн Эллиотта» без большого архива: заменить только страницы программы (папку resources\app)
# из ElliottWaves-<версия>-app.zip (≈ 200 КБ). Годится, пока не меняется сам Electron. Данные (%APPDATA%\ElliottWaves) не трогаются.
$ErrorActionPreference = 'Stop'
function Stop-App($dir) {
  $exe0 = Join-Path $dir 'ElliottWaves.exe'
  if (-not (Get-Process -Name 'ElliottWaves' -ErrorAction SilentlyContinue)) { return }
  Write-Host 'Закрываю программу…'
  # с 3.7 программа по ключу --quit выходит сама и успевает сохранить данные; старые версии — закрываем принудительно
  $v0 = $null; try { $v0 = [version]((Get-Content (Join-Path $dir 'resources\app\package.json') -Raw | ConvertFrom-Json).version) } catch { }
  if ($v0 -and $v0 -ge [version]'3.7') { Start-Process $exe0 -ArgumentList '--quit' }
  for ($k = 0; $k -lt 15 -and (Get-Process -Name 'ElliottWaves' -ErrorAction SilentlyContinue); $k++) { Start-Sleep -Seconds 1 }
  Get-Process -Name 'ElliottWaves' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$zips = Get-ChildItem -Path $here -Filter 'ElliottWaves-*-app.zip'
if (-not $zips) { Write-Host 'Не нашёл файла обновления (ElliottWaves-…-app.zip) рядом с этим файлом.'; exit 1 }
# в «Загрузках» может лежать и прошлое обновление — берём самое новое
$zip = $zips | Sort-Object { [version]($_.Name -replace '^ElliottWaves-(.+)-app\.zip$', '$1') } -Descending | Select-Object -First 1
$ver = $zip.Name -replace '^ElliottWaves-(.+)-app\.zip$', '$1'
$app = Join-Path $env:LOCALAPPDATA 'Programs\ElliottWaves'
$exe = Join-Path $app 'ElliottWaves.exe'
if (-not (Test-Path $exe)) { Write-Host 'Программа ещё не установлена — сначала запустите «Установить.cmd».'; exit 1 }
$sumFile = Join-Path $here ('ElliottWaves-' + $ver + '-app.sha256.txt')
if (Test-Path $sumFile) {
  $want = (Get-Content $sumFile -Raw).Trim().ToLower()
  $got = (Get-FileHash $zip.FullName -Algorithm SHA256).Hash.ToLower()
  if ($want -ne $got) { Write-Host 'Файл обновления повреждён при копировании (контрольная сумма не совпала). Пришлите сообщение в чат.'; exit 1 }
}
Write-Host ('Обновляю до версии ' + $ver)
Stop-App $app
$res = Join-Path $app 'resources'
$tmp = Join-Path $res 'app.new'
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $tmp)   # внутри архива — папка app
if (-not (Test-Path (Join-Path $tmp 'app\main.js'))) { Remove-Item -Recurse -Force $tmp; Write-Host 'В архиве обновления нет программы. Пришлите сообщение в чат.'; exit 1 }
$old = Join-Path $res 'app'
if (Test-Path $old) { Remove-Item -Recurse -Force $old }
Move-Item (Join-Path $tmp 'app') $old
Remove-Item -Recurse -Force $tmp
Write-Host ('Готово: версия ' + $ver + '. Запускаю…')
Start-Process $exe
