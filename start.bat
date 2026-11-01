@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 scripts\start_local.py %*
) else (
  python scripts\start_local.py %*
)
if errorlevel 1 (
  echo.
  echo Startup failed. Install Python 3.12+ and check the error above.
  pause
)
