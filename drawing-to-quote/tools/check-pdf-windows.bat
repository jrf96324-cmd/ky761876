@echo off
rem ============================================================
rem  PDF open-setting check (READ ONLY - changes nothing)
rem  Writes report to pdf-check.txt next to this file,
rem  then opens Windows "Default apps" so you can pick a PDF reader.
rem ============================================================
setlocal
set "OUT=%~dp0pdf-check.txt"
echo PDF open-setting check  %DATE% %TIME% > "%OUT%"
echo. >> "%OUT%"
echo [1] assoc .pdf >> "%OUT%"
assoc .pdf >> "%OUT%" 2>&1
for /f "tokens=2 delims==" %%A in ('assoc .pdf 2^>nul') do (
  echo [2] ftype %%A >> "%OUT%"
  ftype %%A >> "%OUT%" 2>&1
)
echo. >> "%OUT%"
echo [3] User choice (Windows default app for .pdf) >> "%OUT%"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice" /v ProgId >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo [4] Open-with list >> "%OUT%"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\OpenWithList" >> "%OUT%" 2>&1
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\OpenWithProgids" >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo [5] Installed PDF readers >> "%OUT%"
for %%P in (
  "%ProgramFiles%\Adobe\Acrobat DC\Acrobat\Acrobat.exe"
  "%ProgramFiles(x86)%\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe"
  "%ProgramFiles%\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles%\Foxit Software\Foxit PDF Reader\FoxitPDFReader.exe"
  "%ProgramFiles(x86)%\Foxit Software\Foxit PDF Reader\FoxitPDFReader.exe"
) do if exist %%P (echo   FOUND   %%~P>> "%OUT%") else (echo   -       %%~P>> "%OUT%")
echo. >> "%OUT%"
echo Report saved: "%OUT%"
type "%OUT%"
echo.
echo Opening Windows Settings - Default apps. Search ".pdf" and choose Adobe Reader or Microsoft Edge.
start "" ms-settings:defaultapps
pause
