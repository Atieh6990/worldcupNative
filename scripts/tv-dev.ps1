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

function Setup-Reverse {
    adb -s $Device reverse tcp:8081 tcp:8081
    adb -s $Device reverse --list
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
        Setup-Reverse
        Run-App
    }
    "all" {
        Connect-Tv
        Setup-Reverse
        Setup-Inspect
        Run-App
    }
}
