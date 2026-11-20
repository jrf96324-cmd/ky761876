# Drawing-to-Quote offline launcher (Windows PowerShell 5+, no install needed)
# Serves this folder on http://localhost:PORT/ and opens the default browser.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json';
  '.wasm'='application/wasm'; '.gz'='application/gzip'; '.bcmap'='application/octet-stream'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.pdf'='application/pdf'; '.dxf'='text/plain; charset=utf-8'; '.csv'='text/csv; charset=utf-8'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8' }
$listener = $null; $port = 8765
foreach ($p in 8765..8785) {
  try { $l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$p/"); $l.Start(); $listener = $l; $port = $p; break } catch { }
}
if (-not $listener) { Write-Host 'Cannot open a local port (8765-8785).'; Read-Host 'Press Enter to exit'; exit 1 }
$url = "http://localhost:$port/index.html"
Write-Host "Drawing-to-Quote is running: $url"
Write-Host 'Keep this window open while using the app. Close it to stop.'
Start-Process $url
while ($listener.IsListening) {
  $ctx = $listener.GetContext(); $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
      $res.StatusCode = 404; $b = [System.Text.Encoding]::UTF8.GetBytes('Not found'); $res.OutputStream.Write($b, 0, $b.Length)
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($full); $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch { $res.StatusCode = 500 } finally { $res.OutputStream.Close() }
}
