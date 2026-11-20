#!/usr/bin/env pwsh
<#
Shared helpers for frontend instrumented test runners (E2E + NFR).
Dot-source after setting $Root and $FrontendDir.

Expected layout:
  frontend\app\src\androidTest\...\{e2e,nfr}\
  frontend\app\build.gradle[.kts]
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Root)        { throw 'ROOT must be set' }
if (-not $FrontendDir) { throw 'FRONTEND_DIR must be set' }

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Blue }
function Warn($msg) { Write-Host "WARN: $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

function Configure-AndroidHome {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        # already set, use it
    }
    else {
        $localProperties = Join-Path $FrontendDir 'local.properties'
        $sdkLine = $null
        if (Test-Path $localProperties) {
            $sdkLine = Get-Content $localProperties | Where-Object { $_ -match '^\s*sdk\.dir\s*=' } | Select-Object -First 1
        }
        $sdkDir = $null
        if ($sdkLine) {
            $sdkDir = ($sdkLine -replace '^\s*sdk\.dir\s*=\s*', '').Trim(' ', '"')
            $sdkDir = $sdkDir -replace '\\:', ':'
            $sdkDir = $sdkDir -replace '\\\\', '\'
        }
        if ($sdkDir -and (Test-Path $sdkDir)) {
            $env:ANDROID_HOME = $sdkDir
        }
    }
    if ($env:ANDROID_HOME) {
        $env:Path = "$($env:ANDROID_HOME)\platform-tools;$($env:Path)"
    }
}

function Pick-GradleBuildFile($dir) {
    $kts = Join-Path $dir 'build.gradle.kts'
    $groovy = Join-Path $dir 'build.gradle'
    if (Test-Path $kts) { return $kts }
    if (Test-Path $groovy) { return $groovy }
    Die "Cannot find build.gradle.kts or build.gradle in $dir."
}

function Resolve-TestRoot {
    $script:TestRoot = Join-Path $FrontendDir 'app\src\androidTest'
    if (-not (Test-Path $script:TestRoot)) { Die "Cannot find $($script:TestRoot)." }
    $script:GradleTask = ':app:connectedDebugAndroidTest'
    $script:AppBuild = Pick-GradleBuildFile (Join-Path $FrontendDir 'app')
}

function Get-ApplicationId {
    $line = Get-Content $script:AppBuild | Where-Object { $_ -match '\sapplicationId\s*=' } | Select-Object -First 1
    if ($line -and ($line -match '=\s*["'']([^"'']+)["'']')) {
        return $Matches[1]
    }
    return $null
}

function Get-KotlinTestClass($file) {
    $package = $null
    $className = $null
    foreach ($line in Get-Content $file) {
        if (-not $package -and $line -match '^\s*package\s+(\S+)') {
            $package = $Matches[1]
        }
        if (-not $className -and $line -match '^\s*(class|object)\s+([A-Za-z0-9_]+)') {
            $className = $Matches[2]
        }
    }
    if (-not $package -or -not $className) { Die "Could not resolve test class from $file" }
    return "$package.$className"
}

function Discover-TestFiles($subdir) {
    $script:TestFiles = @(
        Get-ChildItem -Path $script:TestRoot -Recurse -File -Filter '*.kt' -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match "[\\/]$([regex]::Escape($subdir))[\\/]" } |
            Sort-Object FullName |
            ForEach-Object { $_.FullName }
    )
}

function Ensure-Backend {
    $startScript = Join-Path $Root 'scripts\run-backend.ps1'
    if (-not (Test-Path $startScript)) {
        Info "No scripts\run-backend.ps1; skipping backend startup."
        return
    }
    Info "Starting backend (scripts\run-backend.ps1) ..."
    & $startScript
    if ($LASTEXITCODE -ne 0) { Die "Backend startup failed." }
}

function Wait-ForAppSignIn {
    Warn "Sign in inside the app on the emulator (not just emulator Settings > Accounts)."
    Warn "  If you see a sign-in button in the app, tap it and pick your Google account."
    Warn "  When the main app screen is visible, press Enter here to run tests ..."
    [void](Read-Host)
}

function Run-InstrumentedTests($suite) {
    $subdir = $null
    $label = $null
    switch ($suite) {
        'e2e' { $subdir = 'e2e'; $label = 'E2E' }
        'nfr' { $subdir = 'nfr'; $label = 'NFR' }
        default { Die "Unknown suite '$suite' (expected e2e or nfr)." }
    }

    Resolve-TestRoot
    Discover-TestFiles $subdir

    if ($script:TestFiles.Count -eq 0) {
        Warn "Skipping frontend ${label} tests: no *.kt files in app\src\androidTest\...\${subdir}\."
        exit 0
    }

    $appId = Get-ApplicationId
    if (-not $appId) { Die "Could not resolve applicationId from $($script:AppBuild)." }

    Ensure-Backend
    $frontendScript = Join-Path $Root 'scripts\run-frontend.ps1'
    & $frontendScript
    if ($LASTEXITCODE -ne 0) { Die "Frontend startup failed." }

    Configure-AndroidHome
    $adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
    if (-not (Test-Path $adb)) {
        $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
        if ($adbCmd) { $adb = $adbCmd.Source }
        else { Die "adb not found." }
    }

    Wait-ForAppSignIn
    & $adb shell am force-stop $appId 2>$null | Out-Null

    $classes = @()
    foreach ($file in $script:TestFiles) {
        $classes += Get-KotlinTestClass $file
    }
    $classArg = $classes -join ','

    # The room test needs a second tester (User B); it is skipped unless their email is given.
    $extraArgs = @()
    if ($env:ROOM_FRIEND_EMAIL) {
        $extraArgs += "-Pandroid.testInstrumentationRunnerArguments.friendEmail=$env:ROOM_FRIEND_EMAIL"
    }

    Info "Running frontend ${label} tests (${classArg}) ..."
    Push-Location $FrontendDir
    try {
        & .\gradlew.bat $script:GradleTask "-Pandroid.testInstrumentationRunnerArguments.class=$classArg" @extraArgs
        if ($LASTEXITCODE -ne 0) { Die "Frontend ${label} tests failed." }
    }
    finally {
        Pop-Location
    }
    Info "Frontend ${label} tests finished."
}
