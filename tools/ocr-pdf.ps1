# Распознавание PDF без текстового слоя (или с битым) встроенным OCR Windows (ru): страница -> картинка (Windows.Data.Pdf) -> текст.
param([string]$Pdf, [string]$Out, [int]$From = 1, [int]$To = 0, [int]$Width = 1800)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$ext = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTask = ($ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskA = ($ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
function AwaitA($op) { $asTaskA.Invoke($null, @($op)).Wait(-1) | Out-Null }
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ru'))

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Pdf).Path)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$n = [int]$doc.PageCount
if ($To -le 0 -or $To -gt $n) { $To = $n }
$sb = New-Object System.Text.StringBuilder
for ($p = $From; $p -le $To; $p++) {
  $page = $doc.GetPage($p - 1)
  $st = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  try {
    $opt = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $opt.DestinationWidth = $Width
    $opt.BackgroundColor = [Windows.UI.Color]::FromArgb(255, 255, 255, 255)
    AwaitA ($page.RenderToStreamAsync($st, $opt))
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($st)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  } finally { $st.Dispose(); $page.Dispose() }
  # перенос слова в конце строки: «перене-» + «сенные» -> «перенесенные»
  $txt = [regex]::Replace((($res.Lines | ForEach-Object { $_.Text }) -join "`n"), '(\p{L})[-­]\n(\p{Ll})', '$1$2')
  [void]$sb.AppendLine("`n===== стр. $p =====")
  [void]$sb.AppendLine($txt)
  Write-Host "стр. $p из $To"
}
[IO.File]::WriteAllText($Out, $sb.ToString(), (New-Object Text.UTF8Encoding $true))
