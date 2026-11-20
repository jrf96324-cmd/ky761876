@echo off
cd /d "%~dp0"
echo Starting Drawing-to-Quote offline...
where node >nul 2>nul && (start "" node "%~dp0tools\serve.js" & exit /b)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
