@echo off
rem Local widget preview: double-click this file. Close the window to stop.
cd /d "%~dp0"
start "" http://localhost:5173/dev/
node dev\server.mjs
pause
