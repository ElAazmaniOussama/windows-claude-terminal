@echo off
reg delete "HKCU\Software\Classes\Directory\shell\ClaudeTerminal" /f 2>nul
reg delete "HKCU\Software\Classes\Directory\Background\shell\ClaudeTerminal" /f 2>nul
echo Context menu entries removed.
pause
