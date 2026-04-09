@echo off
:: Adds "Open Claude Terminal here" to the right-click menu in Windows Explorer
:: Run as Administrator

set "APP=%~dp0node_modules\.bin\electron.cmd"
set "SCRIPT=%~dp0."
set "ICON=%~dp0assets\icon.ico"

:: Remove trailing backslash from SCRIPT
if "%SCRIPT:~-1%"=="\" set "SCRIPT=%SCRIPT:~0,-1%"

:: Right-click on a FOLDER
reg add "HKCU\Software\Classes\Directory\shell\ClaudeTerminal" /ve /d "Open Claude Terminal here" /f
reg add "HKCU\Software\Classes\Directory\shell\ClaudeTerminal" /v "Icon" /d "%ICON%" /f
reg add "HKCU\Software\Classes\Directory\shell\ClaudeTerminal\command" /ve /d "\"%APP%\" \"%SCRIPT%\" \"%%1\"" /f

:: Right-click on BACKGROUND inside a folder
reg add "HKCU\Software\Classes\Directory\Background\shell\ClaudeTerminal" /ve /d "Open Claude Terminal here" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\ClaudeTerminal" /v "Icon" /d "%ICON%" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\ClaudeTerminal\command" /ve /d "\"%APP%\" \"%SCRIPT%\" \"%%V\"" /f

echo.
echo Done! Right-click any folder in Explorer to use "Open Claude Terminal here".
echo (No restart required)
pause
