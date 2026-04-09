@echo off
cd /d "%~dp0"
:: Usage: start.bat [optional-folder-path]
:: e.g.   start.bat "C:\my\project"
node_modules\.bin\electron.cmd . %*
