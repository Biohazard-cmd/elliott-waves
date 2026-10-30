# Установка «Волн Эллиотта» для компьютера: склеить части архива, распаковать в %LOCALAPPDATA%\Programs\ElliottWaves,
# сделать ярлыки на рабочем столе и в меню «Пуск», запустить. Данные (роботы, настройки) лежат отдельно — в %APPDATA%\ElliottWaves, их установка не трогает.
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
$all = Get-ChildItem -Path $here -Filter 'ElliottWaves-*-win.zip.*.part'
if (-not $all) { Write-Host 'Не нашёл частей программы (ElliottWaves-…-win.zip.0.part …) рядом с этим файлом.'; exit 1 }
# в «Загрузках» могут остаться части прошлой версии — берём только самую новую
$ver = $all | ForEach-Object { $_.Name -replace '^ElliottWaves-(.+)-win\.zip\.\d+\.part$', '$1' } | Sort-Object { [version]$_ } -Descending | Select-Object -First 1
$parts = $all | Where-Object { $_.Name -like ('ElliottWaves-' + $ver + '-win.zip.*.part') } | Sort-Object { [int]($_.Name -replace '.*\.(\d+)\.part$', '$1') }
Write-Host ('Версия ' + $ver)
$zip = Join-Path $env:TEMP 'ElliottWaves-install.zip'
Write-Host ('Склеиваю ' + $parts.Count + ' частей…')
$out = [System.IO.File]::Create($zip)
foreach ($p in $parts) { $in = [System.IO.File]::OpenRead($p.FullName); $in.CopyTo($out); $in.Close() }
$out.Close()
$sumFile = Join-Path $here 'sha256.txt'
if (Test-Path $sumFile) {
  $want = (Get-Content $sumFile -Raw).Trim().ToLower()
  $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($want -ne $got) { Write-Host 'Части повреждены при копировании (контрольная сумма не совпала). Пришлите сообщение в чат.'; exit 1 }
}
$dest = Join-Path $env:LOCALAPPDATA 'Programs'
$app = Join-Path $dest 'ElliottWaves'
Stop-App $app
if (Test-Path $app) { Remove-Item -Recurse -Force $app }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host 'Распаковываю…'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)
Remove-Item $zip
$exe = Join-Path $app 'ElliottWaves.exe'
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $l = $sh.CreateShortcut((Join-Path $dir 'Волны Эллиотта.lnk'))
  $l.TargetPath = $exe; $l.WorkingDirectory = $app; $l.Description = 'Волны Эллиотта'; $l.Save()
}
Write-Host 'Готово: ярлык «Волны Эллиотта» на рабочем столе. Запускаю…'
Start-Process $exe
