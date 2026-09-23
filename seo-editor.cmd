@echo off
rem SEO pages editor: double-click this file. Close the window to stop.
rem If the dev server is already running (start-dev.cmd), this only opens the editor.
cd /d "%~dp0"
start "" http://localhost:5173/dev/seo.html
node dev\server.mjs
pause
