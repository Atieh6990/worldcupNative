param(
    [int]$Port = 8090,
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
    $Root = Join-Path (Split-Path -Parent $PSScriptRoot) "dist"
}

$Root = (Resolve-Path $Root).Path
$buildJs = Join-Path $Root "js\build.js"

if (-not (Test-Path $buildJs)) {
    Write-Error "Missing local bundle: $buildJs"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:${Port}/")
$listener.Start()

Write-Host "Serving $Root on http://127.0.0.1:${Port}/" -ForegroundColor Green
Write-Host "WebView bundle: http://127.0.0.1:${Port}/js/build.js" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

$mimeTypes = @{
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".map"  = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"  = "font/ttf"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relativePath = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart("/"))
        if (-not $relativePath) {
            $relativePath = "js/build.js"
        }

        $filePath = Join-Path $Root ($relativePath -replace "/", [IO.Path]::DirectorySeparatorChar)

        if (-not (Test-Path $filePath -PathType Leaf)) {
            $response.StatusCode = 404
            $body = [Text.Encoding]::UTF8.GetBytes("Not found: $relativePath")
            $response.OutputStream.Write($body, 0, $body.Length)
            $response.Close()
            Write-Host "404 $relativePath"
            continue
        }

        $bytes = [IO.File]::ReadAllBytes($filePath)
        $ext = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $contentType = $mimeTypes[$ext]
        if ($contentType) {
            $response.ContentType = $contentType
        }

        $response.StatusCode = 200
        $response.ContentLength64 = $bytes.Length
        if ($request.HttpMethod -ne 'HEAD') {
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $response.Close()
        Write-Host "$($response.StatusCode) $relativePath"
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
