# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
# Reads the text in images with Windows' own OCR (Windows.Media.Ocr), as ocr.swift does with macOS's Vision:
# ocr.ps1 <image>…, each image's lines top to bottom, the images in turn; with no images given, it reads lists of them
# from its input (see the end). tools/rheims/build.py keeps one running in each of its workers on Windows, with Windows
# PowerShell (powershell.exe; PowerShell 7 can't load Windows' runtime classes), and gives it a page's column a strip
# at a time.
$ErrorActionPreference = "Stop"
# UTF-8 out, whatever the console's code page (the output is piped to Python, not shown).
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding $false))
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

# Windows' runtime calls are asynchronous: each is awaited as a .NET task.
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait()
    $task.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-GB"))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US")) }
if (-not $engine) { throw "Windows has no English OCR: add English in Settings > Time & language > Language" }

function Read-Image($path) {
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $path).Path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        if ([Math]::Max($bitmap.PixelWidth, $bitmap.PixelHeight) -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) {
            [Console]::Error.WriteLine("too large to read: $path")
            return
        }
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        foreach ($line in $result.Lines) { $out.WriteLine($line.Text) }
    } finally {
        $stream.Dispose()
    }
}

if ($args.Count) {
    foreach ($path in $args) { Read-Image $path }
} else {
    # Kept running (each start takes about a second): each line in is the images to read, separated by tabs; their
    # text out is ended by a line holding only the record separator (U+001E).
    while ($null -ne ($line = [Console]::In.ReadLine())) {
        foreach ($path in $line.Split("`t")) { if ($path) { Read-Image $path } }
        $out.WriteLine([char]0x1E)
        $out.Flush()
    }
}
$out.Flush()
