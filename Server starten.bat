@echo off
title Lodge-Server
cd /d "%~dp0server"
if not exist node_modules (
  echo Installiere Server-Pakete ...
  call npm install
)
call npm start
pause
