param(
    [string]$Ip = "172.16.10.5",
    [ValidateSet("connect", "reverse", "inspect", "reload", "run", "all")]
    [string]$Action = "all"
)

$Device = "${Ip}:5555"
$Package = "com.worldcup"
$Activity = "com.worldcup/.MainActivity"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Connect-Tv {
    adb kill-server | Out-Null
    Start-Sleep -Seconds 1
    adb start-server | Out-Null
    adb connect $Device
    Start-Sleep -Seconds 2
    adb devices -l
}

function Setup-BuildReverse {
    adb -s $Device reverse tcp:8090 tcp:8090
    adb -s $Device reverse --list
}

function Start-BuildServer {
    $BuildJs = Join-Path $ProjectRoot "dist\js\build.js"
    if (-not (Test-Path $BuildJs)) {
        Write-Error "Missing local WebView bundle: $BuildJs"
    }

    $existing = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Build server already listening on port 8090" -ForegroundColor Green
        return
    }

    Write-Host "Starting local build server on port 8090..." -ForegroundColor Cyan
    Start-Process powershell -WindowStyle Minimized -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $PSScriptRoot "serve-build.ps1"),
        "-Port", "8090"
    )
    Start-Sleep -Seconds 2
    Write-Host "Local WebView bundle: http://127.0.0.1:8090/js/build.js" -ForegroundColor Green
}

function Setup-Reverse {
    adb -s $Device reverse tcp:8081 tcp:8081
    Setup-BuildReverse
}

function Setup-Inspect {
    adb -s $Device forward --remove tcp:9222 2>$null
    adb -s $Device forward tcp:9222 localabstract:chrome_devtools_remote
    adb -s $Device forward --list
    Write-Host ""
    Write-Host "Inspect WebView:" -ForegroundColor Cyan
    Write-Host "  chrome://inspect/#devices"
    Write-Host ""
    Write-Host "Metro / Reload:" -ForegroundColor Cyan
    Write-Host "  http://localhost:8081"
    Write-Host "  Press r in Metro terminal to reload"
}

function Reload-App {
    adb -s $Device shell am force-stop $Package
    adb -s $Device shell am start -n $Activity
    Write-Host "App restarted on $Device"
}

function Run-App {
    Push-Location $ProjectRoot
    $env:JAVA_HOME = "C:\Program Files\Java\jdk-11"
    $env:GRADLE_USER_HOME = Join-Path $ProjectRoot ".gradle-home"
    $env:ANDROID_SERIAL = $Device
    npx react-native run-android --deviceId=$Device
    Pop-Location
}

switch ($Action) {
    "connect" { Connect-Tv }
    "reverse" { Setup-Reverse }
    "inspect" { Setup-Inspect }
    "reload" {
        Setup-Reverse
        Reload-App
    }
    "run" {
        Connect-Tv
        Start-BuildServer
        Setup-Reverse
        Run-App
    }
    "all" {
        Connect-Tv
        Start-BuildServer
        Setup-Reverse
        Setup-Inspect
        Run-App
    }
}
