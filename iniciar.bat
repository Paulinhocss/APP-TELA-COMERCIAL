@echo off
cd /d "%~dp0"
where npm.cmd >nul 2>nul || (echo Node/NPM nao encontrado.& pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias...
  call npm.cmd install || (pause & exit /b 1)
)
echo Iniciando React/Vite e API...
call npm.cmd run dev
