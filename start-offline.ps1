# MIND//SHIFT offline launcher: serves ./dist on http://localhost:4173 with no internet and no Node.js.
# Usage: double-click start-offline.bat (or: powershell -File start-offline.ps1 -Port 4173)
param([int]$Port = 4173)

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host "dist\index.html not found. Run 'npm run build' first (or copy the dist folder next to this script)."
  Read-Host 'Press Enter to close'
  exit 1
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.wasm' = 'application/wasm'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.ktx2' = 'image/ktx2'
  '.hdr' = 'application/octet-stream'; '.bin' = 'application/octet-stream'
  '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.opus' = 'audio/ogg'; '.wav' = 'audio/wav'
  '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Could not start on port $Port (already in use?). Try: start-offline.ps1 -Port 4174"
  Read-Host 'Press Enter to close'
  exit 1
}

$url = "http://localhost:$Port/"
Write-Host "MIND//SHIFT is running offline at $url"
Write-Host 'Keep this window open during the presentation. Close it to stop the server.'
Start-Process $url

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) {
        $res.StatusCode = 404
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
