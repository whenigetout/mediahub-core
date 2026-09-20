@echo off
setlocal EnableExtensions EnableDelayedExpansion
title MediaHub Launcher
cd /d "%~dp0"

rem ===================================================================
rem  MediaHub one-click launcher (Windows)
rem
rem  Starts the Fastify backend API (port 4000) and the Next.js
rem  frontend (port 3000), waits until both answer, then opens the app
rem  in your default browser.
rem
rem  Usage:  double-click this file
rem          start-mediahub.bat --dry-run    report only, change nothing
rem ===================================================================

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_PORT=4000"
set "FRONTEND_PORT=3000"
set "BACKEND_HEALTH=http://127.0.0.1:%BACKEND_PORT%/api/library/status"
set "FRONTEND_HEALTH=http://127.0.0.1:%FRONTEND_PORT%/"
set "APP_URL=http://localhost:%FRONTEND_PORT%"
set "WAIT_SECONDS=150"
set "DRY_RUN=0"

if /i "%~1"=="--dry-run" set "DRY_RUN=1"
if /i "%~1"=="--check"   set "DRY_RUN=1"
if /i "%~1"=="-n"        set "DRY_RUN=1"
if /i "%~1"=="--help"    goto :usage

echo ===================================================================
echo   MediaHub launcher
echo ===================================================================
echo.

if "%DRY_RUN%"=="1" (
    echo   Mode: dry run. Nothing will be installed or started.
    echo.
)

rem --- 1. prerequisites ---------------------------------------------
echo [1/5] Checking prerequisites...

where node >NUL 2>&1
if errorlevel 1 (
    echo   [X] Node.js was not found on PATH.
    echo       Install the LTS release from https://nodejs.org and run this file again.
    goto :fatal
)

set "NODE_MAJOR=0"
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node" 2^>NUL') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
    echo   [X] Node.js %NODE_MAJOR%.x is too old. Next.js 16 needs Node 20.9 or newer.
    echo       Install the current LTS release from https://nodejs.org and try again.
    goto :fatal
)

where npm.cmd >NUL 2>&1
if errorlevel 1 (
    echo   [X] npm was not found on PATH next to node.exe.
    echo       Reinstall Node.js with the default options and try again.
    goto :fatal
)

for /f "delims=" %%v in ('node -p "process.versions.node" 2^>NUL') do set "NODE_VERSION=%%v"
echo   [ok] Node.js %NODE_VERSION% and npm are ready
echo   [ok] Repository folder: %ROOT%

if defined PORT (
    if not "%PORT%"=="%BACKEND_PORT%" (
        echo   [!] A PORT environment variable is set to %PORT%.
        echo       The backend reads PORT, so it will not listen on %BACKEND_PORT%.
    )
    if "%PORT%"=="%BACKEND_PORT%" (
        echo   [ok] PORT is set to %PORT%
    )
)
echo.

rem --- 2. dependencies ----------------------------------------------
echo [2/5] Checking project dependencies...
call :ensure_deps "backend" "%BACKEND_DIR%"
if errorlevel 1 goto :fatal
call :ensure_deps "frontend" "%FRONTEND_DIR%"
if errorlevel 1 goto :fatal
echo.

rem --- 3. backend ---------------------------------------------------
echo [3/5] Backend API ^(Fastify, port %BACKEND_PORT%^)
call :url_ok "%BACKEND_HEALTH%"
if not errorlevel 1 (
    echo   [ok] Something is already answering on port %BACKEND_PORT%. Reusing it.
) else (
    if "%DRY_RUN%"=="1" (
        echo   [dry] would start: npm run dev  ^(inside %BACKEND_DIR%^)
    ) else (
        echo   [..] Starting the backend in a new minimized window...
        start "MediaHub Backend" /min /d "%BACKEND_DIR%" cmd /k npm run dev
        echo   [..] Waiting for the API to answer ^(up to %WAIT_SECONDS% seconds^)...
        call :wait_for_url "%BACKEND_HEALTH%" %WAIT_SECONDS%
        if errorlevel 1 (
            echo   [X] The backend never answered on %BACKEND_HEALTH%.
            echo       Open the "MediaHub Backend" window to read the error output
            echo       and check the Troubleshooting section of README.md.
            goto :fatal
        )
        echo   [ok] Backend is up
    )
)
echo.

