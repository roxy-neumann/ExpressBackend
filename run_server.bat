@echo off

set projFolder=%1
if not defined projFolder (
    echo "::: Services root folder"
    echo "::: Folder where source code of the service located"
    set /p projFolder="[e.g. C:\Dev\Projects\MyProject\]=> "
)

set srvFolder=%2
if not defined srvFolder (
    echo "::: Service folder"
    echo "::: Please keep folder name the same as a repo name - it will avoid confusions and misunderstandings"
    echo "::: S3 bucket with this name will be created to store TF states"
    set /p srvFolder="[e.g. users-srv]=> "
)

set service_path=%projFolder%%srvFolder%

set port=%3
if not defined port (
    echo "::: Service port"
    echo "::: Use 'local' for local development deploy. Use real port name (main, master, dev...) of GH deploy if you want to check or destroy it"
    set /p port="[e.g. local]=> "
)

set env=%4
if not defined env (
    echo "::: Service env"
    echo "::: Use some name for local development deploy. Use real env name (mock, dev, sandbox...) of GH deploy if you want to check or destroy it"
    set /p env="[e.g. test-1]=> "
)

set nodemon=%5
set swagger=%6

echo ::: Initial Parameters :::::::::::::::::::::::::::::::::::
echo Service Folder: %service_path%
echo Port: %port%
echo Env: %env%
echo Nodemon: %nodemon%
echo Swagger re-generation: %swagger%

if not defined swagger (
    set "watch_option=-w %service_path%\swagger"
    set delay=5
) else (
    set "watch_option="
    set delay=10
)
echo Delay: %delay%

rem @start /B cmd /c "open_url.bat %port% %delay%"
if "%nodemon%"=="true" (
    nodemon -w %service_path%\src %watch_option% -x ts-node server.ts %service_path% %port% %env% %swagger%
) else (
    ts-node server.ts %service_path% %port% %env% %swagger%
)