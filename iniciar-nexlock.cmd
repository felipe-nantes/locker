@echo off
setlocal EnableExtensions
title Nexlock - Inicializador

for %%I in ("%~dp0.") do set "NEXLOCK_DIR=%%~fI"
if not exist "%NEXLOCK_DIR%\package.json" (
  for %%I in ("%~dp0..\locker-main") do set "NEXLOCK_DIR=%%~fI"
)
set "NEXLOCK_PORT=3001"

if not exist "%NEXLOCK_DIR%\package.json" (
  echo.
  echo [ERRO] Projeto Nexlock nao encontrado em:
  echo %NEXLOCK_DIR%
  echo.
  pause
  exit /b 1
)

if exist "%NEXLOCK_DIR%\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^PORT=" "%NEXLOCK_DIR%\.env"`) do set "NEXLOCK_PORT=%%B"
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERRO] Node.js nao foi encontrado no PATH.
  echo Instale o Node.js e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

echo.
echo =============================================
echo  NEXLOCK - FRONTEND + BACKEND
echo =============================================
echo Projeto: %NEXLOCK_DIR%
echo Porta:   %NEXLOCK_PORT%
echo.

powershell.exe -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $response=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:%NEXLOCK_PORT%/api/state'; if ($response.StatusCode -eq 200) { exit 0 } }; exit 1" >nul 2>nul
if not errorlevel 1 (
  echo [OK] O Nexlock ja esta em execucao. Abrindo o dashboard...
  start "" "http://127.0.0.1:%NEXLOCK_PORT%/dashboard"
  exit /b 0
)

if not exist "%NEXLOCK_DIR%\node_modules" (
  echo [INFO] Instalando dependencias pela primeira vez...
  pushd "%NEXLOCK_DIR%"
  call npm install
  if errorlevel 1 (
    popd
    echo.
    echo [ERRO] A instalacao das dependencias falhou.
    pause
    exit /b 1
  )
  popd
)

echo [INFO] Iniciando servidor do frontend e backend...
start "Nexlock - Frontend e Backend" /D "%NEXLOCK_DIR%" cmd.exe /k "npm start"

echo [INFO] Aguardando o servidor ficar online...
powershell.exe -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $url='http://127.0.0.1:%NEXLOCK_PORT%/api/state'; $deadline=(Get-Date).AddSeconds(30); do { try { $response=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url; if ($response.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:%NEXLOCK_PORT%/dashboard'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"

if errorlevel 1 (
  echo.
  echo [ERRO] O servidor nao respondeu em 30 segundos.
  echo Confira os erros na janela "Nexlock - Frontend e Backend".
  echo.
  pause
  exit /b 1
)

echo [OK] Dashboard aberto no navegador.
exit /b 0
