@echo off
REM Double-click to run MIND//SHIFT offline from the dist folder (no internet, no Node.js needed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-offline.ps1"
