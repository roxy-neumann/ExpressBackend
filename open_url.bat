@echo off
set port=%1

timeout /t 5 /nobreak >nul
start /B "" "http://localhost:%port%/api-docs"