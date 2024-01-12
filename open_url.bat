@echo off
set port=%1
set delay=%2
if not defined delay (
    set delay=5
)

timeout /t %delay% /nobreak >nul
start /B "" "http://localhost:%port%/api-docs"