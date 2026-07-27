# Run from the frontend/ folder: .\build-release.ps1
# Builds a release APK pointed at production, and renames the output to
# PushpakWx.<version>.<buildnumber>.apk so testers (and you) can always
# tell builds apart at a glance. Android's own versionCode stays stuck at
# 1 for local builds (it only auto-increments through EAS's cloud
# servers), so this timestamp is the real, reliable build identifier,
# matching exactly what's shown in the app's own Settings screen.

$env:EXPO_PUBLIC_BACKEND_URL = "https://pushpakwx.onrender.com"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$buildNumber = Get-Date -Format "yyyyMMdd-HHmm"
$env:EXPO_PUBLIC_BUILD_NUMBER = $buildNumber

Write-Host "Building release APK - build number $buildNumber ..." -ForegroundColor Cyan
npx expo run:android --variant release

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed - skipping APK rename." -ForegroundColor Red
    exit 1
}

$sourceApk = "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $sourceApk)) {
    Write-Host "Expected APK not found at $sourceApk - rename skipped." -ForegroundColor Red
    exit 1
}

$version = (Get-Content app.json | ConvertFrom-Json).expo.version
$outputName = "PushpakWx.$version.$buildNumber.apk"
$outputPath = "android\app\build\outputs\apk\release\$outputName"
Copy-Item $sourceApk $outputPath -Force

Write-Host ""
Write-Host "Done. Ready to share:" -ForegroundColor Green
Write-Host "  $outputPath" -ForegroundColor Green