rem --- 4. frontend --------------------------------------------------
echo [4/5] Web UI ^(Next.js, port %FRONTEND_PORT%^)
call :url_ok "%FRONTEND_HEALTH%"
if not errorlevel 1 (
    echo   [ok] Something is already answering on port %FRONTEND_PORT%. Reusing it.
) else (
    if "%DRY_RUN%"=="1" (
        echo   [dry] would start: npm run dev  ^(inside %FRONTEND_DIR%^)
    ) else (
        echo   [..] Starting the web UI in a new minimized window...
        start "MediaHub Frontend" /min /d "%FRONTEND_DIR%" cmd /k npm run dev
        echo   [..] Waiting for the UI to compile ^(first start takes a moment^)...
        call :wait_for_url "%FRONTEND_HEALTH%" %WAIT_SECONDS%
        if errorlevel 1 (
            echo   [X] The web UI never answered on %FRONTEND_HEALTH%.
            echo       Open the "MediaHub Frontend" window to read the error output
            echo       and check the Troubleshooting section of README.md.
            goto :fatal
        )
        echo   [ok] Web UI is up
    )
)
echo.

rem --- 5. open the app ----------------------------------------------
echo [5/5] Opening the app...
if "%DRY_RUN%"=="1" (
    echo   [dry] would open %APP_URL% in your default browser
) else (
    start "" "%APP_URL%"
    echo   [ok] Browser launched
)
echo.

echo ===================================================================
echo   MediaHub is running
echo ===================================================================
echo   App:            %APP_URL%
echo   API status:     http://localhost:%BACKEND_PORT%/api/library/status
echo.
echo   To stop MediaHub, close the two server windows named
echo   "MediaHub Backend" and "MediaHub Frontend".
echo.
echo   Optional: enable natural-language search by setting OLLAMA_SEARCH_MODEL
echo   in backend\.env. See README.md for details.
echo.
if "%DRY_RUN%"=="1" (
    echo   Dry run finished. Run this file without arguments to start the app.
) else (
    echo   Next step: paste your media folders into "Library Roots" and press
    echo   "Scan Library".
)
echo.
pause
exit /b 0


rem ===================================================================
rem  Subroutines
rem ===================================================================

:usage
echo Usage: start-mediahub.bat [--dry-run]
echo.
echo   --dry-run   Check prerequisites and ports without installing or starting anything.
echo.
echo   Double-click this file (or run it with no arguments) to start MediaHub.
exit /b 0

:fatal
echo.
echo Launcher stopped. Fix the problem above, then run this file again.
echo.
pause
exit /b 1

rem --- install dependencies for one project -------------------------
:ensure_deps
setlocal EnableExtensions EnableDelayedExpansion
set "DEP_NAME=%~1"
set "DEP_DIR=%~2"

if exist "%DEP_DIR%\node_modules" (
    echo   [ok] %DEP_NAME% dependencies are already installed
    endlocal & exit /b 0
)

if "%DRY_RUN%"=="1" (
    echo   [dry] %DEP_NAME%\node_modules is missing, would run "npm install"
    endlocal & exit /b 0
)

echo   [..] Installing %DEP_NAME% dependencies. First run only, this can take a few minutes...
pushd "%DEP_DIR%"
call npm install --no-audit --no-fund
set "DEP_EXIT=!ERRORLEVEL!"
popd

if not "!DEP_EXIT!"=="0" (
    echo   [X] "npm install" failed for %DEP_NAME%.
    echo       Scroll up for the npm error output. If it mentions better-sqlite3,
    echo       node-gyp or a C++ compiler, see Troubleshooting in README.md.
    endlocal & exit /b 1
)

echo   [ok] %DEP_NAME% dependencies installed
endlocal & exit /b 0

rem --- is a URL answering? exit code 0 = yes -------------------------
:url_ok
where curl.exe >NUL 2>&1
if not errorlevel 1 (
    curl.exe -s -f -o NUL --max-time 4 "%~1"
    if not errorlevel 1 exit /b 0
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri '%~1'; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
if errorlevel 1 exit /b 1
exit /b 0

rem --- poll a URL until it answers ----------------------------------
:wait_for_url
setlocal EnableExtensions EnableDelayedExpansion
set "WAIT_URL=%~1"
set "WAIT_LIMIT=%~2"
set /a WAIT_TRIES=0

:wait_for_url_loop
call :url_ok "%WAIT_URL%"
if not errorlevel 1 (
    endlocal & exit /b 0
)

set /a WAIT_TRIES+=1
if !WAIT_TRIES! GEQ %WAIT_LIMIT% (
    endlocal & exit /b 1
)

>NUL ping -n 2 127.0.0.1
goto :wait_for_url_loop
