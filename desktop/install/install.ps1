# Установка «Волн Эллиотта» для компьютера: склеить части архива, распаковать в %LOCALAPPDATA%\Programs\ElliottWaves,
# сделать ярлыки на рабочем столе и в меню «Пуск», запустить. Данные (роботы, настройки) лежат отдельно — в %APPDATA%\ElliottWaves, их установка не трогает.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$parts = Get-ChildItem -Path $here -Filter 'ElliottWaves-*-win.zip.*.part' | Sort-Object { [int]($_.Name -replace '.*\.(\d+)\.part$', '$1') }
if (-not $parts) { Write-Host 'Не нашёл частей программы (ElliottWaves-…-win.zip.0.part …) рядом с этим файлом.'; exit 1 }
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
Get-Process -Name 'ElliottWaves' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
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
