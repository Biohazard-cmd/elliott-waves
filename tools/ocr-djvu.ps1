# Распознавание DjVu-разворотов встроенным OCR Windows (ru): скан -> TIFF -> левая/правая половина -> текст.
param([string]$Djvu, [string]$Out, [string]$Work, [int]$From = 1, [int]$To = 0)
$ErrorActionPreference = 'Stop'
$dj = 'C:\Program Files (x86)\DjVuLibre'
Add-Type -AssemblyName System.Drawing, System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ru'))

function Ocr([string]$png) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($png)) ([Windows.Storage.StorageFile])
  $st = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($st)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  } finally { $st.Dispose() }
  # перенос слова в конце строки: «перене-» + «сенные» -> «перенесенные»
  $txt = ($res.Lines | ForEach-Object { $_.Text }) -join "`n"
  [regex]::Replace($txt, '(\p{L})[-­]\n(\p{Ll})', '$1$2')
}

$n = [int](& "$dj\djvused.exe" -e 'n' $Djvu)
if ($To -le 0 -or $To -gt $n) { $To = $n }
New-Item -ItemType Directory -Force $Work | Out-Null
$sb = New-Object System.Text.StringBuilder
for ($p = $From; $p -le $To; $p++) {
  $tif = Join-Path $Work "s.tif"
  & "$dj\ddjvu.exe" -format=tiff "-page=$p" $Djvu $tif
  $img = [Drawing.Image]::FromFile($tif)
  try {
    # одиночная страница — массив из одного элемента; через if-выражение PowerShell развернул бы его, и страница пошла бы дважды
    if ($img.Width -gt $img.Height) { $halves = @(@('слева', 0), @('справа', [int]($img.Width / 2))) } else { $halves = @(, @('', 0)) }
    foreach ($h in $halves) {
      $w = if ($h[0]) { [int]($img.Width / 2) } else { $img.Width }
      $crop = New-Object Drawing.Bitmap $w, $img.Height
      $g = [Drawing.Graphics]::FromImage($crop); $g.Clear([Drawing.Color]::White)
      $g.DrawImage($img, (New-Object Drawing.Rectangle 0, 0, $w, $img.Height), (New-Object Drawing.Rectangle $h[1], 0, $w, $img.Height), [Drawing.GraphicsUnit]::Pixel); $g.Dispose()
      $png = Join-Path $Work "h.png"; $crop.Save($png, [Drawing.Imaging.ImageFormat]::Png); $crop.Dispose()
      [void]$sb.AppendLine("`n===== скан $p $($h[0]) =====")
      [void]$sb.AppendLine((Ocr $png))
    }
  } finally { $img.Dispose() }
  Write-Host "скан $p из $To"
}
[IO.File]::WriteAllText($Out, $sb.ToString(), (New-Object Text.UTF8Encoding $true))
