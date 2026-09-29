@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo.
  echo ERRO: arquivo .env nao encontrado.
  echo Copie .env.example para .env e preencha os dados do SQL Server.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
start "" http://localhost:3010
npm start
pause
